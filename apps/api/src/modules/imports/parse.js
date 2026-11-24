'use strict';
// Membaca file unggahan HR (XLSX atau CSV) menjadi { headers, rows } dengan rows = objek per judul kolom.
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
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
  // rumus tanpa hasil tersimpan (file dibuat program lain, belum dihitung Excel): dulu jadi "[object Object]"
  if ('formula' in v || 'sharedFormula' in v) return null;
  return String(v);
}

/** Isi sel dianggap kosong bila null/undefined atau hanya spasi. */
const isBlank = (v) => v === null || v === undefined || String(v).trim() === '';

/** Pembaca CSV dengan koma atau titik koma (Excel Indonesia), tanda kutip ganda, dan BOM; onRow(fields, n) per baris. */
function readCsv(content, onRow) {
  const s = content.replace(/^\uFEFF/, '');
  const firstLine = s.split(/\r?\n/, 1)[0] || '';
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  let row = []; let field = ''; let quoted = false; let n = 0;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { field += '"'; i += 1; } else if (ch === '"') quoted = false; else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delim) { row.push(field); field = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i += 1;
      row.push(field); n += 1; onRow(row, n); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); n += 1; onRow(row, n); }
}

/** CSV -> grid lengkap (termasuk baris kosong). */
function parseCsv(content) {
  const rows = [];
  readCsv(content, (r) => rows.push(r));
  return rows;
}

// Audit 24 Nov (8-9): file kecil bisa memaksa parser membuat jutaan sel kosong (satu sel di baris 1.048.576 atau
// kolom XFD, jutaan baris kosong di CSV, atau XLSX "bom zip" yang membengkak saat dibuka). Karena itu:
// - XLSX: ukuran setelah dibuka dicek dari direktori zip sebelum exceljs membaca isinya;
// - hanya baris yang punya isi yang disimpan (nomor barisnya tetap dibawa), sel kosong di ujung kanan diabaikan;
// - lebar isi dibatasi MAX_COLS, dan pembacaan berhenti bila baris berisi jauh melewati MAX_ROWS.
const MAX_COLS = 200;
const MAX_UNZIPPED_BYTES = 50 * 1024 * 1024;
const ROW_SLACK = 20; // baris judul laporan/catatan di atas tabel
const tooWide = () => badRequest(`Maksimal ${MAX_COLS} kolom. Hapus isi sel di kanan tabel lalu unggah ulang.`);
const tooManyRows = () => new HttpError(413, 'TOO_MANY_ROWS', `Maksimal ${MAX_ROWS} baris per file`);

/** Pengumpul baris berisi: { add(vals, n), rows } dengan batas lebar dan batas baris kasar. */
function filledRows() {
  const rows = [];
  return {
    rows,
    add(vals, n) {
      let end = vals.length;
      while (end > 0 && isBlank(vals[end - 1])) end -= 1;
      if (end === 0) return;
      if (end > MAX_COLS) throw tooWide();
      rows.push({ n, vals: Array.from({ length: end }, (_, c) => (vals[c] === undefined ? null : vals[c])) });
      if (rows.length > MAX_ROWS + ROW_SLACK) throw tooManyRows();
    },
  };
}

async function assertUnzippedSize(buffer) {
  let zip;
  try { zip = await JSZip.loadAsync(buffer); } catch { throw badRequest('File Excel tidak bisa dibaca. Simpan ulang sebagai .xlsx atau .csv'); }
  let total = 0;
  zip.forEach((_path, entry) => { total += (entry._data && entry._data.uncompressedSize) || 0; });
  if (total > MAX_UNZIPPED_BYTES) throw new HttpError(413, 'FILE_TOO_LARGE', 'Isi file Excel terlalu besar. Simpan ulang tanpa gambar atau lembar lain, atau pakai .csv');
}

/** Lembar -> [{ n: nomor baris, vals }] hanya untuk baris yang punya isi. */
async function parseXlsx(buffer) {
  await assertUnzippedSize(buffer);
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); } catch { throw badRequest('File Excel tidak bisa dibaca. Simpan ulang sebagai .xlsx atau .csv'); }
  // Lembar pertama yang bukan "Petunjuk" (template ELGOS punya lembar petunjuk)
  const ws = wb.worksheets.find((w) => !/^petunjuk/i.test(w.name)) || wb.worksheets[0];
  if (!ws) return [];
  const out = filledRows();
  ws.eachRow((r, n) => { // tanpa includeEmpty: baris tanpa sel bernilai dilewati
    const vals = [];
    r.eachCell((cell, c) => { // tanpa includeEmpty: sel tanpa nilai dilewati
      const v = cellValue(cell.value);
      if (c > MAX_COLS) { if (!isBlank(v)) throw tooWide(); return; }
      vals[c - 1] = v;
    });
    out.add(vals, n);
  });
  return out.rows;
}

function parseCsvFilled(content) {
  const out = filledRows();
  readCsv(content, (fields, n) => out.add(fields, n));
  return out.rows;
}

/** buffer + nama file -> { headers, rows } (baris kosong dibuang). */
async function parseUpload(buffer, filename) {
  if (!buffer || !buffer.length) throw badRequest('File kosong');
  const ext = String(filename || '').toLowerCase().split('.').pop();
  let grid; // [{ n: nomor baris di spreadsheet (1 = pertama), vals }] hanya baris berisi
  if (ext === 'xlsx') grid = await parseXlsx(buffer);
  else if (ext === 'csv' || ext === 'txt') grid = parseCsvFilled(buffer.toString('utf8'));
  else throw badRequest('Format file harus .xlsx atau .csv');
  if (!grid.length) throw badRequest('File tidak berisi data');

  // lebar tabel = isi paling kanan di seluruh lembar (kolom berisi tanpa judul jadi "Kolom N")
  const width = grid.reduce((w, r) => Math.max(w, r.vals.length), 0);
  const header = grid[0].vals;
  const headers = Array.from({ length: width }, (_, i) => (isBlank(header[i]) ? `Kolom ${i + 1}` : String(header[i]).trim()));
  if (new Set(headers).size !== headers.length) throw badRequest('Judul kolom tidak boleh kembar');
  const rows = grid.slice(1).map(({ n, vals }) => {
    const obj = { __row: n };
    headers.forEach((h, c) => { obj[h] = vals[c] === undefined ? null : vals[c]; });
    return obj;
  });
  if (!rows.length) throw badRequest('File tidak berisi baris data di bawah judul kolom');
  if (rows.length > MAX_ROWS) throw tooManyRows();
  return { headers, rows };
}

module.exports = { parseUpload, parseCsv, cellValue, MAX_ROWS, MAX_COLS, MAX_UNZIPPED_BYTES };
