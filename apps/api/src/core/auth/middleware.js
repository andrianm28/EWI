'use strict';
const { unauthorized } = require('../errors');

/** Login EWI non-LTI: Bearer token dengan audience `ewi`. Token LTI/portal EliteMentor ditolak. */
function requireAuth(tokens) {
  return (req, _res, next) => {
    const header = req.get('authorization') || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return next(unauthorized());
    try {
      req.user = tokens.verify(token);
      return next();
    } catch {
      return next(unauthorized('Sesi tidak valid atau kedaluwarsa'));
    }
  };
}

module.exports = { requireAuth };
