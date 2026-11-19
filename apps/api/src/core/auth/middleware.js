'use strict';
const { unauthorized } = require('../errors');

const EXPIRED = 'Sesi tidak valid atau kedaluwarsa';

/**
 * Login ELGOS non-LTI: Bearer token dengan audience `ewi`. Token LTI/portal EliteMentor ditolak.
 * PK-16: token juga harus menunjuk sesi yang masih aktif (bisa dicabut) dan lolos kebijakan login
 * (mis. email Admin ETA masih ada di daftar).
 */
function requireAuth(tokens, { sessions, policy } = {}) {
  return async (req, _res, next) => {
    const header = req.get('authorization') || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return next(unauthorized());
    let claims;
    try {
      claims = tokens.verify(token);
    } catch {
      return next(unauthorized(EXPIRED));
    }
    try {
      if (policy && !policy.allows(claims)) return next(unauthorized(EXPIRED));
      if (sessions && !(await sessions.isActive(claims))) return next(unauthorized(EXPIRED));
    } catch (e) {
      return next(e);
    }
    req.user = { id: claims.id, tenantId: claims.tenantId, role: claims.role, email: claims.email, sid: claims.sid };
    return next();
  };
}

module.exports = { requireAuth };
