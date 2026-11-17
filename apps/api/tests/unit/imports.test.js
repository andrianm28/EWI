const ExcelJS = require('exceljs');
const v = require('../../src/modules/imports/values');
const { parseUpload, parseCsv } = require('../../src/modules/imports/parse');
const { suggestMapping, checkMapping, applyMapping } = require('../../src/modules/imports/mapping');
const { templateXlsx, templateCsv } = require('../../src/modules/imports/template');
const { KINDS, getKind } = require('../../src/modules/imports/kinds');

describe('R3-3 nilai sel Indonesia', () => {
  it('angka dengan koma desimal, ribuan, dan persen', () => {
    expect(v.number('85,5')).toBe(85.5);
    expect(v.number('1.234,5')).toBe(1234.5);
    expect(v.number('1,234.5')).toBe(1234.5);
    expect(v.number('1.000')).toBe(1000);
    expect(v.number('90%')).toBe(90);
    expect(v.number(12)).toBe(12);
    expect(v.number('abc')).toBeNaN();
  });
  it('tanggal ISO, dd/mm/yyyy, serial Excel; tanggal mustahil ditolak', () => {
    expect(v.isoDate(v.date('2026-11-30'))).toBe('2026-11-30');
    expect(v.isoDate(v.date('30/11/2026'))).toBe('2026-11-30');
    expect(v.isoDate(v.date(46356))).toBe('2026-11-30');
    expect(v.date('31/02/2026')).toBeNull();
  });
  it('biner ya/tidak', () => {
    expect(v.binary('Ya')).toBe(1);
    expect(v.binary('tidak tercapai')).toBe(0);
    expect(v.binary('mungkin')).toBeNull();
  });
});

describe('R3-3 parser file', () => {
  it('CSV titik koma (Excel Indonesia), kutip, BOM, baris kosong dibuang', async () => {
    const csv = '\uFEFFID Karyawan;Nama;Catatan\nE-1;"Dimas; P";"kata ""kunci"""\n\n;;\nE-2;Rina;\n';
    expect(parseCsv(csv)[1]).toEqual(['E-1', 'Dimas; P', 'kata "kunci"']);
    const { headers, rows } = await parseUpload(Buffer.from(csv), 'data.csv');
    expect(headers).toEqual(['ID Karyawan', 'Nama', 'Catatan']);
    expect(rows.map((r) => [r.__row, r.Nama])).toEqual([[2, 'Dimas; P'], [5, 'Rina']]);
  });
  it('XLSX: lembar Petunjuk dilewati, tanggal & rumus jadi nilai', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Petunjuk').addRow(['abaikan']);
    const ws = wb.addWorksheet('Data');
    ws.addRow(['Email', 'Skor', 'Tanggal']);
    ws.addRow(['a@b.co', { formula: '1+1', result: 2 }, new Date(Date.UTC(2026, 10, 10))]);
    const { rows } = await parseUpload(Buffer.from(await wb.xlsx.writeBuffer()), 'x.xlsx');
    expect(rows[0]).toMatchObject({ __row: 2, Email: 'a@b.co', Skor: 2 });
    expect(v.isoDate(v.date(rows[0].Tanggal))).toBe('2026-11-10');
  });
  it('menolak format lain dan file kosong', async () => {
    await expect(parseUpload(Buffer.from('x'), 'a.pdf')).rejects.toThrow(/xlsx atau .csv/);
    await expect(parseUpload(Buffer.from('A,B\n'), 'a.csv')).rejects.toThrow(/baris data/);
  });
});

describe('R3-3 pemetaan kolom', () => {
  const kind = getKind('tna_performance');
  it('menyarankan pemetaan dari judul dan sinonim (ekspor HappyFive)', () => {
    const m = suggestMapping(['NIK', 'Key Result', 'Goal', 'Pencapaian', 'Tipe'], kind.fields);
    expect(m).toMatchObject({ employeeId: 'NIK', name: 'Key Result', target: 'Goal', actual: 'Pencapaian', email: null });
  });
  it('wajib memetakan kolom wajib dan salah satu identitas karyawan', () => {
    const headers = ['NIK', 'Jenis', 'Nama', 'T', 'R'];
    expect(checkMapping({ metricType: 'Jenis', name: 'Nama', target: 'T', actual: 'R' }, headers, kind.fields)).toMatch(/ID Karyawan atau Email/);
    expect(checkMapping({ employeeId: 'NIK', name: 'Nama', target: 'T', actual: 'R' }, headers, kind.fields)).toMatch(/Jenis Metrik/);
    expect(checkMapping({ employeeId: 'NIK', metricType: 'Jenis', name: 'Nama', target: 'T', actual: 'X' }, headers, kind.fields)).toMatch(/tidak ada di file/);
    expect(checkMapping({ employeeId: 'NIK', metricType: 'Jenis', name: 'Nama', target: 'T', actual: 'R' }, headers, kind.fields)).toBeNull();
    expect(applyMapping({ NIK: 'E-1', T: 3 }, { employeeId: 'NIK', target: 'T', email: null })).toEqual({ employeeId: 'E-1', target: 3 });
  });
});

describe('R3-3 kinerja: tipe nilai BT-26', () => {
  const kind = getKind('tna_performance');
  // ctx baru per kasus: satu file tidak boleh memuat arah/toleransi berbeda untuk KPI yang sama (PK-20)
  const c = () => ({ find: () => ({ id: 'u1' }) });
  const base = { employeeId: 'E-1', metricType: 'KPI', name: 'Resolusi tiket' };
  it('persen, biner, tenggat, dan arah', () => {
    expect(kind.validate({ ...base, valueType: 'persen', target: '90%', actual: '72,5%' }, c(), { period: '2026-11' }).value)
      .toMatchObject({ target: 90, actual: 72.5, isMet: false, unit: '%', period: '2026-11', valueType: 'persen' });
    expect(kind.validate({ ...base, valueType: 'biner', actual: 'ya' }, c(), {}).value).toMatchObject({ target: 1, actual: 1, isMet: true });
    const late = kind.validate({ ...base, valueType: 'tenggat', target: '30/11/2026', actual: '2026-12-02' }, c(), {}).value;
    expect(late).toMatchObject({ direction: 'lower', isMet: false });
    expect(kind.validate({ ...base, target: 15, actual: 10, direction: 'lebih rendah lebih baik' }, c(), {}).value.isMet).toBe(true);
  });
  it('alasan penolakan dalam bahasa Indonesia', () => {
    expect(kind.validate({ ...base, metricType: 'nps', target: 1, actual: 1 }, c(), {}).error).toMatch(/okr, kpi, atau sla/);
    expect(kind.validate({ ...base, valueType: 'biner', actual: 'mungkin' }, c(), {}).error).toMatch(/ya atau tidak/);
    expect(kind.validate({ ...base, target: 'a', actual: 1 }, c(), {}).error).toMatch(/harus angka/);
    expect(kind.validate({ ...base, target: 1, actual: 1 }, { find: () => null }, {}).error).toMatch(/tidak ditemukan/);
  });
});

describe('PK-20 toleransi per KPI (PM-1 opsi B)', () => {
  const kind = getKind('tna_performance');
  const base = { employeeId: 'E-1', metricType: 'kpi', name: 'Resolusi tiket < 4 jam', valueType: 'persen', target: '90%' };
  const ctxWith = (rules = []) => ({ find: () => ({ id: 'u1' }), rules: new Map(rules.map((r) => [`${r.metricType}|${r.metricKey}`, r])) });

  it('toleransi kosong = 0 (sama dengan arah saja)', () => {
    const r = kind.validate({ ...base, actual: '88%' }, ctxWith(), { period: '2026-11' }).value;
    expect(r).toMatchObject({ tolerance: 0, isMet: false, ruleChanged: false });
  });
  it('realisasi di dalam toleransi dianggap tercapai, di luar toleransi meleset', () => {
    expect(kind.validate({ ...base, actual: '86%', tolerance: '5' }, ctxWith(), {}).value).toMatchObject({ tolerance: 5, isMet: true, ruleChanged: true });
    expect(kind.validate({ ...base, actual: '84%', tolerance: '5%' }, ctxWith(), {}).value).toMatchObject({ tolerance: 5, isMet: false });
    const lower = kind.validate({ ...base, valueType: 'angka', target: 4, actual: 4.5, direction: 'lebih rendah lebih baik', tolerance: '0,5' }, ctxWith(), {}).value;
    expect(lower).toMatchObject({ direction: 'lower', tolerance: 0.5, isMet: true });
    const late = kind.validate({ ...base, valueType: 'tenggat', target: '2026-11-30', actual: '2026-12-02', tolerance: 2 }, ctxWith(), {}).value;
    expect(late).toMatchObject({ direction: 'lower', tolerance: 2, isMet: true });
  });
  it('kolom kosong memakai aturan KPI tersimpan; nilai sama dengan aturan bukan perubahan', () => {
    const saved = [{ metricType: 'kpi', metricKey: 'resolusi tiket < 4 jam', direction: 'higher', tolerance: 3 }];
    expect(kind.validate({ ...base, name: '  Resolusi  tiket < 4 JAM ', actual: '88%' }, ctxWith(saved), {}).value).toMatchObject({ tolerance: 3, isMet: true, ruleChanged: false });
    expect(kind.validate({ ...base, actual: '88%', tolerance: 3 }, ctxWith(saved), {}).value.ruleChanged).toBe(false);
    expect(kind.validate({ ...base, actual: '88%', tolerance: 1 }, ctxWith(saved), {}).value).toMatchObject({ isMet: false, ruleChanged: true });
  });
  it('menolak toleransi negatif, biner bertoleransi, dan aturan berbeda untuk KPI yang sama dalam satu file', () => {
    expect(kind.validate({ ...base, actual: '80%', tolerance: '-1' }, ctxWith(), {}).error).toMatch(/Toleransi harus angka 0 atau lebih/);
    expect(kind.validate({ ...base, valueType: 'biner', target: 'ya', actual: 'tidak', tolerance: 1 }, ctxWith(), {}).error).toMatch(/biner tidak memakai toleransi/);
    const ctx = ctxWith();
    expect(kind.validate({ ...base, actual: '80%', tolerance: 5 }, ctx, {}).value).toBeTruthy();
    expect(kind.validate({ ...base, employeeId: 'E-2', actual: '80%' }, ctx, {}).value.tolerance).toBe(5);
    expect(kind.validate({ ...base, employeeId: 'E-3', actual: '80%', tolerance: 2 }, ctx, {}).error).toMatch(/berbeda dengan baris sebelumnya/);
  });
});

describe('R3-3 template', () => {
  it('setiap jenis punya template XLSX (dengan Petunjuk) dan CSV yang bisa dibaca ulang dan terpetakan penuh', async () => {
    for (const kind of KINDS) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await templateXlsx(kind));
      expect(wb.worksheets.map((w) => w.name)).toContain('Petunjuk');
      const { headers } = await parseUpload(await templateXlsx(kind), 't.xlsx');
      const m = suggestMapping(headers, kind.fields);
      expect(Object.values(m).every(Boolean)).toBe(true);
      const csv = await parseUpload(Buffer.from(templateCsv(kind)), 't.csv');
      expect(csv.headers).toEqual(kind.fields.map((f) => f.header));
    }
  });
});
