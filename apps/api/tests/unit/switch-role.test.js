// B2: peran aktif per sesi dan ganti tampilan (store in-memory).
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../src/app');
const { memoryAuditStore } = require('../../src/core/audit');
const { memorySessionStore } = require('../../src/core/auth/sessions');
const { makeConfig, makeStores, TEST_PASSWORD } = require('../helpers');

const bearer = (t) => ({ Authorization: `Bearer ${t}` });

function build({ multi = true, accounts = {} } = {}) {
  const flags = { 't-1': { 'auth.multi_role': multi, 'module.tna': true }, 't-0': { 'auth.multi_role': multi } };
  const stores = {
    ...makeStores({ flags, entitlements: { 't-1': ['tna'] } }), audit: memoryAuditStore(),
    authSessions: memorySessionStore({ accountOf: (id) => accounts[id] }),
  };
  return { app: createApp({ config: makeConfig(), stores }), stores, accounts };
}
const login = async (app, email = 'hr@elgos.test') =>
  (await request(app).post('/api/auth/login').send({ tenant: 'elgos', email, password: TEST_PASSWORD })).body.token;
const switchTo = (app, token, role) => request(app).post('/api/auth/switch-role').set(bearer(token)).send({ role });
const access = async (app, token) => (await request(app).get('/api/me/access').set(bearer(token))).body;

describe('ganti tampilan', () => {
  it('HR pindah ke tampilan Karyawan: peran, menu, dan cakupan ikut berubah; token lama tidak berlaku', async () => {
    const { app, stores } = build();
    const hr = await login(app);
    const before = await access(app, hr);
    expect(before).toMatchObject({ role: 'hr_admin', view: 'hr', home: 'dash' });
    expect(before.roles).toEqual([{ role: 'hr_admin', view: 'hr', label: 'HR / L&D' }, { role: 'learner', view: 'karyawan', label: 'Karyawan (saya)' }]);
    expect(before.menu.map((m) => m.key)).toContain('tna');

    const sw = await switchTo(app, hr, 'learner');
    expect(sw.status).toBe(200);
    expect(sw.body.user).toMatchObject({ id: 'u-hr', role: 'learner', view: 'karyawan', primaryRole: 'hr_admin', roles: ['hr_admin', 'learner'] });
    const after = await access(app, sw.body.token);
    expect(after).toMatchObject({ role: 'learner', view: 'karyawan', home: 'my' });
    expect(after.menu.map((m) => m.key)).toEqual(['my', 'aiv', 'iv', 'li']);
    // rute khusus HR kini menolak (requireRole membaca peran aktif)
    expect((await request(app).post('/api/sessions/users/u-l/revoke').set(bearer(sw.body.token))).status).toBe(403);

    const old = await request(app).get('/api/auth/me').set(bearer(hr));
    expect([old.status, old.body.error.code]).toEqual([401, 'ROLE_VIEW_CHANGED']);
    expect(stores.audit.rows.find((r) => r.resource === 'auth.role_view')).toMatchObject({ action: 'update', userId: 'u-hr', meta: { from: 'hr_admin', to: 'learner' } });
  });

  it('A→B→A: token A yang pertama tetap tidak berlaku, dan masa sesi tidak bertambah', async () => {
    const { app } = build();
    const a1 = await login(app);
    const b = (await switchTo(app, a1, 'learner')).body.token;
    const a2 = (await switchTo(app, b, 'hr_admin')).body.token;
    expect((await request(app).get('/api/auth/me').set(bearer(a1))).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(bearer(b))).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(bearer(a2))).body.user.role).toBe('hr_admin');
    expect(jwt.decode(a2).exp).toBe(jwt.decode(a1).exp);
    expect(jwt.decode(a2)).toMatchObject({ sid: jwt.decode(a1).sid, rv: 2, role: 'hr_admin' });
  });

  it('peran yang tidak dimiliki dan Super Admin ditolak; peran yang sedang aktif = tanpa perubahan', async () => {
    const { app, stores } = build();
    const hr = await login(app);
    const same = await switchTo(app, hr, 'hr_admin');
    expect([same.status, same.body.token, same.body.user.role]).toEqual([200, hr, 'hr_admin']);
    expect(stores.audit.rows.filter((r) => r.resource === 'auth.role_view')).toHaveLength(0);
    for (const role of ['tenant_admin', 'eta_admin', '', 'ngawur']) {
      const r = await switchTo(app, hr, role);
      expect([r.status, r.body.error.code]).toEqual([403, 'ROLE_NOT_ASSIGNED']);
    }
    const l = await login(app, 'agent@elgos.test');
    expect((await switchTo(app, l, 'hr_admin')).status).toBe(403);
    expect((await access(app, l)).roles).toEqual([{ role: 'learner', view: 'karyawan', label: 'Karyawan' }]);
  });

  it('flag auth.multi_role mati: hanya peran utama, switch-role 403 FEATURE_DISABLED', async () => {
    const { app } = build({ multi: false });
    const hr = await login(app);
    expect((await access(app, hr)).roles).toEqual([{ role: 'hr_admin', view: 'hr', label: 'HR / L&D' }]);
    expect((await switchTo(app, hr, 'learner')).body.error.code).toBe('FEATURE_DISABLED');
  });

  it('akun dengan peran tambahan di user_roles bisa memilihnya; peran yang dicabut langsung kehilangan akses', async () => {
    const accounts = { 'u-hr': { primaryRole: 'hr_admin', roles: ['hr_admin', 'tenant_admin'] } };
    const { app } = build({ accounts });
    const hr = await login(app);
    const admin = (await switchTo(app, hr, 'tenant_admin')).body.token;
    expect((await access(app, admin)).menu.map((m) => m.key)).toEqual(['users', 'jobs', 'cfg']);
    accounts['u-hr'] = { primaryRole: 'hr_admin', roles: ['hr_admin'] };
    expect((await request(app).get('/api/auth/me').set(bearer(admin))).status).toBe(401);
  });

  it('token tanpa sesi yang cocok perannya ditolak (klaim role dipalsukan lewat sesi lain)', async () => {
    const { app, stores } = build();
    const l = await login(app, 'agent@elgos.test');
    const sid = jwt.decode(l).sid;
    stores.authSessions.rows.get(sid).activeRole = 'hr_admin'; // peran aktif yang tidak dimiliki akun
    expect((await request(app).get('/api/auth/me').set(bearer(l))).status).toBe(401);
  });
});

describe('review diff egm: ganti tampilan bersamaan', () => {
  it('dua tab memakai token yang sama: satu berhasil, yang kalah dapat ROLE_VIEW_CHANGED, bukan ROLE_NOT_ASSIGNED', async () => {
    const { app } = build({ accounts: { 'u-hr': { primary: 'hr_admin', roles: ['hr_admin', 'learner', 'supervisor'] } } });
    const hr = await login(app);
    const [a, b] = await Promise.all([switchTo(app, hr, 'learner'), switchTo(app, hr, 'supervisor')]);
    // Yang kalah ditolak di requireAuth (401) atau di penggantian atomik (409); kodenya selalu ROLE_VIEW_CHANGED
    const loser = [a, b].find((r) => r.status !== 200);
    expect([a, b].filter((r) => r.status === 200)).toHaveLength(1);
    expect([401, 409]).toContain(loser.status);
    expect(loser.body.error.code).toBe('ROLE_VIEW_CHANGED');
  });
});
