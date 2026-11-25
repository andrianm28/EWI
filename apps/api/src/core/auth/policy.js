'use strict';
// PK-16 / PD-10 ★B: siapa yang boleh punya sesi. Dicek saat login, saat link email dikirim/ditukar,
// dan di setiap request (requireAuth), supaya email yang dicabut dari daftar langsung kehilangan akses.
const { ROLES } = require('../rbac/roles');

/** authConfig: config.auth ({ etaAdminEmails, etaAdminRequireList }). */
function createLoginPolicy(authConfig = {}) {
  const list = new Set((authConfig.etaAdminEmails || []).map((e) => String(e).toLowerCase()));
  const requireList = authConfig.etaAdminRequireList === true;
  return {
    allows(user) {
      if (!user) return false;
      if (user.role !== ROLES.ETA_ADMIN) return true;
      if (!requireList) return true;
      return list.has(String(user.email || '').toLowerCase());
    },
  };
}

module.exports = { createLoginPolicy };
