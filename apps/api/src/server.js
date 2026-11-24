'use strict';
const { loadConfig } = require('./config/env');
const { createDb } = require('./db');
const { createStores } = require('./db/stores');
const { createApp } = require('./app');
const { createAiProvider } = require('./ai');

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
  // PK-06: gagal saat boot dengan pesan jelas bila kredensial penyedia AI tidak ada
  const ai = createAiProvider(config.ai);
  await ai.verify();
  console.log(`AI: ${ai.name}${ai.model && ai.model !== ai.name ? ` (${ai.model}, ${config.ai.processing})` : ''}`);
  const app = createApp({ config, stores, ai });
  const server = app.listen(config.port, () => console.log(`ewi-api listening on :${config.port}`));
  // B19: upgrade WS /api/voice/sessions/:id/stream (gateway suara). Penyedia suara tanpa kunci di log.
  app.locals.voice.attach(server);
  console.log(`Suara: ${app.locals.voice.provider.name}${app.locals.voice.provider.location ? ` (${app.locals.voice.provider.model}, ${app.locals.voice.provider.location})` : ''}`);
  // B19 4.3: SIGTERM menyimpan giliran suara yang terbuka dan mencatat biaya sebelum proses berhenti.
  process.once('SIGTERM', () => {
    app.locals.voice.shutdown().catch(() => {}).finally(() => server.close(() => process.exit(0)));
    setTimeout(() => process.exit(0), 10000).unref();
  });
  // PK-14: jalankan ulang job analisis yang tertinggal (proses mati di tengah jalan) atau gagal dan masih boleh diulang.
  const sweep = () => app.locals.analysis.sweep().catch((e) => console.error(`Penyapu analisis gagal: ${e.message}`));
  setTimeout(sweep, 5000).unref();
  setInterval(sweep, 60000).unref();
}

if (require.main === module) main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

module.exports = { checkDbRole };
