'use strict';
// B4 Developmental Needs: tahap pengembangan Basic/Intermediate/Advanced (BIA) dan rencana per pegawai.
// Fungsi murni; aturan A2-A7 di docs/designs/b4-developmental-needs.md. Skor dan target mengikuti skala kamus (Q12: 0-4).

const TIERS = ['basic', 'intermediate', 'advanced'];
const STAGES = [...TIERS, 'done', 'not_assessed'];
const TIER_LABEL = { basic: 'Basic', intermediate: 'Intermediate', advanced: 'Advanced' };

const when = (a) => new Date(a.assessedAt || a.createdAt).getTime();

/** Asesmen terbaru per kompetensi (A2), sama dengan computeGap. */
function latestByCompetency(assessments) {
  const latest = new Map();
  for (const a of assessments) {
    const prev = latest.get(a.competencyId);
    if (!prev || when(a) >= when(prev)) latest.set(a.competencyId, a);
  }
  return latest;
}

function mastery(score, target) {
  if (score == null) return null;
  // Skala 0-4 (Q12): selisih tingkat, bukan rasio (A3)
  if (score >= target) return 'mastered';
  return target - score === 1 ? 'partial' : 'not_yet';
}

function advice(stage, focus) {
  if (stage === 'not_assessed') return 'Belum ada hasil asesmen untuk pegawai ini.';
  if (stage === 'done') return 'Semua modul yang dinilai tercapai. Pertimbangkan peran mentor dan pemetaan ke jenjang karier.';
  const tier = TIER_LABEL[stage];
  return `Fokus pada modul ${tier} yang belum tercapai: ${focus.join(', ')}. Modul level berikutnya dibuka setelah semua modul ${tier} tercapai.`;
}

/**
 * competencies: kompetensi jabatan pegawai [{ id, code, name, stream, programTier, requiredScore }];
 *   yang tanpa programTier diabaikan (A4).
 * assessments: asesmen pegawai itu (boleh berisi riwayat).
 */
function developmentPlan({ competencies, assessments }) {
  const latest = latestByCompetency(assessments);
  const untiered = competencies.filter((c) => !TIERS.includes(c.programTier)).length;
  const rows = competencies.filter((c) => TIERS.includes(c.programTier)).map((c) => {
    const a = latest.get(c.id);
    const target = c.requiredScore ?? 3;
    const score = a ? a.score : null;
    return { competencyId: c.id, code: c.code || null, name: c.name, stream: c.stream || null, tier: c.programTier, score, target, below: score != null && score < target };
  });
  const assessed = rows.filter((r) => r.score != null);
  const lowest = TIERS.find((t) => rows.some((r) => r.tier === t && r.below));
  const stage = lowest || (assessed.length ? 'done' : 'not_assessed');
  const rank = TIERS.indexOf(stage); // -1 untuk done/not_assessed: tidak ada modul di bawah target

  const status = (r) => {
    if (r.score == null) return 'not_assessed';
    if (!r.below) return 'met';
    return TIERS.indexOf(r.tier) > rank ? 'locked' : 'develop';
  };
  const modules = rows.map((row) => {
    const { competencyId, code, name, stream, tier, score, target } = row;
    return { tier, module: { competencyId, code, name, stream, score, target, status: status(row), mastery: mastery(score, target) } };
  });
  const focus = modules.filter((m) => m.tier === stage && m.module.status === 'develop').map((m) => m.module.code || m.module.name);
  return {
    stage,
    met: assessed.filter((r) => !r.below).length,
    assessed: assessed.length,
    total: rows.length,
    untiered,
    focus,
    advice: advice(stage, focus),
    tiers: TIERS.map((tier) => ({ tier, modules: modules.filter((m) => m.tier === tier).map((m) => m.module) })),
  };
}

/** stages: tahap tiap pegawai dalam scope. Selalu lima baris berurutan. */
function stageDistribution(stages) {
  const total = stages.length;
  return STAGES.map((stage) => {
    const count = stages.filter((s) => s === stage).length;
    return { stage, count, percent: total ? Math.round((count / total) * 100) : 0 };
  });
}

/** A7: status kamus satu jabatan. competencies = kompetensi jabatan (kind 'job') jabatan itu. */
function dictionaryStatus({ jobFunctions, competencies }) {
  const approvedCount = competencies.filter((c) => c.approvedAt).length;
  return {
    status: competencies.length ? 'available' : 'none',
    tool1: jobFunctions.length > 0,
    tool2: competencies.length > 0,
    tool3: competencies.some((c) => TIERS.includes(c.programTier)),
    competencyCount: competencies.length,
    approvedCount,
    approved: competencies.length > 0 && approvedCount === competencies.length,
  };
}

module.exports = { TIERS, STAGES, TIER_LABEL, developmentPlan, stageDistribution, dictionaryStatus };
