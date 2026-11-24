const ExcelJS = require('exceljs');
const v = require('../../src/modules/imports/values');
const { parseUpload, parseCsv, MAX_ROWS, MAX_COLS } = require('../../src/modules/imports/parse');
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

describe('Audit 24 Nov: XLSX jarang dan lebar tidak menghabiskan memori (8-9)', () => {
  it('sel di baris 1.048.576 tidak membuat sejuta baris kosong; nomor baris tetap benar', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Data');
    ws.getCell('A1').value = 'Email';
    ws.getCell('A2').value = 'a@b.co';
    ws.getCell('A1048576').value = 'z@b.co';
    const started = Date.now();
    const { rows } = await parseUpload(Buffer.from(await wb.xlsx.writeBuffer()), 'x.xlsx');
    expect(Date.now() - started).toBeLessThan(3000);
    expect(rows.map((r) => [r.__row, r.Email])).toEqual([[2, 'a@b.co'], [1048576, 'z@b.co']]);
  });
  it('sel di kolom XFD ditolak dengan pesan jelas, bukan diproses 16.384 kolom', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Data');
    ws.getCell('A1').value = 'Email';
    ws.getCell('A2').value = 'a@b.co';
    ws.getCell('XFD2').value = 'x';
    await expect(parseUpload(Buffer.from(await wb.xlsx.writeBuffer()), 'x.xlsx')).rejects.toThrow(`Maksimal ${MAX_COLS} kolom`);
  });
  it('CSV dengan ribuan kolom juga ditolak', async () => {
    const csv = `${Array.from({ length: MAX_COLS + 1 }, (_, i) => `K${i}`).join(',')}\n${'x,'.repeat(MAX_COLS)}x\n`;
    await expect(parseUpload(Buffer.from(csv), 'a.csv')).rejects.toThrow(`Maksimal ${MAX_COLS} kolom`);
  });
  it('baris data lebih dari batas ditolak 413 tanpa membaca seluruh lembar', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Data');
    ws.addRow(['Email']);
    for (let i = 0; i <= MAX_ROWS; i += 1) ws.addRow([`u${i}@b.co`]);
    await expect(parseUpload(Buffer.from(await wb.xlsx.writeBuffer()), 'x.xlsx')).rejects.toMatchObject({ status: 413 });
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

describe('B4 impor kamus: kode, rumpun, level program, job function', () => {
  const kind = getKind('dna_competencies');
  const role = { id: 'r1', name: 'Engineer Service Delivery', levels: [{ id: 'l1', name: 'Junior' }] };
  const makeCtx = () => {
    const keyOf = (c) => `${c.jobRoleId || ''}|${c.careerLevelId || ''}|${c.name.trim().toLowerCase()}`;
    return {
      roles: [role], keyOf, seen: new Set(), existing: new Map([[keyOf({ jobRoleId: 'r1', name: 'Ticket life cycle' }), { id: 'c-old', kind: 'job' }], [keyOf({ jobRoleId: 'r1', name: 'Integritas kerja' }), { id: 'c-core', kind: 'core' }]]),
      jobFunctions: new Map([['r1', new Map([[1, 'jf-1'], [3, 'jf-3']])]]),
      codeKey: (jobRoleId, code) => `${jobRoleId}|${code.trim().toLowerCase()}`, codes: new Map([['r1|st-b1', 'c-b1']]),
    };
  };
  const base = { jobRole: 'engineer service delivery', name: 'Automation & IaC' };
  const makeCtxWith = (ctx) => ({ ...ctx, seen: new Set() });

  it('judul "Level" dipetakan ke Level Program, bukan Jenjang karier', () => {
    const m = suggestMapping(['Jabatan', 'Kode', 'Kompetensi', 'Rumpun', 'Level', 'Grade'], kind.fields);
    expect(m).toMatchObject({ jobRole: 'Jabatan', code: 'Kode', name: 'Kompetensi', stream: 'Rumpun', programTier: 'Level', careerLevel: 'Grade' });
  });
  it('baris baru membawa kode, rumpun, tingkat (B/I/A), dan job function bernomor', () => {
    const res = kind.validate({ ...base, code: 'TC-I1', stream: 'Technical', programTier: 'I', jobFunctions: 'JF1; 3' }, makeCtx());
    expect(res.value).toMatchObject({ jobRoleId: 'r1', kind: 'job', code: 'TC-I1', stream: 'Technical', programTier: 'intermediate', jobFunctionIds: ['jf-1', 'jf-3'] });
    expect(kind.validate({ ...base, programTier: 'Advance' }, makeCtx()).value.programTier).toBe('advanced');
    expect(kind.validate(base, makeCtx()).value).toMatchObject({ code: null, programTier: null, jobFunctionIds: null });
  });
  it('file lama: kolom "Level" berisi nama jenjang (mis. Junior) dibaca sebagai Jenjang, bukan ditolak', () => {
    expect(kind.validate({ ...base, programTier: 'junior' }, makeCtx()).value).toMatchObject({ careerLevelId: 'l1', programTier: null });
    // kolom Jenjang sudah terisi: nilai bukan B/I/A tetap ditolak
    expect(kind.validate({ ...base, careerLevel: 'Junior', programTier: 'junior' }, makeCtx()).error).toMatch(/Level Program/);
  });
  it('alasan penolakan kolom baru', () => {
    expect(kind.validate({ ...base, programTier: 'expert' }, makeCtx()).error).toMatch(/Level Program/);
    expect(kind.validate({ ...base, jobFunctions: '2' }, makeCtx()).error).toMatch(/nomor 2 belum ada/);
    expect(kind.validate({ ...base, jobFunctions: 'insiden' }, makeCtx()).error).toMatch(/berisi nomor/);
    expect(kind.validate({ ...base, code: 'st-b1' }, makeCtx()).error).toMatch(/sudah dipakai kompetensi lain/);
    expect(kind.validate({ name: 'Integritas', code: 'C-1' }, makeCtx()).error).toMatch(/Kode butuh Job Role/);
    const ctx = makeCtx();
    expect(kind.validate({ ...base, code: 'X-1' }, ctx).value.code).toBe('X-1');
    expect(kind.validate({ ...base, name: 'Lain', code: 'x-1' }, ctx).error).toMatch(/sudah dipakai/);
  });
  it('kompetensi yang sudah ada: diperbarui bila kolom B4 terisi, ditolak bila tidak', () => {
    expect(kind.validate({ jobRole: role.name, name: 'ticket life cycle' }, makeCtx()).error).toMatch(/sudah ada di kamus/);
    const res = kind.validate({ jobRole: role.name, name: 'ticket life cycle', code: 'ST-B4', programTier: 'basic', jobFunctions: '3' }, makeCtx());
    expect(res.value).toEqual({ id: 'c-old', patch: { code: 'ST-B4', programTier: 'basic' }, jobFunctionIds: ['jf-3'] });
  });
  it('impor ulang dengan nilai yang sama tidak mengubah apa pun (pengesahan tidak direset); hanya kolom yang berubah masuk patch', () => {
    const ctx = makeCtx();
    ctx.existing.set(ctx.keyOf({ jobRoleId: 'r1', name: 'Approved' }), { id: 'c-ok', kind: 'job', code: 'ST-B9', stream: 'Technical', programTier: 'basic' });
    ctx.codes.set('r1|st-b9', 'c-ok');
    expect(kind.validate({ jobRole: role.name, name: 'approved', code: 'ST-B9', stream: 'Technical', programTier: 'B' }, ctx).error).toMatch(/sudah ada di kamus.*tidak ada perubahan/);
    expect(kind.validate({ jobRole: role.name, name: 'approved', code: 'ST-B9', programTier: 'intermediate' }, makeCtxWith(ctx)).value).toEqual({ id: 'c-ok', patch: { programTier: 'intermediate' }, jobFunctionIds: null });
    // hanya pemetaan job function: diterima tanpa patch (pemetaan tidak mereset pengesahan)
    expect(kind.validate({ jobRole: role.name, name: 'approved', code: 'ST-B9', jobFunctions: '1' }, makeCtxWith(ctx)).value).toEqual({ id: 'c-ok', patch: {}, jobFunctionIds: ['jf-1'] });
  });
  it('sel Job Function tanpa nomor ditolak (tidak menghapus pemetaan); kompetensi inti yang sudah ada tidak bisa dipetakan', () => {
    expect(kind.validate({ jobRole: role.name, name: 'ticket life cycle', jobFunctions: ';' }, makeCtx()).error).toMatch(/berisi nomor/);
    expect(kind.validate({ jobRole: role.name, name: 'ticket life cycle', jobFunctions: 'JF' }, makeCtx()).error).toMatch(/berisi nomor/);
    expect(kind.validate({ jobRole: role.name, name: 'Integritas kerja', jobFunctions: '1' }, makeCtx()).error).toMatch(/hanya untuk kompetensi jabatan/);
  });
});

describe('B4 impor job function', () => {
  const kind = getKind('dna_job_functions');
  const makeCtx = () => ({
    roles: [{ id: 'r1', name: 'Engineer Service Delivery' }],
    state: new Map([['r1', { orders: new Set([1]), names: new Set(['penanganan insiden']), next: 2 }]]),
  });
  it('nomor kosong melanjutkan nomor terakhir; nomor dan nama ganda ditolak', () => {
    const ctx = makeCtx();
    expect(kind.validate({ jobRole: 'Engineer Service Delivery', name: 'Change management' }, ctx).value).toEqual({ jobRoleId: 'r1', order: 2, name: 'Change management' });
    expect(kind.validate({ jobRole: 'Engineer Service Delivery', name: 'Automation', order: 5 }, ctx).value.order).toBe(5);
    expect(kind.validate({ jobRole: 'Engineer Service Delivery', name: 'Migrasi' }, ctx).value.order).toBe(3);
    expect(kind.validate({ jobRole: 'Engineer Service Delivery', name: 'Keamanan', order: 1 }, ctx).error).toMatch(/No 1 sudah dipakai/);
    expect(kind.validate({ jobRole: 'Engineer Service Delivery', name: 'PENANGANAN insiden' }, ctx).error).toMatch(/sudah ada/);
    expect(kind.validate({ jobRole: 'Tidak ada', name: 'X' }, ctx).error).toMatch(/belum ada/);
    expect(kind.validate({ jobRole: 'Engineer Service Delivery', name: 'X', order: 0 }, ctx).error).toMatch(/1-999/);
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
