'use strict';
// B18 test alur lintas peran, baris 3.3 "Developmental Needs" (B4, docs/designs/b4-developmental-needs.md).
// Lewat API sungguhan dan Postgres memakai tests/alur/driver.js: impor job function dan kamus berkode, pengesahan,
// impor hasil asesmen, lalu tahap BIA per peran. Jalan hanya bila DATABASE_URL di-set dan migrasi sudah dijalankan.
const crypto = require('crypto');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { createStubProvider } = require('../../src/ai/stub-provider');
const { makeConfig } = require('../helpers');
const { FLAGS } = require('../../src/core/flags');
const { siapkanTenant, tambahPengguna, pembuatMasuk, hapusTenant, langkah, siapkanTenantKenari } = require('../alur/driver');
const { JABATAN, KOMPETENSI, KARYAWAN_LAIN, TENANT_LAIN } = require('../alur/data');

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('Alur Developmental Needs (HR, atasan, karyawan)', () => {
  let db; let a; let role; let kenari; const tenantIds = [];
  const orang = {};
  const slug = `alur-b4-${crypto.randomBytes(3).toString('hex')}`;
  const audit = (tenantId, resource) => db.query(
    'SELECT user_id, action, meta FROM audit_logs WHERE tenant_id = :t AND resource = :resource ORDER BY id',
    { replacements: { t: tenantId, resource } },
  ).then(([rows]) => rows);

  beforeAll(async () => {
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    const config = makeConfig();
    a = langkah(createApp({ config, stores: createStores(db), ai: createStubProvider() }), pembuatMasuk(config));

    const t = await siapkanTenant(db, { slug, flags: [FLAGS.MODULE_DNA, FLAGS.MODULE_TNA, FLAGS.DNA_DEVELOPMENT] });
    tenantIds.push(t.id);
    orang.hr = await tambahPengguna(db, t.id, { nama: 'HR Contoh', email: `hr@${slug}.test`, employeeId: 'E-HR', peran: 'hr_admin' });
    orang.atasan = await tambahPengguna(db, t.id, { nama: 'Atasan Contoh', email: `atasan@${slug}.test`, employeeId: 'E-SPV', peran: 'supervisor' });
    orang.karyawan = await tambahPengguna(db, t.id, {
      nama: 'Rina Contoh', email: `rina@${slug}.test`, employeeId: 'E-UJI-01', peran: 'learner', atasanId: orang.atasan.id,
    });
    orang.lain = await tambahPengguna(db, t.id, { nama: KARYAWAN_LAIN.nama, email: KARYAWAN_LAIN.email, employeeId: KARYAWAN_LAIN.employeeId, peran: 'learner' });

    // Kamus POC (tanpa kode dan tingkat) sudah ada sebelum B4 dinyalakan.
    role = await a.dna.buatJabatan(orang.hr, JABATAN, KOMPETENSI);
    await a.dna.tempatkan(orang.hr, orang.karyawan, role);
    await a.dna.tempatkan(orang.hr, orang.lain, role);

    kenari = await siapkanTenantKenari(db, a, slug);
    tenantIds.push(kenari.id);
    orang.hrLain = await tambahPengguna(db, kenari.id, { nama: 'HR Kenari 2', email: `hr2@${slug}-lain.test`, employeeId: 'E-TL-HR2', peran: 'hr_admin' });
    // tenant lain juga memakai B4, supaya penolakan lintas tenant teruji sebagai 404, bukan 403 flag
    await db.query('INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, :key, true)', { replacements: { t: kenari.id, key: FLAGS.DNA_DEVELOPMENT } });
  });

  afterAll(async () => {
    await hapusTenant(db, tenantIds);
    await db.close();
  });

  it('HR mengimpor job function, lalu melengkapi kamus dengan Kode, Level Program, dan Job Function', async () => {
    const jf = await a.dna.impor(orang.hr, 'dna_job_functions', [
      'Job Role,No,Job Function', `${JABATAN.name},1,Penanganan tiket`, `${JABATAN.name},2,Eskalasi ke L2`]);
    expect(jf.result).toMatchObject({ imported: 2, rejectedCount: 0, jobFunctions: 2 });

    const kamus = await a.dna.impor(orang.hr, 'dna_competencies', [
      'Job Role,Kompetensi,Kode,Rumpun,Level Program,Job Function',
      `${JABATAN.name},${KOMPETENSI[0].name},ST-B1,Specific Technical,basic,2`,
      `${JABATAN.name},${KOMPETENSI[1].name},ST-B2,Specific Technical,basic,1`,
      `${JABATAN.name},Otomasi tiket berulang,TC-I1,Technical,intermediate,1; 2`,
    ]);
    expect(kamus.result).toMatchObject({ imported: 3, rejectedCount: 0, competencies: 1, updated: 2 });

    const isi = await a.dna.kamus(orang.hr, role.id);
    expect(isi.jobFunctions.map((f) => [f.order, f.competencyCount])).toEqual([[1, 2], [2, 2]]);
    expect(isi.competencies.map((c) => [c.code, c.programTier])).toEqual([['ST-B1', 'basic'], ['ST-B2', 'basic'], ['TC-I1', 'intermediate']]);
  });

  it('HR mengesahkan kamus sekali; audit update dna.dictionary tercatat; atasan tidak boleh mengesahkan', async () => {
    expect(await a.dna.sahkanKamus(orang.hr, role.id)).toEqual({ approved: 3 });
    expect((await a.mentah('post', `/api/dna/job-roles/${role.id}/dictionary/approve`, orang.atasan)).status).toBe(403);
    const rows = await audit(orang.hr.tenantId, 'dna.dictionary');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: orang.hr.id, action: 'update', meta: { event: 'approve', jobRoleId: role.id, approved: 3 } });
  });

  it('asesmen masuk lewat impor; HR melihat tahap BIA semua pegawai jabatan itu', async () => {
    const hasil = await a.dna.impor(orang.hr, 'dna_results', [
      'ID Karyawan,Kompetensi,Skor',
      `${orang.karyawan.employeeId},${KOMPETENSI[0].name},3`,
      `${orang.karyawan.employeeId},${KOMPETENSI[1].name},2`,
      `${orang.lain.employeeId},${KOMPETENSI[0].name},3`,
      `${orang.lain.employeeId},${KOMPETENSI[1].name},4`,
      `${orang.lain.employeeId},Otomasi tiket berulang,3`,
    ], { assessor: 'Asesor Contoh', assessedAt: '2026-11-18' });
    expect(hasil.result).toMatchObject({ imported: 5, rejectedCount: 0 });

    const daftar = await a.dna.pengembangan.kebutuhan(orang.hr, role.id);
    expect(daftar.status).toBe(200);
    expect(daftar.body.data.map((p) => [p.name, p.stage, p.focus])).toEqual([
      [KARYAWAN_LAIN.nama, 'done', []], ['Rina Contoh', 'basic', ['ST-B2']]]);

    const ringkas = await a.dna.pengembangan.ringkasan(orang.hr, role.id);
    expect(ringkas.status).toBe(200);
    expect(ringkas.body.data.kpi).toMatchObject({ employees: 2, jobFunctions: 2, competencies: 3 });
    expect(ringkas.body.data.dictionary).toMatchObject({ approved: true });
  });

  it('atasan hanya timnya; karyawan hanya rencananya sendiri; tenant lain 404 (RG-3)', async () => {
    const tim = await a.dna.pengembangan.kebutuhan(orang.atasan, role.id);
    expect(tim.body.data.map((p) => p.name)).toEqual(['Rina Contoh']);
    expect((await a.dna.pengembangan.ringkasan(orang.atasan, role.id)).body.data.kpi.employees).toBe(1);
    expect((await a.dna.pengembangan.rencana(orang.atasan, orang.lain)).status).toBe(404);

    expect((await a.dna.pengembangan.kebutuhan(orang.karyawan, role.id)).status).toBe(403);
    const milikSendiri = await a.dna.pengembangan.rencana(orang.karyawan, orang.karyawan);
    expect(milikSendiri.status).toBe(200);
    expect(milikSendiri.body.data).toMatchObject({ stage: 'basic', focus: ['ST-B2'] });
    expect((await a.dna.pengembangan.rencana(orang.karyawan, orang.lain)).status).toBe(404);

    expect((await a.dna.pengembangan.rencana(orang.hrLain, orang.karyawan)).status).toBe(404);
    const isiLain = JSON.stringify((await a.dna.pengembangan.ringkasan(orang.hrLain)).body);
    expect(isiLain).not.toContain(JABATAN.name);
    expect(isiLain).not.toContain('Rina Contoh');
    // arah sebaliknya: data tenant lain tidak terlihat dari tenant yang diuji
    expect(JSON.stringify((await a.dna.pengembangan.kebutuhan(orang.hr, role.id)).body)).not.toContain(TENANT_LAIN.karyawan.nama);
  });

  it('flag dna.development dimatikan: endpoint B4 403 FEATURE_DISABLED', async () => {
    await db.query('UPDATE feature_flags SET enabled = false WHERE tenant_id = :t AND key = :key', { replacements: { t: kenari.id, key: FLAGS.DNA_DEVELOPMENT } });
    const r = await a.dna.pengembangan.ringkasan(orang.hrLain);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('FEATURE_DISABLED');
  });
});
