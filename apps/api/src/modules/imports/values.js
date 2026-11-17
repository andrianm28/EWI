'use strict';
// Pengurai nilai sel dari file HR (Excel/CSV Indonesia): angka berkoma, persen, ya/tidak, tanggal.

const text = (v) => (v === null || v === undefined ? '' : String(v).trim());
const blank = (v) => text(v) === '';

/** Angka: 85 | "85,5" | "1.234,5" | "1,234.5" | "85%" -> number; selain itu NaN. */
function number(v) {
  if (typeof v === 'number') return v;
  let s = text(v).replace(/\s/g, '').replace(/%$/, '');
  if (!s) return NaN;
  const lastDot = s.lastIndexOf('.'); const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

function integer(v) {
  const n = number(v);
  return Number.isInteger(n) ? n : NaN;
}

const YES = ['ya', 'y', 'yes', 'true', '1', 'tercapai', 'selesai', 'lulus', 'tepat waktu', 'sudah'];
const NO = ['tidak', 't', 'no', 'n', 'false', '0', 'tidak tercapai', 'belum', 'belum selesai', 'terlambat'];
/** Biner: 1/0 atau null bila tidak dikenali. */
function binary(v) {
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = text(v).toLowerCase();
  if (YES.includes(s)) return 1;
  if (NO.includes(s)) return 0;
  return null;
}

/** Tanggal: Date | "2026-11-13" | "13/11/2026" | "13-11-2026" | serial Excel -> Date (UTC) atau null. */
function date(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000));
  const s = text(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return validDate(+m[3], +m[2], +m[1]);
  return null;
}
function validDate(y, mo, d) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt : null;
}
const isoDate = (d) => d.toISOString().slice(0, 10);

/** Pilihan dengan sinonim: choice(v, { okr: ['okr'], kpi: ['kpi'] }) -> kunci atau null. */
function choice(v, map) {
  const s = text(v).toLowerCase();
  if (!s) return null;
  for (const [key, synonyms] of Object.entries(map)) {
    if (key === s || synonyms.includes(s)) return key;
  }
  return null;
}

const email = (v) => { const s = text(v).toLowerCase(); return s || null; };
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

module.exports = { text, blank, number, integer, binary, date, isoDate, choice, email, isEmail };
