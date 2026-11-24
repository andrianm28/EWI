'use strict';
// B19: token akses OAuth 2.0 untuk Vertex AI dari kunci service account (JWT bearer grant, RFC 7523).
// Tanpa google-auth-library; jsonwebtoken sudah dependensi API. Kunci hanya ada di memori proses.
const jwt = require('jsonwebtoken');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const REFRESH_MARGIN_S = 300;

function createTokenSource({ key, fetch = globalThis.fetch, now = Date.now }) {
  let cached = null; // { token, expiresAt (detik) }
  let pending = null;

  async function exchange() {
    const iat = Math.floor(now() / 1000);
    const assertion = jwt.sign({ iss: key.client_email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }, key.private_key, {
      algorithm: 'RS256', keyid: key.private_key_id || undefined,
    });
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    });
    if (!res.ok) {
      const err = new Error(`Token Google ditolak (HTTP ${res.status})`);
      err.code = 'VOICE_AUTH_FAILED';
      throw err;
    }
    const body = await res.json();
    cached = { token: body.access_token, expiresAt: iat + Number(body.expires_in || 3600) };
    return cached.token;
  }

  return {
    async getToken() {
      const t = Math.floor(now() / 1000);
      if (cached && t < cached.expiresAt - REFRESH_MARGIN_S) return cached.token;
      // Satu penukaran untuk beberapa sesi yang meminta bersamaan
      if (!pending) pending = exchange().finally(() => { pending = null; });
      return pending;
    },
  };
}

module.exports = { createTokenSource, TOKEN_URL, SCOPE };
