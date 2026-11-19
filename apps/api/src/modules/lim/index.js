'use strict';
// B15 Learning Impact Measurement (LIM). Rencana pengukuran (5 pertanyaan + kohort), rantai bukti 6 tingkat, ringkasan
// per kompetensi, indikator tim, isian skor, pre dari DNA, dan antrean wawancara ulang (satu baris per karyawan).
// Spek: docs/designs/b15-impact-measurement.md. Tidak ada klaim sebab-akibat; insight berbasis aturan (generatedBy 'rules').
const express = require('express');
const { requireRole, ROLES } = require('../../core/rbac');
const { badRequest, notFound } = require('../../core/errors');
const { importRouter } = require('../imports');
const { todayJakarta } = require('../ld/domain');
const lim = require('./domain');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HR_ROLES = [ROLES.HR_ADMIN, ROLES.ETA_ADMIN];
// Sama dengan B10 (modules/cca LEADER_ROLES): kedua peran pimpinan memakai cakupan bawahan langsung. ⏳ keputusan Andrian.
const LEADER_ROLES = [ROLES.SUPERVISOR, ROLES.PIMPINAN];
const TEXT_FIELDS = ['businessProblem', 'desiredBehavior', 'priorityCapabilities', 'evidencePlan', 'existingMetrics'];
const MAX_ENTRIES = 500;
const MAX_SCHEDULE = 200;
const MAX_INDICATORS = 20;
const MAX_FACTORS = 20;
const isHr = (req) => HR_ROLES.includes(req.user.role);
const present = (v) => v !== null && v !== undefined;

function text(v, label, max, { required = false } = {}) {
  if (v === undefined) return undefined;
  const s = String(v ?? '').trim();
  if (required && !s) throw badRequest(`${label} wajib diisi`);
  if (s.length > max) throw badRequest(`${label} paling panjang ${max} karakter`);
  return s;
}
const optText = (v, label, max) => (v === null ? null : text(v, label, max) || (v === undefined ? undefined : null));
function optNum(v, label) {
  if (v === undefined || v === null || v === '') return v === undefined ? undefined : null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw badRequest(`${label} harus angka`);
  return n;
}
function optDate(v, label) {
  if (v === undefined || v === null || v === '') return v === undefined ? undefined : null;
  if (!lim.validDate(String(v))) throw badRequest(`${label} harus berformat YYYY-MM-DD`);
  return String(v);
}
const scoreOk = (v) => v === undefined || v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100);

/** Validasi field rencana (POST: semua wajib kecuali yang opsional; PATCH: hanya yang dikirim). */
async function planFields(body, { stores, tenantId, create }) {
  const out = {};
  out.title = text(body.title, 'Judul', 255, { required: create || body.title !== undefined });
  for (const f of TEXT_FIELDS) out[f] = text(body[f], 'Isian lima pertanyaan', 2000);
  out.baselineLabel = optText(body.baselineLabel, 'Label sebelum', 64);
  out.afterLabel = optText(body.afterLabel, 'Label sesudah', 64);
  out.periodFrom = optDate(body.periodFrom, 'Awal periode');
  out.periodUntil = optDate(body.periodUntil, 'Akhir periode');
  if (out.periodFrom && out.periodUntil && out.periodUntil < out.periodFrom) throw badRequest('Akhir periode tidak boleh sebelum awal periode');
  if (body.jobRoleId !== undefined) {
    if (body.jobRoleId === null) out.jobRoleId = null;
    else if (!UUID.test(String(body.jobRoleId)) || !(await stores.lim.jobRoleExists(tenantId, body.jobRoleId))) throw badRequest('Jabatan tidak ditemukan');
    else out.jobRoleId = body.jobRoleId;
  }
  if (body.moduleIds !== undefined || create) {
    const ids = Array.isArray(body.moduleIds) ? [...new Set(body.moduleIds.map(String))] : null;
    if (!ids || !ids.length || ids.length > 20) throw badRequest('Pilih 1 sampai 20 modul belajar');
    if (ids.some((x) => !UUID.test(x)) || (await stores.lim.countModules(tenantId, ids)) !== ids.length) {
      const e = badRequest('Modul belajar tidak ditemukan'); e.code = 'MODULE_NOT_FOUND'; throw e;
    }
    out.moduleIds = ids;
  }
  if (!create) {
    if (body.status !== undefined) {
      if (!['active', 'archived'].includes(body.status)) throw badRequest('status harus active atau archived');
      out.status = body.status;
    }
    if (body.valueEstimate !== undefined) {
      const v = body.valueEstimate;
      if (v === null) out.valueEstimate = null;
      else if (typeof v !== 'object' || Array.isArray(v)) throw badRequest('Estimasi nilai tidak valid');
      else out.valueEstimate = { label: text(v.label, 'Label estimasi', 255, { required: true }), value: text(v.value, 'Nilai estimasi', 255, { required: true }), note: text(v.note ?? '', 'Catatan estimasi', 1000) || null };
    }
    if (body.factors !== undefined) {
      if (!Array.isArray(body.factors) || body.factors.length > MAX_FACTORS) throw badRequest(`Faktor lain maksimal ${MAX_FACTORS} butir`);
      out.factors = body.factors.map((f) => text(f, 'Faktor lain', 300, { required: true }));
    }
  }
  return out;
}

module.exports = {
  key: 'lim',
  title: 'Learning Impact Measurement',
  router({ stores, audit } = {}) {
    const r = express.Router();
    r.use(requireRole(...HR_ROLES, ...LEADER_ROLES));
    const hr = requireRole(ROLES.HR_ADMIN);
    const idParam = (req, _res, next) => (UUID.test(req.params.id) ? next() : next(notFound()));

    /** Cakupan: HR semua (null); atasan = bawahan langsung tanpa dirinya sendiri (spek 6.5). */
    async function teamOf(req) {
      if (isHr(req)) return null;
      return new Set(await stores.people.directReportIds(req.tenantId, req.user.id));
    }
    async function loadPlan(req) {
      const plan = await stores.lim.getPlan(req.tenantId, req.params.id);
      if (!plan) throw notFound('Rencana pengukuran tidak ditemukan');
      return plan;
    }

    /**
     * Data efektif rencana: peserta, kompetensi, dan satu baris per (peserta, kompetensi rencana) dengan pre/post/
     * wawancara ulang/kinerja efektif. team: Set userId atau null (semua).
     */
    async function planData(tenantId, plan, team) {
      const [competencies, parts, saved] = await Promise.all([
        stores.lim.planCompetencies(tenantId, plan.id), stores.lim.participations(tenantId, plan.id), stores.lim.measurements(tenantId, plan.id),
      ]);
      const inTeam = (id) => !team || team.has(id);
      const compIds = new Set(competencies.map((c) => c.id));
      const people = new Map();
      for (const p of parts) if (inTeam(p.userId)) people.set(p.userId, { userId: p.userId, name: p.name });
      for (const m of saved) if (inTeam(m.userId)) people.set(m.userId, { userId: m.userId, name: m.name, jobRoleName: m.jobRoleName });
      const scored = parts.filter((p) => present(p.score) && p.competencyId && compIds.has(p.competencyId) && inTeam(p.userId));
      const posts = lim.latestPost(scored);
      const shared = new Map(scored.map((p) => [lim.key(p.userId, p.competencyId), p]));
      const savedBy = new Map(saved.map((m) => [lim.key(m.userId, m.competencyId), m]));
      const starts = new Map();
      for (const p of parts) if (!starts.has(p.userId) || p.startedOn < starts.get(p.userId)) starts.set(p.userId, p.startedOn);

      const rows = [];
      for (const person of people.values()) {
        for (const c of competencies) {
          const k = lim.key(person.userId, c.id);
          const m = savedBy.get(k); const ld = posts.get(k);
          if (!m && !ld) continue;
          const latest = ld ? scored.filter((p) => lim.key(p.userId, p.competencyId) === k).find((p) => (p.completedOn || null) === ld.completedOn) || shared.get(k) : null;
          const own = m && present(m.postScore);
          rows.push({
            userId: person.userId, name: person.name, jobRoleName: m?.jobRoleName ?? null, competencyId: c.id, competencyName: c.name,
            pre: m?.preScore ?? null, preSource: m?.preSource ?? null,
            post: own ? m.postScore : ld ? ld.score : null,
            postSource: own ? m.postSource : ld ? 'ld' : null,
            postAuditable: own ? true : ld ? ld.auditable : true,
            postShared: own ? false : !!(latest && latest.moduleCompetencies > 1),
            postFromLd: !!ld, postCompletedOn: ld ? ld.completedOn : null,
            reinterview: m?.reinterviewStatus === 'done' ? m.reinterviewScore : null,
            reinterviewStatus: m?.reinterviewStatus || 'none', reinterviewOn: m?.reinterviewOn ?? null, reinterviewScore: m?.reinterviewScore ?? null,
            performance: m?.performanceScore ?? null, performanceNote: m?.performanceNote ?? null,
          });
        }
      }
      const seen = new Set(); const activity = { participations: 0, completed: 0, offlineRecorded: 0, offlinePresent: 0 };
      for (const p of parts) {
        if (seen.has(p.id) || !inTeam(p.userId)) continue;
        seen.add(p.id);
        activity.participations += 1;
        if (p.status === 'completed') activity.completed += 1;
        if (p.mode === 'offline' && p.attendance !== null) { activity.offlineRecorded += 1; if (p.attendance) activity.offlinePresent += 1; }
      }
      return { competencies, people: [...people.values()], rows, activity, starts };
    }

    r.get('/', (req, res) => res.json({ module: 'lim', title: 'Learning Impact Measurement', tenantId: req.tenantId, role: req.user.role }));

    // --- Rencana ---
    r.get('/plans', wrap(async (req, res) => {
      const team = await teamOf(req);
      const plans = await stores.lim.listPlans(req.tenantId, { archived: isHr(req) && req.query.archived === '1' });
      const out = [];
      for (const p of plans) {
        const { people } = await planData(req.tenantId, p, team);
        if (team && !people.length) continue;
        out.push({ id: p.id, title: p.title, jobRoleName: p.jobRoleName, moduleCount: p.moduleCount, participantCount: people.length });
      }
      res.json({ data: out });
    }));
    r.post('/plans', hr, wrap(async (req, res) => {
      const v = await planFields(req.body || {}, { stores, tenantId: req.tenantId, create: true });
      for (const f of TEXT_FIELDS) v[f] = v[f] || '';
      const id = await stores.lim.createPlan(req.tenantId, { jobRoleId: null, periodFrom: null, periodUntil: null, baselineLabel: null, afterLabel: null, ...v }, req.user.id);
      await audit.record(req, 'create', 'lim.plan', { planId: id });
      res.status(201).json({ data: await stores.lim.getPlan(req.tenantId, id) });
    }));
    r.patch('/plans/:id', hr, idParam, wrap(async (req, res) => {
      await loadPlan(req);
      const v = await planFields(req.body || {}, { stores, tenantId: req.tenantId, create: false });
      await stores.lim.updatePlan(req.tenantId, req.params.id, v, req.user.id);
      await audit.record(req, 'update', 'lim.plan', { planId: req.params.id, fields: Object.keys(v).filter((k) => v[k] !== undefined) });
      res.json({ data: await stores.lim.getPlan(req.tenantId, req.params.id) });
    }));

    r.get('/plans/:id/overview', idParam, wrap(async (req, res) => {
      const plan = await loadPlan(req);
      const team = await teamOf(req);
      const [{ competencies, people, rows, activity }, rawIndicators] = await Promise.all([
        planData(req.tenantId, plan, team), stores.lim.listIndicators(req.tenantId, plan.id),
      ]);
      const indicators = rawIndicators.map((i) => ({ ...i, ...lim.indicatorState(i) }));
      const chain = lim.buildChain({ participants: people.map((p) => p.userId), activity, rows, indicators });
      res.json({ data: {
        plan, participants: people.length, chain, insight: lim.buildInsight(chain),
        competencies: lim.summarizeCompetencies(competencies, rows), indicators,
        valueEstimate: plan.valueEstimate || null, factors: plan.factors || [], generatedBy: 'rules',
      } });
    }));

    // --- Indikator tim ---
    function indicatorFields(body, create) {
      const v = {};
      v.name = text(body.name, 'Nama indikator', 255, { required: create || body.name !== undefined });
      if (body.level !== undefined || create) {
        if (!['performance', 'business'].includes(body.level)) throw badRequest('level harus performance atau business');
        v.level = body.level;
      }
      if (body.direction !== undefined || create) {
        if (!['lower_better', 'higher_better'].includes(body.direction)) throw badRequest('direction harus lower_better atau higher_better');
        v.direction = body.direction;
      }
      v.source = optText(body.source, 'Sumber', 255);
      v.unit = optText(body.unit, 'Satuan', 16);
      for (const f of ['baseline', 'current', 'target']) v[f] = optNum(body[f], 'Nilai indikator');
      if (body.strength !== undefined) {
        if (body.strength !== null && !['strong', 'moderate', 'weak'].includes(body.strength)) throw badRequest('strength harus strong, moderate, weak, atau null');
        v.strength = body.strength;
      }
      if (body.position !== undefined) {
        if (!Number.isInteger(body.position) || body.position < 0 || body.position > 9999) throw badRequest('position harus bilangan bulat 0-9999');
        v.position = body.position;
      }
      return v;
    }
    const decorateInd = (i) => ({ ...i, ...lim.indicatorState(i) });
    r.post('/plans/:id/indicators', hr, idParam, wrap(async (req, res) => {
      const plan = await loadPlan(req);
      const v = indicatorFields(req.body || {}, true);
      if ((await stores.lim.countIndicators(req.tenantId, plan.id)) >= MAX_INDICATORS) throw badRequest(`Indikator maksimal ${MAX_INDICATORS} per rencana`);
      const row = await stores.lim.createIndicator(req.tenantId, plan.id, Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined)));
      await audit.record(req, 'create', 'lim.indicator', { planId: plan.id, indicatorId: row.id });
      res.status(201).json({ data: decorateInd(row) });
    }));
    r.patch('/indicators/:id', hr, idParam, wrap(async (req, res) => {
      if (!(await stores.lim.getIndicator(req.tenantId, req.params.id))) throw notFound('Indikator tidak ditemukan');
      const v = indicatorFields(req.body || {}, false);
      const row = await stores.lim.updateIndicator(req.tenantId, req.params.id, v);
      await audit.record(req, 'update', 'lim.indicator', { indicatorId: row.id, fields: Object.keys(v).filter((k) => v[k] !== undefined) });
      res.json({ data: decorateInd(row) });
    }));
    r.delete('/indicators/:id', hr, idParam, wrap(async (req, res) => {
      if (!(await stores.lim.deleteIndicator(req.tenantId, req.params.id))) throw notFound('Indikator tidak ditemukan');
      await audit.record(req, 'update', 'lim.indicator', { indicatorId: req.params.id, deleted: true });
      res.status(204).end();
    }));

    // --- Skor per karyawan ---
    r.get('/plans/:id/measurements', hr, idParam, wrap(async (req, res) => {
      const plan = await loadPlan(req);
      const { rows } = await planData(req.tenantId, plan, null);
      await audit.readIndividual(req, 'lim.measurement', { employeeIds: [...new Set(rows.map((x) => x.userId))], objectType: 'lim_plan', objectIds: [plan.id] });
      const names = new Map((await stores.lim.users(req.tenantId, [...new Set(rows.map((x) => x.userId))])).map((x) => [x.id, x]));
      res.json({ data: rows.sort((a, b) => a.name.localeCompare(b.name, 'id') || a.competencyName.localeCompare(b.competencyName, 'id')).map((x) => ({
        userId: x.userId, name: x.name, jobRoleName: names.get(x.userId)?.jobRoleName ?? null, competencyId: x.competencyId, competencyName: x.competencyName,
        preScore: x.pre, preSource: x.preSource, postScore: x.post, postSource: x.postSource, postAuditable: x.postAuditable, postShared: x.postShared,
        postCompletedOn: x.postCompletedOn, reinterviewStatus: x.reinterviewStatus, reinterviewOn: x.reinterviewOn, reinterviewScore: x.reinterviewScore,
        performanceScore: x.performance, performanceNote: x.performanceNote,
      })) });
    }));

    r.put('/plans/:id/measurements', idParam, wrap(async (req, res) => {
      const plan = await loadPlan(req);
      const entries = req.body && req.body.entries;
      if (!Array.isArray(entries) || !entries.length || entries.length > MAX_ENTRIES) throw badRequest(`entries harus 1-${MAX_ENTRIES} baris`);
      const team = await teamOf(req);
      const { people, competencies } = await planData(req.tenantId, plan, null);
      const members = new Set(people.map((p) => p.userId)); const comps = new Set(competencies.map((c) => c.id));
      const rejected = []; let saved = 0; const touched = new Set();
      for (const [index, e] of entries.entries()) {
        const msg = (() => {
          if (!e || typeof e !== 'object') return 'Baris tidak valid';
          if (!members.has(String(e.userId))) return 'Karyawan bukan peserta rencana ini';
          if (team && !team.has(e.userId)) return 'Karyawan bukan anggota tim Anda';
          if (!comps.has(String(e.competencyId))) return 'Kompetensi bukan bagian rencana ini';
          if (team && (e.preScore !== undefined || e.postScore !== undefined)) return 'Atasan hanya mengisi skor kinerja';
          if (![e.preScore, e.postScore, e.performanceScore].every(scoreOk)) return 'Skor harus bilangan 0-100';
          if (present(e.performanceNote) && String(e.performanceNote).length > 500) return 'Catatan kinerja paling panjang 500 karakter';
          return null;
        })();
        if (msg) { rejected.push({ index, message: msg }); continue; }
        const patch = { preScore: e.preScore, postScore: e.postScore, performanceScore: e.performanceScore,
          performanceNote: e.performanceNote === undefined ? undefined : (present(e.performanceNote) ? String(e.performanceNote).trim() || null : null) };
        if (await stores.lim.upsertMeasurement(req.tenantId, plan.id, e.userId, e.competencyId, patch, { source: 'manual', by: req.user.id })) {
          saved += 1; touched.add(e.userId);
        }
      }
      if (saved) await audit.record(req, 'update', 'lim.measurement', { planId: plan.id, employeeIds: [...touched], saved });
      res.json({ data: { saved, rejected } });
    }));

    r.post('/plans/:id/pre-from-dna', hr, idParam, wrap(async (req, res) => {
      const plan = await loadPlan(req);
      const { people, competencies, rows, starts } = await planData(req.tenantId, plan, null);
      const filledPre = new Set(rows.filter((x) => present(x.pre)).map((x) => lim.key(x.userId, x.competencyId)));
      const assessments = await stores.lim.dnaAssessments(req.tenantId, people.map((p) => p.userId), competencies.map((c) => c.id));
      const best = new Map();
      for (const a of assessments) {
        const start = starts.get(a.userId);
        if (!start || a.assessedOn >= start) continue;
        const k = lim.key(a.userId, a.competencyId);
        if (filledPre.has(k)) continue;
        if (!best.has(k) || a.assessedOn > best.get(k).assessedOn) best.set(k, a);
      }
      let filled = 0;
      for (const a of best.values()) {
        if (await stores.lim.upsertMeasurement(req.tenantId, plan.id, a.userId, a.competencyId, { preScore: a.score * 25 }, { source: 'dna', by: req.user.id, onlyEmptyPre: true })) filled += 1;
      }
      if (filled) await audit.record(req, 'update', 'lim.measurement', { planId: plan.id, preFromDna: filled });
      res.json({ data: { filled } });
    }));

    // --- Antrean wawancara ulang ---
    async function queueOf(req, plan) {
      const { rows } = await planData(req.tenantId, plan, null);
      return { rows, queue: lim.buildQueue(rows.map((x) => ({ ...x, competencyName: x.competencyName })), todayJakarta()) };
    }
    r.get('/plans/:id/queue', hr, idParam, wrap(async (req, res) => {
      const plan = await loadPlan(req);
      const { queue } = await queueOf(req, plan);
      await audit.readIndividual(req, 'lim.measurement', { employeeIds: queue.map((x) => x.userId), objectType: 'lim_plan_queue', objectIds: [plan.id] });
      res.json({ data: queue });
    }));
    r.post('/plans/:id/queue/schedule', hr, idParam, wrap(async (req, res) => {
      const plan = await loadPlan(req);
      const { userIds, date } = req.body || {};
      if (!Array.isArray(userIds) || !userIds.length || userIds.length > MAX_SCHEDULE) throw badRequest(`userIds harus 1-${MAX_SCHEDULE} karyawan`);
      if (date === undefined) throw badRequest('date wajib diisi (atau null untuk membatalkan)');
      const err = lim.checkScheduleDate(date, todayJakarta());
      if (err) throw badRequest(err);
      const { queue } = await queueOf(req, plan);
      const byUser = new Map(queue.map((x) => [x.userId, x]));
      const scheduled = []; const skipped = []; const rejected = [];
      for (const userId of [...new Set(userIds.map(String))]) {
        const entry = byUser.get(userId);
        if (!entry) { rejected.push({ userId, message: 'Karyawan belum punya skor post dari Learning Delivery di rencana ini' }); continue; }
        if (entry.status === 'done') { skipped.push({ userId, reason: 'done' }); continue; }
        if (date !== null && !entry.postCompletedOn) { rejected.push({ userId, message: 'Tanggal selesai belajar belum diketahui' }); continue; }
        await stores.lim.schedule(req.tenantId, plan.id, userId, entry.competencies.map((c) => c.competencyId), date, req.user.id);
        scheduled.push(userId);
      }
      if (scheduled.length) await audit.record(req, 'update', 'lim.measurement', { planId: plan.id, employeeIds: scheduled, reinterviewOn: date });
      res.json({ data: { scheduled, skipped, rejected } });
    }));

    r.use('/imports', importRouter({ submodule: 'lim', stores, audit }));
    return r;
  },
};
