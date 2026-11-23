'use strict';
// B15 tahap 3: aturan murni wawancara ulang AI (tanpa DB). Spek: docs/designs/b15-impact-measurement.md bagian 12.
// Benchmark, keyakinan, dan rekomendasi dihitung aturan (generatedBy 'rules'), bukan model.

const MAX_COMPETENCIES = 4;
const MAX_TURNS = 2 * (2 * MAX_COMPETENCIES + 1); // pertanyaan + jawaban
const GAP_THRESHOLD = 10; // ⚠️ dari mockup (gapRei > 10, gapPerf > 10)
const present = (v) => v !== null && v !== undefined;

/** Kompetensi yang ikut satu wawancara: urut nama, paling banyak MAX_COMPETENCIES (T-2). */
function snapshot(pairs) {
  return [...pairs].sort((a, b) => a.name.localeCompare(b.name, 'id')).slice(0, MAX_COMPETENCIES);
}

/** Urutan pertanyaan (T-4): scenario + verify per kompetensi, lalu satu apply. */
function questionPlan(competencyIds) {
  return [
    ...competencyIds.flatMap((id) => [{ kind: 'scenario', competencyId: id }, { kind: 'verify', competencyId: id }]),
    { kind: 'apply', competencyId: null },
  ];
}

/** Jumlah pertanyaan untuk n kompetensi (T-4). */
const questionCount = (n) => 2 * n + 1;

const gap = (a, b) => (present(a) && present(b) ? a - b : null);
const RECS = {
  retention: (name) => `Jadwalkan penguatan ${name} dan ulangi wawancara dalam 4 pekan.`,
  application: 'Buka tindakan perbaikan di Improvement Needs untuk hambatan non-pelatihan.',
  next: 'Lanjutkan ke kompetensi berikutnya dalam jalur belajar.',
  indicator: (name) => `Lengkapi data ${name} agar tingkat hasil bisnis lengkap.`,
};

/**
 * Hasil satu karyawan (T-7).
 * competencies: [{ competencyId, name, post, reinterview, performance }] (urutan dipertahankan)
 * indicators: [{ name, level, baseline, current }]
 * Return { benchmark: [{ ..., retention, application }], confidence: 'low'|'medium'|'high', recommendations: [teks] }
 */
function employeeResult({ competencies, indicators }) {
  const benchmark = competencies.map((c) => {
    const r = gap(c.post, c.reinterview); const a = gap(c.reinterview, c.performance);
    return {
      ...c,
      retention: r === null ? 'missing' : r > GAP_THRESHOLD ? 'retention_drop' : 'confirmed',
      application: a === null ? 'missing' : a > GAP_THRESHOLD ? 'application_gap' : 'applied',
    };
  });
  const findings = benchmark.flatMap((b) => [b.retention, b.application]);
  // urutan menang Rendah > Sedang > Tinggi (triase 12.7 #8)
  let confidence = 'high';
  if (findings.includes('missing')) confidence = 'low';
  else if (findings.some((f) => f === 'retention_drop' || f === 'application_gap')) confidence = 'medium';

  const recs = [];
  const add = (t) => { if (!recs.includes(t)) recs.push(t); };
  for (const b of benchmark) {
    if (b.retention === 'retention_drop') add(RECS.retention(b.name));
    if (b.application === 'application_gap') add(RECS.application);
    if (b.retention !== 'retention_drop' && b.application !== 'application_gap') add(RECS.next);
  }
  for (const i of indicators) if (i.level === 'business' && !(present(i.baseline) && present(i.current))) add(RECS.indicator(i.name));
  return { benchmark, confidence, recommendations: recs };
}

module.exports = { MAX_COMPETENCIES, MAX_TURNS, GAP_THRESHOLD, snapshot, questionPlan, questionCount, employeeResult };
