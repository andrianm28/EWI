'use strict';
const jwt = require('jsonwebtoken');

function createTokenService(jwtConfig) {
  const { secret, audience, issuer, ttl } = jwtConfig;
  return {
    /**
     * PK-16: `sid` = id baris auth_sessions; token tanpa sid ditolak oleh requireAuth bila sesi dicek.
     * B2: `role` = peran aktif sesi, `rv` = versi peran sesi (naik tiap ganti tampilan).
     * `expiresAt` (Date) dipakai saat token diterbitkan ulang untuk sesi yang sama, supaya masa sesi tidak bertambah.
     */
    sign(user, { sid, rv = 0, expiresAt } = {}) {
      const claims = { tid: user.tenantId, role: user.role, email: user.email };
      if (sid) { claims.sid = sid; claims.rv = rv; }
      const opts = { subject: String(user.id), audience, issuer, algorithm: 'HS256' };
      if (expiresAt) claims.exp = Math.floor(new Date(expiresAt).getTime() / 1000);
      else opts.expiresIn = ttl;
      return jwt.sign(claims, secret, opts);
    },
    verify(token) {
      const p = jwt.verify(token, secret, { audience, issuer, algorithms: ['HS256'] });
      return { id: p.sub, tenantId: p.tid, role: p.role, email: p.email, sid: p.sid || null, rv: p.rv || 0, exp: p.exp };
    },
    /** Waktu kedaluwarsa token (Date) tanpa verifikasi; hanya untuk token yang baru saja ditandatangani. */
    expiresAt(token) {
      const { exp } = jwt.decode(token);
      return new Date(exp * 1000);
    },
  };
}

module.exports = { createTokenService };
