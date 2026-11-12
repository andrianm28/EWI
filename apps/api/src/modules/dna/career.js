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

module.exports = { careerStatus };
