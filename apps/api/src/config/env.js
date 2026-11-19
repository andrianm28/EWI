'use strict';
// Konfigurasi dibaca sekali dan divalidasi saat boot. Tidak ada fallback untuk secret
// (keputusan B22: ELGOS punya secret & audience JWT sendiri, tanpa fallback hardcoded).
require('dotenv').config();

// Domain internal yang boleh menerima email dari staging bila MAIL_ALLOWED_DOMAINS kosong.
const STAGING_DEFAULT_MAIL_DOMAINS = Object.freeze(['eliteacademy.id', 'elitery.com']);

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
  // PK-07 / I-5 (PD-19 butir 1): staging hanya boleh mengirim email ke domain internal. Kosong di staging =
  // domain internal bawaan; '*' = tanpa batas (hanya untuk produksi, ditolak di staging).
  const appEnv = env.EWI_ENV || '';
  let allowedDomains = (env.MAIL_ALLOWED_DOMAINS || '').split(',').map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
  if (!allowedDomains.length && appEnv === 'staging') allowedDomains = [...STAGING_DEFAULT_MAIL_DOMAINS];
  if (allowedDomains.includes('*')) {
    if (appEnv === 'staging') errors.push("MAIL_ALLOWED_DOMAINS='*' tidak boleh di staging");
    allowedDomains = [];
  }
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
      // B7: penugasan course ke EliteMentor. Kontrak FR-EM belum final, jadi mati sampai dinyalakan dengan sengaja.
      assignmentsEnabled: env.ELITEMENTOR_ASSIGNMENTS_ENABLED === 'true',
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
      // kosong = semua domain boleh (produksi, dev dengan MAIL_PROVIDER=log)
      allowedDomains: Object.freeze(allowedDomains),
    }),
    appEnv,
    db: Object.freeze({
      requireNonSuperuser: env.DB_REQUIRE_NON_SUPERUSER === 'true',
    }),
    jwt: Object.freeze({
      secret,
      audience: env.EWI_JWT_AUDIENCE || 'ewi',
      issuer: env.EWI_JWT_ISSUER || 'ewi-api',
      ttl: env.EWI_JWT_TTL || '8h',
    }),
  });
}

// PD-2b (user, 19 Nov 20.28 WIB): lokasi pemrosesan AI dipilih yang latensinya paling rendah ke Indonesia dan memenuhi
// spek. Urutan untuk teks: Jakarta (ap-southeast-3) bila model tersedia in-region, lalu Singapura (ap-southeast-1),
// lalu profil inferensi lintas region APAC (apac.). Profil di luar APAC (global., us., eu., ...) ditolak kecuali
// AI_ALLOW_CROSS_REGION=true diputuskan kemudian.
const JAKARTA = 'ap-southeast-3';
const SINGAPORE = 'ap-southeast-1';
const DEFAULT_AI_REGIONS = [JAKARTA, SINGAPORE];
const PROFILE_PREFIX = /(?:^|inference-profile\/)(global|apac|us|us-gov|eu|au|in|jp|ca)\./i;

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
  const allowedRegions = (env.AI_ALLOWED_REGIONS || DEFAULT_AI_REGIONS.join(',')).split(',').map((r) => r.trim()).filter(Boolean);
  const region = env.BEDROCK_REGION || JAKARTA;
  const modelId = (env.BEDROCK_MODEL_ID || '').trim();
  let extraFields = null;
  if (provider === 'bedrock') {
    if (!modelId) errors.push('BEDROCK_MODEL_ID wajib diisi untuk AI_PROVIDER=bedrock (ID model Claude, lihat docs/ewi/ai-teks.md)');
    if (!allowCrossRegion && !allowedRegions.includes(region)) {
      errors.push(`BEDROCK_REGION harus salah satu dari ${allowedRegions.join(', ')} (PD-2b)`);
    }
    const profile = (modelId.match(PROFILE_PREFIX) || [])[1];
    if (!allowCrossRegion && profile && profile.toLowerCase() !== 'apac') {
      errors.push(`BEDROCK_MODEL_ID memakai profil lintas region "${profile}."; PD-2b hanya mengizinkan model in-region Jakarta/Singapura atau profil apac.`);
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
  // Lokasi pemrosesan untuk log dan DPIA: in-region atau profil lintas region (mis. apac)
  const profile = (modelId.match(PROFILE_PREFIX) || [])[1];
  const processing = profile ? `cross-region:${profile.toLowerCase()}` : `in-region:${region}`;
  return Object.freeze({ provider, region, modelId, extraFields, allowCrossRegion, allowedRegions, processing, ...nums });
}

module.exports = { loadConfig, loadAiConfig, JAKARTA, SINGAPORE, STAGING_DEFAULT_MAIL_DOMAINS };
