// PK-15 (17 Nov): privasi transkrip, versi persetujuan, audit baca/tulis, validasi ID lintas tenant,
// hapus dan ekspor data per karyawan, pembersihan riwayat impor. Jalan hanya bila DATABASE_URL di-set.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { createTokenService } = require('../../src/core/auth/tokens');
const { runJob } = require('../../src/jobs');
const { makeConfig, TEST_PASSWORD } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;
const CONSENT = 'tna-consent-id-v1.0';
// Role uji tanpa superuser dan tanpa UPDATE/DELETE/TRUNCATE di audit_logs, meniru role aplikasi dari B2 (PD-8 A).
const APP_ROLE = 'elgos_app_pk15_test';

run('PK-15 privasi dan audit (Postgres)', () => {
  let db; let app; let stores; let tokens; let tenant; let other; let projectId; let sessionId;
  const u = {}; const tok = {};
  const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });
  const auditRows = (where, rep = {}) => db.query(
    `SELECT user_id AS "userId", action, resource, meta FROM audit_logs WHERE tenant_id = :t AND ${where} ORDER BY id`,
    { replacements: { t: tenant.id, ...rep }, type: 'SELECT' },
  );

  beforeAll(async () => {
    const config = makeConfig();
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    stores = createStores(db);
    app = createApp({ config, stores });
    tokens = createTokenService(config.jwt);
    const slug = `pk15-${Date.now()}`;
    [[tenant]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'PK15') RETURNING id, slug`, { replacements: { slug } });
    [[other]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'Lain') RETURNING id, slug`, { replacements: { slug: `${slug}-x` } });
    const hash = bcrypt.hashSync(TEST_PASSWORD, 4);
    const add = async (key, role, t = tenant.id) => {
      const [[row]] = await db.query(
        `INSERT INTO users (tenant_id, email, name, employee_id, role, status, password_hash)
         VALUES (:t, :email, :key, :emp, :role, 'active', :hash) RETURNING id`,
        { replacements: { t, email: `${key}@pk15.test`, key, emp: `E-${key}`, role, hash } },
      );
      u[key] = row.id;
      tok[key] = tokens.sign({ id: row.id, tenantId: t, role, email: `${key}@pk15.test` });
    };
    await add('hr', 'hr_admin');
    await add('eta', 'eta_admin');
    await add('spv', 'supervisor');
    await add('ani', 'learner');
    await add('beni', 'learner');
    await add('luar', 'hr_admin', other.id);
    await db.query('UPDATE users SET supervisor_id = :spv WHERE id IN (:ids)', { replacements: { spv: u.spv, ids: [u.ani, u.beni] } });
    for (const t of [tenant.id, other.id]) {
      await db.query(`INSERT INTO entitlements (tenant_id, product) VALUES (:t, 'full_suite')`, { replacements: { t } });
      await db.query(`INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, 'module.dna', true), (:t, 'module.tna', true), (:t, 'tna.training_request', true)`, { replacements: { t } });
    }
    const [[p]] = await db.query(`INSERT INTO lna_projects (tenant_id, name) VALUES (:t, 'PK15') RETURNING id`, { replacements: { t: tenant.id } });
    projectId = p.id;
    await request(app).post('/api/tna/performance/import').set(as('hr')).send({
      period: '2026-11', projectId,
      rows: [
        { employeeId: 'E-ani', metricType: 'kpi', name: 'SLA respons', target: 90, actual: 70 },
        { employeeId: 'E-beni', metricType: 'kpi', name: 'SLA respons', target: 90, actual: 60 },
      ],
    }).expect(201);
    const sched = await request(app).post(`/api/tna/projects/${projectId}/interviews`).set(as('hr')).send({ period: '2026-11', scope: 'red_only' });
    sessionId = sched.body.data.sessions.find((s) => s.intervieweeId === u.ani).id;
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id IN (:ids)', { replacements: { ids: [tenant.id, other.id] }, transaction });
    });
    await db.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
        EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA ewi FROM ${APP_ROLE}';
        EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA ewi FROM ${APP_ROLE}';
        EXECUTE 'REVOKE ALL ON SCHEMA ewi FROM ${APP_ROLE}';
        EXECUTE 'DROP ROLE ${APP_ROLE}';
      END IF; END $$;`);
    await db.close();
  });

  describe('persetujuan wawancara menyimpan versi (PM-9 A)', () => {
    it('menolak tanpa versi atau versi tak dikenal, menyimpan versi yang berlaku', async () => {
      const url = `/api/tna/sessions/${sessionId}/consent`;
      const none = await request(app).post(url).set(as('ani')).send({});
      expect(none.status).toBe(400);
      const old = await request(app).post(url).set(as('ani')).send({ consentVersion: 'tna-consent-id-v0.9' });
      expect(old.status).toBe(409);
      expect(old.body.error.code).toBe('CONSENT_VERSION_OUTDATED');
      const ok = await request(app).post(url).set(as('ani')).send({ consentVersion: CONSENT });
      expect(ok.status).toBe(200);
      expect(ok.body.data.consentVersion).toBe(CONSENT);
      const [[row]] = await db.query('SELECT consent_version AS v, consent_at AS at FROM lna_interview_sessions WHERE id = :id', { replacements: { id: sessionId } });
      expect(row.v).toBe(CONSENT);
      expect(row.at).toBeTruthy();
      const [a] = await auditRows(`resource = 'tna.interview_consent'`);
      expect(a).toMatchObject({ userId: u.ani, action: 'create', meta: { consentVersion: CONSENT, objectIds: [sessionId] } });
      await request(app).post(`/api/tna/sessions/${sessionId}/turns`).set(as('ani')).send({ text: 'Saya belum paham kontrak proyek.' }).expect(200);
      // PK-14: penutupan 202, analisis berjalan sebagai job, temuan tampil setelah HR menyetujui
      await request(app).post(`/api/tna/sessions/${sessionId}/complete`).set(as('ani')).expect(202);
      await app.locals.analysis.drain();
      const q = await request(app).get('/api/tna/review').set(as('hr'));
      for (const f of q.body.data) await request(app).post(`/api/tna/findings/${f.id}/review`).set(as('hr')).send({ decision: 'approve' }).expect(200);
    });
  });

  describe('transkrip mentah hanya untuk karyawan sendiri (PO-6 A)', () => {
    it.each(['spv', 'hr', 'eta'])('%s melihat status sesi tanpa transkrip dan ditolak membaca transkrip', async (who) => {
      const s = await request(app).get(`/api/tna/sessions/${sessionId}`).set(as(who));
      expect(s.status).toBe(200);
      expect(s.body.data.turns).toBeUndefined();
      expect(s.body.data.transcriptVisible).toBe(false);
      const t = await request(app).get(`/api/tna/sessions/${sessionId}/transcript`).set(as(who));
      expect(t.status).toBe(403);
      expect(t.body.error.code).toBe('TRANSCRIPT_PRIVATE');
    });

    it('karyawan sendiri membaca transkrip, tercatat di audit; karyawan lain tidak melihat sesinya', async () => {
      const t = await request(app).get(`/api/tna/sessions/${sessionId}/transcript`).set(as('ani'));
      expect(t.status).toBe(200);
      expect(t.body.data.some((x) => x.speaker === 'human')).toBe(true);
      expect((await request(app).get(`/api/tna/sessions/${sessionId}`).set(as('beni'))).status).toBe(404);
      const rows = await auditRows(`resource = 'tna.interview_transcript'`);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.userId === u.ani)).toBe(true);
    });

    it('atasan dan HR tetap melihat temuan', async () => {
      const f = await request(app).get('/api/tna/findings').set(as('spv'));
      expect(f.status).toBe(200);
      expect(f.body.data.some((x) => x.userId === u.ani)).toBe(true);
    });
  });

  describe('audit baca dan tulis', () => {
    it('baca data kinerja dicatat', async () => {
      await request(app).get('/api/tna/performance').set(as('spv')).expect(200);
      const [row] = await auditRows(`resource = 'tna.performance' AND user_id = :spv`, { spv: u.spv });
      expect(row.action).toBe('read');
      expect(row.meta.employeeIds.sort()).toEqual([u.ani, u.beni].sort());
    });

    it('rencana dan perubahan temuan dicatat', async () => {
      const [finding] = (await request(app).get('/api/tna/findings').set(as('hr'))).body.data.filter((x) => x.userId === u.ani);
      const plan = await request(app).post(`/api/tna/findings/${finding.id}/plan`).set(as('hr')).send({});
      expect(plan.status).toBe(201);
      await request(app).patch(`/api/tna/plan-items/${plan.body.data.id}`).set(as('spv')).send({ status: 'in_progress' }).expect(200);
      await request(app).post('/api/tna/training-requests').set(as('ani')).send({ note: 'Ingin kelas negosiasi' }).expect(201);
      const rows = await auditRows(`resource IN ('tna.plan_item','tna.finding')`);
      expect(rows.map((r) => [r.resource, r.action])).toEqual([
        ['tna.plan_item', 'create'], ['tna.finding', 'update'], ['tna.plan_item', 'update'], ['tna.plan_item', 'create'],
      ]);
      expect(rows[1].meta).toMatchObject({ objectIds: [finding.id], to: 'planned' });
      expect(rows[2].meta).toMatchObject({ from: { status: expect.any(String) }, changed: { status: 'in_progress' } });
    });

    it('perubahan posisi dicatat; ID job role tenant lain ditolak (PD-19 butir 4)', async () => {
      const mine = await request(app).post('/api/dna/job-roles').set(as('hr')).send({ name: 'L1', levels: [{ name: 'Junior' }] });
      const theirs = await request(app).post('/api/dna/job-roles').set(as('luar')).send({ name: 'Rahasia', levels: [{ name: 'X' }] });
      const cross = await request(app).put(`/api/dna/employees/${u.ani}/position`).set(as('hr')).send({ jobRoleId: theirs.body.data.id });
      expect(cross.status).toBe(404);
      const crossLevel = await request(app).put(`/api/dna/employees/${u.ani}/position`).set(as('hr'))
        .send({ jobRoleId: mine.body.data.id, careerLevelId: theirs.body.data.levels[0].id });
      expect(crossLevel.status).toBe(400);
      const [[still]] = await db.query('SELECT job_role_id AS j FROM users WHERE id = :id', { replacements: { id: u.ani } });
      expect(still.j).toBeNull();

      const ok = await request(app).put(`/api/dna/employees/${u.ani}/position`).set(as('hr'))
        .send({ jobRoleId: mine.body.data.id, careerLevelId: mine.body.data.levels[0].id });
      expect(ok.status).toBe(200);
      const [row] = await auditRows(`resource = 'dna.employee_position'`);
      expect(row).toMatchObject({ action: 'update', userId: u.hr, meta: { employeeIds: [u.ani], from: { jobRoleId: null }, to: { jobRoleId: mine.body.data.id } } });

      const comp = await request(app).post('/api/dna/competencies').set(as('hr')).send({ kind: 'job', name: 'x', jobRoleId: theirs.body.data.id });
      expect(comp.status).toBe(404);
      const bulk = await request(app).post('/api/dna/competencies/bulk').set(as('hr')).send({ items: [{ kind: 'job', name: 'x', jobRoleId: theirs.body.data.id }] });
      expect(bulk.status).toBe(400);
    });

    it('login dengan password dicatat', async () => {
      const res = await request(app).post('/api/auth/login').send({ tenant: tenant.slug, email: 'beni@pk15.test', password: TEST_PASSWORD });
      expect(res.status).toBe(200);
      const rows = await auditRows(`action = 'login' AND user_id = :b`, { b: u.beni });
      expect(rows.map((r) => r.resource)).toEqual(['auth.password']);
    });
  });

  describe('ekspor data per karyawan', () => {
    it('karyawan sendiri menerima seluruh datanya termasuk transkrip', async () => {
      const res = await request(app).get(`/api/employees/${u.ani}/export`).set(as('ani'));
      expect(res.status).toBe(200);
      const d = res.body.data;
      expect(d).toMatchObject({ format: 'elgos-employee-export-v1', transcriptIncluded: true, profile: { id: u.ani } });
      expect(d.interviews[0]).toMatchObject({ id: sessionId, consentVersion: CONSENT });
      expect(d.interviews[0].transcript.some((t) => t.speaker === 'human')).toBe(true);
      expect(d.findings.length).toBeGreaterThan(0);
      expect(d.planItems.length).toBeGreaterThan(0);
      expect(d.performance.map((p) => p.name)).toEqual(['SLA respons']);
    });

    it('HR tenant yang sama menerima data tanpa transkrip mentah', async () => {
      const res = await request(app).get(`/api/employees/${u.ani}/export`).set(as('hr'));
      expect(res.status).toBe(200);
      expect(res.body.data.transcriptIncluded).toBe(false);
      expect(res.body.data.interviews[0].transcript).toBeUndefined();
      expect(JSON.stringify(res.body.data)).not.toMatch(/belum paham kontrak/);
    });

    it('karyawan lain dan atasan ditolak, HR tenant lain tidak menemukan', async () => {
      expect((await request(app).get(`/api/employees/${u.ani}/export`).set(as('beni'))).status).toBe(403);
      expect((await request(app).get(`/api/employees/${u.ani}/export`).set(as('spv'))).status).toBe(403);
      expect((await request(app).get(`/api/employees/${u.ani}/export`).set(as('luar'))).status).toBe(404);
    });

    it('setiap ekspor tercatat dengan aksi export', async () => {
      const rows = await auditRows(`action = 'export'`);
      expect(rows.map((r) => [r.userId, r.meta.self, r.meta.transcriptIncluded])).toEqual([[u.ani, true, true], [u.hr, false, false]]);
      expect(rows.every((r) => r.resource === 'employee.data' && r.meta.employeeIds[0] === u.ani)).toBe(true);
    });
  });

  describe('hapus karyawan dan audit tetap append-only', () => {
    it('pembatasan: bukan HR, akun sendiri, akun admin, tenant lain', async () => {
      expect((await request(app).delete(`/api/employees/${u.beni}`).set(as('spv'))).status).toBe(403);
      expect((await request(app).delete(`/api/employees/${u.hr}`).set(as('hr'))).body.error.code).toBe('CANNOT_DELETE_SELF');
      expect((await request(app).delete(`/api/employees/${u.eta}`).set(as('hr'))).body.error.code).toBe('ADMIN_ACCOUNT');
      expect((await request(app).delete(`/api/employees/${u.beni}`).set(as('luar'))).status).toBe(404);
    });

    it('HR menghapus karyawan yang punya jejak audit; barisnya hilang dari impor yang belum disimpan', async () => {
      // batch impor yang belum di-commit berisi baris beni dan ani
      const csv = 'ID Karyawan,Nama,Email,Peran\nE-beni,beni,beni@pk15.test,learner\nE-ani,ani,ani@pk15.test,learner\n';
      const up = await request(app).post('/api/tna/imports/employees?filename=k.csv').set(as('hr')).set('Content-Type', 'text/csv').send(csv);
      expect(up.status).toBe(201);
      const before = await auditRows(`user_id = :b`, { b: u.beni });
      expect(before.length).toBeGreaterThan(0); // login beni tercatat

      const res = await request(app).delete(`/api/employees/${u.beni}`).set(as('hr')).send({ reason: 'Permintaan karyawan via HR' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ deleted: true, userId: u.beni, scrubbedImportRows: 1 });

      const [[gone]] = await db.query('SELECT count(*)::int AS n FROM users WHERE id = :id', { replacements: { id: u.beni } });
      expect(gone.n).toBe(0);
      const [[perf]] = await db.query('SELECT count(*)::int AS n FROM lna_performance_records WHERE user_id = :id', { replacements: { id: u.beni } });
      expect(perf.n).toBe(0);
      // baris audit lama tetap ada, user_id dikosongkan
      const [[kept]] = await db.query(`SELECT count(*)::int AS n FROM audit_logs WHERE tenant_id = :t AND resource = 'auth.password' AND user_id IS NULL`, { replacements: { t: tenant.id } });
      expect(kept.n).toBe(before.filter((r) => r.resource === 'auth.password').length);
      const [del] = await auditRows(`action = 'delete' AND resource = 'employee'`);
      expect(del).toMatchObject({ userId: u.hr, meta: { employeeIds: [u.beni], reason: 'Permintaan karyawan via HR' } });

      const batch = await stores.imports.get(tenant.id, up.body.data.id);
      expect(batch.rowCount).toBe(1);
      expect(JSON.stringify(batch.rows)).not.toMatch(/beni/);
      expect(JSON.stringify(batch.rows)).toMatch(/E-ani/);
    });

    it('UPDATE dan DELETE lain pada audit tetap ditolak', async () => {
      const t = { t: tenant.id };
      await expect(db.query(`UPDATE audit_logs SET resource = 'x' WHERE tenant_id = :t`, { replacements: t })).rejects.toThrow(/append-only/);
      await expect(db.query(`UPDATE audit_logs SET user_id = NULL, resource = 'x' WHERE tenant_id = :t AND user_id IS NOT NULL`, { replacements: t })).rejects.toThrow(/append-only/);
      await expect(db.query(`UPDATE audit_logs SET user_id = :hr WHERE tenant_id = :t AND user_id IS NULL`, { replacements: { ...t, hr: u.hr } })).rejects.toThrow(/append-only/);
      await expect(db.query(`DELETE FROM audit_logs WHERE tenant_id = :t`, { replacements: t })).rejects.toThrow(/append-only/);
    });

    it('hapus user berhasil dengan role aplikasi non-superuser tanpa hak UPDATE di audit_logs', async () => {
      await db.query(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
          EXECUTE 'CREATE ROLE ${APP_ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS';
        END IF; END $$;`);
      await db.query(`GRANT USAGE ON SCHEMA ewi TO ${APP_ROLE};
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ewi TO ${APP_ROLE};
        REVOKE UPDATE, DELETE, TRUNCATE ON ewi.audit_logs FROM ${APP_ROLE};
        GRANT USAGE ON ALL SEQUENCES IN SCHEMA ewi TO ${APP_ROLE};`);
      const [[r]] = await db.query(`SELECT rolsuper FROM pg_roles WHERE rolname = '${APP_ROLE}'`);
      expect(r.rolsuper).toBe(false);
      await stores.audit.insert({ tenantId: tenant.id, userId: u.ani, action: 'read', resource: 'uji.non_superuser', meta: {}, at: new Date() });

      const asApp = (sql, rep) => db.transaction(async (transaction) => {
        await db.query(`SET LOCAL ROLE ${APP_ROLE}`, { transaction });
        return db.query(sql, { replacements: rep, transaction });
      });
      // role aplikasi tidak bisa mengubah audit secara langsung, termasuk mengosongkan user_id
      await expect(asApp(`UPDATE audit_logs SET user_id = NULL WHERE tenant_id = :t`, { t: tenant.id })).rejects.toThrow(/permission denied/);
      // tetapi DELETE user tetap jalan: aksi FK ON DELETE SET NULL berjalan sebagai pemilik tabel
      await asApp('DELETE FROM users WHERE tenant_id = :t AND id = :id', { t: tenant.id, id: u.ani });
      const [[gone]] = await db.query('SELECT count(*)::int AS n FROM users WHERE id = :id', { replacements: { id: u.ani } });
      expect(gone.n).toBe(0);
      const [[row]] = await db.query(`SELECT user_id FROM audit_logs WHERE tenant_id = :t AND resource = 'uji.non_superuser'`, { replacements: { t: tenant.id } });
      expect(row.user_id).toBeNull();
    });
  });

  describe('job pembersihan riwayat impor', () => {
    it('hapus batch belum disimpan yang lewat TTL, kosongkan baris batch tersimpan, sisakan batch baru', async () => {
      const mk = async (status, ageDays, rows) => {
        const id = crypto.randomUUID();
        await db.query(
          `INSERT INTO import_batches (id, tenant_id, submodule, kind, status, row_count, rows, result, created_at)
           VALUES (:id, :t, 'tna', 'employees', :status, :n, CAST(:rows AS jsonb), CAST(:result AS jsonb), now() - make_interval(days => :age))`,
          { replacements: { id, t: tenant.id, status, n: rows.length, rows: JSON.stringify(rows), result: JSON.stringify(status === 'committed' ? { imported: rows.length } : null), age: ageDays } },
        );
        return id;
      };
      const stale = await mk('uploaded', 8, [{ a: 1 }]);
      const fresh = await mk('uploaded', 1, [{ a: 2 }]);
      const legacy = await mk('committed', 30, [{ a: 3 }]);
      const result = await runJob('import-batches-cleanup', { stores, env: { IMPORT_BATCH_TTL_DAYS: '7' } });
      expect(result.deletedUploaded).toBeGreaterThanOrEqual(1);
      const rows = await db.query('SELECT id, status, rows, row_count AS n, result FROM import_batches WHERE id IN (:ids)',
        { replacements: { ids: [stale, fresh, legacy] }, type: 'SELECT' });
      const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
      expect(byId[stale]).toBeUndefined();
      expect(byId[fresh].rows).toEqual([{ a: 2 }]);
      expect(byId[legacy]).toMatchObject({ rows: [], n: 1, result: { imported: 1 } });
      await expect(runJob('tidak-ada', { stores })).rejects.toThrow(/Job tidak dikenal/);
    });
  });
});
