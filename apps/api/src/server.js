'use strict';
const { loadConfig } = require('./config/env');
const { createDb } = require('./db');
const { createStores } = require('./db/stores');
const { createApp } = require('./app');
const { createAiProvider } = require('./ai');

async function main() {
  const config = loadConfig(); // fail-fast bila secret/DB tidak diisi
  const db = createDb(config);
  await db.authenticate();
  // PK-06: gagal saat boot dengan pesan jelas bila kredensial penyedia AI tidak ada
  const ai = createAiProvider(config.ai);
  await ai.verify();
  console.log(`AI: ${ai.name}${ai.model && ai.model !== ai.name ? ` (${ai.model}, ${config.ai.region})` : ''}`);
  const app = createApp({ config, stores: createStores(db, { encryption: config.encryption }), ai });
  app.listen(config.port, () => console.log(`ewi-api listening on :${config.port}`));
  // PK-14: jalankan ulang job analisis yang tertinggal (proses mati di tengah jalan) atau gagal dan masih boleh diulang.
  const sweep = () => app.locals.analysis.sweep().catch((e) => console.error(`Penyapu analisis gagal: ${e.message}`));
  setTimeout(sweep, 5000).unref();
  setInterval(sweep, 60000).unref();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
