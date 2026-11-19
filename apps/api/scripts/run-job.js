'use strict';
// Jalankan satu job lalu keluar:  node scripts/run-job.js import-batches-cleanup
const { loadConfig } = require('../src/config/env');
const { createDb } = require('../src/db');
const { createStores } = require('../src/db/stores');
const { runJob, JOBS } = require('../src/jobs');

(async () => {
  const name = process.argv[2];
  if (!name) {
    console.error(`Pakai: node scripts/run-job.js <nama>. Tersedia: ${Object.keys(JOBS).join(', ')}`);
    process.exit(2);
  }
  const config = loadConfig();
  const db = createDb(config);
  try {
    const result = await runJob(name, { stores: createStores(db, { encryption: config.encryption }) });
    console.log(JSON.stringify({ job: name, at: new Date().toISOString(), result }));
  } finally {
    await db.close();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
