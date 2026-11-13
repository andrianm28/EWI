// R3-2: login karyawan lewat link email (Postgres).
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { createTokenService } = require('../../src/core/auth/tokens');
const { memoryMailer } = require('../../src/integrations/mailer');
const { makeConfig } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('Login link email R3-2 (Postgres)', () => {
  let db; let app; let tenant; let slug; let mailer; const u = {}; let hrTok;
  const tokenFrom = (msg) => msg.text.match(/\/masuk#token=([A-Za-z0-9_-]+)/)[1];

  beforeAll(async () => {
    const config = makeConfig({ APP_BASE_URL: 'https://elgos.test/' });
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    mailer = memoryMailer();
    app = createApp({ config, stores: createStores(db), mailer });
    slug = `link-${Date.now()}`;
    [[tenant]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'ELGOS Link') RETURNING id`, { replacements: { slug } });
    for (const [key, role, status] of [['hr', 'hr_admin', 'active'], ['dimas', 'learner', 'active'], ['rina', 'learner', 'active'], ['off', 'learner', 'disabled']]) {
      const [[row]] = await db.query(
        `INSERT INTO users (tenant_id, email, name, role, status) VALUES (:t, :email, :key, :role, :status) RETURNING id`,
        { replacements: { t: tenant.id, email: `${key}@link.test`, key, role, status } },
      );
      u[key] = row.id;
    }
    hrTok = createTokenService(config.jwt).sign({ id: u.hr, tenantId: tenant.id, role: 'hr_admin', email: 'hr@link.test' });
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id = :t', { replacements: { t: tenant.id }, transaction });
    });
    await db.close();
  });

  it('minta link: jawaban sama untuk email terdaftar dan tidak; link sekali pakai', async () => {
    const a = await request(app).post('/api/auth/email-link').send({ tenant: slug, email: 'Dimas@link.test' });
    const b = await request(app).post('/api/auth/email-link').send({ tenant: slug, email: 'nobody@link.test' });
    const c = await request(app).post('/api/auth/email-link').send({ tenant: slug, email: 'off@link.test' });
    expect([a.status, b.status, c.status]).toEqual([202, 202, 202]);
    expect(a.body).toEqual(b.body);
    expect(mailer.sent.map((m) => m.to)).toEqual(['dimas@link.test']);
    const msg = mailer.sent[0];
    expect(msg.subject).toBe('Link masuk ELGOS');
    expect(msg.text).toMatch(/https:\/\/elgos\.test\/masuk#token=/);
    expect(msg.text).toMatch(/ELGOS Link/);

    const token = tokenFrom(msg);
    const [[stored]] = await db.query('SELECT token_hash FROM login_links WHERE user_id = :id', { replacements: { id: u.dimas } });
    expect(stored.token_hash).not.toContain(token);

    const ok = await request(app).post('/api/auth/email-link/verify').send({ token });
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ id: u.dimas, role: 'learner', tenantId: tenant.id });
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${ok.body.token}`);
    expect(me.body.user.id).toBe(u.dimas);
    const again = await request(app).post('/api/auth/email-link/verify').send({ token });
    expect(again.status).toBe(401);
    expect(again.body.error.message).toMatch(/Minta link baru/);
    const [[audit]] = await db.query(`SELECT action, resource FROM audit_logs WHERE tenant_id = :t AND user_id = :u`, { replacements: { t: tenant.id, u: u.dimas } });
    expect(audit).toEqual({ action: 'login', resource: 'auth.email_link' });
  });

  it('link kedaluwarsa ditolak; permintaan dibatasi 3 per 15 menit', async () => {
    mailer.sent.length = 0;
    await request(app).post('/api/auth/email-link').send({ tenant: slug, email: 'rina@link.test' });
    const token = tokenFrom(mailer.sent[0]);
    await db.query(`UPDATE login_links SET expires_at = now() - interval '1 minute' WHERE user_id = :id`, { replacements: { id: u.rina } });
    expect((await request(app).post('/api/auth/email-link/verify').send({ token })).status).toBe(401);
    for (let i = 0; i < 4; i += 1) await request(app).post('/api/auth/email-link').send({ tenant: slug, email: 'rina@link.test' }).expect(202);
    expect(mailer.sent.length).toBe(3);
    expect((await request(app).post('/api/auth/email-link/verify').send({ token: 'x' })).status).toBe(401);
  });

  it('HR mengundang karyawan yang belum pernah masuk (7 hari); learner tidak boleh', async () => {
    mailer.sent.length = 0;
    const res = await request(app).post('/api/invitations').set('Authorization', `Bearer ${hrTok}`).send({});
    expect(res.status).toBe(201);
    expect(res.body.data.sent).toBe(1); // rina (dimas sudah masuk, off nonaktif, HR tidak diundang)
    expect(mailer.sent[0]).toMatchObject({ to: 'rina@link.test', subject: 'Undangan ELGOS dari ELGOS Link' });
    expect(mailer.sent[0].text).toMatch(/berlaku 7 hari/);
    const [[link]] = await db.query(`SELECT purpose, created_by AS "createdBy", expires_at > now() + interval '6 days' AS long FROM login_links WHERE user_id = :id AND purpose = 'invite'`, { replacements: { id: u.rina } });
    expect(link).toEqual({ purpose: 'invite', createdBy: u.hr, long: true });
    const ok = await request(app).post('/api/auth/email-link/verify').send({ token: tokenFrom(mailer.sent[0]) });
    const learner = await request(app).post('/api/invitations').set('Authorization', `Bearer ${ok.body.token}`).send({});
    expect(learner.status).toBe(403);
  });
});
