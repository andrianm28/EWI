'use strict';
// B12: satu koneksi Postgres khusus untuk onboarding (transaksi BEGIN/COMMIT milik onboarding sendiri).
// Diekstrak dari scripts/onboard-tenant.js; dipakai skrip operator dan konsol Super Admin.
const { Client } = require('pg');
const { quoteIdent } = require('../../db/app-role');

async function withOnboardingClient({ databaseUrl, dbSchema }, fn) {
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    await db.query(`SET search_path TO ${quoteIdent(dbSchema)}`);
    return await fn(db);
  } finally {
    await db.end();
  }
}

module.exports = { withOnboardingClient };
