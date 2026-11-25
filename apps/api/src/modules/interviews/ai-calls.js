'use strict';
// Konteks dan pencatatan pemakaian AI yang dipakai bersama oleh pertanyaan wawancara (index.js)
// dan job analisis (analysis.js). Setiap panggilan model dicatat di ai_usage_logs (R3-6).
const { estimateCost } = require('../../ai');
const { AiError } = require('../../ai/errors');
const { HttpError } = require('../../core/errors');

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
  // B6 (A10, D5): sesi yang ditugaskan untuk gap kompetensi atau OKR membawa topiknya. Hanya label, bukan data orang.
  const focus = ['competency', 'okr'].includes(session.focusKind) && session.focusLabel ? { kind: session.focusKind, label: session.focusLabel } : null;
  return { competencies, triggers, focus };
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

/**
 * callAi untuk wawancara di luar mesin B6 (B10 CCA, B15 LIM): galat penyedia menjadi 502 AI_UNAVAILABLE dengan pesan
 * umum (detail teknis hanya di log); galat lain diteruskan apa adanya.
 */
async function callAiOr502(env, fn, label) {
  try {
    return await callAi(env, fn);
  } catch (e) {
    if (!(e instanceof AiError)) throw e;
    console.error(`AI ${label} gagal:`, e.code, e.message);
    throw new HttpError(502, 'AI_UNAVAILABLE', 'Asisten AI sedang tidak bisa dihubungi. Coba lagi beberapa saat lagi.');
  }
}

module.exports = {
  callAiOr502, buildContext, aiContext, recordUsage, callAi };
