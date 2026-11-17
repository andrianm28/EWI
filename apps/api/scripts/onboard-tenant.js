'use strict';
// PK-13: onboarding tenant ELGOS tanpa SQL manual. Runbook: docs/ewi/onboarding-tenant.md
//
//   node scripts/onboard-tenant.js --uuid-baru                 # cetak UUID baru untuk tenant_ids Terraform
//   node scripts/onboard-tenant.js tenants/hr-elitery.json --periksa   # uji tanpa menyimpan
//   node scripts/onboard-tenant.js tenants/hr-elitery.json             # jalankan (aman diulang)
//   node scripts/onboard-tenant.js tenants/hr-elitery.json --kirim-undangan
//
// Memakai env yang sama dengan API (DATABASE_URL, DB_SCHEMA, ENCRYPTION_PROVIDER, KMS_*, MAIL_*, APP_BASE_URL).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const USAGE = 'Pakai: node scripts/onboard-tenant.js <spesifikasi.json> [--periksa] [--kirim-undangan] | --uuid-baru';

async function main(argv = process.argv.slice(2), env = process.env) {
  if (argv.includes('--uuid-baru')) { console.log(crypto.randomUUID()); return; }
  const file = argv.find((a) => !a.startsWith('--'));
  const unknown = argv.filter((a) => a.startsWith('--') && !['--periksa', '--kirim-undangan'].includes(a));
  if (!file || unknown.length) throw new Error(unknown.length ? `Opsi tidak dikenal: ${unknown.join(' ')}\n${USAGE}` : USAGE);
  const dryRun = argv.includes('--periksa');
  const invite = argv.includes('--kirim-undangan');
  if (dryRun && invite) throw new Error('--periksa tidak bisa digabung dengan --kirim-undangan');

  let spec;
  try { spec = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')); } catch (e) { throw new Error(`Gagal membaca ${file}: ${e.message}`); }

  const { loadConfig } = require('../src/config/env');
  const { createProvider } = require('../src/core/crypto');
  const { onboardTenant } = require('../src/core/tenant/onboarding');
  const config = loadConfig(env); // aturan yang sama dengan API: produksi wajib KMS + SES
  const { Client } = require('pg');
  const db = new Client({ connectionString: config.databaseUrl });
  await db.connect();
  try {
    await db.query(`SET search_path TO "${config.dbSchema}"`);
    const result = await onboardTenant({
      db, provider: createProvider(config.encryption), spec, production: config.nodeEnv === 'production', dryRun,
    });
    console.log(`${dryRun ? '[PERIKSA, tidak disimpan] ' : ''}Tenant ${result.slug} (${result.tenantId})`);
    for (const r of result.report) console.log(`  ${r.status.padEnd(10)} ${r.step.padEnd(11)} ${r.detail}`);
    if (invite) await sendInvites({ db, config, tenantId: result.tenantId, tenantName: result.name, emails: result.users.map((u) => u.email) });
    else if (!dryRun) console.log('Akun pengelola bisa meminta link masuk di halaman login, atau jalankan ulang dengan --kirim-undangan.');
  } finally {
    await db.end();
  }
}

/** Kirim link undangan (7 hari, sekali pakai) ke akun pengelola yang belum pernah masuk. */
async function sendInvites({ db, config, tenantId, tenantName, emails }) {
  const { createMailer } = require('../src/integrations/mailer');
  const { createEmailLinkService } = require('../src/core/auth/email-link');
  const stores = {
    loginLinks: {
      async create({ tenantId: t, userId, tokenHash, purpose, expiresAt }) {
        await db.query(`INSERT INTO login_links (tenant_id, user_id, token_hash, purpose, expires_at) VALUES ($1, $2, $3, $4, $5)`,
          [t, userId, tokenHash, purpose, expiresAt]);
      },
    },
  };
  const links = createEmailLinkService({ stores, mailer: createMailer(config.mail), appBaseUrl: config.appBaseUrl });
  const { rows } = await db.query(
    `SELECT id, tenant_id AS "tenantId", email, name FROM users
      WHERE tenant_id = $1 AND email = ANY($2) AND status <> 'disabled' AND last_login_at IS NULL ORDER BY email`, [tenantId, emails]);
  for (const u of rows) await links.issue(u, 'invite', { tenantName });
  if (rows.length) {
    await db.query(`INSERT INTO audit_logs (tenant_id, action, resource, meta) VALUES ($1, 'create', 'invitation', $2::jsonb)`,
      [tenantId, JSON.stringify({ via: 'scripts/onboard-tenant.js', count: rows.length, userIds: rows.map((u) => u.id) })]);
  }
  console.log(`Undangan terkirim ke ${rows.length} akun (lewat ${config.mail.provider}); yang sudah pernah masuk dilewati.`);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });

module.exports = { main };
