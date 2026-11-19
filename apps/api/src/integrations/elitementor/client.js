'use strict';
// Klien API EliteMentor (ADR 0001): OAuth2 client credentials, token di-cache sampai mendekati kedaluwarsa.
// Endpoint program/enrollment menyusul begitu kontrak FR-EM disepakati dengan tim EliteMentor.

function createElitementorClient({ baseUrl, tokenUrl, clientId, clientSecret, scope = 'ewi' }, fetchImpl = fetch, clock = Date.now) {
  let cached = null; // { token, expiresAt }

  async function accessToken(signal) {
    if (cached && cached.expiresAt - 30_000 > clock()) return cached.token;
    const res = await fetchImpl(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope }),
      signal,
    });
    if (!res.ok) throw new Error(`OAuth2 EliteMentor gagal: ${res.status}`);
    const body = await res.json();
    cached = { token: body.access_token, expiresAt: clock() + (body.expires_in || 300) * 1000 };
    return cached.token;
  }

  /** headers: header tambahan (mis. Idempotency-Key); signal: AbortSignal untuk batas waktu. */
  async function request(method, path, { organizationId, body, headers: extra, signal } = {}) {
    const headers = { ...(extra || {}), Authorization: `Bearer ${await accessToken(signal)}`, 'Content-Type': 'application/json' };
    if (organizationId) headers['X-Organization-Id'] = String(organizationId);
    const res = await fetchImpl(`${baseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal });
    if (!res.ok) throw new Error(`EliteMentor ${method} ${path} gagal: ${res.status}`);
    return res.status === 204 ? null : res.json();
  }

  return { accessToken, request };
}

module.exports = { createElitementorClient };
