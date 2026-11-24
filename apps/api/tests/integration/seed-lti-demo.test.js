// EM-LTI §7: seed EliteMentor (simulasi) idempoten, menyalakan em.lti, menautkan rencana SD-B1 dan pelatihan offline.
const { Client } = require('pg');
const { seedLtiDemo } = require('../../scripts/seed-lti-demo');

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('seed-lti-demo (Postgres)', () => {
  let c; let tenantId; const slug = `ltiseed${Date.now()}`;
  beforeAll(async () => {
    c = new Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();
    await c.query(`SET search_path TO "${process.env.DB_SCHEMA || 'ewi'}"`);
    ({ rows: [{ id: tenantId }] } = await c.query(`INSERT INTO tenants (slug, name) VALUES ($1, 'Seed LTI') RETURNING id`, [slug]));
    const { rows: [l] } = await c.query(`INSERT INTO users (tenant_id, email, name, role, status) VALUES ($1, $2, 'L', 'learner', 'active') RETURNING id`, [tenantId, `learner@${slug}.test`]);
    await c.query(`INSERT INTO users (tenant_id, email, name, role, status) VALUES ($1, $2, 'H', 'hr_admin', 'active')`, [tenantId, `hr@${slug}.test`]);
    await c.query(`INSERT INTO lna_training_plan_items (tenant_id, user_id, origin, status, catalog_source, catalog_item_ref, catalog_item_title)
                   VALUES ($1, $2, 'hr', 'new', 'elitementor', 'SD-B1', 'RCA')`, [tenantId, l.id]);
  });
  afterAll(async () => {
    await c.query('BEGIN'); await c.query("SET LOCAL ewi.audit_maintenance = 'on'");
    await c.query('DELETE FROM tenants WHERE id = $1', [tenantId]); await c.query('COMMIT');
    await c.end();
  });

  test('dua kali jalan = satu tool, satu link per sasaran, flag menyala, rencana terkirim', async () => {
    const env = { NODE_ENV: 'development', EM_SIM_CLIENT_ID: `sim-${slug}` };
    const a = await seedLtiDemo(c, { slug, env });
    const b = await seedLtiDemo(c, { slug, env });
    expect(b).toEqual(a);
    const q = async (sql) => (await c.query(sql, [tenantId])).rows;
    expect(await q('SELECT count(*)::int AS n FROM lti_tools WHERE tenant_id = $1')).toEqual([{ n: 1 }]);
    expect(await q("SELECT kind, course_ref FROM lti_resource_links WHERE tenant_id = $1 ORDER BY kind")).toEqual([
      { kind: 'offline_training', course_ref: 'IAC-1512' }, { kind: 'plan_item', course_ref: 'SD-B1' }]);
    expect(await q("SELECT enabled FROM feature_flags WHERE tenant_id = $1 AND key = 'em.lti'")).toEqual([{ enabled: true }]);
    expect(await q('SELECT assignment_status FROM lna_training_plan_items WHERE tenant_id = $1')).toEqual([{ assignment_status: 'sent' }]);
    expect(await q('SELECT count(*)::int AS n FROM ld_participants WHERE tenant_id = $1')).toEqual([{ n: 1 }]);
  });

  test('menolak produksi dan tenant yang belum ada', async () => {
    await expect(seedLtiDemo(c, { slug, env: { NODE_ENV: 'production' } })).rejects.toThrow(/produksi/);
    await expect(seedLtiDemo(c, { slug: 'tidak-ada-x', env: {} })).rejects.toThrow(/belum ada/);
  });
});
