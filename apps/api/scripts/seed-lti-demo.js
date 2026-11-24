'use strict';
// EM-LTI: data demo EliteMentor (simulasi) lewat LTI untuk tenant "demo" (spek docs/designs/em-lti-platform.md §7).
// Idempoten; dijalankan deploy/dev-worktree/dev.sh setiap `up` (juga pada DB yang sudah di-seed sebelumnya).
// Dev/staging saja: menolak NODE_ENV=production. Isi:
// - tool "EliteMentor (simulasi)" (login/launch relatif /em-sim/..., JWKS internal compose) dan flag em.lti menyala
// - resource link untuk rencana belajar SD-B1 karyawan demo (status penugasan terkirim)
// - pelatihan offline "Workshop Automation & IaC" (asesmen EliteMentor, kode IAC-1512) untuk karyawan, plus resource link
require('dotenv').config();
const { Client } = require('pg');

const TOOL = Object.freeze({
  name: 'EliteMentor (simulasi)',
  loginUrl: '/em-sim/lti/login',
  launchUrl: '/em-sim/lti/launch',
  jwksUrl: 'http://em-sim:4300/lti/keys',
});
const OFFLINE_TITLE = 'Workshop Automation & IaC';
const OFFLINE_REF = 'IAC-1512';

async function seedLtiDemo(c, { slug = 'demo', env = process.env } = {}) {
  if (env.NODE_ENV === 'production') throw new Error('seed-lti-demo dilarang di produksi');
  const clientId = env.EM_SIM_CLIENT_ID || 'elitementor-sim';
  const deploymentId = env.EM_SIM_DEPLOYMENT_ID || 'elgos-demo';
  const jwksUrl = env.EM_SIM_JWKS_URL || TOOL.jwksUrl;
  const { rows: [t] } = await c.query('SELECT id FROM tenants WHERE slug = $1', [slug]);
  if (!t) throw new Error(`seed-lti-demo: tenant ${slug} belum ada (jalankan seed:dev dulu)`);
  const { rows: [tool] } = await c.query(
    `INSERT INTO lti_tools (tenant_id, name, client_id, deployment_id, login_url, launch_url, redirect_uris, jwks_url, status)
     VALUES ($1, $2, $3, $4, $5, $6::varchar, ARRAY[$6::text], $7, 'active')
     ON CONFLICT (client_id) DO UPDATE SET deployment_id = EXCLUDED.deployment_id, login_url = EXCLUDED.login_url, launch_url = EXCLUDED.launch_url,
       redirect_uris = EXCLUDED.redirect_uris, jwks_url = EXCLUDED.jwks_url, status = 'active', updated_at = now()
     WHERE lti_tools.tenant_id = EXCLUDED.tenant_id
     RETURNING id`, [t.id, TOOL.name, clientId, deploymentId, TOOL.loginUrl, TOOL.launchUrl, jwksUrl]);
  if (!tool) throw new Error('seed-lti-demo: client_id simulator sudah dipakai tenant lain');
  await c.query(`INSERT INTO feature_flags (tenant_id, key, enabled) VALUES ($1, 'em.lti', true)
                 ON CONFLICT (tenant_id, key) DO UPDATE SET enabled = true`, [t.id]);

  // Rencana SD-B1 karyawan demo: sudah ditugaskan (mode LTI) agar karyawan bisa langsung belajar
  const { rows: plans } = await c.query(
    `SELECT p.id, p.user_id, p.catalog_item_ref, p.catalog_item_title FROM lna_training_plan_items p JOIN users u ON u.id = p.user_id
      WHERE p.tenant_id = $1 AND u.email = $2 AND p.catalog_source = 'elitementor' AND p.catalog_item_ref = 'SD-B1'`, [t.id, `learner@${slug}.test`]);
  for (const p of plans) {
    const { rows: [link] } = await c.query(
      `INSERT INTO lti_resource_links (tenant_id, tool_id, kind, plan_item_id, user_id, course_ref, title)
       VALUES ($1, $2, 'plan_item', $3, $4, $5, $6)
       ON CONFLICT (tenant_id, plan_item_id) WHERE plan_item_id IS NOT NULL DO UPDATE SET tool_id = EXCLUDED.tool_id
       RETURNING id`, [t.id, tool.id, p.id, p.user_id, p.catalog_item_ref, 'Root Cause Analysis']);
    await c.query(`UPDATE lna_training_plan_items SET assignment_status = 'sent', assignment_target = 'elitementor', assignment_ref = $3,
                          assigned_at = COALESCE(assigned_at, now()) WHERE tenant_id = $1 AND id = $2`, [t.id, p.id, link.id]);
  }

  // Pelatihan offline dengan ujian di EliteMentor (check-in kode sesi), untuk semua karyawan (peran learner) tenant
  const { rows: [hr] } = await c.query(`SELECT id FROM users WHERE tenant_id = $1 AND role = 'hr_admin' ORDER BY created_at LIMIT 1`, [t.id]);
  let { rows: [training] } = await c.query('SELECT id FROM ld_trainings WHERE tenant_id = $1 AND title = $2', [t.id, OFFLINE_TITLE]);
  if (!training) {
    ({ rows: [training] } = await c.query(
      `INSERT INTO ld_trainings (tenant_id, title, mode, source, program_tier, vendor_name, venue, starts_on, ends_on, session_count, sessions_done,
                                 status, materials_ready, assessment_mode, assessment_ref, created_by)
       VALUES ($1, $2, 'offline', 'manual', 'intermediate', 'Mahaka Institute', 'Kantor Elitery, Jakarta', (now() AT TIME ZONE 'Asia/Jakarta')::date,
               (now() AT TIME ZONE 'Asia/Jakarta')::date, 1, 0, 'scheduled', true, 'elitementor', $3, $4) RETURNING id`,
      [t.id, OFFLINE_TITLE, OFFLINE_REF, hr ? hr.id : null]));
  }
  await c.query(`INSERT INTO ld_participants (tenant_id, training_id, user_id)
                 SELECT $1, $2, u.id FROM users u WHERE u.tenant_id = $1 AND u.role = 'learner' AND u.status = 'active'
                 ON CONFLICT (training_id, user_id) DO NOTHING`, [t.id, training.id]);
  await c.query(`INSERT INTO lti_resource_links (tenant_id, tool_id, kind, training_id, course_ref, title)
                 VALUES ($1, $2, 'offline_training', $3, $4, $5)
                 ON CONFLICT (tenant_id, training_id) WHERE training_id IS NOT NULL DO UPDATE SET tool_id = EXCLUDED.tool_id`,
  [t.id, tool.id, training.id, OFFLINE_REF, OFFLINE_TITLE]);
  return { tenantId: t.id, toolId: tool.id, trainingId: training.id, planLinks: plans.length };
}

async function main(env = process.env) {
  if (env.NODE_ENV === 'production') throw new Error('seed-lti-demo dilarang di produksi');
  const schema = env.DB_SCHEMA || 'ewi';
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('DB_SCHEMA tidak valid');
  const c = new Client({ connectionString: env.DATABASE_URL });
  await c.connect();
  try {
    await c.query(`SET search_path TO "${schema}"`);
    const out = await seedLtiDemo(c, { env });
    console.log(`seed EliteMentor (simulasi) selesai: em.lti menyala, ${out.planLinks} rencana tertaut, pelatihan offline ${OFFLINE_REF}`);
  } finally {
    await c.end();
  }
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });

module.exports = { seedLtiDemo, TOOL, OFFLINE_REF };
