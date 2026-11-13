const { createFlagService, FLAGS } = require('../../src/core/flags');
const { createAuditService, memoryAuditStore } = require('../../src/core/audit');

describe('R2-1 kill switch', () => {
  const store = (tenant, kills) => ({ getTenantFlags: async () => tenant, getKillSwitches: async () => kills });

  it('kill switch mengalahkan flag tenant yang menyala', async () => {
    const f = createFlagService(store({ [FLAGS.DNA_AI_INTERVIEW]: true }, { [FLAGS.DNA_AI_INTERVIEW]: true }));
    expect(await f.isEnabled('t', FLAGS.DNA_AI_INTERVIEW)).toBe(false);
    expect((await f.all('t'))[FLAGS.DNA_AI_INTERVIEW]).toBe(false);
    const row = (await f.detail('t')).find((x) => x.key === FLAGS.DNA_AI_INTERVIEW);
    expect(row).toEqual({ key: FLAGS.DNA_AI_INTERVIEW, tenantEnabled: true, killSwitch: true, effective: false });
  });

  it('kill switch tidak menyalakan flag yang mati; store tanpa kill switch tetap jalan', async () => {
    expect(await createFlagService(store({}, { [FLAGS.MODULE_DNA]: false })).isEnabled('t', FLAGS.MODULE_DNA)).toBe(false);
    const legacy = createFlagService({ getTenantFlags: async () => ({ [FLAGS.MODULE_DNA]: true }) });
    expect(await legacy.isEnabled('t', FLAGS.MODULE_DNA)).toBe(true);
  });

  it('menolak flag tak dikenal saat diubah', async () => {
    await expect(createFlagService(store({}, {})).setTenantFlag('t', 'x.y', true, 'u')).rejects.toThrow(/tidak dikenal/);
  });
});

describe('R2-2 audit baca data individu', () => {
  const req = { tenantId: 't-1', user: { id: 'u-spv', role: 'supervisor' } };

  it('mencatat siapa, tenant, karyawan, dan objek', async () => {
    const s = memoryAuditStore();
    await createAuditService(s).readIndividual(req, 'tna.findings', { employeeIds: ['a', 'b', 'a', null], objectType: 'tna_finding', objectIds: ['f1'] });
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0]).toMatchObject({
      tenantId: 't-1', userId: 'u-spv', action: 'read', resource: 'tna.findings',
      meta: { role: 'supervisor', employeeIds: ['a', 'b'], self: false, objectType: 'tna_finding', objectIds: ['f1'] },
    });
    expect(s.rows[0].at).toBeInstanceOf(Date);
  });

  it('tidak mencatat bila tidak ada data individu yang dikembalikan', async () => {
    const s = memoryAuditStore();
    await createAuditService(s).readIndividual(req, 'tna.findings', { employeeIds: [] });
    expect(s.rows).toHaveLength(0);
  });

  it('gagal mencatat = gagal (fail closed)', async () => {
    const audit = createAuditService({ insert: async () => { throw new Error('db down'); } });
    await expect(audit.readIndividual(req, 'dna.employee_result', { employeeIds: ['a'] })).rejects.toThrow('db down');
  });
});
