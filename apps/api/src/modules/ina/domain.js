'use strict';
// B9: aturan murni Improvement Needs (kategori, status, KPI). Tanpa I/O.

// BI-1: empat kategori BRD dengan istilah mockup + "lainnya" (dengan sub-label)
const CATEGORIES = Object.freeze(['sop', 'alat', 'sistem', 'budaya', 'lainnya']);
const CATEGORY_LABEL = Object.freeze({ sop: 'SOP', alat: 'Alat', sistem: 'Sistem', budaya: 'Budaya', lainnya: 'Lainnya' });
const PROCESS_CATEGORIES = Object.freeze(['sop', 'alat', 'sistem']);

// BI-4 + K-3: pelacakan ringan
const STATUSES = Object.freeze(['new', 'in_progress', 'done', 'rejected']);
const STATUS_LABEL = Object.freeze({ new: 'Baru', in_progress: 'Berjalan', done: 'Selesai', rejected: 'Ditolak' });
const OPEN_STATUSES = Object.freeze(['new', 'in_progress']);
const TRANSITIONS = Object.freeze({
  new: ['in_progress', 'done', 'rejected'],
  in_progress: ['done', 'rejected', 'new'],
  done: ['in_progress'],
  rejected: ['new'],
});

const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);
const isOpen = (status) => OPEN_STATUSES.includes(status);

/** Tenggat lewat hanya dihitung untuk tindakan yang masih terbuka. today dan dueDate: 'YYYY-MM-DD'. */
function isOverdue(action, today) {
  return Boolean(action.dueDate) && isOpen(action.status) && action.dueDate < today;
}

/** Empat kartu KPI mockup + jumlah lewat tenggat. `lainnya` hanya masuk total. */
function kpis(actions, today) {
  const out = { total: 0, done: 0, process: 0, culture: 0, overdue: 0 };
  for (const a of actions) {
    out.total += 1;
    if (a.status === 'done') out.done += 1;
    if (PROCESS_CATEGORIES.includes(a.category)) out.process += 1;
    if (a.category === 'budaya') out.culture += 1;
    if (isOverdue(a, today)) out.overdue += 1;
  }
  return out;
}

/** 'YYYY-MM-DD' yang benar-benar ada di kalender. */
function isDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID.test(v);
/** id dari klien dibandingkan dan disimpan dalam huruf kecil (UUID dari Postgres selalu huruf kecil). */
const normId = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v);

module.exports = {
  CATEGORIES, CATEGORY_LABEL, PROCESS_CATEGORIES, STATUSES, STATUS_LABEL, OPEN_STATUSES, TRANSITIONS,
  canTransition, isOpen, isOverdue, kpis, isDate, isUuid, normId,
};
