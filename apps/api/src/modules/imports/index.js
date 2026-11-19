'use strict';
// R3-3 (13 Nov): impor data POC lewat template XLSX/CSV ELGOS.
// Alur: unduh template -> unggah file -> petakan kolom (saran otomatis) -> validasi + pratinjau -> simpan.
// Riwayat impor di import_batches; isi baris mentah dihapus setelah disimpan (data individu tidak disimpan dua kali).
const crypto = require('crypto');
const express = require('express');
const { requireRole, ROLES } = require('../../core/rbac');
const { badRequest, notFound, HttpError } = require('../../core/errors');
const { KINDS, getKind } = require('./kinds');
const { parseUpload } = require('./parse');
const { suggestMapping, checkMapping, applyMapping } = require('./mapping');
const { validateRows, commitRows } = require('./engine');
const { templateCsv, templateXlsx } = require('./template');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const PREVIEW_ROWS = 20;
const MAX_REJECTED = 500;

const publicKind = (k) => ({
  key: k.key, label: k.label, description: k.description,
  fields: k.fields.map(({ key, header, required, oneOf, help, example }) => ({ key, header, required: !!required, oneOf: oneOf || null, help: help || null, example: example ?? null })),
  options: (k.options || []).filter((o) => !o.internal),
});

const batchSummary = (b) => ({
  id: b.id, kind: b.kind, filename: b.filename, status: b.status, rowCount: b.rowCount, headers: b.headers,
  mapping: b.mapping, options: b.options, result: b.result, createdAt: b.createdAt, committedAt: b.committedAt, createdByName: b.createdByName || null,
});

/**
 * guard: middleware peran. Default HR (rute /api/dna|tna/imports); layar Admin Tenant (B11) memasang gerbangnya sendiri.
 * only: daftar kunci jenis impor yang dibuka router ini (default semua jenis submodul). Jenis di luar daftar,
 *       termasuk riwayat batch-nya, dijawab 404.
 */
function importRouter({ submodule, stores, audit, guard, only }) {
  const r = express.Router();
  const kinds = KINDS.filter((k) => k.submodules.includes(submodule) && (!only || only.includes(k.key)));
  const allowed = new Set(kinds.map((k) => k.key));
  r.use(guard || requireRole(ROLES.HR_ADMIN));

  const kindOf = (key) => {
    const k = getKind(key);
    if (!k || !allowed.has(k.key)) throw notFound('Jenis impor tidak dikenal');
    return k;
  };
  async function loadBatch(req) {
    const b = await stores.imports.get(req.tenantId, req.params.id);
    if (!b || b.submodule !== submodule || !allowed.has(b.kind)) throw notFound('Impor tidak ditemukan');
    return b;
  }
  async function run(req, b) {
    const kind = kindOf(b.kind);
    const body = req.body || {};
    const mapping = body.mapping || b.mapping;
    const err = checkMapping(mapping, b.headers, kind.fields);
    if (err) throw badRequest(err);
    const options = { ...(b.options || {}), ...(body.options || {}) };
    const rows = b.rows.map((row) => ({ ...applyMapping(row, mapping), __row: row.__row }));
    const result = await validateRows(kind, rows, { stores, tenantId: req.tenantId, options });
    return { kind, mapping, options, rows, ...result };
  }

  r.get('/templates', (_req, res) => res.json({ data: kinds.map(publicKind) }));

  r.get('/templates/:file', wrap(async (req, res) => {
    const m = String(req.params.file).match(/^([a-z_]+)\.(xlsx|csv)$/);
    if (!m) throw notFound('Template tidak ditemukan');
    const kind = kindOf(m[1]);
    const name = `template-elgos-${kind.key}.${m[2]}`;
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    if (m[2] === 'csv') return res.type('text/csv; charset=utf-8').send(templateCsv(kind));
    return res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(await templateXlsx(kind));
  }));

  r.get('/batches', wrap(async (req, res) => {
    res.json({ data: (await stores.imports.list(req.tenantId, submodule)).filter((b) => allowed.has(b.kind)).map(batchSummary) });
  }));

  r.get('/batches/:id', wrap(async (req, res) => {
    const b = await loadBatch(req);
    res.json({ data: { ...batchSummary(b), sample: (b.rows || []).slice(0, 5) } });
  }));

  // Unggah file mentah (Content-Type selain JSON); nama file lewat ?filename=
  r.post('/:kind', express.raw({ type: (req) => !req.is('application/json'), limit: '10mb' }), wrap(async (req, res) => {
    const kind = kindOf(req.params.kind);
    const filename = String(req.query.filename || '').slice(0, 255);
    if (!Buffer.isBuffer(req.body)) throw badRequest('Kirim isi file sebagai body (bukan JSON) dengan ?filename=nama.xlsx');
    const { headers, rows } = await parseUpload(req.body, filename);
    const mapping = suggestMapping(headers, kind.fields);
    const b = await stores.imports.create(req.tenantId, {
      id: crypto.randomUUID(), submodule, kind: kind.key, filename, headers, rows, mapping, rowCount: rows.length, createdBy: req.user.id,
    });
    res.status(201).json({ data: { ...batchSummary(b), sample: rows.slice(0, 5) } });
  }));

  r.post('/batches/:id/preview', wrap(async (req, res) => {
    const b = await loadBatch(req);
    if (b.status !== 'uploaded') throw new HttpError(409, 'INVALID_STATE', 'Impor ini sudah disimpan');
    const { mapping, options, rows, accepted, rejected } = await run(req, b);
    await stores.imports.update(req.tenantId, b.id, { mapping, options });
    res.json({
      data: {
        valid: accepted.length, rejectedCount: rejected.length, rejected: rejected.slice(0, MAX_REJECTED).map(({ row, reason }) => ({ row, reason })),
        sample: accepted.slice(0, PREVIEW_ROWS).map((a) => ({ row: a.row, values: { ...rows[a.index], __row: undefined } })),
      },
    });
  }));

  r.post('/batches/:id/commit', wrap(async (req, res) => {
    const b = await loadBatch(req);
    if (b.status !== 'uploaded') throw new HttpError(409, 'INVALID_STATE', 'Impor ini sudah disimpan');
    const { kind, mapping, options, accepted, rejected } = await run(req, b);
    if (!accepted.length) throw badRequest('Tidak ada baris valid untuk disimpan');
    const summary = await commitRows(kind, accepted, { stores, tenantId: req.tenantId, options, batchId: b.id, user: req.user });
    const result = { imported: accepted.length, rejectedCount: rejected.length, rejected: rejected.slice(0, MAX_REJECTED).map(({ row, reason }) => ({ row, reason })), ...summary };
    const saved = await stores.imports.update(req.tenantId, b.id, { mapping, options, result, status: 'committed', committedAt: new Date(), committedBy: req.user.id, rows: [] });
    await audit.record(req, 'create', `import.${kind.key}`, { batchId: b.id, filename: b.filename, imported: accepted.length, rejected: rejected.length });
    res.json({ data: batchSummary(saved) });
  }));

  return r;
}

module.exports = { importRouter };
