'use strict';
// B18 test alur (spek 3.3 baris "Pelatihan offline sampai skor" dan "Webhook EliteMentor ke pelatihan online", B14).
// Lewat API sungguhan dan Postgres, memakai tests/alur/driver.js. Tenant, pengguna, flag, dan entitlement lewat SQL
// (driver); pelatihan, peserta, kehadiran, skor, dan event webhook lewat API.
const crypto = require('crypto');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { memoryMailer } = require('../../src/integrations/mailer');
const { memoryStorage } = require('../../src/integrations/storage');
const { makeConfig } = require('../helpers');
const { siapkanTenant, tambahPengguna, pembuatMasuk, hapusTenant, langkah, kodeGalat } = require('../alur/driver');
const { JABATAN, KOMPETENSI } = require('../alur/data');

const run = process.env.DATABASE_URL ? describe : describe.skip;
const RAHASIA = 'rahasia-webhook-alur';
const hari = (geser) => new Date(Date.now() + 7 * 3600e3 + geser * 86400e3).toISOString().slice(0, 10);

run('Alur Learning Delivery (B14)', () => {
  let db; let a; let tenant; const tenantIds = [];
  const orang = {};
  let jabatanId;
  const slug = `alur-ld-${crypto.randomBytes(3).toString('hex')}`;
  const orgId = 1000000 + crypto.randomBytes(3).readUIntBE(0, 3);
  const flag = (key, enabled) => db.query(
    `INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, :key, :enabled) ON CONFLICT (tenant_id, key) DO UPDATE SET enabled = EXCLUDED.enabled`,
    { replacements: { t: tenant.id, key, enabled } },
  );

  beforeAll(async () => {
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    const config = makeConfig({ ELITEMENTOR_WEBHOOK_SECRET: RAHASIA, APP_BASE_URL: 'https://elgos.test' });
    a = langkah(createApp({ config, stores: createStores(db), mailer: memoryMailer(), storage: memoryStorage() }), pembuatMasuk(config));
    tenant = await siapkanTenant(db, { slug, flags: ['module.dna', 'module.ld'], organisasiEm: orgId });
    tenantIds.push(tenant.id);
    orang.hr = await tambahPengguna(db, tenant.id, { nama: 'HR Contoh', email: `hr@${slug}.test`, employeeId: 'E-HR', peran: 'hr_admin' });
    orang.atasan = await tambahPengguna(db, tenant.id, { nama: 'Atasan Contoh', email: `atasan@${slug}.test`, employeeId: 'E-SPV', peran: 'supervisor' });
    orang.rina = await tambahPengguna(db, tenant.id, { nama: 'Rina Contoh', email: `rina@${slug}.test`, employeeId: 'E-UJI-01', peran: 'learner', atasanId: orang.atasan.id });
    orang.bayu = await tambahPengguna(db, tenant.id, { nama: 'Bayu Contoh', email: `bayu@${slug}.test`, employeeId: 'E-UJI-02', peran: 'learner', atasanId: orang.atasan.id });
    const role = await a.dna.buatJabatan(orang.hr, JABATAN, KOMPETENSI);
    jabatanId = role.id;
    for (const k of [orang.rina, orang.bayu]) await a.dna.tempatkan(orang.hr, k, role);
  });

  afterAll(async () => {
    await hapusTenant(db, tenantIds);
    await db.close();
  });

  describe('pelatihan offline sampai skor', () => {
    let pelatihan;

    it('HR membuat pelatihan offline dan menambah peserta dari jabatan', async () => {
      pelatihan = await a.ld.buatPelatihan(orang.hr, { title: 'Workshop Eskalasi', startsOn: hari(-1), venue: 'Ruang Rajawali' });
      expect(pelatihan).toMatchObject({ mode: 'offline', source: 'manual', assessmentStatus: 'none' });
      const peserta = await a.ld.tambahPeserta(orang.hr, pelatihan.id, { jobRoleId: jabatanId });
      expect(peserta.participantList.map((p) => p.userId).sort()).toEqual([orang.rina.id, orang.bayu.id].sort());
    });

    it('kehadiran lalu skor vendor: asesmen "manual" begitu semua yang hadir punya skor', async () => {
      await a.ld.kehadiran(orang.hr, pelatihan.id, [{ userId: orang.rina.id, present: true }, { userId: orang.bayu.id, present: false }]);
      expect((await a.ld.asesmen(orang.hr, pelatihan.id, { mode: 'vendor_manual' })).assessmentStatus).toBe('manual_pending');
      await a.ld.skor(orang.hr, pelatihan.id, [{ userId: orang.rina.id, score: 84 }]);
      const detail = await a.ld.detail(orang.hr, pelatihan.id);
      expect(detail.assessmentStatus).toBe('manual');
      expect(detail.participantList.find((p) => p.userId === orang.rina.id)).toMatchObject({ attendance: true, score: 84, scoreSource: 'vendor_manual' });
    });

    it('dashboard memuat pelatihan itu', async () => {
      const dash = await a.ld.dashboard(orang.hr);
      expect(JSON.stringify(dash)).toContain(pelatihan.id);
    });

    it('pengingat kedua dalam 24 jam ditolak 409 REMINDER_RECENT', async () => {
      expect((await a.ld.pengingat(orang.hr, pelatihan.id)).status).toBe(201);
      const lagi = await a.ld.pengingat(orang.hr, pelatihan.id);
      expect([lagi.status, kodeGalat(lagi)]).toEqual([409, 'REMINDER_RECENT']);
    });

    it('atasan dan karyawan ditolak 403', async () => {
      for (const siapa of [orang.atasan, orang.rina]) expect((await a.mentah('get', `/api/ld/trainings/${pelatihan.id}`, siapa)).status).toBe(403);
    });
  });

  describe('webhook EliteMentor ke pelatihan online', () => {
    // Kontrak (spek B14 §4.3): learning.progress membuat/memperbarui pelatihan online sumber `elitementor` lewat course.ref;
    // assessment.result mengisi skor pelatihan offline yang asesmennya `elitementor` lewat kode asesmen.
    const REF = 'EM-ESK-ONLINE';
    let seq = 0;
    const event = (isi) => ({ id: `alur-${slug}-${seq += 1}`, organizationId: orgId, occurredAt: new Date().toISOString(), ...isi });
    const progres = (email, extra = {}) => event({ type: 'learning.progress', course: { ref: REF, title: 'Eskalasi Online' }, user: { email }, progressPct: 40, status: 'in_progress', ...extra });
    const online = async () => (await a.ld.daftar(orang.hr, 'mode=online')).find((t) => t.externalRef === REF);
    const pesertaOnline = async () => (await a.ld.detail(orang.hr, (await online()).id)).participantList;

    it('flag em.webhook_sync mati: event diterima 202 tanpa efek', async () => {
      expect((await a.webhookEm(RAHASIA, progres(orang.rina.email))).status).toBe(202);
      expect(await online()).toBeUndefined();
    });

    it('learning.progress ber-HMAC membuat pelatihan online dan memperbarui peserta; event ulang tidak berefek', async () => {
      await flag('em.webhook_sync', true);
      expect((await a.webhookEm('rahasia-salah', progres(orang.rina.email))).status).toBe(401);
      const ev = progres(orang.rina.email, { progressPct: 60 });
      expect((await a.webhookEm(RAHASIA, ev)).status).toBe(202);
      expect((await a.webhookEm(RAHASIA, { ...ev, progressPct: 95 })).status).toBe(202); // id sama: diabaikan
      expect(await online()).toMatchObject({ mode: 'online', source: 'elitementor', participants: 1 });
      expect((await pesertaOnline()).find((p) => p.userId === orang.rina.id)).toMatchObject({ progressPct: 60, status: 'in_progress' });
      const selesai = progres(orang.rina.email, { status: 'completed', progressPct: null, score: 88 });
      expect((await a.webhookEm(RAHASIA, selesai)).status).toBe(202);
      expect((await pesertaOnline()).find((p) => p.userId === orang.rina.id)).toMatchObject({ status: 'completed', progressPct: 100, score: 88, scoreSource: 'elitementor' });
    });

    it('assessment.result mengisi skor pelatihan offline lewat kode asesmen; event ulang tidak berefek', async () => {
      const kelas = await a.ld.buatPelatihan(orang.hr, { title: 'Kelas Eskalasi', startsOn: hari(-1), venue: 'Aula' });
      await a.ld.tambahPeserta(orang.hr, kelas.id, { userIds: [orang.rina.id, orang.bayu.id] });
      expect((await a.ld.asesmen(orang.hr, kelas.id, { mode: 'elitementor', assessmentRef: 'ASM-ALUR' })).assessmentStatus).toBe('awaiting');
      const hasil = event({ type: 'assessment.result', course: { ref: 'ASM-ALUR' }, user: { email: orang.bayu.email }, score: 73 });
      expect((await a.webhookEm(RAHASIA, hasil)).status).toBe(202);
      expect((await a.webhookEm(RAHASIA, { ...hasil, score: 10 })).status).toBe(202); // ulang
      const peserta = (await a.ld.detail(orang.hr, kelas.id)).participantList;
      expect(peserta.find((p) => p.userId === orang.bayu.id)).toMatchObject({ score: 73, scoreSource: 'elitementor' });
    });

    it.each([
      ['em.webhook_sync mati', () => flag('em.webhook_sync', false), () => flag('em.webhook_sync', true)],
      ['module.ld mati', () => flag('module.ld', false), () => flag('module.ld', true)],
      ['tanpa full_suite',
        () => db.query("DELETE FROM entitlements WHERE tenant_id = :t AND product = 'full_suite'", { replacements: { t: tenant.id } }),
        () => db.query("INSERT INTO entitlements (tenant_id, product) VALUES (:t, 'full_suite')", { replacements: { t: tenant.id } })],
    ])('%s: event diterima 202 tanpa efek', async (_, matikan, pulihkan) => {
      await matikan();
      const r = await a.webhookEm(RAHASIA, progres(orang.bayu.email));
      await pulihkan();
      expect(r.status).toBe(202);
      expect((await pesertaOnline()).map((p) => p.userId)).toEqual([orang.rina.id]);
    });
  });
});
