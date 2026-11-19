'use strict';
// Terapkan ulang hak role aplikasi (PD-8 opsi A). Aman diulang. Jalankan sebagai user migrasi:
//   DB_MIGRATION_USER=... DB_MIGRATION_PASSWORD=... DB_USER=<role aplikasi> npm run db:grant-app
require('dotenv').config();
const { Client } = require('pg');
const { migrationDatabaseUrl } = require('../src/db/urls');
const { applyAppRole, appRoleFromEnv } = require('../src/db/app-role');

(async () => {
  const c = new Client({ connectionString: migrationDatabaseUrl() });
  await c.connect();
  try {
    await applyAppRole({
      query: async (sql) => (await c.query(sql)).rows,
      schema: process.env.DB_SCHEMA || 'ewi',
      role: appRoleFromEnv(),
      log: (m) => console.log(m),
    });
  } finally { await c.end(); }
})().catch((e) => { console.error(e.message); process.exit(1); });
