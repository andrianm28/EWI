'use strict';
// B15 tahap 3: wawancara ulang AI yang dijalankan karyawan sendiri, penilaian per kompetensi, dan hasil HR (benchmark,
// rantai bukti per karyawan, keyakinan, rekomendasi aturan). Spek: docs/designs/b15-impact-measurement.md bagian 12.
// Transkrip hanya untuk karyawan itu (T-6); HR membaca skor dan alasan. Pola sesi mengikuti B10 (modules/cca/interview.js).
const { badRequest, notFound, HttpError } = require('../../core/errors');
const { currentConsentVersion, isAcceptedConsentVersion } = require('../../core/consent');
const { callAiOr502 } = require('../interviews/ai-calls');
const rules = require('./reinterview-rules');

const MAX_ANSWER = 2000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const invalidState = (msg) => new HttpError(409, 'INVALID_STATE', msg);
const answersOf = (turns) => turns.filter((t) => t.role === 'participant').length;
const plainTurns = (turns) => turns.map(({ role, kind, competencyId, text }) => ({ role, kind, competencyId, text }));
const forPrompt = (c) => ({ id: c.id, name: c.name, definition: c.definition, indicators: c.indicators });

/** Rute karyawan (/me/...). Dipasang sebelum pembatas peran HR/atasan: semua peran boleh, data pemanggil sendiri saja. */
function mountMine(r, { stores, ai, aiConfig = {}, audit, gate }) {
  const askAi = (req, fn) => callAiOr502({ stores, aiConfig, tenantId: req.tenantId, session: { projectId: null, id: null, intervieweeId: req.user.id, submodule: 'lim' } }, fn, 'wawancara ulang LIM');

  /** Rencana + keadaan wawancara milik pemanggil, atau 404 bila pemanggil tidak punya jadwal maupun wawancara di sana. */
  async function mine(req) {
    const plan = UUID.test(req.params.planId) ? await stores.lim.getPlan(req.tenantId, req.params.planId) : null;
    if (!plan) throw notFound('Wawancara ulang tidak ditemukan');
    const [pairs, current] = await Promise.all([
      stores.lim.scheduledPairs(req.tenantId, plan.id, req.user.id), stores.lim.currentReinterview(req.tenantId, plan.id, req.user.id),
    ]);
    if (!pairs.length && !current) throw notFound('Wawancara ulang tidak ditemukan');
    // triase 12.7 #2: rencana diarsip saat wawancara berjalan -> sesi berhenti, baris tetap in_progress
    if (plan.status !== 'active') throw new HttpError(409, 'PLAN_ARCHIVED', 'Rencana pengukuran ini sudah diarsipkan oleh HR.');
    return { plan, pairs, current };
  }

  function stepOf(current, pairs, answers) {
    if (current && current.status === 'in_progress') return answers >= rules.questionPlan(current.competencyIds).length ? 'scoring' : 'chat';
    return pairs.length ? 'consent' : 'done';
  }

  const publicTurn = (names) => (t) => ({
    position: t.position, role: t.role, kind: t.kind, competency: t.competencyId ? names.get(t.competencyId) || null : null,
    text: t.text, options: t.role === 'ai' ? t.options || [] : null,
  });

  /** Minta pertanyaan berikutnya ke AI lalu simpan sebagai giliran AI. */
  async function askNext(req, ri, comps, turns) {
    const plan = rules.questionPlan(ri.competencyIds);
    const idx = answersOf(turns);
    const item = plan[idx];
    const competency = comps.find((c) => c.id === item.competencyId) || null;
    const { question } = await askAi(req, () => ai.limQuestion({
      competency: competency && forPrompt(competency), competencies: comps.map(forPrompt), kind: item.kind, position: idx + 1, total: plan.length, turns: plainTurns(turns),
    }));
    const saved = await stores.lim.insertReinterviewTurn(req.tenantId, ri.id, {
      position: turns.length + 1, role: 'ai', kind: item.kind, competencyId: item.competencyId, text: question.text, options: question.options,
    });
    if (!saved) throw invalidState('Wawancara berubah di tempat lain. Muat ulang halaman.');
    return { position: idx + 1, kind: item.kind, competency: competency ? competency.name : null, text: question.text, options: question.options };
  }

  /** T-5: nilai semua kompetensi potret lalu tutup wawancara dalam satu transaksi. */
  async function score(req, ri, comps, turns) {
    const out = await askAi(req, () => ai.summarizeLim({ competencies: comps.map(forPrompt), turns: plainTurns(turns) }));
    const byId = new Map((out.scores || []).map((s) => [s.competencyId, s]));
    const scores = comps.map((c) => byId.get(c.id));
    if (scores.some((s) => !s)) throw new HttpError(502, 'AI_UNAVAILABLE', 'Penilaian belum lengkap. Coba lagi beberapa saat lagi.');
    const closed = await stores.lim.completeReinterview(req.tenantId, ri.id, {
      scores, summary: { competencies: scores.map(({ competencyId, score: s, reason }) => ({ competencyId, score: s, reason })) },
    });
    if (!closed) {
      const fresh = await stores.lim.currentReinterview(req.tenantId, ri.planId, req.user.id);
      if (!fresh || fresh.id !== ri.id || fresh.status !== 'completed') throw invalidState('Wawancara berubah di tempat lain. Muat ulang halaman.');
      return;
    }
    await audit.record(req, 'update', 'lim.reinterview_completed', { planId: ri.planId, reinterviewId: ri.id });
  }

  r.get('/me/reinterviews', gate, wrap(async (req, res) => {
    const rows = await stores.lim.myReinterviewPlans(req.tenantId, req.user.id);
    res.json({ data: rows.map((x) => ({
      planId: x.planId, planTitle: x.planTitle, scheduledOn: x.scheduledOn,
      status: x.lastStatus === 'in_progress' ? 'in_progress' : x.scheduled.length ? 'open' : 'completed',
      competencies: x.scheduled,
    })) });
  }));

  r.get('/me/reinterviews/:planId/session', gate, wrap(async (req, res) => {
    const { pairs, current } = await mine(req);
    // sesi yang ditampilkan: yang berjalan, atau yang baru selesai bila tidak ada kompetensi lain yang menunggu
    const shown = current && (current.status === 'in_progress' || !pairs.length) ? current : null;
    const comps = shown ? await stores.lim.competenciesByIds(req.tenantId, shown.competencyIds) : [];
    const turns = shown ? await stores.lim.listReinterviewTurns(req.tenantId, shown.id) : [];
    const answers = answersOf(turns);
    const names = new Map(comps.map((c) => [c.id, c.name]));
    const upcoming = shown ? comps.map((c) => c.name) : rules.snapshot(pairs.map((p) => ({ competencyId: p.competencyId, name: p.name }))).map((c) => c.name);
    res.json({ data: {
      step: stepOf(current, pairs, answers),
      consentVersionRequired: currentConsentVersion('lim'),
      competencies: upcoming,
      turns: turns.map(publicTurn(names)),
      answerCount: answers,
      questionCount: rules.questionCount(upcoming.length),
    } });
  }));

  r.post('/me/reinterviews/:planId/consent', gate, wrap(async (req, res) => {
    const { plan, pairs, current } = await mine(req);
    if ((current && current.status === 'in_progress') || !pairs.length) throw invalidState('Persetujuan sudah diberikan atau tidak ada kompetensi yang dijadwalkan');
    const version = (req.body || {}).consentVersion;
    if (!isAcceptedConsentVersion('lim', version)) {
      throw new HttpError(400, 'CONSENT_VERSION_INVALID', 'Versi persetujuan tidak berlaku. Muat ulang halaman lalu setujui teks terbaru.');
    }
    // triase 12.7 #10: masih peserta rencana (karyawan aktif, periode + jabatan rencana)
    const parts = await stores.lim.participations(req.tenantId, plan.id);
    if (!parts.some((p) => p.userId === req.user.id)) throw notFound('Wawancara ulang tidak ditemukan');
    const snap = rules.snapshot(pairs.map((p) => ({ competencyId: p.competencyId, name: p.name })));
    const ri = await stores.lim.startReinterview(req.tenantId, { planId: plan.id, userId: req.user.id, consentVersion: version, competencyIds: snap.map((c) => c.competencyId) });
    if (!ri) throw invalidState('Persetujuan sudah diberikan');
    await audit.record(req, 'create', 'lim.reinterview_consent', { planId: plan.id, reinterviewId: ri.id, consentVersion: version });
    const comps = await stores.lim.competenciesByIds(req.tenantId, ri.competencyIds);
    // persetujuan sudah tersimpan; AI gagal atau kalah balapan -> layar meminta lagi lewat POST /turns tanpa text
    let question = null;
    try { question = await askNext(req, ri, comps, []); } catch (e) { if (e.status !== 502 && e.code !== 'INVALID_STATE') throw e; }
    res.json({ data: { question } });
  }));

  r.post('/me/reinterviews/:planId/turns', gate, wrap(async (req, res) => {
    const { current: ri } = await mine(req);
    if (!ri || ri.status !== 'in_progress') throw invalidState('Wawancara ini tidak sedang berjalan');
    const body = req.body || {};
    const [comps, turns] = await Promise.all([stores.lim.competenciesByIds(req.tenantId, ri.competencyIds), stores.lim.listReinterviewTurns(req.tenantId, ri.id)]);
    const total = rules.questionPlan(ri.competencyIds).length;
    const answers = answersOf(turns);
    const last = turns[turns.length - 1];
    if (body.text === undefined || body.text === null) {
      // semua jawaban ada -> nilai ulang (triase 12.7 #4); selain itu minta pertanyaan yang belum ada
      if (answers >= total) { await score(req, ri, comps, turns); return res.json({ data: { question: null, done: true } }); }
      if (last && last.role === 'ai') throw invalidState('Tidak ada pertanyaan yang perlu diminta');
      return res.json({ data: { question: await askNext(req, ri, comps, turns), done: false } });
    }
    if (answers >= total || !last || last.role !== 'ai') throw invalidState('Tidak ada pertanyaan yang menunggu jawaban');
    const text = String(body.text).trim();
    if (!text || text.length > MAX_ANSWER) throw badRequest(`Jawaban wajib diisi, maksimal ${MAX_ANSWER} karakter`);
    const saved = await stores.lim.insertReinterviewTurn(req.tenantId, ri.id, {
      position: turns.length + 1, role: 'participant', kind: last.kind, competencyId: last.competencyId, text, options: null,
    });
    if (!saved) throw invalidState('Jawaban untuk pertanyaan ini sudah terkirim');
    const all = [...turns, { role: 'participant', kind: last.kind, competencyId: last.competencyId, text }];
    if (answers + 1 >= total) { await score(req, ri, comps, all); return res.json({ data: { question: null, done: true } }); }
    res.json({ data: { question: await askNext(req, ri, comps, all), done: false } });
  }));
}

/**
 * Hasil HR satu karyawan (T-7). planData: fungsi data efektif rencana dari index.js; decorateInd: kondisi indikator.
 * Semua wawancara selesai di rencana ini, terbaru dulu (triase 12.7 #5).
 */
function mountHrResult(r, { stores, audit, gate, hr, idParam, loadPlan, planData, decorateInd, buildChain }) {
  r.get('/plans/:id/reinterviews/:userId', gate, hr, idParam, wrap(async (req, res) => {
    const plan = await loadPlan(req);
    const userId = String(req.params.userId);
    const list = UUID.test(userId) ? await stores.lim.completedReinterviews(req.tenantId, userId, { planId: plan.id }) : [];
    if (!list.length) throw notFound('Hasil wawancara ulang tidak ditemukan');
    const [{ rows, activity }, rawIndicators] = await Promise.all([planData(req.tenantId, plan, new Set([userId])), stores.lim.listIndicators(req.tenantId, plan.id)]);
    const indicators = rawIndicators.map(decorateInd);
    const ids = [...new Set(list.flatMap((x) => x.competencyIds))];
    const names = new Map((await stores.lim.competenciesByIds(req.tenantId, ids)).map((c) => [c.id, c.name]));
    const byComp = new Map(rows.map((x) => [x.competencyId, x]));
    const reinterviews = list.map((ri) => {
      const scores = (ri.summary && ri.summary.competencies) || [];
      const competencies = scores.map((s) => {
        const row = byComp.get(s.competencyId);
        return { competencyId: s.competencyId, name: names.get(s.competencyId) || '-', post: row ? row.post : null, reinterview: s.score, performance: row ? row.performance : null, reason: s.reason };
      });
      const result = rules.employeeResult({ competencies, indicators });
      const scoreOf = new Map(scores.map((s) => [s.competencyId, s.score]));
      const chainRows = rows.map((x) => (scoreOf.has(x.competencyId) ? { ...x, reinterview: scoreOf.get(x.competencyId) } : x));
      return {
        id: ri.id, completedAt: ri.completedAt, competencies,
        benchmark: result.benchmark.map(({ competencyId, name, post, reinterview, performance, retention, application }) => ({ competencyId, name, post, reinterview, performance, retention, application })),
        chain: rules.personalChain(buildChain({ participants: [userId], activity, rows: chainRows, indicators }), competencies),
        confidence: result.confidence, recommendations: result.recommendations, generatedBy: 'rules',
      };
    });
    await audit.readIndividual(req, 'lim.reinterview', { employeeIds: [userId], objectType: 'lim_reinterview', objectIds: list.map((x) => x.id) });
    res.json({ data: { userId, indicators, factors: plan.factors || [], reinterviews } });
  }));

  // "Simpan hasil" (mockup limFinish): skor sudah tersimpan saat wawancara selesai; HR mencatat bahwa hasil terbaru sudah ditinjau.
  r.post('/plans/:id/reinterviews/:userId/review', gate, hr, idParam, wrap(async (req, res) => {
    const plan = await loadPlan(req);
    const userId = String(req.params.userId);
    const list = UUID.test(userId) ? await stores.lim.completedReinterviews(req.tenantId, userId, { planId: plan.id }) : [];
    const wanted = req.body && req.body.reinterviewId;
    const ri = wanted ? list.find((x) => x.id === String(wanted)) : list[0];
    if (!ri) throw notFound('Hasil wawancara ulang tidak ditemukan');
    await audit.record(req, 'update', 'lim.reinterview', { planId: plan.id, employeeIds: [userId], reinterviewId: ri.id, reviewed: true });
    res.status(204).end();
  }));
}

module.exports = { mountMine, mountHrResult };
