// B12: platform_audit_logs append-only (fungsi trigger sendiri). Spek: docs/designs/b12-super-admin.md §Log audit platform.
const { createDb } = require('../../src/db');

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('B12 log audit platform append-only (Postgres)', () => {
  let db; let tenantId; let userId; let logId;
  const sel = (sql, replacements = {}) => db.query(sql, { replacements, type: 'SELECT' });
  const stamp = Date.now();

  beforeAll(async () => {
    db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' });
    [{ id: tenantId }] = await sel('INSERT INTO tenants (slug, name) VALUES (:s, :s) RETURNING id', { s: `b12-log-${stamp}` });
    [{ id: userId }] = await sel(`INSERT INTO users (tenant_id, email, role) VALUES (:t, :e, 'eta_admin') RETURNING id`,
      { t: tenantId, e: `log-${stamp}@b12.test` });
    [{ id: logId }] = await sel(
      `INSERT INTO platform_audit_logs (actor_user_id, actor_tenant_id, action, resource, target_tenant_id, meta)
       VALUES (:u, :t, 'update', 'tenant.module', :t, '{"module":"tna"}') RETURNING id`, { u: userId, t: tenantId });
  });

  afterAll(async () => {
    await db.transaction(async (transaction) => {
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM platform_audit_logs WHERE id = :id', { replacements: { id: logId }, transaction });
      await db.query('DELETE FROM tenants WHERE id = :t', { replacements: { t: tenantId }, transaction });
    });
    await db.close();
  });

  it('UPDATE, DELETE, dan TRUNCATE ditolak trigger', async () => {
    await expect(db.query("UPDATE platform_audit_logs SET resource = 'tenant' WHERE id = :id", { replacements: { id: logId } })).rejects.toThrow(/append-only|tidak boleh/i);
    await expect(db.query('DELETE FROM platform_audit_logs WHERE id = :id', { replacements: { id: logId } })).rejects.toThrow(/append-only|tidak boleh/i);
    await expect(db.query('TRUNCATE platform_audit_logs')).rejects.toThrow(/append-only|tidak boleh/i);
  });

  it('UPDATE yang hanya mengosongkan kolom FK tetap ditolak bila mengubah kolom lain', async () => {
    await expect(db.query("UPDATE platform_audit_logs SET actor_user_id = NULL, meta = '{}' WHERE id = :id", { replacements: { id: logId } }))
      .rejects.toThrow(/append-only|tidak boleh/i);
  });

  it('menghapus akun pelaku lalu tenant mengosongkan kolom FK tanpa galat', async () => {
    await db.query('DELETE FROM users WHERE id = :u', { replacements: { u: userId } });
    expect(await sel('SELECT actor_user_id AS "u", actor_tenant_id AS "t" FROM platform_audit_logs WHERE id = :id', { id: logId }))
      .toEqual([{ u: null, t: tenantId }]);
    await db.transaction(async (transaction) => {
      // audit_logs tenant (bukan log platform) butuh mode pemeliharaan untuk penghapusan tenant
      await db.query("SET LOCAL ewi.audit_maintenance = 'on'", { transaction });
      await db.query('DELETE FROM tenants WHERE id = :t', { replacements: { t: tenantId }, transaction });
    });
    expect(await sel('SELECT actor_tenant_id AS "a", target_tenant_id AS "t", meta FROM platform_audit_logs WHERE id = :id', { id: logId }))
      .toEqual([{ a: null, t: null, meta: { module: 'tna' } }]);
  });
});
