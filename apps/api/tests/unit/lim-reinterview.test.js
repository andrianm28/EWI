// B15 tahap 3: aturan murni wawancara ulang AI (spek docs/designs/b15-impact-measurement.md bagian 12).
const rules = require('../../src/modules/lim/reinterview-rules');

describe('potret kompetensi dan urutan pertanyaan', () => {
  it('potret = kompetensi scheduled urut nama, paling banyak 4', () => {
    const pairs = ['Eskalasi', 'Analisis', 'Dokumentasi', 'Komunikasi', 'Bahasa'].map((name, i) => ({ competencyId: `k${i}`, name }));
    expect(rules.snapshot(pairs).map((c) => c.name)).toEqual(['Analisis', 'Bahasa', 'Dokumentasi', 'Eskalasi']);
  });

  it('dua pertanyaan per kompetensi (scenario, verify) lalu satu apply: 2n + 1', () => {
    expect(rules.questionPlan(['k1', 'k2'])).toEqual([
      { kind: 'scenario', competencyId: 'k1' }, { kind: 'verify', competencyId: 'k1' },
      { kind: 'scenario', competencyId: 'k2' }, { kind: 'verify', competencyId: 'k2' },
      { kind: 'apply', competencyId: null },
    ]);
    expect(rules.questionPlan(['k1'])).toHaveLength(3); // mockup: tiga pertanyaan untuk satu kompetensi
    expect(rules.MAX_TURNS).toBe(18);
  });
});

describe('benchmark, keyakinan, dan rekomendasi per karyawan', () => {
  const c = (o) => ({ competencyId: 'k1', name: 'Eskalasi', post: 85, reinterview: 80, performance: 75, ...o });
  const ind = (o) => ({ name: 'Waktu respons', level: 'business', baseline: 40, current: 30, ...o });

  it('temuan mockup: post − ulang > 10 = retensi turun, ulang − kinerja > 10 = belum diterapkan; tepat 10 belum temuan', () => {
    const out = rules.employeeResult({
      competencies: [c({ post: 90, reinterview: 70, performance: 55 }), c({ competencyId: 'k2', name: 'Dokumentasi', post: 80, reinterview: 70, performance: 60 })],
      indicators: [],
    });
    expect(out.benchmark.map((b) => [b.competencyId, b.retention, b.application])).toEqual([
      ['k1', 'retention_drop', 'application_gap'], ['k2', 'confirmed', 'applied'],
    ]);
  });

  it('nilai kosong = missing; keyakinan Rendah menang atas Sedang', () => {
    const out = rules.employeeResult({ competencies: [c({ post: 95, reinterview: 70 }), c({ competencyId: 'k2', name: 'Dokumentasi', performance: null })], indicators: [] });
    expect(out.benchmark[1]).toMatchObject({ retention: 'confirmed', application: 'missing' });
    expect(out.confidence).toBe('low');
  });

  it('keyakinan Sedang bila ada celah tanpa data kosong, Tinggi bila bersih', () => {
    expect(rules.employeeResult({ competencies: [c({ performance: 60 })], indicators: [] }).confidence).toBe('medium');
    expect(rules.employeeResult({ competencies: [c()], indicators: [] }).confidence).toBe('high');
  });

  it('rekomendasi: penguatan per kompetensi, Improvement Needs dan "lanjutkan" sekali, indikator bisnis tanpa data, tanpa Career & Promotion', () => {
    const out = rules.employeeResult({
      competencies: [
        c({ post: 95, reinterview: 70, performance: 50 }),
        c({ competencyId: 'k2', name: 'Dokumentasi', post: 95, reinterview: 70, performance: 50 }),
        c({ competencyId: 'k3', name: 'Komunikasi' }),
        c({ competencyId: 'k4', name: 'Analisis' }),
      ],
      indicators: [ind(), ind({ name: 'CSAT', current: null }), ind({ name: 'MTTR', level: 'performance', baseline: null })],
    });
    expect(out.recommendations).toEqual([
      'Jadwalkan penguatan Eskalasi dan ulangi wawancara dalam 4 pekan.',
      'Buka tindakan perbaikan di Improvement Needs untuk hambatan non-pelatihan.',
      'Jadwalkan penguatan Dokumentasi dan ulangi wawancara dalam 4 pekan.',
      'Lanjutkan ke kompetensi berikutnya dalam jalur belajar.',
      'Lengkapi data CSAT agar tingkat hasil bisnis lengkap.',
    ]);
    expect(out.recommendations.join(' ')).not.toMatch(/Career/);
  });

  it('"lanjutkan" tidak direkomendasikan bila datanya belum lengkap (review spek)', () => {
    const out = rules.employeeResult({ competencies: [c({ performance: null })], indicators: [] });
    expect(out.recommendations).toEqual([]);
  });

  it('rantai per karyawan: tingkat 2-4 menyebut skor orang itu, bukan hitungan peserta (mockup "Wawancara ulang AI: 72")', () => {
    const chain = [1, 2, 3, 4, 5, 6].map((level) => ({ level, key: `l${level}`, label: 'x', source: 's', finding: 'Belum ada data', coverage: 'missing' }));
    const out = rules.personalChain(chain, [c({ post: 84, reinterview: 70, performance: null }), c({ competencyId: 'k2', post: 90, reinterview: 75, performance: null })]);
    expect(out.map((x) => [x.finding, x.coverage])).toEqual([
      ['Belum ada data', 'missing'], ['Post-test rata-rata 87', 'measured'], ['Wawancara ulang AI: 73', 'measured'],
      ['Belum ada data', 'missing'], ['Belum ada data', 'missing'], ['Belum ada data', 'missing'],
    ]);
  });
});
