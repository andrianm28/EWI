'use strict';
// B13 Learning Intervention: aturan murni (tanpa DB). Spek: docs/designs/b13-learning-intervention.md §4.

const LEVELS = Object.freeze(['basic', 'intermediate', 'advanced']);
const ITEM_KINDS = Object.freeze(['K', 'S', 'A']);
const REQUEST_FLOW = Object.freeze(['requested', 'confirmed', 'delivered', 'installed']);
/** Semua status permintaan vendor yang sah (alur maju + batal). */
const REQUEST_STATUSES = Object.freeze([...REQUEST_FLOW, 'cancelled']);
const PARETO_CUTOFF = 0.8;

/**
 * Status sumber modul. request = permintaan vendor terbaru yang tidak batal; draft = draf ELGOS modul itu.
 * Return { key: none|requested|confirmed|delivered|dev_draft|dev_review|dev_approved|available, via: vendor|elgos|catalog|null }.
 * Rancangan yang disetujui SME (dev_approved) belum 'available': modul baru tersedia setelah ditautkan ke course katalog.
 */
function moduleStatus({ request, draft, catalogItemId } = {}) {
  const req = request && request.status !== 'cancelled' ? request : null;
  if (catalogItemId) return { key: 'available', via: 'catalog' };
  if (req && req.status === 'installed') return { key: 'available', via: 'vendor' };
  if (draft && draft.status === 'approved') return { key: 'dev_approved', via: 'elgos' };
  if (draft && draft.status === 'sme_review') return { key: 'dev_review', via: 'elgos' };
  if (draft) return { key: 'dev_draft', via: 'elgos' };
  if (req) return { key: req.status, via: 'vendor' };
  return { key: 'none', via: null };
}

/** Status berikutnya yang sah untuk permintaan vendor: maju satu langkah, atau batal sebelum terpasang. */
function nextRequestStatuses(current) {
  const i = REQUEST_FLOW.indexOf(current);
  if (i < 0 || current === 'installed') return [];
  return [REQUEST_FLOW[i + 1], 'cancelled'];
}
const canRequestTransition = (from, to) => nextRequestStatuses(from).includes(to);

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Saran sumber awal: 'dev' untuk rumpun spesifik proses perusahaan (settings.li.devStreams), selain itu 'vendor'. */
function recommendedSource(module, devStreams = []) {
  const stream = norm(module.stream);
  return stream && devStreams.some((s) => norm(s) === stream) ? 'dev' : 'vendor';
}

/**
 * paretoRows: keluaran rankTrainingNeeds (urut skor menurun). Kompetensi prioritas = kumulatif <= 80%,
 * ditambah peringkat 1. Kunci baris (competencyId) di LI adalah nama kompetensi yang dinormalkan, karena satu
 * kompetensi bisa punya beberapa baris kamus (per jenjang). Return Map(kunci -> { rank, share, cumulativeShare, label }).
 */
function priorityFromPareto(paretoRows = []) {
  const out = new Map();
  paretoRows.forEach((r, i) => {
    if (!r.competencyId) return;
    if (i === 0 || r.cumulativeShare <= PARETO_CUTOFF) {
      out.set(r.competencyId, { rank: i + 1, share: r.share, cumulativeShare: r.cumulativeShare, label: r.label });
    }
  });
  return out;
}

/** Prioritas modul = peringkat terbaik di antara kompetensi yang terhubung, atau null. */
function modulePriority(module, priorities) {
  let best = null;
  for (const id of module.competencyKeys || module.competencyIds || []) {
    const p = priorities.get(id);
    if (p && (!best || p.rank < best.rank)) best = p;
  }
  return best;
}

function countItems(items = []) {
  const out = { K: 0, S: 0, A: 0 };
  for (const it of items) if (out[it.kind] !== undefined) out[it.kind] += 1;
  return out;
}

/** Urut: prioritas Pareto dulu (peringkat naik), lalu kode. */
function byPriorityThenCode(a, b) {
  const ra = a.priority ? a.priority.rank : Number.MAX_SAFE_INTEGER;
  const rb = b.priority ? b.priority.rank : Number.MAX_SAFE_INTEGER;
  return ra - rb || String(a.code).localeCompare(String(b.code));
}

module.exports = {
  LEVELS, ITEM_KINDS, REQUEST_FLOW, REQUEST_STATUSES, PARETO_CUTOFF,
  moduleStatus, nextRequestStatuses, canRequestTransition, recommendedSource, priorityFromPareto, modulePriority,
  countItems, byPriorityThenCode, norm,
};
