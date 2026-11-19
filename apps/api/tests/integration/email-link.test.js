// R3-2: login karyawan lewat link email (Postgres).
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { memoryMailer } = require('../../src/integrations/mailer');
const { makeConfig, sessionSigner } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('Login link email R3-2 (Postgres)', () => {
  let db; let app; let stores; let tenant; let slug; let mailer; const u = {}; let hrTok;
  const tokenFrom = (msg) => msg.text.match(/\/masuk#token=([A-Za-z0-9_-]+)/)[1];

  beforeAll(async () => {
    const config = makeConfig({ APP_BASE_URL: 'https://elgos.test/' });
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    mailer = memoryMailer();
    stores = createStores(db);
    app = createApp({ config, stores, mailer });
    slug = `link-${Date.now()}`;
    [[tenant]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, 'ELGOS Link') RETURNING id`, { replacements: { slug } });
    for (const [key, role, status] of [['hr', 'hr_admin', 'active'], ['dimas', 'learner', 'active'], ['rina', 'learner', 'active'], ['off', 'learner', 'disabled']]) {
      const [[row]] = await db.query(
        `INSERT INTO users (tenant_id, email, name, role, status) VALUES (:t, :email, :key, :role, :status) RETURNING id`,
        { replacements: { t: tenant.id, email: `${key}@link.test`, key, role, status } },
      );
      u[key] = row.id;
    }
    hrTok = await sessionSigner(config, stores.authSessions).sign({ id: u.hr, tenantId: tenant.id, role: 'hr_admin', email: 'hr@link.test' });
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
    // B1: permintaan link dan keberhasilan masuk sama-sama tercatat
    const [audit] = await db.query(`SELECT action, resource, meta->>'outcome' AS outcome FROM audit_logs WHERE tenant_id = :t AND user_id = :u ORDER BY id`, { replacements: { t: tenant.id, u: u.dimas } });
    expect(audit).toEqual([
      { action: 'login', resource: 'auth.attempt', outcome: 'link_sent' },
      { action: 'login', resource: 'auth.email_link', outcome: null },
    ]);
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

  it('PK-16: penukaran link membuat sesi di database; HR mencabut; user nonaktif kehilangan sesi', async () => {
    mailer.sent.length = 0;
    await db.query("UPDATE login_links SET created_at = now() - interval '1 hour' WHERE user_id = :id", { replacements: { id: u.dimas } });
    await request(app).post('/api/auth/email-link').send({ tenant: slug, email: 'dimas@link.test' }).expect(202);
    const ok = await request(app).post('/api/auth/email-link/verify').set('User-Agent', 'uji-elgos').send({ token: tokenFrom(mailer.sent[0]) });
    expect(ok.status).toBe(200);
    const auth = { Authorization: `Bearer ${ok.body.token}` };
    const [[row]] = await db.query(`SELECT method, user_agent, revoked_at FROM auth_sessions WHERE user_id = :id ORDER BY created_at DESC LIMIT 1`, { replacements: { id: u.dimas } });
    expect(row).toEqual({ method: 'email_link', user_agent: 'uji-elgos', revoked_at: null });
    expect((await request(app).get('/api/sessions/mine').set(auth)).body.data[0]).toMatchObject({ method: 'email_link', current: true });

    const rev = await request(app).post(`/api/sessions/users/${u.dimas}/revoke`).set('Authorization', `Bearer ${hrTok}`);
    expect(rev.body.data.revoked).toBeGreaterThanOrEqual(1);
    expect((await request(app).get('/api/auth/me').set(auth)).status).toBe(401);
    const [[audit]] = await db.query(`SELECT action, meta->>'reason' AS reason FROM audit_logs WHERE tenant_id = :t AND user_id = :u AND resource = 'auth.session'`, { replacements: { t: tenant.id, u: u.hr } });
    expect(audit).toEqual({ action: 'delete', reason: 'admin_revoke' });

    // user dinonaktifkan: sesi yang masih ada langsung ditolak
    const rinaTok = await sessionSigner(makeConfig(), stores.authSessions).sign({ id: u.rina, tenantId: tenant.id, role: 'learner', email: 'rina@link.test' });
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${rinaTok}`)).status).toBe(200);
    await db.query("UPDATE users SET status = 'disabled' WHERE id = :id", { replacements: { id: u.rina } });
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${rinaTok}`)).status).toBe(401);
    await db.query("UPDATE users SET status = 'active' WHERE id = :id", { replacements: { id: u.rina } });
  });

  it('PK-16: batas per IP untuk minta link dan tukar token', async () => {
    const { defaultRateLimits } = require('../../src/app');
    const { createRateLimiter } = require('../../src/core/auth/rate-limit');
    const rateLimits = { ...defaultRateLimits(), linkIp: createRateLimiter({ windowMs: 60000, max: 2 }), verifyIp: createRateLimiter({ windowMs: 60000, max: 2 }) };
    const limited = createApp({ config: makeConfig(), stores, mailer, rateLimits });
    for (let i = 0; i < 2; i += 1) await request(limited).post('/api/auth/email-link').send({ tenant: slug, email: `x${i}@link.test` }).expect(202);
    expect((await request(limited).post('/api/auth/email-link').send({ tenant: slug, email: 'x9@link.test' })).status).toBe(429);
    for (let i = 0; i < 2; i += 1) await request(limited).post('/api/auth/email-link/verify').send({ token: 'x'.repeat(30) }).expect(401);
    expect((await request(limited).post('/api/auth/email-link/verify').send({ token: 'x'.repeat(30) })).status).toBe(429);
  });

  it('PK-16: Admin ETA di luar daftar email tidak menerima link', async () => {
    const [[eta]] = await db.query(`INSERT INTO users (tenant_id, email, name, role, status) VALUES (:t, 'eta@link.test', 'eta', 'eta_admin', 'active') RETURNING id`, { replacements: { t: tenant.id } });
    const strict = createApp({ config: makeConfig({ ETA_ADMIN_EMAILS: 'lain@link.test' }), stores, mailer });
    mailer.sent.length = 0;
    await request(strict).post('/api/auth/email-link').send({ tenant: slug, email: 'eta@link.test' }).expect(202);
    expect(mailer.sent).toHaveLength(0);
    const open = createApp({ config: makeConfig({ ETA_ADMIN_EMAILS: 'eta@link.test' }), stores, mailer });
    await request(open).post('/api/auth/email-link').send({ tenant: slug, email: 'eta@link.test' }).expect(202);
    expect(mailer.sent.map((m) => m.to)).toEqual(['eta@link.test']);
    // link yang sudah terkirim tidak bisa ditukar bila email dikeluarkan dari daftar
    expect((await request(strict).post('/api/auth/email-link/verify').send({ token: tokenFrom(mailer.sent[0]) })).status).toBe(401);
    expect(eta.id).toBeTruthy();
  });
});
