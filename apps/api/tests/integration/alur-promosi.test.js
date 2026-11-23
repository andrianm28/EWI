'use strict';
// B18 test alur lintas peran, baris 3.3 "Rekomendasi promosi" (B16, docs/designs/b16-career-promotion.md).
// Lewat API sungguhan dan Postgres memakai tests/alur/driver.js: kelulusan program dan OKR diimpor, karyawan
// memenuhi syarat, atasan merekomendasi, HR menyetujui. Jalan hanya bila DATABASE_URL di-set dan migrasi sudah dijalankan.
const crypto = require('crypto');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { createStubProvider } = require('../../src/ai/stub-provider');
const { makeConfig } = require('../helpers');
const { FLAGS } = require('../../src/core/flags');
const { siapkanTenant, tambahPengguna, pembuatMasuk, hapusTenant, langkah, siapkanTenantKenari } = require('../alur/driver');
const { JABATAN, KOMPETENSI, PERIODE, TENANT_LAIN } = require('../alur/data');

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('Alur rekomendasi promosi (HR, atasan, karyawan, Super Admin)', () => {
  let db; let a; let role; let kenari; const tenantIds = [];
  const orang = {};
  const slug = `alur-b16-${crypto.randomBytes(3).toString('hex')}`;
  const barisKaryawan = (res) => res.body.data.find((d) => d.employee.id === orang.karyawan.id);

  beforeAll(async () => {
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    const config = makeConfig();
    let st;
    a = langkah(createApp({ config, stores: (st = createStores(db)), ai: createStubProvider() }), pembuatMasuk(config, st.authSessions));

    const t = await siapkanTenant(db, { slug, flags: [FLAGS.MODULE_DNA, FLAGS.MODULE_TNA, FLAGS.PROMOTION_RECOMMENDATION] });
    tenantIds.push(t.id);
    orang.hr = await tambahPengguna(db, t.id, { nama: 'HR Contoh', email: `hr@${slug}.test`, employeeId: 'E-HR', peran: 'hr_admin' });
    orang.super = await tambahPengguna(db, t.id, { nama: 'Super Admin Contoh', email: `eta@${slug}.test`, employeeId: 'E-ETA', peran: 'eta_admin' });
    orang.atasan = await tambahPengguna(db, t.id, { nama: 'Atasan Contoh', email: `atasan@${slug}.test`, employeeId: 'E-SPV', peran: 'supervisor' });
    orang.atasanLain = await tambahPengguna(db, t.id, { nama: 'Atasan Lain', email: `atasan2@${slug}.test`, employeeId: 'E-SPV2', peran: 'supervisor' });
    orang.karyawan = await tambahPengguna(db, t.id, {
      nama: 'Rina Contoh', email: `rina@${slug}.test`, employeeId: 'E-UJI-01', peran: 'learner', atasanId: orang.atasan.id,
    });

    role = await a.dna.buatJabatan(orang.hr, JABATAN, KOMPETENSI);
    await a.dna.tempatkan(orang.hr, orang.karyawan, role); // Junior; jenjang berikutnya Senior butuh program intermediate

    kenari = await siapkanTenantKenari(db, a, slug); // tanpa flag promotion.recommendation
    tenantIds.push(kenari.id);
    orang.hrLain = await tambahPengguna(db, kenari.id, { nama: 'HR Kenari 2', email: `hr2@${slug}-lain.test`, employeeId: 'E-TL-HR2', peran: 'hr_admin' });
  });

  afterAll(async () => {
    await hapusTenant(db, tenantIds);
    await db.close();
  });

  it('HR mengimpor kelulusan program dan OKR di atas ambang; karyawan tampil memenuhi syarat di peta', async () => {
    const lulus = await a.dna.impor(orang.hr, 'dna_completions', [
      'ID Karyawan,Program,Status', `${orang.karyawan.employeeId},basic,lulus`, `${orang.karyawan.employeeId},intermediate,lulus`]);
    expect(lulus.result).toMatchObject({ imported: 2, rejectedCount: 0 });
    const projectId = await a.buatProyek(orang.hr, 'OKR kuartal');
    await a.tna.imporKinerja(orang.hr, {
      period: PERIODE, projectId, rows: [{ employeeId: orang.karyawan.employeeId, metricType: 'okr', name: 'Resolusi tiket (%)', target: 100, actual: 90 }],
    });

    const peta = await a.dna.karier.peta(orang.hr);
    expect(peta.status).toBe(200);
    const rina = peta.body.data.employees.find((e) => e.id === orang.karyawan.id);
    expect(rina).toMatchObject({ status: 'eligible', level: { name: 'Junior' }, nextLevel: { name: 'Senior' }, okr: { achievement: 90 }, decisionState: 'none' });
  });

  it('penolakan per peran sebelum keputusan: karyawan 403, atasan lain 404, HR dan Super Admin tidak merangkap tahap atasan', async () => {
    expect((await a.dna.karier.peta(orang.karyawan)).status).toBe(403);
    expect((await a.dna.karier.putusanAtasan(orang.atasanLain, orang.karyawan, 'recommend')).status).toBe(404);
    for (const siapa of [orang.hr, orang.super]) expect((await a.dna.karier.putusanAtasan(siapa, orang.karyawan, 'recommend')).status).toBe(403);
    const dini = await a.dna.karier.putusanHr(orang.hr, orang.karyawan, 'approve');
    expect(dini.status).toBe(409);
    expect(dini.body.error.code).toBe('WAITING_SUPERVISOR');
  });

  it('atasan langsung merekomendasi, HR menyetujui; nama dan waktu tercatat, satu audit per keputusan, jenjang tidak berubah', async () => {
    expect((await a.dna.karier.putusanAtasan(orang.atasan, orang.karyawan, 'recommend')).status).toBe(200);
    expect((await a.dna.karier.putusanHr(orang.super, orang.karyawan, 'approve')).status).toBe(403); // Super Admin hanya melihat
    expect((await a.dna.karier.putusanHr(orang.hr, orang.karyawan, 'approve')).status).toBe(200);

    const baris = barisKaryawan(await a.dna.karier.keputusan(orang.hr));
    expect(baris.supervisor).toMatchObject({ decision: 'recommend', byName: 'Atasan Contoh', at: expect.any(String) });
    expect(baris.hr).toMatchObject({ decision: 'approved', byName: 'HR Contoh', at: expect.any(String) });
    expect(barisKaryawan(await a.dna.karier.keputusan(orang.super)).hr).toMatchObject({ decision: 'approved' });

    const [audit] = await db.query(
      `SELECT user_id, action, meta->>'event' AS event FROM audit_logs WHERE tenant_id = :t AND resource = 'dna.promotion_decision' ORDER BY id`,
      { replacements: { t: orang.hr.tenantId } },
    );
    expect(audit).toEqual([
      { user_id: orang.atasan.id, action: 'update', event: 'supervisor_decision' },
      { user_id: orang.hr.id, action: 'update', event: 'hr_decision' }]);

    const rina = (await a.dna.karier.peta(orang.hr)).body.data.employees.find((e) => e.id === orang.karyawan.id);
    expect(rina.level).toMatchObject({ name: 'Junior' }); // menyetujui tidak mengubah jenjang (C8)
  });

  it('tenant lain tanpa flag promotion.recommendation: 403 FEATURE_DISABLED, dan tidak bisa menyentuh karyawan tenant ini', async () => {
    const r = await a.dna.karier.peta(orang.hrLain);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('FEATURE_DISABLED');
    expect(JSON.stringify((await a.dna.karier.peta(orang.hr)).body)).not.toContain(TENANT_LAIN.karyawan.nama);
  });
});
