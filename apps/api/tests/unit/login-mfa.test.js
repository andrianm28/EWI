// B1: verifikasi dua langkah, kerangka SSO, dan audit percobaan masuk (store in-memory).
const request = require('supertest');
const { createApp, defaultRateLimits } = require('../../src/app');
const { memoryAuditStore } = require('../../src/core/audit');
const { memorySessionStore } = require('../../src/core/auth/sessions');
const { memoryMfaStore } = require('../../src/core/auth/mfa');
const totp = require('../../src/core/auth/totp');
const { makeConfig, makeStores, TEST_PASSWORD } = require('../helpers');

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

function build({ flags = { 't-1': { 'auth.mfa': true } }, clock } = {}) {
  const now = clock || (() => Date.now());
  const stores = { ...makeStores({ flags }), audit: memoryAuditStore(), authSessions: memorySessionStore(), mfa: memoryMfaStore({ now }) };
  delete stores.cipher;
  const app = createApp({ config: makeConfig(), stores, rateLimits: defaultRateLimits() });
  return { app, stores };
}
const login = (app, email = 'hr@elgos.test', password = TEST_PASSWORD) =>
  request(app).post('/api/auth/login').send({ tenant: 'elgos', email, password });
const codeNow = (secret, offset = 0) => totp.codeAt(secret, Math.floor(Date.now() / 30000) + offset);
const attemptsOf = (stores) => stores.audit.rows.filter((r) => r.resource === 'auth.attempt').map((r) => [r.userId, r.meta.method, r.meta.outcome]);

/** Masuk, daftar MFA, aktifkan. Return { secret, token }. */
async function enroll(app, email = 'hr@elgos.test') {
  const { body: { token } } = await login(app, email);
  const setup = await request(app).post('/api/auth/mfa/setup').set(bearer(token));
  expect(setup.status).toBe(200);
  const { secret } = setup.body.data;
  const on = await request(app).post('/api/auth/mfa/enable').set(bearer(token)).send({ code: codeNow(secret, -1) });
  expect(on.status).toBe(200);
  return { secret, token };
}

describe('pendaftaran MFA', () => {
  it('flag mati: setup dan enable ditolak, status available=false', async () => {
    const { app } = build({ flags: {} });
    const { body: { token } } = await login(app);
    expect((await request(app).get('/api/auth/mfa').set(bearer(token))).body.data).toEqual({ available: false, enabled: false, pending: false });
    const setup = await request(app).post('/api/auth/mfa/setup').set(bearer(token));
    expect([setup.status, setup.body.error.code]).toEqual([403, 'FEATURE_DISABLED']);
    expect((await request(app).post('/api/auth/mfa/enable').set(bearer(token)).send({ code: '123456' })).status).toBe(403);
  });

  it('setup memberi secret + otpauth, enable butuh kode benar, lalu tercatat audit', async () => {
    const { app, stores } = build();
    const { body: { token } } = await login(app);
    expect((await request(app).post('/api/auth/mfa/enable').set(bearer(token)).send({ code: '000000' })).body.error.code).toBe('MFA_NOT_PENDING');
    const { body: { data } } = await request(app).post('/api/auth/mfa/setup').set(bearer(token));
    expect(data.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(data.otpauthUrl).toContain('hr%40elgos.test');
    const wrong = codeNow(data.secret) === '000000' ? '000001' : '000000';
    const bad = await request(app).post('/api/auth/mfa/enable').set(bearer(token)).send({ code: wrong });
    expect([bad.status, bad.body.error.code]).toEqual([401, 'MFA_CODE_INVALID']);
    expect((await request(app).post('/api/auth/mfa/enable').set(bearer(token)).send({ code: codeNow(data.secret) })).status).toBe(200);
    expect((await request(app).get('/api/auth/mfa').set(bearer(token))).body.data).toEqual({ available: true, enabled: true, pending: false });
    expect((await request(app).post('/api/auth/mfa/setup').set(bearer(token))).body.error.code).toBe('MFA_ALREADY_ENABLED');
    expect(stores.audit.rows.filter((r) => r.resource === 'auth.mfa').map((r) => [r.action, r.userId, r.meta.enabled])).toEqual([['update', 'u-hr', true]]);
  });

  it('mematikan MFA sendiri butuh kode benar', async () => {
    const { app } = build();
    const { secret, token } = await enroll(app);
    expect((await request(app).delete('/api/auth/mfa').set(bearer(token)).send({})).status).toBe(400);
    expect((await request(app).delete('/api/auth/mfa').set(bearer(token)).send({ code: codeNow(secret, -1) })).status).toBe(401); // sudah dipakai
    expect((await request(app).delete('/api/auth/mfa').set(bearer(token)).send({ code: codeNow(secret) })).status).toBe(200);
    expect((await login(app)).body.token).toBeTruthy();
  });
});

describe('review diff egm: penguatan MFA', () => {
  it('mematikan dan mengaktifkan MFA dibatasi per akun dan kegagalannya dicatat', async () => {
    const { app, stores } = build();
    const { secret, token } = await enroll(app);
    const wrong = codeNow(secret, 1) === '000000' ? '000001' : '000000';
    for (let i = 0; i < 10; i += 1) await request(app).delete('/api/auth/mfa').set(bearer(token)).send({ code: wrong }).expect(401);
    const r = await request(app).delete('/api/auth/mfa').set(bearer(token)).send({ code: codeNow(secret, 1) });
    expect(r.status).toBe(429);
    expect(attemptsOf(stores).filter(([, m, o]) => m === 'mfa_disable' && o === 'failed')).toHaveLength(10);
  });

  it('mengaktifkan MFA mencabut sesi lain akun itu, sesi yang dipakai tetap hidup', async () => {
    const { app } = build();
    const { body: { token: other } } = await login(app);
    const { token } = await enroll(app);
    expect((await request(app).get('/api/auth/me').set(bearer(other))).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(bearer(token))).status).toBe(200);
  });
});

describe('login dengan langkah kedua', () => {
  it('akun dengan MFA aktif: login menjawab challenge, bukan token; kode benar menerbitkan sesi mfa', async () => {
    const { app, stores } = build();
    const { secret } = await enroll(app);
    const first = await login(app);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ mfaRequired: true, challenge: expect.any(String) });
    const ok = await request(app).post('/api/auth/mfa/verify').send({ challenge: first.body.challenge, code: codeNow(secret) });
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ id: 'u-hr', role: 'hr_admin' });
    expect((await request(app).get('/api/auth/me').set(bearer(ok.body.token))).status).toBe(200);
    const mine = await request(app).get('/api/sessions/mine').set(bearer(ok.body.token));
    expect(mine.body.data.find((s) => s.current)).toMatchObject({ method: 'password', mfa: true });
    expect(attemptsOf(stores)).toContainEqual(['u-hr', 'password', 'mfa_required']);
    expect(stores.audit.rows.filter((r) => r.resource === 'auth.password').map((r) => r.meta.mfa)).toEqual([false, true]);
  });

  it('challenge sekali pakai dan kode yang sama tidak bisa dipakai dua kali', async () => {
    const { app } = build();
    const { secret } = await enroll(app);
    const a = (await login(app)).body.challenge;
    const b = (await login(app)).body.challenge;
    const code = codeNow(secret);
    expect((await request(app).post('/api/auth/mfa/verify').send({ challenge: a, code })).status).toBe(200);
    const again = await request(app).post('/api/auth/mfa/verify').send({ challenge: a, code: codeNow(secret, 1) });
    expect([again.status, again.body.error.code]).toEqual([401, 'MFA_CHALLENGE_INVALID']);
    const replay = await request(app).post('/api/auth/mfa/verify').send({ challenge: b, code });
    expect([replay.status, replay.body.error.code]).toEqual([401, 'MFA_CODE_INVALID']);
  });

  it('kode salah dicatat; setelah 5 percobaan challenge hangus', async () => {
    const { app, stores } = build();
    const { secret } = await enroll(app);
    const { challenge } = (await login(app)).body;
    const wrong = codeNow(secret, 1) === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i += 1) {
      const r = await request(app).post('/api/auth/mfa/verify').send({ challenge, code: wrong });
      expect(r.body.error.code).toBe('MFA_CODE_INVALID');
    }
    const dead = await request(app).post('/api/auth/mfa/verify').send({ challenge, code: codeNow(secret, 1) });
    expect(dead.body.error.code).toBe('MFA_CHALLENGE_INVALID');
    expect(attemptsOf(stores).filter((a) => a[1] === 'mfa')).toHaveLength(5);
  });

  it('challenge kedaluwarsa setelah 5 menit dan challenge asal ditolak', async () => {
    let t = Date.now();
    const { app } = build({ clock: () => t });
    const { secret } = await enroll(app);
    const { challenge } = (await login(app)).body;
    t += 6 * 60 * 1000;
    const late = await request(app).post('/api/auth/mfa/verify').send({ challenge, code: totp.codeAt(secret, Math.floor(t / 30000)) });
    expect(late.body.error.code).toBe('MFA_CHALLENGE_INVALID');
    expect((await request(app).post('/api/auth/mfa/verify').send({ challenge: 'x'.repeat(43), code: '123456' })).body.error.code).toBe('MFA_CHALLENGE_INVALID');
    expect((await request(app).post('/api/auth/mfa/verify').send({})).status).toBe(401);
  });

  it('akun yang sudah aktif tetap ditantang walau flag auth.mfa dimatikan', async () => {
    const flags = { 't-1': { 'auth.mfa': true } };
    const { app } = build({ flags });
    await enroll(app);
    flags['t-1']['auth.mfa'] = false;
    expect((await login(app)).body.mfaRequired).toBe(true);
  });

  it('batas kegagalan per akun: 10 kode salah lalu 429 walau challenge baru', async () => {
    const { app } = build();
    const { secret } = await enroll(app);
    const wrong = codeNow(secret, 1) === '000000' ? '000001' : '000000';
    for (let c = 0; c < 2; c += 1) {
      const { challenge } = (await login(app)).body;
      for (let i = 0; i < 5; i += 1) await request(app).post('/api/auth/mfa/verify').send({ challenge, code: wrong });
    }
    const { challenge } = (await login(app)).body;
    const r = await request(app).post('/api/auth/mfa/verify').send({ challenge, code: codeNow(secret, 1) });
    expect(r.status).toBe(429);
  });
});

describe('reset MFA oleh admin (pemulihan)', () => {
  it('HR mereset akun lain di tenantnya: MFA hilang, sesi dicabut, tercatat audit', async () => {
    const { app, stores } = build();
    const { token: learnerTok } = await enroll(app, 'agent@elgos.test');
    const { body: { token: hr } } = await login(app);
    const r = await request(app).delete('/api/sessions/users/u-l/mfa').set(bearer(hr));
    expect(r.body.data).toEqual({ reset: true, sessionsRevoked: 1 });
    expect((await request(app).get('/api/auth/me').set(bearer(learnerTok))).status).toBe(401);
    expect((await login(app, 'agent@elgos.test')).body.token).toBeTruthy();
    expect(stores.audit.rows.find((x) => x.resource === 'auth.mfa' && x.action === 'delete')).toMatchObject({ userId: 'u-hr', meta: { reason: 'admin_reset', employeeIds: ['u-l'] } });
  });

  it('HR tidak bisa mereset MFA Admin ETA atau Admin Tenant', async () => {
    const { app, stores } = build();
    stores.users.all.push(
      { id: 'u-ta', tenantId: 't-1', tenantSlug: 'elgos', email: 'ta@elgos.test', name: 'TA', role: 'tenant_admin' },
      { id: 'u-e1', tenantId: 't-1', tenantSlug: 'elgos', email: 'eta1@elgos.test', name: 'ETA', role: 'eta_admin' },
    );
    const { body: { token: hr } } = await login(app);
    const a = await request(app).delete('/api/sessions/users/u-ta/mfa').set(bearer(hr));
    const b = await request(app).delete('/api/sessions/users/u-e1/mfa').set(bearer(hr));
    expect([a.status, a.body.error.code, b.status, b.body.error.code]).toEqual([403, 'ROLE_PROTECTED', 403, 'ROLE_PROTECTED']);
  });

  it('Super Admin bisa mereset MFA Admin Tenant (jalan pulih bila Admin Tenant tunggal kehilangan autentikator)', async () => {
    const { canResetMfa } = require('../../src/core/rbac/roles');
    expect(canResetMfa('eta_admin', ['tenant_admin'])).toBe(true);
    expect(canResetMfa('tenant_admin', ['tenant_admin', 'learner'])).toBe(true);
    expect(canResetMfa('hr_admin', ['learner', 'tenant_admin'])).toBe(false);
    expect(canResetMfa('eta_admin', ['eta_admin'])).toBe(false);
    expect(canResetMfa('hr_admin', ['supervisor'])).toBe(true);
  });

  it('tidak bisa untuk diri sendiri, akun tenant lain, atau oleh karyawan', async () => {
    const { app } = build();
    const { body: { token: hr } } = await login(app);
    expect((await request(app).delete('/api/sessions/users/u-hr/mfa').set(bearer(hr))).body.error.code).toBe('SELF_MFA_RESET');
    expect((await request(app).delete('/api/sessions/users/u-x/mfa').set(bearer(hr))).status).toBe(404);
    const { body: { token: l } } = await login(app, 'agent@elgos.test');
    expect((await request(app).delete('/api/sessions/users/u-hr/mfa').set(bearer(l))).status).toBe(403);
  });
});

describe('metode masuk dan kerangka SSO', () => {
  it('/methods: sso hanya true untuk organisasi dikenal dengan flag menyala', async () => {
    const { app } = build({ flags: { 't-1': { 'auth.sso': true } } });
    expect((await request(app).get('/api/auth/methods')).body).toEqual({ password: true, emailLink: true, sso: false });
    expect((await request(app).get('/api/auth/methods?tenant=elgos')).body.sso).toBe(true);
    expect((await request(app).get('/api/auth/methods?tenant=other')).body.sso).toBe(false);
    expect((await request(app).get('/api/auth/methods?tenant=tidak-ada')).body.sso).toBe(false);
  });

  it('/sso/start: 404 bila flag mati atau organisasi tak dikenal, 501 + audit bila flag menyala', async () => {
    const { app, stores } = build({ flags: { 't-1': { 'auth.sso': true } } });
    for (const tenant of ['other', 'tidak-ada', undefined]) {
      const r = await request(app).post('/api/auth/sso/start').send({ tenant });
      expect([r.status, r.body.error.code]).toEqual([404, 'SSO_UNAVAILABLE']);
    }
    const r = await request(app).post('/api/auth/sso/start').send({ tenant: 'elgos' });
    expect([r.status, r.body.error.code]).toEqual([501, 'SSO_NOT_CONFIGURED']);
    expect(stores.audit.rows.map((x) => [x.tenantId, x.userId, x.resource, x.meta.method, x.meta.outcome])).toEqual([['t-1', null, 'auth.attempt', 'sso', 'not_configured']]);
  });
});

describe('audit percobaan masuk', () => {
  it('sandi salah untuk akun dikenal dicatat; email atau organisasi tak dikenal tidak', async () => {
    const { app, stores } = build();
    expect((await login(app, 'hr@elgos.test', 'salah')).status).toBe(401);
    expect((await login(app, 'siapa@elgos.test', 'salah')).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ tenant: 'tidak-ada', email: 'hr@elgos.test', password: 'salah' })).status).toBe(401);
    expect(attemptsOf(stores)).toEqual([['u-hr', 'password', 'failed']]);
  });

  it('audit yang gagal ditulis tidak mengubah jawaban kegagalan login', async () => {
    const { app, stores } = build();
    stores.audit.insert = async () => { throw new Error('db mati'); };
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect((await login(app, 'hr@elgos.test', 'salah')).status).toBe(401);
    spy.mockRestore();
  });
});
