'use strict';
const { loadConfig } = require('./config/env');
const { createDb } = require('./db');
const { createStores } = require('./db/stores');
const { createApp } = require('./app');

async function main() {
  const config = loadConfig(); // fail-fast bila secret/DB tidak diisi
  const db = createDb(config);
  await db.authenticate();
  const app = createApp({ config, stores: createStores(db, { encryption: config.encryption }) });
  app.listen(config.port, () => console.log(`ewi-api listening on :${config.port}`));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
