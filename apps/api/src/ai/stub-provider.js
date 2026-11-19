'use strict';
// Penyedia AI tiruan yang deterministik (tanpa LLM). Bawaan untuk test dan di luar produksi (PK-06).
// Skor yang dihasilkan selalu ber-confidence rendah dan wajib dinilai ulang.
const STUB_NOTE = 'Skor sementara dari penyedia AI tiruan (stub); perlu dinilai ulang.';
const NON_TRAINING_HINTS = ['sop', 'tools', 'tool', 'aplikasi', 'sistem', 'akses', 'jaringan', 'prosedur'];

const words = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/i).filter((w) => w.length > 3);
const humanText = (transcript) => transcript.filter((t) => t.speaker === 'human').map((t) => t.text).join(' ').toLowerCase();

function overlap(text, name) {
  return words(name).filter((w) => text.includes(w)).length;
}
const mentions = (text, name) => overlap(text, name) > 0;

/** Kompetensi dengan kata yang paling banyak disebut, atau null. */
function bestMatch(text, competencies) {
  let best = null; let bestScore = 0;
  for (const c of competencies) {
    const s = overlap(text, c.name);
    if (s > bestScore) { best = c; bestScore = s; }
  }
  return best;
}

const usage = (operation) => [{ operation, provider: 'stub', model: 'stub', inputTokens: 0, outputTokens: 0, latencyMs: 0 }];

function question(submodule, askedCount, context) {
  if (submodule === 'dna') {
    const comps = context.competencies || [];
    if (askedCount < comps.length) {
      const c = comps[askedCount];
      return `Ceritakan pengalaman terakhir Anda yang menunjukkan kompetensi "${c.name}". Apa yang Anda lakukan dan hasilnya?`;
    }
    return askedCount === comps.length ? 'Kompetensi mana yang menurut Anda paling perlu dikembangkan untuk naik ke jenjang berikutnya?' : null;
  }
  const triggers = context.triggers || [];
  // B6 (A10): sesi untuk gap kompetensi atau OKR tanpa target meleset dibuka dengan topiknya
  if (!triggers.length && context.focus && context.focus.label) {
    if (askedCount === 0) return `Kita membahas ${context.focus.kind === 'okr' ? 'target kerja' : 'kompetensi'} "${context.focus.label}". Ceritakan pekerjaan terakhir Anda yang terkait: bagian mana yang paling sulit?`;
    return askedCount === 1 ? 'Selain hal di atas, adakah kendala lain (SOP, tools, atau pengetahuan) yang menghambat pekerjaan Anda?' : null;
  }
  if (askedCount < triggers.length) {
    const t = triggers[askedCount];
    return `Target "${t.name}" periode ${t.period || 'ini'} belum tercapai (target ${t.target}, realisasi ${t.actual}). Menurut Anda apa penyebab utamanya?`;
  }
  if (askedCount === triggers.length) {
    return triggers.length
      ? 'Selain hal di atas, adakah kendala lain (SOP, tools, atau pengetahuan) yang menghambat pekerjaan Anda?'
      : 'Bagian pekerjaan mana yang paling sulit Anda kuasai saat ini, dan mengapa?';
  }
  return null;
}

// B17: tiruan Asisten ELGOS. Kata kunci pertanyaan -> kunci fakta (mengikuti RULES mockup), kalimat dari angka fakta.
const ASSISTANT_RULES = [
  [['rencana', 'belajar', 'modul', 'course', 'kursus'], 'rencanaSaya', 'li', (f) => `Rencana belajar Anda ada ${f.total}: ${f.items.map((i) => i.title).join(', ')}.`],
  [['undangan', 'wawancara'], 'undanganSaya', 'iv', (f) => `Anda punya ${f.open} wawancara akar masalah terbuka, ${f.canStart} bisa dimulai sekarang.`],
  [['hasil', 'skor', 'kompetensi'], 'kompetensiSaya', 'my', (f) => `Dari ${f.summary.total} kompetensi, ${f.summary.met} sudah dikuasai dan ${f.summary.gaps} masih belum.`],
  [['wawancara', 'tim', 'status'], 'wawancaraTim', 'tna', (f) => `Tim Anda ${f.members} orang. Belum selesai wawancara: ${f.notCompleted.join(', ') || 'tidak ada'}.`],
  [['gap', 'kompetensi', 'pareto'], 'gapTim', 'tna', (f) => `Gap terbesar tim: ${f.top.map((g) => `${g.competency} (${g.employees} orang)`).join(', ') || 'belum ada'}.`],
  [['hari ini', 'perlu', 'tinjauan', 'menunggu'], 'tinjauan', 'review', (f, all) => [
    `Ada ${f.draft} temuan AI menunggu tinjauan, ${f.overdue} lewat target ${f.targetDays} hari kerja, ${f.held} ditahan.`,
    all.perbaikan ? `${all.perbaikan.decided - all.perbaikan.handedOff} temuan perbaikan belum diteruskan ke Improvement Needs.` : '',
    all.permintaanData ? `${Object.values(all.permintaanData.open).reduce((a, n) => a + n, 0)} permintaan data karyawan terbuka.` : '',
  ].filter(Boolean).join(' ')],
  [['rencana', 'modul'], 'rencana', 'tna', (f) => `Rencana per status: ${Object.entries(f.byStatus).map(([k, n]) => `${k} ${n}`).join(', ') || 'belum ada'}; ${f.needsModule} perlu modul.`],
  [['rencana', 'modul'], 'rencanaTim', 'tna', (f) => `Rencana tim per status: ${Object.entries(f.byStatus).map(([k, n]) => `${k} ${n}`).join(', ') || 'belum ada'}.`],
  [['wawancara', 'sesi'], 'wawancara', 'tna', (f) => `Sesi wawancara per status: ${Object.entries(f.byStatus).map(([k, n]) => `${k} ${n}`).join(', ') || 'belum ada'}.`],
  [['jabatan', 'posisi', 'jenjang'], 'saya', null, (f) => `Jabatan Anda ${f.jabatan || 'belum tercatat'}, jenjang ${f.jenjang || 'belum tercatat'}.`],
  [['gap', 'kompetensi', 'pareto'], 'gap', 'tna', (f) => `Gap terbesar: ${f.top.map((g) => `${g.competency} (${g.employees} orang)`).join(', ') || 'belum ada'}.`],
];

function stubAssistantReply({ facts, pages, question }) {
  const q = String(question || '').toLowerCase();
  const keys = (pages || []).map((p) => p.key);
  const hit = ASSISTANT_RULES.find(([words, key]) => facts[key] && words.some((w) => q.includes(w)));
  if (!hit) return { answer: null, page: null, refused: false };
  const [, key, page, say] = hit;
  return { answer: say(facts[key], facts), page: page && keys.includes(page) ? page : null, refused: false };
}

function createStubProvider() {
  return {
    name: 'stub',
    model: 'stub',
    async verify() { return true; },

    async nextQuestion({ submodule, askedCount, context }) {
      return { question: question(submodule, askedCount, context), usage: usage('next_question') };
    },

    async assessCompetencies({ transcript, competencies }) {
      const text = humanText(transcript);
      const results = competencies.map((c) => ({
        competencyId: c.id,
        score: mentions(text, c.name) ? 3 : 2,
        confidence: 0.2,
        evidence: STUB_NOTE,
      }));
      return { results, usage: usage('assess_competencies') };
    },

    async analyzeTna({ transcript, triggers, competencies }) {
      const text = humanText(transcript);
      const findings = triggers.map((t) => {
        const comp = bestMatch(text, competencies);
        return {
          category: 'training',
          title: `Kesulitan mencapai target ${t.name}`,
          detail: STUB_NOTE,
          competencyId: comp ? comp.id : null,
          performanceRecordId: t.id,
          confidence: 0.2,
        };
      });
      if (NON_TRAINING_HINTS.some((h) => text.includes(h))) {
        // BT-23: temuan non-training direkam sebagai item tertaut
        findings.push({ category: 'non_training', title: 'Kendala non-training disebut (SOP/tools/sistem)', detail: STUB_NOTE, confidence: 0.2 });
      }
      return { findings, usage: usage('analyze_tna') };
    },

    async assistantReply(args) {
      return { ...stubAssistantReply(args), usage: usage('assistant_reply') };
    },
  };
}

module.exports = { createStubProvider, STUB_NOTE };
