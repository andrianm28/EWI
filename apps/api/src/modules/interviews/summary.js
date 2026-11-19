'use strict';
// B6 Wawancara akar masalah: langkah ringkasan temuan yang diperiksa karyawan (docs/designs/b6-wawancara-akar-masalah.md).
// Fungsi murni tanpa DB.
const { isExpired } = require('./invitation');

const MAX_RESTARTS = 2;
const SHORT_SESSION_QUESTIONS = 5; // durasi 15 menit (A10)
const NOTE_MIN = 10;
const NOTE_MAX = 1000;
const AI_LABEL = 'ELGOS-AI'; // ID model tidak dikirim ke karyawan (A11)

/** Langkah stepper yang sedang aktif untuk sesi ini. */
function stepOf(session, now = new Date()) {
  if (session.status === 'scheduled') return isExpired(session.inviteExpiresAt, now) ? 'expired' : 'consent';
  if (session.status === 'in_progress') return session.summaryAt ? 'summary' : 'chat';
  if (session.status === 'completed') return 'done';
  return 'closed';
}

/**
 * Apakah karyawan memeriksa ringkasan temuannya (A9):
 * confirmed = dikirim "sesuai"; disputed = dikirim dengan catatan tidak sesuai; unchecked = sesi selesai tanpa
 * konfirmasi karyawan (ditutup HR, atau alur tanpa langkah ringkasan); pending = ringkasan sudah dibuat, belum
 * diputuskan; not_applicable = belum ada ringkasan atau tidak ada sesi.
 */
function summaryStateOf(session) {
  if (!session) return 'not_applicable';
  if (session.summaryConfirmedAt) return session.summaryDisputed ? 'disputed' : 'confirmed';
  if (session.status === 'completed') return 'unchecked';
  return session.summaryAt ? 'pending' : 'not_applicable';
}

/** Batas atas jumlah pertanyaan AI: sesi 15 menit paling banyak 5, selain itu batas konfigurasi. */
function questionLimit(session, aiConfig = {}) {
  const max = aiConfig.maxQuestions || 8;
  return session && session.durationMinutes === 15 ? Math.min(SHORT_SESSION_QUESTIONS, max) : max;
}

/** Temuan untuk layar karyawan: judul, rincian, kategori, keyakinan. ID kompetensi/target tidak ikut (A3). */
function publicSummary(findings) {
  return (findings || []).map((f) => ({
    title: f.title, detail: f.detail ?? null, category: f.category,
    confidence: typeof f.confidence === 'number' && Number.isFinite(f.confidence) ? f.confidence : null,
  }));
}

// A11: daftar putih kolom sesi untuk semua peran yang boleh melihat sesi. Kolom baru di store tidak ikut otomatis.
const SHARED_FIELDS = [
  'id', 'projectId', 'submodule', 'intervieweeId', 'jobRoleId', 'status', 'mode', 'consentAt', 'consentVersion', 'triggerRecordIds',
  'startedAt', 'endedAt', 'inviteExpiresAt', 'inviteExtendedCount', 'durationMinutes', 'focusKind', 'focusLabel', 'assignedBy', 'assignedByName',
];

/**
 * Sesi untuk respons GET (A11). Kolom ringkasan mentah dibuang; semua peran mendapat `step` dan `summaryState`.
 * Orang yang diwawancarai mendapat tambahan untuk stepper dan footer audit.
 */
function sessionView(session, { interviewee = false, answerCount = 0, aiConfig = {}, now = new Date() } = {}) {
  const view = {};
  for (const k of SHARED_FIELDS) if (session[k] !== undefined) view[k] = session[k];
  view.step = stepOf(session, now);
  view.summaryState = summaryStateOf(session);
  if (!interviewee) return view;
  const restartCount = session.restartCount || 0;
  return {
    ...view, answerCount, questionLimit: questionLimit(session, aiConfig), restartCount, restartsLeft: Math.max(0, MAX_RESTARTS - restartCount),
    summaryAt: session.summaryAt || null, summaryConfirmedAt: session.summaryConfirmedAt || null,
    aiLabel: AI_LABEL, sessionCode: String(session.id).slice(0, 8).toUpperCase(),
  };
}

/** Body konfirmasi: { accurate?: boolean, note?: string }. Tidak sesuai wajib bercatatan (A5b). */
function parseConfirmation(body) {
  const b = body || {};
  if (b.accurate === undefined || b.accurate === true) return { disputed: false, note: null };
  if (b.accurate !== false) return null;
  const note = typeof b.note === 'string' ? b.note.trim() : '';
  if (note.length < NOTE_MIN || note.length > NOTE_MAX) return null;
  return { disputed: true, note };
}

module.exports = {
  MAX_RESTARTS, SHORT_SESSION_QUESTIONS, NOTE_MIN, NOTE_MAX, AI_LABEL, stepOf, summaryStateOf, questionLimit, publicSummary, sessionView, parseConfirmation,
};
