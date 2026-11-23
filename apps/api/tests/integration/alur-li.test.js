'use strict';
// B18 test alur (spek 3.3 baris "Gap TNA ke intervensi", B13 + B5): gap TNA yang lahir dari wawancara dan disetujui HR
// menjadi prioritas Pareto di library modul KSA, lalu HR meminta modul ke vendor sampai terpasang di katalog.
// Lewat API sungguhan, Postgres, dan penyedia stub, memakai tests/alur/driver.js.
const crypto = require('crypto');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { createStubProvider } = require('../../src/ai/stub-provider');
const { makeConfig } = require('../helpers');
const { FLAGS } = require('../../src/core/flags');
const { siapkanTenant, selamaMati, tambahPengguna, pembuatMasuk, hapusTenant, langkah, kodeGalat } = require('../alur/driver');
const { JABATAN, KOMPETENSI, PERIODE } = require('../alur/data');

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('Alur gap TNA ke intervensi (B5 → B13)', () => {
  let db; let a; let tenant; const tenantIds = [];
  const orang = {};
  let projectId; let course;
  const slug = `alur-li-${crypto.randomBytes(3).toString('hex')}`;
  const KOMPETENSI_GAP = KOMPETENSI[0].name; // "Menangani eskalasi tiket"
  const BARIS_MODUL = [
    `ESK-B1,Menangani Eskalasi Tiket,basic,Technical Competencies,Eskalasi tepat waktu,${JABATAN.name},${KOMPETENSI_GAP},K,Alur eskalasi L1 ke L2`,
    'ESK-B1,,,,,,,S,Menulis catatan eskalasi',
    `KOM-B1,Komunikasi Pelanggan,basic,Non-Technical,,${JABATAN.name},,A,Empati pada pelanggan`,
  ];

  beforeAll(async () => {
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    const config = makeConfig();
    a = langkah(createApp({ config, stores: createStores(db), ai: createStubProvider() }), pembuatMasuk(config));
    tenant = await siapkanTenant(db, { slug, flags: [FLAGS.MODULE_DNA, FLAGS.MODULE_TNA, FLAGS.MODULE_LI] });
    tenantIds.push(tenant.id);
    orang.hr = await tambahPengguna(db, tenant.id, { nama: 'HR Contoh', email: `hr@${slug}.test`, employeeId: 'E-HR', peran: 'hr_admin' });
    orang.atasan = await tambahPengguna(db, tenant.id, { nama: 'Atasan Contoh', email: `atasan@${slug}.test`, employeeId: 'E-SPV', peran: 'supervisor' });
    orang.karyawan = await tambahPengguna(db, tenant.id, {
      nama: 'Rina Contoh', email: `rina@${slug}.test`, employeeId: 'E-UJI-01', peran: 'learner', atasanId: orang.atasan.id,
    });
    const role = await a.dna.buatJabatan(orang.hr, JABATAN, KOMPETENSI);
    await a.dna.tempatkan(orang.hr, orang.karyawan, role);
    projectId = await a.buatProyek(orang.hr, 'Alur LI');
    await a.tna.imporKinerja(orang.hr, {
      period: PERIODE, projectId, rows: [{ employeeId: orang.karyawan.employeeId, metricType: 'kpi', name: 'First Contact Resolution (%)', target: 80, actual: 62 }],
    });
    // Katalog course Moodle lewat impor PK-18 (aktif secara bawaan).
    course = (await a.li.imporCourse(orang.hr, ['C-ESK,Eskalasi Tiket L1'])).find((c) => c.externalRef === 'C-ESK');
  });

  afterAll(async () => {
    await hapusTenant(db, tenantIds);
    await db.close();
  });

  it('HR mengimpor library modul KSA', async () => {
    const hasil = await a.li.imporModul(orang.hr, BARIS_MODUL);
    expect(hasil).toMatchObject({ modules: 2, created: 2, rejectedCount: 0 });
    const pustaka = await a.li.pustaka(orang.hr);
    expect(pustaka.data.map((m) => m.code).sort()).toEqual(['ESK-B1', 'KOM-B1']);
    expect(pustaka.pareto).toMatchObject({ available: true, count: 0 });
  });

  it('gap dari wawancara TNA belum masuk Pareto sebelum HR meninjaunya', async () => {
    const sesi = (await a.tna.jadwalkanWawancara(orang.hr, projectId, PERIODE)).find((s) => s.intervieweeId === orang.karyawan.id);
    const w = await a.tna.jalankanWawancara(orang.karyawan, sesi.id, () => `Saya kesulitan ${KOMPETENSI_GAP.toLowerCase()} ke L2.`);
    expect(w.gagal).toBeNull();
    expect((await a.tna.selesai(orang.karyawan, sesi.id)).status).toBe(202);
    await a.tungguAnalisis();
    const antrean = await a.tna.antreanReview(orang.hr, projectId);
    expect(antrean.some((f) => f.category === 'training')).toBe(true);
    expect((await a.li.pustaka(orang.hr, 'priority=pareto')).data).toEqual([]);
  });

  it('setelah HR menyetujui temuan, modul untuk kompetensi itu jadi prioritas Pareto tanpa membuka judul temuan', async () => {
    const antrean = await a.tna.antreanReview(orang.hr, projectId);
    for (const f of antrean) await a.tna.reviewTemuan(orang.hr, f.id);
    const pareto = await a.li.pustaka(orang.hr, 'priority=pareto');
    expect(pareto.data.map((m) => m.code)).toEqual(['ESK-B1']);
    expect(pareto.data[0].priority).toMatchObject({ rank: 1, label: KOMPETENSI_GAP });
    const isi = JSON.stringify(pareto);
    for (const f of antrean) expect(isi).not.toContain(f.title);
  });

  it('HR meminta modul ke vendor; alur maju sampai terpasang dengan course aktif dan modul tersedia', async () => {
    const modul = (await a.li.pustaka(orang.hr, 'priority=pareto')).data[0];
    const permintaan = await a.li.minta(orang.hr, modul.id);
    expect(permintaan).toMatchObject({ status: 'requested', moduleCode: 'ESK-B1' });
    await a.li.majukan(orang.hr, permintaan.id, { status: 'confirmed' });
    await a.li.majukan(orang.hr, permintaan.id, { status: 'delivered' });
    const terpasang = await a.li.majukan(orang.hr, permintaan.id, { status: 'installed', catalogItemId: course.id });
    expect(terpasang.installedAt).toBeTruthy();
    const sesudah = (await a.li.pustaka(orang.hr)).data.find((m) => m.code === 'ESK-B1');
    expect(sesudah).toMatchObject({ status: { key: 'available', via: 'catalog' }, catalogItemId: course.id });
  });

  it('atasan dan karyawan ditolak 403', async () => {
    for (const siapa of [orang.atasan, orang.karyawan]) {
      const r = await a.mentah('get', '/api/li/modules?priority=pareto', siapa);
      expect([r.status, kodeGalat(r)]).toEqual([403, 'ROLE_FORBIDDEN']);
    }
  });

  it('module.li mati → FEATURE_DISABLED; tanpa full_suite → NOT_ENTITLED', async () => {
    const mati = await selamaMati(db, tenant.id, { flag: FLAGS.MODULE_LI }, () => a.mentah('get', '/api/li/modules', orang.hr));
    expect([mati.status, kodeGalat(mati)]).toEqual([403, 'FEATURE_DISABLED']);
    const tanpa = await selamaMati(db, tenant.id, { produk: 'full_suite' }, () => a.mentah('get', '/api/li/modules', orang.hr));
    expect([tanpa.status, kodeGalat(tanpa)]).toEqual([403, 'NOT_ENTITLED']);
    expect((await a.mentah('get', '/api/li/modules', orang.hr)).status).toBe(200); // dipulihkan
  });
});
