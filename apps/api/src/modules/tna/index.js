'use strict';
// Training Needs Analysis (TNA). RG-2: dipicu target OKR/KPI/SLA yang tidak tercapai; hasil training-related
// menjadi training plan. RG-3: learner dirinya, atasan timnya, HR semua. RG-4: temuan non-training (INA)
// tetap direkam tetapi tidak ditampilkan selama flag INA mati.
// Cadence 11 Nov: TNA bisa berjalan tanpa DACUM/DNA (C4). Cakupan wawancara per kebutuhan perusahaan:
// hanya target merah (default, C3) atau semua karyawan di job role tertentu.
// Terbuka: BT-30 (rumus Pareto), BT-31 (alur request training), K-1 (LMS), K-3 (status).
const crypto = require('crypto');
const express = require('express');
const { requireRole, ROLES } = require('../../core/rbac');
const { scopeFor, inScope } = require('../../core/rbac/scope');
const { INTERVIEW_SCOPES } = require('../../core/settings');
const { FLAGS } = require('../../core/flags');
const { badRequest, notFound, forbidden, HttpError } = require('../../core/errors');
const { interviewRouter, wrap } = require('../interviews');
const { evaluate } = require('./performance');
const { selectInterviewees } = require('./targeting');
const { rankTrainingNeeds } = require('./pareto');
const { importRouter } = require('../imports');
const { getKind } = require('../imports/kinds');
const { validateRows, commitRows } = require('../imports/engine');

const REVIEW_DECISIONS = { approve: 'approved', edit: 'edited', reject: 'rejected' };
const REVIEWED = ['approved', 'edited'];
const CATEGORIES = ['training', 'non_training'];

const PLAN_STATUSES = ['proposed', 'needs_module', 'assigned', 'in_progress', 'completed', 'cancelled'];

module.exports = {
  key: 'tna',
  title: 'Training Needs Analysis',
  router({ stores, ai, aiConfig, settings, catalog, flags, audit, analysis } = {}) {
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
        created.push({ ...(await stores.interviews.create(req.tenantId, { projectId, submodule: 'tna', intervieweeId: p.userId, jobRoleId: m.jobRoleId, triggerRecordIds: p.triggerRecordIds })), focus: p.focus });
      }
      res.status(201).json({ data: { scope, scheduled: created.length, skipped: picks.length - created.length, sessions: created } });
    }));

    r.use('/sessions', interviewRouter({ submodule: 'tna', stores, ai, aiConfig, audit, analysis }));

    // --- Review hasil AI oleh HR (PK-14: PD-14 ★A, PM-3 ★A, PM-5 ★A) ---
    // Temuan dari analisis AI berstatus draf. Draf tidak terlihat atasan dan karyawan, dan tidak dihitung di
    // Pareto, dashboard, rencana, atau ekspor sampai HR menyetujui, mengubah, atau menolaknya.
    // Tidak di balik flag: ini pengaman wajib, bukan fitur opsional.
    r.get('/review', hr, wrap(async (req, res) => {
      const status = req.query.status || 'draft';
      const statuses = status === 'all' ? ['draft', ...Object.values(REVIEW_DECISIONS)] : status === 'reviewed' ? Object.values(REVIEW_DECISIONS) : [status];
      if (!statuses.every((x) => ['draft', ...Object.values(REVIEW_DECISIONS)].includes(x))) throw badRequest('status harus draft, approved, edited, rejected, reviewed, atau all');
      const [rows, counts] = await Promise.all([
        stores.tna.reviewQueue(req.tenantId, { projectId: req.query.projectId, statuses }),
        stores.tna.reviewCounts(req.tenantId, { projectId: req.query.projectId }),
      ]);
      await audit.readIndividual(req, 'tna.review_queue', { employeeIds: rows.map((f) => f.userId), objectType: 'tna_finding', objectIds: rows.map((f) => f.id) });
      res.json({ data: rows, counts });
    }));

    r.post('/findings/:id/review', hr, wrap(async (req, res) => {
      const { decision, title, detail, category, note } = req.body || {};
      const status = REVIEW_DECISIONS[decision];
      if (!status) throw badRequest('decision harus approve, edit, atau reject');
      const clean = (v, max) => (v == null ? undefined : String(v).trim().slice(0, max));
      const patch = { title: clean(title, 255), detail: clean(detail, 4000), note: clean(note, 2000) };
      if (decision === 'edit') {
        if (category != null && !CATEGORIES.includes(category)) throw badRequest(`category harus ${CATEGORIES.join(' atau ')}`);
        if (!patch.title && patch.detail === undefined && !category) throw badRequest('Isi judul, rincian, atau kategori yang diubah');
        if (title != null && !patch.title) throw badRequest('Judul tidak boleh kosong');
      }
      if (decision === 'reject' && !patch.note) throw badRequest('Tulis alasan penolakan di note');
      const current = await stores.tna.getReviewItem(req.tenantId, req.params.id);
      if (!current) throw notFound('Temuan tidak ditemukan');
      if (current.reviewStatus !== 'draft') throw new HttpError(409, 'ALREADY_REVIEWED', 'Temuan ini sudah direview');
      const out = await stores.tna.reviewFinding(req.tenantId, current.id, {
        decision: status, title: patch.title, detail: patch.detail, category: decision === 'edit' ? category : undefined, note: patch.note, reviewerId: req.user.id,
      });
      if (!out) throw new HttpError(409, 'ALREADY_REVIEWED', 'Temuan ini sudah direview');
      await audit.record(req, 'update', 'tna.finding_review', {
        employeeIds: [current.userId], objectType: 'tna_finding', objectIds: [current.id], decision: status, confidence: current.confidence,
      });
      res.json({ data: out });
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
        ...f, missRatio: f.target != null ? evaluate({ target: f.target, actual: f.actual, direction: f.direction }).missRatio : null,
      })), conf.tna.pareto);
      res.json({ data: rows, formula: conf.tna.pareto });
    }));

    // --- Training plan ---
    r.post('/findings/:id/plan', hr, wrap(async (req, res) => {
      const f = await stores.tna.getFinding(req.tenantId, req.params.id);
      if (!f || f.category !== 'training') throw notFound('Temuan training tidak ditemukan');
      if (!REVIEWED.includes(f.reviewStatus)) throw new HttpError(409, 'REVIEW_PENDING', 'Setujui temuan ini di antrean review sebelum membuat training plan');
      const conf = await settings.get(req.tenantId);
      const competency = f.competencyId ? await stores.dna.getCompetency(req.tenantId, f.competencyId) : null;
      const hit = await catalog.match({ tenantId: req.tenantId, targets: conf.lms.targets, competency, tier: req.body?.programTier });
      const item = await stores.tna.insertPlanItem(req.tenantId, {
        findingId: f.id, userId: f.userId, origin: 'hr', status: hit ? 'proposed' : 'needs_module',
        programTier: req.body?.programTier || null, catalogSource: hit?.source, catalogItemRef: hit?.ref, catalogItemTitle: hit?.title,
        note: req.body?.note || null,
      });
      await stores.tna.setFindingStatus(req.tenantId, f.id, 'planned');
      res.status(201).json({ data: item });
    }));

    // Request training oleh learner (RG-2). BT-31 terbuka: HR dan atasan sama-sama bisa memproses lewat PATCH.
    r.post('/training-requests', wrap(async (req, res) => {
      const { findingId, note } = req.body || {};
      if (!findingId && !note) throw badRequest('findingId atau note wajib diisi');
      if (findingId) {
        const f = await stores.tna.getFinding(req.tenantId, findingId);
        if (!f || f.userId !== req.user.id || !REVIEWED.includes(f.reviewStatus)) throw notFound('Temuan tidak ditemukan');
      }
      const item = await stores.tna.insertPlanItem(req.tenantId, {
        findingId: findingId || null, userId: req.user.id, origin: 'learner_request', status: 'proposed', note: note || null, requestedBy: req.user.id,
      });
      res.status(201).json({ data: item });
    }));

    r.get('/plan-items', wrap(async (req, res) => {
      const scope = await scopeFor(req, stores.people);
      const rows = await stores.tna.listPlanItems(req.tenantId, scope);
      await audit.readIndividual(req, 'tna.plan_items', { employeeIds: rows.map((p) => p.userId), objectType: 'tna_plan_item', objectIds: rows.map((p) => p.id) });
      res.json({ data: rows });
    }));

    r.patch('/plan-items/:id', requireRole(ROLES.HR_ADMIN, ROLES.SUPERVISOR), wrap(async (req, res) => {
      const item = await stores.tna.getPlanItem(req.tenantId, req.params.id);
      const scope = await scopeFor(req, stores.people);
      if (!item || !inScope(scope, item.userId)) throw notFound('Item training plan tidak ditemukan');
      const { status, catalogItemRef, catalogItemTitle, catalogSource } = req.body || {};
      if (status && !PLAN_STATUSES.includes(status)) throw badRequest(`status harus salah satu: ${PLAN_STATUSES.join(', ')}`);
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
      // HR melihat jumlah temuan yang menunggu review; peran lain tidak tahu ada draf (PM-5 ★A)
      const isHr = [ROLES.HR_ADMIN, ROLES.ETA_ADMIN].includes(req.user.role);
      const reviewPending = isHr ? (await stores.tna.reviewCounts(req.tenantId, { projectId: req.query.projectId })).draft : undefined;
      const count = (arr, key) => arr.reduce((acc, x) => ({ ...acc, [x[key]]: (acc[x[key]] || 0) + 1 }), {});
      res.json({
        data: {
          role: req.user.role,
          people: scope.all ? null : scope.userIds.length,
          redTargets: perf.filter((p) => p.isMet === false).length,
          sessions: count(sessions, 'status'),
          trainingFindings: findings.length,
          planItems: count(plan, 'status'),
          ...(isHr ? { reviewPending } : {}),
        },
      });
    }));

    return r;
  },
};
