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
  // PK-16 / PD-10 ★B: di produksi semua login lewat link email. Login password hanya untuk dev/staging.
  const isProd = env.NODE_ENV === 'production';
  if (isProd && env.AUTH_PASSWORD_LOGIN === 'true') errors.push('AUTH_PASSWORD_LOGIN=true tidak diizinkan di produksi (PD-10)');
  const etaAdminEmails = (env.ETA_ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (etaAdminEmails.some((e) => !/^[^@\s]+@[^@\s]+$/.test(e))) errors.push('ETA_ADMIN_EMAILS berisi alamat email yang tidak valid');
  const trustProxy = parseTrustProxy(env.TRUST_PROXY);
  if (trustProxy === undefined) errors.push('TRUST_PROXY harus angka jumlah hop, true/false, atau daftar alamat');
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
    }),
    auth: Object.freeze({
      // Login password: mati di produksi, nyala di dev/staging kecuali variabel AUTH_PASSWORD_LOGIN diisi false
      passwordLogin: !isProd && envFlag(env.AUTH_PASSWORD_LOGIN, true),
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

module.exports = { loadConfig };
