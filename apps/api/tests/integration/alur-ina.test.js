'use strict';
// B18 test alur (spek 3.3 baris "Akses atasan ke perbaikan", B9 + B11): HR memberi akses ke satu atasan →
// atasan melihat tindakan Improvement Needs timnya saja → HR mencabut → atasan ditolak (K1). Ditambah: Admin
// Tenant mengganti peran atasan → izinnya ikut dicabut dan tidak kembali saat ia dijadikan atasan lagi.
const crypto = require('crypto');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { createStubProvider } = require('../../src/ai/stub-provider');
const { FLAGS } = require('../../src/core/flags');
const { makeConfig } = require('../helpers');
const { siapkanTenant, tambahPengguna, pembuatMasuk, hapusTenant, langkah, kodeGalat } = require('../alur/driver');

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('Alur akses atasan ke perbaikan (B9, B11)', () => {
  let db; let a; const tenantIds = [];
  const akhiran = crypto.randomBytes(3).toString('hex');
  const p = {};
  let tindakanTim; let tindakanLain;

  const judul = (res) => res.body.data.map((x) => x.title).sort();

  beforeAll(async () => {
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    const config = makeConfig();
    a = langkah(createApp({ config, stores: createStores(db), ai: createStubProvider() }), pembuatMasuk(config));
    const t = await siapkanTenant(db, {
      slug: `alur-ina-${akhiran}`,
      flags: [FLAGS.MODULE_DNA, FLAGS.MODULE_TNA, FLAGS.MODULE_INA, FLAGS.INA_DASHBOARD, FLAGS.TENANT_ADMIN],
    });
    tenantIds.push(t.id);
    const orang = (kunci, peran, atasanId = null) => tambahPengguna(db, t.id, {
      nama: `Contoh ${kunci}`, email: `${kunci}-${akhiran}@alur-ina.test`, employeeId: `E-${kunci}`, peran, atasanId,
    });
    p.hr = await orang('hr', 'hr_admin');
    p.atasanA = await orang('atasan-a', 'supervisor');
    p.atasanB = await orang('atasan-b', 'supervisor');
    p.timA = await orang('tim-a', 'learner', p.atasanA.id);
    p.timB = await orang('tim-b', 'learner', p.atasanB.id);
    tindakanTim = await a.ina.buatTindakan(p.hr, { title: 'Perbarui SOP eskalasi tiket', category: 'sop', ownerUserId: p.timA.id });
    tindakanLain = await a.ina.buatTindakan(p.hr, { title: 'Ganti alat monitoring', category: 'alat', ownerUserId: p.timB.id });
  });

  afterAll(async () => {
    await hapusTenant(db, tenantIds);
    await db.close();
  });

  it('HR memberi akses → atasan melihat tindakan timnya saja → HR mencabut → atasan ditolak', async () => {
    const sebelum = await a.ina.daftarTindakan(p.atasanA);
    expect([sebelum.status, kodeGalat(sebelum)]).toEqual([403, 'NO_INA_ACCESS']);

    expect(await a.ina.beriAkses(p.hr, p.atasanA)).toMatchObject({ granted: true, changed: true });
    const lihat = await a.ina.daftarTindakan(p.atasanA);
    expect(lihat.status).toBe(200);
    expect(judul(lihat)).toEqual([tindakanTim.title]);
    expect(lihat.body.meta.level).toBe('read');
    // izin satu atasan tidak membuka atasan lain
    expect(kodeGalat(await a.ina.daftarTindakan(p.atasanB))).toBe('NO_INA_ACCESS');
    // HR tetap melihat semua
    expect(judul(await a.ina.daftarTindakan(p.hr))).toEqual([tindakanLain.title, tindakanTim.title].sort());

    expect(await a.ina.cabutAkses(p.hr, p.atasanA)).toMatchObject({ granted: false, changed: true });
    const sesudah = await a.ina.daftarTindakan(p.atasanA);
    expect([sesudah.status, kodeGalat(sesudah)]).toEqual([403, 'NO_INA_ACCESS']);
  });

  it('Admin Tenant mengganti peran atasan → akses perbaikannya ikut dicabut dan tidak kembali sendiri', async () => {
    await a.ina.beriAkses(p.hr, p.atasanA);
    expect((await a.ina.daftarTindakan(p.atasanA)).status).toBe(200);

    expect((await a.adminTenant.ubahPengguna(p.hr, p.atasanA, { role: 'learner' })).status).toBe(200);
    expect((await a.adminTenant.ubahPengguna(p.hr, p.atasanA, { role: 'supervisor' })).status).toBe(200);
    const res = await a.ina.daftarTindakan(p.atasanA);
    expect([res.status, kodeGalat(res)]).toEqual([403, 'NO_INA_ACCESS']);
  });
});
