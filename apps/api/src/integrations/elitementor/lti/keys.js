'use strict';
// EM-LTI (ADR 0003): kunci RSA platform ELGOS untuk id_token dan token AGS, serta klien JWKS tool.
// Kunci privat tidak pernah di DB: dari env ELGOS_LTI_PRIVATE_KEY (PEM atau base64 PEM). Spek §4.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const MAX_JWKS_BYTES = 64 * 1024;

function toPem(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.includes('-----BEGIN')) return s.replace(/\\n/g, '\n');
  return Buffer.from(s, 'base64').toString('utf8');
}

/**
 * pem: isi ELGOS_LTI_PRIVATE_KEY. Tanpa PEM: produksi → null (rute LTI menjawab 503), selain itu kunci sementara.
 * Return { kid, ephemeral, jwks(), sign(payload, opts), verify(token, opts) } atau null.
 */
function loadPlatformKey({ pem, production, log = (m) => console.warn(m) }) {
  let privateKey;
  const text = toPem(pem);
  if (text) privateKey = crypto.createPrivateKey(text);
  else if (production) return null;
  else {
    log('[lti] ELGOS_LTI_PRIVATE_KEY kosong: memakai kunci sementara (hilang saat API restart). Jangan dipakai di produksi.');
    privateKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  }
  const publicKey = crypto.createPublicKey(privateKey);
  const { kty, n, e } = publicKey.export({ format: 'jwk' });
  // RFC 7638: thumbprint JWK sebagai kid
  const kid = crypto.createHash('sha256').update(JSON.stringify({ e, kty, n })).digest('base64url');
  const publicJwk = { kty, n, e, kid, alg: 'RS256', use: 'sig' };
  return {
    kid,
    ephemeral: !text,
    jwks: () => ({ keys: [publicJwk] }),
    sign: (payload, opts = {}) => jwt.sign(payload, privateKey, { algorithm: 'RS256', keyid: kid, ...opts }),
    verify: (token, opts = {}) => jwt.verify(token, publicKey, { algorithms: ['RS256'], ...opts }),
  };
}

/** Klien JWKS tool: cache per URL (5 menit), ambil ulang sekali bila kid tidak dikenal, batas waktu dan ukuran. */
function createJwksClient({ fetchImpl = fetch, ttlMs = 5 * 60 * 1000, timeoutMs = 5000, clock = Date.now } = {}) {
  const cache = new Map(); // url -> { at, keys }

  async function load(url) {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`JWKS tool gagal diambil: ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_JWKS_BYTES) throw new Error('JWKS tool terlalu besar');
    let body;
    try { body = JSON.parse(text); } catch { throw new Error('JWKS tool bukan JSON'); }
    if (!body || !Array.isArray(body.keys)) throw new Error('JWKS tool tidak berisi keys');
    const entry = { at: clock(), keys: body.keys };
    cache.set(url, entry);
    return entry;
  }

  return {
    async getKey(url, kid) {
      let entry = cache.get(url);
      let fresh = false;
      if (!entry || clock() - entry.at > ttlMs) { entry = await load(url); fresh = true; }
      let jwk = entry.keys.find((k) => k.kid === kid);
      // kunci tool baru dirotasi: ambil ulang sekali (bukan bila baru saja diambil)
      if (!jwk && !fresh) jwk = (await load(url)).keys.find((k) => k.kid === kid);
      if (!jwk || jwk.kty !== 'RSA') throw new Error(`Kunci tool dengan kid ${kid} tidak ditemukan`);
      return crypto.createPublicKey({ key: jwk, format: 'jwk' });
    },
  };
}

module.exports = { loadPlatformKey, createJwksClient };
