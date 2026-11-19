'use strict';
// RG-1 + rapat 10 Nov: jenjang karier (mis. probation -> junior -> senior -> leader) dengan syarat program
// per jenjang (Basic / Intermediate / Advanced). Jumlah & nama jenjang adalah konfigurasi per klien (RG-1g).

/**
 * levels: [{ id, name, levelOrder, requiredProgramTier }]
 * completions: [{ programTier, status }]
 */
function careerStatus({ levels, currentLevelId, completions }) {
  const sorted = [...levels].sort((a, b) => a.levelOrder - b.levelOrder);
  const idx = sorted.findIndex((l) => l.id === currentLevelId);
  const current = idx >= 0 ? sorted[idx] : null;
  const next = idx >= 0 ? sorted[idx + 1] || null : null;
  const passed = new Set(completions.filter((c) => c.status === 'passed').map((c) => c.programTier));
  const tierPassed = (lvl) => (lvl && lvl.requiredProgramTier ? passed.has(lvl.requiredProgramTier) : null);

  const currentTierPassed = tierPassed(current);
  const nextTierPassed = tierPassed(next);
  return {
    currentLevel: current ? { id: current.id, name: current.name, requiredProgramTier: current.requiredProgramTier } : null,
    nextLevel: next ? { id: next.id, name: next.name, requiredProgramTier: next.requiredProgramTier } : null,
    currentTierPassed,
    nextTierPassed,
    // Kandidat promosi: sudah lulus program jenjang berikutnya padahal jabatannya masih di bawah.
    // Saran saja; keputusan promosi tetap di HR.
    promotionCandidate: Boolean(next && currentTierPassed !== false && nextTierPassed === true),
    // Belum lulus program jenjangnya sendiri (mis. probation belum lulus Basic)
    behindCurrentLevel: currentTierPassed === false,
  };
}

// --- B16 Career & Promotion (docs/designs/b16-career-promotion.md) ---

const round2 = (n) => Math.round(n * 100) / 100;
const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/** C2: nilai 0-100 satu baris kinerja, atau null bila tidak bisa dihitung. */
function recordScore(r) {
  if (r.valueType === 'biner' || r.valueType === 'tenggat') return r.isMet ? 100 : 0;
  const target = num(r.target); const actual = num(r.actual);
  if (target === null || actual === null || target < 0 || actual < 0) return null;
  let pct;
  if (r.direction === 'lower') pct = actual <= 0 ? 100 : (target / actual) * 100;
  else { if (target <= 0) return null; pct = (actual / target) * 100; }
  return Math.max(0, Math.min(100, pct));
}

/**
 * C2: pencapaian OKR satu karyawan dari baris kinerjanya.
 * records: [{ metricType, name, target, actual, direction, valueType, isMet, period, createdAt }]
 * -> { achievement (dua desimal), period, count } | null
 */
function okrAchievement(records, metricTypes = ['okr']) {
  const rows = records.filter((r) => metricTypes.includes(r.metricType));
  const periods = rows.map((r) => r.period).filter(Boolean).sort();
  const period = periods.length ? periods[periods.length - 1] : null;
  const latest = new Map(); // nama metrik -> baris terbaru (impor ulang tidak menggandakan)
  for (const r of rows.filter((x) => (x.period || null) === period)) {
    const key = String(r.name || '').trim().toLowerCase();
    const prev = latest.get(key);
    if (!prev || new Date(r.createdAt).getTime() >= new Date(prev.createdAt).getTime()) latest.set(key, r);
  }
  const scores = [...latest.values()].map(recordScore).filter((x) => x !== null);
  if (!scores.length) return null;
  return { achievement: round2(scores.reduce((a, b) => a + b, 0) / scores.length), period, count: scores.length };
}

/** C3-C5: status jenjang. career = hasil careerStatus(); okr = hasil okrAchievement() atau null. */
function careerState({ career, hasPosition, hasDictionary, okr, okrMin }) {
  const next = career.nextLevel;
  const programPassed = Boolean(next && career.currentTierPassed !== false && career.nextTierPassed === true);
  const achievement = okr ? okr.achievement : null;
  const eligible = programPassed && achievement !== null && achievement >= okrMin;
  let status;
  if (!hasPosition || !career.currentLevel || !hasDictionary) status = 'no_path';
  else if (career.currentTierPassed === false) status = 'below_current';
  else if (!next) status = 'top_level';
  else if (!next.requiredProgramTier) status = 'next_no_requirement';
  else if (eligible) status = 'eligible';
  else if (programPassed) status = achievement === null ? 'program_passed_no_okr' : 'program_passed_okr_low';
  else status = 'on_track';
  const ok = status !== 'no_path';
  return { status, eligible: ok && eligible, candidate: ok && programPassed };
}

/**
 * C9: siklus keputusan yang berlaku untuk (jenjang sekarang -> jenjang berikutnya). decisions = baris milik satu karyawan.
 * Baris dengan jenjang asal/tujuan lain (posisi sudah berubah) diabaikan.
 */
function findCycle(decisions, fromLevelId, toLevelId) {
  if (!toLevelId) return { open: null, approved: null, latest: null };
  const byNewest = (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  const toNext = decisions.filter((d) => d.toLevelId === toLevelId).sort(byNewest);
  const approved = toNext.find((d) => d.hrDecision === 'approved') || null;
  const matching = toNext.filter((d) => d.fromLevelId === fromLevelId);
  const open = matching.find((d) => !d.hrDecision) || null;
  return { open, approved, latest: approved || open || matching[0] || null };
}

function decisionState(cycle) {
  if (cycle.approved) return 'approved';
  if (cycle.open) return cycle.open.supervisorDecision === 'recommend' ? 'supervisor_recommend' : 'supervisor_hold';
  return cycle.latest ? 'hold' : 'none';
}

/** C6, C7, C10: tindakan yang boleh dilakukan pemanggil untuk satu karyawan. */
function decisionView({ viewer, employee, eligible, cycle }) {
  const blocked = (blockedReason) => ({ actions: [], blockedReason });
  if (viewer.role === 'eta_admin') return blocked('view_only');
  if (cycle.approved) return blocked('approved');
  const hasSupervisor = Boolean(employee.supervisorId) && employee.supervisorRole === 'supervisor';
  if (viewer.role === 'supervisor' && viewer.id === employee.supervisorId) {
    return eligible ? { actions: ['recommend', 'hold'], blockedReason: null } : blocked('not_eligible');
  }
  if (viewer.role === 'hr_admin') {
    if (cycle.open) {
      const approve = eligible && cycle.open.supervisorDecision === 'recommend';
      return { actions: approve ? ['approve', 'hold'] : ['hold'], blockedReason: null };
    }
    if (!eligible) return blocked('not_eligible');
    if (!hasSupervisor) return blocked('no_supervisor');
    return blocked(cycle.latest ? 'held' : 'waiting_supervisor');
  }
  return blocked('view_only');
}

module.exports = { careerStatus, okrAchievement, careerState, findCycle, decisionState, decisionView };
