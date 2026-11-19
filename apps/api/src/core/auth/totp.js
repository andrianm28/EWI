'use strict';
// B1: verifikasi dua langkah dengan kode autentikator (TOTP, RFC 6238): SHA-1, 6 digit, langkah 30 detik.
// Ditulis dengan crypto bawaan supaya tidak menambah dependensi untuk ~40 baris logika.
const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

function base32Encode(buf) {
  let bits = 0; let value = 0; let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  let bits = 0; let value = 0; const out = [];
  for (const ch of String(str).toUpperCase().replace(/=+$/, '')) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('Secret base32 tidak valid');
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** Secret baru 160 bit (32 karakter base32). */
const generateSecret = () => base32Encode(crypto.randomBytes(20));

/** Kode untuk satu langkah waktu (step = floor(detik / 30)). */
function codeAt(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1] & 15;
  const bin = ((mac[offset] & 127) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}

/**
 * Periksa kode dengan toleransi ±1 langkah. `lastStep` = langkah terakhir yang sudah dipakai akun ini;
 * kode pada langkah itu atau sebelumnya ditolak supaya satu kode tidak bisa dipakai dua kali.
 * Return { ok, step } (step = langkah yang cocok, untuk disimpan sebagai lastStep).
 */
function verify(secret, code, { now = Date.now(), lastStep = null, window = 1 } = {}) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return { ok: false };
  const current = Math.floor(now / 1000 / STEP_SECONDS);
  const given = Buffer.from(code);
  let matched = null;
  for (let d = -window; d <= window; d += 1) {
    const step = current + d;
    const same = crypto.timingSafeEqual(Buffer.from(codeAt(secret, step)), given);
    if (same && (lastStep === null || step > Number(lastStep)) && matched === null) matched = step;
  }
  return matched === null ? { ok: false } : { ok: true, step: matched };
}

function otpauthUrl({ secret, account, tenantName }) {
  const issuer = 'ELGOS';
  const label = `${tenantName ? `${issuer} (${tenantName})` : issuer}:${account}`;
  const enc = (s) => encodeURIComponent(s).replace(/%3A/g, ':');
  return `otpauth://totp/${enc(label)}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

module.exports = { generateSecret, base32Encode, base32Decode, codeAt, verify, otpauthUrl, STEP_SECONDS };
