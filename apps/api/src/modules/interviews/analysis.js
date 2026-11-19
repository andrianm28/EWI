'use strict';
// PK-14 / PD-13 ★A: analisis hasil wawancara sebagai job terpisah yang aman diulang.
// - Satu job per sesi (unik di DB). Sesi ditutup dulu, lalu job berjalan di latar.
// - Job diklaim dengan update bersyarat (status + lease), jadi dua pekerja atau dua permintaan tidak bisa
//   menjalankan job yang sama bersamaan. Hasil disimpan dalam satu transaksi bersama penandaan job selesai.
// - Model dinilai dua kali. Kesepakatan kedua penilaian menjadi dasar angka keyakinan.
// - Temuan TNA disimpan sebagai draf dan baru terlihat setelah direview HR (PD-14 ★A, PM-5 ★A).
const { buildContext, aiContext, callAi } = require('./ai-calls');

const DEFAULT_CONFIDENCE = 0.5;
const round3 = (n) => Math.round(n * 1000) / 1000;
const clamp01 = (n) => Math.min(1, Math.max(0, n));
const confOf = (x) => (typeof x.confidence === 'number' && Number.isFinite(x.confidence) ? clamp01(x.confidence) : DEFAULT_CONFIDENCE);

/**
 * Gabungkan dua kali penilaian. Hasil penilaian pertama dipakai; yang tidak muncul lagi di penilaian kedua
 * diberi keyakinan setengahnya. Yang hanya muncul di penilaian kedua tidak disimpan (dihitung untuk pemantauan).
 * keyOf menentukan kapan dua hasil dianggap sama.
 */
function combineRuns(first, second, keyOf, sameValue = () => true) {
  const pool = new Map();
  for (const x of second) {
    const k = keyOf(x);
    if (!pool.has(k)) pool.set(k, []);
    pool.get(k).push(x);
  }
  const items = first.map((x) => {
    const bucket = pool.get(keyOf(x));
    const match = bucket && bucket.length ? bucket.shift() : null;
    const agree = Boolean(match) && sameValue(x, match);
    const confidence = round3(agree ? (confOf(x) + confOf(match)) / 2 : confOf(x) / 2);
    return { ...x, confidence, agreement: agree };
  });
  const onlySecond = [...pool.values()].reduce((n, arr) => n + arr.length, 0);
  return { items, onlySecond };
}

const findingKey = (f) => [f.category, f.competencyId || '', f.performanceRecordId || ''].join('|');
const combineTnaFindings = (a, b) => combineRuns(a, b, findingKey);
const combineAssessments = (a, b) => combineRuns(a, b, (r) => r.competencyId, (x, y) => Math.abs(x.score - y.score) <= 0);

/**
 * stores: interviews, people, dna, tna, aiUsage, analysis.
 * Pemanggil (route) memakai enqueue + kick; server dan skrip memakai sweep untuk job yang tertinggal atau gagal.
 */
function createAnalysisRunner({ stores, ai, aiConfig = {}, logger = console, maxAttempts = 3, leaseSeconds = 600 }) {
  const inflight = new Set();

  /** Kompetensi/target yang sudah tidak ada di tenant ini dilepas dari temuan, supaya FK tidak menggagalkan job. */
  async function dropMissingLinks(tenantId, items) {
    const compIds = [...new Set(items.map((f) => f.competencyId).filter(Boolean))];
    const recIds = [...new Set(items.map((f) => f.performanceRecordId).filter(Boolean))];
    if (!compIds.length && !recIds.length) return items;
    const comps = new Set(compIds.length ? await stores.dna.existingCompetencyIds(tenantId, compIds) : compIds);
    const recs = new Set(recIds.length ? (await stores.tna.performanceByIds(tenantId, recIds)).map((r) => r.id) : []);
    return items.map((f) => ({
      ...f,
      competencyId: f.competencyId && comps.has(f.competencyId) ? f.competencyId : null,
      performanceRecordId: f.performanceRecordId && recs.has(f.performanceRecordId) ? f.performanceRecordId : null,
    }));
  }

  async function analyze(job, session) {
    const { tenantId } = job;
    const transcript = await stores.interviews.turns(tenantId, session.id);
    const safe = aiContext(await buildContext(stores, tenantId, session), session);
    const env = { stores, aiConfig, tenantId, session };
    if (session.submodule === 'dna') {
      const call = (pass) => callAi(env, () => ai.assessCompetencies({ transcript, competencies: safe.competencies, pass }));
      const r1 = await call(1);
      const r2 = await call(2);
      const { items, onlySecond } = combineAssessments(r1.results, r2.results);
      return stores.analysis.saveDna(tenantId, job, session, items, { onlySecond });
    }
    const call = (pass) => callAi(env, () => ai.analyzeTna({ transcript, triggers: safe.triggers, competencies: safe.competencies, pass }));
    // B6 (A8): ringkasan yang dikonfirmasi karyawan adalah penilaian pertama, jadi temuan yang sampai ke HR
    // sama dengan yang dilihat karyawan. Model hanya dipanggil untuk penilaian kedua.
    const confirmed = await stores.interviews.summaryForAnalysis(tenantId, session.id);
    const first = confirmed || (await call(1)).findings;
    const r2 = await call(2);
    const { items, onlySecond } = combineTnaFindings(first, r2.findings);
    return stores.analysis.saveTna(tenantId, job, session, await dropMissingLinks(tenantId, items), { onlySecond });
  }

  /** Jalankan satu job bila bisa diklaim. Aman dipanggil berulang: job selesai atau sedang berjalan dilewati. */
  async function processJob(tenantId, jobId) {
    const job = await stores.analysis.claim(tenantId, jobId, { maxAttempts, leaseSeconds });
    if (!job) return { skipped: true };
    try {
      const session = await stores.interviews.get(tenantId, job.sessionId);
      if (!session) throw Object.assign(new Error('Sesi tidak ditemukan'), { code: 'SESSION_MISSING' });
      const saved = await analyze(job, session);
      return saved || { skipped: true };
    } catch (e) {
      // Hanya kode galat yang disimpan; pesan bisa memuat potongan data.
      const code = String(e.code || 'ANALYSIS_FAILED').slice(0, 64);
      await stores.analysis.fail(tenantId, job, { code, retryInSeconds: 60 * job.attempts, final: job.attempts >= maxAttempts });
      logger.error(`Analisis wawancara gagal (job ${job.id}, percobaan ${job.attempts}): ${code}`);
      return { failed: true, code };
    }
  }

  /** Jalankan di latar tanpa menahan respons. drain() menunggu semuanya (dipakai test dan saat berhenti). */
  function kick(tenantId, jobId) {
    const p = processJob(tenantId, jobId)
      .catch((e) => logger.error(`Analisis wawancara gagal: ${e.code || e.name}`))
      .finally(() => inflight.delete(p));
    inflight.add(p);
    return p;
  }

  async function drain() {
    while (inflight.size) await Promise.allSettled([...inflight]);
  }

  /** Ambil job yang masih antre, lease-nya habis, atau gagal dan masih boleh diulang, lalu jalankan. */
  async function sweep({ limit = 20 } = {}) {
    const jobs = await stores.analysis.pending({ maxAttempts, limit });
    let ran = 0;
    for (const j of jobs) {
      const out = await processJob(j.tenantId, j.id);
      if (!out.skipped) ran += 1;
    }
    return ran;
  }

  return { processJob, kick, drain, sweep, maxAttempts };
}

module.exports = { createAnalysisRunner, combineRuns, combineTnaFindings, combineAssessments, findingKey };
