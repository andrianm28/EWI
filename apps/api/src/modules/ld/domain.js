'use strict';
// B14 Learning Delivery: aturan murni (tanpa DB). Spek: docs/designs/b14-learning-delivery.md §4.
// Baris pelatihan (row) = kolom ld_trainings + hitungan peserta dari store:
//   { mode, source, status, startsOn, endsOn, venue, sessionCount, sessionsDone, materialsReady, assessmentMode,
//     participants, completed, failed, avgProgress, attendanceRecorded, present, scored, scoredPresent, inactive, photoDocs, materialDocs }

const WATCH_LAG = 15;          // poin progres tertinggal dari jadwal linear
const READY_WINDOW_DAYS = 7;   // offline yang mulai dalam sekian hari harus sudah siap
const INSIGHT_WINDOW_DAYS = 14;
const INACTIVE_DAYS = 14;

/** Tanggal hari ini (YYYY-MM-DD) di zona waktu Asia/Jakarta. */
function todayJakarta(now = new Date()) {
  return new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}
const day = (d) => (d ? String(d instanceof Date ? d.toISOString() : d).slice(0, 10) : null);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const n = (v) => Number(v || 0);
const round = (v) => Math.round(v);

/** Progres 0-100. Offline: sesi selesai / jumlah sesi. Online: rata-rata progres peserta. */
function progressOf(row) {
  if (row.status === 'done') return 100;
  if (row.mode === 'offline') return round((n(row.sessionsDone) / Math.max(1, n(row.sessionCount))) * 100);
  return round(n(row.avgProgress));
}

/** Kelompok daftar: running | upcoming | done | cancelled. */
function groupOf(row, today) {
  if (row.status === 'cancelled') return 'cancelled';
  if (row.status === 'done') return 'done';
  // online selesai sendiri saat semua peserta tuntas (selesai atau gagal); offline ditutup HR
  if (row.mode === 'online' && n(row.participants) > 0 && n(row.completed) + n(row.failed) >= n(row.participants)) return 'done';
  const start = day(row.startsOn);
  if (row.status === 'scheduled' && start && start > today) return 'upcoming';
  return 'running';
}

/** Status asesmen pelatihan offline: none | awaiting | synced | manual_pending | manual. */
function assessmentStatus(row) {
  if (row.assessmentMode === 'none' || !row.assessmentMode) return 'none';
  // yang diharapkan punya skor: peserta yang hadir; sebelum kehadiran dicatat, semua peserta
  const byPresence = n(row.attendanceRecorded) > 0;
  const expected = byPresence ? n(row.present) : n(row.participants);
  const complete = expected > 0 && n(byPresence ? row.scoredPresent : row.scored) >= expected;
  if (row.assessmentMode === 'elitementor') return complete ? 'synced' : 'awaiting';
  return complete ? 'manual' : 'manual_pending';
}

/**
 * Kelengkapan data pelatihan offline. state: complete | missing | waiting. `optional` tidak menahan kesiapan.
 */
function readiness(row) {
  const as = assessmentStatus(row);
  const p = n(row.participants);
  return [
    { key: 'schedule', state: row.startsOn && String(row.venue || '').trim() ? 'complete' : 'missing' },
    { key: 'materials', state: row.materialsReady || n(row.materialDocs) > 0 ? 'complete' : 'missing' },
    { key: 'participants', state: p > 0 ? 'complete' : 'missing', count: p },
    { key: 'attendance', state: p > 0 && n(row.attendanceRecorded) >= p ? 'complete' : 'missing', recorded: n(row.attendanceRecorded), present: n(row.present) },
    { key: 'assessment', state: ['synced', 'manual'].includes(as) ? 'complete' : (as === 'awaiting' ? 'waiting' : 'missing'), status: as },
    { key: 'documentation', state: n(row.photoDocs) > 0 ? 'complete' : 'missing', optional: true, count: n(row.photoDocs) },
  ];
}

/** Empat cek tab "Akan datang": Jadwal, Materi, Peserta, Asesmen (asesmen siap bila caranya sudah dipilih). */
function upcomingChecks(row) {
  const full = readiness(row);
  const get = (k) => full.find((c) => c.key === k).state === 'complete';
  if (row.mode === 'online') return [{ key: 'schedule', ok: true }, { key: 'materials', ok: true }, { key: 'participants', ok: n(row.participants) > 0 }, { key: 'assessment', ok: true }];
  return [
    { key: 'schedule', ok: get('schedule') },
    { key: 'materials', ok: get('materials') },
    { key: 'participants', ok: get('participants') },
    { key: 'assessment', ok: row.assessmentMode && row.assessmentMode !== 'none' },
  ].map((c) => ({ ...c, ok: !!c.ok }));
}

/**
 * Status: ok | watch | late (spek §4.6).
 * - late: batas (endsOn) sudah lewat dan belum selesai.
 * - watch online: progres tertinggal > 15 poin dari jadwal linear startsOn..endsOn (butuh kedua tanggal).
 * - watch offline: mulai <= 7 hari lagi (atau sudah mulai) sementara Jadwal/Materi/Peserta/Asesmen belum siap.
 * - tanpa tanggal: ok.
 */
function health(row, today) {
  const group = groupOf(row, today);
  if (group === 'done' || group === 'cancelled') return 'ok';
  const start = day(row.startsOn); const end = day(row.endsOn);
  const pct = progressOf(row);
  if (end && end < today && pct < 100) return 'late';
  if (row.mode === 'online') {
    if (start && end && end > start && today > start) {
      const expected = Math.min(100, (daysBetween(start, today) / daysBetween(start, end)) * 100);
      if (expected - pct > WATCH_LAG) return 'watch';
    }
    return 'ok';
  }
  if (start && daysBetween(today, start) <= READY_WINDOW_DAYS && upcomingChecks(row).some((c) => !c.ok)) return 'watch';
  return 'ok';
}

/** Tambahkan group, progressPct, health, dan checks ke tiap baris. */
function decorate(row, today) {
  return { ...row, group: groupOf(row, today), progressPct: progressOf(row), health: health(row, today), checks: upcomingChecks(row), assessmentStatus: assessmentStatus(row) };
}

/** KPI ringkasan dari baris yang sudah di-decorate. activeLearners dihitung store (karyawan unik). */
function kpis(rows, activeLearners = 0) {
  const running = rows.filter((r) => r.group === 'running');
  const open = rows.filter((r) => ['running', 'upcoming'].includes(r.group));
  return {
    running: running.length,
    online: running.filter((r) => r.mode === 'online').length,
    offline: running.filter((r) => r.mode === 'offline').length,
    upcoming: rows.filter((r) => r.group === 'upcoming').length,
    activeLearners,
    avgProgress: running.length ? round(running.reduce((s, r) => s + r.progressPct, 0) / running.length) : 0,
    attention: open.filter((r) => r.health !== 'ok').length,
  };
}

const SOURCE_LABEL = { elitementor: 'EliteMentor', lms: 'LMS klien', manual: 'Input manual' };
const fmt = (d) => { const s = day(d); return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : ''; };

/**
 * Insight dan saran tindakan dari aturan (bukan LLM). Return { insights, actions }.
 * action.kind: remind (POST /trainings/:id/reminders) | open_training (buka detail pelatihan).
 */
function buildInsights(rows, today) {
  const insights = []; const actions = [];
  const add = (r, key, title, detail, action) => {
    insights.push({ key: `${key}:${r.id}`, trainingId: r.id, title, detail, source: SOURCE_LABEL[r.source] || r.source });
    if (action) actions.push({ key: `${action.kind}:${r.id}`, trainingId: r.id, ...action });
  };
  for (const r of rows.filter((x) => ['running', 'upcoming'].includes(x.group))) {
    const pending = n(r.participants) - n(r.completed);
    if (r.health === 'late' && r.mode === 'online') {
      add(r, 'late', `${r.title} tertinggal dari jadwal`, `${pending} dari ${n(r.participants)} peserta belum selesai. Batas ${fmt(r.endsOn)} sudah lewat.`,
        pending > 0 ? { kind: 'remind', title: `Kirim pengingat ke ${pending} peserta ${r.title}`, detail: `Batas ${fmt(r.endsOn)} sudah lewat` } : null);
    } else if (r.health === 'late') {
      add(r, 'late', `${r.title} belum ditutup`, `Tanggal pelatihan ${fmt(r.endsOn)} sudah lewat. Catat sesi, kehadiran, dan asesmen, lalu tandai selesai.`,
        { kind: 'open_training', title: `Lengkapi data ${r.title}`, detail: 'Kehadiran, asesmen, dan status selesai' });
    } else if (r.mode === 'online' && n(r.inactive) > 0) {
      add(r, 'inactive', `${n(r.inactive)} peserta ${r.title} tidak aktif`, `Tidak ada aktivitas belajar selama ${INACTIVE_DAYS} hari terakhir.`,
        { kind: 'remind', title: `Kirim pengingat ke peserta ${r.title}`, detail: `${n(r.inactive)} peserta tidak aktif ${INACTIVE_DAYS} hari` });
    } else if (r.health === 'watch' && r.mode === 'online') {
      add(r, 'behind', `${r.title} di bawah jadwal`, `Progres rata-rata ${r.progressPct}% dengan batas ${fmt(r.endsOn)}.`,
        pending > 0 ? { kind: 'remind', title: `Kirim pengingat ke ${pending} peserta ${r.title}`, detail: `Progres ${r.progressPct}%, batas ${fmt(r.endsOn)}` } : null);
    }
    if (r.mode === 'offline' && r.startsOn && day(r.startsOn) >= today && daysBetween(today, day(r.startsOn)) <= INSIGHT_WINDOW_DAYS) {
      const missing = r.checks.filter((c) => !c.ok).map((c) => c.key);
      if (missing.includes('assessment')) {
        add(r, 'assessment', `${r.title} ${fmt(r.startsOn)} belum siap dinilai`, 'Asesmen belum disiapkan. Tanpa itu, dampak pelatihan tidak bisa diukur di Learning Impact Measurement.',
          { kind: 'open_training', title: `Siapkan asesmen ${r.title}`, detail: 'Pilih cara asesmen atau input skor dari vendor' });
      } else if (missing.length) {
        add(r, 'readiness', `${r.title} ${fmt(r.startsOn)} belum lengkap`, 'Jadwal, materi, atau daftar peserta belum lengkap.',
          { kind: 'open_training', title: `Lengkapi persiapan ${r.title}`, detail: 'Jadwal dan tempat, materi, peserta' });
      }
    }
  }
  return { insights, actions };
}

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const EVENT_TYPES = ['learning.progress', 'assessment.result'];
const EVENT_STATUS = ['in_progress', 'completed', 'failed'];
const str = (v, max) => (v === null || v === undefined ? '' : String(v).trim().slice(0, max));
const pct = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const inRange = (v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100);

/**
 * Rapikan event webhook EliteMentor ke bentuk internal. Satu-satunya tempat yang tahu bentuk payload
 * (kontrak belum disepakati, spek §3). Return { event } atau { error }.
 */
const PG_INT_MAX = 2147483647;
/** Id dari EliteMentor (angka atau string angka) ke bilangan bulat 1..int4 Postgres; selain itu null. */
function intId(v) {
  if (typeof v === 'number' ? !Number.isInteger(v) : !(typeof v === 'string' && /^\d+$/.test(v))) return null;
  const n = Number(v);
  return n >= 1 && n <= PG_INT_MAX ? n : null;
}

function normalizeEvent(raw, now = new Date()) {
  if (!raw || typeof raw !== 'object') return { error: 'payload bukan objek' };
  const id = str(raw.id, 128); const type = str(raw.type, 64);
  const organizationId = intId(raw.organizationId);
  if (!id) return { error: 'id kosong' };
  if (!EVENT_TYPES.includes(type)) return { error: `type tidak dikenal: ${type || '-'}` };
  if (organizationId === null) return { error: 'organizationId tidak valid' };
  const course = raw.course || {}; const user = raw.user || {};
  const ref = str(course.ref, 128);
  if (!ref) return { error: 'course.ref kosong' };
  const email = str(user.email, 255).toLowerCase() || null;
  const hasEmUserId = user.elitementorUserId !== null && user.elitementorUserId !== undefined;
  const emUserId = hasEmUserId ? intId(user.elitementorUserId) : null;
  if (hasEmUserId && emUserId === null) return { error: 'user.elitementorUserId tidak valid' };
  if (!email && emUserId === null) return { error: 'user tanpa email dan elitementorUserId' };
  const occurredAt = ['string', 'number'].includes(typeof raw.occurredAt) ? new Date(raw.occurredAt) : new Date(NaN);
  // waktu jauh di depan akan membuat semua event berikutnya dianggap usang
  if (Number.isNaN(occurredAt.getTime()) || occurredAt.getTime() > now.getTime() + MAX_CLOCK_SKEW_MS) return { error: 'occurredAt tidak valid' };
  const progressPct = pct(raw.progressPct); const score = pct(raw.score);
  if (!inRange(progressPct)) return { error: 'progressPct harus 0-100' };
  if (!inRange(score)) return { error: 'score harus 0-100' };
  const status = raw.status ? str(raw.status, 32) : null;
  if (type === 'learning.progress' && !EVENT_STATUS.includes(status)) return { error: 'status harus in_progress, completed, atau failed' };
  if (type === 'assessment.result' && score === null) return { error: 'score kosong' };
  const dueAt = course.dueAt ? day(new Date(course.dueAt).toString() === 'Invalid Date' ? null : new Date(course.dueAt)) : null;
  const tier = ['basic', 'intermediate', 'advanced'].includes(course.programTier) ? course.programTier : null;
  return { event: { id, type, organizationId, course: { ref, title: str(course.title, 255) || ref, programTier: tier, dueAt }, user: { email, elitementorUserId: emUserId }, progressPct, status, score, occurredAt } };
}

module.exports = {
  WATCH_LAG, READY_WINDOW_DAYS, INACTIVE_DAYS, todayJakarta, day, progressOf, groupOf, assessmentStatus, readiness, upcomingChecks, health,
  decorate, kpis, buildInsights, normalizeEvent,
};
