#!/usr/bin/env node
'use strict';
// Uji asap penyedia AI teks (PK-06) dengan data fiktif. Tidak menyentuh database dan tidak memakai data karyawan.
// Pemakaian (di mesin yang punya kredensial AWS akun ELGOS):
//   AI_PROVIDER=bedrock BEDROCK_MODEL_ID=<id model> node apps/api/scripts/ai-smoke.js [--record <folder>]
// --record menyimpan respons Converse mentah sebagai fixture test kontrak (tests/fixtures/bedrock).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { BedrockRuntimeClient } = require('@aws-sdk/client-bedrock-runtime');
const { loadAiConfig } = require('../src/config/env');
const { createAiProvider, estimateCost } = require('../src/ai');

const args = process.argv.slice(2);
const recordDir = args.includes('--record') ? args[args.indexOf('--record') + 1] : null;

const context = {
  competencies: [
    { id: 'c-1', name: 'Komunikasi pelanggan', definition: 'Menjelaskan solusi kepada pelanggan dengan jelas dan empatik', indicators: ['Merangkum keluhan', 'Memberi estimasi waktu'], requiredScore: 3 },
    { id: 'c-2', name: 'Memahami kontrak proyek', definition: 'Membaca klausul SLA dan cakupan layanan', indicators: ['Menyebut batas waktu respons per prioritas'], requiredScore: 3 },
  ],
  triggers: [{ id: 'r-1', metricType: 'sla', name: 'Respons tiket prioritas tinggi', target: 85, actual: 72, period: '2026-10', direction: 'higher_better', unit: '%' }],
};
const answers = [
  'Biasanya karena saya ragu tiket itu termasuk prioritas tinggi atau tidak. Saya belum hafal batas SLA di kontrak pelanggan.',
  'Selain itu aplikasi tiket sering lambat antara jam 9 dan 11 pagi, jadi update status tertunda.',
  'Saya pernah ikut onboarding, tapi materi kontrak hanya sekilas.',
];

async function main() {
  const errors = [];
  const cfg = loadAiConfig(process.env, errors);
  if (errors.length) throw new Error(`Konfigurasi AI tidak valid:\n- ${errors.join('\n- ')}`);
  if (cfg.provider !== 'bedrock') throw new Error('Set AI_PROVIDER=bedrock untuk uji asap');

  const real = new BedrockRuntimeClient({ region: cfg.region, maxAttempts: 3 });
  let n = 0;
  const client = {
    config: real.config,
    async send(cmd, opts) {
      const res = await real.send(cmd, opts);
      if (recordDir) {
        fs.mkdirSync(recordDir, { recursive: true });
        const file = path.join(recordDir, `rekaman-${String(++n).padStart(2, '0')}.json`);
        fs.writeFileSync(file, JSON.stringify(res, null, 2));
      }
      return res;
    },
  };
  const ai = createAiProvider(cfg, { client });
  await ai.verify();
  console.log(`Penyedia: ${ai.name}, model ${ai.model}, region ${cfg.region}`);

  const usage = [];
  const transcript = [];
  for (let i = 0; i <= answers.length; i += 1) {
    const askedCount = transcript.filter((t) => t.speaker === 'ai').length;
    const q = await ai.nextQuestion({ submodule: 'tna', transcript, askedCount, context, maxQuestions: 4 });
    usage.push(...q.usage);
    if (!q.question) { console.log('\nAI: [selesai]'); break; }
    console.log(`\nAI: ${q.question}`);
    transcript.push({ speaker: 'ai', text: q.question });
    if (i < answers.length) { console.log(`Karyawan: ${answers[i]}`); transcript.push({ speaker: 'human', text: answers[i] }); }
  }
  const a = await ai.analyzeTna({ transcript, triggers: context.triggers, competencies: context.competencies });
  usage.push(...a.usage);
  console.log('\nTemuan:');
  for (const f of a.findings) console.log(`- [${f.category}] ${f.title} (kompetensi ${f.competencyId || '-'}, target ${f.performanceRecordId || '-'}, keyakinan ${f.confidence})`);

  console.log('\nPemakaian token per panggilan:');
  for (const u of usage) console.log(`- ${u.operation}: masuk ${u.inputTokens}, keluar ${u.outputTokens}, ${u.latencyMs} ms, biaya ${estimateCost(u, cfg) ?? '-'}`);
  const tin = usage.reduce((s, u) => s + u.inputTokens, 0); const tout = usage.reduce((s, u) => s + u.outputTokens, 0);
  console.log(`Total: ${usage.length} panggilan, masuk ${tin}, keluar ${tout}`);
  if (!a.findings.length) throw new Error('Analisis tidak menghasilkan temuan');
  if (!usage.every((u) => u.inputTokens > 0)) throw new Error('Token masuk tidak tercatat');
  console.log('\nUJI ASAP LULUS');
}

main().catch((e) => { console.error(`UJI ASAP GAGAL: ${e.code ? `${e.code}: ` : ''}${e.message}`); process.exit(1); });
