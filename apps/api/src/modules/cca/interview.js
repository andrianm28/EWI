'use strict';
// B10 tahap 2: percakapan wawancara Core Competencies, ringkasan, konfirmasi, dan sintesis HR.
// Spek: docs/designs/b10-core-competencies.md bagian 11. Sesi = penugasan (D-1); transkrip hanya untuk peserta (R-1).
const { ROLES, requireRole } = require('../../core/rbac');
const { badRequest, notFound, HttpError } = require('../../core/errors');
const { currentConsentVersion, isAcceptedConsentVersion } = require('../../core/consent');
const { CCA_THEMES, ccaDefaultQuestion } = require('../../ai/prompts');
const { AiError } = require('../../ai/errors');
const { callAi } = require('../interviews/ai-calls');
const { MIN_RESPONDENTS, respondentBand, synthesize } = require('./synthesis');

const MAX_REQUIREMENTS = 20;
const MAX_RESTARTS = 1;
const MAX_ANSWER = 2000;
const MAX_APPLY = 100;
const QUESTION_COUNT = 4;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const invalidState = (msg) => new HttpError(409, 'INVALID_STATE', msg);
const answerCountOf = (turns) => turns.filter((t) => t.role === 'participant').length;
// Bentuk giliran yang dikirim ke model: tanpa pilihan jawaban
const plainTurns = (turns) => turns.map(({ role, theme, text }) => ({ role, theme, text }));

function stepOf(a) {
  if (a.status === 'assigned') return 'consent';
  if (a.status === 'completed') return 'done';
  if (a.status === 'cancelled') return 'cancelled';
  return a.summaryAt ? 'summary' : 'chat';
}
const publicTurn = (t) => ({ role: t.role, theme: t.theme, text: t.text, options: t.role === 'ai' ? t.options || [] : null });

function mountInterview(r, { stores, ai, aiConfig = {}, audit, interview }) {
  /**
   * Panggil AI lewat pencatat pemakaian bersama (R3-6). CCA tidak punya sesi wawancara B6, jadi session_id dan
   * project_id NULL (D-1). Galat penyedia menjadi 502 AI_UNAVAILABLE dengan pesan umum (detail teknis hanya di log);
   * galat lain diteruskan apa adanya.
   */
  async function askAi(req, fn) {
    const env = { stores, aiConfig, tenantId: req.tenantId, session: { projectId: null, id: null, intervieweeId: req.user.id, submodule: 'cca' } };
    try {
      return await callAi(env, fn);
    } catch (e) {
      if (!(e instanceof AiError)) throw e;
      console.error('AI wawancara CCA gagal:', e.code, e.message);
      throw new HttpError(502, 'AI_UNAVAILABLE', 'Asisten AI sedang tidak bisa dihubungi. Coba lagi beberapa saat lagi.');
    }
  }

  /** Penugasan milik pemanggil, atau 404 (UUID salah, tidak ada, atau milik orang lain). */
  async function ownAssignment(req) {
    const a = UUID_RE.test(req.params.id) ? await stores.cca.getAssignment(req.tenantId, req.params.id) : null;
    if (!a || a.assigneeId !== req.user.id) throw notFound('Penugasan tidak ditemukan');
    return a;
  }
  const requireActive = (a) => {
    if (a.status !== 'in_progress') throw invalidState('Wawancara ini tidak sedang berjalan');
  };

  /** Minta pertanyaan berikutnya ke AI lalu simpan sebagai giliran AI. Return pertanyaan publik atau null bila bentrok. */
  async function askNext(req, a, turns) {
    const answerCount = answerCountOf(turns);
    const theme = CCA_THEMES[a.tier][answerCount];
    const [sources, snapshot] = await Promise.all([
      stores.cca.interviewSources(req.tenantId),
      stores.cca.validatedRequirements(req.tenantId, { ids: a.contextRequirementIds || [], snapshot: true }),
    ]);
    const { question } = await askAi(req, () => ai.ccaQuestion({
      tier: a.tier, theme, position: answerCount + 1, sources, requirements: snapshot.map((x) => ({ name: x.name })), turns: plainTurns(turns),
    }));
    const saved = await stores.cca.insertTurn(req.tenantId, a.id, {
      position: turns.length + 1, role: 'ai', theme, text: question.text, options: question.options, restartCount: a.restartCount,
    });
    if (!saved) throw invalidState('Wawancara berubah di tempat lain. Muat ulang halaman.');
    return { position: answerCount + 1, theme, text: question.text, options: question.options };
  }

  r.get('/assignments/:id/session', interview, wrap(async (req, res) => {
    const a = await ownAssignment(req);
    const turns = await stores.cca.listTurns(req.tenantId, a.id);
    const summary = a.summaryAt ? await stores.cca.getAssignmentSummary(req.tenantId, a.id) : null;
    res.json({
      data: {
        assignment: { id: a.id, tier: a.tier, status: a.status, dueDate: a.dueDate, durationMinutes: a.durationMinutes, restartsLeft: Math.max(0, MAX_RESTARTS - a.restartCount) },
        step: stepOf(a),
        consentVersionRequired: currentConsentVersion('cca'),
        turns: turns.map(publicTurn),
        answerCount: answerCountOf(turns),
        questionCount: QUESTION_COUNT,
        summary: summary ? { themes: summary.themes, createdAt: a.summaryAt } : null,
      },
    });
  }));

  r.post('/assignments/:id/consent', interview, wrap(async (req, res) => {
    const a = await ownAssignment(req);
    if (a.status !== 'assigned') throw invalidState('Persetujuan sudah diberikan atau penugasan tidak aktif');
    const version = (req.body || {}).consentVersion;
    if (!isAcceptedConsentVersion('cca', version)) {
      throw new HttpError(400, 'CONSENT_VERSION_INVALID', 'Versi persetujuan tidak berlaku. Muat ulang halaman lalu setujui teks terbaru.');
    }
    const requirementIds = (await stores.cca.validatedRequirements(req.tenantId, { limit: MAX_REQUIREMENTS })).map((x) => x.id);
    const started = await stores.cca.startInterview(req.tenantId, a.id, { consentVersion: version, requirementIds });
    if (!started) throw invalidState('Persetujuan sudah diberikan atau penugasan tidak aktif');
    await audit.record(req, 'create', 'cca.interview_consent', { assignmentId: a.id, consentVersion: version });
    // Persetujuan sudah tersimpan; AI gagal atau kalah balapan -> layar meminta pertanyaan lagi lewat POST /turns tanpa text
    let question = null;
    try { question = await askNext(req, started, []); } catch (e) { if (e.status !== 502 && e.code !== 'INVALID_STATE') throw e; }
    res.json({ data: { question } });
  }));

  r.post('/assignments/:id/turns', interview, wrap(async (req, res) => {
    const a = await ownAssignment(req);
    requireActive(a);
    if (a.summaryAt) throw new HttpError(409, 'SUMMARY_EXISTS', 'Ringkasan sudah dibuat. Periksa ringkasan, atau ulangi wawancara.');
    const body = req.body || {};
    const turns = await stores.cca.listTurns(req.tenantId, a.id);
    const answerCount = answerCountOf(turns);
    const last = turns[turns.length - 1];
    if (body.text === undefined || body.text === null) {
      // minta (ulang) pertanyaan berikutnya: hanya bila belum ada pertanyaan yang menunggu jawaban
      if (answerCount >= QUESTION_COUNT || (last && last.role === 'ai')) throw invalidState('Tidak ada pertanyaan yang perlu diminta');
      return res.json({ data: { question: await askNext(req, a, turns), done: false } });
    }
    if (answerCount >= QUESTION_COUNT || !last || last.role !== 'ai') throw invalidState('Tidak ada pertanyaan yang menunggu jawaban');
    const text = String(body.text).trim();
    if (!text || text.length > MAX_ANSWER) throw badRequest(`Jawaban wajib diisi, maksimal ${MAX_ANSWER} karakter`);
    const saved = await stores.cca.insertTurn(req.tenantId, a.id, {
      position: turns.length + 1, role: 'participant', theme: last.theme, text, options: null, restartCount: a.restartCount,
    });
    if (!saved) throw invalidState('Jawaban untuk pertanyaan ini sudah terkirim');
    if (answerCount + 1 >= QUESTION_COUNT) return res.json({ data: { question: null, done: true } });
    const all = [...turns, { role: 'participant', theme: last.theme, text }];
    res.json({ data: { question: await askNext(req, a, all), done: false } });
  }));

  r.post('/assignments/:id/summary', interview, wrap(async (req, res) => {
    const a = await ownAssignment(req);
    requireActive(a);
    if (a.summaryAt) {
      const existing = await stores.cca.getAssignmentSummary(req.tenantId, a.id);
      return res.json({ data: { themes: existing.themes, createdAt: a.summaryAt } });
    }
    const turns = await stores.cca.listTurns(req.tenantId, a.id);
    if (answerCountOf(turns) < QUESTION_COUNT) throw invalidState('Jawab keempat pertanyaan dulu');
    // potret saat persetujuan apa adanya (D-3); persyaratan yang kemudian ditolak disaring di sintesis (R-4)
    const requirements = (await stores.cca.validatedRequirements(req.tenantId, { ids: a.contextRequirementIds || [], snapshot: true }))
      .map((x) => ({ id: x.id, name: x.name, sourceTitle: x.sourceTitle }));
    const out = await askAi(req, () => ai.summarizeCca({ tier: a.tier, turns: plainTurns(turns), requirements }));
    const allowed = new Set(requirements.map((x) => x.id));
    const summary = { themes: out.themes, stances: (out.stances || []).filter((x) => allowed.has(x.requirementId)) };
    const won = await stores.cca.saveInterviewSummary(req.tenantId, a.id, { summary, restartCount: a.restartCount });
    const fresh = await stores.cca.getAssignment(req.tenantId, a.id);
    if (!won) {
      // kiriman paralel lain lebih dulu: pakai ringkasannya
      const existing = fresh.summaryAt ? await stores.cca.getAssignmentSummary(req.tenantId, a.id) : null;
      if (!existing) throw invalidState('Wawancara berubah di tempat lain. Muat ulang halaman.');
      return res.json({ data: { themes: existing.themes, createdAt: fresh.summaryAt } });
    }
    await audit.record(req, 'create', 'cca.interview_summary', { assignmentId: a.id });
    res.status(201).json({ data: { themes: summary.themes, createdAt: fresh.summaryAt } });
  }));

  r.post('/assignments/:id/summary/confirm', interview, wrap(async (req, res) => {
    const a = await ownAssignment(req);
    const row = await stores.cca.confirmInterview(req.tenantId, a.id);
    if (!row) throw invalidState('Ringkasan belum dibuat atau wawancara sudah dikirim');
    await audit.record(req, 'update', 'cca.assignment', { assignmentId: a.id, status: 'completed' });
    res.json({ data: { status: 'completed' } });
  }));

  r.post('/assignments/:id/restart', interview, wrap(async (req, res) => {
    const a = await ownAssignment(req);
    requireActive(a);
    if (a.restartCount >= MAX_RESTARTS) throw new HttpError(409, 'RESTART_LIMIT', 'Wawancara hanya bisa diulang satu kali');
    const row = await stores.cca.restartInterview(req.tenantId, a.id, { maxRestarts: MAX_RESTARTS });
    if (!row) throw new HttpError(409, 'RESTART_LIMIT', 'Wawancara hanya bisa diulang satu kali');
    await audit.record(req, 'delete', 'cca.interview_transcript', { assignmentId: a.id });
    res.json({ data: { restartsLeft: Math.max(0, MAX_RESTARTS - row.restartCount) } });
  }));

  // --- HR: sintesis, isi nilai aktual, pratinjau ---
  const hr = requireRole(ROLES.HR_ADMIN);

  async function synthesisRows(tenantId) {
    const [requirements, responses] = await Promise.all([stores.cca.validatedRequirements(tenantId), stores.cca.synthesisResponses(tenantId)]);
    const byId = new Map(requirements.map((x) => [x.id, x]));
    return { responses, rows: synthesize(requirements, responses).map((s) => ({ ...s, ...pick(byId.get(s.requirementId)) })) };
  }
  const pick = (x) => ({ name: x.name, sourceKind: x.sourceKind, sourceTitle: x.sourceTitle, actualScore: x.actualScore, actualSource: x.actualSource });

  r.get('/synthesis', interview, hr, wrap(async (req, res) => {
    const { rows, responses } = await synthesisRows(req.tenantId);
    const people = (tier) => new Set(responses.filter((x) => x.tier === tier).map((x) => x.assigneeId)).size;
    res.json({
      data: {
        themes: rows,
        minRespondents: MIN_RESPONDENTS,
        // karyawan selesai sebagai rentang (D-7): angka tepat di sini memudahkan menebak satu orang dari selisih tampilan
        kpis: { themes: rows.filter((x) => x.leaderRespondents > 0).length, leadersCompleted: people('leader'), employeesCompleted: respondentBand(people('employee')) },
      },
    });
  }));

  r.post('/synthesis/apply', interview, hr, wrap(async (req, res) => {
    const ids = Array.isArray((req.body || {}).requirementIds) ? [...new Set(req.body.requirementIds.map(String))] : [];
    if (!ids.length || ids.length > MAX_APPLY) throw badRequest(`requirementIds wajib berisi 1-${MAX_APPLY} persyaratan`);
    const { rows } = await synthesisRows(req.tenantId);
    const byId = new Map(rows.map((x) => [x.requirementId, x]));
    const items = []; const skipped = [];
    for (const id of ids) {
      const row = byId.get(id);
      if (!row) skipped.push({ requirementId: id, reason: 'Persyaratan tidak ditemukan atau belum tervalidasi' });
      else if (row.employeeAligned === null) skipped.push({ requirementId: id, reason: `Responden karyawan kurang dari ${MIN_RESPONDENTS}` });
      else items.push({ id, score: row.employeeAligned });
    }
    const applied = items.length ? await stores.cca.applySynthesis(req.tenantId, items) : [];
    if (applied.length) await audit.record(req, 'update', 'cca.requirement', { source: 'synthesis', applied });
    res.json({ data: { applied, skipped } });
  }));

  r.get('/interview/preview', interview, hr, wrap(async (req, res) => {
    const tier = String(req.query.tier || 'leader');
    if (!Object.prototype.hasOwnProperty.call(CCA_THEMES, tier)) throw badRequest('tier harus leader atau employee');
    const sources = await stores.cca.interviewSources(req.tenantId);
    res.json({ data: { tier, questions: CCA_THEMES[tier].map((theme, i) => ({ position: i + 1, theme, ...ccaDefaultQuestion(tier, theme, sources) })) } });
  }));
}

module.exports = { mountInterview, MAX_REQUIREMENTS, MAX_RESTARTS, QUESTION_COUNT };
