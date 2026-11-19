'use strict';
// PK-07 / PD-8 opsi A: aplikasi dan migrasi memakai user database yang berbeda.
// - Aplikasi: DATABASE_URL (di container dirakit docker-entrypoint.sh dari DB_USER + DB_PASSWORD).
//   User ini tanpa hak DDL dan tanpa UPDATE/DELETE/TRUNCATE pada audit_logs.
// - Migrasi dan ensure-schema: MIGRATION_DATABASE_URL bila diisi; bila tidak, DATABASE_URL dengan user dan
//   password diganti DB_MIGRATION_USER + DB_MIGRATION_PASSWORD; bila keduanya kosong, sama dengan aplikasi
//   (dev lokal dan CI dengan satu user).

function appDatabaseUrl(env = process.env) {
  return env.DATABASE_URL;
}

function migrationDatabaseUrl(env = process.env) {
  if (env.MIGRATION_DATABASE_URL) return env.MIGRATION_DATABASE_URL;
  const base = env.DATABASE_URL;
  if (!env.DB_MIGRATION_USER || !base) return base;
  const u = new URL(base);
  u.username = encodeURIComponent(env.DB_MIGRATION_USER);
  u.password = encodeURIComponent(env.DB_MIGRATION_PASSWORD || '');
  return u.toString();
}

/** Nama user dari URL koneksi (untuk log dan pemeriksaan), tanpa password. */
function urlUser(url) {
  try { return decodeURIComponent(new URL(url).username); } catch { return ''; }
}

module.exports = { appDatabaseUrl, migrationDatabaseUrl, urlUser };
