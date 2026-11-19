'use strict';
// Konfigurasi dibaca sekali dan divalidasi saat boot. Tidak ada fallback untuk secret
// (keputusan B22: ELGOS punya secret & audience JWT sendiri, tanpa fallback hardcoded).
require('dotenv').config();

function loadConfig(env = process.env) {
  const errors = [];
  const secret = env.EWI_JWT_SECRET || '';
  if (secret.length < 32) errors.push('EWI_JWT_SECRET wajib diisi, minimal 32 karakter');
  if (env.SESSION_SECRET && secret === env.SESSION_SECRET) {
    errors.push('EWI_JWT_SECRET tidak boleh sama dengan SESSION_SECRET EliteMentor');
  }
  if (!env.DATABASE_URL && env.NODE_ENV !== 'test') errors.push('DATABASE_URL wajib diisi');
  const mailProvider = env.MAIL_PROVIDER || (env.NODE_ENV === 'test' ? 'memory' : 'log');
  if (!['ses', 'log', 'memory'].includes(mailProvider)) errors.push('MAIL_PROVIDER harus ses, log, atau memory');
  // R3-2: di produksi link masuk harus benar-benar terkirim, bukan ditulis ke log
  if (env.NODE_ENV === 'production' && mailProvider !== 'ses') errors.push('MAIL_PROVIDER=ses wajib di produksi');
  if (mailProvider === 'ses' && !env.MAIL_FROM) errors.push('MAIL_FROM wajib diisi untuk MAIL_PROVIDER=ses');
  // R2-3: enkripsi kolom per tenant. Produksi wajib KMS; dev/staging di luar KMS memakai kunci induk lokal dari env.
  const encProvider = env.ENCRYPTION_PROVIDER || 'local';
  if (!['local', 'kms'].includes(encProvider)) errors.push('ENCRYPTION_PROVIDER harus local atau kms');
  if (env.NODE_ENV === 'production' && encProvider !== 'kms') errors.push('ENCRYPTION_PROVIDER=kms wajib di produksi');
  let localMasterKey = null;
  if (encProvider === 'local') {
    const raw = env.EWI_LOCAL_MASTER_KEY || '';
    localMasterKey = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : (raw ? Buffer.from(raw, 'base64') : null);
    if (localMasterKey && localMasterKey.length !== 32) errors.push('EWI_LOCAL_MASTER_KEY harus 32 byte (64 hex atau base64)');
    if (!localMasterKey) {
      // hanya test yang boleh tanpa kunci: kunci acak per proses (data uji dibuang setiap run)
      if (env.NODE_ENV === 'test') localMasterKey = require('crypto').randomBytes(32);
      else errors.push('EWI_LOCAL_MASTER_KEY wajib diisi untuk ENCRYPTION_PROVIDER=local (buat: openssl rand -hex 32)');
    }
  }
  const uploadMaxMb = Number(env.EWI_UPLOAD_MAX_MB || 25);
  if (!Number.isFinite(uploadMaxMb) || uploadMaxMb <= 0 || uploadMaxMb > 200) errors.push('EWI_UPLOAD_MAX_MB harus angka 1 sampai 200');
  const ai = loadAiConfig(env, errors);
  if (errors.length) {
    const err = new Error(`Konfigurasi tidak valid:\n- ${errors.join('\n- ')}`);
    err.code = 'CONFIG_INVALID';
    throw err;
  }
  return Object.freeze({
    nodeEnv: env.NODE_ENV || 'development',
    port: Number(env.PORT || 4100),
    databaseUrl: env.DATABASE_URL,
    dbSchema: env.DB_SCHEMA || 'ewi',
    // Daftar organisasi di halaman login. Hanya untuk dev/staging: di produksi daftar klien tidak boleh terbuka publik.
    loginTenantPicker: env.LOGIN_TENANT_PICKER === 'true',
    // PK-06: penyedia AI teks. stub = tiruan deterministik (test/dev), bedrock = Amazon Bedrock (PD-1 A, PD-2 A)
    aiProvider: ai.provider,
    ai,
    corsOrigin: (env.CORS_ORIGIN || '').split(',').filter(Boolean),
    elitementor: Object.freeze({
      baseUrl: env.ELITEMENTOR_API_URL || '',
      tokenUrl: env.ELITEMENTOR_TOKEN_URL || '',
      clientId: env.ELITEMENTOR_CLIENT_ID || '',
      clientSecret: env.ELITEMENTOR_CLIENT_SECRET || '',
      webhookSecret: env.ELITEMENTOR_WEBHOOK_SECRET || '',
    }),
    // Alamat web untuk link masuk (R3-2), mis. https://dev-elgos.eliteacademy.id
    appBaseUrl: (env.APP_BASE_URL || (env.CORS_ORIGIN || '').split(',')[0] || 'http://localhost:5174').replace(/\/$/, ''),
    encryption: Object.freeze({
      provider: encProvider,
      localMasterKey,
      kmsAliasPrefix: env.KMS_KEY_ALIAS_PREFIX || 'elgos-tenant',
      region: env.KMS_REGION || env.AWS_REGION || 'ap-southeast-3',
    }),
    // B14: folder berkas dokumentasi pelatihan (volume di VPS). Kosong = unggah dimatikan (API menjawab 501).
    uploads: Object.freeze({ dir: env.EWI_UPLOAD_DIR || '', maxBytes: Math.round(uploadMaxMb * 1024 * 1024) }),
    mail: Object.freeze({
      provider: mailProvider,
      from: env.MAIL_FROM || '',
      region: env.MAIL_REGION || env.AWS_REGION || 'ap-southeast-3',
    }),
    jwt: Object.freeze({
      secret,
      audience: env.EWI_JWT_AUDIENCE || 'ewi',
      issuer: env.EWI_JWT_ISSUER || 'ewi-api',
      ttl: env.EWI_JWT_TTL || '8h',
    }),
  });
}

// PD-2 (★A): transkrip hanya diproses di region Singapura. ID profil inferensi lintas region (global., apac., us., ...)
// mengirim permintaan ke region lain, jadi ditolak kecuali AI_ALLOW_CROSS_REGION=true diputuskan kemudian.
const SINGAPORE = 'ap-southeast-1';
const CROSS_REGION_PREFIX = /(^|inference-profile\/)(global|apac|us|us-gov|eu|au|in|jp|ca)\./i;

function numberOr(raw, fallback, { min = 0 } = {}) {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min ? n : NaN;
}

function loadAiConfig(env, errors) {
  const production = env.NODE_ENV === 'production';
  // Tiruan menjadi bawaan di luar produksi; produksi wajib model sungguhan.
  const provider = env.AI_PROVIDER || (production ? 'bedrock' : 'stub');
  if (!['stub', 'bedrock'].includes(provider)) errors.push('AI_PROVIDER harus stub atau bedrock');
  if (production && provider === 'stub') errors.push('AI_PROVIDER=stub tidak boleh di produksi (pakai bedrock)');
  const allowCrossRegion = env.AI_ALLOW_CROSS_REGION === 'true';
  const region = env.BEDROCK_REGION || SINGAPORE;
  const modelId = (env.BEDROCK_MODEL_ID || '').trim();
  let extraFields = null;
  if (provider === 'bedrock') {
    if (!modelId) errors.push('BEDROCK_MODEL_ID wajib diisi untuk AI_PROVIDER=bedrock (ID model Claude yang aktif di ap-southeast-1, lihat docs/ewi/ai-teks.md)');
    if (!allowCrossRegion && region !== SINGAPORE) errors.push(`BEDROCK_REGION harus ${SINGAPORE} (PD-2: pemrosesan AI hanya di Singapura)`);
    if (!allowCrossRegion && CROSS_REGION_PREFIX.test(modelId)) {
      errors.push('BEDROCK_MODEL_ID memakai profil inferensi lintas region; PD-2 hanya mengizinkan model in-region Singapura');
    }
    if (env.BEDROCK_EXTRA_FIELDS) {
      try { extraFields = JSON.parse(env.BEDROCK_EXTRA_FIELDS); } catch { errors.push('BEDROCK_EXTRA_FIELDS harus JSON yang valid'); }
    }
  }
  const nums = {
    maxQuestions: numberOr(env.AI_MAX_QUESTIONS, 8, { min: 1 }),
    timeoutMs: numberOr(env.AI_TIMEOUT_MS, 30000, { min: 1000 }),
    priceInputPerMTok: numberOr(env.AI_PRICE_INPUT_PER_MTOK, null),
    priceOutputPerMTok: numberOr(env.AI_PRICE_OUTPUT_PER_MTOK, null),
  };
  for (const [k, v] of Object.entries(nums)) if (Number.isNaN(v)) errors.push(`Nilai ${k} untuk AI tidak valid`);
  return Object.freeze({ provider, region, modelId, extraFields, allowCrossRegion, ...nums });
}

module.exports = { loadConfig, loadAiConfig, SINGAPORE };
