// B8: fungsi murni beranda karyawan.
const { competencyStatus, competencyView, safeLaunchUrl, inviteActions } = require('../../src/modules/my/view');
const { computeGap } = require('../../src/modules/dna/gap');

describe('competencyStatus (mockup: Menguasai, Sebagian, Belum)', () => {
  it.each([
    [3, 3, 'met'], [4, 3, 'met'], [3, 4, 'partial'], [2, 4, 'gap'], [2, 3, 'gap'], [0, 3, 'gap'], [null, 3, 'not_assessed'], [0, 0, 'met'],
  ])('skor %s dari target %s -> %s', (score, required, status) => {
    expect(competencyStatus(score, required)).toBe(status);
  });

  it('competencyView menghitung ringkasan dan tidak membawa bukti asesmen', () => {
    const gap = computeGap({
      competencies: [{ id: 'a', name: 'A', kind: 'job', requiredScore: 4 }, { id: 'b', name: 'B', kind: 'job', requiredScore: 4 }, { id: 'c', name: 'C', kind: 'core', requiredScore: 3 }, { id: 'd', name: 'D', kind: 'core', requiredScore: 3 }],
      assessments: [{ competencyId: 'a', score: 4, evidence: 'RAHASIA' }, { competencyId: 'b', score: 3 }, { competencyId: 'c', score: 1 }],
    });
    const view = competencyView(gap);
    expect(view.summary).toEqual({ total: 4, assessed: 3, met: 1, partial: 1, gaps: 1 });
    expect(view.items[0]).toEqual({ competencyId: 'a', code: null, name: 'A', required: 4, score: 4, status: 'met' });
    expect(JSON.stringify(view)).not.toContain('RAHASIA');
  });
});

describe('safeLaunchUrl', () => {
  it('hanya https; http di luar produksi; skema lain ditolak', () => {
    expect(safeLaunchUrl('https://lms.test/course/1')).toBe('https://lms.test/course/1');
    expect(safeLaunchUrl('http://lms.test/c', { production: false })).toBe('http://lms.test/c');
    expect(safeLaunchUrl('http://lms.test/c', { production: true })).toBeNull();
    expect(safeLaunchUrl('javascript:alert(1)')).toBeNull();
    expect(safeLaunchUrl('data:text/html,x')).toBeNull();
    expect(safeLaunchUrl('bukan url')).toBeNull();
    expect(safeLaunchUrl(null)).toBeNull();
  });
});

describe('inviteActions', () => {
  const now = new Date('2026-11-19T10:00:00Z');
  it('undangan aktif bisa dimulai; yang lewat tidak; sesi berjalan tetap bisa dilanjutkan', () => {
    expect(inviteActions({ status: 'scheduled', inviteExpiresAt: '2026-11-20T10:00:00Z' }, now)).toEqual({ expired: false, canStart: true, canContinue: false });
    expect(inviteActions({ status: 'scheduled', inviteExpiresAt: '2026-11-18T10:00:00Z' }, now)).toEqual({ expired: true, canStart: false, canContinue: false });
    expect(inviteActions({ status: 'in_progress', inviteExpiresAt: '2026-11-18T10:00:00Z' }, now)).toEqual({ expired: true, canStart: false, canContinue: true });
  });
});
