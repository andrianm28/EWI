'use strict';
// B17 Asisten ELGOS: GET /api/assistant (salam, saran, tampilan) dan POST /api/assistant/ask.
// Bukan submodul: tiap penyusun fakta memeriksa modul dan flag-nya sendiri (penyimpangan yang dicatat di spek).
// Tampilan karyawan hanya data req.user.id; atasan dan hr memakai visibleEmployeeScope() lewat scopeFor.
// Spek: docs/designs/b17-asisten-elgos.md
const express = require('express');
const { FLAGS, requireFlag } = require('../../core/flags');
const { submoduleActive } = require('../../core/entitlement/guard');
const { scopeFor } = require('../../core/rbac/scope');
const { badRequest, HttpError } = require('../../core/errors');
const { estimateCost } = require('../../ai');
const { MAX_ASSISTANT_ANSWER } = require('../../ai/prompts');
const { resolveView, mentionsOthers, createAliases, restoreNames } = require('./views');
const { activeBuilders, buildFacts } = require('./facts');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const RATE_LIMIT = 20;
const RATE_WINDOW_MINUTES = 10;
const MAX_QUESTION = 500;
const REFUSAL = 'Saya tidak bisa menampilkan data pribadi orang lain. Saya hanya menjawab hal yang terkait akun Anda.';

// Saran dari mockup (SUG); tampil hanya bila fakta topiknya aktif
const SUGGESTIONS = Object.freeze({
  karyawan: [['Apa rencana belajar saya?', 'rencanaSaya'], ['Ada undangan wawancara?', 'undanganSaya'], ['Bagaimana hasil kompetensi saya?', 'kompetensiSaya']],
  atasan: [['Bagaimana status wawancara tim saya?', 'wawancaraTim'], ['Gap terbesar tim saya apa?', 'gapTim']],
  hr: [['Apa yang perlu saya lakukan hari ini?', 'tinjauan'], ['Gap terbesar apa?', 'gap'], ['Berapa temuan yang menunggu tinjauan?', 'tinjauan']],
});

function assistantRouter({ stores, flags, entitlements, settings, audit, ai, aiConfig = {} }) {
  const r = express.Router();
  r.use(requireFlag(flags, FLAGS.ASSISTANT, 'Asisten ELGOS belum diaktifkan untuk organisasi Anda'));

  const viewOf = (req, asked) => resolveView(req.user.role, asked);
  const builders = (req, view) => activeBuilders({
    view,
    active: (key) => submoduleActive({ entitlements, flags }, req.tenantId, key),
    flagOn: (flag) => flags.isEnabled(req.tenantId, flag),
  });
  const suggestionsFor = (view, active) => (SUGGESTIONS[view] || []).filter(([, key]) => active.some((b) => b.key === key)).map(([text]) => text);

  r.get('/', wrap(async (req, res) => {
    const v = viewOf(req, req.query.view);
    const active = await builders(req, v.view);
    res.json({
      data: {
        ...v,
        greeting: `Halo, saya Asisten ELGOS. Tanyakan apa pun tentang urusan Anda sebagai ${v.roleLabel} di sini.`,
        suggestions: suggestionsFor(v.view, active),
        disclaimer: `Hanya menjawab dari data yang boleh Anda lihat sebagai ${v.roleLabel}. Jawaban dicatat di log audit.`,
      },
    });
  }));

  /**
   * Cakupan data per tampilan. karyawan = hanya dirinya (juga untuk HR/atasan yang memilih tampilan ini);
   * atasan dan hr = visibleEmployeeScope() (RG-3). team = anggota dalam cakupan selain dirinya (tampilan atasan).
   */
  async function scopeOf(req, view) {
    if (view === 'karyawan') return { scope: { userIds: [req.user.id] }, team: [] };
    const scope = await scopeFor(req, stores.people);
    if (view !== 'atasan') return { scope, team: [] };
    const ids = (scope.userIds || []).filter((id) => id !== req.user.id);
    return { scope: { userIds: ids }, team: ids.length ? await stores.people.list(req.tenantId, { userIds: ids }) : [] };
  }

  async function recordUsage(req, usage) {
    if (!stores.aiUsage || !usage) return;
    for (const u of usage) {
      try {
        await stores.aiUsage.record(req.tenantId, {
          userId: req.user.id, submodule: 'assistant', operation: u.operation, provider: u.provider, model: u.model,
          inputTokens: u.inputTokens, outputTokens: u.outputTokens, latencyMs: u.latencyMs, costUsd: estimateCost(u, aiConfig),
        });
      } catch (e) {
        console.error('Gagal mencatat pemakaian AI asisten:', e.message);
      }
    }
  }

  r.post('/ask', wrap(async (req, res) => {
    const { question: rawQuestion, view: askedView } = req.body || {};
    const question = typeof rawQuestion === 'string' ? rawQuestion.trim() : '';
    if (!question || question.length > MAX_QUESTION) throw badRequest(`Pertanyaan wajib diisi, maksimal ${MAX_QUESTION} karakter`);
    const v = viewOf(req, askedView);

    const log = await stores.assistant.begin(req.tenantId, { userId: req.user.id, view: v.view, question, limit: RATE_LIMIT, windowMinutes: RATE_WINDOW_MINUTES });
    if (!log) throw new HttpError(429, 'RATE_LIMITED', 'Terlalu banyak pertanyaan. Coba lagi beberapa menit lagi.');

    try {
      const aliases = createAliases();
      const { scope, team } = await scopeOf(req, v.view);
      let result;
      if (v.view === 'karyawan' && mentionsOthers(question)) {
        result = { answer: REFUSAL, page: null, outcome: 'refused', factKeys: [], userIds: [] };
      } else {
        const active = await builders(req, v.view);
        const conf = await settings.get(req.tenantId);
        const { facts, factKeys, pages } = await buildFacts(active, {
          stores, flags, settings, tenantId: req.tenantId, user: req.user, scope, conf, team, alias: aliases.alias,
        });
        let reply;
        try {
          reply = await ai.assistantReply({ view: v.view, roleLabel: v.roleLabel, facts, pages, question });
        } catch (e) {
          await recordUsage(req, e.usage);
          throw e;
        }
        await recordUsage(req, reply.usage);
        const page = reply.page && pages.some((p) => p.key === reply.page) ? reply.page : null;
        if (reply.refused) {
          const restored = reply.answer ? restoreNames(reply.answer, aliases) : { text: REFUSAL, userIds: [] };
          result = { answer: restored.text.slice(0, MAX_ASSISTANT_ANSWER), page: null, outcome: 'refused', factKeys, userIds: restored.userIds };
        } else if (!reply.answer) {
          const sug = suggestionsFor(v.view, active).slice(0, 2).map((s) => `"${s}"`).join(' atau ');
          result = {
            answer: `Saya belum menemukan jawaban pasti. Coba tanyakan, misalnya: ${sug || '"Apa yang bisa Anda bantu?"'}. Hal di luar hak akses peran Anda tidak bisa saya tampilkan.`,
            page: null, outcome: 'no_answer', factKeys, userIds: [],
          };
        } else {
          const restored = restoreNames(reply.answer, aliases);
          result = { answer: restored.text.slice(0, MAX_ASSISTANT_ANSWER), page, outcome: 'answered', factKeys, userIds: restored.userIds };
        }
        result.pages = pages;
      }

      // Audit dulu (fail closed), baru log diperbarui. Siapa yang datanya ikut terbaca:
      // karyawan = dirinya; atasan = seluruh tim (angka tim kecil setara data individu); hr = orang yang punya kode samaran.
      let employeeIds;
      if (v.view === 'karyawan') employeeIds = [req.user.id];
      else if (v.view === 'atasan') employeeIds = team.map((m) => m.id);
      else employeeIds = [...new Set([...aliases.userIds(), ...result.userIds])];
      await audit.record(req, 'read', 'assistant.answer', {
        logId: log.id, view: v.view, outcome: result.outcome, page: result.page, factKeys: result.factKeys,
        employeeIds, self: employeeIds.length === 1 && employeeIds[0] === req.user.id,
      });
      await stores.assistant.finish(req.tenantId, log.id, result);

      const label = result.page && (result.pages || []).find((p) => p.key === result.page);
      res.json({ data: { answer: result.answer, action: label ? { page: label.key, label: label.label } : null, outcome: result.outcome } });
    } catch (e) {
      await stores.assistant.fail(req.tenantId, log.id).catch((err) => console.error('Gagal menandai log asisten:', err.message));
      throw e;
    }
  }));

  return r;
}

module.exports = { assistantRouter, RATE_LIMIT, RATE_WINDOW_MINUTES };
