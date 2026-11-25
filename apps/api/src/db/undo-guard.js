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
  ['lna_interview_turns', 'corrected_text'],
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

// Audit 24 Nov: migrasi lain yang arah turunnya menghapus catatan hukum (UU PDP) atau mengubah hak akses.
// Di basis data kosong (CI naik-turun-naik) semua hitungan 0, jadi tidak ada yang ditolak.
/** [ [label, SQL yang mengembalikan { n }] ] -> pemeriksaan: tolak bila ada n > 0. */
function rowsCheck(items) {
  return async (query) => {
    const found = [];
    for (const [label, sql] of items) {
      const [{ n }] = await query(sql);
      if (n > 0) found.push(`${n} ${label}`);
    }
    return found.length
      ? `masih ada ${found.join('; ')}. Menurunkan migrasi ini menghapus atau mengubah data tersebut tanpa jejak. Pulihkan dari backup bila memang perlu kembali.`
      : null;
  };
}

/** Nama migrasi -> pemeriksaan async(query) yang mengembalikan alasan penolakan (string) atau null. */
const GUARDS = {
  '20261113000008-tenant-keys.js': encryptedDataCheck,
  // turun = penarikan persetujuan batal diam-diam (temuan kembali ke review/analisis) dan catatan permintaan hilang
  '20261119000800-permintaan-data-karyawan.js': rowsCheck([
    ['penarikan persetujuan wawancara', 'SELECT count(*)::int AS n FROM lna_interview_sessions WHERE consent_withdrawn_at IS NOT NULL'],
    ['permintaan data karyawan', 'SELECT count(*)::int AS n FROM data_subject_requests'],
  ]),
  // turun = bukti versi persetujuan yang disetujui karyawan hilang (PK-15)
  '20261117000501-consent-version.js': rowsCheck([
    ['sesi dengan versi persetujuan tercatat', 'SELECT count(*)::int AS n FROM lna_interview_sessions WHERE consent_version IS NOT NULL'],
  ]),
  // turun = Admin Tenant diturunkan jadi karyawan dan peran tambahan hilang
  '20261119000200-user-roles.js': rowsCheck([
    ['akun Admin Tenant', "SELECT count(*)::int AS n FROM users WHERE role = 'tenant_admin'"],
    ['peran tambahan', 'SELECT count(*)::int AS n FROM user_roles ur JOIN users u ON u.id = ur.user_id WHERE ur.role <> u.role'],
  ]),
  // turun = keputusan review HR atas hasil AI dan teks asli AI hilang (PK-14)
  '20261117000400-ai-review.js': rowsCheck([
    // reviewed_by, bukan reviewed_at: arah naik mengisi reviewed_at untuk temuan lama tanpa peninjau
    ['keputusan review HR atas temuan', 'SELECT count(*)::int AS n FROM lna_findings WHERE reviewed_by IS NOT NULL'],
  ]),
  // turun = bukti persetujuan dan transkrip wawancara Core Competencies hilang
  '20261123001000-cca-wawancara.js': rowsCheck([
    ['persetujuan wawancara Core Competencies', 'SELECT count(*)::int AS n FROM cca_assignments WHERE consent_version IS NOT NULL'],
  ]),
  // turun = wawancara ulang dampak belajar (beserta persetujuannya) hilang
  '20261123003000-lim-wawancara-ulang.js': rowsCheck([
    ['wawancara ulang dampak belajar', 'SELECT count(*)::int AS n FROM lim_reinterviews'],
  ]),
  // turun = bukti persetujuan suara dan koreksi transkrip karyawan hilang (B19)
  '20261125001900-b19-wawancara-suara.js': rowsCheck([
    ['persetujuan wawancara suara', 'SELECT count(*)::int AS n FROM lna_interview_sessions WHERE voice_consent_at IS NOT NULL'],
    ['koreksi jawaban wawancara', 'SELECT count(*)::int AS n FROM lna_interview_turns WHERE corrected_text IS NOT NULL'],
  ]),
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

module.exports = { GUARDS, migrationsToUndo, checkUndo, encryptedDataCheck, rowsCheck, ENCRYPTED_COLUMNS };
