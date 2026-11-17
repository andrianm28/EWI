'use strict';
// PK-07 / PD-8 opsi A (menutup P1-7 sisi aplikasi): role aplikasi tanpa DDL dan tanpa UPDATE/DELETE/TRUNCATE
// pada audit_logs. Role aplikasi = DB_APP_ROLE atau DB_USER; migrasi berjalan sebagai DB_MIGRATION_USER
// (pemilik schema). Bila keduanya sama (dev lokal, CI), migrasi ini tidak mengubah apa pun.
// Role yang dibuat setelah migrasi ini: jalankan `npm run db:grant-app` (aman diulang).
const { QueryTypes } = require('sequelize');
const { applyAppRole, appRoleFromEnv } = require('../src/db/app-role');

const S = process.env.DB_SCHEMA || 'ewi';
const run = (qi, mode) => applyAppRole({
  query: (sql) => qi.sequelize.query(sql, { type: sql.trim().startsWith('SELECT') ? QueryTypes.SELECT : QueryTypes.RAW }),
  schema: S,
  role: appRoleFromEnv(),
  mode,
  log: (m) => console.log(m),
});

module.exports = {
  async up(qi) { await run(qi, 'grant'); },
  async down(qi) { await run(qi, 'revoke'); },
};
