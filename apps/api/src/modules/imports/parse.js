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

async function parseXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); } catch { throw badRequest('File Excel tidak bisa dibaca. Simpan ulang sebagai .xlsx atau .csv'); }
  // Lembar pertama yang bukan "Petunjuk" (template ELGOS punya lembar petunjuk)
  const ws = wb.worksheets.find((w) => !/^petunjuk/i.test(w.name)) || wb.worksheets[0];
  if (!ws) return [];
  const out = [];
  ws.eachRow({ includeEmpty: true }, (r, n) => {
    const vals = [];
    for (let c = 1; c <= ws.columnCount; c += 1) vals.push(cellValue(r.getCell(c).value));
    out[n - 1] = vals;
  });
  return Array.from(out, (r) => r || []);
}

/** buffer + nama file -> { headers, rows } (baris kosong dibuang). */
async function parseUpload(buffer, filename) {
  if (!buffer || !buffer.length) throw badRequest('File kosong');
  const ext = String(filename || '').toLowerCase().split('.').pop();
  let grid;
  if (ext === 'xlsx') grid = await parseXlsx(buffer);
  else if (ext === 'csv' || ext === 'txt') grid = parseCsv(buffer.toString('utf8'));
  else throw badRequest('Format file harus .xlsx atau .csv');

  const headerIdx = grid.findIndex((r) => r.some((v) => v !== null && String(v).trim() !== ''));
  if (headerIdx < 0) throw badRequest('File tidak berisi data');
  const rawHeaders = grid[headerIdx].map((h) => (h === null || h === undefined ? '' : String(h).trim()));
  const headers = rawHeaders.map((h, i) => h || `Kolom ${i + 1}`);
  if (new Set(headers).size !== headers.length) throw badRequest('Judul kolom tidak boleh kembar');
  const rows = [];
  for (let i = headerIdx + 1; i < grid.length; i += 1) {
    const r = grid[i] || [];
    if (!r.some((v) => v !== null && v !== undefined && String(v).trim() !== '')) continue;
    const obj = { __row: i + 1 }; // nomor baris di spreadsheet (1 = baris pertama)
    headers.forEach((h, c) => { obj[h] = r[c] === undefined ? null : r[c]; });
    rows.push(obj);
  }
  if (!rows.length) throw badRequest('File tidak berisi baris data di bawah judul kolom');
  if (rows.length > MAX_ROWS) throw new HttpError(413, 'TOO_MANY_ROWS', `Maksimal ${MAX_ROWS} baris per file`);
  return { headers, rows };
}

module.exports = { parseUpload, parseCsv, cellValue, MAX_ROWS };
