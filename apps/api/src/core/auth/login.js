'use strict';
// B1: menyelesaikan login setelah faktor (link email, kata sandi dev, SSO) lolos: terbitkan sesi lalu catat audit.
// Keputusan 19 Nov (PD-10 B + kartu 2FA): ELGOS tidak memakai verifikasi dua langkah; link email sudah cukup.

/** Return { token }. Audit login ditulis di tenant akun itu. */
async function finishLogin({ user, method, req, sessions, audit, auditMeta = {} }) {
  const { token } = await sessions.issue(user, { method, ip: req.ip, userAgent: req.get('user-agent') });
  await audit.record({ tenantId: user.tenantId, user }, 'login', `auth.${method}`, auditMeta);
  return { token };
}

module.exports = { finishLogin };
