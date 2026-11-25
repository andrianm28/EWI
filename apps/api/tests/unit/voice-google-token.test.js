'use strict';
// B19 bagian 4.3: token akses OAuth dicetak dari kunci service account tanpa google-auth-library.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { createTokenSource } = require('../../src/voice/google-token');

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = { type: 'service_account', client_email: 'sa@p.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), private_key_id: 'kid1', project_id: 'p' };

function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, body: new URLSearchParams(init.body) });
    const r = responses.shift();
    return { ok: r.status === 200, status: r.status, json: async () => r.body, text: async () => JSON.stringify(r.body) };
  };
  fn.calls = calls;
  return fn;
}

test('menukar JWT RS256 bertanda tangan kunci SA dengan token akses cloud-platform', async () => {
  const fetch = fakeFetch([{ status: 200, body: { access_token: 'ya29.A', expires_in: 3600 } }]);
  const src = createTokenSource({ key, fetch, now: () => 1_000_000 });
  await expect(src.getToken()).resolves.toBe('ya29.A');
  const [call] = fetch.calls;
  expect(call.url).toBe('https://oauth2.googleapis.com/token');
  expect(call.body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
  const claims = jwt.verify(call.body.get('assertion'), publicKey, { algorithms: ['RS256'], ignoreExpiration: true });
  expect(claims).toMatchObject({ iss: key.client_email, aud: 'https://oauth2.googleapis.com/token', scope: 'https://www.googleapis.com/auth/cloud-platform', iat: 1000 });
  expect(claims.exp - claims.iat).toBe(3600);
});

test('token disimpan sampai 5 menit sebelum kedaluwarsa, lalu diperbarui', async () => {
  let t = 0;
  const fetch = fakeFetch([{ status: 200, body: { access_token: 'A', expires_in: 3600 } }, { status: 200, body: { access_token: 'B', expires_in: 3600 } }]);
  const src = createTokenSource({ key, fetch, now: () => t });
  expect(await src.getToken()).toBe('A');
  t = 3000 * 1000;
  expect(await src.getToken()).toBe('A');
  t = 3301 * 1000;
  expect(await src.getToken()).toBe('B');
  expect(fetch.calls).toHaveLength(2);
});

test('galat penukaran tidak membocorkan isi kunci', async () => {
  const fetch = fakeFetch([{ status: 400, body: { error: 'invalid_grant' } }]);
  const src = createTokenSource({ key, fetch });
  const err = await src.getToken().catch((e) => e);
  expect(err.code).toBe('VOICE_AUTH_FAILED');
  expect(err.message).toContain('400');
  expect(err.message).not.toContain('PRIVATE KEY');
});
