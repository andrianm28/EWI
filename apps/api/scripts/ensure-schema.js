'use strict';
// Buat schema `ewi` sebelum sequelize-cli membuat tabel meta di dalamnya.
require('dotenv').config();
const { Client } = require('pg');
const { migrationDatabaseUrl } = require('../src/db/urls');

(async () => {
  const schema = process.env.DB_SCHEMA || 'ewi';
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error(`Nama schema tidak valid: ${schema}`);
  const c = new Client({ connectionString: migrationDatabaseUrl() });
  await c.connect();
  await c.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await c.end();
  console.log(`schema "${schema}" siap`);
})().catch((e) => { console.error(e.message); process.exit(1); });
