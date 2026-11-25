'use strict';
// Kesiapan karyawan terhadap persyaratan kompetensi inti (visi, misi) dan indikator perilaku (nilai korporasi).
// Rumus mengikuti mockup final 19 Nov: kesiapan = jumlah aktual / jumlah target; gap <= toleransi = dalam batas.

/** Ambang gap "Dalam batas" (poin, skala 0-100). Berasal dari mockup; belum ada keputusan bisnis. */
const GAP_TOLERANCE = 8;

const GROUP_KINDS = Object.freeze({ vm: ['vision', 'mission'], values: ['value'] });

const measured = (r) => r.actualScore !== null && r.actualScore !== undefined;
const num = (x) => Number(x);

/** Persyaratan -> baris layar dengan gap dan klasifikasi. */
function decorate(r) {
  if (!measured(r)) return { ...r, actualScore: null, targetScore: num(r.targetScore), gap: null, classification: 'belum_diukur' };
  const gap = Math.max(0, num(r.targetScore) - num(r.actualScore));
  return { ...r, targetScore: num(r.targetScore), actualScore: num(r.actualScore), gap, classification: gap <= GAP_TOLERANCE ? 'dalam_batas' : 'perlu_ditinjau' };
}

/** Persen kesiapan atas baris terukur, atau null bila belum ada yang terukur. */
function readiness(rows) {
  const m = rows.filter(measured);
  const target = m.reduce((s, r) => s + num(r.targetScore), 0);
  if (!m.length || target <= 0) return null;
  // aktual di atas target dijepit ke target supaya kelebihan satu baris tidak menutupi gap baris lain
  return Math.round((m.reduce((s, r) => s + Math.min(num(r.actualScore), num(r.targetScore)), 0) / target) * 100);
}

/**
 * sources: [{ id, kind, title, text, sourceRef, requirements: [...] }] (hanya sumber aktif).
 * group: 'vm' (visi + misi) atau 'values' (nilai korporasi).
 */
function buildOverview(sources, group) {
  const kinds = Object.prototype.hasOwnProperty.call(GROUP_KINDS, group) ? GROUP_KINDS[group] : null;
  if (!kinds) throw new Error(`Grup tidak dikenal: ${group}`);
  const groups = sources.filter((s) => kinds.includes(s.kind)).map((s) => {
    const rows = (s.requirements || []).filter((r) => r.status !== 'rejected').map(decorate);
    return { id: s.id, kind: s.kind, title: s.title, text: s.text ?? null, sourceRef: s.sourceRef ?? null, readiness: readiness(rows), rows };
  });
  const all = groups.flatMap((g) => g.rows);
  const withGap = all.filter((r) => r.gap !== null);
  const biggest = withGap.reduce((best, r) => (!best || r.gap > best.gap ? r : best), null);
  const kpis = {
    readiness: readiness(all),
    biggestGap: biggest && biggest.gap > 0 ? { name: biggest.name, gap: biggest.gap } : null,
    belowTarget: { count: withGap.filter((r) => r.gap > GAP_TOLERANCE).length, measured: withGap.length, total: all.length },
    pendingValidation: all.filter((r) => r.status === 'draft').length,
  };
  if (group === 'values') {
    const ranked = groups.filter((g) => g.readiness !== null).sort((a, b) => a.readiness - b.readiness);
    kpis.weakestSource = ranked.length ? { title: ranked[0].title, readiness: ranked[0].readiness } : null;
  }
  return { kpis, groups };
}

module.exports = { GAP_TOLERANCE, GROUP_KINDS, decorate, readiness, buildOverview };
