'use strict';
// Port penyimpanan berkas (B14: dokumentasi pelatihan). Repo belum punya storage; adapter disk lokal dipakai di VPS
// (EWI_UPLOAD_DIR), adapter memori untuk test. Berkas hanya dibaca lewat API yang memeriksa tenant dan peran.
// Kontrak: { name, put(key, buffer), get(key) -> Buffer|null, remove(key) }. Kunci = `<tenantId>/<uuid>`.
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const KEY = /^[0-9a-f-]{36}\/[0-9a-f-]{36}$/i;

const MP4_BRANDS = ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash'];

/** Tipe berkas dari tanda tangan isi (magic bytes), bukan dari nama atau Content-Type kiriman klien. */
function detectType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg', media: 'photo' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png', media: 'photo' };
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp', media: 'photo' };
  // ISO-BMFF: hanya merek MP4. HEIC/AVIF, QuickTime, dan M4A memakai kotak ftyp yang sama tetapi bukan MP4.
  if (buf.toString('latin1', 4, 8) === 'ftyp' && MP4_BRANDS.includes(buf.toString('latin1', 8, 12))) return { mime: 'video/mp4', ext: 'mp4', media: 'video' };
  if (buf.toString('latin1', 0, 5) === '%PDF-') return { mime: 'application/pdf', ext: 'pdf', media: 'document' };
  return null;
}

/** Jenis dokumen yang boleh untuk tiap tipe berkas: PDF hanya materi; foto/video untuk dokumentasi atau materi. */
function allowedFor(kind, type) {
  if (!type) return false;
  if (kind === 'material') return true;
  if (kind === 'photo') return type.media === 'photo';
  if (kind === 'video') return type.media === 'video';
  return false;
}

/** Nama berkas aman untuk header dan tampilan: tanpa path, karakter kontrol, atau tanda kutip. */
function safeFilename(name, fallback = 'berkas') {
  const base = String(name || '').split(/[\\/]/).pop().replace(/["<>|:*?]/g, '').replace(/\p{Cc}/gu, '').trim().slice(0, 200);
  return base || fallback;
}

const newKey = (tenantId) => `${tenantId}/${crypto.randomUUID()}`;
const assertKey = (key) => { if (!KEY.test(String(key))) throw new Error('Kunci berkas tidak valid'); };

function memoryStorage() {
  const files = new Map();
  return {
    name: 'memory', files,
    async put(key, buffer) { assertKey(key); files.set(key, Buffer.from(buffer)); },
    async get(key) { assertKey(key); return files.get(key) || null; },
    async remove(key) { assertKey(key); files.delete(key); },
  };
}

function diskStorage(dir) {
  const root = path.resolve(dir);
  const file = (key) => {
    assertKey(key);
    const p = path.resolve(root, key);
    if (!p.startsWith(root + path.sep)) throw new Error('Kunci berkas tidak valid');
    return p;
  };
  return {
    name: 'disk',
    async put(key, buffer) {
      const p = file(key);
      await fs.mkdir(path.dirname(p), { recursive: true, mode: 0o700 });
      await fs.writeFile(p, buffer, { mode: 0o600, flag: 'wx' });
    },
    async get(key) {
      try { return await fs.readFile(file(key)); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    },
    async remove(key) {
      try { await fs.unlink(file(key)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    },
  };
}

/** config: { dir } -> storage, atau null bila belum dikonfigurasi (unggah menjawab 501). */
function createStorage(config = {}) {
  return config.dir ? diskStorage(config.dir) : null;
}

module.exports = { detectType, allowedFor, safeFilename, newKey, memoryStorage, diskStorage, createStorage };
