'use strict';
// Training Needs Analysis (TNA). RG-2: dipicu target OKR/KPI/SLA yang tidak tercapai; hasil training-related
// menjadi training plan. RG-3: learner dirinya, atasan timnya, HR semua. RG-4: temuan non-training (INA)
// tetap direkam tetapi tidak ditampilkan selama flag INA mati.
// Cadence 11 Nov: TNA bisa berjalan tanpa DACUM/DNA (C4). Cakupan wawancara per kebutuhan perusahaan:
// hanya target merah (default, C3) atau semua karyawan di job role tertentu.
// PK-23 (PM-8 ★ B+C+D+E, PM-6 dijawab 17 Nov): status rencana K-3, permintaan training ditunda di balik flag
// (BT-31), daftar ringkas non-training untuk HR dan atasan yang diberi akses HR, di balik flag. Undangan 7 hari + pengingat: modules/interviews.
// Terbuka: BT-30 (rumus Pareto), BT-31 (alur request training), K-1 (LMS).
// PK-18/PK-20 (17 Nov): katalog course statis (Moodle) + aturan toleransi KPI (PM-1 ★ B).
const crypto = require('crypto');
const express = require('express');
const { requireRole, ROLES } = require('../../core/rbac');
const { scopeFor, inScope } = require('../../core/rbac/scope');
const { INTERVIEW_SCOPES } = require('../../core/settings');
const { FLAGS, requireFlag } = require('../../core/flags');
const { badRequest, notFound, forbidden, HttpError } = require('../../core/errors');
const { interviewRouter, wrap } = require('../interviews');
const { inviteExpiry } = require('../interviews/invitation');
const { evaluate, metricKey, METRIC_TYPES } = require('./performance');
const { selectInterviewees } = require('./targeting');
const { rankTrainingNeeds } = require('./pareto');
const { importRouter } = require('../imports');
const { getKind } = require('../imports/kinds');
const { validateRows, commitRows } = require('../imports/engine');
const { PLAN_STATUSES, PLAN_STATUS_LABEL, initialStatus, canTransition } = require('./plan-status');

module.exports = {
  key: 'tna',
  title: 'Training Needs Analysis',
  router({ stores, ai, settings, catalog, flags, audit } = {}) {
    const r = express.Router();
    const hr = requireRole(ROLES.HR_ADMIN);

    async function visibleCategories(tenantId) {
      const ina = (await flags.isEnabled(tenantId, FLAGS.MODULE_INA)) && (await flags.isEnabled(tenantId, FLAGS.INA_DASHBOARD));
      return ina ? ['training', 'non_training'] : ['training'];
    }

    r.get('/', (req, res) => res.json({ module: 'tna', title: 'Training Needs Analysis', tenantId: req.tenantId, role: req.user.role }));

    // --- Data kinerja (unggah file, mis. ekspor HappyFive; web mengubah CSV jadi rows) ---
    r.post('/performance/import', hr, wrap(async (req, res) => {
      const { rows, period, projectId } = req.body || {};
      if (!Array.isArray(rows) || !rows.length || rows.length > 5000) throw badRequest('rows wajib berisi 1-5000 baris');
      if (!period) throw badRequest('period wajib diisi (mis. 2026-Q4)');
      if (projectId && !(await stores.projectsExtra.exists(req.tenantId, projectId))) throw notFound('Proyek tidak ditemukan');
      const kind = getKind('tna_performance');
      const ctx = { stores, tenantId: req.tenantId, options: { period, projectId } };
      const { accepted, rejected } = await validateRows(kind, rows, ctx);
      const batchId = crypto.randomUUID();
      const summary = await commitRows(kind, accepted, { ...ctx, batchId, user: req.user });
      res.status(201).json({ data: { batchId, imported: accepted.length, red: summary.red || 0, rejected: rejected.map(({ index, reason }) => ({ index, reason })) } });
    }));

    // R3-3: impor file XLSX/CSV dengan pemetaan kolom (karyawan, kinerja KPI/OKR/SLA)
    r.use('/imports', importRouter({ submodule: 'tna', stores, audit }));

    // Job role untuk pilihan cakupan wawancara; tersedia tanpa modul DNA (TNA bisa dijual sendiri, C4)
    r.get('/job-roles', hr, wrap(async (req, res) => {
      const [rows, conf] = await Promise.all([stores.dna.listJobRoles(req.tenantId), settings.get(req.tenantId)]);
      res.json({
        data: rows.map((jr) => ({ id: jr.id, name: jr.name, division: jr.division ?? null })),
        defaults: { scope: conf.tna.interviewScope, jobRoleId: conf.tna.interviewJobRoleId },
      });
    }));

    // --- PM-1 opsi B (★): aturan arah + toleransi per KPI. Mengubah aturan menghitung ulang status lama (C-8) ---
    r.get('/kpi-rules', hr, wrap(async (req, res) => {
      res.json({ data: await stores.tna.listKpiRules(req.tenantId) });
    }));

    r.put('/kpi-rules', hr, wrap(async (req, res) => {
      const { metricType, name, direction = 'higher', tolerance = 0 } = req.body || {};
      if (!METRIC_TYPES.includes(metricType)) throw badRequest(`metricType harus ${METRIC_TYPES.join(', ')}`);
      if (!metricKey(name)) throw badRequest('name (nama metrik) wajib diisi');
      if (!['higher', 'lower'].includes(direction)) throw badRequest('direction harus higher atau lower');
      const tol = Number(tolerance);
      if (!Number.isFinite(tol) || tol < 0) throw badRequest('tolerance harus angka 0 atau lebih');
      const before = (await stores.tna.listKpiRules(req.tenantId)).find((x) => x.metricType === metricType && x.metricKey === metricKey(name)) || null;
      const [rule] = await stores.tna.upsertKpiRules(req.tenantId, [{ metricType, metricKey: metricKey(name), name: String(name).trim(), direction, tolerance: tol }], req.user.id);
      const recomputed = await stores.tna.recomputePerformance(req.tenantId, [rule]);
      await audit.record(req, 'update', 'tna.kpi_rule', {
        ruleId: rule.id, metricType, name: rule.name,
        before: before ? { direction: before.direction, tolerance: before.tolerance } : null, after: { direction, tolerance: tol }, recomputed,
      });
      res.json({ data: { rule, recomputed } });
    }));

    // --- PK-18: katalog course statis (hasil impor) untuk HR ---
    r.get('/catalog', hr, wrap(async (req, res) => {
      res.json({ data: await stores.catalog.listItems(req.tenantId) });
    }));

    r.get('/performance', wrap(async (req, res) => {
      const scope = await scopeFor(req, stores.people);
      res.json({ data: await stores.tna.listPerformance(req.tenantId, scope, { period: req.query.period, projectId: req.query.projectId }) });
    }));

    // --- Jadwalkan wawancara TNA untuk tim. Scope dari body, lalu settings tenant (default red_only) ---
    r.post('/projects/:projectId/interviews', hr, wrap(async (req, res) => {
      const { projectId } = req.params;
      if (!(await stores.projectsExtra.exists(req.tenantId, projectId))) throw notFound('Proyek tidak ditemukan');
      const conf = await settings.get(req.tenantId);
      const scope = (req.body || {}).scope || conf.tna.interviewScope;
      if (!scope) {
        throw new HttpError(400, 'DECISION_PENDING', `Pilih siapa yang diwawancarai: ${INTERVIEW_SCOPES.join(' atau ')}`);
      }
      if (!INTERVIEW_SCOPES.includes(scope)) throw badRequest(`scope harus ${INTERVIEW_SCOPES.join(' atau ')}`);
      const body = req.body || {};
      const { period } = body;
      // jobRoleId dari body; bila scope diambil dari konfigurasi klien, job role default-nya ikut dipakai
      const jobRoleId = body.jobRoleId || (!body.scope && scope === 'all_members' ? conf.tna.interviewJobRoleId : null) || undefined;
      // Klarifikasi user 12 Nov: cakupan mengikuti kebutuhan perusahaan, yaitu hanya target merah atau semua
      // karyawan di role tertentu. 'all_members' wajib menyebut job role agar tidak mewawancarai seluruh organisasi.
      if (scope === 'all_members' && !jobRoleId) throw badRequest('Pilih job role untuk mewawancarai semua karyawannya');
      if (jobRoleId && !(await stores.dna.listJobRoles(req.tenantId)).some((jr) => jr.id === jobRoleId)) throw notFound('Job role tidak ditemukan');
      const members = await stores.people.list(req.tenantId, { all: true }, { roles: ['learner'], jobRoleId });
      const records = await stores.tna.listPerformance(req.tenantId, { all: true }, { period, projectId, userIds: members.map((m) => m.id) });
      const picks = selectInterviewees({ members, records, scope });
      const open = await stores.interviews.openFor(req.tenantId, { projectId, submodule: 'tna' });
      const created = [];
      for (const p of picks) {
        if (open.has(p.userId)) continue;
        const m = members.find((x) => x.id === p.userId);
        created.push({ ...(await stores.interviews.create(req.tenantId, { projectId, submodule: 'tna', intervieweeId: p.userId, jobRoleId: m.jobRoleId, triggerRecordIds: p.triggerRecordIds, inviteExpiresAt: inviteExpiry() })), focus: p.focus });
      }
      res.status(201).json({ data: { scope, scheduled: created.length, skipped: picks.length - created.length, sessions: created } });
    }));

    r.use('/sessions', interviewRouter({ submodule: 'tna', stores, ai, audit }));

    // PM-6 (jawaban user 17 Nov): temuan "bukan masalah pelatihan" tampil untuk HR secara bawaan, ringkas,
    // tanpa rencana aksi. Atasan langsung melihat temuan timnya hanya bila HR memberinya akses (bisa dicabut,
    // diaudit). Karyawan tidak melihatnya. Seluruhnya di balik flag tna.non_training_hr.
    const nonTrainingFlag = requireFlag(flags, FLAGS.TNA_NON_TRAINING_HR, 'Daftar temuan di luar pelatihan belum diaktifkan untuk organisasi Anda');
    r.get('/findings/non-training', nonTrainingFlag, wrap(async (req, res) => {
      const { role } = req.user;
      let userIds;
      if (role === ROLES.SUPERVISOR) {
        if (!(await stores.tna.hasNonTrainingGrant(req.tenantId, req.user.id))) {
          throw forbidden('NO_NON_TRAINING_ACCESS', 'HR belum memberi Anda akses ke temuan di luar pelatihan');
        }
        userIds = await stores.people.directReportIds(req.tenantId, req.user.id); // tim saja, bukan dirinya
      } else if (![ROLES.HR_ADMIN, ROLES.ETA_ADMIN].includes(role)) {
        throw forbidden('ROLE_FORBIDDEN', 'Temuan di luar pelatihan hanya untuk HR dan atasan yang diberi akses');
      }
      const rows = await stores.tna.listNonTrainingSummary(req.tenantId, { projectId: req.query.projectId, userIds });
      await audit.readIndividual(req, 'tna.findings_non_training', { employeeIds: rows.map((f) => f.userId), objectType: 'tna_finding', objectIds: rows.map((f) => f.id) });
      res.json({ data: rows });
    }));

    // Atasan memeriksa apakah dirinya punya akses (untuk menampilkan bagian di web)
    r.get('/non-training-access/me', nonTrainingFlag, wrap(async (req, res) => {
      const granted = [ROLES.HR_ADMIN, ROLES.ETA_ADMIN].includes(req.user.role)
        || (req.user.role === ROLES.SUPERVISOR && (await stores.tna.hasNonTrainingGrant(req.tenantId, req.user.id)));
      res.json({ data: { granted } });
    }));

    // HR mengelola izin atasan
    r.get('/non-training-access', hr, nonTrainingFlag, wrap(async (req, res) => {
      const [grants, supervisors] = await Promise.all([
        stores.tna.nonTrainingGrants(req.tenantId),
        stores.people.list(req.tenantId, { all: true }, { roles: [ROLES.SUPERVISOR] }),
      ]);
      res.json({ data: grants, supervisors: supervisors.map((s) => ({ id: s.id, name: s.name, email: s.email })) });
    }));

    async function loadSupervisor(req) {
      const person = await stores.people.get(req.tenantId, req.params.supervisorId);
      if (!person || person.role !== ROLES.SUPERVISOR) throw notFound('Atasan tidak ditemukan');
      return person;
    }

    r.put('/non-training-access/:supervisorId', hr, nonTrainingFlag, wrap(async (req, res) => {
      const sup = await loadSupervisor(req);
      const created = await stores.tna.grantNonTraining(req.tenantId, sup.id, req.user.id);
      if (created) await audit.record(req, 'create', 'tna.non_training_access', { supervisorId: sup.id, employeeIds: [sup.id] });
      res.json({ data: { supervisorId: sup.id, granted: true, changed: created } });
    }));

    r.delete('/non-training-access/:supervisorId', hr, nonTrainingFlag, wrap(async (req, res) => {
      const sup = await loadSupervisor(req);
      const revoked = await stores.tna.revokeNonTraining(req.tenantId, sup.id, req.user.id);
      if (revoked) await audit.record(req, 'delete', 'tna.non_training_access', { supervisorId: sup.id, employeeIds: [sup.id] });
      res.json({ data: { supervisorId: sup.id, granted: false, changed: revoked } });
    }));

    // --- Temuan & Pareto ---
    r.get('/findings', wrap(async (req, res) => {
      const scope = await scopeFor(req, stores.people);
      const rows = await stores.tna.listFindings(req.tenantId, scope, { projectId: req.query.projectId, categories: await visibleCategories(req.tenantId) });
      await audit.readIndividual(req, 'tna.findings', { employeeIds: rows.map((f) => f.userId), objectType: 'tna_finding', objectIds: rows.map((f) => f.id) });
      res.json({ data: rows });
    }));

    r.get('/pareto', wrap(async (req, res) => {
      if (req.user.role === ROLES.LEARNER) throw forbidden('ROLE_FORBIDDEN', 'Prioritas tim hanya untuk HR dan atasan');
      const scope = await scopeFor(req, stores.people);
      const conf = await settings.get(req.tenantId);
      const findings = await stores.tna.listFindings(req.tenantId, scope, { projectId: req.query.projectId, categories: ['training'] });
      const rows = rankTrainingNeeds(findings.map((f) => ({
        ...f, missRatio: f.target != null ? evaluate({ target: f.target, actual: f.actual, direction: f.direction, tolerance: f.tolerance }).missRatio : null,
      })), conf.tna.pareto);
      res.json({ data: rows, formula: conf.tna.pareto });
    }));

    // --- Training plan ---
    r.post('/findings/:id/plan', hr, wrap(async (req, res) => {
      const f = await stores.tna.getFinding(req.tenantId, req.params.id);
      if (!f || f.category !== 'training') throw notFound('Temuan training tidak ditemukan');
      const conf = await settings.get(req.tenantId);
      const competency = f.competencyId ? await stores.dna.getCompetency(req.tenantId, f.competencyId) : null;
      const hit = await catalog.match({ tenantId: req.tenantId, targets: conf.lms.targets, competency, tier: req.body?.programTier });
      const item = await stores.tna.insertPlanItem(req.tenantId, {
        findingId: f.id, userId: f.userId, origin: 'hr', status: initialStatus('hr'),
        programTier: req.body?.programTier || null, catalogSource: hit?.source, catalogItemRef: hit?.ref, catalogItemTitle: hit?.title,
        note: req.body?.note || null,
      });
      await stores.tna.setFindingStatus(req.tenantId, f.id, 'planned');
      res.status(201).json({ data: { ...item, catalogItemUrl: hit?.url || null } });
    }));

    // Request training oleh learner (RG-2). PM-8 B: BT-31 ditunda, jadi endpoint di balik flag (default mati)
    // dan tombolnya disembunyikan di web. Bila dinyalakan, HR dan atasan memproses lewat PATCH.
    r.post('/training-requests', requireFlag(flags, FLAGS.TNA_TRAINING_REQUEST, 'Permintaan training belum dibuka selama POC'), wrap(async (req, res) => {
      const { findingId, note } = req.body || {};
      if (!findingId && !note) throw badRequest('findingId atau note wajib diisi');
      if (findingId) {
        const f = await stores.tna.getFinding(req.tenantId, findingId);
        if (!f || f.userId !== req.user.id) throw notFound('Temuan tidak ditemukan');
      }
      const item = await stores.tna.insertPlanItem(req.tenantId, {
        findingId: findingId || null, userId: req.user.id, origin: 'learner_request', status: initialStatus('learner_request'), note: note || null, requestedBy: req.user.id,
      });
      res.status(201).json({ data: item });
    }));

    r.get('/plan-items', wrap(async (req, res) => {
      const scope = await scopeFor(req, stores.people);
      const rows = await stores.tna.listPlanItems(req.tenantId, scope);
      await audit.readIndividual(req, 'tna.plan_items', { employeeIds: rows.map((p) => p.userId), objectType: 'tna_plan_item', objectIds: rows.map((p) => p.id) });
      res.json({ data: rows, statusLabels: PLAN_STATUS_LABEL });
    }));

    // K-3: hanya perpindahan status yang sah (Diminta -> Baru -> Berjalan -> Selesai; Ditolak sebelum selesai)
    r.patch('/plan-items/:id', requireRole(ROLES.HR_ADMIN, ROLES.SUPERVISOR), wrap(async (req, res) => {
      const item = await stores.tna.getPlanItem(req.tenantId, req.params.id);
      const scope = await scopeFor(req, stores.people);
      if (!item || !inScope(scope, item.userId)) throw notFound('Item training plan tidak ditemukan');
      const { status, catalogItemRef, catalogItemTitle, catalogSource } = req.body || {};
      if (status && !PLAN_STATUSES.includes(status)) throw badRequest(`status harus salah satu: ${PLAN_STATUSES.join(', ')}`);
      if (status && status !== item.status && !canTransition(item.status, status)) {
        throw new HttpError(409, 'INVALID_TRANSITION', `Status "${PLAN_STATUS_LABEL[item.status]}" tidak bisa diubah menjadi "${PLAN_STATUS_LABEL[status]}"`);
      }
      res.json({ data: await stores.tna.updatePlanItem(req.tenantId, item.id, { status, catalogItemRef, catalogItemTitle, catalogSource }) });
    }));

    // Ringkasan dashboard sesuai peran
    r.get('/dashboard', wrap(async (req, res) => {
      const scope = await scopeFor(req, stores.people);
      const [sessions, findings, plan, perf] = await Promise.all([
        stores.interviews.list(req.tenantId, 'tna', scope, { projectId: req.query.projectId }),
        stores.tna.listFindings(req.tenantId, scope, { projectId: req.query.projectId, categories: ['training'] }),
        stores.tna.listPlanItems(req.tenantId, scope),
        stores.tna.listPerformance(req.tenantId, scope, { projectId: req.query.projectId }),
      ]);
      const count = (arr, key) => arr.reduce((acc, x) => ({ ...acc, [x[key]]: (acc[x[key]] || 0) + 1 }), {});
      res.json({
        data: {
          role: req.user.role,
          people: scope.all ? null : scope.userIds.length,
          redTargets: perf.filter((p) => p.isMet === false).length,
          sessions: count(sessions, 'status'),
          trainingFindings: findings.length,
          planItems: count(plan, 'status'),
        },
      });
    }));

    return r;
  },
};
