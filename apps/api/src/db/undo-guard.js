'use strict';
// PK-07 / R-3 (PD-19 butir 3): pengaman sebelum migrasi diturunkan. Migrasi lama tidak diubah, jadi pemeriksaan
// dipasang di depan sequelize-cli lewat scripts/migrate-undo.js (`npm run migrate:undo` / `migrate:undo:all`).
//
// 20261113000008-tenant-keys: arah turunnya menghapus tenant_keys (DEK terbungkus) dan memotong judul temuan ke
// 255 karakter. Bila sudah ada data terenkripsi (hasil enkripsi kolom atau scripts/encrypt-existing.js), turun
// berarti data tidak bisa dibaca lagi selamanya. Karena itu undo ditolak selama ada kunci tenant atau nilai "enc:".

// Kolom terenkripsi (sama dengan scripts/encrypt-existing.js).
const ENCRYPTED_COLUMNS = [
  ['lna_assessments', 'evidence'],
  ['lna_findings', 'title'],
  ['lna_findings', 'detail'],
  ['lna_training_plan_items', 'note'],
  ['lna_interview_turns', 'text'],
];

async function encryptedDataCheck(query) {
  const found = [];
  const [{ n }] = await query('SELECT count(*)::int AS n FROM tenant_keys');
  if (n > 0) found.push(`tenant_keys: ${n} kunci tenant`);
  for (const [table, col] of ENCRYPTED_COLUMNS) {
    const [{ c }] = await query(`SELECT count(*)::int AS c FROM ${table} WHERE ${col} LIKE 'enc:%'`);
    if (c > 0) found.push(`${table}.${col}: ${c} nilai terenkripsi`);
  }
  const [{ b }] = await query(`SELECT count(*)::int AS b FROM import_batches WHERE jsonb_typeof(rows) = 'string' AND rows #>> '{}' LIKE 'enc:%'`);
  if (b > 0) found.push(`import_batches.rows: ${b} batch terenkripsi`);
  return found.length
    ? `sudah ada data terenkripsi (${found.join('; ')}). Menurunkan migrasi ini menghapus kunci tenant dan membuat data tidak bisa dibaca. Pulihkan dari backup bila memang perlu kembali.`
    : null;
}

/** Nama migrasi -> pemeriksaan async(query) yang mengembalikan alasan penolakan (string) atau null. */
const GUARDS = {
  '20261113000008-tenant-keys.js': encryptedDataCheck,
};

/** Migrasi yang akan diturunkan: satu terakhir, semua (all), atau sampai dan termasuk `to`. */
function migrationsToUndo(applied, { all = false, to = null } = {}) {
  const sorted = [...applied].sort();
  if (all) return sorted.reverse();
  if (to) {
    const i = sorted.indexOf(to);
    if (i < 0) throw new Error(`Migrasi ${to} tidak ada di riwayat`);
    return sorted.slice(i).reverse();
  }
  return sorted.length ? [sorted[sorted.length - 1]] : [];
}

/** Kembalikan daftar penolakan [{ migration, reason }]. Kosong = aman diturunkan. */
async function checkUndo(query, targets, guards = GUARDS) {
  const refusals = [];
  for (const m of targets) {
    const guard = guards[m];
    if (!guard) continue;
    const reason = await guard(query);
    if (reason) refusals.push({ migration: m, reason });
  }
  return refusals;
}

module.exports = { GUARDS, migrationsToUndo, checkUndo, encryptedDataCheck, ENCRYPTED_COLUMNS };
