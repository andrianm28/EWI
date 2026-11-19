const { evaluate, effectiveRule, metricKey } = require('../../src/modules/tna/performance');
const { moodleAdapter, createCatalogService } = require('../../src/integrations/catalog');
const { selectInterviewees } = require('../../src/modules/tna/targeting');
const { rankTrainingNeeds } = require('../../src/modules/tna/pareto');

describe('evaluate target kinerja (RG-2)', () => {
  it('lebih tinggi lebih baik', () => {
    expect(evaluate({ target: 100, actual: 80 })).toEqual({ isMet: false, missRatio: 0.2 });
    expect(evaluate({ target: 100, actual: 120 })).toEqual({ isMet: true, missRatio: 0 });
  });
  it('lebih rendah lebih baik (mis. SLA waktu respons)', () => {
    expect(evaluate({ target: 15, actual: 30, direction: 'lower' })).toEqual({ isMet: false, missRatio: 1 });
    expect(evaluate({ target: 15, actual: 10, direction: 'lower' }).isMet).toBe(true);
  });
});

describe('toleransi per KPI (PK-20, PM-1 opsi B)', () => {
  it('lebih tinggi: tercapai bila realisasi >= target - toleransi', () => {
    expect(evaluate({ target: 90, actual: 86, tolerance: 5 }).isMet).toBe(true);
    expect(evaluate({ target: 90, actual: 84, tolerance: 5 })).toEqual({ isMet: false, missRatio: 6 / 90 });
  });
  it('lebih rendah: tercapai bila realisasi <= target + toleransi', () => {
    expect(evaluate({ target: 4, actual: 4.5, direction: 'lower', tolerance: 0.5 }).isMet).toBe(true);
    expect(evaluate({ target: 4, actual: 4.6, direction: 'lower', tolerance: 0.5 }).isMet).toBe(false);
  });
  it('tenggat selalu lebih awal lebih baik, biner tanpa toleransi', () => {
    expect(effectiveRule('tenggat', { direction: 'higher', tolerance: 2 })).toEqual({ direction: 'lower', tolerance: 2 });
    expect(effectiveRule('biner', { direction: 'lower', tolerance: 3 })).toEqual({ direction: 'higher', tolerance: 0 });
    expect(effectiveRule('persen', {})).toEqual({ direction: 'higher', tolerance: 0 });
  });
  it('kunci KPI tidak peka huruf dan spasi', () => {
    expect(metricKey('  Resolusi   Tiket ')).toBe('resolusi tiket');
  });
});

describe('katalog statis Moodle (PK-18)', () => {
  it('adapter memakai course hasil impor yang dipetakan ke kompetensi', async () => {
    const calls = [];
    const store = { async findForCompetency(tenantId, q) { calls.push({ tenantId, ...q }); return [{ ref: 'SDL1-101', title: 'Membaca SLA', url: null }]; } };
    const svc = createCatalogService({ moodle: moodleAdapter(store) });
    const hit = await svc.match({ tenantId: 't', targets: ['elitementor', 'moodle'], competency: { id: 'c1', name: 'SLA' }, tier: 'basic' });
    expect(hit).toEqual({ source: 'moodle', ref: 'SDL1-101', title: 'Membaca SLA', url: null });
    expect(calls).toEqual([{ tenantId: 't', source: 'moodle', competencyId: 'c1', tier: 'basic' }]);
  });
  it('tanpa store atau tanpa kompetensi hasilnya kosong', async () => {
    expect(await moodleAdapter().findForCompetency({ tenantId: 't', competency: { id: 'c1' } })).toEqual([]);
    expect(await moodleAdapter({ findForCompetency: async () => [{ ref: 'x' }] }).findForCompetency({ tenantId: 't', competency: null })).toEqual([]);
  });
});

describe('selectInterviewees (BT-29 terbuka: dua aturan)', () => {
  const members = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const records = [
    { id: 'r1', userId: 'a', isMet: false }, { id: 'r2', userId: 'a', isMet: true },
    { id: 'r3', userId: 'b', isMet: true }, { id: 'r4', userId: 'a', isMet: false },
  ];
  it('all_members: semua anggota, target merah jadi pemicu', () => {
    expect(selectInterviewees({ members, records, scope: 'all_members' })).toEqual([
      { userId: 'a', triggerRecordIds: ['r1', 'r4'], focus: 'red' },
      { userId: 'b', triggerRecordIds: [], focus: 'competency' },
      { userId: 'c', triggerRecordIds: [], focus: 'competency' },
    ]);
  });
  it('red_only: hanya yang punya target merah', () => {
    expect(selectInterviewees({ members, records, scope: 'red_only' }).map((x) => x.userId)).toEqual(['a']);
  });
  it('scope wajib eksplisit', () => {
    expect(() => selectInterviewees({ members, records, scope: null })).toThrow();
  });
});

describe('rankTrainingNeeds (Pareto, BT-30)', () => {
  const findings = [
    { userId: 'a', competencyId: 'c1', competencyName: 'Kontrak proyek', missRatio: 0.5, importance: 3 },
    { userId: 'b', competencyId: 'c1', competencyName: 'Kontrak proyek', missRatio: 0.3, importance: 3 },
    { userId: 'c', competencyId: 'c1', competencyName: 'Kontrak proyek', missRatio: 0.1, importance: 3 },
    { userId: 'a', competencyId: 'c2', competencyName: 'SOP L1', missRatio: 1, importance: 5 },
    { userId: 'b', competencyId: null, title: 'Bahasa Inggris teknis', missRatio: null },
  ];
  it('mengurutkan dari kebutuhan terbesar dan menghitung kumulatif', () => {
    const rows = rankTrainingNeeds(findings);
    expect(rows[0]).toMatchObject({ label: 'Kontrak proyek', people: 3, score: 3.9 });
    expect(rows[1]).toMatchObject({ label: 'SOP L1', people: 1, score: 3.33 });
    expect(rows[rows.length - 1].cumulativeShare).toBe(1);
  });
  it('komponen bisa dimatikan', () => {
    const rows = rankTrainingNeeds(findings, { useMiss: false, useImportance: false });
    expect(rows.map((r) => r.score)).toEqual([3, 1, 1]);
  });
});
