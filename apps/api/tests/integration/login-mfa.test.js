// B1: link email + verifikasi dua langkah dari ujung ke ujung (Postgres).
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { memoryMailer } = require('../../src/integrations/mailer');
const totp = require('../../src/core/auth/totp');
const { makeConfig, sessionSigner } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;
const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const codeNow = (secret, offset = 0) => totp.codeAt(secret, Math.floor(Date.now() / 30000) + offset);

run('B1 login + MFA (Postgres)', () => {
  let db; let app; let stores; let mailer; let signer;
  const t = {}; const u = {};
  const tokenFrom = (msg) => msg.text.match(/\/masuk#token=([A-Za-z0-9_-]+)/)[1];
  const sign = (key, tenant, role) => signer.sign({ id: u[key], tenantId: t[tenant].id, role, email: `${key}@mfa.test` });

  beforeAll(async () => {
    const config = makeConfig({ APP_BASE_URL: 'https://elgos.test' });
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    mailer = memoryMailer();
    stores = createStores(db);
    app = createApp({ config, stores, mailer });
    signer = sessionSigner(config, stores.authSessions);
    for (const key of ['a', 'b']) {
      const slug = `mfa-${key}-${Date.now()}`;
      const [[row]] = await db.query(`INSERT INTO tenants (slug, name) VALUES (:slug, :name) RETURNING id`, { replacements: { slug, name: `MFA ${key}` } });
      t[key] = { id: row.id, slug };
    }
    await db.query(`INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, 'auth.mfa', true)`, { replacements: { t: t.a.id } });
    for (const [key, tenant, role] of [['hr', 'a', 'hr_admin'], ['dimas', 'a', 'learner'], ['hrb', 'b', 'hr_admin'], ['budi', 'b', 'learner']]) {
      const [[row]] = await db.query(
        `INSERT INTO users (tenant_id, email, name, role, status) VALUES (:t, :email, :key, :role, 'active') RETURNING id`,
        { replacements: { t: t[tenant].id, email: `${key}@mfa.test`, key, role } },
      );
      u[key] = row.id;
    }
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id IN (:ids)', { replacements: { ids: [t.a.id, t.b.id] }, transaction });
    });
    await db.close();
  });

  let secret;
  it('pendaftaran: secret tersimpan terenkripsi dengan kunci tenant', async () => {
    const tok = await sign('dimas', 'a', 'learner');
    const setup = await request(app).post('/api/auth/mfa/setup').set(bearer(tok));
    expect(setup.status).toBe(200);
    secret = setup.body.data.secret;
    const [[row]] = await db.query('SELECT secret_enc, enabled_at FROM user_mfa WHERE user_id = :id', { replacements: { id: u.dimas } });
    expect(row.secret_enc).not.toContain(secret);
    expect(row.enabled_at).toBeNull();
    expect((await request(app).post('/api/auth/mfa/enable').set(bearer(tok)).send({ code: codeNow(secret, -1) })).status).toBe(200);
  });

  it('tenant tanpa flag auth.mfa tidak bisa mendaftar', async () => {
    const tok = await sign('budi', 'b', 'learner');
    expect((await request(app).post('/api/auth/mfa/setup').set(bearer(tok))).body.error.code).toBe('FEATURE_DISABLED');
  });

  it('link email lalu kode: sesi terbit dengan mfa=true; kode yang sama ditolak kedua kali', async () => {
    await request(app).post('/api/auth/email-link').send({ tenant: t.a.slug, email: 'dimas@mfa.test' });
    const first = await request(app).post('/api/auth/email-link/verify').send({ token: tokenFrom(mailer.sent.at(-1)) });
    expect(first.body).toEqual({ mfaRequired: true, challenge: expect.any(String) });
    const [[stored]] = await db.query('SELECT token_hash FROM auth_mfa_challenges WHERE user_id = :id', { replacements: { id: u.dimas } });
    expect(stored.token_hash).not.toContain(first.body.challenge);

    const code = codeNow(secret);
    const ok = await request(app).post('/api/auth/mfa/verify').send({ challenge: first.body.challenge, code });
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ id: u.dimas, tenantId: t.a.id });
    const [[sess]] = await db.query('SELECT method, mfa FROM auth_sessions WHERE user_id = :id AND mfa', { replacements: { id: u.dimas } });
    expect(sess).toEqual({ method: 'email_link', mfa: true });

    await request(app).post('/api/auth/email-link').send({ tenant: t.a.slug, email: 'dimas@mfa.test' });
    const second = await request(app).post('/api/auth/email-link/verify').send({ token: tokenFrom(mailer.sent.at(-1)) });
    const replay = await request(app).post('/api/auth/mfa/verify').send({ challenge: second.body.challenge, code });
    expect(replay.body.error.code).toBe('MFA_CODE_INVALID');

    const [rows] = await db.query(
      `SELECT resource, meta->>'outcome' AS outcome, meta->>'mfa' AS mfa FROM audit_logs WHERE tenant_id = :t AND user_id = :u AND action = 'login' ORDER BY id`,
      { replacements: { t: t.a.id, u: u.dimas } });
    expect(rows).toEqual([
      { resource: 'auth.attempt', outcome: 'link_sent', mfa: null },
      { resource: 'auth.attempt', outcome: 'mfa_required', mfa: null },
      { resource: 'auth.email_link', outcome: null, mfa: 'true' },
      { resource: 'auth.attempt', outcome: 'link_sent', mfa: null },
      { resource: 'auth.attempt', outcome: 'mfa_required', mfa: null },
      { resource: 'auth.attempt', outcome: 'failed', mfa: null },
    ]);
  });

  it('akun yang dinonaktifkan setelah challenge dibuat tidak mendapat sesi', async () => {
    await request(app).post('/api/auth/email-link').send({ tenant: t.a.slug, email: 'dimas@mfa.test' });
    const { body: { challenge } } = await request(app).post('/api/auth/email-link/verify').send({ token: tokenFrom(mailer.sent.at(-1)) });
    await db.query(`UPDATE users SET status = 'disabled' WHERE id = :id`, { replacements: { id: u.dimas } });
    const r = await request(app).post('/api/auth/mfa/verify').send({ challenge, code: codeNow(secret, 1) });
    expect([r.status, r.body.error.code]).toEqual([401, 'MFA_CHALLENGE_INVALID']);
    await db.query(`UPDATE users SET status = 'active' WHERE id = :id`, { replacements: { id: u.dimas } });
  });

  it('reset oleh HR: hanya di tenant sendiri', async () => {
    const hrB = await sign('hrb', 'b', 'hr_admin');
    expect((await request(app).delete(`/api/sessions/users/${u.dimas}/mfa`).set(bearer(hrB))).status).toBe(404);
    const [[still]] = await db.query('SELECT count(*)::int AS n FROM user_mfa WHERE user_id = :id', { replacements: { id: u.dimas } });
    expect(still.n).toBe(1);
    const hrA = await sign('hr', 'a', 'hr_admin');
    const ok = await request(app).delete(`/api/sessions/users/${u.dimas}/mfa`).set(bearer(hrA));
    expect(ok.body.data.reset).toBe(true);
    const [[gone]] = await db.query('SELECT count(*)::int AS n FROM user_mfa WHERE user_id = :id', { replacements: { id: u.dimas } });
    expect(gone.n).toBe(0);
  });
});
