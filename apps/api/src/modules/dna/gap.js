'use strict';
// RG-1: gap individu terhadap kompetensi jabatan pada jenjangnya. Skala skor 0-4.

/**
 * competencies: [{ id, name, kind, requiredScore }]
 * assessments:  [{ competencyId, score, createdAt }] (boleh berisi riwayat; yang terbaru dipakai)
 */
function computeGap({ competencies, assessments }) {
  const latest = new Map();
  for (const a of assessments) {
    const prev = latest.get(a.competencyId);
    if (!prev || new Date(a.createdAt) > new Date(prev.createdAt)) latest.set(a.competencyId, a);
  }
  const items = competencies.map((c) => {
    const a = latest.get(c.id);
    const required = c.requiredScore ?? 3;
    if (!a) return { competencyId: c.id, name: c.name, kind: c.kind, required, score: null, gap: null, status: 'not_assessed' };
    const gap = Math.max(0, required - a.score);
    return { competencyId: c.id, name: c.name, kind: c.kind, required, score: a.score, gap, status: gap > 0 ? 'gap' : 'met' };
  });
  const assessed = items.filter((i) => i.status !== 'not_assessed');
  const met = assessed.filter((i) => i.status === 'met').length;
  return {
    items,
    summary: {
      total: items.length,
      assessed: assessed.length,
      met,
      gaps: assessed.length - met,
      readiness: assessed.length ? Math.round((met / items.length) * 100) : null,
    },
  };
}

module.exports = { computeGap };
