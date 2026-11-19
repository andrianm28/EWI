const request = require('supertest');
const { makeApp, TEST_PASSWORD } = require('../helpers');

async function tokenFor(app, email = 'hr@elgos.test', tenant = 'elgos') {
  const res = await request(app).post('/api/auth/login').send({ tenant, email, password: TEST_PASSWORD });
  return res.body.token;
}

describe('entitlement + feature flag gating', () => {
  it('menolak submodul tanpa entitlement', async () => {
    const app = makeApp({ flags: { 't-1': { 'module.tna': true } } });
    const res = await request(app).get('/api/tna').set('Authorization', `Bearer ${await tokenFor(app)}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_ENTITLED');
  });

  it('menolak submodul yang dibeli tetapi flag-nya mati', async () => {
    const app = makeApp({ entitlements: { 't-1': ['tna'] } });
    const res = await request(app).get('/api/tna').set('Authorization', `Bearer ${await tokenFor(app)}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FEATURE_DISABLED');
  });

  it('membuka submodul bila entitlement dan flag sama-sama aktif', async () => {
    const app = makeApp({ entitlements: { 't-1': ['tna'] }, flags: { 't-1': { 'module.tna': true } } });
    const res = await request(app).get('/api/tna').set('Authorization', `Bearer ${await tokenFor(app)}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ module: 'tna', tenantId: 't-1' });
  });

  it('full_suite membuka semua submodul (B14)', async () => {
    const app = makeApp({ entitlements: { 't-1': ['full_suite'] }, flags: { 't-1': { 'module.dna': true } } });
    const token = await tokenFor(app);
    const access = await request(app).get('/api/me/access').set('Authorization', `Bearer ${token}`);
    expect(access.body.submodules).toEqual(['cca', 'dna', 'tna', 'ina', 'li', 'ld']);
    expect(access.body.flags['module.dna']).toBe(true);
    expect(access.body.flags['module.ina']).toBe(false);
  });

  it('/me/access mengirim produk entitlement aktif, untuk gerbang modul 2–5 di menu web', async () => {
    let app = makeApp({ entitlements: { 't-1': ['full_suite'] } });
    let access = await request(app).get('/api/me/access').set('Authorization', `Bearer ${await tokenFor(app)}`);
    expect(access.body.products).toEqual(['full_suite']);
    app = makeApp({ entitlements: { 't-1': ['tna', 'dna'], 't-2': ['full_suite'] } });
    access = await request(app).get('/api/me/access').set('Authorization', `Bearer ${await tokenFor(app)}`);
    expect(access.body.products).toEqual(['dna', 'tna']);
    // Tanpa entitlement aktif: daftar kosong, bukan field hilang (web gagal-tertutup pada keduanya)
    app = makeApp({ entitlements: { 't-2': ['full_suite'] } });
    access = await request(app).get('/api/me/access').set('Authorization', `Bearer ${await tokenFor(app)}`);
    expect(access.body.products).toEqual([]);
  });

  it.each([['li', 'module.li'], ['ld', 'module.ld']])('modul %s (B13/B14) butuh full_suite dan flag-nya', async (mod, flagKey) => {
    let app = makeApp({ entitlements: { 't-1': ['tna', 'dna'] }, flags: { 't-1': { [flagKey]: true } } });
    let res = await request(app).get(`/api/${mod}`).set('Authorization', `Bearer ${await tokenFor(app)}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_ENTITLED');
    app = makeApp({ entitlements: { 't-1': ['full_suite'] } });
    res = await request(app).get(`/api/${mod}`).set('Authorization', `Bearer ${await tokenFor(app)}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FEATURE_DISABLED');
    app = makeApp({ entitlements: { 't-1': ['full_suite'] }, flags: { 't-1': { [flagKey]: true } } });
    res = await request(app).get(`/api/${mod}`).set('Authorization', `Bearer ${await tokenFor(app)}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ module: mod, tenantId: 't-1' });
  });

  it.each(['li', 'ld'])('modul %s hanya untuk HR, learner ditolak walau tenant berhak', async (mod) => {
    const app = makeApp({ entitlements: { 't-1': ['full_suite'] }, flags: { 't-1': { [`module.${mod}`]: true } } });
    const res = await request(app).get(`/api/${mod}`).set('Authorization', `Bearer ${await tokenFor(app, 'agent@elgos.test')}`);
    expect(res.status).toBe(403);
  });

  it('entitlement tenant lain tidak bocor', async () => {
    const app = makeApp({ entitlements: { 't-2': ['full_suite'] }, flags: { 't-2': { 'module.dna': true } } });
    const res = await request(app).get('/api/dna').set('Authorization', `Bearer ${await tokenFor(app)}`);
    expect(res.status).toBe(403);
  });
});

describe('projects', () => {
  it('HR bisa membuat proyek, learner tidak', async () => {
    const app = makeApp();
    const hr = await tokenFor(app);
    const learner = await tokenFor(app, 'agent@elgos.test');
    const created = await request(app).post('/api/projects').set('Authorization', `Bearer ${hr}`).send({ name: 'TNA L1 Des 2026' });
    expect(created.status).toBe(201);
    const denied = await request(app).post('/api/projects').set('Authorization', `Bearer ${learner}`).send({ name: 'x' });
    expect(denied.status).toBe(403);
  });

  it('daftar proyek hanya milik tenant sendiri', async () => {
    const app = makeApp();
    await request(app).post('/api/projects').set('Authorization', `Bearer ${await tokenFor(app)}`).send({ name: 'Proyek ELGOS' });
    const other = await tokenFor(app, 'hr@other.test', 'other');
    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${other}`);
    expect(res.body.data).toEqual([]);
  });
});
