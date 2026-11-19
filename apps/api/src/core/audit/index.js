'use strict';
// Audit log (append-only di DB, R2-2). Dipakai untuk:
// - baca data individu (transkrip, hasil DNA/TNA, rencana training): siapa, kapan, tenant, karyawan, objek.
//   Wajib sejak POC dan tidak di balik flag. Dashboard agregat tidak dicatat.
// - perubahan feature flag dan kill switch (R2-1).
// Pencatatan gagal = request gagal (fail closed): data individu tidak dikirim tanpa jejak audit.

/**
 * store: { insert({ tenantId, userId, action, resource, meta, at }, { transaction }?) }.
 * opts.transaction: tulis audit di dalam transaksi pemanggil, supaya audit dan perubahannya jadi atau batal bersama.
 */
function createAuditService(store) {
  async function record(req, action, resource, meta = {}, opts = {}) {
    await store.insert({
      tenantId: req.tenantId,
      userId: (req.user && req.user.id) || null,
      action,
      resource,
      meta: { role: req.user && req.user.role, ...meta },
      at: new Date(),
    }, opts);
  }
  return {
    record,
    /**
     * Catat baca data individu. employeeIds = karyawan yang datanya dibaca (unik, tanpa null).
     * Tidak mencatat apa pun bila tidak ada data individu yang dikembalikan.
     */
    async readIndividual(req, resource, { employeeIds = [], objectType, objectIds } = {}) {
      const ids = [...new Set(employeeIds.filter(Boolean))];
      if (!ids.length) return;
      const meta = { employeeIds: ids, self: ids.length === 1 && ids[0] === (req.user && req.user.id) };
      if (objectType) meta.objectType = objectType;
      if (objectIds && objectIds.length) meta.objectIds = [...new Set(objectIds.filter(Boolean))];
      await record(req, 'read', resource, meta);
    },
  };
}

/** Store audit in-memory (test dan pengembangan tanpa DB). */
function memoryAuditStore() {
  const rows = [];
  return { rows, async insert(row) { rows.push({ id: rows.length + 1, ...row }); } };
}

module.exports = { createAuditService, memoryAuditStore };
