// B15 Learning Impact Measurement: aturan murni (spek docs/designs/b15-impact-measurement.md bagian 4 dan 6).
const lim = require('../../src/modules/lim/domain');

describe('skor post terbaru per karyawan per kompetensi', () => {
  const ld = (o) => ({ userId: 'a', competencyId: 'k1', score: 70, scoreSource: 'elitementor', completedOn: '2026-10-01', createdAt: '2026-09-01T00:00:00Z', id: '1', ...o });

  it('memakai tanggal selesai efektif terbaru; NULL dianggap paling lama; seri memakai created_at lalu id', () => {
    const m = lim.latestPost([
      ld({ score: 60, completedOn: '2026-09-01' }),
      ld({ score: 80, completedOn: '2026-10-05', id: '2' }),
      ld({ score: 90, completedOn: null, id: '3' }),
      ld({ userId: 'b', score: 50, completedOn: '2026-10-01', createdAt: '2026-09-01T00:00:00Z', id: '4' }),
      ld({ userId: 'b', score: 55, completedOn: '2026-10-01', createdAt: '2026-09-02T00:00:00Z', id: '5' }),
    ]);
    expect(m.get('a|k1')).toEqual({ score: 80, auditable: true, completedOn: '2026-10-05' });
    expect(m.get('b|k1').score).toBe(55);
  });

  it('skor vendor_manual ditandai tidak teraudit; tanpa tanggal tetap dipakai bila satu-satunya', () => {
    const m = lim.latestPost([ld({ scoreSource: 'vendor_manual', completedOn: null })]);
    expect(m.get('a|k1')).toEqual({ score: 70, auditable: false, completedOn: null });
  });
});

describe('ringkasan per kompetensi', () => {
  const comps = [{ id: 'k2', name: 'Ticket Life Cycle' }, { id: 'k1', name: 'RCA & Post-Incident Report' }];

  it('kesimpulan mengikuti mockup: tanpa wawancara ulang belum diukur, di bawah 70 retensi turun', () => {
    expect(lim.verdict(null)).toBe('belum_diukur');
    expect(lim.verdict(69)).toBe('retensi_turun');
    expect(lim.verdict(70)).toBe('terkonfirmasi');
  });

  it('rata-rata dibulatkan atas karyawan yang punya nilai, dengan n; urut nama kompetensi', () => {
    const rows = [
      { userId: 'a', competencyId: 'k1', pre: 50, post: 70, postAuditable: true, postShared: true, reinterview: 92, performance: 88 },
      { userId: 'b', competencyId: 'k1', pre: 55, post: 73, postAuditable: false, postShared: true, reinterview: null, performance: null },
      { userId: 'a', competencyId: 'k2', pre: null, post: null, postAuditable: true, postShared: false, reinterview: null, performance: null },
    ];
    expect(lim.summarizeCompetencies(comps, rows)).toEqual([
      { competencyId: 'k1', name: 'RCA & Post-Incident Report', pre: 53, preN: 2, post: 72, postN: 2, postUnauditable: 1, postShared: true,
        reinterview: 92, reinterviewN: 1, performance: 88, performanceN: 1, verdict: 'terkonfirmasi' },
      { competencyId: 'k2', name: 'Ticket Life Cycle', pre: null, preN: 0, post: null, postN: 0, postUnauditable: 0, postShared: false,
        reinterview: null, reinterviewN: 0, performance: null, performanceN: 0, verdict: 'belum_diukur' },
    ]);
  });
});

describe('indikator bisnis tim', () => {
  const ind = (o) => ({ name: 'MTTR P1', level: 'performance', unit: 'mnt', direction: 'lower_better', baseline: 92, current: 71, target: 75, strength: null, ...o });
  it('membaik dan target dinilai menurut arah', () => {
    expect(lim.indicatorState(ind())).toEqual({ improved: true, targetMet: true, strength: 'moderate', strengthSource: 'rules' });
    expect(lim.indicatorState(ind({ current: 80 }))).toMatchObject({ improved: true, targetMet: false, strength: 'weak' });
    expect(lim.indicatorState(ind({ direction: 'higher_better', baseline: 96.4, current: 98.2, target: 98 }))).toMatchObject({ improved: true, targetMet: true });
    expect(lim.indicatorState(ind({ current: 95 }))).toMatchObject({ improved: false, strength: 'weak' });
  });
  it('tanpa data = no_data; hitungan tidak pernah memberi strong; penilaian HR menang', () => {
    expect(lim.indicatorState(ind({ baseline: null, current: null }))).toEqual({ improved: null, targetMet: null, strength: 'no_data', strengthSource: 'rules' });
    expect(lim.indicatorState(ind({ target: null }))).toMatchObject({ targetMet: null, strength: 'weak' });
    expect(lim.indicatorState(ind({ strength: 'strong' }))).toMatchObject({ strength: 'strong', strengthSource: 'hr' });
  });
});

describe('rantai bukti 6 tingkat dan insight', () => {
  const participants = ['a', 'b', 'c'];
  const row = (userId, competencyId, o = {}) => ({ userId, competencyId, pre: null, post: null, reinterview: null, performance: null, ...o });
  const indicators = [
    { name: 'MTTR P1', level: 'performance', unit: 'mnt', baseline: 92, current: 71 },
    { name: 'Kepatuhan SLA', level: 'business', unit: '%', baseline: 96.4, current: 98.2 },
    { name: 'Kepuasan pelanggan', level: 'business', unit: '', baseline: null, current: null },
  ];
  const input = (o = {}) => ({
    participants,
    activity: { participations: 4, completed: 3, offlineRecorded: 2, offlinePresent: 1 },
    rows: [row('a', 'k1', { pre: 50, post: 70, reinterview: 90, performance: 80 }), row('b', 'k1', { pre: 60, post: 72 }), row('c', 'k2', { pre: 40, post: 60 })],
    indicators,
    ...o,
  });

  it('menyusun enam tingkat dengan temuan dan cakupan', () => {
    const chain = lim.buildChain(input());
    expect(chain.map((c) => [c.level, c.key, c.coverage])).toEqual([
      [1, 'activity', 'measured'], [2, 'learning', 'measured'], [3, 'capability', 'partial'],
      [4, 'application', 'partial'], [5, 'performance', 'measured'], [6, 'business', 'partial'],
    ]);
    expect(chain[0].finding).toBe('3 dari 4 keikutsertaan selesai (75%); kehadiran offline 1 dari 2 tercatat');
    expect(chain[1].finding).toBe('Naik rata-rata 17 poin pada 2 kompetensi');
    expect(chain[2].finding).toBe('1 dari 3 karyawan sudah diwawancara ulang');
    expect(chain[3].finding).toBe('1 dari 3 karyawan punya skor kinerja');
    expect(chain[4].finding).toBe('MTTR P1 92 → 71 mnt');
    expect(chain[5].finding).toBe('Kepatuhan SLA 96,4 → 98,2%; data Kepuasan pelanggan belum ada');
  });

  it('cakupan missing dan partial di tingkat 2, 5, 6', () => {
    const chain = lim.buildChain(input({ activity: { participations: 0, completed: 0, offlineRecorded: 0, offlinePresent: 0 },
      rows: [row('a', 'k1', { post: 70 }), row('b', 'k1', { pre: 50, post: 60 })], indicators: [], participants: [] }));
    expect(chain.map((c) => c.coverage)).toEqual(['missing', 'partial', 'missing', 'missing', 'missing', 'missing']);
    expect(chain[4].finding).toBe('Belum ada data');
  });

  it('insight menunjuk tingkat terendah yang belum terukur; semua terukur diberi kalimat penutup', () => {
    const ins = lim.buildInsight(lim.buildChain(input()), { participants: 3 });
    expect(ins.level).toBe(3);
    expect(ins.text).toMatch(/tingkat 3/);
    expect(ins.text).toMatch(/1 dari 3 karyawan/);
    const all = lim.buildChain(input({ rows: participants.map((p) => row(p, 'k1', { pre: 50, post: 70, reinterview: 80, performance: 80 })), indicators: indicators.slice(0, 2) }));
    expect(lim.buildInsight(all, { participants: 3 })).toEqual({ level: null, text: 'Semua tingkat punya bukti. Tetap cek faktor lain sebelum menyimpulkan.' });
  });
});

describe('antrean wawancara ulang (satu baris per karyawan)', () => {
  const TODAY = '2026-11-20';
  const p = (userId, competencyId, o = {}) => ({ userId, name: userId.toUpperCase(), competencyId, competencyName: competencyId, postFromLd: true,
    postCompletedOn: '2026-10-01', reinterviewStatus: 'none', reinterviewOn: null, reinterviewScore: null, ...o });

  it('menggabung kompetensi per karyawan, jendela 28-42 hari dari tanggal selesai terbaru', () => {
    const q = lim.buildQueue([p('a', 'k1', { postCompletedOn: '2026-10-01' }), p('a', 'k2', { postCompletedOn: '2026-10-10' })], TODAY);
    expect(q).toEqual([{ userId: 'a', name: 'A', competencies: [{ competencyId: 'k1', name: 'k1' }, { competencyId: 'k2', name: 'k2' }],
      postCompletedOn: '2026-10-10', dueFrom: '2026-11-07', dueUntil: '2026-11-21', status: 'none', window: 'due', scheduledOn: null, score: null }]);
  });

  it('hanya pasangan dengan skor post Learning Delivery; tanpa tanggal = window null', () => {
    const q = lim.buildQueue([p('a', 'k1', { postFromLd: false }), p('b', 'k1', { postCompletedOn: null })], TODAY);
    expect(q.map((r) => [r.userId, r.window, r.dueFrom])).toEqual([['b', null, null]]);
  });

  it('status: done bila semua done (skor rata-rata), scheduled bila ada yang dijadwalkan; urutan late, due, early', () => {
    const q = lim.buildQueue([
      p('a', 'k1', { postCompletedOn: '2026-11-01' }),
      p('b', 'k1', { postCompletedOn: '2026-09-01', reinterviewStatus: 'scheduled', reinterviewOn: '2026-11-25' }),
      p('b', 'k2', { postCompletedOn: '2026-09-01' }),
      p('c', 'k1', { postCompletedOn: '2026-08-01', reinterviewStatus: 'done', reinterviewScore: 80 }),
      p('c', 'k2', { postCompletedOn: '2026-08-01', reinterviewStatus: 'done', reinterviewScore: 91 }),
      p('d', 'k1', { postCompletedOn: '2026-10-15' }),
    ], TODAY);
    expect(q.map((r) => [r.userId, r.status, r.window, r.scheduledOn, r.score])).toEqual([
      ['b', 'scheduled', 'late', '2026-11-25', null], ['d', 'none', 'due', null, null], ['a', 'none', 'early', null, null], ['c', 'done', null, null, 86],
    ]);
  });

  it('jadwal: tanggal valid dari hari ini sampai +180 hari, atau null', () => {
    expect(lim.checkScheduleDate(null, TODAY)).toBeNull();
    expect(lim.checkScheduleDate('2026-11-20', TODAY)).toBeNull();
    expect(lim.checkScheduleDate('2026-11-19', TODAY)).toMatch(/hari ini/);
    expect(lim.checkScheduleDate('2027-05-20', TODAY)).toMatch(/180/);
    expect(lim.checkScheduleDate('2026-02-30', TODAY)).toMatch(/format/i);
  });
});
