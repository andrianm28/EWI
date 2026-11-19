// B3: ringkasan dashboard HR dan dashboard tim atasan. Spek: docs/designs/b3-dashboard.md.
const request = require('supertest');
const { createApp } = require('../../src/app');
const { createTokenService } = require('../../src/core/auth/tokens');
const { memoryAuditStore } = require('../../src/core/audit');
const { markHot, median, agreement } = require('../../src/modules/dashboard/summary');
const { makeConfig, makeStores } = require('../helpers');

const T = 't-1';
const ALL_ON = { 'dashboard.main': true, 'module.dna': true, 'module.tna': true };

/** Store tiruan yang mencatat cakupan setiap panggilan, supaya isolasi tenant dan tim bisa diperiksa. */
function fakeStores({ flags = ALL_ON, entitlements = ['dna', 'tna'], grant = false } = {}) {
  const base = makeStores({ entitlements: { [T]: entitlements }, flags: { [T]: flags } });
  const calls = [];
  const note = (name, tenantId, scope) => { calls.push({ name, tenantId, scope }); };
  const people = [
    { id: 'u-spv', role: 'supervisor', jobRoleId: 'jr', careerLevelId: null, supervisorId: null },
    { id: 'u-a', role: 'learner', jobRoleId: 'jr', careerLevelId: null, supervisorId: 'u-spv' },
    { id: 'u-b', role: 'learner', jobRoleId: 'jr', careerLevelId: null, supervisorId: 'u-spv' },
    { id: 'u-c', role: 'learner', jobRoleId: 'jr', careerLevelId: null, supervisorId: 'u-other' },
  ];
  const pick = (scope, rows, key) => (scope.all ? rows : rows.filter((r) => scope.userIds.includes(r[key])));
  const findings = [
    { id: 'f1', userId: 'u-a', category: 'training', competencyId: 'c1', competencyName: 'Root Cause Analysis', title: 'RCA', importance: 5, target: 100, actual: 60, direction: 'higher', tolerance: 0 },
    { id: 'f2', userId: 'u-b', category: 'training', competencyId: 'c1', competencyName: 'Root Cause Analysis', title: 'RCA', importance: 5, target: 100, actual: 80, direction: 'higher', tolerance: 0 },
    { id: 'f3', userId: 'u-c', category: 'training', competencyId: 'c2', competencyName: 'Ticket Life Cycle', title: 'Tiket', importance: 3, target: null },
  ];
  return {
    calls,
    audit: memoryAuditStore(),
    stores: {
      ...base,
      audit: undefined,
      people: {
        directReportIds: async (tenantId, userId) => people.filter((p) => p.supervisorId === userId).map((p) => p.id),
        list: async (tenantId, scope) => { note('people.list', tenantId, scope); return pick(scope, people, 'id'); },
      },
      dna: {
        assessmentsFor: async (tenantId, ids) => {
          note('dna.assessmentsFor', tenantId, { userIds: ids });
          return [
            { userId: 'u-a', competencyId: 'c1', score: 1, createdAt: '2026-11-01' },
            { userId: 'u-a', competencyId: 'c2', score: 3, createdAt: '2026-11-01' },
            { userId: 'u-c', competencyId: 'c2', score: 0, createdAt: '2026-11-01' },
          ].filter((a) => ids.includes(a.userId));
        },
        competenciesForPosition: async () => [{ id: 'c1', name: 'Root Cause Analysis', kind: 'job', requiredScore: 3 }, { id: 'c2', name: 'Ticket Life Cycle', kind: 'job', requiredScore: 3 }],
        listCompetencies: async (tenantId) => { note('dna.listCompetencies', tenantId); return [{ id: 'c1', approvedAt: '2026-11-02' }, { id: 'c2', approvedAt: null }]; },
      },
      interviews: {
        list: async (tenantId, submodule, scope) => {
          note('interviews.list', tenantId, scope);
          return pick(scope, [
            { id: 's1', intervieweeId: 'u-a', status: 'completed' },
            { id: 's2', intervieweeId: 'u-b', status: 'scheduled' },
            { id: 's3', intervieweeId: 'u-c', status: 'in_progress' },
          ], 'intervieweeId');
        },
      },
      tna: {
        listFindings: async (tenantId, scope, { categories }) => { note('tna.listFindings', tenantId, scope); return pick(scope, findings, 'userId').filter((f) => categories.includes(f.category)); },
        listPerformance: async (tenantId, scope) => {
          note('tna.listPerformance', tenantId, scope);
          return pick(scope, [{ userId: 'u-a', isMet: false }, { userId: 'u-a', isMet: true }, { userId: 'u-c', isMet: false }, { userId: 'u-c', isMet: null }], 'userId');
        },
        listPlanItems: async (tenantId, scope) => { note('tna.listPlanItems', tenantId, scope); return pick(scope, [{ userId: 'u-a', needsModule: true }, { userId: 'u-b', needsModule: false }], 'userId'); },
        reviewCounts: async (tenantId) => { note('tna.reviewCounts', tenantId); return { draft: 4, approved: 22, edited: 2, rejected: 1 }; },
        analysisDurations: async (tenantId, scope) => { note('tna.analysisDurations', tenantId, scope); return pick(scope, [{ userId: 'u-a', days: 10.2 }, { userId: 'u-c', days: 3 }], 'userId'); },
        hasNonTrainingGrant: async (tenantId, userId) => { note('tna.hasNonTrainingGrant', tenantId, { userIds: [userId] }); return grant; },
        listNonTrainingSummary: async (tenantId, { userIds } = {}) => {
          note('tna.listNonTrainingSummary', tenantId, userIds ? { userIds } : { all: true });
          return [{ id: 'n1', userId: 'u-a' }, { id: 'n2', userId: 'u-c' }].filter((f) => !userIds || userIds.includes(f.userId));
        },
      },
    },
  };
}

function setup(opts) {
  const fake = fakeStores(opts);
  const config = makeConfig();
  const app = createApp({ config, stores: { ...fake.stores, audit: fake.audit } });
  const tokens = createTokenService(config.jwt);
  const as = (id, role, tenantId = T) => ({ Authorization: `Bearer ${tokens.sign({ id, tenantId, role, email: `${id}@elgos.test` })}` });
  return { ...fake, app, get: (id, role, tenantId) => request(app).get('/api/dashboard').set(as(id, role, tenantId)) };
}

describe('GET /api/dashboard', () => {
  it('ditolak bila flag dashboard.main mati', async () => {
    const { get } = setup({ flags: { 'module.tna': true } });
    const res = await get('u-hr', 'hr_admin');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FEATURE_DISABLED');
  });

  it.each(['learner', 'sme', 'pimpinan', 'role_leader'])('ditolak untuk peran %s', async (role) => {
    const { get, calls } = setup();
    const res = await get('u-a', role);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ROLE_FORBIDDEN');
    expect(calls).toEqual([]);
  });

  it('HR: seluruh bagian terisi dari data tenant', async () => {
    const { get } = setup({ flags: { ...ALL_ON, 'tna.non_training_hr': true } });
    const res = await get('u-hr', 'hr_admin');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.scope).toBe('all');
    expect(d.people).toBe(4);
    expect(d.kpis).toEqual({
      employeesAnalyzed: 2, // u-a (penilaian DNA + sesi selesai), u-c (penilaian DNA)
      competencyGaps: 2, // c1 (u-a) dan c2 (u-c)
      okrGaps: 2,
      aiHrAgreement: { percent: 88, approved: 22, reviewed: 25, targetPercent: 85 },
      analysisDays: { median: 7, sessions: 2, targetDays: 14 },
    });
    expect(d.pareto.total).toBe(2);
    expect(d.pareto.rows[0]).toMatchObject({ label: 'Root Cause Analysis', people: 2, hot: true });
    expect(d.pareto.rows[1]).toMatchObject({ label: 'Ticket Life Cycle', people: 1, hot: false });
    expect(d.pareto.hotCount).toBe(1);
    expect(d.actions).toEqual([
      { key: 'review_pending', count: 4 },
      { key: 'interviews_open', count: 2 },
      { key: 'plan_needs_module', count: 1 },
      { key: 'non_training_findings', count: 2 },
      { key: 'competencies_unapproved', count: 1 },
    ]);
  });

  it('Admin ETA diperlakukan seperti HR', async () => {
    const res = await setup().get('u-eta', 'eta_admin');
    expect(res.status).toBe(200);
    expect(res.body.data.scope).toBe('all');
    expect(res.body.data.kpis.aiHrAgreement).not.toBeNull();
  });

  it('atasan: hanya bawahan langsung, tanpa angka review dan tanpa petunjuk adanya draf', async () => {
    const { get, calls } = setup({ flags: { ...ALL_ON, 'tna.non_training_hr': true } });
    const res = await get('u-spv', 'supervisor');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.scope).toBe('team');
    expect(d.people).toBe(2);
    expect(d.kpis).toEqual({
      employeesAnalyzed: 1, competencyGaps: 1, okrGaps: 1, aiHrAgreement: null,
      analysisDays: { median: 11, sessions: 1, targetDays: 14 },
    });
    expect(d.pareto.rows).toHaveLength(1);
    expect(d.pareto.rows[0]).toMatchObject({ label: 'Root Cause Analysis', people: 2 });
    expect(d.actions).toEqual([{ key: 'interviews_open', count: 1 }, { key: 'plan_needs_module', count: 1 }].filter((a) => a.key === 'interviews_open'));
    // Setiap pembacaan data karyawan memakai cakupan tim: bukan dirinya, bukan orang di luar tim
    const scoped = calls.filter((c) => c.scope && c.name !== 'tna.hasNonTrainingGrant');
    expect(scoped.length).toBeGreaterThan(0);
    for (const c of scoped) expect([...c.scope.userIds].sort()).toEqual(['u-a', 'u-b']);
    expect(calls.map((c) => c.name)).not.toContain('tna.reviewCounts');
    expect(calls.map((c) => c.name)).not.toContain('dna.listCompetencies');
    expect(calls.map((c) => c.name)).not.toContain('tna.listNonTrainingSummary');
  });

  it('atasan dengan akses dari HR menerima jumlah temuan non-pelatihan timnya (K1)', async () => {
    const { get } = setup({ flags: { ...ALL_ON, 'tna.non_training_hr': true }, grant: true });
    const res = await get('u-spv', 'supervisor');
    expect(res.body.data.actions).toContainEqual({ key: 'non_training_findings', count: 1 });
  });

  it('temuan non-pelatihan tidak dihitung bila flag tna.non_training_hr mati', async () => {
    const { get, calls } = setup({ grant: true });
    const res = await get('u-hr', 'hr_admin');
    expect(res.body.data.actions.map((a) => a.key)).not.toContain('non_training_findings');
    expect(calls.map((c) => c.name)).not.toContain('tna.listNonTrainingSummary');
  });

  it('atasan tanpa bawahan mendapat dashboard kosong', async () => {
    const res = await setup().get('u-a', 'supervisor');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ scope: 'team', people: 0, actions: [], pareto: { rows: [], total: 0, hotCount: 0 } });
    expect(res.body.data.kpis).toMatchObject({ employeesAnalyzed: 0, competencyGaps: 0, okrGaps: 0, analysisDays: null });
  });

  it('bagian modul yang tertutup bernilai null dan datanya tidak dibaca', async () => {
    const tnaOff = setup({ flags: { 'dashboard.main': true, 'module.dna': true, 'module.tna': false } });
    let d = (await tnaOff.get('u-hr', 'hr_admin')).body.data;
    expect(d.pareto).toBeNull();
    expect(d.kpis).toMatchObject({ okrGaps: null, analysisDays: null, aiHrAgreement: null, competencyGaps: 2, employeesAnalyzed: 2 });
    expect(d.actions).toEqual([{ key: 'competencies_unapproved', count: 1 }]);
    expect(tnaOff.calls.filter((c) => c.name.startsWith('tna.') || c.name.startsWith('interviews.'))).toEqual([]);

    // Flag menyala tetapi tenant tidak berlangganan DNA: tetap tertutup
    const dnaOff = setup({ entitlements: ['tna'] });
    d = (await dnaOff.get('u-hr', 'hr_admin')).body.data;
    expect(d.kpis).toMatchObject({ competencyGaps: null, employeesAnalyzed: 1, okrGaps: 2 });
    expect(dnaOff.calls.filter((c) => c.name.startsWith('dna.'))).toEqual([]);

    const bothOff = setup({ flags: { 'dashboard.main': true }, entitlements: [] });
    d = (await bothOff.get('u-hr', 'hr_admin')).body.data;
    expect(d.kpis).toEqual({ employeesAnalyzed: null, competencyGaps: null, okrGaps: null, aiHrAgreement: null, analysisDays: null });
  });

  it('status modul mengikuti entitlement dan flag; atasan hanya modul di menunya', async () => {
    const { get } = setup({ flags: { ...ALL_ON, 'module.ina': true, 'promotion.recommendation': true }, entitlements: ['dna', 'tna'] });
    const hr = (await get('u-hr', 'hr_admin')).body.data.modules;
    expect(hr.map((m) => [m.no, m.key, m.active])).toEqual([[1, 'lna', true], [2, 'li', false], [3, 'ld', false], [4, 'lim', false], [5, 'cp', true]]);
    // INA: flag menyala tetapi tidak berlangganan, jadi tidak aktif
    expect(hr[0].parts).toEqual([{ key: 'cca', active: false }, { key: 'dna', active: true }, { key: 'tna', active: true }, { key: 'ina', active: false }]);
    const spv = (await get('u-spv', 'supervisor')).body.data.modules;
    expect(spv.map((m) => m.key)).toEqual(['lna', 'lim', 'cp']);
  });

  it('mencatat audit baca dengan id karyawan dalam cakupan', async () => {
    const { get, audit } = setup();
    await get('u-spv', 'supervisor');
    const row = audit.rows.find((r) => r.resource === 'dashboard.summary');
    expect(row).toBeTruthy();
    expect(row.action).toBe('read');
    expect([...row.meta.employeeIds].sort()).toEqual(['u-a', 'u-b']);
  });

  it('semua pembacaan memakai tenant dari token', async () => {
    const { get, calls } = setup({ flags: { ...ALL_ON, 'tna.non_training_hr': true } });
    await get('u-hr', 'hr_admin');
    expect(calls.length).toBeGreaterThan(5);
    expect(new Set(calls.map((c) => c.tenantId))).toEqual(new Set([T]));
    // Tenant lain tanpa flag tidak bisa membuka dashboard
    const other = await get('u-x', 'hr_admin', 't-2');
    expect(other.status).toBe(403);
  });
});

describe('fungsi ringkasan dashboard', () => {
  it('markHot menandai baris sampai kumulatif pertama kali mencapai 80%', () => {
    const rows = [{ cumulativeShare: 0.5 }, { cumulativeShare: 0.85 }, { cumulativeShare: 0.95 }, { cumulativeShare: 1 }];
    expect(markHot(rows).map((r) => r.hot)).toEqual([true, true, false, false]);
    expect(markHot([{ cumulativeShare: 1 }]).map((r) => r.hot)).toEqual([true]);
    expect(markHot([{ cumulativeShare: 0.8 }, { cumulativeShare: 1 }]).map((r) => r.hot)).toEqual([true, false]);
    expect(markHot([])).toEqual([]);
  });

  it('median membulatkan ke atas ke hari penuh', () => {
    expect(median([])).toBeNull();
    expect(median([3])).toBe(3);
    expect(median([10.2])).toBe(11);
    expect(median([1, 9, 2])).toBe(2);
    expect(median([1, 2, 4, 9])).toBe(3);
    expect(median([0.1, 0.2])).toBe(1);
  });

  it('agreement: persen temuan yang disetujui tanpa diubah; null bila belum ada yang ditinjau', () => {
    expect(agreement({ draft: 9, approved: 0, edited: 0, rejected: 0 })).toEqual({ percent: null, approved: 0, reviewed: 0, targetPercent: 85 });
    expect(agreement({ draft: 0, approved: 17, edited: 2, rejected: 1 })).toEqual({ percent: 85, approved: 17, reviewed: 20, targetPercent: 85 });
  });
});
