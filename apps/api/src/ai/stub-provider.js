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
  // B6 (A10): sesi untuk gap kompetensi dibuka dengan topiknya
  if (!triggers.length && context.focus && context.focus.label) {
    if (askedCount === 0) return `Kita membahas kompetensi "${context.focus.label}". Ceritakan pekerjaan terakhir Anda yang terkait: bagian mana yang paling sulit?`;
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
  };
}

module.exports = { createStubProvider, STUB_NOTE };
