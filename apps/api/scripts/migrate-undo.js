'use strict';
// Turunkan migrasi dengan pengaman (R-3). Pakai ini, bukan `sequelize-cli db:migrate:undo` langsung.
//   node scripts/migrate-undo.js            -> turunkan satu migrasi terakhir
//   node scripts/migrate-undo.js --all      -> turunkan semua
//   node scripts/migrate-undo.js --to <nama-berkas.js>
require('dotenv').config();
const path = require('path');
const { spawnSync } = require('child_process');
const { Client } = require('pg');
const { migrationDatabaseUrl } = require('../src/db/urls');
const { migrationsToUndo, checkUndo } = require('../src/db/undo-guard');

(async () => {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const toIdx = args.indexOf('--to');
  const to = toIdx >= 0 ? args[toIdx + 1] : null;
  const schema = process.env.DB_SCHEMA || 'ewi';
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error(`Nama schema tidak valid: ${schema}`);

  const c = new Client({ connectionString: migrationDatabaseUrl() });
  await c.connect();
  let refusals;
  try {
    await c.query(`SET search_path TO "${schema}"`);
    const meta = await c.query(`SELECT to_regclass('"${schema}".sequelize_meta') AS t`);
    const applied = meta.rows[0].t ? (await c.query('SELECT name FROM sequelize_meta')).rows.map((r) => r.name) : [];
    const targets = migrationsToUndo(applied, { all, to });
    if (!targets.length) { console.log('tidak ada migrasi untuk diturunkan'); return; }
    refusals = await checkUndo(async (sql) => (await c.query(sql)).rows, targets);
  } finally { await c.end(); }
  if (refusals.length) {
    for (const r of refusals) console.error(`DITOLAK ${r.migration}: ${r.reason}`);
    process.exit(2);
  }
  const cliArgs = all ? ['db:migrate:undo:all'] : to ? ['db:migrate:undo:all', '--to', to] : ['db:migrate:undo'];
  const cli = require.resolve('sequelize-cli/lib/sequelize');
  const out = spawnSync(process.execPath, [cli, ...cliArgs], { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  process.exit(out.status ?? 1);
})().catch((e) => { console.error(e.message); process.exit(1); });
