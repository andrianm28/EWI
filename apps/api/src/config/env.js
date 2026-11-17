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
    // T3 belum diputuskan: hanya 'stub' yang tersedia
    aiProvider: env.AI_PROVIDER || 'stub',
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

module.exports = { loadConfig, STAGING_DEFAULT_MAIL_DOMAINS };
