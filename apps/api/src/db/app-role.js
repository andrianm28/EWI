'use strict';
// PK-07 / PD-8 opsi A: hak role aplikasi di schema ELGOS.
// - DML (SELECT, INSERT, UPDATE, DELETE) pada tabel bisnis, tanpa DDL (tidak punya CREATE di schema,
//   bukan pemilik tabel, jadi tidak bisa ALTER/DROP atau mematikan trigger audit).
// - audit_logs: hanya SELECT + INSERT (R2-2). UPDATE, DELETE, TRUNCATE dicabut, di samping trigger append-only.
// - sequelize_meta: hanya SELECT (riwayat migrasi tidak bisa diubah aplikasi).
// - Default privileges: tabel yang nanti dibuat role migrasi otomatis mendapat DML yang sama.
// Dipakai migrasi 20261117000200 dan scripts/grant-app-role.js (aman diulang).

const IDENT = /^[a-z_][a-z0-9_$-]{0,62}$/i;
const AUDIT_TABLES = ['audit_logs', 'platform_audit_logs'];

function quoteIdent(name) {
  if (!IDENT.test(name || '')) throw new Error(`Nama role/schema tidak valid: ${name}`);
  return `"${name}"`;
}

/** Role aplikasi dari env: DB_APP_ROLE, atau DB_USER (user koneksi aplikasi). Kosong = tidak ada pemisahan. */
function appRoleFromEnv(env = process.env) {
  return env.DB_APP_ROLE || env.DB_USER || '';
}

function grantSql({ schema, role, owner, auditTables = AUDIT_TABLES }) {
  const S = quoteIdent(schema); const R = quoteIdent(role); const O = quoteIdent(owner);
  const audit = auditTables.map((t) => `${S}."${t}"`).join(', ');
  return `
    REVOKE ALL ON SCHEMA ${S} FROM ${R};
    GRANT USAGE ON SCHEMA ${S} TO ${R};
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${S} TO ${R};
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${S} TO ${R};
    REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ${audit} FROM ${R};
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ${S}."sequelize_meta" FROM ${R};
    ALTER DEFAULT PRIVILEGES FOR ROLE ${O} IN SCHEMA ${S} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${R};
    ALTER DEFAULT PRIVILEGES FOR ROLE ${O} IN SCHEMA ${S} GRANT USAGE, SELECT ON SEQUENCES TO ${R};
  `;
}

function revokeSql({ schema, role, owner }) {
  const S = quoteIdent(schema); const R = quoteIdent(role); const O = quoteIdent(owner);
  return `
    ALTER DEFAULT PRIVILEGES FOR ROLE ${O} IN SCHEMA ${S} REVOKE ALL ON TABLES FROM ${R};
    ALTER DEFAULT PRIVILEGES FOR ROLE ${O} IN SCHEMA ${S} REVOKE ALL ON SEQUENCES FROM ${R};
    REVOKE ALL ON ALL TABLES IN SCHEMA ${S} FROM ${R};
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA ${S} FROM ${R};
    REVOKE ALL ON SCHEMA ${S} FROM ${R};
  `;
}

/**
 * Terapkan (mode 'grant') atau cabut (mode 'revoke') hak role aplikasi. `query(sql)` -> rows.
 * Lewati bila role aplikasi kosong atau sama dengan user yang menjalankan migrasi (dev/CI satu user).
 * Gagal dengan pesan jelas bila role belum dibuat (dibuat oleh thread infra/DBA, bukan oleh migrasi).
 */
async function applyAppRole({ query, schema, role, mode = 'grant', log = () => {} }) {
  const [{ current }] = await query('SELECT current_user AS current');
  if (!role || role === current) {
    log(`role aplikasi tidak dipisah (${role ? 'sama dengan user migrasi' : 'DB_APP_ROLE/DB_USER kosong'}); hak tidak diubah`);
    return { skipped: true };
  }
  quoteIdent(role);
  const exists = await query(`SELECT rolsuper FROM pg_roles WHERE rolname = '${role.replace(/'/g, "''")}'`);
  if (!exists.length) {
    if (mode === 'revoke') return { skipped: true };
    throw new Error(`Role aplikasi "${role}" belum ada. Buat dulu (LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE), lihat docs/ewi/database-role-dan-migrasi.md`);
  }
  if (exists[0].rolsuper) log(`PERINGATAN: role aplikasi "${role}" adalah superuser; hak tabel tidak berlaku untuk superuser (P1-7)`);
  // B12: tabel audit yang ditambah migrasi lebih baru belum ada saat migrasi lama dijalankan di database baru
  const names = AUDIT_TABLES.map((t) => `'${t}'`).join(', ');
  const auditTables = (await query(`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = '${schema.replace(/'/g, "''")}' AND table_name IN (${names})`))
    .map((r) => r.name);
  await query((mode === 'revoke' ? revokeSql : grantSql)({ schema, role, owner: current, auditTables }));
  log(`hak role aplikasi "${role}" di schema "${schema}": ${mode === 'revoke' ? 'dicabut' : 'diterapkan'}`);
  return { skipped: false };
}

module.exports = { applyAppRole, appRoleFromEnv, grantSql, revokeSql, quoteIdent, AUDIT_TABLES };
