'use strict';
// B9: port AI untuk verifikasi tindakan perbaikan. Percakapan pendek (maksimal 3 pertanyaan) ke pemilik tindakan.
// Bila provider AI punya `nextVerificationQuestion` dan `summarizeVerification`, itu yang dipakai. Bila tidak ada
// atau gagal, dipakai implementasi bawaan yang deterministik.
//
// Kontrak provider (keduanya async):
//   nextVerificationQuestion({ action: { title, category, dueDate }, askedCount, turns }) -> string
//   summarizeVerification({ action, turns }) -> { summary: string, reportedStatus: 'in_progress'|'done'|'blocked' }
// turns: [{ speaker: 'ai'|'human', text }]
//
// PO-6: ringkasan bawaan TIDAK memuat teks jawaban. Ia hanya kalimat tetap berdasarkan status yang dilaporkan,
// supaya isi percakapan tidak sampai ke HR lewat jalur ringkasan.
const MAX_QUESTIONS = 3;
const REPORTED = Object.freeze(['in_progress', 'done', 'blocked']);
const DEFAULT_PROVIDER = 'bawaan';

const QUESTIONS = Object.freeze([
  (a) => `Bagaimana status tindakan "${a.title}" saat ini? Apakah sudah selesai, masih berjalan, atau belum dimulai?`,
  () => 'Apa hambatan utama yang Anda temui dalam menjalankan tindakan ini?',
  () => 'Bantuan apa yang Anda butuhkan, dan kapan perkiraan tindakan ini selesai?',
]);

const BLOCKED = /(terhambat|terkendala|terhenti|tertunda|macet|mandek|belum bisa|tidak bisa lanjut|menunggu (persetujuan|anggaran|keputusan|vendor))/i;
const NOT_DONE = /(belum|tidak|bukan)\s+(\w+\s+)?(selesai|beres|rampung|tuntas)/i;
const DONE = /(selesai|beres|rampung|tuntas)/i;

/** Status dari jawaban pemilik: jawaban pertama menentukan selesai/berjalan; hambatan dibaca dari semua jawaban. */
function classify(turns) {
  const answers = turns.filter((t) => t.speaker === 'human').map((t) => String(t.text || ''));
  const first = answers[0] || '';
  if (DONE.test(first) && !NOT_DONE.test(first)) return 'done';
  if (answers.some((t) => BLOCKED.test(t))) return 'blocked';
  return 'in_progress';
}

const SUMMARY = Object.freeze({
  done: 'Pemilik melaporkan tindakan ini sudah selesai.',
  blocked: 'Pemilik melaporkan tindakan ini terhambat dan membutuhkan tindak lanjut HR.',
  in_progress: 'Pemilik melaporkan tindakan ini masih berjalan.',
});

function defaultSummary(turns) {
  const reportedStatus = classify(turns);
  const answered = turns.filter((t) => t.speaker === 'human').length;
  return {
    reportedStatus,
    summary: `${SUMMARY[reportedStatus]} Pemilik menjawab ${answered} dari ${MAX_QUESTIONS} pertanyaan. Ringkasan ini dibuat otomatis tanpa mengutip jawaban.`,
  };
}

function createVerificationAi(ai) {
  const hasProvider = Boolean(ai && typeof ai.nextVerificationQuestion === 'function' && typeof ai.summarizeVerification === 'function');
  const providerName = hasProvider ? String(ai.name || 'ai').slice(0, 32) : DEFAULT_PROVIDER;
  return {
    providerName,
    maxQuestions: MAX_QUESTIONS,
    /** Pertanyaan berikutnya, atau null bila batas pertanyaan sudah tercapai. */
    async nextQuestion({ action, askedCount, turns = [] }) {
      if (askedCount >= MAX_QUESTIONS) return null;
      if (hasProvider) {
        try {
          const q = await ai.nextVerificationQuestion({ action, askedCount, turns });
          if (typeof q === 'string' && q.trim()) return q.trim().slice(0, 1000);
        } catch { /* jatuh ke pertanyaan bawaan */ }
      }
      return QUESTIONS[askedCount](action);
    },
    /** -> { summary, reportedStatus, provider } */
    async summarize({ action, turns }) {
      if (hasProvider) {
        try {
          const out = await ai.summarizeVerification({ action, turns });
          if (out && typeof out.summary === 'string' && out.summary.trim() && REPORTED.includes(out.reportedStatus)) {
            return { summary: out.summary.trim().slice(0, 2000), reportedStatus: out.reportedStatus, provider: providerName };
          }
        } catch { /* jatuh ke ringkasan bawaan */ }
      }
      return { ...defaultSummary(turns), provider: DEFAULT_PROVIDER };
    },
  };
}

module.exports = { createVerificationAi, classify, defaultSummary, MAX_QUESTIONS, REPORTED, DEFAULT_PROVIDER };
