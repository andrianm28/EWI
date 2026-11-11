'use strict';
// Audit log baca/tulis. Audit baca (FR read audit) di balik flag audit.read.
function createAuditService(store) {
  return {
    async record(req, action, resource, meta = {}) {
      await store.insert({
        tenantId: req.tenantId,
        userId: req.user && req.user.id,
        action,
        resource,
        meta,
        at: new Date(),
      });
    },
  };
}

module.exports = { createAuditService };
