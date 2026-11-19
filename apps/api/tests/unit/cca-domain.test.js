const { GAP_TOLERANCE, decorate, readiness, buildOverview } = require('../../src/modules/cca/readiness');
const { validateProgramConfig, statusOf, finalScoreOf, buildReport, normalizeManualReport, buildManualReport } = require('../../src/modules/cca/program-report');
const kind = require('../../src/modules/imports/kinds/cca-program-results');

const req = (name, targetScore, actualScore, status = 'draft') => ({ id: name, name, targetScore, actualScore, status });

describe('CCA: kesiapan dan klasifikasi', () => {
  it('gap dalam batas toleransi diberi klasifikasi dalam_batas, di atasnya perlu_ditinjau', () => {
    expect(GAP_TOLERANCE).toBe(8);
    expect(decorate(req('a', 80, 72))).toMatchObject({ gap: 8, classification: 'dalam_batas' });
    expect(decorate(req('b', 80, 71))).toMatchObject({ gap: 9, classification: 'perlu_ditinjau' });
  });

  it('aktual di atas target tidak menghasilkan gap negatif', () => {
    expect(decorate(req('a', 80, 90))).toMatchObject({ gap: 0, classification: 'dalam_batas' });
  });

  it('tanpa nilai aktual: gap null dan belum_diukur', () => {
    expect(decorate(req('a', 80, null))).toMatchObject({ gap: null, classification: 'belum_diukur' });
  });

  it('kesiapan = jumlah aktual / jumlah target atas baris terukur', () => {
    // contoh mockup grup Misi: (68 + 74) / (75 + 80) = 91,6 -> 92
    expect(readiness([req('m1', 75, 68), req('m2', 80, 74)])).toBe(92);
    expect(readiness([req('m1', 75, 68), req('x', 80, null)])).toBe(91);
    expect(readiness([req('x', 80, null)])).toBeNull();
    // kelebihan satu baris tidak menutupi gap baris lain: (80 + 40) / 160
    expect(readiness([req('a', 80, 100), req('b', 80, 40)])).toBe(75);
    expect(readiness([])).toBeNull();
  });

  it('overview: memilih sumber per grup, menyembunyikan rejected, menghitung KPI', () => {
    const sources = [
      { id: 's1', kind: 'vision', title: 'Corporate Vision', text: 'v', requirements: [req('V1', 80, 63), req('V4', 80, 49), req('buang', 80, 10, 'rejected')] },
      { id: 's2', kind: 'mission', title: 'Corporate Mission', text: 'm', requirements: [req('M1', 75, 68, 'validated'), req('M3', 70, null)] },
      { id: 's3', kind: 'value', title: 'Credible', text: 'c', requirements: [req('C1a', 85, 78)] },
    ];
    const o = buildOverview(sources, 'vm');
    expect(o.groups.map((g) => g.id)).toEqual(['s1', 's2']);
    expect(o.groups[0].rows.map((r) => r.name)).toEqual(['V1', 'V4']);
    expect(o.groups[0].readiness).toBe(70); // (63 + 49) / 160
    expect(o.kpis.readiness).toBe(77); // (63 + 49 + 68) / (80 + 80 + 75)
    expect(o.kpis.biggestGap).toEqual({ name: 'V4', gap: 31 });
    expect(o.kpis.belowTarget).toEqual({ count: 2, measured: 3, total: 4 });
    expect(o.kpis.pendingValidation).toBe(3);

    const v = buildOverview(sources, 'values');
    expect(v.groups.map((g) => g.id)).toEqual(['s3']);
    expect(v.kpis.weakestSource).toEqual({ title: 'Credible', readiness: 92 });
  });

  it('overview kosong tidak melempar', () => {
    const o = buildOverview([], 'vm');
    expect(o).toEqual({ kpis: { readiness: null, biggestGap: null, belowTarget: { count: 0, measured: 0, total: 0 }, pendingValidation: 0 }, groups: [] });
  });
});

const CONFIG = {
  values: [{ name: 'Credible' }, { name: 'Competent' }],
  components: [{ name: 'Kuis', weight: 40 }, { name: 'Asesmen akhir', weight: 60 }],
  totalActivities: 2,
  passScore: 70,
  bands: [{ key: 'strong', label: 'Strong', min: 85 }, { key: 'baseline', label: 'Baseline', min: 70 }],
};

describe('CCA: konfigurasi program nilai', () => {
  it('menerima konfigurasi yang benar dan mengurutkan band menurun', () => {
    const res = validateProgramConfig({ ...CONFIG, bands: [...CONFIG.bands].reverse() });
    expect(res.error).toBeUndefined();
    expect(res.value.bands.map((b) => b.key)).toEqual(['strong', 'baseline']);
  });

  it.each([
    [{ ...CONFIG, values: [] }, /nilai/i],
    [{ ...CONFIG, values: Array.from({ length: 9 }, (_, i) => ({ name: `n${i}` })) }, /8/],
    [{ ...CONFIG, components: [{ name: 'x', weight: 120 }] }, /bobot/i],
    [{ ...CONFIG, components: [{ name: 'x', weight: 40 }, { name: 'y', weight: 50 }] }, /100/],
    [{ ...CONFIG, totalActivities: 0 }, /kegiatan/i],
    [{ ...CONFIG, passScore: 101 }, /lulus/i],
    [{ ...CONFIG, bands: [{ key: 'a', label: 'A', min: 60 }] }, /band/i],
    // band terendah di atas skor lulus meninggalkan skor 70-74 tanpa band
    [{ ...CONFIG, bands: [{ key: 'a', label: 'A', min: 75 }] }, /sama dengan skor lulus/i],
    [{ ...CONFIG, bands: [{ key: 'a', label: 'A', min: 80 }, { key: 'a', label: 'B', min: 70 }] }, /band/i],
    [null, /config/i],
  ])('menolak konfigurasi salah %#', (config, pattern) => {
    expect(validateProgramConfig(config).error).toMatch(pattern);
  });
});

describe('CCA: status dan laporan program', () => {
  const r = (userId, division, activitiesDone, finalScore, valueScores, componentScores) => ({ userId, division, activitiesDone, finalScore, valueScores, componentScores });

  it('status: in_progress, not_passed, lalu band tertinggi yang terpenuhi', () => {
    expect(statusOf(r('a', 'X', 1, 95, [], []), CONFIG)).toBe('in_progress');
    expect(statusOf(r('a', 'X', 2, 69.9, [], []), CONFIG)).toBe('not_passed');
    expect(statusOf(r('a', 'X', 2, 70, [], []), CONFIG)).toBe('baseline');
    expect(statusOf(r('a', 'X', 2, 85, [], []), CONFIG)).toBe('strong');
  });

  it('skor akhir kosong dihitung dari komponen berbobot', () => {
    expect(finalScoreOf(r('a', 'X', 2, null, [], [50, 100]), CONFIG)).toBe(80);
    expect(finalScoreOf(r('a', 'X', 2, null, [], [50, null]), CONFIG)).toBe(20);
    expect(finalScoreOf(r('a', 'X', 2, 77, [], [50, 100]), CONFIG)).toBe(77);
  });

  it('laporan agregat dihitung dari baris karyawan', () => {
    const results = [
      r('u1', 'Ops', 2, 90, [90, 100], [80, 100]),
      r('u2', 'Ops', 2, 60, [80, 90], [30, 80]),
      r('u3', 'Ops', 1, null, [70, null], [50, null]),
      r('u4', 'Sales', 0, null, [null, null], [null, null]),
    ];
    const rep = buildReport({ key: 'p', name: 'Program', provider: 'EA', cutoffDate: '2026-10-09', config: CONFIG, insight: 'i', recommendations: [{ title: 't', detail: 'd' }] }, results);
    expect(rep.program).toMatchObject({ key: 'p', name: 'Program', provider: 'EA', cutoffDate: '2026-10-09' });
    expect(rep.kpis).toEqual({ registered: 4, completed: 2, completedPct: 50, passed: 1, passedPct: 25, avgValueScore: 90 });
    expect(rep.source).toBe('results');
    expect(rep.statuses).toEqual([
      { key: 'strong', label: 'Strong', description: null, min: 85, count: 1, pct: 25 },
      { key: 'baseline', label: 'Baseline', description: null, min: 70, count: 0, pct: 0 },
      { key: 'not_passed', label: 'Belum lulus', count: 1, pct: 25 },
      { key: 'in_progress', label: 'Masih berjalan', count: 2, pct: 50 },
    ]);
    // nilai 1: selesai (90 + 80) / 2 = 85; semua (90 + 80 + 70 + 0) / 4 = 60
    expect(rep.values).toEqual([
      { name: 'Credible', avgCompleted: 85, avgAll: 60 },
      { name: 'Competent', avgCompleted: 95, avgAll: 47.5 },
    ]);
    expect(rep.components).toEqual([
      { name: 'Kuis', weight: 40, done: 3, donePct: 75, avg: 55, contribution: 22 },
      { name: 'Asesmen akhir', weight: 60, done: 2, donePct: 50, avg: 90, contribution: 54 },
    ]);
    expect(rep.total).toEqual({ done: 2, donePct: 50, avgFinal: 75 });
    expect(rep.divisions).toEqual([
      { name: 'Ops', participants: 3, completed: 2, completedPct: 67, passed: 1, passedPct: 33, avgFinal: 75, avgValueScore: 90 },
      { name: 'Sales', participants: 1, completed: 0, completedPct: 0, passed: 0, passedPct: 0, avgFinal: null, avgValueScore: null },
    ]);
    expect(rep.allDivisions).toEqual({ name: 'Semua divisi', participants: 4, completed: 2, completedPct: 50, passed: 1, passedPct: 25, avgFinal: 75, avgValueScore: 90 });
    expect(rep.insight).toBe('i');
    expect(rep.recommendations).toEqual([{ title: 't', detail: 'd' }]);
  });

  it('divisi dikelompokkan tanpa membedakan huruf besar/kecil', () => {
    const rep = buildReport({ key: 'p', name: 'P', config: CONFIG }, [r('u1', 'Sales', 2, 90, [90, 90], [90, 90]), r('u2', ' sales ', 0, null, [], [])]);
    expect(rep.divisions.map((d) => [d.name, d.participants])).toEqual([['Sales', 2]]);
  });

  it('isian agregat: divalidasi lalu ditampilkan berbentuk sama dengan laporan hasil impor', () => {
    const input = {
      registered: 10, completed: 6, passed: 4, avgValueScore: 93.4, avgFinal: 72.1,
      statuses: { strong: 1, baseline: 3, not_passed: 2, in_progress: 4 },
      values: [{ avgCompleted: 92.5, avgAll: 70 }, { avgCompleted: 92.8, avgAll: null }],
      components: [{ done: 9, avg: 50 }, { done: 6, avg: 90 }],
      divisions: [{ name: 'Ops', participants: 8, completed: 5, passed: 3, avgFinal: 71.3, avgValueScore: 93.7 }, { name: 'Sales', participants: 2, completed: 1, passed: 1, avgFinal: null, avgValueScore: null }],
    };
    const out = normalizeManualReport(CONFIG, input);
    expect(out.error).toBeUndefined();
    const rep = buildManualReport({ key: 'p', name: 'P', config: CONFIG, insight: null, recommendations: [] }, out.value);
    expect(rep.source).toBe('manual');
    expect(rep.kpis).toEqual({ registered: 10, completed: 6, completedPct: 60, passed: 4, passedPct: 40, avgValueScore: 93.4 });
    expect(rep.statuses.map((s) => [s.key, s.count, s.pct])).toEqual([['strong', 1, 10], ['baseline', 3, 30], ['not_passed', 2, 20], ['in_progress', 4, 40]]);
    expect(rep.components[0]).toEqual({ name: 'Kuis', weight: 40, done: 9, donePct: 90, avg: 50, contribution: 20 });
    expect(rep.divisions[0]).toMatchObject({ name: 'Ops', completedPct: 63, passedPct: 38 });
    expect(rep.allDivisions).toMatchObject({ participants: 10, avgFinal: 72.1 });
    expect(Object.keys(rep).sort()).toEqual(Object.keys(buildReport({ key: 'p', name: 'P', config: CONFIG }, [])).sort());

    expect(normalizeManualReport(CONFIG, { ...input, statuses: { strong: 1 } }).error).toMatch(/status/i);
    expect(normalizeManualReport(CONFIG, { ...input, passed: 7 }).error).toMatch(/lulus/i);
    expect(normalizeManualReport(CONFIG, { ...input, values: [] }).error).toMatch(/2 nilai/);
    expect(normalizeManualReport(CONFIG, { ...input, divisions: [{ name: 'Ops', participants: 3, completed: 0, passed: 0 }] }).error).toMatch(/divisi/i);
    expect(normalizeManualReport(CONFIG, null).error).toMatch(/wajib/);
  });

  it('laporan tanpa peserta tidak membagi dengan nol', () => {
    const rep = buildReport({ key: 'p', name: 'P', config: CONFIG }, []);
    expect(rep.kpis).toEqual({ registered: 0, completed: 0, completedPct: 0, passed: 0, passedPct: 0, avgValueScore: null });
    expect(rep.divisions).toEqual([]);
    expect(rep.values[0]).toEqual({ name: 'Credible', avgCompleted: null, avgAll: null });
  });
});

describe('CCA: impor hasil program nilai', () => {
  const program = { id: 'prog-1', key: 'dna-5c', config: CONFIG };
  const user = { id: 'u-1', email: 'a@x.test', employeeId: 'E-1', jobRoleId: 'jr-1' };
  const ctx = { program, find: (row) => (row.employeeId === 'E-1' ? user : null), divisionOf: () => 'Ops' };
  const stores = { cca: { getProgram: async (_t, key) => (key === 'dna-5c' ? program : null) }, people: { resolve: async () => [] }, dna: { listJobRoles: async () => [] } };

  it('memetakan slot nilai dan komponen sesuai konfigurasi program', () => {
    const res = kind.validate({ employeeId: 'E-1', division: '', activitiesDone: '2', finalScore: '88,5', value1: 90, value2: '95', value3: 10, component1: 80, component2: '' }, ctx);
    expect(res.error).toBeUndefined();
    expect(res.value).toEqual({ programId: 'prog-1', userId: 'u-1', division: 'Ops', activitiesDone: 2, finalScore: 88.5, valueScores: [90, 95], componentScores: [80, null] });
  });

  it.each([
    [{ activitiesDone: 1 }, /ID Karyawan atau Email/],
    [{ employeeId: 'E-9', activitiesDone: 1 }, /tidak ditemukan/],
    [{ employeeId: 'E-1', activitiesDone: 3 }, /Kegiatan Selesai/],
    [{ employeeId: 'E-1', activitiesDone: 'dua' }, /Kegiatan Selesai/],
    [{ employeeId: 'E-1', activitiesDone: 2, finalScore: 120 }, /0-100/],
    [{ employeeId: 'E-1', activitiesDone: 2, value1: -1 }, /0-100/],
    [{ employeeId: 'E-1', activitiesDone: 2 }, /Skor Akhir atau skor komponen/],
  ])('menolak baris salah %#', (row, pattern) => {
    expect(kind.validate(row, ctx).error).toMatch(pattern);
  });

  it('gagal total bila program belum dikonfigurasi', async () => {
    expect(kind.checkOptions({})).toMatch(/program/i);
    expect(kind.checkOptions({ programKey: 'dna-5c', cutoffDate: 'kemarin' })).toMatch(/cut off/i);
    const c = await kind.context({ stores, tenantId: 't', rows: [], options: { programKey: 'x' } });
    expect(c.fatal).toMatch(/belum dikonfigurasi/);
  });

  it('gagal total bila kolom nilai atau komponen yang dipetakan tidak pas dengan konfigurasi program', async () => {
    const run = (row) => kind.context({ stores, tenantId: 't', rows: [row], options: { programKey: 'dna-5c' } });
    const full = { employeeId: 'E-1', activitiesDone: 2, value1: 1, value2: 2, component1: 3, component2: 4 };
    expect((await run(full)).fatal).toBeUndefined();
    expect((await run({ ...full, value2: undefined })).fatal).toBeUndefined(); // kolom dipetakan, sel kosong
    const { value2, ...missing } = full;
    expect(value2).toBe(2);
    expect((await run(missing)).fatal).toMatch(/Skor Nilai 1 = Credible; Skor Nilai 2 = Competent/);
    expect((await run({ ...full, component3: 9 })).fatal).toMatch(/Skor Komponen 1 = Kuis/);
  });
});
