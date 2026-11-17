'use strict';
const jwt = require('jsonwebtoken');

function createTokenService(jwtConfig) {
  const { secret, audience, issuer, ttl } = jwtConfig;
  return {
    /** sid = id baris auth_sessions (PK-16). Token tanpa sid ditolak oleh requireAuth bila sesi dicek. */
    sign(user, { sid } = {}) {
      const claims = { tid: user.tenantId, role: user.role, email: user.email };
      if (sid) claims.sid = sid;
      return jwt.sign(claims, secret, { subject: String(user.id), audience, issuer, expiresIn: ttl, algorithm: 'HS256' });
    },
    verify(token) {
      const p = jwt.verify(token, secret, { audience, issuer, algorithms: ['HS256'] });
      return { id: p.sub, tenantId: p.tid, role: p.role, email: p.email, sid: p.sid || null, exp: p.exp };
    },
    /** Waktu kedaluwarsa token (Date) tanpa verifikasi; hanya untuk token yang baru saja ditandatangani. */
    expiresAt(token) {
      const { exp } = jwt.decode(token);
      return new Date(exp * 1000);
    },
  };
}

module.exports = { createTokenService };
