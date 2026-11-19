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
  options: k.options || [],
});

const batchSummary = (b) => ({
  id: b.id, kind: b.kind, filename: b.filename, status: b.status, rowCount: b.rowCount, headers: b.headers,
  mapping: b.mapping, options: b.options, result: b.result, createdAt: b.createdAt, committedAt: b.committedAt, createdByName: b.createdByName || null,
});

/**
 * Jenis dan kolom impor yang berlaku untuk tenant: `kind.flag` / `field.flag` disembunyikan bila flag mati,
 * `field.flagOffAliases` menambah sinonim lama selama flag mati (B4 R1). Tanpa layanan flag = semua flag mati.
 */
function flagNames(kinds) {
  const names = new Set();
  for (const k of kinds) {
    if (k.flag) names.add(k.flag);
    for (const f of k.fields) { if (f.flag) names.add(f.flag); if (f.flagOffAliases) names.add(f.flagOffAliases.flag); }
  }
  return [...names];
}
function kindView(kind, on) {
  if (kind.flag && !on.has(kind.flag)) return null;
  if (!kind.fields.some((f) => f.flag || f.flagOffAliases)) return kind;
  const fields = kind.fields.filter((f) => !f.flag || on.has(f.flag)).map((f) => (f.flagOffAliases && !on.has(f.flagOffAliases.flag)
    ? { ...f, aliases: [...(f.aliases || []), ...f.flagOffAliases.aliases] } : f));
  return { ...kind, fields };
}

function importRouter({ submodule, stores, audit, flags }) {
  const r = express.Router();
  const allKinds = KINDS.filter((k) => k.submodules.includes(submodule));
  const names = flagNames(allKinds);
  r.use(requireRole(ROLES.HR_ADMIN));

  async function enabled(req) {
    const on = new Set();
    for (const n of names) if (flags && await flags.isEnabled(req.tenantId, n)) on.add(n);
    return on;
  }
  const kindsFor = async (req) => { const on = await enabled(req); return allKinds.map((k) => kindView(k, on)).filter(Boolean); };
  const kindOf = async (req, key) => {
    const k = getKind(key);
    const view = k && k.submodules.includes(submodule) ? kindView(k, await enabled(req)) : null;
    if (!view) throw notFound('Jenis impor tidak dikenal');
    return view;
  };
  async function loadBatch(req) {
    const b = await stores.imports.get(req.tenantId, req.params.id);
    if (!b || b.submodule !== submodule) throw notFound('Impor tidak ditemukan');
    return b;
  }
  async function run(req, b) {
    const kind = await kindOf(req, b.kind);
    const body = req.body || {};
    const mapping = body.mapping || b.mapping;
    const err = checkMapping(mapping, b.headers, kind.fields);
    if (err) throw badRequest(err);
    const options = { ...(b.options || {}), ...(body.options || {}) };
    const rows = b.rows.map((row) => ({ ...applyMapping(row, mapping), __row: row.__row }));
    const result = await validateRows(kind, rows, { stores, tenantId: req.tenantId, options });
    return { kind, mapping, options, rows, ...result };
  }

  r.get('/templates', wrap(async (req, res) => res.json({ data: (await kindsFor(req)).map(publicKind) })));

  r.get('/templates/:file', wrap(async (req, res) => {
    const m = String(req.params.file).match(/^([a-z_]+)\.(xlsx|csv)$/);
    if (!m) throw notFound('Template tidak ditemukan');
    const kind = await kindOf(req, m[1]);
    const name = `template-elgos-${kind.key}.${m[2]}`;
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    if (m[2] === 'csv') return res.type('text/csv; charset=utf-8').send(templateCsv(kind));
    return res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(await templateXlsx(kind));
  }));

  r.get('/batches', wrap(async (req, res) => {
    res.json({ data: (await stores.imports.list(req.tenantId, submodule)).map(batchSummary) });
  }));

  r.get('/batches/:id', wrap(async (req, res) => {
    const b = await loadBatch(req);
    res.json({ data: { ...batchSummary(b), sample: (b.rows || []).slice(0, 5) } });
  }));

  // Unggah file mentah (Content-Type selain JSON); nama file lewat ?filename=
  r.post('/:kind', express.raw({ type: (req) => !req.is('application/json'), limit: '10mb' }), wrap(async (req, res) => {
    const kind = await kindOf(req, req.params.kind);
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
    // Jenis impor yang mengganti seluruh data lama (kind.allOrNothing) hanya disimpan bila semua baris valid
    if (kind.allOrNothing && rejected.length) throw badRequest(`Impor ini mengganti seluruh data lama, jadi semua baris harus valid. Perbaiki ${rejected.length} baris yang ditolak, lalu unggah ulang.`);
    const boundAudit = { record: (action, resource, meta) => audit.record(req, action, resource, meta) };
    const summary = await commitRows(kind, accepted, { stores, tenantId: req.tenantId, options, batchId: b.id, user: req.user, audit: boundAudit });
    const result = { imported: accepted.length, rejectedCount: rejected.length, rejected: rejected.slice(0, MAX_REJECTED).map(({ row, reason }) => ({ row, reason })), ...summary };
    const saved = await stores.imports.update(req.tenantId, b.id, { mapping, options, result, status: 'committed', committedAt: new Date(), committedBy: req.user.id, rows: [] });
    await audit.record(req, 'create', `import.${kind.key}`, { batchId: b.id, filename: b.filename, imported: accepted.length, rejected: rejected.length });
    res.json({ data: batchSummary(saved) });
  }));

  return r;
}

module.exports = { importRouter };
