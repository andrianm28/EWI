'use strict';
// CSV untuk ekspor gap ke LMS klien (K4). Sel yang bisa dibaca sebagai formula oleh spreadsheet dinetralkan.
const FORMULA = /^[=+\-@\t\r]/;

function csvCell(v) {
  if (v == null) return '';
  let s = String(v);
  if (FORMULA.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const toCsv = (header, rows) => [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

module.exports = { csvCell, toCsv };
