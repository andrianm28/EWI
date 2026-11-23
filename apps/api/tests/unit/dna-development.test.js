const { developmentPlan, stageDistribution, dictionaryStatus, STAGES } = require('../../src/modules/dna/development');

// Kamus kecil: 2 modul Basic, 1 Intermediate, 1 Advanced, 1 tanpa tingkat (tidak ikut dihitung).
const comps = [
  { id: 'b1', code: 'ST-B1', name: 'Fondasi layanan', stream: 'Specific Technical', programTier: 'basic', requiredScore: 3 },
  { id: 'b2', code: 'ST-B4', name: 'Ticket life cycle', stream: 'Specific Technical', programTier: 'basic', requiredScore: 3 },
  { id: 'i1', code: 'TC-I1', name: 'Automation', stream: 'Technical', programTier: 'intermediate', requiredScore: 3 },
  { id: 'a1', code: 'ST-A2', name: 'RCA', stream: 'Specific Technical', programTier: 'advanced', requiredScore: 4 },
  { id: 'x', code: null, name: 'Tanpa tingkat', stream: null, programTier: null, requiredScore: 3 },
];
const at = (d) => new Date(`2026-11-${d}`).toISOString();
const a = (competencyId, score, day = '01') => ({ competencyId, score, createdAt: at(day) });
const plan = (assessments) => developmentPlan({ competencies: comps, assessments });
const mod = (p, id) => p.tiers.flatMap((t) => t.modules).find((m) => m.competencyId === id);

describe('DNA: tahap dan rencana pengembangan (B4)', () => {
  it('tahap = tingkat terendah yang punya modul dinilai di bawah target', () => {
    expect(plan([a('b1', 3), a('b2', 2), a('i1', 1), a('a1', 1)]).stage).toBe('basic');
    expect(plan([a('b1', 3), a('b2', 3), a('i1', 1), a('a1', 1)]).stage).toBe('intermediate');
    expect(plan([a('b1', 4), a('b2', 3), a('i1', 3), a('a1', 3)]).stage).toBe('advanced');
    expect(plan([a('b1', 4), a('b2', 3), a('i1', 3), a('a1', 4)]).stage).toBe('done');
  });

  it('belum ada asesmen sama sekali = not_assessed, bukan done', () => {
    const p = plan([]);
    expect(p.stage).toBe('not_assessed');
    expect(p).toMatchObject({ met: 0, assessed: 0, total: 4, focus: [] });
    expect(p.advice).toMatch(/Belum ada hasil asesmen/);
    expect(mod(p, 'b1')).toMatchObject({ status: 'not_assessed', score: null, target: 3, mastery: null });
  });

  it('done dengan cakupan sebagian: modul belum dinilai tidak menahan tahap, tetapi cakupan dilaporkan', () => {
    const p = plan([a('b1', 3)]);
    expect(p.stage).toBe('done');
    expect(p).toMatchObject({ met: 1, assessed: 1, total: 4 });
  });

  it('status modul: met, develop, locked, not_assessed; kompetensi tanpa tingkat tidak ikut', () => {
    const p = plan([a('b1', 3), a('b2', 2), a('i1', 1)]);
    expect(p.tiers.map((t) => t.tier)).toEqual(['basic', 'intermediate', 'advanced']);
    expect(mod(p, 'b1').status).toBe('met');
    expect(mod(p, 'b2').status).toBe('develop');
    expect(mod(p, 'i1').status).toBe('locked');
    expect(mod(p, 'a1').status).toBe('not_assessed');
    expect(mod(p, 'x')).toBeUndefined();
    expect(p.total).toBe(4);
  });

  it('modul basic yang belum dinilai tidak menahan tahap; modul pada tahap pegawai berstatus develop', () => {
    const p = plan([a('b1', 3), a('i1', 1), a('a1', 4)]);
    expect(p.stage).toBe('intermediate');
    expect(mod(p, 'i1').status).toBe('develop');
    expect(mod(p, 'a1').status).toBe('met');
  });

  it('asesmen terbaru yang dipakai (assessedAt menang atas createdAt)', () => {
    const p = plan([a('b1', 1, '01'), a('b1', 3, '05'), { competencyId: 'b2', score: 3, createdAt: at('09'), assessedAt: at('02') }, a('b2', 1, '03')]);
    expect(mod(p, 'b1').score).toBe(3);
    expect(mod(p, 'b2').score).toBe(1);
  });

  it('mastery skala 0-4: Menguasai = capai target, Sebagian = kurang satu tingkat, Belum = kurang dua atau lebih', () => {
    const p = plan([a('b1', 3), a('a1', 3), a('b2', 2), a('i1', 1)]);
    expect(mod(p, 'b1').mastery).toBe('mastered');
    expect(mod(p, 'a1').mastery).toBe('partial'); // target 4, skor 3
    expect(mod(p, 'b2').mastery).toBe('partial'); // target 3, skor 2
    expect(mod(p, 'i1').mastery).toBe('not_yet'); // target 3, skor 1
    const zero = developmentPlan({ competencies: [{ id: 'z', code: 'Z', name: 'Target nol', programTier: 'basic', requiredScore: 0 }], assessments: [a('z', 0)] });
    expect(zero.tiers[0].modules[0]).toMatchObject({ status: 'met', mastery: 'mastered' });
  });

  it('melaporkan jumlah kompetensi tanpa tingkat (untiered)', () => {
    expect(plan([]).untiered).toBe(1);
  });

  it('fokus = kode modul develop pada tahap pegawai; saran menyebut tingkat dan kode', () => {
    const p = plan([a('b1', 2), a('b2', 2), a('i1', 1)]);
    expect(p.focus).toEqual(['ST-B1', 'ST-B4']);
    expect(p.advice).toBe('Fokus pada modul Basic yang belum tercapai: ST-B1, ST-B4. Modul level berikutnya dibuka setelah semua modul Basic yang dinilai tercapai.');
    expect(plan([a('b1', 3)]).advice).toMatch(/^Semua modul yang dinilai tercapai/);
  });

  it('fokus memakai nama bila modul tidak punya kode', () => {
    const p = developmentPlan({ competencies: [{ id: 'n', code: null, name: 'Tanpa kode', programTier: 'basic', requiredScore: 3 }], assessments: [a('n', 1)] });
    expect(p.focus).toEqual(['Tanpa kode']);
  });

  it('distribusi tahap selalu lima baris berurutan dengan persen', () => {
    const d = stageDistribution(['basic', 'basic', 'done', 'not_assessed']);
    expect(d.map((x) => x.stage)).toEqual(STAGES);
    expect(d).toEqual([
      { stage: 'basic', count: 2, percent: 50 }, { stage: 'intermediate', count: 0, percent: 0 }, { stage: 'advanced', count: 0, percent: 0 },
      { stage: 'done', count: 1, percent: 25 }, { stage: 'not_assessed', count: 1, percent: 25 },
    ]);
    expect(stageDistribution([]).every((x) => x.count === 0 && x.percent === 0)).toBe(true);
  });

  it('status kamus: Tool 1/2/3 dan pengesahan', () => {
    expect(dictionaryStatus({ jobFunctions: [], competencies: [] })).toEqual({ status: 'none', tool1: false, tool2: false, tool3: false, competencyCount: 0, approvedCount: 0, approved: false });
    const s = dictionaryStatus({ jobFunctions: [{ id: 'jf' }], competencies: [{ programTier: 'basic', approvedAt: at('01') }, { programTier: null, approvedAt: null }] });
    expect(s).toEqual({ status: 'available', tool1: true, tool2: true, tool3: true, competencyCount: 2, approvedCount: 1, approved: false });
    expect(dictionaryStatus({ jobFunctions: [], competencies: [{ programTier: null, approvedAt: at('01') }] })).toMatchObject({ tool1: false, tool3: false, approved: true });
  });
});
