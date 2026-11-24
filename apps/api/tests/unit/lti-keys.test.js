'use strict';
// EM-LTI §4: kunci platform dari env (PEM), kunci sementara di non-produksi, JWKS, tanda tangan RS256.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { loadPlatformKey, createJwksClient } = require('../../src/integrations/elitementor/lti/keys');

const pem = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });

describe('loadPlatformKey', () => {
  test('PEM dari env: JWKS publik, kid stabil, tanda tangan terverifikasi dengan JWK', () => {
    const key = loadPlatformKey({ pem, production: true });
    const again = loadPlatformKey({ pem, production: true });
    expect(key.kid).toBe(again.kid);
    const { keys } = key.jwks();
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({ kty: 'RSA', alg: 'RS256', use: 'sig', kid: key.kid });
    expect(keys[0].d).toBeUndefined();
    const token = key.sign({ sub: 'x', aud: 'a', iss: 'i' }, { expiresIn: 60 });
    expect(jwt.decode(token, { complete: true }).header).toMatchObject({ alg: 'RS256', kid: key.kid });
    const pub = crypto.createPublicKey({ key: keys[0], format: 'jwk' });
    expect(jwt.verify(token, pub, { algorithms: ['RS256'], audience: 'a' }).sub).toBe('x');
    expect(key.verify(token, { audience: 'a' }).sub).toBe('x');
    expect(() => key.verify(token, { audience: 'lain' })).toThrow();
  });
  test('PEM boleh dalam base64 (satu baris di env)', () => {
    expect(loadPlatformKey({ pem: Buffer.from(pem).toString('base64'), production: true }).kid).toBe(loadPlatformKey({ pem, production: true }).kid);
  });
  test('tanpa PEM: sementara di dev, null di produksi', () => {
    const warn = jest.fn();
    expect(loadPlatformKey({ pem: '', production: false, log: warn }).ephemeral).toBe(true);
    expect(warn).toHaveBeenCalled();
    expect(loadPlatformKey({ pem: '', production: true })).toBeNull();
  });
});

describe('createJwksClient', () => {
  const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' };
  const okFetch = (body) => jest.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify(body) }));
  test('mengambil kunci per kid dan memakai cache', async () => {
    const fetchImpl = okFetch({ keys: [jwk] });
    const c = createJwksClient({ fetchImpl });
    const k = await c.getKey('http://tool/keys', 'k1');
    expect(k.asymmetricKeyType).toBe('rsa');
    await c.getKey('http://tool/keys', 'k1');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  test('kid tidak ada: ambil ulang sekali lalu galat, dengan jeda minimal 30 detik', async () => {
    const fetchImpl = okFetch({ keys: [jwk] });
    let now = 0;
    const c = createJwksClient({ fetchImpl, clock: () => now });
    await c.getKey('http://tool/keys', 'k1');
    await expect(c.getKey('http://tool/keys', 'k9')).rejects.toThrow(/kid/);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // baru saja diambil: kid acak tidak memicu fetch
    now = 31 * 1000;
    await expect(c.getKey('http://tool/keys', 'k9')).rejects.toThrow(/kid/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await expect(c.getKey('http://tool/keys', 'k8')).rejects.toThrow(/kid/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  test('jawaban bukan JWKS atau terlalu besar ditolak', async () => {
    await expect(createJwksClient({ fetchImpl: okFetch({ nope: 1 }) }).getKey('u', 'k1')).rejects.toThrow();
    await expect(createJwksClient({ fetchImpl: okFetch({ keys: [jwk], pad: 'x'.repeat(70000) }) }).getKey('u', 'k1')).rejects.toThrow(/besar/);
  });
});
