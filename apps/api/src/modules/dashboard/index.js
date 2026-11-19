'use strict';
// Dashboard utama HR dan dashboard tim atasan (B3). Spek: docs/designs/b3-dashboard.md.
// Bukan submodul: merangkum beberapa modul, jadi dipasang di balik flag dashboard.main dan tiap bagian hanya diisi
// bila modul sumbernya terbuka untuk tenant (entitlement + flag, aturan yang sama dengan requireSubmodule).
// Cakupan data: HR seluruh tenant, atasan bawahan langsungnya (visibleEmployeeScope, RG-3).
// Yang hanya untuk HR: kesepakatan AI–HR, lama analisis, dan antrean tinjauan. Atasan tidak menerima angka apa pun
// yang bergantung pada temuan draf, sehingga tidak bisa menyimpulkan ada draf (PM-5).
const express = require('express');
const { requireRole, ROLES } = require('../../core/rbac');
const { scopeFor } = require('../../core/rbac/scope');
const { FLAGS } = require('../../core/flags');
const { computeGap } = require('../dna/gap');
const { rankFindings } = require('../tna/pareto');
const { markHot, median, agreement, latestUnmet, ANALYSIS_TARGET_DAYS, PARETO_LIMIT } = require('./summary');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const EMPLOYEE_ROLES = [ROLES.LEARNER, ROLES.SUPERVISOR, ROLES.ROLE_LEADER, ROLES.SME];
const LNA_PARTS = ['cca', 'dna', 'tna', 'ina'];
// Modul 2–5 hanya di balik flag. module.li/ld dibuat B13/B14; module.lim dibuat B15 (sebelum itu modul 4 tidak aktif).
const MODULE_FLAGS = [
  { no: 2, key: 'li', flag: FLAGS.MODULE_LI },
  { no: 3, key: 'ld', flag: FLAGS.MODULE_LD },
  { no: 4, key: 'lim', flag: 'module.lim' },
  { no: 5, key: 'cp', flag: FLAGS.PROMOTION_RECOMMENDATION },
];
const OPEN_SESSION = ['scheduled', 'in_progress'];
const CLOSED_PLAN = ['completed', 'rejected'];
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
    // Hanya gap yang terukur; kompetensi yang belum dinilai (not_assessed) bukan gap
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

    // Penyebut semua angka: karyawan aktif dalam cakupan. Data orang di luar daftar ini tidak ikut dihitung.
    const people = await stores.people.list(tenantId, scope, { roles: EMPLOYEE_ROLES });
    const ids = people.map((p) => p.id);
    const inScope = new Set(ids);
    const analyzed = new Set();
    const kpis = { employeesAnalyzed: null, competencyGaps: null, okrGaps: null, aiHrAgreement: null, analysisDays: null };
    const actions = [];
    const add = (key, count) => { if (count > 0) actions.push({ key, count }); };
    let pareto = null;
    let unapproved = 0;
    let planNeedsModule = 0; // hanya HR

    if (dnaOn) {
      const assessments = await stores.dna.assessmentsFor(tenantId, ids);
      for (const a of assessments) analyzed.add(a.userId);
      kpis.competencyGaps = await competencyGapCount(stores, tenantId, people, assessments);
      if (isHr) unapproved = (await stores.dna.listCompetencies(tenantId)).filter((c) => !c.approvedAt).length;
    }

    if (tnaOn) {
      // K1 / PM-6: temuan non-pelatihan hanya untuk HR, atau atasan yang diberi akses HR (bila flagnya menyala)
      const nonTrainingAllowed = allFlags[FLAGS.TNA_NON_TRAINING_HR] === true
        && (isHr || (await stores.tna.hasNonTrainingGrant(tenantId, req.user.id)));
      const [sessions, reviewed, perf, conf] = await Promise.all([
        stores.interviews.list(tenantId, 'tna', scope),
        // listFindings hanya mengembalikan temuan yang sudah ditinjau HR (PK-14)
        stores.tna.listFindings(tenantId, scope, { categories: isHr || nonTrainingAllowed ? ['training', 'non_training'] : ['training'] }),
        stores.tna.listPerformance(tenantId, scope, {}),
        settings.get(tenantId),
      ]);
      // "Dianalisis" di sisi TNA = punya temuan (pelatihan atau non-pelatihan) yang sudah ditinjau. Sesi selesai
      // yang temuannya masih draf tidak dihitung (PM-5), jadi angka ini tidak membocorkan adanya draf.
      for (const f of reviewed) analyzed.add(f.userId);
      const findings = reviewed.filter((f) => f.category === 'training');
      kpis.okrGaps = latestUnmet(perf.filter((p) => inScope.has(p.userId)));

      // total dan hotCount dihitung dari seluruh peringkat; rows dipotong ke PARETO_LIMIT teratas
      const marked = markHot(rankFindings(findings.filter((f) => inScope.has(f.userId)), conf.tna.pareto));
      pareto = {
        rows: marked.slice(0, PARETO_LIMIT).map(({ key, label, people: n, score, share, cumulativeShare, hot }) => ({ key, label, people: n, score, share, cumulativeShare, hot })),
        total: marked.length,
        hotCount: marked.filter((x) => x.hot).length,
      };

      if (isHr) {
        const [counts, aiCounts, allDurations, plan] = await Promise.all([
          stores.tna.reviewCounts(tenantId, {}),
          stores.tna.aiReviewCounts(tenantId),
          stores.tna.analysisDurations(tenantId, scope),
          stores.tna.listPlanItems(tenantId, scope),
        ]);
        const durations = allDurations.filter((d) => inScope.has(d.userId));
        kpis.aiHrAgreement = agreement(aiCounts);
        kpis.analysisDays = durations.length
          ? { median: median(durations.map((d) => Number(d.days))), sessions: durations.length, targetDays: ANALYSIS_TARGET_DAYS }
          : null;
        add('review_pending', counts.draft);
        planNeedsModule = plan.filter((p) => inScope.has(p.userId) && p.needsModule && !CLOSED_PLAN.includes(p.status)).length;
      }
      // Urutan butir tetap (spek 3.5): review_pending, interviews_open, plan_needs_module
      add('interviews_open', sessions.filter((s) => OPEN_SESSION.includes(s.status) && inScope.has(s.intervieweeId)).length);
      add('plan_needs_module', planNeedsModule);

      // K1 / PM-6: temuan non-pelatihan untuk HR; atasan hanya bila HR memberinya akses. Tanpa akses butirnya
      // tidak dikirim sama sekali, sehingga atasan tidak bisa menyimpulkan ada temuan.
      if (nonTrainingAllowed) {
        const rows = await stores.tna.listNonTrainingSummary(tenantId, isHr ? {} : { userIds: scope.userIds });
        add('non_training_findings', rows.filter((f) => inScope.has(f.userId)).length);
      }
    }
    if (dnaOn && isHr) add('competencies_unapproved', unapproved);
    if (dnaOn || tnaOn) kpis.employeesAnalyzed = ids.filter((id) => analyzed.has(id)).length;

    const parts = LNA_PARTS.map((key) => ({ key, active: open(key) }));
    const modules = [
      { no: 1, key: 'lna', active: parts.some((p) => p.active), parts },
      ...MODULE_FLAGS.map(({ no, key, flag }) => ({ no, key, active: allFlags[flag] === true })),
    ].filter((m) => isHr || TEAM_MODULES.includes(m.key));

    // Audit (R2-2, gagal-tertutup). Agregat tim kecil bisa menunjuk orang, jadi untuk atasan dicatat sebagai baca
    // data individu dengan id bawahannya. Agregat seluruh tenant untuk HR dicatat ringkas tanpa daftar id.
    if (isHr) await audit.record(req, 'read', 'dashboard.summary', { scope: 'all', people: people.length });
    else await audit.readIndividual(req, 'dashboard.summary', { employeeIds: ids });

    res.json({ data: { scope: scope.all ? 'all' : 'team', people: people.length, kpis, modules, pareto, actions } });
  }));

  return r;
}

module.exports = { dashboardRouter };
