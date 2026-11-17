'use strict';
const { loadConfig } = require('./config/env');
const { createDb } = require('./db');
const { createStores } = require('./db/stores');
const { createApp } = require('./app');

/**
 * PK-07 / P1-7 (PD-8 opsi A): aplikasi tidak boleh tersambung sebagai superuser, karena superuser mengabaikan
 * hak tabel dan bisa mematikan trigger audit. DB_REQUIRE_NON_SUPERUSER=true menolak boot; selain itu peringatan
 * di produksi (sampai role aplikasi dibuat di server, A7 butir 1).
 */
async function checkDbRole(config, stores) {
  const role = await stores.dbRole();
  if (!role || !role.superuser) return;
  const msg = `user database aplikasi "${role.user}" adalah superuser; pakai role aplikasi khusus (DB_USER) dan DB_MIGRATION_USER untuk migrasi`;
  if (config.db.requireNonSuperuser) throw new Error(`Konfigurasi tidak valid: ${msg}`);
  if (config.nodeEnv === 'production') console.warn(`PERINGATAN (P1-7): ${msg}`);
}

async function main() {
  const config = loadConfig(); // fail-fast bila secret/DB tidak diisi
  const db = createDb(config);
  await db.authenticate();
  const stores = createStores(db, { encryption: config.encryption });
  await checkDbRole(config, stores);
  const app = createApp({ config, stores });
  app.listen(config.port, () => console.log(`ewi-api listening on :${config.port}`));
}

if (require.main === module) main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

module.exports = { checkDbRole };
