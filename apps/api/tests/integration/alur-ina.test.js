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
  const orang = {};
  let tindakanTim; let tindakanLain; let tindakanAtasan;

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
    const buatOrang = (kunci, peran, atasanId = null) => tambahPengguna(db, t.id, {
      nama: `Contoh ${kunci}`, email: `${kunci}-${akhiran}@alur-ina.test`, employeeId: `E-${kunci}`, peran, atasanId,
    });
    orang.hr = await buatOrang('hr', 'hr_admin');
    orang.atasanA = await buatOrang('atasan-a', 'supervisor');
    orang.atasanB = await buatOrang('atasan-b', 'supervisor');
    orang.timA = await buatOrang('tim-a', 'learner', orang.atasanA.id);
    orang.timB = await buatOrang('tim-b', 'learner', orang.atasanB.id);
    tindakanTim = await a.ina.buatTindakan(orang.hr, { title: 'Perbarui SOP eskalasi tiket', category: 'sop', ownerUserId: orang.timA.id });
    tindakanLain = await a.ina.buatTindakan(orang.hr, { title: 'Ganti alat monitoring', category: 'alat', ownerUserId: orang.timB.id });
    tindakanAtasan = await a.ina.buatTindakan(orang.hr, { title: 'Jadwalkan briefing shift', category: 'sop', ownerUserId: orang.atasanA.id });
    // tindakan tanpa pemilik hanya terlihat oleh HR (spek B9 4.2)
    await a.ina.buatTindakan(orang.hr, { title: 'Tinjau beban antrean', category: 'sistem' });
  });

  afterAll(async () => {
    await hapusTenant(db, tenantIds);
    await db.close();
  });

  it('HR memberi akses → atasan melihat tindakan timnya saja → HR mencabut → atasan ditolak', async () => {
    const sebelum = await a.ina.daftarTindakan(orang.atasanA);
    expect([sebelum.status, kodeGalat(sebelum)]).toEqual([403, 'NO_INA_ACCESS']);

    expect(await a.ina.beriAkses(orang.hr, orang.atasanA)).toMatchObject({ granted: true, changed: true });
    const lihat = await a.ina.daftarTindakan(orang.atasanA);
    expect(lihat.status).toBe(200);
    // dirinya dan bawahan langsung; bukan tim atasan lain, bukan tindakan tanpa pemilik
    expect(judul(lihat)).toEqual([tindakanAtasan.title, tindakanTim.title].sort());
    expect(lihat.body.meta.level).toBe('read');
    // izin satu atasan tidak membuka atasan lain
    expect(kodeGalat(await a.ina.daftarTindakan(orang.atasanB))).toBe('NO_INA_ACCESS');
    // HR tetap melihat semua
    expect(judul(await a.ina.daftarTindakan(orang.hr))).toEqual([tindakanAtasan.title, tindakanLain.title, tindakanTim.title, 'Tinjau beban antrean'].sort());

    expect(await a.ina.cabutAkses(orang.hr, orang.atasanA)).toMatchObject({ granted: false, changed: true });
    const sesudah = await a.ina.daftarTindakan(orang.atasanA);
    expect([sesudah.status, kodeGalat(sesudah)]).toEqual([403, 'NO_INA_ACCESS']);
  });

  it('Admin Tenant mengganti peran atasan → akses perbaikannya ikut dicabut dan tidak kembali sendiri', async () => {
    await a.ina.beriAkses(orang.hr, orang.atasanA);
    expect((await a.ina.daftarTindakan(orang.atasanA)).status).toBe(200);

    // hr_admin berlaku sebagai Admin Tenant sampai B2 menambah peran tenant_admin (spek B11 4.2)
    expect((await a.adminTenant.ubahPengguna(orang.hr, orang.atasanA, { role: 'learner' })).status).toBe(200);
    expect((await a.adminTenant.ubahPengguna(orang.hr, orang.atasanA, { role: 'supervisor' })).status).toBe(200);
    const res = await a.ina.daftarTindakan(orang.atasanA);
    expect([res.status, kodeGalat(res)]).toEqual([403, 'NO_INA_ACCESS']);
    // panel akses HR juga menampilkannya tanpa izin
    const akses = (await a.ina.daftarAkses(orang.hr)).body.data.find((x) => x.supervisorId === orang.atasanA.id);
    expect(akses).toMatchObject({ granted: false });
  });
});
