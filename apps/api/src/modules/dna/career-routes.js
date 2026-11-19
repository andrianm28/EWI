'use strict';
// B16 Career & Promotion: peta karier, bukti, jalur jenjang, dan keputusan promosi dua tahap.
// Aturan C1-C16 di docs/designs/b16-career-promotion.md. Semua endpoint di balik flag promotion.recommendation.
const express = require('express');
const { requireRole, ROLES } = require('../../core/rbac');
const { scopeFor } = require('../../core/rbac/scope');
const { FLAGS, requireFlag } = require('../../core/flags');
const { HttpError, badRequest, notFound } = require('../../core/errors');
const { wrap } = require('../interviews');
const { TIERS } = require('./development');
const { careerStatus, okrAchievement, careerState, findCycle, decisionState, decisionView } = require('./career');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const forbidden = (message) => new HttpError(403, 'ROLE_FORBIDDEN', message);
const conflict = (code, message) => new HttpError(409, code, message);
const level = (l) => (l ? { id: l.id, name: l.name } : null);

function careerRoutes({ stores, settings, flags, audit }) {
  const r = express.Router();
  r.use(requireFlag(flags, FLAGS.PROMOTION_RECOMMENDATION, 'Modul Career & Promotion belum diaktifkan'));
  r.use(requireRole(ROLES.HR_ADMIN, ROLES.SUPERVISOR));
  // C11: peran pemanggil harus diizinkan tenant (Super Admin selalu boleh melihat)
  r.use(wrap(async (req, res, next) => {
    req.promotion = (await settings.get(req.tenantId)).dna;
    if (req.user.role !== ROLES.ETA_ADMIN && !req.promotion.promotionVisibleTo.includes(req.user.role)) {
      throw forbidden('Modul Career & Promotion tidak dibuka untuk peran Anda');
    }
    next();
  }));

  /** Semua karyawan dalam scope pemanggil (tanpa dirinya) beserta status jenjang dan siklus keputusannya. */
  async function load(req) {
    const { okrMin, metricTypes } = req.promotion.promotion;
    const scope = await scopeFor(req, stores.people);
    const people = (await stores.promotion.people(req.tenantId, scope)).filter((p) => p.id !== req.user.id);
    const ids = people.map((p) => p.id);
    const [levels, completions, records, decisions, dictionaries] = await Promise.all([
      stores.dna.listLevels(req.tenantId), stores.dna.completions(req.tenantId, ids), stores.promotion.okrRecords(req.tenantId, ids, metricTypes),
      stores.promotion.decisionsFor(req.tenantId, ids), stores.dna.dictionaryCounts(req.tenantId),
    ]);
    const withDictionary = new Set(dictionaries.map((d) => d.jobRoleId));
    const rows = people.map((p) => {
      const mine = completions.filter((c) => c.userId === p.id);
      const career = careerStatus({ levels: levels.filter((l) => l.jobRoleId === p.jobRoleId), currentLevelId: p.careerLevelId, completions: mine });
      const okr = okrAchievement(records.filter((x) => x.userId === p.id), metricTypes);
      const state = careerState({ career, hasPosition: Boolean(p.jobRoleId && p.careerLevelId), hasDictionary: withDictionary.has(p.jobRoleId), okr, okrMin });
      const known = state.status !== 'no_path';
      const next = known ? career.nextLevel : null;
      const cycle = findCycle(decisions.filter((d) => d.userId === p.id), p.careerLevelId, next ? next.id : null);
      const passed = new Set(mine.filter((c) => c.status === 'passed').map((c) => c.programTier));
      return { person: p, career, okr, ...state, known, next, cycle, passed };
    });
    return { okrMin, rows, levels };
  }

  const mapRow = (x) => ({
    id: x.person.id, name: x.person.name, division: x.person.division || null, jobRoleId: x.person.jobRoleId, jobRoleName: x.person.jobRoleName || null,
    level: x.known ? level(x.career.currentLevel) : null,
    programs: x.known ? TIERS.map((tier) => ({ tier, passed: x.passed.has(tier) })) : [],
    okr: x.okr, status: x.status, nextLevel: x.next, decisionState: decisionState(x.cycle),
  });

  const stage = (decision, byName, at, note) => (decision ? { decision, byName: byName || null, at, note: note || null } : null);
  const decisionRow = (req, x, okrMin) => {
    const d = x.cycle.latest;
    return {
      employee: { id: x.person.id, name: x.person.name, division: x.person.division || null, jobRoleName: x.person.jobRoleName || null },
      fromLevel: level(x.career.currentLevel), toLevel: level(x.next),
      requirement: { programPassed: true, okr: x.okr ? { achievement: x.okr.achievement, min: okrMin, met: x.okr.achievement >= okrMin } : null },
      eligible: x.eligible,
      supervisor: d ? stage(d.supervisorDecision, d.supervisorByName, d.supervisorAt, d.supervisorNote) : null,
      hr: d ? stage(d.hrDecision, d.hrByName, d.hrAt, d.hrNote) : null,
      ...decisionView({ viewer: req.user, employee: x.person, eligible: x.eligible, cycle: x.cycle }),
    };
  };

  /** Karyawan dari path: harus dalam scope, aktif, dan bagian populasi; selain itu 404 (C11). */
  async function target(req) {
    const userId = String(req.params.userId).toLowerCase();
    const data = await load(req);
    const x = UUID.test(userId) ? data.rows.find((row) => row.person.id === userId) : null;
    if (!x) throw notFound('Karyawan tidak ditemukan');
    return { ...data, x };
  }

  function readBody(req, allowed, message) {
    const { decision, note } = req.body || {};
    if (!allowed.includes(decision)) throw badRequest(message);
    if (note !== undefined && note !== null && (typeof note !== 'string' || note.length > 2000)) throw badRequest('note berupa teks, maksimal 2000 karakter');
    return { decision, note: note && note.trim() ? note.trim() : null };
  }

  // Nama pengambil keputusan diambil dari basis data, bukan dari token (C12)
  const auditMeta = async (req, x, event, decision) => {
    const me = await stores.people.get(req.tenantId, req.user.id);
    return { event, decision, employeeId: x.person.id, fromLevelId: x.person.careerLevelId, toLevelId: x.next.id, decidedByName: me ? me.name : null, role: req.user.role };
  };

  r.get('/map', wrap(async (req, res) => {
    const { okrMin, rows } = await load(req);
    const divisions = [...new Set(rows.map((x) => x.person.division).filter(Boolean))].sort();
    const kpi = {
      employees: rows.length, divisions: divisions.length, eligible: rows.filter((x) => x.eligible).length,
      awaitingDecision: rows.filter((x) => x.eligible && !['approved', 'hold'].includes(decisionState(x.cycle))).length,
      belowCurrent: rows.filter((x) => x.status === 'below_current').length,
    };
    const { division } = req.query;
    const shown = division ? rows.filter((x) => x.person.division === division) : rows;
    await audit.readIndividual(req, 'dna.career_map', { employeeIds: shown.map((x) => x.person.id), objectType: 'promotion' });
    res.json({ data: { okrMin, kpi, divisions, employees: shown.map(mapRow) } });
  }));

  r.get('/employees/:userId/evidence', wrap(async (req, res) => {
    const { okrMin, x } = await target(req);
    const d = x.cycle.latest;
    await audit.readIndividual(req, 'dna.career_evidence', { employeeIds: [x.person.id], objectType: 'promotion' });
    res.json({ data: {
      person: { id: x.person.id, name: x.person.name, division: x.person.division || null, jobRoleName: x.person.jobRoleName || null, level: x.known ? level(x.career.currentLevel) : null },
      status: x.status, nextLevel: x.next,
      programsPassed: x.known ? TIERS.filter((t) => x.passed.has(t)) : [],
      okr: x.okr ? { achievement: x.okr.achievement, min: okrMin, met: x.okr.achievement >= okrMin, period: x.okr.period, count: x.okr.count } : null,
      reinterview: null, // B15 Impact Measurement belum ada (C15)
      supervisorRecommendation: d ? { decision: d.supervisorDecision, byName: d.supervisorByName || null, at: d.supervisorAt } : null,
    } });
  }));

  r.get('/paths', wrap(async (req, res) => {
    const { okrMin, rows, levels } = await load(req);
    const roles = await stores.dna.listJobRoles(req.tenantId);
    const { jobRoleId } = req.query;
    let role;
    if (jobRoleId !== undefined) {
      role = UUID.test(String(jobRoleId)) ? roles.find((j) => j.id === String(jobRoleId).toLowerCase()) : null;
      if (!role) throw badRequest('jobRoleId tidak dikenal');
    } else role = roles.find((j) => j.levels.length) || null;
    if (!role) return res.json({ data: { jobRole: null, okrMin, levels: [] } });
    const competencies = await stores.dna.listJobCompetencies(req.tenantId, role.id);
    const data = levels.filter((l) => l.jobRoleId === role.id).sort((a, b) => a.levelOrder - b.levelOrder).map((l) => {
      const here = rows.filter((x) => x.person.careerLevelId === l.id);
      return {
        id: l.id, order: l.levelOrder, name: l.name, requiredProgramTier: l.requiredProgramTier || null,
        moduleCount: l.requiredProgramTier ? competencies.filter((c) => c.programTier === l.requiredProgramTier).length : 0,
        employees: here.length, readyForNext: here.filter((x) => x.eligible).length,
      };
    });
    return res.json({ data: { jobRole: { id: role.id, name: role.name }, okrMin, levels: data } });
  }));

  r.get('/decisions', wrap(async (req, res) => {
    const { okrMin, rows } = await load(req);
    const candidates = rows.filter((x) => x.candidate);
    await audit.readIndividual(req, 'dna.promotion_decisions', { employeeIds: candidates.map((x) => x.person.id), objectType: 'promotion' });
    res.json({ data: candidates.map((x) => decisionRow(req, x, okrMin)) });
  }));

  r.post('/decisions/:userId/supervisor', wrap(async (req, res) => {
    // C6: hanya atasan langsung berperan supervisor; HR dan Super Admin tidak merangkap tahap ini
    if (req.user.role !== ROLES.SUPERVISOR) throw forbidden('Tahap ini hanya untuk atasan langsung karyawan');
    const body = readBody(req, ['recommend', 'hold'], 'decision harus recommend atau hold');
    const { x } = await target(req);
    if (x.person.supervisorId !== req.user.id) throw notFound('Karyawan tidak ditemukan');
    if (x.cycle.approved) throw conflict('ALREADY_DECIDED', 'Promosi ke jenjang ini sudah disetujui HR');
    if (!x.eligible) throw conflict('NOT_ELIGIBLE', 'Karyawan belum memenuhi syarat program dan OKR untuk jenjang berikutnya');
    const id = await stores.promotion.supervisorDecide(req.tenantId, {
      userId: x.person.id, fromLevelId: x.person.careerLevelId, toLevelId: x.next.id, okrAchievement: x.okr.achievement, decision: body.decision, note: body.note, by: req.user.id,
    }, await auditMeta(req, x, 'supervisor_decision', body.decision));
    if (!id) throw conflict('ALREADY_DECIDED', 'Promosi ke jenjang ini sudah disetujui HR');
    const fresh = await target(req);
    res.json({ data: decisionRow(req, fresh.x, fresh.okrMin) });
  }));

  r.post('/decisions/:userId/hr', wrap(async (req, res) => {
    // C7: hanya HR; Super Admin melihat saja
    if (req.user.role !== ROLES.HR_ADMIN) throw forbidden('Tahap ini hanya untuk HR');
    const body = readBody(req, ['approve', 'hold'], 'decision harus approve atau hold');
    const decision = body.decision === 'approve' ? 'approved' : 'hold';
    const { x } = await target(req);
    const { open } = x.cycle;
    if (!open) {
      if (x.cycle.approved) throw conflict('ALREADY_DECIDED', 'Promosi ke jenjang ini sudah diputuskan HR');
      throw conflict('WAITING_SUPERVISOR', 'Atasan belum memberi keputusan untuk jenjang ini');
    }
    if (decision === 'approved') {
      if (open.supervisorDecision !== 'recommend') throw conflict('SUPERVISOR_NOT_RECOMMEND', 'Atasan tidak merekomendasi; HR hanya bisa menunda');
      if (!x.eligible) throw conflict('NOT_ELIGIBLE', 'Karyawan tidak lagi memenuhi syarat program dan OKR');
    }
    const ok = await stores.promotion.hrDecide(req.tenantId, { id: open.id, decision, note: body.note, by: req.user.id }, await auditMeta(req, x, 'hr_decision', decision));
    const fresh = await target(req);
    if (!ok) {
      // balapan: HR lain sudah memutuskan, atau atasan baru saja mengubah ke tunda
      const now = fresh.x.cycle;
      if (now.open && now.open.id === open.id) throw conflict('SUPERVISOR_NOT_RECOMMEND', 'Atasan mengubah keputusannya; muat ulang lalu coba lagi');
      throw conflict('ALREADY_DECIDED', 'Promosi ke jenjang ini sudah diputuskan HR');
    }
    res.json({ data: decisionRow(req, fresh.x, fresh.okrMin) });
  }));

  return r;
}

module.exports = { careerRoutes };
