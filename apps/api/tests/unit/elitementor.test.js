const request = require('supertest');
const { createApp } = require('../../src/app');
const { makeConfig, makeStores } = require('../helpers');
const { sign, verify } = require('../../src/integrations/elitementor/webhook');
const { createElitementorClient } = require('../../src/integrations/elitementor/client');

describe('webhook EliteMentor', () => {
  const secret = 'whsec-test';
  const events = [];
  const app = createApp({
    config: makeConfig({ ELITEMENTOR_WEBHOOK_SECRET: secret }),
    stores: { ...makeStores(), elitementorEvents: { handle: async (e) => events.push(e) } },
  });

  it('menerima event dengan tanda tangan valid', async () => {
    const body = JSON.stringify({ type: 'program.completed', organizationId: 7, userEmail: 'a@b.test' });
    const ts = String(Math.floor(Date.now() / 1000));
    const res = await request(app).post('/api/integrations/elitementor/webhook')
      .set('Content-Type', 'application/json').set('X-EM-Timestamp', ts).set('X-EM-Signature', sign(secret, ts, body)).send(body);
    expect(res.status).toBe(202);
    expect(events[0].type).toBe('program.completed');
  });

  it('menolak tanda tangan salah', async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const res = await request(app).post('/api/integrations/elitementor/webhook')
      .set('Content-Type', 'application/json').set('X-EM-Timestamp', ts).set('X-EM-Signature', 'ab'.repeat(32)).send('{"x":1}');
    expect(res.status).toBe(401);
  });

  it('menolak timestamp kedaluwarsa (replay)', () => {
    const ts = '1000';
    expect(verify(secret, ts, '{}', sign(secret, ts, '{}'), 1000 + 301)).toBe(false);
  });
});

describe('klien OAuth2 EliteMentor', () => {
  it('meminta token sekali lalu memakai cache', async () => {
    const calls = [];
    const fakeFetch = async (url, init) => {
      calls.push(url);
      if (url.endsWith('/token')) return { ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
      expect(init.headers.Authorization).toBe('Bearer tok');
      expect(init.headers['X-Organization-Id']).toBe('7');
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    const c = createElitementorClient({ baseUrl: 'https://em.test/api', tokenUrl: 'https://em.test/oauth/token', clientId: 'c', clientSecret: 's' }, fakeFetch);
    await c.request('GET', '/programs', { organizationId: 7 });
    await c.request('GET', '/programs', { organizationId: 7 });
    expect(calls.filter((u) => u.endsWith('/token'))).toHaveLength(1);
  });
});
