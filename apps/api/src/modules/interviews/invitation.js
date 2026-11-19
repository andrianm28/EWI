'use strict';
// Q38 (PM-8 D): undangan wawancara berlaku 7 hari dan bisa diperpanjang HR.
// PRJ-6/T4 (PM-8 E): pengingat email otomatis H-3 dan H-1 sebelum undangan berakhir.
// "H-n" dihitung per tanggal kalender WIB (UTC+7, tanpa DST), bukan per 24 jam, supaya job harian
// yang berjalan pagi hari mengirim H-3 tepat tiga tanggal sebelum batas.
const DAY_MS = 24 * 60 * 60 * 1000;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const INVITE_DAYS = 7;
const EXTEND_DEFAULT_DAYS = 7;
const EXTEND_MAX_DAYS = 30;
// Sesi yang belum selesai masih perlu diingatkan
const OPEN_STATUSES = Object.freeze(['scheduled', 'in_progress']);

const wibDay = (d) => Math.floor((new Date(d).getTime() + WIB_OFFSET_MS) / DAY_MS);

function inviteExpiry(now = new Date()) {
  return new Date(now.getTime() + INVITE_DAYS * DAY_MS);
}

function isExpired(expiresAt, now = new Date()) {
  return Boolean(expiresAt) && new Date(expiresAt).getTime() <= now.getTime();
}

/** Batas baru = max(sekarang, batas lama) + days. Undangan yang sudah lewat dihitung dari sekarang. */
function extendedExpiry(expiresAt, days, now = new Date()) {
  const base = Math.max(now.getTime(), expiresAt ? new Date(expiresAt).getTime() : 0);
  return new Date(base + days * DAY_MS);
}

/** Validasi jumlah hari perpanjangan dari HR. Return angka atau null bila tidak valid. */
function parseExtendDays(value) {
  if (value === undefined || value === null || value === '') return EXTEND_DEFAULT_DAYS;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= EXTEND_MAX_DAYS ? n : null;
}

/** Sisa hari kalender WIB sampai batas (0 = hari terakhir). */
function daysLeft(expiresAt, now = new Date()) {
  return wibDay(expiresAt) - wibDay(now);
}

/**
 * Pengingat yang jatuh tempo untuk satu sesi: 'h1', 'h3', atau null.
 * H-1 dikirim pada H-1 atau hari terakhir; H-3 pada H-3 atau H-2 bila job sempat terlewat.
 * Bila H-1 sudah jatuh tempo, H-3 yang belum terkirim dilewati (tidak dua email sekaligus).
 */
function dueReminder({ status, inviteExpiresAt, reminderH3At, reminderH1At }, now = new Date()) {
  if (!OPEN_STATUSES.includes(status) || !inviteExpiresAt || isExpired(inviteExpiresAt, now)) return null;
  const left = daysLeft(inviteExpiresAt, now);
  if (left <= 1) return reminderH1At ? null : 'h1';
  if (left <= 3) return reminderH3At ? null : 'h3';
  return null;
}

const fmtWib = (d) => new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(d));

const SUBMODULE_LABEL = { tna: 'TNA', dna: 'DNA', cca: 'CCA', ina: 'INA' };

function reminderMessage({ kind, name, tenantName, submodule, inviteExpiresAt, appBaseUrl, durationMinutes }) {
  const label = SUBMODULE_LABEL[submodule] || submodule.toUpperCase();
  const when = kind === 'h1' ? 'besok atau hari ini' : 'dalam 3 hari';
  return {
    subject: `Pengingat: undangan wawancara ${label} ELGOS berakhir ${when}`,
    text: `Halo ${name || ''},\n\n`
      + `Undangan wawancara ${label}${tenantName ? ` dari ${tenantName}` : ''} di ELGOS belum Anda selesaikan. `
      + `Undangan berlaku sampai ${fmtWib(inviteExpiresAt)} WIB.\n\n`
      + `Wawancara berlangsung sekitar ${durationMinutes || 30} menit. Masuk lewat ${appBaseUrl}/masuk lalu minta link masuk ke email Anda.\n\n`
      + 'Bila undangan sudah berakhir, hubungi HR untuk memperpanjangnya.\n',
  };
}

module.exports = {
  DAY_MS, INVITE_DAYS, EXTEND_DEFAULT_DAYS, EXTEND_MAX_DAYS, OPEN_STATUSES,
  inviteExpiry, isExpired, extendedExpiry, parseExtendDays, daysLeft, dueReminder, reminderMessage,
};
