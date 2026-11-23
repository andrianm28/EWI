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
const { rankFindings } = require('../tna/pareto');
const { competencyGaps, okrGaps, isOpen } = require('../tna/gaps');
const { markHot, median, agreement, ANALYSIS_TARGET_DAYS, PARETO_LIMIT } = require('./summary');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const EMPLOYEE_ROLES = [ROLES.LEARNER, ROLES.SUPERVISOR, ROLES.ROLE_LEADER, ROLES.SME];
const LNA_PARTS = ['cca', 'dna', 'tna', 'ina'];
// Modul 2–5: status "aktif" memakai gerbang yang sama dengan API modulnya, supaya dashboard tidak menyebut aktif
// modul yang API-nya menolak. li/ld dipasang lewat requireSubmodule (entitlement full_suite + flag, B13/B14);
// lim butuh full_suite + flag module.lim (B15 menambah flag-nya); cp ada di /dna/promotion-candidates (DNA terbuka + flag).
const MODULE_GATES = [
  { no: 2, key: 'li', active: (g) => g.open('li') },
  { no: 3, key: 'ld', active: (g) => g.open('ld') },
  { no: 4, key: 'lim', active: (g) => g.fullSuite && g.flags['module.lim'] === true },
  { no: 5, key: 'cp', active: (g) => g.open('dna') && g.flags[FLAGS.PROMOTION_RECOMMENDATION] === true },
];
const CLOSED_PLAN = ['completed', 'rejected'];
const TEAM_MODULES = ['lna', 'lim', 'cp']; // modul yang ada di menu tampilan Atasan

/**
 * Gap kompetensi dengan definisi papan gap B5 (`tna/gaps.js competencyGaps`): kompetensi yang sudah disahkan HR
 * dengan rata-rata skor terbaru karyawan dalam cakupan di bawah skor minimal. Supaya angka dashboard dan papan
 * Training Needs sama untuk tenant yang sama.
 */
async function competencyGapCount(stores, tenantId, people, assessments) {
  const cache = new Map();
  const members = [];
  for (const p of people) {
    const key = `${p.jobRoleId || ''}|${p.careerLevelId || ''}`;
    if (!cache.has(key)) cache.set(key, await stores.dna.competenciesForPosition(tenantId, { jobRoleId: p.jobRoleId, careerLevelId: p.careerLevelId }));
    members.push({ id: p.id, competencies: cache.get(key) });
  }
  return competencyGaps({ members, assessments }).rows.filter((r) => r.gap > 0).length;
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
    const fullSuite = (await entitlements.products(tenantId)).includes('full_suite');
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
    let titleRowIds = []; // karyawan di balik baris Pareto yang labelnya judul temuan (isi individu, R2-2)
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
      const [sessions, reviewed, perf, periods, conf] = await Promise.all([
        stores.interviews.list(tenantId, 'tna', scope),
        // listFindings hanya mengembalikan temuan yang sudah ditinjau HR (PK-14)
        stores.tna.listFindings(tenantId, scope, { categories: isHr || nonTrainingAllowed ? ['training', 'non_training'] : ['training'], excludeFrozen: true }),
        stores.tna.listPerformance(tenantId, scope, {}),
        stores.tna.performancePeriods(tenantId, { userIds: ids }),
        settings.get(tenantId),
      ]);
      // "Dianalisis" di sisi TNA = punya temuan (pelatihan atau non-pelatihan) yang sudah ditinjau. Sesi selesai
      // yang temuannya masih draf tidak dihitung (PM-5), jadi angka ini tidak membocorkan adanya draf.
      for (const f of reviewed) analyzed.add(f.userId);
      const findings = reviewed.filter((f) => f.category === 'training');
      // Gap OKR dengan definisi papan gap B5: satu baris per metrik yang meleset pada periode unggahan terbaru
      const period = periods[0] || null;
      kpis.okrGaps = period ? okrGaps(perf.filter((p) => p.period === period && inScope.has(p.userId))).length : 0;

      // total dan hotCount dihitung dari seluruh peringkat; rows dipotong ke PARETO_LIMIT teratas
      const marked = markHot(rankFindings(findings.filter((f) => inScope.has(f.userId)), conf.tna.pareto));
      const sent = new Set(marked.slice(0, PARETO_LIMIT).filter((x) => !x.competencyId).map((x) => x.key));
      titleRowIds = [...new Set(findings.filter((f) => inScope.has(f.userId) && !f.competencyId && sent.has(`t:${String(f.title).toLowerCase()}`)).map((f) => f.userId))];
      pareto = {
        rows: marked.slice(0, PARETO_LIMIT).map(({ key, label, competencyId, people: n, score, share, cumulativeShare, hot }) => ({ key, label, competencyId, people: n, score, share, cumulativeShare, hot })),
        total: marked.length,
        hotCount: marked.filter((x) => x.hot).length,
      };

      if (isHr) {
        const [counts, aiCounts, allDurations, plan] = await Promise.all([
          stores.tna.reviewCounts(tenantId, {}),
          stores.tna.aiReviewCounts(tenantId),
          stores.tna.analysisDurations(tenantId, scope),
          stores.tna.listPlanItems(tenantId, scope, { excludeFrozen: true }),
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
      // Terbuka = sedang berjalan atau undangan belum kedaluwarsa (isOpen, sama dengan B5)
      const now = new Date();
      add('interviews_open', sessions.filter((s) => isOpen(s, now) && inScope.has(s.intervieweeId)).length);
      add('plan_needs_module', planNeedsModule);

      // K1 / PM-6: temuan non-pelatihan untuk HR; atasan hanya bila HR memberinya akses. Tanpa akses butirnya
      // tidak dikirim sama sekali, sehingga atasan tidak bisa menyimpulkan ada temuan.
      if (nonTrainingAllowed) {
        const rows = await stores.tna.listNonTrainingSummary(tenantId, isHr ? { excludeFrozen: true } : { userIds: scope.userIds, excludeFrozen: true });
        add('non_training_findings', rows.filter((f) => inScope.has(f.userId)).length);
      }
    }
    if (dnaOn && isHr) add('competencies_unapproved', unapproved);
    if (dnaOn || tnaOn) kpis.employeesAnalyzed = ids.filter((id) => analyzed.has(id)).length;

    const parts = LNA_PARTS.map((key) => ({ key, active: open(key) }));
    const modules = [
      { no: 1, key: 'lna', active: parts.some((p) => p.active), parts },
      ...MODULE_GATES.map(({ no, key, active }) => ({ no, key, active: active({ open, fullSuite, flags: allFlags }) })),
    ].filter((m) => isHr || TEAM_MODULES.includes(m.key));

    // Audit (R2-2, gagal-tertutup). Agregat tim kecil bisa menunjuk orang, jadi untuk atasan dicatat sebagai baca
    // data individu dengan id bawahannya. Agregat seluruh tenant untuk HR dicatat ringkas tanpa daftar id.
    if (isHr) {
      await audit.record(req, 'read', 'dashboard.summary', { scope: 'all', people: people.length });
      // Baris Pareto tanpa kompetensi memuat judul temuan seseorang, jadi bukan lagi agregat
      if (titleRowIds.length) await audit.readIndividual(req, 'dashboard.pareto', { employeeIds: titleRowIds });
    }
    else await audit.readIndividual(req, 'dashboard.summary', { employeeIds: ids });

    res.json({ data: { scope: scope.all ? 'all' : 'team', people: people.length, kpis, modules, pareto, actions } });
  }));

  return r;
}

module.exports = { dashboardRouter };
