#!/usr/bin/env node
'use strict';
// PK-14: jalankan sekali semua job analisis wawancara yang antre, tertinggal, atau gagal dan masih boleh diulang.
// Server API sudah menyapu tiap menit; skrip ini untuk pemulihan manual atau dipanggil timer bila diperlukan.
//   node apps/api/scripts/run-analysis.js [--limit 50]
require('dotenv').config();
const { loadConfig } = require('../src/config/env');
const { createDb } = require('../src/db');
const { createStores } = require('../src/db/stores');
const { createAiProvider } = require('../src/ai');
const { createAnalysisRunner } = require('../src/modules/interviews/analysis');

async function main() {
  const args = process.argv.slice(2);
  const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : 50;
  const config = loadConfig();
  const db = createDb(config);
  try {
    const ai = createAiProvider(config.ai);
    await ai.verify();
    const runner = createAnalysisRunner({ stores: createStores(db, { encryption: config.encryption }), ai, aiConfig: config.ai });
    const ran = await runner.sweep({ limit });
    console.log(`Job analisis dijalankan: ${ran}`);
  } finally {
    await db.close();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
