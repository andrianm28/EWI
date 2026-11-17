'use strict';
// Port komponen AI ELGOS. T3 (dibangun ulang ramping / paket bersama / lewat API EliteMentor) BELUM diputuskan,
// jadi seluruh pemanggil hanya bergantung pada kontrak di bawah. Ganti implementasi lewat AI_PROVIDER
// tanpa menyentuh modul DNA/TNA.
//
// Kontrak provider:
//   name: string
//   nextQuestion({ submodule, askedCount, context }) -> string | null      (null = wawancara selesai)
//   assessCompetencies({ transcript, competencies }) -> [{ competencyId, score 0-4, confidence 0-1, evidence }]
//   analyzeTna({ transcript, triggers, competencies }) -> [{ category, title, detail, competencyId?, performanceRecordId? }]
const { createStubProvider } = require('./stub-provider');

const PROVIDERS = { stub: createStubProvider };

function createAiProvider(name = 'stub') {
  const factory = PROVIDERS[name];
  if (!factory) throw new Error(`AI_PROVIDER tidak dikenal: ${name} (menunggu keputusan T3)`);
  return factory();
}

module.exports = { createAiProvider, PROVIDERS };
