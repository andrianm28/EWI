'use strict';
// B18 test alur lintas peran (spek 3.3 baris "TNA ujung ke ujung", kerangka gelombang 1). Lewat API sungguhan,
// Postgres, dan penyedia stub, memakai tests/alur/driver.js. Thread paket menambah langkahnya (B5, B6, B7, B8) di sini
// atau di berkas alur-<paket>.test.js. Jalan hanya bila DATABASE_URL di-set dan migrasi sudah dijalankan.
const crypto = require('crypto');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { createStubProvider } = require('../../src/ai/stub-provider');
const { makeConfig } = require('../helpers');
const { siapkanTenant, tambahPengguna, pembuatMasuk, hapusTenant, langkah, siapkanTenantKenari } = require('../alur/driver');
const { JABATAN, KOMPETENSI, KARYAWAN_LAIN, TENANT_LAIN, PERIODE } = require('../alur/data');

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('Alur TNA ujung ke ujung (HR, atasan, karyawan)', () => {
  let db; let a; const tenantIds = [];
  const orang = {};
  let projectId; let sesi; let proyekLain;
  const slug = `alur-tna-${crypto.randomBytes(3).toString('hex')}`;

  beforeAll(async () => {
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    const config = makeConfig();
    let st;
    a = langkah(createApp({ config, stores: (st = createStores(db)), ai: createStubProvider() }), pembuatMasuk(config, st.authSessions));

    const t = await siapkanTenant(db, { slug });
    tenantIds.push(t.id);
    orang.hr = await tambahPengguna(db, t.id, { nama: 'HR Contoh', email: `hr@${slug}.test`, employeeId: 'E-HR', peran: 'hr_admin' });
    orang.atasan = await tambahPengguna(db, t.id, { nama: 'Atasan Contoh', email: `atasan@${slug}.test`, employeeId: 'E-SPV', peran: 'supervisor' });
    orang.karyawan = await tambahPengguna(db, t.id, {
      nama: 'Rina Contoh', email: `rina@${slug}.test`, employeeId: 'E-UJI-01', peran: 'learner', atasanId: orang.atasan.id,
    });
    orang.lain = await tambahPengguna(db, t.id, { nama: KARYAWAN_LAIN.nama, email: KARYAWAN_LAIN.email, employeeId: KARYAWAN_LAIN.employeeId, peran: 'learner' });

    const role = await a.dna.buatJabatan(orang.hr, JABATAN, KOMPETENSI);
    await a.dna.tempatkan(orang.hr, orang.karyawan, role);
    await a.dna.tempatkan(orang.hr, orang.lain, role);
    projectId = await a.buatProyek(orang.hr, 'Alur TNA');
    await a.tna.imporKinerja(orang.hr, {
      period: PERIODE,
      projectId,
      rows: [
        { employeeId: orang.karyawan.employeeId, metricType: 'kpi', name: 'First Contact Resolution (%)', target: 80, actual: 62 },
        { employeeId: orang.lain.employeeId, metricType: 'kpi', ...KARYAWAN_LAIN.kpi },
      ],
    });

    // Tenant lain dengan data kenari: tidak boleh terlihat sama sekali dari tenant di atas.
    const lain = await siapkanTenantKenari(db, a, slug);
    tenantIds.push(lain.id);
    proyekLain = lain.projectId;
  });

  afterAll(async () => {
    await hapusTenant(db, tenantIds);
    await db.close();
  });

  it('HR menjadwalkan wawancara; karyawan setuju, menjawab, dan menyelesaikan; analisis berjalan sebagai job', async () => {
    const sessions = await a.tna.jadwalkanWawancara(orang.hr, projectId, PERIODE);
    sesi = sessions.find((s) => s.intervieweeId === orang.karyawan.id);
    expect(sesi).toBeTruthy();
    const jawaban = ['Saya belum paham alur eskalasi ke L2.', 'Materi produk baru belum pernah saya pelajari.'];
    const w = await a.tna.jalankanWawancara(orang.karyawan, sesi.id, (i) => jawaban[i] || 'Itu saja.');
    expect(w.gagal).toBeNull();
    expect(w.pertanyaan[0]).toMatch(/First Contact Resolution/);
    expect((await a.tna.selesai(orang.karyawan, sesi.id)).status).toBe(202);
    await a.tungguAnalisis();
    expect(await a.tna.analisis(orang.hr, sesi.id)).toMatchObject({ status: 'done' });
  });

  it('transkrip hanya untuk karyawan yang diwawancarai; HR dan atasan ditolak (PO-6)', async () => {
    expect((await a.tna.transkrip(orang.karyawan, sesi.id)).status).toBe(200);
    for (const siapa of [orang.hr, orang.atasan]) {
      const r = await a.tna.transkrip(siapa, sesi.id);
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe('TRANSCRIPT_PRIVATE');
    }
  });

  it('antrean review HR hanya berisi temuan karyawan yang diwawancarai, tanpa data karyawan atau tenant lain', async () => {
    const antrean = await a.tna.antreanReview(orang.hr, projectId);
    expect(antrean.length).toBeGreaterThan(0);
    expect(antrean.every((f) => f.userId === orang.karyawan.id)).toBe(true);
    const isi = JSON.stringify(antrean);
    for (const kenari of [KARYAWAN_LAIN.kpi.name, KARYAWAN_LAIN.nama, TENANT_LAIN.kpi.name, TENANT_LAIN.karyawan.nama]) expect(isi).not.toContain(kenari);
    expect((await a.mentah('get', `/api/tna/review?projectId=${projectId}`, orang.atasan)).status).toBe(403);
    expect((await a.mentah('get', `/api/tna/review?projectId=${proyekLain}`, orang.hr)).body.data).toEqual([]);
  });

  it('temuan baru terlihat oleh karyawan dan atasannya setelah HR menyetujui; karyawan lain tidak melihatnya (RG-3)', async () => {
    const sebelum = await a.tna.temuanTerlihat(orang.karyawan, projectId);
    const antrean = await a.tna.antreanReview(orang.hr, projectId);
    for (const f of antrean) await a.tna.reviewTemuan(orang.hr, f.id);
    const sesudah = await a.tna.temuanTerlihat(orang.karyawan, projectId);
    expect(sesudah.length).toBeGreaterThan(sebelum.length);
    expect(sesudah.every((f) => f.userId === orang.karyawan.id)).toBe(true);
    const atasan = await a.tna.temuanTerlihat(orang.atasan, projectId);
    expect(atasan.map((f) => f.userId)).toEqual(expect.arrayContaining([orang.karyawan.id]));
    expect(await a.tna.temuanTerlihat(orang.lain, projectId)).toEqual([]);
  });
});
