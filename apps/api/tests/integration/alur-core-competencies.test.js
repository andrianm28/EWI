'use strict';
// B18 test alur (spek 3.3 baris "Core Competencies berjenjang", B10): HR menugaskan atasan tingkat lebih tinggi →
// setelah wawancaranya selesai ia menugaskan timnya → anggota tim diwawancarai; atasan langsung hanya melihat status,
// HR hanya melihat hitungan dan ringkasan tier pimpinan. Percakapan wawancara (tahap 2) belum ada, jadi selesainya
// wawancara memakai langkah driver `cca.selesaikanWawancara` (sambungan store sementara sampai mesin wawancara punya API).
const crypto = require('crypto');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { createStubProvider } = require('../../src/ai/stub-provider');
const { FLAGS } = require('../../src/core/flags');
const { makeConfig } = require('../helpers');
const { siapkanTenant, tambahPengguna, pembuatMasuk, hapusTenant, langkah, kodeGalat } = require('../alur/driver');
const { KARYAWAN_LAIN, TENANT_LAIN, tanggalWib } = require('../alur/data');

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('Alur Core Competencies berjenjang (HR, pimpinan, atasan, karyawan)', () => {
  let db; let a; const tenantIds = [];
  const orang = {}; let lain;
  const slug = `alur-cca-${crypto.randomBytes(3).toString('hex')}`;
  const RINGKASAN_KEPALA = 'Ringkasan kepala divisi: fokus kolaborasi lintas tim.';
  const RINGKASAN_TIM = 'Ringkasan anggota tim KENARI-CCA-7D1';
  const tenggat = tanggalWib(7);

  beforeAll(async () => {
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    const stores = createStores(db);
    const config = makeConfig();
    a = langkah(createApp({ config, stores, ai: createStubProvider() }), pembuatMasuk(config), { stores });

    const tenant = await siapkanTenant(db, { slug, flags: [FLAGS.MODULE_CCA, FLAGS.CCA_INTERVIEW] });
    tenantIds.push(tenant.id);
    orang.hr = await tambahPengguna(db, tenant.id, { nama: 'HR Contoh', email: `hr@${slug}.test`, employeeId: 'E-HR', peran: 'hr_admin' });
    orang.kepala = await tambahPengguna(db, tenant.id, { nama: 'Kepala Divisi Contoh', email: `kepala@${slug}.test`, employeeId: 'E-KDV', peran: 'pimpinan' });
    orang.atasan = await tambahPengguna(db, tenant.id, {
      nama: 'Atasan Contoh', email: `atasan@${slug}.test`, employeeId: 'E-SPV', peran: 'supervisor', atasanId: orang.kepala.id,
    });
    orang.karyawan = await tambahPengguna(db, tenant.id, {
      nama: 'Rina Contoh', email: `rina@${slug}.test`, employeeId: 'E-UJI-01', peran: 'learner', atasanId: orang.atasan.id,
    });
    orang.lain = await tambahPengguna(db, tenant.id, { nama: KARYAWAN_LAIN.nama, email: KARYAWAN_LAIN.email, employeeId: KARYAWAN_LAIN.employeeId, peran: 'learner' });

    lain = await siapkanTenant(db, { slug: `${slug}-lain`, nama: TENANT_LAIN.nama, flags: [FLAGS.MODULE_CCA, FLAGS.CCA_INTERVIEW] });
    tenantIds.push(lain.id);
    orang.hrLain = await tambahPengguna(db, lain.id, { nama: 'HR Lain', email: `hr@${slug}-lain.test`, employeeId: 'E-TL-HR', peran: 'hr_admin' });
    orang.kenari = await tambahPengguna(db, lain.id, { ...TENANT_LAIN.karyawan, peran: 'supervisor' });
  });

  afterAll(async () => {
    await hapusTenant(db, tenantIds);
    await db.close();
  });

  it('HR menugaskan atasan tingkat lebih tinggi; karyawan biasa dan orang tenant lain ditolak', async () => {
    const hasil = await a.cca.tugaskan(orang.hr, [orang.kepala.id, orang.karyawan.id, orang.kenari.id], tenggat);
    expect(hasil.tier).toBe('leader');
    expect(hasil.assigned.map((x) => x.assigneeId)).toEqual([orang.kepala.id]);
    expect(hasil.rejected).toEqual(expect.arrayContaining([orang.karyawan.id, orang.kenari.id]));
    expect((await a.cca.penugasan(orang.kepala)).mine.leader).toMatchObject({ tier: 'leader', status: 'assigned', dueDate: tenggat });
    // karyawan tidak bisa menugaskan siapa pun
    expect((await a.mentah('post', '/api/cca/assignments', orang.karyawan, { assigneeIds: [orang.lain.id], dueDate: tenggat })).status).toBe(403);
  });

  it('pimpinan baru bisa menugaskan tim setelah wawancaranya sendiri selesai', async () => {
    const sebelum = await a.mentah('post', '/api/cca/assignments', orang.kepala, { assigneeIds: [orang.atasan.id], dueDate: tenggat });
    expect(sebelum.status).toBe(409);
    expect(kodeGalat(sebelum)).toBe('LEADER_INTERVIEW_REQUIRED');
    expect((await a.cca.penugasan(orang.kepala)).canAssign).toBe(false);

    const milik = (await a.cca.penugasan(orang.kepala)).mine.leader;
    await a.cca.selesaikanWawancara(orang.kepala, milik.id, RINGKASAN_KEPALA);
    expect((await a.cca.penugasan(orang.kepala)).canAssign).toBe(true);
  });

  it('pimpinan menugaskan bawahan langsungnya saja; bawahan tidak langsung dan karyawan lain ditolak', async () => {
    const hasil = await a.cca.tugaskan(orang.kepala, [orang.atasan.id, orang.karyawan.id, orang.lain.id], tenggat);
    expect(hasil.tier).toBe('employee');
    expect(hasil.assigned.map((x) => x.assigneeId)).toEqual([orang.atasan.id]);
    expect(hasil.rejected).toEqual(expect.arrayContaining([orang.karyawan.id, orang.lain.id]));
    // penugasan ulang orang yang sama tidak menggandakan
    expect((await a.cca.tugaskan(orang.kepala, [orang.atasan.id], tenggat)).skipped).toEqual([orang.atasan.id]);
  });

  it('anggota tim melihat penugasannya dan diwawancarai; atasan langsungnya hanya melihat status, tanpa ringkasan', async () => {
    const milik = (await a.cca.penugasan(orang.atasan)).mine.employee;
    expect(milik).toMatchObject({ tier: 'employee', status: 'assigned', dueDate: tenggat });
    await a.cca.selesaikanWawancara(orang.atasan, milik.id, RINGKASAN_TIM);

    expect((await a.cca.ringkasan(orang.atasan, milik.id)).summary).toBe(RINGKASAN_TIM);

    const tampilanKepala = await a.cca.penugasan(orang.kepala);
    expect(tampilanKepala.role).toBe('leader');
    expect(tampilanKepala.team).toEqual([expect.objectContaining({ userId: orang.atasan.id, status: 'completed' })]);
    expect(JSON.stringify(tampilanKepala)).not.toContain(RINGKASAN_TIM);
    expect((await a.mentah('get', `/api/cca/assignments/${milik.id}/summary`, orang.kepala)).status).toBe(404);
  });

  it('HR melihat hitungan tim dan ringkasan tier pimpinan; ringkasan anggota tim tidak dibuka per orang', async () => {
    const tampilanHr = await a.cca.penugasan(orang.hr);
    expect(tampilanHr.kpis).toMatchObject({ leadersAssigned: 1, leadersCompleted: 1, employeesAssigned: 1, employeesCompleted: 1 });
    expect(tampilanHr.leaders.find((x) => x.userId === orang.kepala.id)).toMatchObject({ status: 'completed', teamAssigned: 1, teamDone: 1 });
    expect(JSON.stringify(tampilanHr)).not.toContain(RINGKASAN_TIM);

    const kepala = tampilanHr.leaders.find((x) => x.userId === orang.kepala.id);
    expect((await a.cca.ringkasan(orang.hr, kepala.assignmentId)).summary).toBe(RINGKASAN_KEPALA);
    const tim = (await a.cca.penugasan(orang.atasan)).mine.employee;
    const r = await a.mentah('get', `/api/cca/assignments/${tim.id}/summary`, orang.hr);
    expect(r.status).toBe(403);
    expect(kodeGalat(r)).toBe('SUMMARY_RESTRICTED');
  });

  it('tenant lain tidak melihat penugasan tenant ini', async () => {
    const tampilan = await a.cca.penugasan(orang.hrLain);
    expect(tampilan.kpis).toMatchObject({ leadersAssigned: 0, employeesAssigned: 0 });
    const tim = (await a.cca.penugasan(orang.atasan)).mine.employee;
    expect((await a.mentah('get', `/api/cca/assignments/${tim.id}/summary`, orang.hrLain)).status).toBe(404);
  });
});
