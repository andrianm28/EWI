'use strict';
// B4 Developmental Needs: endpoint kamus per job function, kurikulum BIA, tahap dan rencana pengembangan.
// Spek dan aturan A1-A13: docs/designs/b4-developmental-needs.md. Dipasang di router `dna` (requireSubmodule('dna')).
const { requireRole, ROLES } = require('../../core/rbac');
const { scopeFor, inScope } = require('../../core/rbac/scope');
const { badRequest, notFound, conflict } = require('../../core/errors');
const { wrap } = require('../interviews');
const { TIERS, developmentPlan, stageDistribution, dictionaryStatus } = require('./development');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID.test(v);
const EMPLOYEE_ROLES = ['learner', 'supervisor', 'role_leader', 'sme']; // A13, sama dengan GET /dna/employees

/** Pelanggaran indeks unik yang lolos pengecekan awal (balapan) -> 409, bukan 500. */
const isUniqueViolation = (e) => e && (e.name === 'SequelizeUniqueConstraintError' || (e.original && e.original.code === '23505'));
async function orConflict(promise, message) {
  try { return await promise; } catch (e) { if (isUniqueViolation(e)) throw conflict(message); throw e; }
}

const jobFunctionView = (f) => ({ id: f.id, jobRoleId: f.jobRoleId, order: f.order, name: f.name, competencyIds: f.competencyIds || [] });
const sameText = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

function developmentRoutes(r, { stores, audit }) {
  const hr = requireRole(ROLES.HR_ADMIN);
  const viewer = requireRole(ROLES.HR_ADMIN, ROLES.SUPERVISOR);

  /** Job role di path: harus UUID dan milik tenant, selain itu 404 (A12). */
  async function roleFromPath(req) {
    const role = isUuid(req.params.id) ? await stores.dna.getJobRole(req.tenantId, req.params.id) : null;
    if (!role) throw notFound('Jabatan tidak ditemukan');
    return role;
  }
  async function jobFunctionFromPath(req) {
    const f = isUuid(req.params.id) ? await stores.dna.getJobFunction(req.tenantId, req.params.id) : null;
    if (!f) throw notFound('Job function tidak ditemukan');
    return f;
  }
  /** competencyIds di body: kompetensi jabatan (kind 'job') milik job role yang sama, selain itu 400. */
  async function checkCompetencyIds(tenantId, jobRoleId, ids) {
    if (!Array.isArray(ids) || ids.some((id) => !isUuid(id))) throw badRequest('competencyIds harus daftar id kompetensi');
    if (!ids.length) return [];
    const valid = new Set((await stores.dna.listJobCompetencies(tenantId, jobRoleId)).map((c) => c.id));
    if (ids.some((id) => !valid.has(id))) throw badRequest('competencyIds harus kompetensi jabatan dari jabatan yang sama');
    return [...new Set(ids)];
  }
  function checkJobFunctionFields({ name, order }, { nameRequired }) {
    if (name !== undefined || nameRequired) {
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 255) throw badRequest('name wajib diisi (maksimal 255 karakter)');
    }
    if (order !== undefined && order !== null && !(Number.isInteger(order) && order >= 1 && order <= 32767)) throw badRequest('order harus bilangan bulat mulai 1');
  }
  async function assertJobFunctionFree(tenantId, jobRoleId, { name, order }, exceptId) {
    const others = (await stores.dna.listJobFunctions(tenantId, jobRoleId)).filter((f) => f.id !== exceptId);
    if (name !== undefined && others.some((f) => sameText(f.name, name))) throw conflict('Nama job function sudah dipakai di jabatan ini');
    if (order != null && others.some((f) => f.order === order)) throw conflict(`Nomor job function ${order} sudah dipakai di jabatan ini`);
  }

  /** Jabatan terpilih: dari query (harus milik tenant, selain itu 400) atau jabatan berkamus pertama menurut nama. */
  async function pickJobRole(req, jobs) {
    const q = req.query.jobRoleId;
    if (q === undefined || q === '') return jobs.find((j) => j.dictionary === 'available') || null;
    const job = jobs.find((j) => j.id === q);
    if (!job) throw badRequest('jobRoleId bukan jabatan di organisasi ini');
    return job;
  }
  async function jobsWithDictionary(tenantId) {
    const [roles, counts] = await Promise.all([stores.dna.listJobRoles(tenantId), stores.dna.dictionaryCounts(tenantId)]);
    const byRole = new Map(counts.map((c) => [c.jobRoleId, c.competencyCount]));
    return roles.map((j) => {
      const competencyCount = byRole.get(j.id) || 0;
      return { id: j.id, name: j.name, division: j.division || null, dictionary: competencyCount ? 'available' : 'none', competencyCount };
    });
  }
  /** Rencana semua pegawai jabatan itu dalam scope pemanggil (A4, A9, A13). */
  async function plansFor(req, jobRoleId, competencies) {
    const scope = await scopeFor(req, stores.people);
    const people = await stores.people.list(req.tenantId, scope, { roles: EMPLOYEE_ROLES, jobRoleId });
    const assessments = await stores.dna.assessmentsFor(req.tenantId, people.map((p) => p.id));
    const byUser = new Map();
    for (const a of assessments) { if (!byUser.has(a.userId)) byUser.set(a.userId, []); byUser.get(a.userId).push(a); }
    return { scope, rows: people.map((p) => ({ person: p, plan: developmentPlan({ competencies, assessments: byUser.get(p.id) || [] }) })) };
  }

  // --- Ringkasan ---
  r.get('/development/overview', viewer, wrap(async (req, res) => {
    const jobs = await jobsWithDictionary(req.tenantId);
    const job = await pickJobRole(req, jobs);
    const base = { jobs, selectedJobRoleId: job ? job.id : null };
    const totals = { jobsWithDictionary: jobs.filter((j) => j.dictionary === 'available').length, jobsTotal: jobs.length };
    if (!job) {
      return res.json({ data: { ...base, kpi: { employees: 0, jobFunctions: 0, competencies: 0, ...totals }, stageDistribution: [], dictionary: { ...dictionaryStatus({ jobFunctions: [], competencies: [] }), assessedCompetencyCount: 0 } } });
    }
    const [competencies, jobFunctions, assessedCompetencyCount] = await Promise.all([
      stores.dna.listJobCompetencies(req.tenantId, job.id), stores.dna.listJobFunctions(req.tenantId, job.id), stores.dna.assessedCompetencyCount(req.tenantId, job.id),
    ]);
    const { scope, rows } = await plansFor(req, job.id, competencies);
    // A11: untuk atasan, distribusi tahap tim kecil setara data individu, jadi dicatat.
    if (!scope.all) await audit.readIndividual(req, 'dna.development_overview', { employeeIds: rows.map((x) => x.person.id), objectType: 'dna_development' });
    return res.json({
      data: {
        ...base,
        kpi: { employees: rows.length, jobFunctions: jobFunctions.length, competencies: competencies.length, ...totals },
        stageDistribution: stageDistribution(rows.map((x) => x.plan.stage)),
        dictionary: { ...dictionaryStatus({ jobFunctions, competencies }), assessedCompetencyCount },
      },
    });
  }));

  // --- Kamus kompetensi per job function ---
  r.get('/job-roles/:id/dictionary', viewer, wrap(async (req, res) => {
    const role = await roleFromPath(req);
    const { jobFunctionId, tier } = req.query;
    if (tier !== undefined && !TIERS.includes(tier)) throw badRequest('tier harus basic, intermediate, atau advanced');
    const [competencies, jobFunctions, assessedCompetencyCount] = await Promise.all([
      stores.dna.listJobCompetencies(req.tenantId, role.id), stores.dna.listJobFunctions(req.tenantId, role.id), stores.dna.assessedCompetencyCount(req.tenantId, role.id),
    ]);
    if (jobFunctionId !== undefined && !jobFunctions.some((f) => f.id === jobFunctionId)) throw badRequest('jobFunctionId bukan job function jabatan ini');
    const jfOf = new Map();
    for (const f of jobFunctions) for (const cid of f.competencyIds) { if (!jfOf.has(cid)) jfOf.set(cid, []); jfOf.get(cid).push(f.id); }
    const rows = competencies
      .map((c) => ({ id: c.id, code: c.code, name: c.name, stream: c.stream, programTier: c.programTier, requiredScore: c.requiredScore, approvedAt: c.approvedAt, jobFunctionIds: jfOf.get(c.id) || [] }))
      .filter((c) => (!tier || c.programTier === tier) && (!jobFunctionId || c.jobFunctionIds.includes(jobFunctionId)));
    res.json({
      data: {
        jobRole: { id: role.id, name: role.name },
        jobFunctions: jobFunctions.map((f) => ({ id: f.id, order: f.order, name: f.name, competencyCount: f.competencyIds.length })),
        competencies: rows,
        dictionary: { ...dictionaryStatus({ jobFunctions, competencies }), assessedCompetencyCount },
      },
    });
  }));

  r.post('/job-roles/:id/job-functions', hr, wrap(async (req, res) => {
    const role = await roleFromPath(req);
    const { name, order, competencyIds = [] } = req.body || {};
    checkJobFunctionFields({ name, order }, { nameRequired: true });
    const ids = await checkCompetencyIds(req.tenantId, role.id, competencyIds);
    await assertJobFunctionFree(req.tenantId, role.id, { name, order });
    const row = await orConflict(stores.dna.createJobFunction(req.tenantId, { jobRoleId: role.id, name: name.trim(), order, competencyIds: ids }),
      'Nama atau nomor job function sudah dipakai di jabatan ini');
    res.status(201).json({ data: jobFunctionView(row) });
  }));

  r.patch('/job-functions/:id', hr, wrap(async (req, res) => {
    const f = await jobFunctionFromPath(req);
    const { name, order } = req.body || {};
    if (name === undefined && order === undefined) throw badRequest('Isi name atau order');
    checkJobFunctionFields({ name, order }, { nameRequired: false });
    await assertJobFunctionFree(req.tenantId, f.jobRoleId, { name, order }, f.id);
    const row = await orConflict(stores.dna.updateJobFunction(req.tenantId, f.id, { name: name === undefined ? undefined : name.trim(), order }),
      'Nama atau nomor job function sudah dipakai di jabatan ini');
    res.json({ data: jobFunctionView(row) });
  }));

  r.delete('/job-functions/:id', hr, wrap(async (req, res) => {
    const f = await jobFunctionFromPath(req);
    await stores.dna.deleteJobFunction(req.tenantId, f.id);
    res.status(204).end();
  }));

  r.put('/job-functions/:id/competencies', hr, wrap(async (req, res) => {
    const f = await jobFunctionFromPath(req);
    const ids = await checkCompetencyIds(req.tenantId, f.jobRoleId, (req.body || {}).competencyIds);
    res.json({ data: jobFunctionView(await stores.dna.setJobFunctionCompetencies(req.tenantId, f.id, ids)) });
  }));

  r.post('/job-roles/:id/dictionary/approve', hr, wrap(async (req, res) => {
    const role = await roleFromPath(req);
    const approved = await stores.dna.approveDictionary(req.tenantId, role.id, req.user.id);
    // audit_logs.action dibatasi CHECK (read/create/update/delete/export/login): pengesahan = update dengan event di meta
    await audit.record(req, 'update', 'dna.dictionary', { event: 'approve', jobRoleId: role.id, approved });
    res.json({ data: { approved } });
  }));

  // --- Kurikulum Basic / Intermediate / Advanced ---
  r.get('/job-roles/:id/curriculum', viewer, wrap(async (req, res) => {
    const role = await roleFromPath(req);
    const competencies = await stores.dna.listJobCompetencies(req.tenantId, role.id);
    const tiers = TIERS.map((tier) => {
      const modules = competencies.filter((c) => c.programTier === tier).map((c) => ({ id: c.id, code: c.code, name: c.name, stream: c.stream }));
      return { tier, count: modules.length, modules };
    });
    res.json({ data: { jobRole: { id: role.id, name: role.name }, tiers, untiered: competencies.filter((c) => !TIERS.includes(c.programTier)).length } });
  }));

  // --- Kebutuhan pengembangan pegawai ---
  r.get('/development/employees', viewer, wrap(async (req, res) => {
    const job = await pickJobRole(req, await jobsWithDictionary(req.tenantId));
    if (!job) return res.json({ data: [] });
    const competencies = await stores.dna.listJobCompetencies(req.tenantId, job.id);
    const { rows } = await plansFor(req, job.id, competencies);
    await audit.readIndividual(req, 'dna.development_needs', { employeeIds: rows.map((x) => x.person.id), objectType: 'dna_development' });
    return res.json({ data: rows.map(({ person, plan }) => ({ id: person.id, name: person.name, stage: plan.stage, met: plan.met, assessed: plan.assessed, total: plan.total, focus: plan.focus })) });
  }));

  r.get('/employees/:userId/development-plan', wrap(async (req, res) => {
    const { userId } = req.params;
    const scope = await scopeFor(req, stores.people);
    if (!isUuid(userId) || !inScope(scope, userId)) throw notFound('Karyawan tidak ditemukan');
    const person = await stores.people.get(req.tenantId, userId);
    if (!person) throw notFound('Karyawan tidak ditemukan');
    const [competencies, assessments] = await Promise.all([
      person.jobRoleId ? stores.dna.listJobCompetencies(req.tenantId, person.jobRoleId) : [],
      stores.dna.assessmentsFor(req.tenantId, [person.id]),
    ]);
    await audit.readIndividual(req, 'dna.development_plan', { employeeIds: [person.id], objectType: 'dna_development' });
    res.json({ data: { person: { id: person.id, name: person.name, jobRoleId: person.jobRoleId, jobRoleName: person.jobRoleName || null }, ...developmentPlan({ competencies, assessments }) } });
  }));
}

module.exports = { developmentRoutes, isUuid, orConflict, isUniqueViolation };
