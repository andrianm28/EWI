'use strict';
// Sesi wawancara AI (teks) yang dipakai DNA dan TNA. Suara (voice) di balik flag dan menyusul.
// Pertanyaan dan analisis memakai port AI (src/ai): Bedrock di produksi, tiruan (stub) di test/dev (PK-06).
// Setiap panggilan model dicatat di ai_usage_logs (R3-6).
const express = require('express');
const { estimateCost } = require('../../ai');
const { requireRole, ROLES } = require('../../core/rbac');
const { scopeFor, inScope } = require('../../core/rbac/scope');
const { badRequest, forbidden, notFound, HttpError } = require('../../core/errors');
const { inviteExpiry, isExpired, extendedExpiry, parseExtendDays, OPEN_STATUSES, EXTEND_MAX_DAYS } = require('./invitation');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Konteks pertanyaan & analisis: kompetensi posisi karyawan (DNA/TNA) + target merah pemicu (TNA). */
async function buildContext(stores, tenantId, session) {
  const person = await stores.people.get(tenantId, session.intervieweeId);
  const competencies = person && person.jobRoleId
    ? await stores.dna.competenciesForPosition(tenantId, { jobRoleId: person.jobRoleId, careerLevelId: person.careerLevelId })
    : [];
  const triggers = session.submodule === 'tna' ? await stores.tna.performanceByIds(tenantId, session.triggerRecordIds) : [];
  return { person, competencies, triggers };
}

/**
 * Konteks yang boleh dikirim ke model (PM-10 ★A): kompetensi jabatan dan target milik karyawan yang diwawancarai.
 * Nama, email, dan data karyawan lain tidak ikut. Target milik orang lain dibuang walau ID-nya terselip di sesi.
 */
function aiContext(ctx, session) {
  const competencies = (ctx.competencies || []).map((c) => ({
    id: c.id, name: c.name, definition: c.definition, indicators: c.indicators, requiredScore: c.requiredScore,
  }));
  const triggers = (ctx.triggers || [])
    .filter((t) => !t.userId || t.userId === session.intervieweeId)
    .map((t) => ({
      id: t.id, metricType: t.metricType, name: t.name, target: t.target, actual: t.actual, period: t.period, direction: t.direction, unit: t.unit,
    }));
  return { competencies, triggers };
}

/** Simpan catatan pemakaian AI (R3-6). Gagal mencatat tidak boleh menggagalkan wawancara. */
async function recordUsage({ stores, aiConfig, tenantId, session }, usage) {
  if (!stores.aiUsage || !usage) return;
  for (const u of usage) {
    try {
      await stores.aiUsage.record(tenantId, {
        projectId: session.projectId, sessionId: session.id, userId: session.intervieweeId, submodule: session.submodule,
        operation: u.operation, provider: u.provider, model: u.model, inputTokens: u.inputTokens, outputTokens: u.outputTokens,
        latencyMs: u.latencyMs, costUsd: estimateCost(u, aiConfig),
      });
    } catch (e) {
      console.error('Gagal mencatat pemakaian AI:', e.message);
    }
  }
}

/** Panggil AI; catatan pemakaian disimpan juga saat format jawaban gagal (token tetap terpakai). */
async function callAi(env, fn) {
  try {
    const out = await fn();
    await recordUsage(env, out.usage);
    return out;
  } catch (e) {
    if (e.usage) await recordUsage(env, e.usage);
    throw e;
  }
}

async function analyze({ stores, ai, aiConfig, tenantId, session, transcript, ctx }) {
  const env = { stores, aiConfig, tenantId, session };
  const safe = aiContext(ctx, session);
  if (session.submodule === 'dna') {
    const { results } = await callAi(env, () => ai.assessCompetencies({ transcript, competencies: safe.competencies }));
    for (const r of results) {
      await stores.dna.addAssessment(tenantId, { userId: session.intervieweeId, competencyId: r.competencyId, sessionId: session.id, score: r.score, confidence: r.confidence, evidence: r.evidence });
    }
    return { assessments: results.length };
  }
  const { findings } = await callAi(env, () => ai.analyzeTna({ transcript, triggers: safe.triggers, competencies: safe.competencies }));
  let lastTraining = null; let saved = 0;
  for (const f of findings) {
    const row = await stores.tna.insertFinding(tenantId, {
      projectId: session.projectId, userId: session.intervieweeId, sessionId: session.id, category: f.category,
      title: f.title, detail: f.detail, competencyId: f.competencyId || null, performanceRecordId: f.performanceRecordId || null,
      linkedFindingId: f.category === 'non_training' && lastTraining ? lastTraining.id : null,
    });
    if (f.category === 'training') lastTraining = row;
    saved += 1;
  }
  return { findings: saved };
}

function interviewRouter({ submodule, stores, ai, aiConfig = {}, audit }) {
  const r = express.Router();
  const maxQuestions = aiConfig.maxQuestions || 8;

  /** Pertanyaan berikutnya dari transkrip (termasuk jawaban yang belum disimpan). Batas kuota ditegakkan di sini. */
  async function nextQuestion(tenantId, session, transcript) {
    const askedCount = transcript.filter((t) => t.speaker === 'ai').length;
    if (askedCount >= maxQuestions) return null;
    const ctx = aiContext(await buildContext(stores, tenantId, session), session);
    const { question } = await callAi({ stores, aiConfig, tenantId, session },
      () => ai.nextQuestion({ submodule, transcript, askedCount, context: ctx, maxQuestions }));
    return question;
  }

  async function loadVisible(req) {
    const s = await stores.interviews.get(req.tenantId, req.params.id);
    if (!s || s.submodule !== submodule) throw notFound('Sesi wawancara tidak ditemukan');
    const scope = await scopeFor(req, stores.people);
    if (!inScope(scope, s.intervieweeId)) throw notFound('Sesi wawancara tidak ditemukan');
    return s;
  }
  const mustBeInterviewee = (req, s) => {
    if (s.intervieweeId !== req.user.id) throw forbidden('NOT_INTERVIEWEE', 'Hanya karyawan yang diwawancarai yang bisa menjawab');
  };

  r.get('/', wrap(async (req, res) => {
    const scope = await scopeFor(req, stores.people);
    res.json({ data: await stores.interviews.list(req.tenantId, submodule, scope, { projectId: req.query.projectId }) });
  }));

  // DNA: HR menjadwalkan asesmen per karyawan. TNA dibuat massal lewat POST /tna/projects/:id/interviews.
  if (submodule === 'dna') {
    r.post('/', requireRole(ROLES.HR_ADMIN), wrap(async (req, res) => {
      const { projectId, intervieweeIds } = req.body || {};
      if (!projectId || !Array.isArray(intervieweeIds) || !intervieweeIds.length) throw badRequest('projectId dan intervieweeIds wajib diisi');
      if (!(await stores.projectsExtra.exists(req.tenantId, projectId))) throw notFound('Proyek tidak ditemukan');
      const open = await stores.interviews.openFor(req.tenantId, { projectId, submodule });
      const created = [];
      for (const id of intervieweeIds) {
        if (open.has(id)) continue;
        const person = await stores.people.get(req.tenantId, id);
        if (!person) continue;
        created.push(await stores.interviews.create(req.tenantId, { projectId, submodule, intervieweeId: id, jobRoleId: person.jobRoleId, inviteExpiresAt: inviteExpiry() }));
      }
      res.status(201).json({ data: created });
    }));
  }

  r.get('/:id', wrap(async (req, res) => {
    const s = await loadVisible(req);
    const turns = await stores.interviews.turns(req.tenantId, s.id);
    // R2-2: baca transkrip individu selalu dicatat (termasuk atasan dan Admin ETA)
    await audit.readIndividual(req, `${submodule}.interview_transcript`, { employeeIds: [s.intervieweeId], objectType: 'interview_session', objectIds: [s.id] });
    res.json({ data: { ...s, turns } });
  }));

  r.post('/:id/consent', wrap(async (req, res) => {
    const s = await loadVisible(req);
    mustBeInterviewee(req, s);
    if (s.status !== 'scheduled') throw new HttpError(409, 'INVALID_STATE', 'Sesi sudah dimulai atau selesai');
    // Q38: undangan berlaku 7 hari. Sesi yang sudah berjalan boleh diselesaikan (BT-28 belum dibangun).
    if (isExpired(s.inviteExpiresAt)) throw new HttpError(409, 'INVITATION_EXPIRED', 'Undangan wawancara sudah berakhir. Minta HR memperpanjang undangan Anda.');
    // Pertanyaan dibuat dulu: bila AI gagal, sesi tetap 'scheduled' dan persetujuan bisa diulang.
    const q = await nextQuestion(req.tenantId, s, []);
    const now = new Date();
    await stores.interviews.update(req.tenantId, s.id, { consentAt: now, startedAt: now, status: 'in_progress' });
    const turn = q ? await stores.interviews.addTurn(req.tenantId, s.id, 'ai', q) : null;
    res.json({ data: { status: 'in_progress', question: turn } });
  }));

  // Q38: HR memperpanjang undangan (default 7 hari, maksimal 30). Dihitung dari batas lama, atau dari
  // sekarang bila undangan sudah lewat. Pengingat H-3/H-1 dikirim ulang untuk batas baru.
  r.post('/:id/extend', requireRole(ROLES.HR_ADMIN), wrap(async (req, res) => {
    const s = await loadVisible(req);
    if (!OPEN_STATUSES.includes(s.status)) throw new HttpError(409, 'INVALID_STATE', 'Sesi sudah selesai, undangan tidak perlu diperpanjang');
    const days = parseExtendDays((req.body || {}).days);
    if (days === null) throw badRequest(`days harus bilangan bulat 1-${EXTEND_MAX_DAYS}`);
    const until = extendedExpiry(s.inviteExpiresAt, days);
    const row = await stores.interviews.extendInvite(req.tenantId, s.id, until);
    await audit.record(req, 'update', `${submodule}.interview_invitation`, {
      employeeIds: [s.intervieweeId], objectType: 'interview_session', objectIds: [s.id], days,
      from: s.inviteExpiresAt, to: until.toISOString(),
    });
    res.json({ data: row });
  }));

  r.post('/:id/turns', wrap(async (req, res) => {
    const s = await loadVisible(req);
    mustBeInterviewee(req, s);
    if (s.status !== 'in_progress') throw new HttpError(409, 'INVALID_STATE', 'Sesi belum dimulai atau sudah selesai');
    const text = String((req.body || {}).text || '').trim();
    if (!text) throw badRequest('Jawaban tidak boleh kosong');
    const answer = text.slice(0, 8000);
    // Pertanyaan dibuat sebelum jawaban disimpan: bila AI gagal, tidak ada yang tersimpan dan jawaban bisa dikirim ulang.
    const turns = await stores.interviews.turns(req.tenantId, s.id);
    const q = await nextQuestion(req.tenantId, s, [...turns, { speaker: 'human', text: answer }]);
    await stores.interviews.addTurn(req.tenantId, s.id, 'human', answer);
    const turn = q ? await stores.interviews.addTurn(req.tenantId, s.id, 'ai', q) : null;
    res.json({ data: { question: turn, done: !q } });
  }));

  r.post('/:id/complete', wrap(async (req, res) => {
    const s = await loadVisible(req);
    if (s.intervieweeId !== req.user.id && ![ROLES.HR_ADMIN, ROLES.ETA_ADMIN].includes(req.user.role)) {
      throw forbidden('ROLE_FORBIDDEN', 'Peran Anda tidak bisa menutup sesi ini');
    }
    if (s.status !== 'in_progress') throw new HttpError(409, 'INVALID_STATE', 'Sesi belum dimulai atau sudah selesai');
    const transcript = await stores.interviews.turns(req.tenantId, s.id);
    if (!transcript.some((t) => t.speaker === 'human')) throw badRequest('Belum ada jawaban di sesi ini');
    const ctx = await buildContext(stores, req.tenantId, s);
    const result = await analyze({ stores, ai, aiConfig, tenantId: req.tenantId, session: s, transcript, ctx });
    await stores.interviews.update(req.tenantId, s.id, { status: 'completed', endedAt: new Date() });
    const aiUsage = stores.aiUsage ? await stores.aiUsage.sessionTotals(req.tenantId, s.id) : null;
    res.json({ data: { status: 'completed', ...result, aiProvider: ai.name, aiModel: ai.model, aiUsage } });
  }));

  return r;
}

module.exports = { interviewRouter, wrap, aiContext };
