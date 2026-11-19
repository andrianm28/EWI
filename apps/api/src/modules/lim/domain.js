'use strict';
// B15 Learning Impact Measurement: aturan murni (tanpa DB). Spek: docs/designs/b15-impact-measurement.md bagian 4 dan 6.
// Tidak ada klaim sebab-akibat: fungsi di sini hanya menyusun garis bukti dan tempat rantai putus.

const RETENTION_MIN = 70; // ambang mockup (fungsi verd), sama dengan skor lulus 5C
const present = (v) => v !== null && v !== undefined;
const avg = (list) => (list.length ? Math.round(list.reduce((s, v) => s + Number(v), 0) / list.length) : null);
const key = (userId, competencyId) => `${userId}|${competencyId}`;

/**
 * Skor post Learning Delivery terbaru per (karyawan, kompetensi).
 * rows: [{ userId, competencyId, score, scoreSource, completedOn (YYYY-MM-DD|null), createdAt, id }]
 * Return Map key "user|kompetensi" -> { score, auditable, completedOn }.
 */
function latestPost(rows) {
  const better = (a, b) => {
    if ((a.completedOn || '') !== (b.completedOn || '')) return (a.completedOn || '') > (b.completedOn || '');
    if (String(a.createdAt) !== String(b.createdAt)) return String(a.createdAt) > String(b.createdAt);
    return String(a.id) > String(b.id);
  };
  const best = new Map();
  for (const r of rows) {
    const k = key(r.userId, r.competencyId);
    if (!best.has(k) || better(r, best.get(k))) best.set(k, r);
  }
  const out = new Map();
  for (const [k, r] of best) out.set(k, { score: Math.round(Number(r.score)), auditable: r.scoreSource !== 'vendor_manual', completedOn: r.completedOn || null });
  return out;
}

/** Kesimpulan per kompetensi dari rata-rata wawancara ulang (fungsi verd di mockup). */
function verdict(reinterviewAvg) {
  if (!present(reinterviewAvg)) return 'belum_diukur';
  return reinterviewAvg < RETENTION_MIN ? 'retensi_turun' : 'terkonfirmasi';
}

/**
 * competencies: [{ id, name }]; rows: [{ userId, competencyId, pre, post, postAuditable, postShared, reinterview, performance }]
 * (satu baris per peserta terlihat per kompetensi, nilai efektif).
 */
function summarizeCompetencies(competencies, rows) {
  return [...competencies].sort((a, b) => a.name.localeCompare(b.name, 'id')).map((c) => {
    const mine = rows.filter((r) => r.competencyId === c.id);
    const vals = (f) => mine.map((r) => r[f]).filter(present);
    const withPost = mine.filter((r) => present(r.post));
    const reinterview = avg(vals('reinterview'));
    return {
      competencyId: c.id, name: c.name,
      pre: avg(vals('pre')), preN: vals('pre').length,
      post: avg(vals('post')), postN: withPost.length,
      postUnauditable: withPost.filter((r) => r.postAuditable === false).length,
      postShared: withPost.some((r) => r.postShared),
      reinterview, reinterviewN: vals('reinterview').length,
      performance: avg(vals('performance')), performanceN: vals('performance').length,
      verdict: verdict(reinterview),
    };
  });
}


/** Kondisi indikator tim: membaik, memenuhi target, kekuatan bukti (HR menang; hitungan tidak pernah memberi strong). */
function indicatorState(ind) {
  const lower = ind.direction === 'lower_better';
  const has = present(ind.baseline) && present(ind.current);
  const improved = has ? (lower ? Number(ind.current) < Number(ind.baseline) : Number(ind.current) > Number(ind.baseline)) : null;
  const targetMet = present(ind.current) && present(ind.target)
    ? (lower ? Number(ind.current) <= Number(ind.target) : Number(ind.current) >= Number(ind.target)) : null;
  if (ind.strength) return { improved, targetMet, strength: ind.strength, strengthSource: 'hr' };
  let strength = 'no_data';
  if (has) strength = improved && targetMet ? 'moderate' : 'weak';
  return { improved, targetMet, strength, strengthSource: 'rules' };
}

const num = (v) => String(Number(v)).replace('.', ',');
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const NO_DATA = 'Belum ada data';
const coverOf = (x, n) => (n > 0 && x === n ? 'measured' : x > 0 ? 'partial' : 'missing');

function indicatorLevel(list, withMissingNames) {
  const complete = list.filter((i) => present(i.baseline) && present(i.current));
  if (!complete.length) return { finding: NO_DATA, coverage: 'missing' };
  const first = complete[0];
  const unit = first.unit ? (first.unit === '%' ? '%' : ` ${first.unit}`) : '';
  let finding = `${first.name} ${num(first.baseline)} → ${num(first.current)}${unit}`;
  const missing = list.filter((i) => !complete.includes(i));
  if (withMissingNames && missing.length) finding += `; data ${missing.map((i) => i.name).join(', ')} belum ada`;
  return { finding, coverage: complete.length === list.length ? 'measured' : 'partial' };
}

/**
 * Rantai bukti 6 tingkat (spek 6.2).
 * input: { participants: [userId], activity: { participations, completed, offlineRecorded, offlinePresent },
 *          rows: [{ userId, competencyId, pre, post, reinterview, performance }], indicators: [{ name, level, unit, baseline, current }] }
 */
function buildChain({ participants, activity, rows, indicators }) {
  const n = participants.length;
  const a = activity || {};
  const l1 = a.participations > 0
    ? `${a.completed} dari ${a.participations} keikutsertaan selesai (${pct(a.completed, a.participations)}%)`
      + (a.offlineRecorded > 0 ? `; kehadiran offline ${a.offlinePresent} dari ${a.offlineRecorded} tercatat` : '')
    : NO_DATA;

  const withPost = rows.filter((r) => present(r.post));
  const pairs = withPost.filter((r) => present(r.pre));
  const l2 = pairs.length
    ? `Naik rata-rata ${Math.round(pairs.reduce((s, r) => s + (r.post - r.pre), 0) / pairs.length)} poin pada ${new Set(pairs.map((r) => r.competencyId)).size} kompetensi`
    : NO_DATA;
  const cov2 = !pairs.length ? 'missing' : pairs.length === withPost.length ? 'measured' : 'partial';

  const people = (f) => new Set(rows.filter((r) => present(r[f]) && participants.includes(r.userId)).map((r) => r.userId)).size;
  const x3 = people('reinterview'); const x4 = people('performance');
  const l5 = indicatorLevel(indicators.filter((i) => i.level === 'performance'), false);
  const l6 = indicatorLevel(indicators.filter((i) => i.level === 'business'), true);

  return [
    { level: 1, key: 'activity', label: 'Aktivitas', source: 'Learning Delivery', finding: l1, coverage: a.participations > 0 ? 'measured' : 'missing' },
    { level: 2, key: 'learning', label: 'Pembelajaran', source: 'Asesmen pre dan post', finding: l2, coverage: cov2 },
    { level: 3, key: 'capability', label: 'Kapabilitas', source: 'Wawancara ulang AI', finding: n ? `${x3} dari ${n} karyawan sudah diwawancara ulang` : NO_DATA, coverage: coverOf(x3, n) },
    { level: 4, key: 'application', label: 'Penerapan', source: 'Review atasan, isian kinerja', finding: n ? `${x4} dari ${n} karyawan punya skor kinerja` : NO_DATA, coverage: coverOf(x4, n) },
    { level: 5, key: 'performance', label: 'Kinerja', source: 'Indikator kinerja tim', ...l5 },
    { level: 6, key: 'business', label: 'Hasil bisnis', source: 'Indikator bisnis tim', ...l6 },
  ];
}

const INSIGHT = {
  1: () => 'Rantai paling lemah ada di tingkat 1. Data aktivitas belajar belum ada, jadi tingkat di atasnya belum bisa dibaca.',
  2: () => 'Rantai paling lemah ada di tingkat 2. Skor sebelum dan sesudah belajar belum lengkap, jadi kenaikan pembelajaran belum terlihat.',
  3: (c) => `Rantai paling lemah ada di tingkat 3. Baru ${c.finding.replace(' sudah diwawancara ulang', '')} yang dikonfirmasi lewat wawancara ulang. Tanpa bukti di tengah, klaim bahwa pelatihan memperbaiki kinerja masih lemah.`,
  4: (c) => `Rantai paling lemah ada di tingkat 4. Baru ${c.finding.replace(' punya skor kinerja', '')} yang penerapannya di pekerjaan dinilai. Tanpa bukti penerapan, hubungan ke kinerja tim masih lemah.`,
  5: () => 'Rantai paling lemah ada di tingkat 5. Indikator kinerja tim belum lengkap, jadi perubahan kinerja belum bisa dibandingkan.',
  6: () => 'Rantai paling lemah ada di tingkat 6. Sebagian indikator hasil bisnis belum punya data, jadi dampak ke bisnis belum utuh.',
};

/** Tingkat terendah yang cakupannya bukan measured, dengan kalimat tetap per tingkat. */
function buildInsight(chain) {
  const weak = chain.find((c) => c.coverage !== 'measured');
  if (!weak) return { level: null, text: 'Semua tingkat punya bukti. Tetap cek faktor lain sebelum menyimpulkan.' };
  return { level: weak.level, text: INSIGHT[weak.level](weak) };
}


const DUE_FROM_DAYS = 28; // mockup: "4 sampai 6 pekan setelah belajar"
const DUE_UNTIL_DAYS = 42;
const MAX_AHEAD_DAYS = 180;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const validDate = (d) => DATE.test(String(d)) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

/**
 * Antrean wawancara ulang, satu baris per karyawan (keputusan user 19 Nov).
 * pairs: [{ userId, name, competencyId, competencyName, postFromLd, postCompletedOn, reinterviewStatus, reinterviewOn, reinterviewScore }]
 */
function buildQueue(pairs, today) {
  const byUser = new Map();
  for (const x of pairs.filter((q) => q.postFromLd)) {
    if (!byUser.has(x.userId)) byUser.set(x.userId, []);
    byUser.get(x.userId).push(x);
  }
  const rows = [...byUser.values()].map((list) => {
    const dates = list.map((x) => x.postCompletedOn);
    const completed = dates.some((d) => !d) ? null : dates.sort().at(-1);
    const done = list.every((x) => x.reinterviewStatus === 'done');
    const sched = list.find((x) => x.reinterviewStatus === 'scheduled');
    const status = done ? 'done' : sched ? 'scheduled' : 'none';
    const dueFrom = completed ? addDays(completed, DUE_FROM_DAYS) : null;
    const dueUntil = completed ? addDays(completed, DUE_UNTIL_DAYS) : null;
    let window = null;
    if (completed && !done) window = today < dueFrom ? 'early' : today > dueUntil ? 'late' : 'due';
    return {
      userId: list[0].userId, name: list[0].name,
      competencies: list.map((x) => ({ competencyId: x.competencyId, name: x.competencyName })).sort((a, b) => a.name.localeCompare(b.name, 'id')),
      postCompletedOn: completed, dueFrom, dueUntil, status, window,
      scheduledOn: sched ? sched.reinterviewOn : null,
      score: done ? avg(list.map((x) => x.reinterviewScore).filter(present)) : null,
    };
  });
  const rank = (r) => (r.status === 'done' ? 4 : { late: 0, due: 1, early: 2 }[r.window] ?? 3);
  return rows.sort((a, b) => rank(a) - rank(b) || String(a.dueFrom || '').localeCompare(String(b.dueFrom || '')) || a.name.localeCompare(b.name, 'id'));
}

/** Validasi tanggal jadwal: null (batal), atau YYYY-MM-DD dari hari ini sampai +180 hari. Return pesan galat atau null. */
function checkScheduleDate(date, today) {
  if (date === null) return null;
  if (!validDate(date)) return 'Tanggal harus berformat YYYY-MM-DD';
  if (date < today) return 'Tanggal tidak boleh sebelum hari ini';
  if (date > addDays(today, MAX_AHEAD_DAYS)) return 'Tanggal paling lambat 180 hari dari hari ini';
  return null;
}

module.exports = {
  RETENTION_MIN, latestPost, verdict, summarizeCompetencies, indicatorState, buildChain, buildInsight, buildQueue, checkScheduleDate, validDate, key,
};
