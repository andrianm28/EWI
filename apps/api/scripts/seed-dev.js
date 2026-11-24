'use strict';
// Data uji tenant "demo" untuk dev dan staging. Aman diulang (idempoten).
//
// Di mana jalan:
// - dev lokal dan stack dev etavm2 (deploy/dev-worktree/dev.sh): `npm run seed:dev`.
// - STAGING: deploy/vps/deploy.sh langkah 6 menjalankan seed ini setelah deploy sukses (NODE_ENV=development
//   di dalam kontainer). Tenant demo di staging jadi berisi semua flag layar demo (scripts/demo-flags.js),
//   data demo per layar (scripts/seed-demo-data.js), dan akun eta_admin eta@demo.test. Akun itu hanya bisa
//   masuk bila emailnya ada di ETA_ADMIN_EMAILS (etaAdminRequireList); di produksi daftar wajib dan seed tidak jalan.
// - PRODUKSI: tidak pernah. Seed menolak NODE_ENV=production (data nyata, R2-4).
require('dotenv').config();
const { Client } = require('pg');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { DEMO_FLAGS } = require('./demo-flags');
const { seedDemoData } = require('./seed-demo-data');

/** Isi tenant demo lewat klien pg `c` (search_path sudah di schema ELGOS). Mengembalikan id penting untuk test. */
async function seedDev(c, { password, stores, slug = 'demo', env = process.env } = {}) {
  if (env.NODE_ENV === 'production') throw new Error('seed-dev dilarang di produksi');
  const hash = await bcrypt.hash(password, 10);
  const { rows: [t] } = await c.query(
    `INSERT INTO tenants (slug, name) VALUES ($1, 'Demo Organisasi')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [slug]);
  const { rows: [hr] } = await c.query(
    `INSERT INTO users (tenant_id, email, name, role, password_hash, status) VALUES ($1, 'hr@demo.test', 'HR Demo', 'hr_admin', $2, 'active')
     ON CONFLICT (tenant_id, email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`, [t.id, hash]);
  // Pengelola tenant (B11): sejak masa interim HR dicabut 24 Nov, hanya tenant_admin yang membuka layar Admin Tenant
  await c.query(
    `INSERT INTO users (tenant_id, email, name, role, password_hash, status) VALUES ($1, 'admin@demo.test', 'Admin Tenant Demo', 'tenant_admin', $2, 'active')
     ON CONFLICT (tenant_id, email) DO UPDATE SET password_hash = EXCLUDED.password_hash`, [t.id, hash]);
  // Super Admin demo (eta_admin): konsol Tenant dan Konfigurasi platform. Bila ETA_ADMIN_EMAILS diisi, tambahkan
  // eta@demo.test ke daftar itu; di produksi seed ini tidak pernah jalan.
  await c.query(
    `INSERT INTO users (tenant_id, email, name, role, password_hash, status) VALUES ($1, 'eta@demo.test', 'Super Admin Demo', 'eta_admin', $2, 'active')
     ON CONFLICT (tenant_id, email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, status = 'active'`, [t.id, hash]);
  await c.query(
    `INSERT INTO users (tenant_id, email, name, role, password_hash, status, supervisor_id) VALUES ($1, 'learner@demo.test', 'Learner Demo', 'learner', $2, 'active', $3)
     ON CONFLICT (tenant_id, email) DO NOTHING`, [t.id, hash, hr.id]);
  // Data contoh POC DNA + TNA: jenjang 4 level, kamus kompetensi kecil, atasan + 3 anggota tim, data kinerja.
  const { rows: [spv] } = await c.query(
    `INSERT INTO users (tenant_id, email, name, role, password_hash, status, employee_id) VALUES ($1, 'spv@demo.test', 'Atasan Demo', 'supervisor', $2, 'active', 'D-SPV')
     ON CONFLICT (tenant_id, email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`, [t.id, hash]);
  // Gap B2 (K2, mockup admin 3 tampilan): Admin Tenant juga HR. Tampilan "Karyawan (saya)" untuk HR, Atasan, dan Admin
  // ditambahkan API sendiri (switchableRoles) selama flag auth.multi_role menyala (DEMO_FLAGS).
  await c.query(`INSERT INTO user_roles (tenant_id, user_id, role, granted_by)
                 SELECT u.tenant_id, u.id, 'hr_admin', $2 FROM users u WHERE u.tenant_id = $1 AND u.email = 'admin@demo.test'
                 ON CONFLICT (user_id, role) DO NOTHING`, [t.id, hr.id]);
  // Pimpinan kedua (gap B4): belum ditugaskan wawancara visi & nilai oleh HR, supaya Tugaskan / Tugaskan semua aktif
  await c.query(
    `INSERT INTO users (tenant_id, email, name, role, password_hash, status, employee_id) VALUES ($1, 'pimpinan@demo.test', 'Kepala Divisi Demo', 'pimpinan', $2, 'active', 'D-PIMPINAN')
     ON CONFLICT (tenant_id, email) DO UPDATE SET password_hash = EXCLUDED.password_hash`, [t.id, hash]);
  const { rows: [role] } = await c.query(
    `INSERT INTO lna_job_roles (tenant_id, name, division) VALUES ($1, 'Service Delivery L1', 'Service Delivery')
     ON CONFLICT (tenant_id, name) DO UPDATE SET division = EXCLUDED.division RETURNING id`, [t.id]);
  const levelIds = [];
  for (const [i, [name, tier]] of [['Probation', 'basic'], ['Junior', 'basic'], ['Senior', 'intermediate'], ['Leader', 'advanced']].entries()) {
    const { rows: [l] } = await c.query(
      `INSERT INTO lna_career_levels (tenant_id, job_role_id, name, level_order, required_program_tier) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (job_role_id, level_order) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [t.id, role.id, name, i, tier]);
    levelIds.push(l.id);
  }
  const { rows: [{ n }] } = await c.query('SELECT count(*)::int AS n FROM lna_competencies WHERE tenant_id = $1', [t.id]);
  if (n === 0) {
    for (const [name, kind, roleId, importance] of [
      ['Memahami kontrak proyek', 'job', role.id, 4], ['Menjalankan SOP L1', 'job', role.id, 3],
      ['Troubleshooting jaringan dasar', 'job', role.id, 3], ['Komunikasi pelanggan', 'core', null, 3],
    ]) {
      await c.query(`INSERT INTO lna_competencies (tenant_id, job_role_id, kind, name, source, importance) VALUES ($1, $2, $3, $4, 'hr_rule', $5)`,
        [t.id, roleId, kind, name, importance]);
    }
  }
  const members = [];
  for (const [key, name, lvl] of [['dimas', 'Dimas', 1], ['rina', 'Rina', 1], ['budi', 'Budi', 0]]) {
    const { rows: [m] } = await c.query(
      `INSERT INTO users (tenant_id, email, name, role, password_hash, status, supervisor_id, employee_id, job_role_id, career_level_id)
       VALUES ($1, $2, $3, 'learner', $4, 'active', $5, $6, $7, $8)
       ON CONFLICT (tenant_id, email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
      [t.id, `${key}@demo.test`, name, hash, spv.id, `D-${key.toUpperCase()}`, role.id, levelIds[lvl]]);
    members.push(m.id);
  }
  await c.query(`INSERT INTO lna_program_completions (tenant_id, user_id, program_tier, status, passed_at) VALUES
                 ($1, $2, 'basic', 'passed', now()), ($1, $3, 'basic', 'passed', now()), ($1, $3, 'intermediate', 'passed', now())
                 ON CONFLICT DO NOTHING`, [t.id, members[0], members[1]]);
  // Contoh hasil wawancara DNA manual (cadence 11 Nov, C2): diisi sekali saja agar seed tetap idempoten
  const { rows: [{ m }] } = await c.query(`SELECT count(*)::int AS m FROM lna_assessments WHERE tenant_id = $1 AND source = 'manual_interview'`, [t.id]);
  if (m === 0) {
    const { rows: comps } = await c.query('SELECT id, name FROM lna_competencies WHERE tenant_id = $1', [t.id]);
    const scores = {
      'Memahami kontrak proyek': [2, 4, 1], 'Menjalankan SOP L1': [3, 3, 2],
      'Troubleshooting jaringan dasar': [3, 4, 2], 'Komunikasi pelanggan': [4, 3, 3],
    };
    for (const comp of comps) {
      const row = scores[comp.name];
      if (!row) continue;
      for (const [i, userId] of members.entries()) {
        await c.query(`INSERT INTO lna_assessments (tenant_id, user_id, competency_id, score, confidence, evidence, source, assessor, assessed_at)
                       VALUES ($1, $2, $3, $4, 1, $5, 'manual_interview', 'Tim ETA', '2026-10-20')`,
        [t.id, userId, comp.id, row[i], await stores.cipher.encrypt(t.id, 'Contoh hasil wawancara manual (seed)')]);
      }
    }
  }
  // BT-19: POC ELGOS L1 mewawancarai semua anggota tim Service Delivery L1 (BT-29: cakupan per klien)
  await c.query(`UPDATE tenants SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{tna}', $2::jsonb) WHERE id = $1`,
    [t.id, JSON.stringify({ interviewScope: 'all_members', interviewJobRoleId: role.id })]);
  await c.query(`DELETE FROM entitlements WHERE tenant_id = $1`, [t.id]);
  await c.query(`INSERT INTO entitlements (tenant_id, product, source) VALUES ($1, 'full_suite', 'seed')`, [t.id]);
  // Demo 25 Nov: semua flag layar demo menyala di tenant dev (daftar di scripts/demo-flags.js, sama dengan e2e demo)
  for (const key of DEMO_FLAGS) {
    await c.query(`INSERT INTO feature_flags (tenant_id, key, enabled) VALUES ($1, $2, true)
                   ON CONFLICT (tenant_id, key) DO UPDATE SET enabled = true`, [t.id, key]);
  }
  const demo = await seedDemoData(c, { stores, tenantId: t.id, jobRoleId: role.id, levelIds, hrId: hr.id, spvId: spv.id, memberIds: members });
  return { tenantId: t.id, jobRoleId: role.id, hrId: hr.id, spvId: spv.id, memberIds: members, ...demo };
}

async function main(env = process.env) {
  if (env.NODE_ENV === 'production') throw new Error('seed-dev dilarang di produksi');
  // Store ELGOS (enkripsi per tenant) memakai konfigurasi yang sama dengan API: dev/staging = kunci induk lokal
  const { loadConfig } = require('../src/config/env');
  const { createDb } = require('../src/db');
  const { createStores } = require('../src/db/stores');
  const config = loadConfig(env);
  const db = createDb(config);
  const stores = createStores(db, { encryption: config.encryption });
  const c = new Client({ connectionString: env.DATABASE_URL });
  await c.connect();
  try {
    await c.query(`SET search_path TO "${config.dbSchema}"`);
    // Password diambil dari DEV_SEED_PASSWORD atau dibangkitkan acak lalu dicetak sekali.
    const password = env.DEV_SEED_PASSWORD || crypto.randomBytes(9).toString('base64url');
    await seedDev(c, { password, stores, env });
    // Password hanya dicetak bila dibuat acak di sini; bila dari DEV_SEED_PASSWORD, pemilik env sudah tahu
    const pwNote = env.DEV_SEED_PASSWORD ? 'password dari DEV_SEED_PASSWORD' : `password acak ${password} (set DEV_SEED_PASSWORD agar tidak dicetak)`;
    console.log(`seed selesai: tenant demo, admin@demo.test, eta@demo.test, hr@demo.test, spv@demo.test, pimpinan@demo.test, learner@demo.test, dimas|rina|budi@demo.test, ${pwNote}`);
  } finally {
    await c.end();
    await db.close();
  }
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });

module.exports = { seedDev, main };
