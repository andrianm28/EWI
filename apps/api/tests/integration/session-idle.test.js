// B12 tahap 2: sesi diam di Postgres (last_seen_at, flag auth.session_idle, heartbeat). Spek §Sesi diam.
const request = require('supertest');
const { createDb } = require('../../src/db');
const { createStores } = require('../../src/db/stores');
const { createApp } = require('../../src/app');
const { makeConfig, sessionSigner } = require('../helpers');

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('B12 sesi diam (Postgres)', () => {
  let db; let app; let tokens; let tenantId; let userId;
  const stamp = Date.now();
  const sel = (sql, replacements = {}) => db.query(sql, { replacements, type: 'SELECT' });
  const sidOf = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sid;
  const setFlag = (enabled) => db.query(
    `INSERT INTO feature_flags (tenant_id, key, enabled) VALUES (:t, 'auth.session_idle', :enabled)
     ON CONFLICT (tenant_id, key) DO UPDATE SET enabled = EXCLUDED.enabled`, { replacements: { t: tenantId, enabled } });
  const age = (sid, minutes) => db.query(`UPDATE auth_sessions SET last_seen_at = now() - make_interval(mins => :m) WHERE id = :sid`,
    { replacements: { sid, m: minutes } });
  const login = () => tokens.sign({ id: userId, tenantId, role: 'hr_admin', email: `hr-${stamp}@idle.test` });
  const me = (token) => request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const config = makeConfig();
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    const stores = createStores(db, { encryption: config.encryption });
    app = createApp({ config, stores });
    tokens = sessionSigner(config, stores.authSessions);
    [{ id: tenantId }] = await sel('INSERT INTO tenants (slug, name) VALUES (:s, :s) RETURNING id', { s: `idle-${stamp}` });
    [{ id: userId }] = await sel(`INSERT INTO users (tenant_id, email, role, status) VALUES (:t, :e, 'hr_admin', 'active') RETURNING id`,
      { t: tenantId, e: `hr-${stamp}@idle.test` });
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id = :t', { replacements: { t: tenantId }, transaction });
    });
    await db.close();
  });

  it('flag menyala dan diam melewati batas (bawaan 30 menit): 401 SESSION_IDLE, sesi dicabut idle', async () => {
    await setFlag(true);
    const token = await login();
    await age(sidOf(token), 31);
    const res = await me(token);
    expect([res.status, res.body.error.code]).toEqual([401, 'SESSION_IDLE']);
    expect(await sel('SELECT revoke_reason AS r FROM auth_sessions WHERE id = :sid', { sid: sidOf(token) })).toEqual([{ r: 'idle' }]);
  });

  it('flag mati: diam lama tetap lolos dan jam diam disentuh', async () => {
    await setFlag(false);
    const token = await login();
    await age(sidOf(token), 120);
    expect((await me(token)).status).toBe(200);
    const [{ quiet }] = await sel(`SELECT extract(epoch FROM now() - last_seen_at)::int AS quiet FROM auth_sessions WHERE id = :sid`, { sid: sidOf(token) });
    expect(quiet).toBeLessThan(5);
  });

  it('heartbeat 204 menyentuh jam diam', async () => {
    await setFlag(true);
    const token = await login();
    await age(sidOf(token), 10);
    expect((await request(app).post('/api/sessions/heartbeat').set('Authorization', `Bearer ${token}`)).status).toBe(204);
    const [{ quiet }] = await sel(`SELECT extract(epoch FROM now() - last_seen_at)::int AS quiet FROM auth_sessions WHERE id = :sid`, { sid: sidOf(token) });
    expect(quiet).toBeLessThan(5);
  });
});
