// B12 tahap 2: sesi diam. Spek: docs/designs/b12-super-admin.md §Sesi diam.
const express = require('express');
const request = require('supertest');
const { createSessionService, memorySessionStore } = require('../../src/core/auth/sessions');
const { requireAuth } = require('../../src/core/auth/middleware');
const { createTokenService } = require('../../src/core/auth/tokens');
const { errorHandler } = require('../../src/core/errors');
const { makeConfig } = require('../helpers');

describe('sesi diam (tahap 2)', () => {
  let clock; let store; let sessions; let tokens; let enabled;
  const user = { id: 'u-1', tenantId: 't-1', role: 'hr_admin', email: 'hr@uji.test' };
  const minutes = (n) => n * 60 * 1000;

  beforeEach(() => {
    clock = new Date('2026-11-23T01:00:00Z');
    store = memorySessionStore({ now: () => clock });
    tokens = createTokenService(makeConfig().jwt);
    enabled = true;
    sessions = createSessionService({
      store, tokens, now: () => clock,
      idle: { minutes: async () => 30, enabled: async (tenantId) => enabled && tenantId === 't-1' },
    });
  });
  const login = async () => tokens.verify((await sessions.issue(user)).token);

  it('aktivitas dalam batas: lolos, dan jam diam disentuh paling sering sekali per 60 detik', async () => {
    const claims = await login();
    const touch = jest.spyOn(store, 'touch');
    clock = new Date(clock.getTime() + minutes(10));
    expect((await sessions.check(claims, { activity: true })).ok).toBe(true);
    clock = new Date(clock.getTime() + 30 * 1000);
    expect((await sessions.check(claims, { activity: true })).ok).toBe(true);
    expect(touch).toHaveBeenCalledTimes(1);
    clock = new Date(clock.getTime() + minutes(29));
    expect((await sessions.check(claims, { activity: true })).ok).toBe(true);
  });

  it('diam lebih lama dari batas dengan flag menyala: SESSION_IDLE dan sesi dicabut dengan alasan idle', async () => {
    const claims = await login();
    clock = new Date(clock.getTime() + minutes(31));
    expect(await sessions.check(claims, { activity: true })).toEqual({ ok: false, code: 'SESSION_IDLE' });
    expect([...store.rows.values()][0]).toMatchObject({ revokeReason: 'idle' });
    expect((await sessions.check(claims, { activity: true })).ok).toBe(false);
  });

  it('flag mati: diam lama tetap lolos', async () => {
    enabled = false;
    const claims = await login();
    clock = new Date(clock.getTime() + minutes(120));
    expect((await sessions.check(claims, { activity: true })).ok).toBe(true);
  });

  it('isActive dan pemeriksaan tanpa aktivitas tidak menyentuh dan tidak mencabut', async () => {
    const claims = await login();
    const touch = jest.spyOn(store, 'touch');
    clock = new Date(clock.getTime() + minutes(31));
    expect(await sessions.isActive(claims)).toBe(true);
    expect(touch).not.toHaveBeenCalled();
    expect([...store.rows.values()][0].revokedAt).toBeNull();
  });

  it('middleware menjawab 401 SESSION_IDLE dengan pesan sendiri', async () => {
    const { token } = await sessions.issue(user);
    const app = express();
    app.get('/x', requireAuth(tokens, { sessions }), (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);
    clock = new Date(clock.getTime() + minutes(31));
    const res = await request(app).get('/x').set('Authorization', `Bearer ${token}`);
    expect([res.status, res.body.error]).toEqual([401, { code: 'SESSION_IDLE', message: 'Sesi berakhir karena tidak aktif. Silakan masuk lagi.' }]);
  });
});
