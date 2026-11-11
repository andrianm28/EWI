'use strict';
const jwt = require('jsonwebtoken');

function createTokenService(jwtConfig) {
  const { secret, audience, issuer, ttl } = jwtConfig;
  return {
    sign(user) {
      return jwt.sign(
        { tid: user.tenantId, role: user.role, email: user.email },
        secret,
        { subject: String(user.id), audience, issuer, expiresIn: ttl, algorithm: 'HS256' },
      );
    },
    verify(token) {
      const p = jwt.verify(token, secret, { audience, issuer, algorithms: ['HS256'] });
      return { id: p.sub, tenantId: p.tid, role: p.role, email: p.email };
    },
  };
}

module.exports = { createTokenService };
