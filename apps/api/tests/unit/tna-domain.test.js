const { evaluate, normalizeRow } = require('../../src/modules/tna/performance');
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

describe('normalizeRow', () => {
  it('menolak baris tanpa identitas karyawan atau tipe salah', () => {
    expect(normalizeRow({ metricType: 'kpi', name: 'x', target: 1, actual: 1 }).error).toMatch(/employeeId/);
    expect(normalizeRow({ email: 'a@b.c', metricType: 'nps', name: 'x', target: 1, actual: 1 }).error).toMatch(/metricType/);
    expect(normalizeRow({ email: 'a@b.c', metricType: 'kpi', name: 'x', target: 'a', actual: 1 }).error).toMatch(/angka/);
  });
  it('menghitung isMet dan menormalkan email', () => {
    const { row } = normalizeRow({ email: 'Dimas@ELGOS.test', metricType: 'SLA', name: 'Respons tiket', target: 15, actual: 25, direction: 'lower' });
    expect(row).toMatchObject({ email: 'dimas@elgos.test', metricType: 'sla', isMet: false, direction: 'lower' });
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
