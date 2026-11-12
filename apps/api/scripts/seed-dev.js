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
  // Data contoh POC DNA + TNA: jenjang 4 level, kamus kompetensi kecil, atasan + 3 anggota tim, data kinerja.
  const { rows: [spv] } = await c.query(
    `INSERT INTO users (tenant_id, email, name, role, password_hash, status, employee_id) VALUES ($1, 'spv@demo.test', 'Atasan Demo', 'supervisor', $2, 'active', 'D-SPV')
     ON CONFLICT (tenant_id, email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`, [t.id, hash]);
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
                       VALUES ($1, $2, $3, $4, 1, 'Contoh hasil wawancara manual (seed)', 'manual_interview', 'Tim ETA', '2026-10-20')`,
        [t.id, userId, comp.id, row[i]]);
      }
    }
  }
  await c.query(`DELETE FROM entitlements WHERE tenant_id = $1`, [t.id]);
  await c.query(`INSERT INTO entitlements (tenant_id, product, source) VALUES ($1, 'full_suite', 'seed')`, [t.id]);
  for (const key of ['module.dna', 'module.tna']) {
    await c.query(`INSERT INTO feature_flags (tenant_id, key, enabled) VALUES ($1, $2, true)
                   ON CONFLICT (tenant_id, key) DO UPDATE SET enabled = true`, [t.id, key]);
  }
  await c.end();
  console.log(`seed selesai: tenant demo, hr@demo.test, spv@demo.test, dimas|rina|budi@demo.test, password ${password}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
