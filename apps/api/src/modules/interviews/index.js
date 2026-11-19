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
const { currentConsentVersion, isAcceptedConsentVersion } = require('../../core/consent');
const { inviteExpiry, isExpired, extendedExpiry, parseExtendDays, OPEN_STATUSES, EXTEND_MAX_DAYS } = require('./invitation');

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
        created.push(await stores.interviews.create(req.tenantId, { projectId, submodule, intervieweeId: id, jobRoleId: person.jobRoleId, inviteExpiresAt: inviteExpiry() }));
      }
      res.status(201).json({ data: created });
    }));
  }

  // PO-6 A (17 Nov): transkrip mentah hanya untuk karyawan yang diwawancarai. Atasan, HR, dan Admin ETA
  // tetap melihat status sesi, tetapi tidak percakapannya; mereka melihat temuan lewat /findings.
  const isInterviewee = (req, s) => s.intervieweeId === req.user.id;

  r.get('/:id', wrap(async (req, res) => {
    const s = await loadVisible(req);
    if (!isInterviewee(req, s)) {
      return res.json({ data: { ...s, turns: undefined, transcriptVisible: false } });
    }
    const turns = await stores.interviews.turns(req.tenantId, s.id);
    // R2-2: baca transkrip individu selalu dicatat
    await audit.readIndividual(req, `${submodule}.interview_transcript`, { employeeIds: [s.intervieweeId], objectType: 'interview_session', objectIds: [s.id] });
    return res.json({ data: { ...s, turns, transcriptVisible: true, consentVersionRequired: currentConsentVersion(submodule) } });
  }));

  r.get('/:id/transcript', wrap(async (req, res) => {
    const s = await loadVisible(req);
    if (!isInterviewee(req, s)) throw forbidden('TRANSCRIPT_PRIVATE', 'Transkrip wawancara hanya bisa dibaca karyawan yang diwawancarai');
    const turns = await stores.interviews.turns(req.tenantId, s.id);
    await audit.readIndividual(req, `${submodule}.interview_transcript`, { employeeIds: [s.intervieweeId], objectType: 'interview_session', objectIds: [s.id] });
    res.json({ data: turns });
  }));

  // PM-9 A: persetujuan wajib menyebut kode versi teks yang ditampilkan; versi disimpan bersama waktunya.
  r.post('/:id/consent', wrap(async (req, res) => {
    const s = await loadVisible(req);
    mustBeInterviewee(req, s);
    if (s.status !== 'scheduled') throw new HttpError(409, 'INVALID_STATE', 'Sesi sudah dimulai atau selesai');
    // Q38: undangan berlaku 7 hari. Sesi yang sudah berjalan boleh diselesaikan (BT-28 belum dibangun).
    if (isExpired(s.inviteExpiresAt)) throw new HttpError(409, 'INVITATION_EXPIRED', 'Undangan wawancara sudah berakhir. Minta HR memperpanjang undangan Anda.');
    const current = currentConsentVersion(submodule);
    if (!current) throw new HttpError(409, 'CONSENT_TEXT_PENDING', 'Teks persetujuan untuk wawancara ini belum terbit');
    const consentVersion = String((req.body || {}).consentVersion || '').trim();
    if (!consentVersion) throw badRequest(`consentVersion wajib diisi (versi berlaku: ${current})`);
    if (!isAcceptedConsentVersion(submodule, consentVersion)) {
      throw new HttpError(409, 'CONSENT_VERSION_OUTDATED', `Teks persetujuan sudah berubah. Baca dan setujui versi ${current}`);
    }
    // Pertanyaan dibuat dulu: bila AI gagal, sesi tetap 'scheduled' dan persetujuan bisa diulang.
    const q = await nextQuestion(req.tenantId, s, []);
    const now = new Date();
    await stores.interviews.update(req.tenantId, s.id, { consentAt: now, consentVersion, startedAt: now, status: 'in_progress' });
    await audit.record(req, 'create', `${submodule}.interview_consent`, { employeeIds: [s.intervieweeId], objectType: 'interview_session', objectIds: [s.id], consentVersion });
    const turn = q ? await stores.interviews.addTurn(req.tenantId, s.id, 'ai', q) : null;
    res.json({ data: { status: 'in_progress', consentVersion, question: turn } });
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
