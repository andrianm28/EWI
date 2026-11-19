const crypto = require('crypto');
const request = require('supertest');
const { createReadiness } = require('../../src/core/health');
const { createFieldCipher, localProvider } = require('../../src/core/crypto');
const { makeConfig, makeStores } = require('../helpers');
const { createApp } = require('../../src/app');

const quiet = { error: () => {} };

describe('PK-07 / I-6 endpoint kesiapan', () => {
  it('siap hanya bila database dan enkripsi lolos', async () => {
    const r = createReadiness({ checks: { database: async () => {}, encryption: async () => {} }, logger: quiet });
    expect(await r()).toEqual({ ok: true, checks: { database: 'ok', encryption: 'ok' } });
  });

  it('gagal bila salah satu pemeriksaan melempar error, tanpa membocorkan pesan error', async () => {
    const r = createReadiness({ checks: { database: async () => { throw new Error('ECONNREFUSED 10.0.0.1'); }, encryption: async () => {} }, logger: quiet });
    const out = await r();
    expect(out).toEqual({ ok: false, checks: { database: 'gagal', encryption: 'ok' } });
    expect(JSON.stringify(out)).not.toContain('ECONNREFUSED');
  });

  it('pemeriksaan wajib yang tidak dirakit dihitung gagal', async () => {
    const r = createReadiness({ checks: { database: async () => {} }, logger: quiet });
    expect(await r()).toEqual({ ok: false, checks: { database: 'ok', encryption: 'tidak_dikonfigurasi' } });
  });

  it('pemeriksaan yang menggantung gagal setelah batas waktu', async () => {
    const r = createReadiness({ checks: { database: () => new Promise(() => {}), encryption: async () => {} }, timeoutMs: 20, logger: quiet });
    expect((await r()).checks.database).toBe('gagal');
  });

  describe('rute', () => {
    const appWith = (stores) => createApp({ config: makeConfig(), stores: { ...makeStores(), ...stores } });

    it('/api/ready 200 bila DB dan enkripsi siap; /api/health tetap ringan', async () => {
      const ping = jest.fn(async () => {});
      const app = appWith({ ping, cipher: { healthCheck: async () => {} } });
      const res = await request(app).get('/api/ready');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ready', checks: { database: 'ok', encryption: 'ok' } });
      expect(res.headers['cache-control']).toBe('no-store');
      ping.mockClear();
      expect((await request(app).get('/api/health')).body.status).toBe('ok');
      expect(ping).not.toHaveBeenCalled();
    });

    it('/api/ready 503 bila database mati', async () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const app = appWith({ ping: async () => { throw new Error('db mati'); }, cipher: { healthCheck: async () => {} } });
      const res = await request(app).get('/api/ready');
      spy.mockRestore();
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ status: 'not_ready', checks: { database: 'gagal', encryption: 'ok' } });
    });

    it('/api/ready 503 bila store tidak menyediakan pemeriksaan (salah rakit)', async () => {
      const res = await request(appWith({})).get('/api/ready');
      expect(res.status).toBe(503);
    });
  });
});

describe('PK-07 healthCheck penyedia enkripsi', () => {
  const master = crypto.randomBytes(32);
  const store = (row) => ({ async any() { return row; }, async get() { return row; }, async insert(_t, r) { return r; } });

  it('lokal tanpa kunci tenant: uji bungkus-buka lolos', async () => {
    const c = createFieldCipher({ provider: localProvider(master), keyStore: store(null) });
    await expect(c.healthCheck()).resolves.toBeUndefined();
  });

  it('membuka DEK tersimpan; kunci induk yang salah terdeteksi', async () => {
    const gen = await localProvider(master).generateDataKey('t-1');
    const row = { tenantId: 't-1', version: 1, keyRef: 'local', wrappedKey: gen.wrapped };
    await expect(createFieldCipher({ provider: localProvider(master), keyStore: store(row) }).healthCheck()).resolves.toBeUndefined();
    await expect(createFieldCipher({ provider: localProvider(crypto.randomBytes(32)), keyStore: store(row) }).healthCheck()).rejects.toThrow();
  });

  it('KMS: memanggil Decrypt pada DEK tersimpan, hasil sukses di-cache 30 detik, kegagalan tidak di-cache', async () => {
    let t = 0;
    const decryptDataKey = jest.fn(async () => Buffer.alloc(32));
    const provider = { name: 'kms', keyRef: () => 'alias/x', generateDataKey: jest.fn(), decryptDataKey };
    const c = createFieldCipher({ provider, keyStore: store({ tenantId: 't-1', version: 1, keyRef: 'arn:k', wrappedKey: 'w' }), now: () => t });
    await c.healthCheck();
    await c.healthCheck();
    expect(decryptDataKey).toHaveBeenCalledTimes(1);
    expect(decryptDataKey).toHaveBeenCalledWith('t-1', 'w', 'arn:k');
    t += 31 * 1000;
    decryptDataKey.mockRejectedValueOnce(new Error('AccessDenied'));
    await expect(c.healthCheck()).rejects.toThrow('AccessDenied');
    await c.healthCheck();
    expect(decryptDataKey).toHaveBeenCalledTimes(3);
  });

  it('KMS tanpa kunci tenant: siap tanpa memanggil KMS', async () => {
    const provider = { name: 'kms', keyRef: () => 'a', generateDataKey: jest.fn(), decryptDataKey: jest.fn() };
    await createFieldCipher({ provider, keyStore: store(null) }).healthCheck();
    expect(provider.generateDataKey).not.toHaveBeenCalled();
    expect(provider.decryptDataKey).not.toHaveBeenCalled();
  });
});
