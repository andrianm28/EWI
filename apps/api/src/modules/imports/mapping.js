'use strict';
// Pemetaan kolom file HR -> field template ELGOS. Saran otomatis dari judul kolom + sinonim.

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

/** headers + fields -> { fieldKey: header | null } berdasarkan judul template, kunci, dan sinonim. */
function suggestMapping(headers, fields) {
  const byNorm = new Map(headers.map((h) => [norm(h), h]));
  const used = new Set();
  const mapping = {};
  for (const f of fields) {
    const candidates = [f.header, f.key, ...(f.aliases || [])].map(norm);
    const hit = candidates.map((c) => byNorm.get(c)).find((h) => h && !used.has(h));
    mapping[f.key] = hit || null;
    if (hit) used.add(hit);
  }
  return mapping;
}

/** Validasi pemetaan dari HR; kembalikan pesan error atau null. */
function checkMapping(mapping, headers, fields) {
  if (!mapping || typeof mapping !== 'object') return 'mapping wajib diisi';
  const hs = new Set(headers);
  for (const [key, h] of Object.entries(mapping)) {
    if (!fields.some((f) => f.key === key)) return `Field tidak dikenal: ${key}`;
    if (h && !hs.has(h)) return `Kolom "${h}" tidak ada di file`;
  }
  const missing = fields.filter((f) => f.required && !mapping[f.key]).map((f) => f.header);
  if (missing.length) return `Kolom wajib belum dipetakan: ${missing.join(', ')}`;
  for (const group of new Set(fields.filter((f) => f.oneOf).map((f) => f.oneOf))) {
    const members = fields.filter((f) => f.oneOf === group);
    if (!members.some((f) => mapping[f.key])) return `Petakan salah satu kolom: ${members.map((f) => f.header).join(' atau ')}`;
  }
  return null;
}

/** Baris mentah (judul kolom file) -> objek berkunci field template. */
function applyMapping(row, mapping) {
  const out = {};
  for (const [key, h] of Object.entries(mapping)) if (h) out[key] = row[h];
  return out;
}

module.exports = { suggestMapping, checkMapping, applyMapping, norm };
