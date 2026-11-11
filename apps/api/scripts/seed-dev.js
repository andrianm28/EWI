'use strict';
// Data dev: tenant "demo", user HR + learner, paket full_suite, flag DNA & TNA menyala (POC Des, RG-4).
// Jangan dijalankan di staging/produksi.
require('dotenv').config();
const { Client } = require('pg');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

(async () => {
  if (process.env.NODE_ENV === 'production') throw new Error('seed-dev dilarang di produksi');
  const schema = process.env.DB_SCHEMA || 'ewi';
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query(`SET search_path TO "${schema}"`);
  // Password diambil dari DEV_SEED_PASSWORD atau dibangkitkan acak lalu dicetak sekali.
  const password = process.env.DEV_SEED_PASSWORD || crypto.randomBytes(9).toString('base64url');
  const hash = await bcrypt.hash(password, 10);
  const { rows: [t] } = await c.query(
    `INSERT INTO tenants (slug, name) VALUES ('demo', 'Demo Organisasi')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`);
  const { rows: [hr] } = await c.query(
    `INSERT INTO users (tenant_id, email, name, role, password_hash, status) VALUES ($1, 'hr@demo.test', 'HR Demo', 'hr_admin', $2, 'active')
     ON CONFLICT (tenant_id, email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`, [t.id, hash]);
  await c.query(
    `INSERT INTO users (tenant_id, email, name, role, password_hash, status, supervisor_id) VALUES ($1, 'learner@demo.test', 'Learner Demo', 'learner', $2, 'active', $3)
     ON CONFLICT (tenant_id, email) DO NOTHING`, [t.id, hash, hr.id]);
  await c.query(`DELETE FROM entitlements WHERE tenant_id = $1`, [t.id]);
  await c.query(`INSERT INTO entitlements (tenant_id, product, source) VALUES ($1, 'full_suite', 'seed')`, [t.id]);
  for (const key of ['module.dna', 'module.tna']) {
    await c.query(`INSERT INTO feature_flags (tenant_id, key, enabled) VALUES ($1, $2, true)
                   ON CONFLICT (tenant_id, key) DO UPDATE SET enabled = true`, [t.id, key]);
  }
  await c.end();
  console.log(`seed selesai: tenant demo, hr@demo.test / learner@demo.test, password ${password}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
