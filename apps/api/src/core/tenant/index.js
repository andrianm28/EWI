'use strict';
const { unauthorized } = require('../errors');

/**
 * Setiap request terautentikasi terikat ke satu tenant (organisasi klien).
 * Semua query wajib lewat `req.tenantId`; jangan pernah ambil tenant dari body/query.
 */
function tenantContext() {
  return (req, _res, next) => {
    if (!req.user || !req.user.tenantId) return next(unauthorized());
    req.tenantId = req.user.tenantId;
    return next();
  };
}

/** Tambahkan filter tenant ke opsi query Sequelize. */
function scoped(req, options = {}) {
  return { ...options, where: { ...(options.where || {}), tenantId: req.tenantId } };
}

module.exports = { tenantContext, scoped };
