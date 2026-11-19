// B7: target tinjauan 2 hari kerja (PM-3), saran klasifikasi, sel CSV, validasi setting.
const { addWorkingDays, suggestedClassification, reviewDue } = require('../../src/modules/tna/review-sla');
const { csvCell, toCsv } = require('../../src/modules/tna/csv');
const { merge, DEFAULTS, normalize, deliveryFor } = require('../../src/core/settings');

// WIB = UTC+7. 16 Nov 2026 adalah hari Senin.
const wib = (s) => new Date(`${s}+07:00`);

describe('addWorkingDays (hari kerja Senin-Jumat menurut WIB)', () => {
  it.each([
    ['Senin 10.00 -> Rabu 10.00', '2026-11-16T10:00:00', '2026-11-18T10:00:00'],
    ['Kamis 10.00 -> Senin 10.00', '2026-11-19T10:00:00', '2026-11-23T10:00:00'],
    ['Jumat 23.30 -> Selasa 23.30', '2026-11-20T23:30:00', '2026-11-24T23:30:00'],
    ['Sabtu 10.00 -> Selasa 10.00', '2026-11-21T10:00:00', '2026-11-24T10:00:00'],
    ['Minggu 10.00 -> Selasa 10.00', '2026-11-22T10:00:00', '2026-11-24T10:00:00'],
  ])('%s', (_n, from, to) => {
    expect(addWorkingDays(wib(from), 2).toISOString()).toBe(wib(to).toISOString());
  });

  it('memakai tanggal WIB, bukan UTC: Jumat 02.00 WIB (Kamis malam UTC) tetap dihitung Jumat', () => {
    expect(addWorkingDays(wib('2026-11-20T02:00:00'), 1).toISOString()).toBe(wib('2026-11-23T02:00:00').toISOString());
  });

  it('reviewDue menghitung dari sesi selesai, lalu dari waktu temuan dibuat', () => {
    const now = wib('2026-11-19T09:00:00');
    const a = reviewDue({ sessionEndedAt: wib('2026-11-16T10:00:00'), createdAt: wib('2026-11-17T10:00:00'), reviewStatus: 'draft' }, 2, now);
    expect(a.reviewDueAt.toISOString()).toBe(wib('2026-11-18T10:00:00').toISOString());
    expect(a.overdue).toBe(true);
    const b = reviewDue({ sessionEndedAt: null, createdAt: wib('2026-11-18T10:00:00'), reviewStatus: 'draft' }, 2, now);
    expect(b.overdue).toBe(false);
    // temuan yang sudah diputus tidak pernah terlambat
    expect(reviewDue({ createdAt: wib('2026-11-01T10:00:00'), reviewStatus: 'approved' }, 2, now).overdue).toBe(false);
  });
});

describe('suggestedClassification', () => {
  it('mengikuti kategori AI, kecuali keyakinan rendah atau dua penilaian berbeda', () => {
    expect(suggestedClassification({ category: 'training', confidence: 0.9, scoringAgreement: true })).toBe('training');
    expect(suggestedClassification({ category: 'non_training', confidence: 0.5, scoringAgreement: true })).toBe('improvement');
    expect(suggestedClassification({ category: 'training', confidence: 0.49, scoringAgreement: true })).toBe('needs_review');
    expect(suggestedClassification({ category: 'training', confidence: 0.9, scoringAgreement: false })).toBe('needs_review');
    expect(suggestedClassification({ category: 'non_training', confidence: null, scoringAgreement: null })).toBe('improvement');
  });
});

describe('CSV ekspor gap', () => {
  it('mengutip koma, kutip, baris baru, dan menetralkan sel formula', () => {
    expect(csvCell('biasa')).toBe('biasa');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('kata "x"')).toBe('"kata ""x"""');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+62')).toBe("'+62");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('\t=1')).toBe("'\t=1");
    expect(csvCell(null)).toBe('');
    expect(toCsv(['A', 'B'], [['1', 'x,y']])).toBe('A,B\r\n1,"x,y"\r\n');
  });
});

describe('setting B7', () => {
  it('default: 2 hari, belajar di EliteMentor', () => {
    expect(DEFAULTS.tna.reviewTargetDays).toBe(2);
    expect(DEFAULTS.lms.delivery).toBe('elitementor');
    expect(DEFAULTS.lms.elitementorOrganizationId).toBeNull();
  });
  it('nilai tidak valid jatuh ke default', () => {
    const bad = normalize(merge(DEFAULTS, { tna: { reviewTargetDays: 0 }, lms: { delivery: 'email', lmsName: '  ' } }));
    expect(bad.tna.reviewTargetDays).toBe(2);
    expect(bad.lms.delivery).toBe('elitementor');
    expect(bad.lms.lmsName).toBe('LMS perusahaan');
    const ok = normalize(merge(DEFAULTS, { tna: { reviewTargetDays: 3 }, lms: { delivery: 'lms_export', lmsName: 'Moodle Elitery' } }));
    expect(ok.tna.reviewTargetDays).toBe(3);
    expect(ok.lms).toMatchObject({ delivery: 'lms_export', lmsName: 'Moodle Elitery' });
    expect(normalize(merge(DEFAULTS, { tna: { reviewTargetDays: 2.5 } })).tna.reviewTargetDays).toBe(2);
    expect(normalize(merge(DEFAULTS, { tna: { reviewTargetDays: 31 } })).tna.reviewTargetDays).toBe(2);
  });
  it('bagian setting yang salah bentuk memakai default, tidak melempar', () => {
    const conf = normalize(merge(DEFAULTS, { tna: null, lms: 'x' }));
    expect(conf.tna.reviewTargetDays).toBe(2);
    expect(conf.lms.delivery).toBe('elitementor');
    expect(normalize(merge(DEFAULTS, { lms: { elitementorOrganizationId: 42 } })).lms.elitementorOrganizationId).toBe('42');
    expect(normalize(merge(DEFAULTS, { lms: { elitementorOrganizationId: '  ' } })).lms.elitementorOrganizationId).toBeNull();
  });
  it('deliveryFor: sumber course rencana menang atas setting tenant', () => {
    const em = normalize(merge(DEFAULTS, {}));
    const lms = normalize(merge(DEFAULTS, { lms: { delivery: 'lms_export', lmsName: 'Moodle Elitery' } }));
    expect(deliveryFor(em, 'elitementor')).toEqual({ target: 'elitementor', label: 'EliteMentor' });
    expect(deliveryFor(em, 'moodle')).toEqual({ target: 'lms', label: 'LMS perusahaan' });
    expect(deliveryFor(em, null)).toEqual({ target: 'elitementor', label: 'EliteMentor' });
    expect(deliveryFor(lms, null)).toEqual({ target: 'lms', label: 'Moodle Elitery' });
    expect(deliveryFor(lms, 'elitementor')).toEqual({ target: 'elitementor', label: 'EliteMentor' });
  });
});
