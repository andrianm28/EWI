'use strict';
// Membaca file unggahan HR (XLSX atau CSV) menjadi { headers, rows } dengan rows = objek per judul kolom.
const ExcelJS = require('exceljs');
const { HttpError, badRequest } = require('../../core/errors');

const MAX_ROWS = 5000;

/** Nilai sel Excel -> primitif (string/number/boolean/Date). */
function cellValue(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v !== 'object') return v;
  if ('result' in v) return cellValue(v.result);
  if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
  if ('text' in v) return v.text;
  if ('error' in v) return null;
  return String(v);
}

/** CSV dengan koma atau titik koma (Excel Indonesia), tanda kutip ganda, dan BOM. */
function parseCsv(content) {
  const s = content.replace(/^\uFEFF/, '');
  const firstLine = s.split(/\r?\n/, 1)[0] || '';
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { field += '"'; i += 1; } else if (ch === '"') quoted = false; else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delim) { row.push(field); field = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Audit 24 Nov (8-9): file XLSX bisa menyimpan satu sel di baris 1.048.576 atau kolom XFD. Membaca semua
// baris/kolom di antaranya membuat jutaan sel kosong (API macet). Karena itu hanya sel berisi yang dibaca,
// lebar dibatasi MAX_COLS, dan pembacaan berhenti begitu baris berisi melewati batas baris.
const MAX_COLS = 200;
const tooWide = () => badRequest(`Maksimal ${MAX_COLS} kolom. Hapus isi sel di kanan tabel lalu unggah ulang.`);
const tooManyRows = () => new HttpError(413, 'TOO_MANY_ROWS', `Maksimal ${MAX_ROWS} baris per file`);

/** Lembar -> [{ n: nomor baris, vals }] hanya untuk baris yang punya sel berisi. */
async function parseXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); } catch { throw badRequest('File Excel tidak bisa dibaca. Simpan ulang sebagai .xlsx atau .csv'); }
  // Lembar pertama yang bukan "Petunjuk" (template ELGOS punya lembar petunjuk)
  const ws = wb.worksheets.find((w) => !/^petunjuk/i.test(w.name)) || wb.worksheets[0];
  if (!ws) return [];
  const out = [];
  ws.eachRow((r, n) => { // tanpa includeEmpty: baris kosong dilewati
    const vals = [];
    r.eachCell((cell, c) => { // tanpa includeEmpty: sel kosong dilewati
      if (c > MAX_COLS) throw tooWide();
      vals[c - 1] = cellValue(cell.value);
    });
    out.push({ n, vals: Array.from(vals, (v) => (v === undefined ? null : v)) });
    if (out.length > MAX_ROWS + 1) throw tooManyRows(); // +1 = baris judul
  });
  return out;
}

/** buffer + nama file -> { headers, rows } (baris kosong dibuang). */
async function parseUpload(buffer, filename) {
  if (!buffer || !buffer.length) throw badRequest('File kosong');
  const ext = String(filename || '').toLowerCase().split('.').pop();
  let grid; // [{ n: nomor baris di spreadsheet (1 = pertama), vals }]
  if (ext === 'xlsx') grid = await parseXlsx(buffer);
  else if (ext === 'csv' || ext === 'txt') grid = parseCsv(buffer.toString('utf8')).map((vals, i) => ({ n: i + 1, vals }));
  else throw badRequest('Format file harus .xlsx atau .csv');
  if (grid.some((r) => r.vals.length > MAX_COLS)) throw tooWide();

  const filled = (r) => r.vals.some((v) => v !== null && v !== undefined && String(v).trim() !== '');
  const headerIdx = grid.findIndex(filled);
  if (headerIdx < 0) throw badRequest('File tidak berisi data');
  // lebar tabel = sel berisi paling kanan di seluruh lembar (kolom tanpa judul jadi "Kolom N", seperti sebelumnya)
  const width = grid.reduce((w, r) => Math.max(w, r.vals.length), 0);
  const rawHeaders = Array.from({ length: width }, (_, c) => grid[headerIdx].vals[c] ?? null).map((h) => (h === null || h === undefined ? '' : String(h).trim()));
  const headers = rawHeaders.map((h, i) => h || `Kolom ${i + 1}`);
  if (new Set(headers).size !== headers.length) throw badRequest('Judul kolom tidak boleh kembar');
  const rows = [];
  for (let i = headerIdx + 1; i < grid.length; i += 1) {
    const { n, vals } = grid[i];
    if (!filled(grid[i])) continue;
    if (rows.length >= MAX_ROWS) throw tooManyRows();
    const obj = { __row: n };
    headers.forEach((h, c) => { obj[h] = vals[c] === undefined ? null : vals[c]; });
    rows.push(obj);
  }
  if (!rows.length) throw badRequest('File tidak berisi baris data di bawah judul kolom');
  return { headers, rows };
}

module.exports = { parseUpload, parseCsv, cellValue, MAX_ROWS, MAX_COLS };
