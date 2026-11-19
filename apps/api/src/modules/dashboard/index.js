'use strict';
// Dashboard utama HR dan dashboard tim atasan (B3). Spek: docs/designs/b3-dashboard.md.
// Bukan submodul: merangkum beberapa modul, jadi dipasang di balik flag dashboard.main dan tiap bagian hanya diisi
// bila modul sumbernya terbuka untuk tenant (entitlement + flag, aturan yang sama dengan requireSubmodule).
// Cakupan data: HR seluruh tenant, atasan bawahan langsungnya (visibleEmployeeScope, RG-3).
// Yang hanya untuk HR: kesepakatan AI–HR dan antrean tinjauan (peran lain tidak boleh tahu ada draf, PM-5).
const express = require('express');
const { requireRole, ROLES } = require('../../core/rbac');
const { scopeFor } = require('../../core/rbac/scope');
const { FLAGS } = require('../../core/flags');
const { computeGap } = require('../dna/gap');
const { evaluate } = require('../tna/performance');
const { rankTrainingNeeds } = require('../tna/pareto');
const { markHot, median, agreement, ANALYSIS_TARGET_DAYS, PARETO_LIMIT } = require('./summary');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const EMPLOYEE_ROLES = [ROLES.LEARNER, ROLES.SUPERVISOR, ROLES.ROLE_LEADER, ROLES.SME];
const LNA_PARTS = ['cca', 'dna', 'tna', 'ina'];
// Modul 2–5 hanya di balik flag. Flag module.li/ld/lim dibuat paket B13–B15; sebelum itu modulnya tidak aktif.
const MODULE_FLAGS = [
  { no: 2, key: 'li', flag: 'module.li' },
  { no: 3, key: 'ld', flag: 'module.ld' },
  { no: 4, key: 'lim', flag: 'module.lim' },
  { no: 5, key: 'cp', flag: FLAGS.PROMOTION_RECOMMENDATION },
];
const TEAM_MODULES = ['lna', 'lim', 'cp']; // modul yang ada di menu tampilan Atasan

/** Kompetensi berbeda yang minimal satu karyawan dalam cakupan punya gap terhadap jabatannya. */
async function competencyGapCount(stores, tenantId, people, assessments) {
  const cache = new Map();
  const gapped = new Set();
  for (const p of people) {
    if (!p.jobRoleId) continue;
    const key = `${p.jobRoleId}|${p.careerLevelId}`;
    if (!cache.has(key)) cache.set(key, await stores.dna.competenciesForPosition(tenantId, p));
    const { items } = computeGap({ competencies: cache.get(key), assessments: assessments.filter((a) => a.userId === p.id) });
    for (const i of items) if (i.status === 'gap') gapped.add(i.competencyId);
  }
  return gapped.size;
}

function dashboardRouter({ stores, flags, entitlements, settings, audit }) {
  const r = express.Router();

  r.get('/', requireRole(ROLES.HR_ADMIN, ROLES.SUPERVISOR), wrap(async (req, res) => {
    const tenantId = req.tenantId;
    const isHr = [ROLES.HR_ADMIN, ROLES.ETA_ADMIN].includes(req.user.role);

    // Cakupan: HR semua; atasan bawahan langsung saja (dirinya dikeluarkan supaya "tim" berarti bawahan).
    const visible = await scopeFor(req, stores.people);
    const scope = visible.all ? visible : { userIds: visible.userIds.filter((id) => id !== req.user.id) };

    const [allFlags, owned] = await Promise.all([flags.all(tenantId), entitlements.submodules(tenantId)]);
    const open = (key) => owned.includes(key) && allFlags[`module.${key}`] === true;
    const dnaOn = open('dna');
    const tnaOn = open('tna');

    const people = (await stores.people.list(tenantId, scope, { roles: EMPLOYEE_ROLES }));
    const ids = people.map((p) => p.id);
    const analyzed = new Set();
    const kpis = { employeesAnalyzed: null, competencyGaps: null, okrGaps: null, aiHrAgreement: null, analysisDays: null };
    const actions = [];
    const add = (key, count) => { if (count > 0) actions.push({ key, count }); };
    let pareto = null;
    let unapproved = 0;

    if (dnaOn) {
      const assessments = await stores.dna.assessmentsFor(tenantId, ids);
      for (const a of assessments) analyzed.add(a.userId);
      kpis.competencyGaps = await competencyGapCount(stores, tenantId, people, assessments);
      if (isHr) unapproved = (await stores.dna.listCompetencies(tenantId)).filter((c) => !c.approvedAt).length;
    }

    if (tnaOn) {
      const [sessions, findings, plan, perf, durations, conf] = await Promise.all([
        stores.interviews.list(tenantId, 'tna', scope),
        stores.tna.listFindings(tenantId, scope, { categories: ['training'] }),
        stores.tna.listPlanItems(tenantId, scope),
        stores.tna.listPerformance(tenantId, scope, {}),
        stores.tna.analysisDurations(tenantId, scope),
        settings.get(tenantId),
      ]);
      for (const s of sessions) if (s.status === 'completed') analyzed.add(s.intervieweeId);
      kpis.okrGaps = perf.filter((p) => p.isMet === false).length;
      kpis.analysisDays = durations.length
        ? { median: median(durations.map((d) => Number(d.days))), sessions: durations.length, targetDays: ANALYSIS_TARGET_DAYS }
        : null;

      const ranked = rankTrainingNeeds(findings.map((f) => ({
        ...f, missRatio: f.target != null ? evaluate({ target: f.target, actual: f.actual, direction: f.direction, tolerance: f.tolerance }).missRatio : null,
      })), conf.tna.pareto);
      const marked = markHot(ranked);
      pareto = {
        rows: marked.slice(0, PARETO_LIMIT).map(({ key, label, people: n, score, share, cumulativeShare, hot }) => ({ key, label, people: n, score, share, cumulativeShare, hot })),
        total: marked.length,
        hotCount: marked.filter((x) => x.hot).length,
      };

      if (isHr) {
        const counts = await stores.tna.reviewCounts(tenantId, {});
        kpis.aiHrAgreement = agreement(counts);
        add('review_pending', counts.draft);
      }
      add('interviews_open', sessions.filter((s) => ['scheduled', 'in_progress'].includes(s.status)).length);
      if (isHr) add('plan_needs_module', plan.filter((p) => p.needsModule).length);

      // K1 / PM-6: temuan non-pelatihan untuk HR; atasan hanya bila HR memberinya akses. Tanpa akses butirnya
      // tidak dikirim sama sekali, sehingga atasan tidak bisa menyimpulkan ada temuan.
      if (allFlags[FLAGS.TNA_NON_TRAINING_HR] === true) {
        const allowed = isHr || (await stores.tna.hasNonTrainingGrant(tenantId, req.user.id));
        if (allowed) add('non_training_findings', (await stores.tna.listNonTrainingSummary(tenantId, isHr ? {} : { userIds: scope.userIds })).length);
      }
    }
    if (dnaOn && isHr) add('competencies_unapproved', unapproved);
    if (dnaOn || tnaOn) kpis.employeesAnalyzed = ids.filter((id) => analyzed.has(id)).length;

    const parts = LNA_PARTS.map((key) => ({ key, active: open(key) }));
    const modules = [
      { no: 1, key: 'lna', active: parts.some((p) => p.active), parts },
      ...MODULE_FLAGS.map(({ no, key, flag }) => ({ no, key, active: allFlags[flag] === true })),
    ].filter((m) => isHr || TEAM_MODULES.includes(m.key));

    // Agregat tim kecil bisa menunjuk orang, jadi dicatat sebagai baca data individu (R2-2, gagal-tertutup)
    await audit.readIndividual(req, 'dashboard.summary', { employeeIds: ids });

    res.json({ data: { scope: scope.all ? 'all' : 'team', people: people.length, kpis, modules, pareto, actions } });
  }));

  return r;
}

module.exports = { dashboardRouter };
