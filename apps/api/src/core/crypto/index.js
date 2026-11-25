'use strict';
// R2-3 (13 Nov): envelope encryption per tenant untuk transkrip, jawaban, dan hasil individu.
// - Tiap tenant punya data key (DEK, AES-256) yang dibungkus kunci induk tenant: KMS key per tenant (staging/prod)
//   atau kunci lokal (dev di luar AWS, test). DEK terbungkus disimpan di tabel tenant_keys.
// - Nilai kolom: "enc:v1:<versi>:<iv>:<tag>:<ciphertext>" (AES-256-GCM, base64url), AAD = tenant id,
//   sehingga ciphertext tenant A tidak bisa dibuka sebagai milik tenant B.
// - Nilai tanpa awalan "enc:" dianggap teks lama (sebelum migrasi) dan dikembalikan apa adanya.
const crypto = require('crypto');

const PREFIX = 'enc:v1:';
const CACHE_MS = 10 * 60 * 1000;
const b64 = (buf) => buf.toString('base64url');
const unb64 = (s) => Buffer.from(s, 'base64url');

/** Kunci induk lokal (32 byte). Dipakai dev/test; produksi wajib KMS (lihat config). */
function localProvider(masterKey) {
  if (!Buffer.isBuffer(masterKey) || masterKey.length !== 32) throw new Error('Kunci induk lokal harus 32 byte');
  return {
    name: 'local',
    keyRef: () => 'local',
    async generateDataKey(tenantId) {
      const dek = crypto.randomBytes(32);
      return { plaintext: dek, wrapped: wrap(masterKey, dek, tenantId), keyRef: 'local' };
    },
    async decryptDataKey(tenantId, wrapped) { return unwrap(masterKey, wrapped, tenantId); },
  };
}
function wrap(key, dek, tenantId) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(`dek:${tenantId}`));
  const ct = Buffer.concat([c.update(dek), c.final()]);
  return [b64(iv), b64(c.getAuthTag()), b64(ct)].join('.');
}
function unwrap(key, wrapped, tenantId) {
  const [iv, tag, ct] = wrapped.split('.').map(unb64);
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAAD(Buffer.from(`dek:${tenantId}`));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

/**
 * AWS KMS: satu KMS key per tenant. Key dicari lewat alias `alias/<prefix>-<tenantId>` (dibuat saat tenant
 * diaktifkan, oleh IaC/Admin; pembuatan otomatis menunggu keputusan lanjutan R2-3). Encryption context = tenant.
 */
function kmsProvider({ region, aliasPrefix, client }) {
  const { KMSClient, GenerateDataKeyCommand, DecryptCommand } = require('@aws-sdk/client-kms');
  const kms = client || new KMSClient({ region });
  const keyRef = (tenantId) => `alias/${aliasPrefix}-${tenantId}`;
  return {
    name: 'kms',
    keyRef,
    async generateDataKey(tenantId) {
      const out = await kms.send(new GenerateDataKeyCommand({ KeyId: keyRef(tenantId), KeySpec: 'AES_256', EncryptionContext: { tenant: tenantId } }));
      return { plaintext: Buffer.from(out.Plaintext), wrapped: Buffer.from(out.CiphertextBlob).toString('base64'), keyRef: out.KeyId || keyRef(tenantId) };
    },
    async decryptDataKey(tenantId, wrapped, ref) {
      const out = await kms.send(new DecryptCommand({ CiphertextBlob: Buffer.from(wrapped, 'base64'), KeyId: ref || keyRef(tenantId), EncryptionContext: { tenant: tenantId } }));
      return Buffer.from(out.Plaintext);
    },
  };
}

/**
 * keyStore: { get(tenantId) -> { version, keyRef, wrappedKey } | null, insert(tenantId, { version, keyRef, wrappedKey }) -> row }
 */
function createFieldCipher({ provider, keyStore, now = () => Date.now() }) {
  const cache = new Map(); // tenantId -> { version, dek, at }
  let healthyUntil = 0;
  const keys = new Map(); // `${tenantId}:${version}` -> dek

  async function current(tenantId) {
    const hit = cache.get(tenantId);
    if (hit && now() - hit.at < CACHE_MS) return hit;
    let row = await keyStore.get(tenantId);
    let dek;
    if (!row) {
      const gen = await provider.generateDataKey(tenantId);
      row = await keyStore.insert(tenantId, { version: 1, keyRef: gen.keyRef, wrappedKey: gen.wrapped });
      dek = row.wrappedKey === gen.wrapped ? gen.plaintext : await provider.decryptDataKey(tenantId, row.wrappedKey, row.keyRef);
    } else {
      dek = await provider.decryptDataKey(tenantId, row.wrappedKey, row.keyRef);
    }
    const entry = { version: row.version, dek, at: now() };
    cache.set(tenantId, entry);
    keys.set(`${tenantId}:${row.version}`, dek);
    return entry;
  }
  async function keyFor(tenantId, version) {
    const k = keys.get(`${tenantId}:${version}`);
    if (k) return k;
    const cur = await current(tenantId);
    if (cur.version === version) return cur.dek;
    throw new Error(`Versi kunci ${version} tenant tidak tersedia`);
  }

  const cipher = {
    provider: provider.name,
    isEncrypted: (v) => typeof v === 'string' && v.startsWith(PREFIX),
    async encrypt(tenantId, value) {
      if (value === null || value === undefined) return value;
      if (!tenantId) throw new Error('tenantId wajib untuk enkripsi');
      const { version, dek } = await current(tenantId);
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', dek, iv);
      c.setAAD(Buffer.from(String(tenantId)));
      const ct = Buffer.concat([c.update(String(value), 'utf8'), c.final()]);
      return `${PREFIX}${version}:${b64(iv)}:${b64(c.getAuthTag())}:${b64(ct)}`;
    },
    async decrypt(tenantId, value) {
      if (!cipher.isEncrypted(value)) return value;
      const [version, iv, tag, ct] = value.slice(PREFIX.length).split(':');
      const dek = await keyFor(tenantId, Number(version));
      const d = crypto.createDecipheriv('aes-256-gcm', dek, unb64(iv));
      d.setAAD(Buffer.from(String(tenantId)));
      d.setAuthTag(unb64(tag));
      return Buffer.concat([d.update(unb64(ct)), d.final()]).toString('utf8');
    },
    /** Dekripsi field tertentu di baris (atau daftar baris). */
    async open(tenantId, rows, fields) {
      if (!rows) return rows;
      const list = Array.isArray(rows) ? rows : [rows];
      for (const r of list) for (const f of fields) if (r[f] !== undefined) r[f] = await cipher.decrypt(tenantId, r[f]);
      return rows;
    },
    /**
     * PK-07 / I-6: pemeriksaan kesiapan. Membuka satu DEK tersimpan dengan kunci induk (KMS atau lokal), sehingga
     * kredensial/izin KMS yang hilang atau EWI_LOCAL_MASTER_KEY yang salah terdeteksi sebelum menerima trafik.
     * Belum ada kunci tenant: penyedia lokal diuji bungkus-buka; KMS dianggap siap (belum ada yang perlu dibuka).
     * Hasil sukses di-cache 30 detik supaya probe beruntun tidak memanggil KMS terus-menerus.
     */
    async healthCheck() {
      if (now() < healthyUntil) return;
      const row = keyStore.any ? await keyStore.any() : null;
      if (row) {
        await provider.decryptDataKey(row.tenantId, row.wrappedKey, row.keyRef);
      } else if (provider.name === 'local') {
        const probe = '00000000-0000-0000-0000-000000000000';
        const gen = await provider.generateDataKey(probe);
        const back = await provider.decryptDataKey(probe, gen.wrapped, gen.keyRef);
        if (!back.equals(gen.plaintext)) throw new Error('uji bungkus-buka kunci lokal gagal');
      }
      healthyUntil = now() + 30 * 1000;
    },
    async encryptJson(tenantId, obj) { return cipher.encrypt(tenantId, JSON.stringify(obj)); },
    async decryptJson(tenantId, value) {
      if (!cipher.isEncrypted(value)) return value;
      return JSON.parse(await cipher.decrypt(tenantId, value));
    },
  };
  return cipher;
}

/** Bangun provider dari config.encryption. */
function createProvider(enc) {
  if (enc.provider === 'kms') return kmsProvider({ region: enc.region, aliasPrefix: enc.kmsAliasPrefix });
  return localProvider(enc.localMasterKey);
}

module.exports = { createFieldCipher, createProvider, localProvider, kmsProvider, PREFIX };
