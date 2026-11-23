// B3: ringkasan dashboard HR dan dashboard tim atasan. Spek: docs/designs/b3-dashboard.md.
const request = require('supertest');
const { createApp } = require('../../src/app');
const { memorySessionStore } = require('../../src/core/auth/sessions');
const { memoryAuditStore } = require('../../src/core/audit');
const { markHot, median, agreement } = require('../../src/modules/dashboard/summary');
const { makeConfig, makeStores, sessionSigner } = require('../helpers');

const T = 't-1';
const ALL_ON = { 'dashboard.main': true, 'module.dna': true, 'module.tna': true };

/** Store tiruan yang mencatat cakupan setiap panggilan, supaya isolasi tenant dan tim bisa diperiksa. */
function fakeStores({ flags = ALL_ON, entitlements = ['dna', 'tna'], grant = false, improvementOnly = false, titleFinding = false } = {}) {
  const base = makeStores({ entitlements: { [T]: entitlements }, flags: { [T]: flags } });
  const calls = [];
  const note = (name, tenantId, scope) => { calls.push({ name, tenantId, scope }); };
  const people = [
    { id: 'u-spv', role: 'supervisor', jobRoleId: 'jr', careerLevelId: null, supervisorId: null },
    { id: 'u-a', role: 'learner', jobRoleId: 'jr', careerLevelId: null, supervisorId: 'u-spv' },
    { id: 'u-b', role: 'learner', jobRoleId: 'jr', careerLevelId: null, supervisorId: 'u-spv' },
    { id: 'u-c', role: 'learner', jobRoleId: 'jr', careerLevelId: null, supervisorId: 'u-other' },
  ];
  // u-d: bawahan atasan yang hanya punya temuan Improvement Needs (non-pelatihan) yang sudah ditinjau (K1)
  if (improvementOnly) people.push({ id: 'u-d', role: 'learner', jobRoleId: null, careerLevelId: null, supervisorId: 'u-spv' });
  const pick = (scope, rows, key) => (scope.all ? rows : rows.filter((r) => scope.userIds.includes(r[key])));
  const findings = [
    { id: 'f1', userId: 'u-a', category: 'training', competencyId: 'c1', competencyName: 'Root Cause Analysis', title: 'RCA', importance: 5, target: 100, actual: 60, direction: 'higher', tolerance: 0 },
    { id: 'f2', userId: 'u-b', category: 'training', competencyId: 'c1', competencyName: 'Root Cause Analysis', title: 'RCA', importance: 5, target: 100, actual: 80, direction: 'higher', tolerance: 0 },
    { id: 'f3', userId: 'u-c', category: 'training', competencyId: 'c2', competencyName: 'Ticket Life Cycle', title: 'Tiket', importance: 3, target: null },
  ];
  if (improvementOnly) findings.push({ id: 'f4', userId: 'u-d', category: 'non_training', competencyId: null, title: 'Beban kerja', target: null });
  // Temuan pelatihan tanpa kompetensi: baris Pareto memakai judul temuan (isi individu, R2-2)
  if (titleFinding) findings.push({ id: 'f5', userId: 'u-c', category: 'training', competencyId: null, competencyName: null, title: 'Bahasa Inggris', importance: 3, target: null });
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
        // c2 belum disahkan HR: bukan target gap (CONTEXT.md "Gap kompetensi", sama dengan papan gap B5)
        competenciesForPosition: async () => [{ id: 'c1', name: 'Root Cause Analysis', kind: 'job', requiredScore: 3, approvedAt: '2026-11-02' }, { id: 'c2', name: 'Ticket Life Cycle', kind: 'job', requiredScore: 3, approvedAt: null }],
        listCompetencies: async (tenantId) => { note('dna.listCompetencies', tenantId); return [{ id: 'c1', approvedAt: '2026-11-02' }, { id: 'c2', approvedAt: null }]; },
      },
      interviews: {
        list: async (tenantId, submodule, scope) => {
          note('interviews.list', tenantId, scope);
          return pick(scope, [
            { id: 's1', intervieweeId: 'u-a', status: 'completed' },
            { id: 's2', intervieweeId: 'u-b', status: 'scheduled' },
            { id: 's3', intervieweeId: 'u-c', status: 'in_progress' },
            { id: 's4', intervieweeId: 'u-gone', status: 'scheduled' },
            // undangan kedaluwarsa tidak bisa diselesaikan lagi: bukan wawancara terbuka (isOpen B5)
            { id: 's5', intervieweeId: 'u-a', status: 'scheduled', inviteExpiresAt: '2026-01-01T00:00:00Z' },
          ], 'intervieweeId');
        },
      },
      tna: {
        listFindings: async (tenantId, scope, { categories }) => { note('tna.listFindings', tenantId, scope); return pick(scope, findings, 'userId').filter((f) => categories.includes(f.category)); },
        // periode unggahan terbaru lebih dulu (B5); bukan urutan teks
        performancePeriods: async (tenantId, scope) => { note('tna.performancePeriods', tenantId, scope); return ['2026-11', '2026-10']; },
        listPerformance: async (tenantId, scope) => {
          note('tna.listPerformance', tenantId, scope);
          return pick(scope, [
            // u-a: SLA periode lama meleset, periode terbaru tercapai (tidak dihitung); KPI lain meleset
            { userId: 'u-a', metricType: 'sla', name: 'Respons', period: '2026-10', isMet: false },
            { userId: 'u-a', metricType: 'sla', name: 'Respons', period: '2026-11', isMet: true },
            { userId: 'u-a', metricType: 'kpi', name: 'Tiket', period: '2026-11', isMet: false },
            { userId: 'u-c', metricType: 'kpi', name: 'Tiket', period: '2026-11', isMet: false },
            { userId: 'u-c', metricType: 'kpi', name: 'Lain', period: '2026-11', isMet: null },
            // orang yang tidak aktif (tidak ada di people.list) tidak ikut dihitung
            { userId: 'u-gone', metricType: 'kpi', name: 'Tiket', period: '2026-11', isMet: false },
          ], 'userId');
        },
        listPlanItems: async (tenantId, scope) => {
          note('tna.listPlanItems', tenantId, scope);
          return pick(scope, [
            { userId: 'u-a', needsModule: true, status: 'new' },
            { userId: 'u-c', needsModule: true, status: 'rejected' },
            { userId: 'u-c', needsModule: true, status: 'completed' },
            { userId: 'u-b', needsModule: false, status: 'new' },
          ], 'userId');
        },
        reviewCounts: async (tenantId) => { note('tna.reviewCounts', tenantId); return { draft: 4, approved: 30, edited: 2, rejected: 1 }; },
        aiReviewCounts: async (tenantId) => { note('tna.aiReviewCounts', tenantId); return { draft: 4, approved: 22, edited: 2, rejected: 1 }; },
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
  const authSessions = memorySessionStore();
  const app = createApp({ config, stores: { ...fake.stores, audit: fake.audit, authSessions } });
  const tokens = sessionSigner(config, authSessions);
  const as = async (id, role, tenantId = T) => ({ Authorization: `Bearer ${await tokens.sign({ id, tenantId, role, email: `${id}@elgos.test` })}` });
  return { ...fake, app, get: async (id, role, tenantId) => request(app).get('/api/dashboard').set(await as(id, role, tenantId)) };
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
    // Catatan angka: dianalisis = punya penilaian DNA atau temuan TNA yang sudah ditinjau (u-a, u-b, u-c).
    const { get } = setup({ flags: { ...ALL_ON, 'tna.non_training_hr': true } });
    const res = await get('u-hr', 'hr_admin');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.scope).toBe('all');
    expect(d.people).toBe(4);
    expect(d.kpis).toEqual({
      employeesAnalyzed: 3, // u-a, u-c (penilaian DNA), u-b (temuan ditinjau)
      competencyGaps: 1, // c1 (u-a); c2 belum disahkan HR
      okrGaps: 1, // periode unggahan terbaru 2026-11: metrik Tiket (u-a, u-c) satu gap
      aiHrAgreement: { percent: 88, approved: 22, reviewed: 25, targetPercent: 85 },
      analysisDays: { median: 7, sessions: 2, targetDays: 14 },
    });
    expect(d.pareto.total).toBe(2);
    expect(d.pareto.rows[0]).toMatchObject({ label: 'Root Cause Analysis', people: 2, hot: true });
    expect(d.pareto.rows[1]).toMatchObject({ label: 'Ticket Life Cycle', people: 1, hot: false });
    expect(d.pareto.hotCount).toBe(1);
    expect(d.actions).toEqual([
      { key: 'review_pending', count: 4 },
      { key: 'interviews_open', count: 2 }, // u-gone tidak aktif, tidak dihitung
      { key: 'plan_needs_module', count: 1 }, // butir rejected/completed tidak dihitung
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
    // Tanpa angka yang bergantung pada draf: kesepakatan AI–HR dan lama analisis hanya untuk HR
    expect(d.kpis).toEqual({ employeesAnalyzed: 2, competencyGaps: 1, okrGaps: 1, aiHrAgreement: null, analysisDays: null }); // c1 u-a; Tiket u-a
    expect(d.pareto.rows).toHaveLength(1);
    expect(d.pareto.rows[0]).toMatchObject({ label: 'Root Cause Analysis', people: 2 });
    expect(d.actions).toEqual([{ key: 'interviews_open', count: 1 }]);
    // Setiap pembacaan data karyawan memakai cakupan tim: bukan dirinya, bukan orang di luar tim
    const scoped = calls.filter((c) => c.scope && c.name !== 'tna.hasNonTrainingGrant');
    expect(scoped.length).toBeGreaterThan(0);
    for (const c of scoped) expect([...c.scope.userIds].sort()).toEqual(['u-a', 'u-b']);
    for (const name of ['tna.reviewCounts', 'tna.aiReviewCounts', 'tna.analysisDurations', 'tna.listPlanItems']) {
      expect(calls.map((c) => c.name)).not.toContain(name);
    }
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
    expect(res.body.data.kpis).toMatchObject({ employeesAnalyzed: 0, competencyGaps: 0, okrGaps: 0, analysisDays: null, aiHrAgreement: null });
  });

  it('bagian modul yang tertutup bernilai null dan datanya tidak dibaca', async () => {
    const tnaOff = setup({ flags: { 'dashboard.main': true, 'module.dna': true, 'module.tna': false } });
    let d = (await tnaOff.get('u-hr', 'hr_admin')).body.data;
    expect(d.pareto).toBeNull();
    expect(d.kpis).toMatchObject({ okrGaps: null, analysisDays: null, aiHrAgreement: null, competencyGaps: 1, employeesAnalyzed: 2 });
    expect(d.actions).toEqual([{ key: 'competencies_unapproved', count: 1 }]);
    expect(tnaOff.calls.filter((c) => c.name.startsWith('tna.') || c.name.startsWith('interviews.'))).toEqual([]);

    // Flag menyala tetapi tenant tidak berlangganan DNA: tetap tertutup
    const dnaOff = setup({ entitlements: ['tna'] });
    d = (await dnaOff.get('u-hr', 'hr_admin')).body.data;
    expect(d.kpis).toMatchObject({ competencyGaps: null, employeesAnalyzed: 3, okrGaps: 1 });
    expect(dnaOff.calls.filter((c) => c.name.startsWith('dna.'))).toEqual([]);

    const bothOff = setup({ flags: { 'dashboard.main': true }, entitlements: [] });
    d = (await bothOff.get('u-hr', 'hr_admin')).body.data;
    expect(d.kpis).toEqual({ employeesAnalyzed: null, competencyGaps: null, okrGaps: null, aiHrAgreement: null, analysisDays: null });
  });

  it('modul 2–5 mengikuti gerbang API modulnya: li/ld/lim butuh full_suite, cp butuh DNA terbuka', async () => {
    const flags = { ...ALL_ON, 'module.li': true, 'module.ld': true, 'module.lim': true, 'promotion.recommendation': true };
    const status = async (entitlements) => (await setup({ flags, entitlements }).get('u-hr', 'hr_admin')).body.data.modules.map((m) => [m.key, m.active]);
    expect(await status(['dna', 'tna'])).toEqual([['lna', true], ['li', false], ['ld', false], ['lim', false], ['cp', true]]);
    // module.lim terdaftar di FLAGS sejak B15 (PR #27): full_suite + flag menyala = modul 4 aktif, flag mati = tidak aktif
    expect(await status(['full_suite'])).toEqual([['lna', true], ['li', true], ['ld', true], ['lim', true], ['cp', true]]);
    const tanpaLim = await setup({ flags: { ...flags, 'module.lim': false }, entitlements: ['full_suite'] }).get('u-hr', 'hr_admin');
    expect(tanpaLim.body.data.modules.find((m) => m.key === 'lim').active).toBe(false);
    expect(await status(['tna'])).toEqual([['lna', true], ['li', false], ['ld', false], ['lim', false], ['cp', false]]);
  });

  it('K1: temuan Improvement Needs menghitung "dianalisis" untuk atasan hanya bila diberi akses HR', async () => {
    const flags = { ...ALL_ON, 'tna.non_training_hr': true };
    const without = (await setup({ flags, improvementOnly: true, entitlements: ['tna'] }).get('u-spv', 'supervisor')).body.data;
    expect(without.people).toBe(3);
    expect(without.kpis.employeesAnalyzed).toBe(2); // u-a, u-b; u-d tidak boleh tersimpulkan
    const granted = (await setup({ flags, improvementOnly: true, entitlements: ['tna'], grant: true }).get('u-spv', 'supervisor')).body.data;
    expect(granted.kpis.employeesAnalyzed).toBe(3);
  });

  it('audit HR: baris Pareto dari judul temuan dicatat sebagai baca data individu', async () => {
    const { get, audit } = setup({ titleFinding: true });
    const res = await get('u-hr', 'hr_admin');
    expect(res.body.data.pareto.rows.map((r) => r.label)).toContain('Bahasa Inggris');
    const row = audit.rows.find((r) => r.resource === 'dashboard.pareto');
    expect(row).toBeTruthy();
    expect(row.meta.employeeIds).toEqual(['u-c']);
  });

  it('audit HR gagal: dashboard gagal (gagal-tertutup)', async () => {
    const fake = fakeStores();
    const config = makeConfig();
    const authSessions = memorySessionStore();
    const app = createApp({ config, stores: { ...fake.stores, audit: { async insert() { throw new Error('audit mati'); } }, authSessions } });
    const tokens = sessionSigner(config, authSessions);
    const res = await request(app).get('/api/dashboard').set({ Authorization: `Bearer ${await tokens.sign({ id: 'u-hr', tenantId: T, role: 'hr_admin', email: 'h@elgos.test' })}` });
    expect(res.status).toBe(500);
    expect(res.body.data).toBeUndefined();
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

  it('audit atasan: baca data individu dengan id bawahannya', async () => {
    const { get, audit } = setup();
    await get('u-spv', 'supervisor');
    const row = audit.rows.find((r) => r.resource === 'dashboard.summary');
    expect(row).toBeTruthy();
    expect(row.action).toBe('read');
    expect([...row.meta.employeeIds].sort()).toEqual(['u-a', 'u-b']);
  });

  it('audit HR: dicatat ringkas tanpa daftar id karyawan', async () => {
    const { get, audit } = setup();
    await get('u-hr', 'hr_admin');
    const row = audit.rows.find((r) => r.resource === 'dashboard.summary');
    expect(row.meta).toMatchObject({ scope: 'all', people: 4 });
    expect(row.meta.employeeIds).toBeUndefined();
  });

  it('audit gagal: dashboard gagal (gagal-tertutup)', async () => {
    const fake = fakeStores();
    const config = makeConfig();
    const authSessions = memorySessionStore();
    const app = createApp({ config, stores: { ...fake.stores, audit: { async insert() { throw new Error('audit mati'); } }, authSessions } });
    const tokens = sessionSigner(config, authSessions);
    const res = await request(app).get('/api/dashboard').set({ Authorization: `Bearer ${await tokens.sign({ id: 'u-spv', tenantId: T, role: 'supervisor', email: 's@elgos.test' })}` });
    expect(res.status).toBe(500);
    expect(res.body.data).toBeUndefined();
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
    expect(median([3.000004])).toBe(3);
  });

  it('median: lama negatif dihitung 0, nilai bukan angka diabaikan', () => {
    expect(median([-2, 3])).toBe(2);
    expect(median([Number.NaN])).toBeNull();
  });

  it('agreement: persen temuan yang disetujui tanpa diubah; null bila belum ada yang ditinjau', () => {
    expect(agreement({ draft: 9, approved: 0, edited: 0, rejected: 0 })).toEqual({ percent: null, approved: 0, reviewed: 0, targetPercent: 85 });
    expect(agreement({ draft: 0, approved: 17, edited: 2, rejected: 1 })).toEqual({ percent: 85, approved: 17, reviewed: 20, targetPercent: 85 });
  });
});
