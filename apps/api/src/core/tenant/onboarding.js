'use strict';
// PK-13 (P0-5): onboarding tenant tanpa SQL manual. Satu spesifikasi JSON -> tenant, kunci enkripsi tenant,
// akun HR dan Admin ETA, entitlement, flag, dan pengaturan. Aman dijalankan ulang: yang sudah ada tidak
// digandakan, dan perbedaan yang berisiko (slug milik id lain, peran akun berbeda) ditolak atau dilaporkan.
// PD-19 butir 6 (★): UUID tenant ditentukan dulu di Terraform (infra/live/<env> tenant_ids) lalu dipakai di sini,
// sehingga alias KMS alias/elgos-<env>-tenant-<uuid> sudah ada sebelum tenant dibuat.
const crypto = require('crypto');
const { FLAGS } = require('../flags');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PRODUCTS = ['full_suite', 'cca', 'dna', 'tna', 'ina'];
// Onboarding hanya membuat akun pengelola. Karyawan masuk lewat impor (templat employees).
const ADMIN_ROLES = ['hr_admin', 'eta_admin', 'pimpinan'];
const KNOWN_FLAGS = new Set(Object.values(FLAGS));

class OnboardingError extends Error {
  constructor(message, details = []) {
    super(details.length ? `${message}:\n- ${details.join('\n- ')}` : message);
    this.code = 'ONBOARDING_INVALID';
  }
}

/** Validasi dan normalisasi spesifikasi tenant. Melempar OnboardingError berisi semua kesalahan sekaligus. */
function normalizeSpec(raw, { requireId = false } = {}) {
  const errors = [];
  const spec = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  if (spec !== raw) errors.push('spesifikasi harus berupa objek JSON');

  const id = spec.id ? String(spec.id).toLowerCase() : null;
  if (id && !UUID_RE.test(id)) errors.push('id harus UUID (salin dari tenant_ids di Terraform)');
  if (!id && requireId) errors.push('id wajib diisi bila memakai KMS: tentukan UUID di Terraform tenant_ids lebih dulu');

  const slug = typeof spec.slug === 'string' ? spec.slug.trim() : '';
  if (!SLUG_RE.test(slug)) errors.push('slug wajib, huruf kecil/angka/tanda hubung, maksimal 64 karakter');
  const name = typeof spec.name === 'string' ? spec.name.trim() : '';
  if (!name || name.length > 255) errors.push('name wajib, maksimal 255 karakter');

  const products = Array.isArray(spec.products) ? [...new Set(spec.products.map(String))] : [];
  if (!products.length) errors.push('products wajib berisi minimal satu dari: ' + PRODUCTS.join(', '));
  for (const p of products) if (!PRODUCTS.includes(p)) errors.push(`produk tidak dikenal: ${p}`);

  // flags: daftar flag yang dinyalakan, atau objek { flag: true|false }
  let flags = {};
  if (Array.isArray(spec.flags)) flags = Object.fromEntries(spec.flags.map((f) => [String(f), true]));
  else if (spec.flags && typeof spec.flags === 'object') flags = { ...spec.flags };
  else if (spec.flags !== undefined) errors.push('flags harus daftar atau objek');
  for (const [k, v] of Object.entries(flags)) {
    if (!KNOWN_FLAGS.has(k)) errors.push(`flag tidak dikenal: ${k}`);
    if (typeof v !== 'boolean') errors.push(`nilai flag ${k} harus true atau false`);
  }

  const users = [];
  const seen = new Set();
  for (const [i, u] of (Array.isArray(spec.users) ? spec.users : []).entries()) {
    const email = typeof u?.email === 'string' ? u.email.trim().toLowerCase() : '';
    const role = u?.role;
    if (!EMAIL_RE.test(email) || email.length > 320) { errors.push(`users[${i}].email tidak valid`); continue; }
    if (!ADMIN_ROLES.includes(role)) { errors.push(`users[${i}].role harus salah satu dari: ${ADMIN_ROLES.join(', ')}`); continue; }
    if (seen.has(email)) { errors.push(`email ganda: ${email}`); continue; }
    seen.add(email);
    users.push({ email, role, name: typeof u.name === 'string' && u.name.trim() ? u.name.trim() : null });
  }
  if (!users.some((u) => u.role === 'hr_admin')) errors.push('users wajib berisi minimal satu hr_admin');

  let settings = null;
  if (spec.settings !== undefined) {
    if (spec.settings && typeof spec.settings === 'object' && !Array.isArray(spec.settings)) settings = spec.settings;
    else errors.push('settings harus objek');
  }

  if (errors.length) throw new OnboardingError('Spesifikasi tenant tidak valid', errors);
  return { id, slug, name, products, flags, users, settings };
}

/**
 * Jalankan onboarding.
 * - db: { query(sql, params) -> Promise<{ rows }> } satu koneksi (pg.Client), dipakai dalam satu transaksi.
 * - provider: penyedia kunci induk dari src/core/crypto (local atau kms).
 * - production: true bila NODE_ENV=production (wajib KMS).
 * - dryRun: semua langkah dijalankan lalu di-ROLLBACK; tidak ada yang tersimpan.
 * Mengembalikan laporan langkah: [{ step, status: 'dibuat'|'ada'|'diperbarui'|'dilewati', detail }].
 */
/**
 * Tambah entitlement aktif untuk produk ini bila belum ada (produk itu sendiri atau full_suite yang mencakupnya).
 * db: { query(sql, params) -> { rows } } dengan parameter posisi $n (pg.Client, atau adapter transaksi B12).
 * Return true bila baris baru dibuat.
 */
async function ensureEntitlement(db, tenantId, product, source) {
  const active = (await db.query(
    `SELECT 1 FROM entitlements WHERE tenant_id = $1 AND product IN ($2, 'full_suite') AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now()) LIMIT 1`,
    [tenantId, product])).rows[0];
  if (active) return false;
  await db.query('INSERT INTO entitlements (tenant_id, product, source) VALUES ($1, $2, $3)', [tenantId, product, source]);
  return true;
}

async function onboardTenant({ db, provider, spec: rawSpec, production = false, dryRun = false }) {
  if (production && provider.name !== 'kms') {
    throw new OnboardingError('Produksi wajib ENCRYPTION_PROVIDER=kms: onboarding ditolak');
  }
  const spec = normalizeSpec(rawSpec, { requireId: provider.name === 'kms' });
  const report = [];
  const add = (step, status, detail) => report.push({ step, status, detail });

  // Cek tenant yang sudah ada sebelum menyentuh KMS, agar konflik id/slug ditolak lebih dulu.
  const bySlug = (await db.query('SELECT id, slug, name FROM tenants WHERE slug = $1', [spec.slug])).rows[0];
  const byId = spec.id ? (await db.query('SELECT id, slug, name FROM tenants WHERE id = $1', [spec.id])).rows[0] : null;
  if (bySlug && spec.id && bySlug.id !== spec.id) {
    throw new OnboardingError(`Slug ${spec.slug} sudah dipakai tenant lain (${bySlug.id})`);
  }
  if (byId && byId.slug !== spec.slug) {
    throw new OnboardingError(`Tenant ${spec.id} sudah ada dengan slug ${byId.slug}; ganti slug tidak dilakukan lewat onboarding`);
  }
  const existing = byId || bySlug || null;
  const tenantId = existing ? existing.id : (spec.id || crypto.randomUUID());

  // Kunci tenant: dengan KMS, alias harus sudah dibuat Terraform. Diperiksa sebelum transaksi dimulai.
  const keyRow = (await db.query(
    'SELECT version, key_ref AS "keyRef", wrapped_key AS "wrappedKey" FROM tenant_keys WHERE tenant_id = $1 ORDER BY version DESC LIMIT 1',
    [tenantId])).rows[0];
  let generated = null;
  try {
    if (keyRow) await provider.decryptDataKey(tenantId, keyRow.wrappedKey, keyRow.keyRef);
    else generated = await provider.generateDataKey(tenantId);
  } catch (e) {
    const ref = typeof provider.keyRef === 'function' ? provider.keyRef(tenantId) : 'kunci induk';
    const hint = provider.name === 'kms'
      ? ` Pastikan ${tenantId} ada di tenant_ids (infra/live/<env>), terraform apply sudah dijalankan, dan KMS_KEY_ALIAS_PREFIX sesuai lingkungan.`
      : ' Pastikan EWI_LOCAL_MASTER_KEY sama dengan yang dipakai API.';
    throw new OnboardingError(`Kunci enkripsi tenant (${ref}) tidak bisa dipakai: ${e.message}.${hint}`);
  }

  await db.query('BEGIN');
  try {
    // 1. Tenant
    if (!existing) {
      await db.query('INSERT INTO tenants (id, slug, name) VALUES ($1, $2, $3)', [tenantId, spec.slug, spec.name]);
      add('tenant', 'dibuat', `${spec.slug} (${tenantId})`);
    } else if (existing.name !== spec.name) {
      await db.query('UPDATE tenants SET name = $2, updated_at = now() WHERE id = $1', [tenantId, spec.name]);
      add('tenant', 'diperbarui', `nama menjadi "${spec.name}"`);
    } else {
      add('tenant', 'ada', `${spec.slug} (${tenantId})`);
    }

    // 2. Kunci enkripsi (DEK terbungkus versi 1)
    if (keyRow) {
      add('kunci', 'ada', `versi ${keyRow.version}, ${keyRow.keyRef === 'local' ? 'kunci induk lokal' : keyRow.keyRef}`);
    } else {
      await db.query(
        `INSERT INTO tenant_keys (tenant_id, version, key_ref, wrapped_key) VALUES ($1, 1, $2, $3)
         ON CONFLICT (tenant_id, version) DO NOTHING`, [tenantId, generated.keyRef, generated.wrapped]);
      add('kunci', 'dibuat', `versi 1, ${provider.name === 'kms' ? generated.keyRef : 'kunci induk lokal'}`);
    }

    // 3. Akun pengelola (status invited; aktif setelah link pertama dipakai)
    for (const u of spec.users) {
      const ins = await db.query(
        `INSERT INTO users (tenant_id, email, name, role, status) VALUES ($1, $2, $3, $4, 'invited')
         ON CONFLICT (tenant_id, email) DO NOTHING RETURNING id`, [tenantId, u.email, u.name, u.role]);
      if (ins.rows[0]) { add('akun', 'dibuat', `${u.email} (${u.role})`); continue; }
      const cur = (await db.query('SELECT role, status FROM users WHERE tenant_id = $1 AND email = $2', [tenantId, u.email])).rows[0];
      if (cur.role !== u.role) add('akun', 'dilewati', `${u.email} sudah ada dengan peran ${cur.role}; peran tidak diubah lewat onboarding`);
      else add('akun', 'ada', `${u.email} (${u.role}, ${cur.status})`);
    }

    // 4. Entitlement: hanya ditambah bila belum ada yang aktif untuk produk itu
    for (const product of spec.products) {
      add('entitlement', (await ensureEntitlement(db, tenantId, product, 'onboarding')) ? 'dibuat' : 'ada', product);
    }

    // 5. Flag: hanya yang disebut di spesifikasi; flag lain tetap pada nilainya (default mati)
    for (const [key, enabled] of Object.entries(spec.flags).sort()) {
      const prev = (await db.query('SELECT enabled FROM feature_flags WHERE tenant_id = $1 AND key = $2', [tenantId, key])).rows[0];
      if (prev && prev.enabled === enabled) { add('flag', 'ada', `${key}=${enabled}`); continue; }
      await db.query(
        `INSERT INTO feature_flags (tenant_id, key, enabled, updated_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (tenant_id, key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_by = NULL, updated_at = now()`,
        [tenantId, key, enabled]);
      add('flag', prev ? 'diperbarui' : 'dibuat', `${key}=${enabled}`);
    }

    // 6. Pengaturan klien: digabung di tingkat atas (kunci yang disebut ditimpa, yang lain tetap)
    if (spec.settings) {
      const { rows: [s] } = await db.query(
        `UPDATE tenants SET settings = COALESCE(settings, '{}'::jsonb) || $2::jsonb, updated_at = now()
          WHERE id = $1 AND NOT (COALESCE(settings, '{}'::jsonb) @> $2::jsonb) RETURNING id`,
        [tenantId, JSON.stringify(spec.settings)]);
      add('pengaturan', s ? 'diperbarui' : 'ada', Object.keys(spec.settings).join(', ') || '(kosong)');
    }

    // 7. Jejak audit (append-only). user_id kosong: dijalankan operator lewat skrip, bukan lewat API.
    const changed = report.filter((r) => r.status === 'dibuat' || r.status === 'diperbarui');
    if (changed.length) {
      await db.query(
        `INSERT INTO audit_logs (tenant_id, user_id, action, resource, meta) VALUES ($1, NULL, $2, 'tenant.onboarding', $3::jsonb)`,
        [tenantId, existing ? 'update' : 'create', JSON.stringify({ via: 'scripts/onboard-tenant.js', changes: changed })]);
    }

    await db.query(dryRun ? 'ROLLBACK' : 'COMMIT');
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    throw e;
  }
  return { tenantId, slug: spec.slug, name: spec.name, dryRun, report, users: spec.users };
}

module.exports = { normalizeSpec, onboardTenant, ensureEntitlement, OnboardingError, ADMIN_ROLES, PRODUCTS };
