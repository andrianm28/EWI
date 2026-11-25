'use strict';
// B18 QA malam, titik masuk `npm run qa:malam -w apps/api -- [--siapkan-db] [--persona <folder>] [--keluaran <folder>]`
// (spek 5.3). Membaca argumen dan env, menyiapkan database _qa, menjalankan jalankan.js, lalu menulis laporan.
// Env: AI_PROVIDER, BEDROCK_REGION, BEDROCK_MODEL_ID, AI_PRICE_*_PER_MTOK, QA_MALAM_MAX_TOKENS, DATABASE_URL (…_qa).
// Kredensial AWS diambil penyedia dari rantai bawaan SDK: OIDC di workflow, SSO/STS di run manual. Tidak pernah
// kunci IAM aplikasi, dan tidak pernah dari sesi agen.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
// Dimuat paling awal: config/env.js menjalankan dotenv, jadi isi apps/api/.env sudah ada di process.env saat
// pengaman memeriksanya (termasuk kunci AWS yang mungkin tertinggal di sana).
const { loadConfig } = require('../../src/config/env');
const { createAiProvider } = require('../../src/ai');
const { createDb } = require('../../src/db');
const { jalankanQaMalam, pengaman, cekDatabase, cekKonfigurasi, namaDatabase, galatPengaman } = require('./jalankan');
const { muatPersona, FOLDER_PERSONA } = require('./persona');
const { laporanMarkdown, namaBerkas } = require('./laporan');
const { KODE } = require('./pemeriksa');
const { galatQa } = require('./galat');

// Galat yang pesannya sudah cukup jelas tanpa jejak tumpukan.
const PESAN_SINGKAT = new Set(['QA_PENGAMAN', 'QA_KONFIGURASI', 'QA_PERSONA', 'QA_ARGUMEN', 'CONFIG_INVALID']);
// Migrasi biasanya memakai URL atau user lain (src/db/urls.js); di sini dibuang supaya migrasi mengenai database yang sama.
const ENV_MIGRASI = ['MIGRATION_DATABASE_URL', 'DB_MIGRATION_USER', 'DB_MIGRATION_PASSWORD'];

function bacaArgumen(argv) {
  const opsi = { siapkanDb: false, persona: null, keluaran: path.join(process.cwd(), 'qa-malam-hasil') };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--siapkan-db') opsi.siapkanDb = true;
    else if (a === '--persona' || a === '--keluaran') {
      if (!argv[i + 1]) throw galatQa('QA_ARGUMEN', `${a} butuh nama folder`);
      opsi[a.slice(2)] = path.resolve(argv[i += 1]);
    } else throw galatQa('QA_ARGUMEN', `Argumen tidak dikenal: ${a}`);
  }
  return opsi;
}

function bacaMaksToken(env) {
  if (!env.QA_MALAM_MAX_TOKENS) return Infinity;
  const n = Number(env.QA_MALAM_MAX_TOKENS);
  if (!Number.isFinite(n) || n <= 0) throw galatQa('QA_KONFIGURASI', 'QA_MALAM_MAX_TOKENS harus angka > 0');
  return n;
}

/**
 * Kunci akses AWS tanpa session token adalah kunci IAM jangka panjang, misalnya milik aplikasi (KMS/SES). Ditolak.
 * Diperiksa di env run dan di process.env, karena SDK AWS membaca kredensial dari process.env.
 */
function cekKredensialAws(ai, ...daftarEnv) {
  if (ai.name !== 'bedrock') return;
  if (daftarEnv.some((e) => e.AWS_ACCESS_KEY_ID && !e.AWS_SESSION_TOKEN)) {
    throw galatPengaman('kunci akses AWS jangka panjang terdeteksi (AWS_ACCESS_KEY_ID tanpa AWS_SESSION_TOKEN); pakai SSO/STS atau OIDC');
  }
}

function commitSaatIni(env) {
  // Workflow men-checkout dev, sedangkan GITHUB_SHA adalah commit main tempat berkas workflow berada; git dibaca lebih dulu.
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return env.GITHUB_SHA ? env.GITHUB_SHA.slice(0, 12) : null;
  }
}

/** Menghapus schema lalu menjalankan migrasi. Hanya untuk database berakhiran _qa, dicek di env dan di koneksi. */
async function siapkanDb(db, envRun) {
  const dariEnv = namaDatabase(envRun.DATABASE_URL);
  if (!/_qa$/.test(dariEnv)) throw galatPengaman(`--siapkan-db hanya untuk database berakhiran _qa, bukan "${dariEnv}"`);
  const tersambung = await cekDatabase(db);
  if (tersambung !== dariEnv) throw galatPengaman(`database tersambung "${tersambung}" berbeda dengan DATABASE_URL ("${dariEnv}")`);
  const schema = envRun.DB_SCHEMA || 'ewi';
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw galatPengaman(`nama schema tidak valid: ${schema}`);
  await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  const envMigrasi = Object.fromEntries(Object.entries(envRun).filter(([k]) => !ENV_MIGRASI.includes(k)));
  execFileSync('npm', ['run', 'migrate'], { cwd: path.join(__dirname, '../..'), env: envMigrasi, stdio: 'inherit' });
}

/**
 * Mengembalikan kode keluar (KODE di pemeriksa.js): 0 lulus, 1 gagal kualitas, 2 gagal infrastruktur atau konfigurasi.
 * deps.buatPenyedia bisa diganti test, supaya test pengaman bedrock tidak pernah membuat klien AWS sungguhan.
 */
async function main(argv, env = process.env, log = { tulis: console.log, galat: console.error }, deps = { buatPenyedia: createAiProvider }) {
  // Token uji ditandatangani dan diperiksa di proses ini saja, jadi selalu secret acak per run, tidak pernah dari env.
  const envRun = { ...env, EWI_JWT_SECRET: crypto.randomBytes(32).toString('hex') };
  let db;
  try {
    const opsi = bacaArgumen(argv);
    pengaman(envRun);
    const maksToken = bacaMaksToken(envRun);
    const persona = muatPersona(opsi.persona || FOLDER_PERSONA);
    const config = loadConfig(envRun);
    const ai = deps.buatPenyedia(config.ai);
    cekKonfigurasi(ai, config.ai);
    cekKredensialAws(ai, envRun, process.env);
    db = createDb({ databaseUrl: config.databaseUrl, dbSchema: config.dbSchema });
    if (opsi.siapkanDb) await siapkanDb(db, envRun);
    await ai.verify();
    const laporan = await jalankanQaMalam({ db, config, ai, persona, env: envRun, maksToken, commit: commitSaatIni(envRun) });
    const nama = namaBerkas(new Date(laporan.mulai));
    fs.mkdirSync(opsi.keluaran, { recursive: true });
    fs.writeFileSync(path.join(opsi.keluaran, `${nama}.json`), `${JSON.stringify(laporan, null, 2)}\n`);
    const md = laporanMarkdown(laporan);
    fs.writeFileSync(path.join(opsi.keluaran, `${nama}.md`), md);
    log.tulis(md);
    return laporan.kode;
  } catch (e) {
    // Konfigurasi, pengaman, dan galat AI (kredensial, kuota, region) dicetak singkat; galat lain dengan jejaknya.
    log.galat(PESAN_SINGKAT.has(e.code) || /^AI_/.test(e.code || '') ? `${e.code}: ${e.message}` : e.stack || String(e));
    return KODE.GAGAL_INFRA;
  } finally {
    if (db) await db.close();
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).then((kode) => { process.exitCode = kode; });
}

module.exports = { main };
