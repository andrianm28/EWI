'use strict';
// Template unduhan (XLSX dengan lembar Petunjuk, atau CSV) dari definisi field yang sama dengan validasi.
const ExcelJS = require('exceljs');

const csvCell = (x) => {
  const s = x === null || x === undefined ? '' : String(x);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function templateCsv(kind) {
  const head = kind.fields.map((f) => csvCell(f.header)).join(',');
  const example = kind.fields.map((f) => csvCell(f.example ?? '')).join(',');
  return `\uFEFF${head}\n${example}\n`;
}

async function templateXlsx(kind) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ELGOS';
  const ws = wb.addWorksheet(kind.label.replace(/[\\/*?:[\]]/g, '-').slice(0, 31));
  ws.addRow(kind.fields.map((f) => f.header));
  ws.addRow(kind.fields.map((f) => f.example ?? ''));
  ws.getRow(1).font = { bold: true };
  ws.getRow(2).font = { italic: true, color: { argb: 'FF808080' } };
  ws.columns.forEach((c, i) => { c.width = Math.max(14, kind.fields[i].header.length + 4); });
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const help = wb.addWorksheet('Petunjuk');
  help.addRow([kind.label]).font = { bold: true, size: 13 };
  help.addRow([kind.description]);
  help.addRow(['Baris 2 di lembar pertama adalah contoh; hapus atau timpa sebelum diunggah. Judul kolom boleh beda, nanti dipetakan saat impor.']);
  help.addRow([]);
  help.addRow(['Kolom', 'Wajib', 'Keterangan', 'Contoh']).font = { bold: true };
  for (const f of kind.fields) {
    const wajib = f.required ? 'Ya' : (f.oneOf ? 'Salah satu' : 'Tidak');
    help.addRow([f.header, wajib, f.help || '', f.example ?? '']);
  }
  help.getColumn(1).width = 22; help.getColumn(2).width = 12; help.getColumn(3).width = 70; help.getColumn(4).width = 28;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { templateCsv, templateXlsx };
