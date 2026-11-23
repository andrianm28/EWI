'use strict';
// B5 Training Needs: papan gap (kompetensi + OKR) dan penugasan wawancara akar masalah.
// Spek dan aturan R1-R14: docs/designs/b5-training-needs.md. Dipasang dari modules/tna/index.js,
// jadi sudah berada di balik auth, tenantContext, dan requireSubmodule('tna').
const express = require('express');
const { requireRole, ROLES } = require('../../core/rbac');
const { scopeFor, inScope } = require('../../core/rbac/scope');
const { FLAGS, requireFlag } = require('../../core/flags');
const { badRequest, notFound, forbidden, HttpError } = require('../../core/errors');
const {
  HYPOTHESES, latestScores, competencyGaps, okrGaps, gapKeyOf, linkSessions, findingsByGap, visibility, decorate, summarize, evidenceFor,
} = require('./gaps');
const { validateAssignment, eligibleEmployees, isUuid, parseGapQuery } = require('./assignment');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function gapRouter({ stores, flags, audit }) {
  const r = express.Router();
  // R1: HR, Admin ETA (selalu lolos requireRole), dan atasan. Peran lain 403.
  const staff = requireRole(ROLES.HR_ADMIN, ROLES.SUPERVISOR);
  const boardFlag = requireFlag(flags, FLAGS.TNA_GAP_BOARD, 'Papan gap Training Needs belum diaktifkan untuk organisasi Anda');
  const assignFlag = requireFlag(flags, FLAGS.TNA_INTERVIEW_ASSIGNMENT, 'Penugasan wawancara belum diaktifkan untuk organisasi Anda');

  /** R7: flag yang membuka temuan non-pelatihan (PM-6 atau dashboard INA), sama dengan aturan modul TNA. */
  async function nonTrainingEnabled(tenantId) {
    if (await flags.isEnabled(tenantId, FLAGS.TNA_NON_TRAINING_HR)) return true;
    return (await flags.isEnabled(tenantId, FLAGS.MODULE_INA)) && (await flags.isEnabled(tenantId, FLAGS.INA_DASHBOARD));
  }

  async function callerVisibility(req) {
    const { role, id } = req.user;
    const supervisor = role === ROLES.SUPERVISOR;
    // Izin atasan (PM-6) hanya berlaku selama fitur izinnya sendiri menyala
    const grantActive = supervisor && (await flags.isEnabled(req.tenantId, FLAGS.TNA_NON_TRAINING_HR))
      && (await stores.tna.hasNonTrainingGrant(req.tenantId, id));
    return visibility({
      role, userId: id, hasGrant: grantActive,
      flagNonTraining: supervisor ? grantActive : await nonTrainingEnabled(req.tenantId),
      directReportIds: supervisor ? await stores.people.directReportIds(req.tenantId, id) : [],
    });
  }

  /** Karyawan dalam cakupan pemanggil (R1), tanpa Admin ETA; opsional satu jabatan. */
  async function membersInScope(req, jobRoleId) {
    const scope = await scopeFor(req, stores.people);
    const rows = await stores.people.list(req.tenantId, scope, jobRoleId ? { jobRoleId } : {});
    return rows.filter((m) => m.role !== ROLES.ETA_ADMIN);
  }

  async function withCompetencies(tenantId, members) {
    const cache = new Map();
    const out = [];
    for (const m of members) {
      const key = `${m.jobRoleId || ''}|${m.careerLevelId || ''}`;
      if (!cache.has(key)) cache.set(key, await stores.dna.competenciesForPosition(tenantId, { jobRoleId: m.jobRoleId, careerLevelId: m.careerLevelId }));
      out.push({ ...m, competencies: cache.get(key) });
    }
    return out;
  }

  async function parseFilters(req) {
    const { period, jobRoleId } = req.query;
    if (period !== undefined && (typeof period !== 'string' || !period || period.length > 32)) throw badRequest('Periode tidak valid');
    if (jobRoleId !== undefined) {
      if (!isUuid(jobRoleId)) throw badRequest('Jabatan tidak valid');
      if (!(await stores.dna.listJobRoles(req.tenantId)).some((jr) => jr.id === jobRoleId)) throw notFound('Jabatan tidak ditemukan');
    }
    return { period, jobRoleId };
  }

  /** Semua data papan gap untuk pemanggil: baris kompetensi dan OKR yang sudah berklasifikasi. */
  async function board(req, { period, jobRoleId } = {}) {
    const { tenantId } = req;
    const members = await withCompetencies(tenantId, await membersInScope(req, jobRoleId));
    const ids = { userIds: members.map((m) => m.id) };
    const [assessments, periods, records, sessions, findings, vis] = await Promise.all([
      stores.dna.assessmentsFor(tenantId, ids.userIds),
      stores.tna.performancePeriods(tenantId, ids),
      stores.tna.listPerformance(tenantId, ids),
      stores.interviews.gapSessions(tenantId, ids),
      stores.tna.findingsForGaps(tenantId, ids),
      callerVisibility(req),
    ]);
    const usedPeriod = period || periods[0] || null;
    const periodRecords = usedPeriod ? records.filter((x) => x.period === usedPeriod) : [];
    const links = linkSessions({ sessions, recordsById: new Map(records.map((x) => [x.id, x])), now: new Date() });
    const findingsMap = findingsByGap({ findings, sessionsById: new Map(sessions.map((s) => [s.id, s])) });
    const comp = competencyGaps({ members, assessments });
    const ctx = { findingsMap, links, vis };
    return {
      members, assessments, periodRecords, links, period: usedPeriod, periods,
      competencyRows: decorate(comp.rows, ctx), okrRows: decorate(okrGaps(periodRecords), ctx),
      unapprovedCompetencies: comp.unapprovedCompetencies,
    };
  }

  r.get('/gaps/summary', staff, boardFlag, wrap(async (req, res) => {
    const b = await board(req, await parseFilters(req));
    res.json({ data: { period: b.period, periods: b.periods, ...summarize(b), unapprovedCompetencies: b.unapprovedCompetencies } });
  }));

  r.get('/gaps/competencies', staff, boardFlag, wrap(async (req, res) => {
    const b = await board(req, await parseFilters(req));
    res.json({ data: { rows: b.competencyRows, unapprovedCompetencies: b.unapprovedCompetencies } });
  }));

  r.get('/gaps/okr', staff, boardFlag, wrap(async (req, res) => {
    const b = await board(req, await parseFilters(req));
    res.json({ data: { rows: b.okrRows, period: b.period, periods: b.periods } });
  }));

  // R9: memuat data per orang, jadi setiap pembacaan dicatat
  r.get('/gaps/detail', staff, boardFlag, wrap(async (req, res) => {
    const gap = parseGapQuery(req.query);
    const b = await board(req, gap.kind === 'okr' ? { period: gap.period } : {});
    const key = gapKeyOf(gap);
    const row = (gap.kind === 'competency' ? b.competencyRows : b.okrRows).find((x) => x.key === key);
    if (!row) throw notFound('Gap tidak ditemukan');
    const link = b.links.get(key);
    const session = (id) => (link && link.byUser.get(id)) || null;
    const base = (m) => ({ id: m.id, name: m.name, jobRoleId: m.jobRoleId ?? null, jobRoleName: m.jobRoleName ?? null, self: m.id === req.user.id, assignable: m.id !== req.user.id, session: session(m.id) });
    let employees; let jobRoles = [];
    if (gap.kind === 'competency') {
      const latest = latestScores(b.assessments);
      const holders = b.members.filter((m) => m.competencies.some((c) => c.id === gap.competencyId && c.approvedAt));
      jobRoles = [...new Set(holders.map((m) => m.jobRoleName).filter(Boolean))].sort();
      employees = holders.map((m) => {
        const value = latest.has(`${m.id}|${gap.competencyId}`) ? latest.get(`${m.id}|${gap.competencyId}`) : null;
        return { ...base(m), value, target: row.target, gap: value === null ? null : Math.max(0, row.target - value) };
      });
    } else {
      const mine = new Map();
      for (const rec of b.periodRecords) {
        if (gapKeyOf({ kind: 'okr', metricType: rec.metricType, name: rec.name, period: rec.period }) === key && !mine.has(rec.userId)) mine.set(rec.userId, rec);
      }
      employees = b.members.filter((m) => mine.has(m.id)).map((m) => {
        const rec = mine.get(m.id);
        return { ...base(m), value: rec.actual, target: rec.target, isMet: rec.isMet };
      });
    }
    await audit.readIndividual(req, 'tna.gap_detail', { employeeIds: employees.map((e) => e.id), objectType: 'tna_gap', objectIds: [key] });
    res.json({
      data: { ...row, evidence: evidenceFor(row, employees), hypotheses: HYPOTHESES.map((text) => ({ text, verified: false })), jobRoles, employees },
    });
  }));

  // R10: penugasan wawancara untuk satu gap
  r.post('/assignments', staff, assignFlag, wrap(async (req, res) => {
    const { tenantId } = req;
    const now = new Date();
    const input = validateAssignment(req.body, now);
    const status = await stores.projectsExtra.status(tenantId, input.projectId);
    if (!status) throw notFound('Proyek tidak ditemukan');
    if (status === 'closed') throw new HttpError(409, 'PROJECT_CLOSED', 'Proyek sudah ditutup, pilih proyek lain');
    if (input.jobRoleId && !(await stores.dna.listJobRoles(tenantId)).some((jr) => jr.id === input.jobRoleId)) throw notFound('Jabatan tidak ditemukan');

    // Gap harus ada di tenant dan dalam cakupan pemanggil (tabel galat spek B5: 404), dihitung sama dengan papan
    const b = await board(req, input.gap.kind === 'okr' ? { period: input.gap.period } : {});
    const row = (input.gap.kind === 'competency' ? b.competencyRows : b.okrRows).find((x) => x.key === gapKeyOf(input.gap));
    if (!row) throw notFound('Gap tidak ditemukan');
    const ctx = { mode: input.mode, gap: input.gap, members: b.members, jobRoleId: input.jobRoleId, selfId: req.user.id };
    const focus = { ...input.gap, label: row.name };
    if (input.gap.kind === 'competency') {
      ctx.competency = await stores.dna.getCompetency(tenantId, input.gap.competencyId);
      ctx.latest = latestScores(b.assessments);
      // Terdampak hanya pemegang kompetensi ini, sama dengan papan dan detail (asesmen dari jabatan lama tidak dihitung)
      if (input.mode === 'affected') ctx.members = b.members.filter((m) => m.competencies.some((c) => c.id === input.gap.competencyId && c.approvedAt));
    } else {
      ctx.records = b.periodRecords;
    }
    let eligible = eligibleEmployees(ctx);
    if (input.employeeIds) {
      const allowed = new Set(eligible.map((e) => e.userId));
      if (!input.employeeIds.every((id) => allowed.has(id))) {
        throw new HttpError(400, 'EMPLOYEE_NOT_ELIGIBLE', 'Ada karyawan yang tidak bisa ditugaskan untuk gap ini: di luar tim Anda, tidak terdampak, atau diri Anda sendiri');
      }
      eligible = eligible.filter((e) => input.employeeIds.includes(e.userId));
    }
    if (!eligible.length) throw new HttpError(409, 'NO_ELIGIBLE_EMPLOYEE', 'Tidak ada karyawan yang memenuhi pilihan ini');

    const result = await stores.interviews.assign(tenantId, {
      projectId: input.projectId, assignedBy: req.user.id, eligible, dueAt: input.dueAt, durationMinutes: input.durationMinutes, focus, now,
    });
    if (result.assigned.length) {
      await audit.record(req, 'create', 'tna.interview_assignment', {
        employeeIds: result.assigned.map((a) => a.employeeId), objectType: 'interview_session', objectIds: result.assigned.map((a) => a.sessionId),
        gap: { ...input.gap, label: focus.label }, mode: input.mode, dueAt: input.dueAt.toISOString(), durationMinutes: input.durationMinutes,
        replaced: result.assigned.filter((a) => a.replaced).length,
      });
    }
    res.status(result.assigned.length ? 201 : 200).json({ data: result });
  }));

  // R10b: batalkan penugasan yang belum dimulai
  r.post('/assignments/:sessionId/cancel', staff, assignFlag, wrap(async (req, res) => {
    if (!isUuid(req.params.sessionId)) throw badRequest('Sesi tidak valid');
    const s = await stores.interviews.get(req.tenantId, req.params.sessionId);
    const scope = await scopeFor(req, stores.people);
    if (!s || s.submodule !== 'tna' || !inScope(scope, s.intervieweeId)) throw notFound('Penugasan tidak ditemukan');
    // R10b: sesi alur lama (tanpa penugas) atau yang sudah dimulai tidak bisa dibatalkan, siapa pun pemanggilnya
    if (!s.assignedBy || s.status !== 'scheduled') throw new HttpError(409, 'INVALID_STATE', 'Hanya penugasan yang belum dimulai yang bisa dibatalkan');
    if (req.user.role === ROLES.SUPERVISOR && s.assignedBy !== req.user.id) {
      throw forbidden('NOT_ASSIGNER', 'Hanya HR atau atasan yang menugaskan yang bisa membatalkan penugasan ini');
    }
    const row = await stores.interviews.cancelAssigned(req.tenantId, s.id);
    if (!row) throw new HttpError(409, 'INVALID_STATE', 'Hanya penugasan yang belum dimulai yang bisa dibatalkan');
    await audit.record(req, 'update', 'tna.interview_assignment', {
      employeeIds: [s.intervieweeId], objectType: 'interview_session', objectIds: [s.id], decision: 'cancelled',
    });
    res.json({ data: row });
  }));

  return r;
}

module.exports = { gapRouter };
