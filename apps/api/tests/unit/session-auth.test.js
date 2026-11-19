// PK-16 (P1-3, R-11): login password mati di produksi, Admin ETA dibatasi daftar email,
// batas laju per akun dan per IP, sesi bisa dicabut.
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp, defaultRateLimits } = require('../../src/app');
const { createRateLimiter } = require('../../src/core/auth/rate-limit');
const { memorySessionStore } = require('../../src/core/auth/sessions');
const { loadConfig } = require('../../src/config/env');
const { makeConfig, makeStores, TEST_PASSWORD, SECRET } = require('../helpers');

const PROD_ENV = {
  NODE_ENV: 'production', EWI_JWT_SECRET: SECRET, DATABASE_URL: 'postgres://x/y',
  MAIL_PROVIDER: 'ses', MAIL_FROM: 'noreply@elgos.test', ENCRYPTION_PROVIDER: 'kms',
};

function build(env = {}, { stores = makeStores(), rateLimits } = {}) {
  return createApp({ config: makeConfig(env), stores, rateLimits });
}
const login = (app, email = 'hr@elgos.test', password = TEST_PASSWORD, tenant = 'elgos') =>
  request(app).post('/api/auth/login').send({ tenant, email, password });
const bearer = (t) => ({ Authorization: `Bearer ${t}` });
const LOGIN_RESOURCE = ['auth', 'password'].join('.');

describe('PD-10 ★B: login password hanya di luar produksi', () => {
  it('produksi: login password mati, tidak bisa dinyalakan lewat env', () => {
    expect(loadConfig(PROD_ENV).auth.localLogin).toBe(false);
    expect(() => loadConfig({ ...PROD_ENV, AUTH_PASSWORD_LOGIN: 'true' })).toThrow(/AUTH_PASSWORD_LOGIN=true tidak diizinkan di produksi/);
  });

  it('di luar produksi: mati secara default (OTP link), hanya nyala bila dinyalakan eksplisit', () => {
    const base = { NODE_ENV: 'development', EWI_JWT_SECRET: SECRET, DATABASE_URL: 'postgres://x/y', EWI_LOCAL_MASTER_KEY: 'a'.repeat(64) };
    expect(loadConfig(base).auth.localLogin).toBe(false);
    expect(loadConfig({ ...base, AUTH_PASSWORD_LOGIN: 'true' }).auth.localLogin).toBe(true);
    expect(makeConfig({ AUTH_PASSWORD_LOGIN: 'false' }).auth.localLogin).toBe(false);
  });

  it('saat mati: POST /login 404 dan /methods memberi tahu web', async () => {
    const app = build({ AUTH_PASSWORD_LOGIN: 'false' });
    const res = await login(app);
    expect(res.status).toBe(404);
    expect(res.body.error.message).toMatch(/link email/);
    expect((await request(app).get('/api/auth/methods')).body).toEqual({ password: false, emailLink: true, sso: false });
    expect((await request(build()).get('/api/auth/methods')).body).toEqual({ password: true, emailLink: true, sso: false });
  });

  it('TRUST_PROXY divalidasi', () => {
    expect(makeConfig().trustProxy).toBe(false);
    expect(makeConfig({ TRUST_PROXY: '1' }).trustProxy).toBe(1);
    expect(makeConfig({ TRUST_PROXY: 'loopback, 172.16.0.0/12' }).trustProxy).toEqual(['loopback', '172.16.0.0/12']);
    expect(() => makeConfig({ TRUST_PROXY: 'semua' })).toThrow(/TRUST_PROXY/);
  });
});

describe('Admin ETA dibatasi daftar email', () => {
  it('produksi tanpa daftar: tidak ada Admin ETA yang boleh masuk', () => {
    const { auth } = loadConfig(PROD_ENV);
    expect(auth).toMatchObject({ etaAdminRequireList: true, etaAdminEmails: [] });
  });

  it('email di luar daftar ditolak; di dalam daftar boleh', async () => {
    const denied = await login(build({ ETA_ADMIN_EMAILS: 'lain@eta.test' }), 'admin@eta.test', TEST_PASSWORD, 'eta');
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('LOGIN_NOT_ALLOWED');
    const ok = await login(build({ ETA_ADMIN_EMAILS: 'lain@eta.test, ADMIN@eta.test' }), 'admin@eta.test', TEST_PASSWORD, 'eta');
    expect(ok.status).toBe(200);
  });

  it('dicabut dari daftar = sesi yang sudah ada langsung tidak berlaku', async () => {
    const stores = { ...makeStores(), authSessions: memorySessionStore() };
    const before = build({ ETA_ADMIN_EMAILS: 'admin@eta.test' }, { stores });
    const { token } = (await login(before, 'admin@eta.test', TEST_PASSWORD, 'eta')).body;
    expect((await request(before).get('/api/auth/me').set(bearer(token))).status).toBe(200);
    const after = build({ ETA_ADMIN_EMAILS: 'lain@eta.test' }, { stores });
    expect((await request(after).get('/api/auth/me').set(bearer(token))).status).toBe(401);
  });

  it('ETA_ADMIN_EMAILS divalidasi', () => {
    expect(() => makeConfig({ ETA_ADMIN_EMAILS: 'bukan-email' })).toThrow(/ETA_ADMIN_EMAILS/);
  });
});

describe('batas laju login', () => {
  it('per akun: 5 kali gagal dalam 15 menit -> 429, password benar pun ditolak', async () => {
    const app = build();
    for (let i = 0; i < 5; i += 1) expect((await login(app, 'hr@elgos.test', 'salah')).status).toBe(401);
    const blocked = await login(app);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    // akun lain dari IP yang sama tidak ikut terkunci
    expect((await login(app, 'agent@elgos.test')).status).toBe(200);
  });

  it('per akun: login berhasil mengosongkan hitungan gagal', async () => {
    const app = build();
    for (let i = 0; i < 4; i += 1) await login(app, 'hr@elgos.test', 'salah');
    expect((await login(app)).status).toBe(200);
    for (let i = 0; i < 4; i += 1) expect((await login(app, 'hr@elgos.test', 'salah')).status).toBe(401);
  });

  it('per IP: melewati batas -> 429 untuk akun mana pun', async () => {
    const rateLimits = { ...defaultRateLimits(), passwordIp: createRateLimiter({ windowMs: 60000, max: 3 }) };
    const app = build({}, { rateLimits });
    for (let i = 0; i < 3; i += 1) await login(app, `orang${i}@elgos.test`, 'salah');
    expect((await login(app)).status).toBe(429);
  });

  it('jendela berlalu -> boleh mencoba lagi', () => {
    let t = 0;
    const lim = createRateLimiter({ windowMs: 1000, max: 2, now: () => t });
    lim.consume('k'); lim.consume('k');
    expect(() => lim.consume('k')).toThrow(/Terlalu banyak/);
    t = 1001;
    expect(() => lim.consume('k')).not.toThrow();
  });
});

describe('pencabutan sesi', () => {
  it('token tanpa sesi (tanpa sid) ditolak', async () => {
    const t = jwt.sign({ tid: 't-1', role: 'hr_admin', email: 'hr@elgos.test' }, SECRET, { subject: 'u-hr', audience: 'ewi', issuer: 'ewi-api' });
    expect((await request(build()).get('/api/me/access').set(bearer(t))).status).toBe(401);
  });

  it('Keluar mencabut sesi ini saja', async () => {
    const app = build();
    const a = (await login(app)).body.token;
    const b = (await login(app)).body.token;
    expect((await request(app).get('/api/auth/me').set(bearer(a))).body.user).toMatchObject({ id: 'u-hr', tenantId: 't-1', role: 'hr_admin', email: 'hr@elgos.test' });
    expect((await request(app).post('/api/auth/logout').set(bearer(a))).status).toBe(204);
    const gone = await request(app).get('/api/auth/me').set(bearer(a));
    expect(gone.status).toBe(401);
    expect(gone.body.error.message).toBe('Sesi tidak valid atau kedaluwarsa');
    expect((await request(app).get('/api/auth/me').set(bearer(b))).status).toBe(200);
  });

  it('Keluar dari semua perangkat', async () => {
    const app = build();
    const a = (await login(app)).body.token;
    const b = (await login(app)).body.token;
    const mine = await request(app).get('/api/sessions/mine').set(bearer(a));
    expect(mine.body.data).toHaveLength(2);
    expect(mine.body.data.filter((s) => s.current)).toHaveLength(1);
    expect(mine.body.data[0]).toMatchObject({ method: 'password' });
    const res = await request(app).post('/api/auth/logout-all').set(bearer(b));
    expect(res.body.data.revoked).toBe(2);
    for (const t of [a, b]) expect((await request(app).get('/api/auth/me').set(bearer(t))).status).toBe(401);
  });

  it('HR mencabut sesi karyawan di tenantnya; learner tidak boleh; HR tenant lain tidak berpengaruh', async () => {
    const app = build();
    const hr = (await login(app)).body.token;
    const agent = (await login(app, 'agent@elgos.test')).body.token;
    const hrLain = (await login(app, 'hr@other.test', TEST_PASSWORD, 'other')).body.token;

    expect((await request(app).post('/api/sessions/users/u-hr/revoke').set(bearer(agent))).status).toBe(403);
    expect((await request(app).post('/api/sessions/users/u-l/revoke').set(bearer(hrLain))).body.data.revoked).toBe(0);
    expect((await request(app).get('/api/auth/me').set(bearer(agent))).status).toBe(200);

    const res = await request(app).post('/api/sessions/users/u-l/revoke').set(bearer(hr));
    expect(res.status).toBe(200);
    expect(res.body.data.revoked).toBe(1);
    expect((await request(app).get('/api/auth/me').set(bearer(agent))).status).toBe(401);
  });

  it('logout, login, dan pencabutan masuk audit log', async () => {
    const stores = makeStores();
    const { memoryAuditStore } = require('../../src/core/audit');
    stores.audit = memoryAuditStore();
    const app = build({}, { stores });
    const hr = (await login(app)).body.token;
    const agent = (await login(app, 'agent@elgos.test')).body.token;
    await request(app).post('/api/sessions/users/u-l/revoke').set(bearer(hr));
    await request(app).post('/api/auth/logout').set(bearer(hr));
    expect(stores.audit.rows.map((r) => [r.action, r.resource, r.userId, r.meta.reason])).toEqual([
      ['login', LOGIN_RESOURCE, 'u-hr', undefined],
      ['login', LOGIN_RESOURCE, 'u-l', undefined],
      ['delete', 'auth.session', 'u-hr', 'admin_revoke'],
      ['delete', 'auth.session', 'u-hr', 'logout'],
    ]);
    expect(agent).toBeTruthy();
  });
});
