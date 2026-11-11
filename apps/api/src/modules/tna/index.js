'use strict';
// Training Needs Analysis (TNA). RG-2: dipicu target OKR/KPI/SLA yang tidak tercapai; hasil training-related
// menjadi training plan. RG-3: learner dirinya, atasan timnya, HR semua. RG-4: temuan non-training (INA)
// tetap direkam tetapi tidak ditampilkan selama flag INA mati.
// Terbuka: BT-29 (siapa diwawancarai), BT-30 (rumus Pareto), BT-31 (alur request training), K-1 (LMS), K-3 (status).
const crypto = require('crypto');
const express = require('express');
const { requireRole, ROLES } = require('../../core/rbac');
const { scopeFor, inScope } = require('../../core/rbac/scope');
const { INTERVIEW_SCOPES } = require('../../core/settings');
const { FLAGS } = require('../../core/flags');
const { badRequest, notFound, forbidden, HttpError } = require('../../core/errors');
const { interviewRouter, wrap } = require('../interviews');
const { normalizeRow, evaluate } = require('./performance');
const { selectInterviewees } = require('./targeting');
const { rankTrainingNeeds } = require('./pareto');

const PLAN_STATUSES = ['proposed', 'needs_module', 'assigned', 'in_progress', 'completed', 'cancelled'];

module.exports = {
  key: 'tna',
  title: 'Training Needs Analysis',
  router({ stores, ai, settings, catalog, flags } = {}) {
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
      const normalized = rows.map((raw, index) => ({ index, ...normalizeRow(raw) }));
      const ok = normalized.filter((n) => n.row);
      const users = await stores.people.resolve(req.tenantId, {
        employeeIds: ok.map((n) => n.row.employeeId).filter(Boolean), emails: ok.map((n) => n.row.email).filter(Boolean),
      });
      const rejected = normalized.filter((n) => n.error).map((n) => ({ index: n.index, reason: n.error }));
      const accepted = [];
      for (const n of ok) {
        const u = users.find((x) => (n.row.employeeId && x.employeeId === n.row.employeeId) || (n.row.email && x.email === n.row.email));
        if (!u) { rejected.push({ index: n.index, reason: 'Karyawan tidak ditemukan di organisasi ini' }); continue; }
        accepted.push({ userId: u.id, metricType: n.row.metricType, name: n.row.name, target: n.row.target, actual: n.row.actual, isMet: n.row.isMet, direction: n.row.direction, unit: n.row.unit });
      }
      const batchId = crypto.randomUUID();
      if (accepted.length) await stores.tna.insertPerformance(req.tenantId, accepted, { projectId, period, batchId });
      res.status(201).json({ data: { batchId, imported: accepted.length, red: accepted.filter((a) => a.isMet === false).length, rejected } });
    }));

    r.get('/performance', wrap(async (req, res) => {
      const scope = await scopeFor(req, stores.people);
      res.json({ data: await stores.tna.listPerformance(req.tenantId, scope, { period: req.query.period, projectId: req.query.projectId }) });
    }));

    // --- Jadwalkan wawancara TNA untuk tim. BT-29 terbuka: scope dari body atau settings, tidak ada default diam-diam ---
    r.post('/projects/:projectId/interviews', hr, wrap(async (req, res) => {
      const { projectId } = req.params;
      if (!(await stores.projectsExtra.exists(req.tenantId, projectId))) throw notFound('Proyek tidak ditemukan');
      const conf = await settings.get(req.tenantId);
      const scope = (req.body || {}).scope || conf.tna.interviewScope;
      if (!scope) {
        throw new HttpError(400, 'DECISION_PENDING', `Pilih siapa yang diwawancarai: ${INTERVIEW_SCOPES.join(' atau ')} (BT-29 belum diputuskan)`);
      }
      if (!INTERVIEW_SCOPES.includes(scope)) throw badRequest(`scope harus ${INTERVIEW_SCOPES.join(' atau ')}`);
      const { jobRoleId, period } = req.body || {};
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

    r.use('/sessions', interviewRouter({ submodule: 'tna', stores, ai }));

    // --- Temuan & Pareto ---
    r.get('/findings', wrap(async (req, res) => {
      const scope = await scopeFor(req, stores.people);
      res.json({ data: await stores.tna.listFindings(req.tenantId, scope, { projectId: req.query.projectId, categories: await visibleCategories(req.tenantId) }) });
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
        if (!f || f.userId !== req.user.id) throw notFound('Temuan tidak ditemukan');
      }
      const item = await stores.tna.insertPlanItem(req.tenantId, {
        findingId: findingId || null, userId: req.user.id, origin: 'learner_request', status: 'proposed', note: note || null, requestedBy: req.user.id,
      });
      res.status(201).json({ data: item });
    }));

    r.get('/plan-items', wrap(async (req, res) => {
      const scope = await scopeFor(req, stores.people);
      res.json({ data: await stores.tna.listPlanItems(req.tenantId, scope) });
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
