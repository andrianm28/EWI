'use strict';
// Menjalankan validasi + simpan untuk satu jenis impor. Dipakai alur unggah file (mapping) dan endpoint lama berbasis rows.
const { badRequest } = require('../../core/errors');

/**
 * rows: objek berkunci field template (+ opsional __row nomor baris spreadsheet).
 * Return { accepted: [{ index, row, value }], rejected: [{ index, row, reason }] }.
 */
async function validateRows(kind, rows, { stores, tenantId, options = {} }) {
  if (kind.checkOptions) {
    const err = kind.checkOptions(options, rows);
    if (err) throw badRequest(err);
  }
  const ctx = kind.context ? await kind.context({ stores, tenantId, rows, options }) : {};
  if (ctx && ctx.fatal) throw badRequest(ctx.fatal);
  const accepted = []; const rejected = [];
  rows.forEach((raw, index) => {
    const row = raw || {};
    const res = kind.validate(row, ctx, options);
    if (res.error) rejected.push({ index, row: row.__row, reason: res.error });
    else accepted.push({ index, row: row.__row, value: res.value });
  });
  return { accepted, rejected };
}

/** audit (opsional): { record(action, resource, meta) } yang sudah terikat ke request; dipakai jenis impor yang wajib diaudit. */
async function commitRows(kind, accepted, { stores, tenantId, options = {}, batchId, user, audit }) {
  if (!accepted.length) return {};
  return kind.commit({ stores, tenantId, values: accepted.map((a) => a.value), options, batchId, user, audit });
}

module.exports = { validateRows, commitRows };
