const { computeGap, latestByCompetency } = require('../../src/modules/dna/gap');
const { careerStatus } = require('../../src/modules/dna/career');

describe('computeGap (RG-1)', () => {
  const competencies = [
    { id: 'c1', name: 'Memahami kontrak proyek', kind: 'job', requiredScore: 3 },
    { id: 'c2', name: 'SOP L1', kind: 'job', requiredScore: 2 },
    { id: 'c3', name: 'Komunikasi', kind: 'core', requiredScore: 3 },
  ];

  it('memakai skor terbaru dan menandai kompetensi yang belum dinilai', () => {
    const r = computeGap({
      competencies,
      assessments: [
        { competencyId: 'c1', score: 1, createdAt: '2026-11-01' },
        { competencyId: 'c1', score: 2, createdAt: '2026-11-05' },
        { competencyId: 'c2', score: 3, createdAt: '2026-11-05' },
      ],
    });
    expect(r.items.map((i) => [i.competencyId, i.status, i.gap])).toEqual([
      ['c1', 'gap', 1], ['c2', 'met', 0], ['c3', 'not_assessed', null],
    ]);
    expect(r.summary).toEqual({ total: 3, assessed: 2, met: 1, gaps: 1, readiness: 33 });
  });

  it('readiness null bila belum ada penilaian', () => {
    expect(computeGap({ competencies, assessments: [] }).summary.readiness).toBeNull();
  });
});

describe('careerStatus (jenjang + program)', () => {
  const levels = [
    { id: 'l0', name: 'Probation', levelOrder: 0, requiredProgramTier: 'basic' },
    { id: 'l1', name: 'Junior', levelOrder: 1, requiredProgramTier: 'basic' },
    { id: 'l2', name: 'Senior', levelOrder: 2, requiredProgramTier: 'intermediate' },
    { id: 'l3', name: 'Leader', levelOrder: 3, requiredProgramTier: 'advanced' },
  ];

  it('junior yang sudah lulus Intermediate menjadi kandidat promosi', () => {
    const s = careerStatus({ levels, currentLevelId: 'l1', completions: [{ programTier: 'basic', status: 'passed' }, { programTier: 'intermediate', status: 'passed' }] });
    expect(s.nextLevel.name).toBe('Senior');
    expect(s.promotionCandidate).toBe(true);
    expect(s.behindCurrentLevel).toBe(false);
  });

  it('probation yang belum lulus Basic tertinggal di jenjangnya', () => {
    const s = careerStatus({ levels, currentLevelId: 'l0', completions: [{ programTier: 'basic', status: 'in_progress' }] });
    expect(s.behindCurrentLevel).toBe(true);
    expect(s.promotionCandidate).toBe(false);
  });

  it('jenjang tertinggi tidak punya jenjang berikutnya', () => {
    const s = careerStatus({ levels, currentLevelId: 'l3', completions: [] });
    expect(s.nextLevel).toBeNull();
    expect(s.promotionCandidate).toBe(false);
  });

  it('karyawan tanpa jenjang tidak error', () => {
    expect(careerStatus({ levels, currentLevelId: null, completions: [] }).currentLevel).toBeNull();
  });
});

describe('computeGap: hasil wawancara manual (cadence 11 Nov, C2)', () => {
  it('memakai tanggal wawancara (assessedAt) bila ada, bukan waktu impor', () => {
    const competencies = [{ id: 'k', name: 'Kontrak', kind: 'job', requiredScore: 3 }];
    const r = computeGap({
      competencies,
      assessments: [
        { competencyId: 'k', score: 4, source: 'manual_interview', assessedAt: '2026-11-01', createdAt: '2026-11-12' },
        { competencyId: 'k', score: 1, source: 'manual_interview', assessedAt: '2026-10-01', createdAt: '2026-11-13' },
      ],
    });
    expect(r.items[0]).toMatchObject({ score: 4, status: 'met', source: 'manual_interview' });
  });
});

describe('latestByCompetency (A2)', () => {
  it('tanggal asesmen sama: baris yang dibuat paling akhir menang, tidak bergantung urutan masukan', () => {
    const old = { competencyId: 'c1', score: 1, assessedAt: '2026-11-10', createdAt: '2026-11-10T01:00:00Z' };
    const fix = { competencyId: 'c1', score: 3, assessedAt: '2026-11-10', createdAt: '2026-11-12T01:00:00Z' };
    expect(latestByCompetency([old, fix]).get('c1').score).toBe(3);
    expect(latestByCompetency([fix, old]).get('c1').score).toBe(3);
  });
});
