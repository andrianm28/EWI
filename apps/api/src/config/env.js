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
  // PK-16 / PD-10 ★B: di produksi semua login lewat link email. Login password hanya untuk dev/staging.
  const isProd = env.NODE_ENV === 'production';
  if (isProd && env.AUTH_PASSWORD_LOGIN === 'true') errors.push('AUTH_PASSWORD_LOGIN=true tidak diizinkan di produksi (PD-10)');
  // Keputusan user 19 Nov (PD-10 B): login lewat OTP link email. Sandi lokal hanya bila dinyalakan eksplisit di dev/uji.
  const allowLocalLogin = !isProd && envFlag(env.AUTH_PASSWORD_LOGIN, false);
  const etaAdminEmails = (env.ETA_ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (etaAdminEmails.some((e) => !/^[^@\s]+@[^@\s]+$/.test(e))) errors.push('ETA_ADMIN_EMAILS berisi alamat email yang tidak valid');
  const trustProxy = parseTrustProxy(env.TRUST_PROXY);
  if (trustProxy === undefined) errors.push('TRUST_PROXY harus angka jumlah hop, true/false, atau daftar alamat');
  const uploadMaxMb = Number(env.EWI_UPLOAD_MAX_MB || 25);
  if (!Number.isFinite(uploadMaxMb) || uploadMaxMb < 1 || uploadMaxMb > 200) errors.push('EWI_UPLOAD_MAX_MB harus angka 1 sampai 200');
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
    auth: Object.freeze({
      // Login dengan sandi lokal: selalu mati di produksi; di luar produksi mati kecuali AUTH_PASSWORD_LOGIN diisi true
      localLogin: allowLocalLogin,
      // Admin ETA hanya boleh masuk bila emailnya ada di daftar ini. Di produksi daftar kosong = tidak ada Admin ETA.
      etaAdminEmails: Object.freeze(etaAdminEmails),
      etaAdminRequireList: isProd || etaAdminEmails.length > 0,
    }),
    // Express 'trust proxy' agar req.ip = IP klien di belakang nginx (dipakai batas laju per IP)
    trustProxy,
    jwt: Object.freeze({
      secret,
      audience: env.EWI_JWT_AUDIENCE || 'ewi',
      issuer: env.EWI_JWT_ISSUER || 'ewi-api',
      ttl: env.EWI_JWT_TTL || '8h',
    }),
  });
}

/** Nilai boolean dari env: 'true' / 'false', selain itu nilai bawaan. */
function envFlag(raw, fallback) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}

/** TRUST_PROXY: kosong/false = mati, true, angka hop, atau daftar alamat/subnet. undefined = tidak valid. */
function parseTrustProxy(raw) {
  if (raw === undefined || raw === '' || raw === 'false') return false;
  if (raw === 'true') return true;
  if (/^\d+$/.test(raw)) return Number(raw);
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return list.every((s) => /^[0-9a-f:.]+(\/\d+)?$/i.test(s) || ['loopback', 'linklocal', 'uniquelocal'].includes(s)) ? list : undefined;
}

// PD-2b (user, 19 Nov 20.28 WIB): lokasi pemrosesan AI dipilih yang latensinya paling rendah ke Indonesia dan memenuhi
// spek. Urutan untuk teks: Jakarta (ap-southeast-3) bila model tersedia in-region, lalu Singapura (ap-southeast-1),
// lalu profil inferensi lintas region APAC (apac.), ditambah profil global. sejak 23 Nov (spek bagian 7). Profil lain
// (us., eu., ...) ditolak kecuali AI_ALLOW_CROSS_REGION=true.
// Bawaan BEDROCK_REGION Singapura karena Claude tidak tersedia in-region di Jakarta (docs/designs/pd-2b-bedrock-singapura.md).
const JAKARTA = 'ap-southeast-3';
const SINGAPORE = 'ap-southeast-1';
const DEFAULT_AI_REGIONS = [JAKARTA, SINGAPORE];
const PROFILE_PREFIX = /(?:^|inference-profile\/)(global|apac|us|us-gov|eu|au|in|jp|ca)\./i;
// Profil lintas region yang lolos tanpa AI_ALLOW_CROSS_REGION. global. juga di sini, tetapi hanya dengan opt-in
// AI_ALLOW_GLOBAL_PROFILE=true per lingkungan (keputusan user 24 Nov, review PR #8): global. bisa memproses prompt di
// luar APAC, jadi transfer lintas negara (UU PDP) harus selalu pilihan sadar di .env, bukan bawaan.
const DEFAULT_ALLOWED_PROFILES = ['apac', 'global'];

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
  const allowGlobalProfile = env.AI_ALLOW_GLOBAL_PROFILE === 'true';
  const allowedRegions = (env.AI_ALLOWED_REGIONS || DEFAULT_AI_REGIONS.join(',')).split(',').map((r) => r.trim()).filter(Boolean);
  const region = env.BEDROCK_REGION || SINGAPORE;
  const modelId = (env.BEDROCK_MODEL_ID || '').trim();
  const profile = ((modelId.match(PROFILE_PREFIX) || [])[1] || '').toLowerCase();
  let extraFields = null;
  if (provider === 'bedrock') {
    if (!modelId) errors.push('BEDROCK_MODEL_ID wajib diisi untuk AI_PROVIDER=bedrock (ID model Claude, lihat docs/ewi/ai-teks.md)');
    if (!allowCrossRegion && !allowedRegions.includes(region)) {
      errors.push(`BEDROCK_REGION harus salah satu dari ${allowedRegions.join(', ')} (PD-2b)`);
    }
    if (!allowCrossRegion && profile && !DEFAULT_ALLOWED_PROFILES.includes(profile)) {
      const izin = DEFAULT_ALLOWED_PROFILES.map((p) => `${p}.`).join('/');
      errors.push(`BEDROCK_MODEL_ID memakai profil lintas region "${profile}."; PD-2b hanya mengizinkan model in-region Jakarta/Singapura atau profil ${izin} (global. dengan AI_ALLOW_GLOBAL_PROFILE=true)`);
    } else if (!allowCrossRegion && profile === 'global' && !allowGlobalProfile) {
      errors.push('BEDROCK_MODEL_ID memakai profil global. butuh opt-in: isi AI_ALLOW_GLOBAL_PROFILE=true di lingkungan ini (prompt bisa diproses di luar APAC; DPIA wajib sebelum data karyawan sungguhan)');
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
  // Lokasi pemrosesan untuk log dan DPIA: in-region atau profil lintas region (mis. global)
  const processing = profile ? `cross-region:${profile}` : `in-region:${region}`;
  return Object.freeze({ provider, region, modelId, extraFields, allowCrossRegion, allowGlobalProfile, allowedRegions, processing, ...nums });
}

module.exports = { loadConfig, loadAiConfig, JAKARTA, SINGAPORE, STAGING_DEFAULT_MAIL_DOMAINS };
