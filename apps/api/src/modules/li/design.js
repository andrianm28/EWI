'use strict';
// B13: draf awal pengembangan modul dari butir KSA (DACUM Tool 2). Backward design: tujuan -> asesmen -> aktivitas,
// kata kerja operasional Bloom per tipe, urutan peristiwa belajar Gagné. Deterministik (templat), bukan LLM:
// lihat spek §4.9. Bentuk keluaran adalah kontrak; pengganti berbasis LLM harus mengembalikan bentuk yang sama.

const OBJECTIVE = {
  K: (x) => `Peserta mampu menjelaskan "${x}" dengan benar pada tes tertulis (skor ≥ 80%).`,
  S: (x) => `Peserta mampu mempraktikkan "${x}" sesuai checklist pada simulasi kerja (skor observasi ≥ 80%).`,
  A: (x) => `Peserta menunjukkan "${x}" secara konsisten, dinilai atasan (skala 1–5, rata-rata ≥ 4) dalam 4 minggu setelah pelatihan.`,
};
const HOW = { K: 'Tes tertulis', S: 'Observasi dengan rubrik', A: 'Penilaian perilaku oleh atasan' };
const ASSESSMENT = {
  K: { title: 'Knowledge', detail: 'Tes tertulis, minimal satu soal untuk setiap tujuan Knowledge. Lulus bila skor ≥ 80%.' },
  S: { title: 'Skill', detail: 'Observasi praktik dengan rubrik checklist. Lulus bila skor ≥ 80%.' },
  A: { title: 'Attitude', detail: 'Penilaian perilaku oleh atasan selama 4 minggu. Lulus bila rata-rata ≥ 4 dari 5.' },
};

/** Tujuan dianggap terukur bila memuat angka kriteria. */
const isMeasurable = (text) => /\d/.test(String(text || ''));

/**
 * module: { name, items: [{ kind, text }] } -> { objectives, sessions, assessments }
 * Tujuan menyalin teks butir (bukan id), jadi impor ulang modul tidak merusak draf yang sudah ada.
 */
function generateDraft(module) {
  const items = module.items || [];
  const n = (k) => items.filter((i) => i.kind === k).length;
  const objectives = items.map((i) => ({ kind: i.kind, item: i.text, text: OBJECTIVE[i.kind](i.text), assessment: HOW[i.kind] }));
  const sessions = [{ title: 'Pembuka: relevansi dan tujuan', detail: `Menghubungkan modul "${module.name}" dengan tugas jabatan dan menyampaikan tujuan yang terukur.`, covers: 'Semua tujuan' }];
  if (n('K')) sessions.push({ title: 'Konsep inti', detail: `Penjelasan ringkas, contoh kasus, dan kuis cepat untuk ${n('K')} butir Knowledge.`, covers: `${n('K')} tujuan` });
  if (n('S')) sessions.push({ title: 'Demonstrasi dan praktik terbimbing', detail: `Contoh kerja oleh SME, latihan pada skenario nyata, dan umpan balik dengan rubrik untuk ${n('S')} butir Skill.`, covers: `${n('S')} tujuan` });
  if (n('A')) sessions.push({ title: 'Studi kasus dan refleksi perilaku', detail: `Kasus dilema kerja dan komitmen perilaku yang dipantau atasan untuk ${n('A')} butir Attitude.`, covers: `${n('A')} tujuan` });
  sessions.push({ title: 'Rangkuman dan transfer ke pekerjaan', detail: 'Rencana penerapan 4 minggu dan tindak lanjut bersama atasan.', covers: 'Semua tujuan' });
  sessions.forEach((s, i) => { s.order = i + 1; });
  const assessments = ['K', 'S', 'A'].filter((k) => n(k)).map((k) => ({ kind: k, ...ASSESSMENT[k], objectives: n(k) }));
  return { objectives, sessions, assessments };
}

const filled = (v) => String(v || '').trim().length > 0;

/** Syarat mengajukan ke SME. Return pesan galat atau null. */
function validateDraft({ objectives = [], sessions = [], assessments = [] } = {}) {
  if (!objectives.length) return 'Draf belum punya tujuan pembelajaran';
  if (objectives.some((o) => !filled(o.text))) return 'Ada tujuan pembelajaran yang masih kosong';
  const vague = objectives.filter((o) => !isMeasurable(o.text)).length;
  if (vague) return `${vague} tujuan pembelajaran belum terukur (tambahkan kriteria ukur berupa angka)`;
  if (!sessions.length || sessions.some((s) => !filled(s.title))) return 'Rancangan materi belum punya sesi yang lengkap';
  if (!assessments.length || assessments.some((a) => !filled(a.detail))) return 'Asesmen belum diisi';
  return null;
}

const KINDS = ['K', 'S', 'A'];
const str = (v, max) => String(v ?? '').trim().slice(0, max);

/** Rapikan suntingan HR; return { value } atau { error }. Hanya field yang dikirim yang diganti. */
function sanitizeDraftPatch(body = {}) {
  const out = {};
  if (body.objectives !== undefined) {
    if (!Array.isArray(body.objectives) || body.objectives.length > 200) return { error: 'objectives harus berupa daftar' };
    if (body.objectives.some((o) => !o || !KINDS.includes(o.kind))) return { error: 'Tipe tujuan harus K, S, atau A' };
    out.objectives = body.objectives.map((o) => ({ kind: o.kind, item: str(o.item, 1000), text: str(o.text, 2000), assessment: str(o.assessment, 255) }));
  }
  if (body.sessions !== undefined) {
    if (!Array.isArray(body.sessions) || body.sessions.length > 50) return { error: 'sessions harus berupa daftar' };
    out.sessions = body.sessions.map((s, i) => ({ order: i + 1, title: str(s && s.title, 255), detail: str(s && s.detail, 2000), covers: str(s && s.covers, 255) }));
  }
  if (body.assessments !== undefined) {
    if (!Array.isArray(body.assessments) || body.assessments.length > 20) return { error: 'assessments harus berupa daftar' };
    if (body.assessments.some((a) => !a || !KINDS.includes(a.kind))) return { error: 'Tipe asesmen harus K, S, atau A' };
    out.assessments = body.assessments.map((a) => ({ kind: a.kind, title: str(a.title, 255), detail: str(a.detail, 2000), objectives: Number.isInteger(a.objectives) ? a.objectives : 0 }));
  }
  if (!Object.keys(out).length) return { error: 'Tidak ada perubahan' };
  return { value: out };
}

module.exports = { generateDraft, isMeasurable, validateDraft, sanitizeDraftPatch };
