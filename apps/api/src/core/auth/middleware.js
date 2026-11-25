'use strict';
const { unauthorized } = require('../errors');
const { viewOf } = require('../rbac/roles');

const EXPIRED = 'Sesi tidak valid atau kedaluwarsa';
const MESSAGES = {
  // B2: tampilan diganti di tab lain; web memuat ulang, bukan menganggap sesi habis
  ROLE_VIEW_CHANGED: 'Tampilan peran berubah. Muat ulang halaman.',
  // B12 tahap 2
  SESSION_IDLE: 'Sesi berakhir karena tidak aktif. Silakan masuk lagi.',
};

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
      req.user = { id: claims.id, tenantId: claims.tenantId, role: claims.role, email: claims.email, sid: claims.sid, rv: claims.rv || 0 };
      if (sessions) {
        const state = await sessions.check(claims, { activity: true });
        if (!state.ok) {
          req.user = undefined;
          if (state.code) return next(Object.assign(unauthorized(MESSAGES[state.code] || EXPIRED), { code: state.code }));
          return next(unauthorized(EXPIRED));
        }
        req.user.roles = state.roles;
        req.user.primaryRole = state.primaryRole;
      } else {
        req.user.roles = [claims.role];
        req.user.primaryRole = claims.role;
      }
      req.user.view = viewOf(claims.role);
    } catch (e) {
      return next(e);
    }
    return next();
  };
}

module.exports = { requireAuth };
