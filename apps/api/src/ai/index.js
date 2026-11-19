'use strict';
// Port komponen AI ELGOS (T3 ★A: dibangun ramping di ELGOS; PK-06: penyedia sungguhan Bedrock).
// Modul DNA/TNA hanya bergantung pada kontrak di bawah. Penyedia dipilih lewat AI_PROVIDER.
//
// Kontrak penyedia (semua metode async):
//   name, model: string
//   verify() -> true | throw AiError                     (cek kredensial saat boot, tanpa memanggil model)
//   nextQuestion({ submodule, transcript, askedCount, context, maxQuestions })
//     -> { question: string | null, usage: UsageRecord[] }                 (null = wawancara selesai)
//   assessCompetencies({ transcript, competencies })
//     -> { results: [{ competencyId, score 0-4, confidence 0-1, evidence }], usage }
//   analyzeTna({ transcript, triggers, competencies })
//     -> { findings: [{ category training|non_training, title, detail, competencyId?, performanceRecordId?, confidence? }], usage }
//   assistantReply({ view, roleLabel, facts, pages: [{ key, label }], question })                     (B17)
//     -> { answer: string | null, page: string | null, refused: boolean, usage }      (answer null = tidak tahu)
//   UsageRecord = { operation, provider, model, inputTokens, outputTokens, latencyMs }   (satu per panggilan model, R3-6)
//
// context = { competencies, triggers } sudah diminimalkan oleh pemanggil (lihat aiContext di modul interviews):
// hanya kompetensi jabatan dan target milik karyawan yang diwawancarai (PM-10 ★A).
const { createStubProvider } = require('./stub-provider');
const { createBedrockProvider } = require('./bedrock-provider');

const PROVIDERS = {
  stub: () => createStubProvider(),
  bedrock: (cfg, deps) => createBedrockProvider(cfg, deps),
};

/** cfg: config.ai dari loadConfig, atau string nama penyedia (kompatibel lama). */
function createAiProvider(cfg = 'stub', deps = {}) {
  const config = typeof cfg === 'string' ? { provider: cfg } : cfg;
  const factory = PROVIDERS[config.provider];
  if (!factory) throw new Error(`AI_PROVIDER tidak dikenal: ${config.provider} (pilihan: ${Object.keys(PROVIDERS).join(', ')})`);
  return factory(config, deps);
}

/** Estimasi biaya (USD) dari harga per sejuta token di config; null bila harga tidak diisi. */
function estimateCost(usage, cfg = {}) {
  if (usage.provider === 'stub') return 0;
  const pin = cfg.priceInputPerMTok; const pout = cfg.priceOutputPerMTok;
  if (pin === null || pin === undefined || pout === null || pout === undefined) return null;
  return Number(((usage.inputTokens * pin + usage.outputTokens * pout) / 1e6).toFixed(6));
}

module.exports = { createAiProvider, estimateCost, PROVIDERS };
