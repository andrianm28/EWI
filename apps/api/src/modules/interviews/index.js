'use strict';
// Sesi wawancara AI (teks) yang dipakai DNA dan TNA. Suara (voice) di balik flag dan menyusul.
// Pertanyaan dan analisis memakai port AI (src/ai): Bedrock di produksi, tiruan (stub) di test/dev (PK-06).
// Setiap panggilan model dicatat di ai_usage_logs (R3-6). Analisis setelah sesi ditutup berjalan sebagai job
// terpisah (analysis.js, PK-14 / PD-13 ★A); hasil TNA berstatus draf sampai direview HR.
const express = require('express');
const { buildContext, aiContext, callAi } = require('./ai-calls');
const { requireRole, ROLES } = require('../../core/rbac');
const { scopeFor, inScope } = require('../../core/rbac/scope');
const { badRequest, forbidden, notFound, HttpError } = require('../../core/errors');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function interviewRouter({ submodule, stores, ai, aiConfig = {}, audit, analysis }) {
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
        created.push(await stores.interviews.create(req.tenantId, { projectId, submodule, intervieweeId: id, jobRoleId: person.jobRoleId }));
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
    // Pertanyaan dibuat dulu: bila AI gagal, sesi tetap 'scheduled' dan persetujuan bisa diulang.
    const q = await nextQuestion(req.tenantId, s, []);
    const now = new Date();
    await stores.interviews.update(req.tenantId, s.id, { consentAt: now, startedAt: now, status: 'in_progress' });
    const turn = q ? await stores.interviews.addTurn(req.tenantId, s.id, 'ai', q) : null;
    res.json({ data: { status: 'in_progress', question: turn } });
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
    // Penutupan bersyarat: dari dua permintaan bersamaan hanya satu yang lolos, jadi job tidak dibuat ganda.
    const closed = await stores.interviews.close(req.tenantId, s.id);
    if (!closed) throw new HttpError(409, 'INVALID_STATE', 'Sesi belum dimulai atau sudah selesai');
    const job = await stores.analysis.enqueue(req.tenantId, { sessionId: s.id, submodule });
    analysis.kick(req.tenantId, job.id);
    const aiUsage = stores.aiUsage ? await stores.aiUsage.sessionTotals(req.tenantId, s.id) : null;
    res.status(202).json({ data: { status: 'completed', analysis: { status: job.status }, aiProvider: ai.name, aiModel: ai.model, aiUsage } });
  }));

  // Status analisis. HR melihat jumlah hasil dan kode galat; karyawan dan atasan hanya status.
  r.get('/:id/analysis', wrap(async (req, res) => {
    const s = await loadVisible(req);
    const job = await stores.analysis.forSession(req.tenantId, s.id);
    if (!job) throw notFound('Analisis belum dibuat untuk sesi ini');
    const isHr = [ROLES.HR_ADMIN, ROLES.ETA_ADMIN].includes(req.user.role);
    res.json({ data: isHr ? job : { status: job.status } });
  }));

  // HR mengulang analisis yang gagal permanen (setelah batas percobaan otomatis habis).
  r.post('/:id/analysis/retry', requireRole(ROLES.HR_ADMIN), wrap(async (req, res) => {
    const s = await loadVisible(req);
    const job = await stores.analysis.requeue(req.tenantId, s.id);
    if (!job) throw new HttpError(409, 'INVALID_STATE', 'Hanya analisis yang gagal yang bisa diulang');
    analysis.kick(req.tenantId, job.id);
    res.status(202).json({ data: { status: job.status } });
  }));

  return r;
}

module.exports = { interviewRouter, wrap, aiContext };
