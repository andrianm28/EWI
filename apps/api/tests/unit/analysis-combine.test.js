// PK-14 / PD-13 ★A: angka keyakinan dari dua kali penilaian.
const { combineTnaFindings, combineAssessments } = require('../../src/modules/interviews/analysis');

describe('gabungan dua kali penilaian', () => {
  it('temuan yang muncul di kedua penilaian: rata-rata keyakinan, sepakat', () => {
    const a = [{ category: 'training', performanceRecordId: 'r1', confidence: 0.9, title: 'A' }];
    const b = [{ category: 'training', performanceRecordId: 'r1', confidence: 0.5, title: 'A lain' }];
    const { items, onlySecond } = combineTnaFindings(a, b);
    expect(items).toEqual([{ ...a[0], confidence: 0.7, agreement: true }]);
    expect(onlySecond).toBe(0);
  });

  it('temuan yang hilang di penilaian kedua: keyakinan setengah; yang hanya di penilaian kedua dihitung saja', () => {
    const a = [{ category: 'non_training', confidence: 0.8 }];
    const b = [{ category: 'training', competencyId: 'c1', confidence: 0.9 }];
    const { items, onlySecond } = combineTnaFindings(a, b);
    expect(items[0]).toMatchObject({ confidence: 0.4, agreement: false });
    expect(onlySecond).toBe(1);
  });

  it('keyakinan kosong atau di luar rentang dinormalkan; pasangan dipakai sekali', () => {
    const a = [{ category: 'training', competencyId: 'c1' }, { category: 'training', competencyId: 'c1', confidence: 7 }];
    const b = [{ category: 'training', competencyId: 'c1', confidence: 0.5 }];
    const { items } = combineTnaFindings(a, b);
    expect(items.map((x) => [x.confidence, x.agreement])).toEqual([[0.5, true], [0.5, false]]);
  });

  it('DNA: skor berbeda dianggap tidak sepakat', () => {
    const { items } = combineAssessments(
      [{ competencyId: 'c1', score: 3, confidence: 0.8 }, { competencyId: 'c2', score: 2, confidence: 0.6 }],
      [{ competencyId: 'c1', score: 2, confidence: 0.8 }, { competencyId: 'c2', score: 2, confidence: 0.4 }],
    );
    expect(items.map((x) => [x.confidence, x.agreement])).toEqual([[0.4, false], [0.5, true]]);
  });
});
