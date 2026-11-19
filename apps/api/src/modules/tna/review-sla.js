'use strict';
// B7 (PM-3 A): target tinjauan hasil AI = 2 hari kerja setelah wawancara selesai.
// Hari kerja = Senin-Jumat menurut tanggal WIB (UTC+7, tanpa DST). Tanpa kalender libur nasional.
const DAY_MS = 24 * 60 * 60 * 1000;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const LOW_CONFIDENCE = 0.5;

/** Hari dalam pekan menurut WIB: 0 = Minggu ... 6 = Sabtu. */
const wibWeekday = (d) => new Date(d.getTime() + WIB_OFFSET_MS).getUTCDay();
const isWorkingDay = (d) => { const w = wibWeekday(d); return w >= 1 && w <= 5; };

/** Jam yang sama pada hari kerja ke-`days` setelah tanggal `from`. Sabtu/Minggu dilompati. */
function addWorkingDays(from, days) {
  let d = new Date(from);
  let left = days;
  while (left > 0) {
    d = new Date(d.getTime() + DAY_MS);
    if (isWorkingDay(d)) left -= 1;
  }
  return d;
}

/** Batas tinjauan satu temuan. Awal hitungan: sesi selesai, atau waktu temuan dibuat bila tanpa sesi. */
function reviewDue({ sessionEndedAt, createdAt, reviewStatus }, targetDays, now = new Date()) {
  const start = sessionEndedAt || createdAt;
  if (!start) return { reviewDueAt: null, overdue: false };
  const reviewDueAt = addWorkingDays(new Date(start), targetDays);
  return { reviewDueAt, overdue: reviewStatus === 'draft' && now.getTime() > reviewDueAt.getTime() };
}

/**
 * Saran klasifikasi untuk tiga tombol tinjauan. AI hanya menghasilkan dua kategori; keyakinan rendah atau
 * dua penilaian yang berbeda disarankan "Perlu ditinjau HR".
 */
function suggestedClassification({ category, confidence, scoringAgreement }) {
  if (scoringAgreement === false || (confidence != null && confidence < LOW_CONFIDENCE)) return 'needs_review';
  return category === 'training' ? 'training' : 'improvement';
}

const CLASSIFICATIONS = Object.freeze(['training', 'improvement', 'needs_review']);
const categoryFor = (classification) => (classification === 'training' ? 'training' : 'non_training');

module.exports = { addWorkingDays, reviewDue, suggestedClassification, CLASSIFICATIONS, categoryFor, LOW_CONFIDENCE };
