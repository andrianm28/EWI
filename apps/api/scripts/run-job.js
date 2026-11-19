'use strict';
// Jalankan satu job terjadwal lalu keluar (PD-15 A): `node scripts/run-job.js <nama>`.
// Dipanggil timer systemd di etavm2 sebagai container sekali jalan. Kode keluar 0 = sukses,
// 1 = gagal (systemd mencatatnya), 2 = nama job tidak dikenal.
const { loadConfig } = require('../src/config/env');
const { createDb } = require('../src/db');
const { createStores } = require('../src/db/stores');
const { createMailer } = require('../src/integrations/mailer');
const { JOBS, getJob } = require('../src/jobs');

async function main(argv = process.argv.slice(2)) {
  const name = argv[0];
  const job = getJob(name);
  if (!job) {
    console.error(`Job tidak dikenal: ${name || '(kosong)'}. Pilihan: ${Object.keys(JOBS).join(', ')}`);
    return 2;
  }
  const config = loadConfig();
  const db = createDb(config);
  try {
    await db.authenticate();
    const stores = createStores(db, { encryption: config.encryption });
    const started = Date.now();
    const summary = await job({
      stores, mailer: createMailer(config.mail), appBaseUrl: config.appBaseUrl, now: new Date(), log: (m) => console.error(`[job:${name}] ${m}`),
    });
    console.log(JSON.stringify({ job: name, ms: Date.now() - started, ...summary }));
    return summary && summary.failed ? 1 : 0;
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { main };
