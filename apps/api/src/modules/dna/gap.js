'use strict';
// RG-1: gap individu terhadap kompetensi jabatan pada jenjangnya. Skala skor 0-4.

/**
 * competencies: [{ id, name, kind, requiredScore }]
 * assessments:  [{ competencyId, score, source?, assessedAt?, createdAt }] (boleh berisi riwayat; yang terbaru dipakai).
 *   assessedAt = tanggal wawancara manual (hasil impor); bila kosong dipakai createdAt.
 */
const when = (a) => new Date(a.assessedAt || a.createdAt).getTime();
/** Skor minimal bila kompetensi tidak menyebutkannya (skala 0-4). Dipakai juga B4 (A3). */
const DEFAULT_TARGET = 3;

const created = (a) => new Date(a.createdAt).getTime() || 0;
/**
 * Asesmen terbaru per kompetensi. Tanggal asesmen sama (mis. impor koreksi dengan tanggal yang sama):
 * yang dibuat paling akhir menang; masih sama = baris terakhir (store mengurutkan created_at, id). Dipakai juga B4 (A2).
 */
function latestByCompetency(assessments) {
  const latest = new Map();
  for (const a of assessments) {
    const prev = latest.get(a.competencyId);
    if (!prev || when(a) > when(prev) || (when(a) === when(prev) && created(a) >= created(prev))) latest.set(a.competencyId, a);
  }
  return latest;
}

function computeGap({ competencies, assessments }) {
  const latest = latestByCompetency(assessments);
  const items = competencies.map((c) => {
    const a = latest.get(c.id);
    const required = c.requiredScore ?? DEFAULT_TARGET;
    if (!a) return { competencyId: c.id, name: c.name, kind: c.kind, required, score: null, gap: null, status: 'not_assessed' };
    const gap = Math.max(0, required - a.score);
    return { competencyId: c.id, name: c.name, kind: c.kind, required, score: a.score, gap, status: gap > 0 ? 'gap' : 'met', source: a.source || null };
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

module.exports = { computeGap, latestByCompetency, DEFAULT_TARGET };
