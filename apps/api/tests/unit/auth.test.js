const request = require('supertest');
const jwt = require('jsonwebtoken');
const { makeApp, SECRET, TEST_PASSWORD } = require('../helpers');

describe('auth', () => {
  const app = makeApp();

  it('login berhasil mengembalikan token', async () => {
    const res = await request(app).post('/api/auth/login').send({ tenant: 'elgos', email: 'HR@elgos.test', password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: 'hr_admin', tenantId: 't-1' });
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('password salah ditolak', async () => {
    const res = await request(app).post('/api/auth/login').send({ tenant: 'elgos', email: 'hr@elgos.test', password: 'salah' });
    expect(res.status).toBe(401);
  });

  it('user tenant lain tidak bisa login lewat slug tenant ini', async () => {
    const res = await request(app).post('/api/auth/login').send({ tenant: 'elgos', email: 'hr@other.test', password: TEST_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('endpoint terlindungi menolak tanpa token', async () => {
    expect((await request(app).get('/api/me/access')).status).toBe(401);
  });

  it('token dengan audience lain (mis. token LTI EliteMentor) ditolak', async () => {
    const t = jwt.sign({ tid: 't-1', role: 'hr_admin' }, SECRET, { subject: 'u-hr', audience: 'lti', issuer: 'ewi-api' });
    expect((await request(app).get('/api/me/access').set('Authorization', `Bearer ${t}`)).status).toBe(401);
  });
});

describe('GET /api/auth/tenants (pilihan organisasi di login)', () => {
  const request = require('supertest');
  const { makeApp } = require('../helpers');

  it('mati secara default (daftar klien tidak terbuka publik)', async () => {
    const res = await request(makeApp()).get('/api/auth/tenants');
    expect(res.status).toBe(404);
  });

  it('menyala dengan LOGIN_TENANT_PICKER=true, hanya slug dan nama', async () => {
    const res = await request(makeApp({}, { LOGIN_TENANT_PICKER: 'true' })).get('/api/auth/tenants');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ slug: 'elgos', name: 'ELGOS' }, { slug: 'other', name: 'Lain' }]);
  });
});
