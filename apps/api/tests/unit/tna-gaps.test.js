// B5 Training Needs: papan gap dan penugasan wawancara (docs/designs/b5-training-needs.md).
const {
  toPct, latestScores, competencyGaps, okrGaps, withPareto, gapKeyOf, linkSessions, findingsByGap,
  visibility, classify, summarize, evidenceFor, HYPOTHESES, isOpen,
} = require('../../src/modules/tna/gaps');
const {
  parseDueDate, validateAssignment, eligibleEmployees, planAssignments,
} = require('../../src/modules/tna/assignment');

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const C3 = '33333333-3333-4333-8333-333333333333';
const comp = (id, name, requiredScore, approved = true) => ({ id, name, requiredScore, approvedAt: approved ? '2026-11-01T00:00:00Z' : null });
const member = (id, competencies) => ({ id, name: id, competencies });
const score = (userId, competencyId, s, at) => ({ userId, competencyId, score: s, createdAt: at });

describe('gap kompetensi (R2, R2b, R3, R4)', () => {
  it('memakai skor terbaru per orang per kompetensi', () => {
    const latest = latestScores([score('a', C1, 1, '2026-11-01'), score('a', C1, 3, '2026-11-05'),
      { userId: 'a', competencyId: C2, score: 4, assessedAt: '2026-11-09', createdAt: '2026-11-01' },
      { userId: 'a', competencyId: C2, score: 2, assessedAt: '2026-11-03', createdAt: '2026-11-10' }]);
    expect(latest.get(`a|${C1}`)).toBe(3);
    expect(latest.get(`a|${C2}`)).toBe(4); // assessedAt menang atas createdAt
  });

  it('menghitung target, aktual, gap, persen, dan jumlah orang', () => {
    const comps = [comp(C1, 'Analisis insiden', 3)];
    const { rows } = competencyGaps({
      members: [member('a', comps), member('b', comps), member('c', comps)],
      assessments: [score('a', C1, 2, '2026-11-01'), score('b', C1, 3, '2026-11-01')],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: `c:${C1}`, kind: 'competency', competencyId: C1, name: 'Analisis insiden', target: 3, actual: 2.5, gap: 0.5,
      targetPct: 75, actualPct: 63, gapPct: 12, assessed: 2, peopleWithGap: 1, peopleTotal: 3,
    });
  });

  it('melewati kompetensi yang belum disahkan dan yang belum punya penilaian', () => {
    const comps = [comp(C1, 'A', 3, false), comp(C2, 'B', 3), comp(C3, 'C', 3)];
    const { rows, unapprovedCompetencies } = competencyGaps({
      members: [member('a', comps)],
      assessments: [score('a', C1, 1, '2026-11-01'), score('a', C3, 1, '2026-11-01')],
    });
    expect(rows.map((r) => r.competencyId)).toEqual([C3]);
    expect(unapprovedCompetencies).toBe(1);
  });

  it('rata-rata memenuhi target = gap 0 walau ada orang di bawah target (Dalam batas)', () => {
    const comps = [comp(C1, 'A', 3)];
    const { rows } = competencyGaps({
      members: [member('a', comps), member('b', comps)],
      assessments: [score('a', C1, 2, '2026-11-01'), score('b', C1, 4, '2026-11-01')],
    });
    expect(rows[0]).toMatchObject({ gap: 0, gapPct: 0, peopleWithGap: 1 });
  });

  it('Pareto: urut gap menurun, kontribusi kumulatif hanya untuk baris gap', () => {
    const rows = withPareto([
      { name: 'kecil', gap: 0.5 }, { name: 'besar', gap: 1.5 }, { name: 'nol', gap: 0 }, { name: 'sedang', gap: 1 },
    ]);
    expect(rows.map((r) => r.name)).toEqual(['besar', 'sedang', 'kecil', 'nol']);
    expect(rows.map((r) => r.cumulativeShare)).toEqual([0.5, 0.83, 1, null]);
    expect(withPareto([{ name: 'x', gap: 0 }])[0].cumulativeShare).toBeNull();
    expect(toPct(4)).toBe(100);
    expect(toPct(null)).toBeNull();
  });
});

const rec = (id, userId, name, target, actual, isMet, extra = {}) => ({
  id, userId, metricType: 'sla', name, target, actual, isMet, period: '2026-11', direction: 'lower', tolerance: 0, unit: 'menit', valueType: 'angka', ...extra,
});

describe('gap OKR (R5)', () => {
  it('mengelompokkan per metrik + periode dan menghitung angka tim', () => {
    const rows = okrGaps([
      rec('r1', 'a', 'Waktu respons', 15, 30, false), rec('r2', 'b', ' waktu  Respons', 15, 10, true),
      rec('r3', 'c', 'Waktu respons', 15, 20, false), rec('r4', 'a', 'Kepuasan', 90, 95, true, { direction: 'higher' }),
    ]);
    expect(rows).toHaveLength(1); // metrik yang semua barisnya tercapai bukan gap
    expect(rows[0]).toMatchObject({
      key: 'o:sla|waktu respons|2026-11', kind: 'okr', metricType: 'sla', name: 'Waktu respons', period: '2026-11',
      target: 15, actual: 20, diff: 5, targetVaries: false, direction: 'lower', tolerance: 0, unit: 'menit', valueType: 'angka',
      peopleMissed: 2, peopleTotal: 3,
    });
  });

  it('target beragam atau nilai biner: tanpa rata-rata dan selisih', () => {
    const [varies] = okrGaps([rec('r1', 'a', 'Tiket', 10, 5, false, { direction: 'higher' }), rec('r2', 'b', 'Tiket', 20, 25, true, { direction: 'higher' })]);
    expect(varies).toMatchObject({ target: null, actual: null, diff: null, targetVaries: true, peopleMissed: 1 });
    const [biner] = okrGaps([rec('r1', 'a', 'Sertifikasi', 1, 0, false, { valueType: 'biner', direction: 'higher' })]);
    expect(biner).toMatchObject({ target: 1, actual: null, diff: null, valueType: 'biner' });
  });

  it('urut jumlah orang meleset menurun, baris tanpa periode diabaikan', () => {
    const rows = okrGaps([
      rec('r1', 'a', 'A', 1, 0, false), rec('r2', 'a', 'B', 1, 0, false), rec('r3', 'b', 'B', 1, 0, false),
      rec('r4', 'a', 'C', 1, 0, false, { period: null }),
    ]);
    expect(rows.map((r) => r.name)).toEqual(['B', 'A']);
  });
});

describe('tautan sesi dan temuan ke gap (R6, R8)', () => {
  const now = new Date('2026-11-20T03:00:00Z');
  const recordsById = new Map([['r1', rec('r1', 'a', 'Waktu respons', 15, 30, false)]]);
  const okrKey = 'o:sla|waktu respons|2026-11';

  it('kunci gap', () => {
    expect(gapKeyOf({ kind: 'competency', competencyId: C1 })).toBe(`c:${C1}`);
    expect(gapKeyOf({ kind: 'okr', metricType: 'sla', name: 'Waktu  Respons ', period: '2026-11' })).toBe(okrKey);
  });

  it('sesi berfokus, sesi lama lewat target pemicu, dan hitungan per gap', () => {
    const links = linkSessions({
      now,
      recordsById,
      sessions: [
        { id: 's1', intervieweeId: 'a', status: 'completed', focusKind: 'competency', focusCompetencyId: C1 },
        { id: 's2', intervieweeId: 'b', status: 'scheduled', inviteExpiresAt: '2026-11-25T00:00:00Z', focusKind: 'competency', focusCompetencyId: C1 },
        { id: 's3', intervieweeId: 'c', status: 'scheduled', inviteExpiresAt: '2026-11-19T00:00:00Z', focusKind: 'competency', focusCompetencyId: C1 },
        { id: 's4', intervieweeId: 'a', status: 'completed', focusKind: null, triggerRecordIds: ['r1', 'hilang'] },
        { id: 's5', intervieweeId: 'd', status: 'in_progress', focusKind: 'okr', focusMetricType: 'sla', focusMetricKey: 'waktu respons', focusPeriod: '2026-11' },
        { id: 's6', intervieweeId: 'e', status: 'abandoned', focusKind: 'competency', focusCompetencyId: C1 },
      ],
    });
    expect(links.get(`c:${C1}`)).toMatchObject({ interviewedCount: 1, assignedCount: 1 }); // kedaluwarsa dan dibatalkan tidak dihitung
    expect(links.get(okrKey)).toMatchObject({ interviewedCount: 1, assignedCount: 1 });
    expect(links.get(`c:${C1}`).byUser.get('b')).toMatchObject({ id: 's2', status: 'scheduled' });
  });

  it('temuan ditautkan lewat kompetensi, baris kinerja, atau fokus sesi', () => {
    const map = findingsByGap({
      findings: [
        { id: 'f1', category: 'training', reviewStatus: 'approved', competencyId: C1 },
        { id: 'f2', category: 'non_training', reviewStatus: 'approved', metricType: 'sla', metricName: 'Waktu respons', metricPeriod: '2026-11' },
        { id: 'f3', category: 'training', reviewStatus: 'draft', sessionId: 's9' },
        { id: 'f4', category: 'training', reviewStatus: 'draft', sessionId: 'tanpa-fokus' },
      ],
      sessionsById: new Map([['s9', { focusKind: 'competency', focusCompetencyId: C2 }], ['tanpa-fokus', { focusKind: null }]]),
    });
    expect(map.get(`c:${C1}`).map((f) => f.id)).toEqual(['f1']);
    expect(map.get(okrKey).map((f) => f.id)).toEqual(['f2']);
    expect(map.get(`c:${C2}`).map((f) => f.id)).toEqual(['f3']);
    expect([...map.keys()]).toHaveLength(3);
  });
});

describe('klasifikasi gap (R6, R7)', () => {
  const f = (category, reviewStatus, userId = 'a') => ({ category, reviewStatus, userId });
  const hr = visibility({ role: 'hr_admin', flagNonTraining: true });
  const spv = visibility({ role: 'supervisor', userId: 'spv', hasGrant: false, flagNonTraining: true, directReportIds: ['a'] });
  const spvGrant = visibility({ role: 'supervisor', userId: 'spv', hasGrant: true, flagNonTraining: true, directReportIds: ['a'] });

  it('tabel keputusan untuk HR', () => {
    expect(classify({ findings: [], vis: hr, interviewed: false })).toBe('pending');
    expect(classify({ findings: [], vis: hr, interviewed: true })).toBe('review');
    expect(classify({ findings: [f('training', 'approved')], vis: hr, interviewed: true })).toBe('training');
    expect(classify({ findings: [f('non_training', 'edited')], vis: hr, interviewed: true })).toBe('non_training');
    expect(classify({ findings: [f('training', 'approved'), f('non_training', 'approved')], vis: hr, interviewed: true })).toBe('review');
    expect(classify({ findings: [f('training', 'approved'), f('training', 'draft')], vis: hr, interviewed: true })).toBe('review');
  });

  it('gap dengan temuan yang tersembunyi bagi pemanggil tidak kembali ke Belum diwawancarai (R7)', () => {
    expect(classify({ findings: [f('training', 'draft')], vis: spv, interviewed: false })).toBe('review');
    expect(classify({ findings: [f('non_training', 'approved')], vis: spv, interviewed: false })).toBe('review');
    expect(classify({ findings: [f('non_training', 'approved')], vis: visibility({ role: 'hr_admin', flagNonTraining: false }), interviewed: false })).toBe('review');
  });

  it('temuan yang ditolak diabaikan', () => {
    expect(classify({ findings: [f('training', 'rejected')], vis: hr, interviewed: true })).toBe('review');
    expect(classify({ findings: [f('training', 'rejected')], vis: hr, interviewed: false })).toBe('pending');
    expect(classify({ findings: [f('training', 'approved'), f('non_training', 'rejected')], vis: hr, interviewed: true })).toBe('training');
  });

  it('atasan tanpa izin tidak terpengaruh temuan non-pelatihan dan draf', () => {
    expect(classify({ findings: [f('non_training', 'approved')], vis: spv, interviewed: true })).toBe('review');
    expect(classify({ findings: [f('training', 'approved'), f('non_training', 'approved'), f('training', 'draft')], vis: spv, interviewed: true })).toBe('training');
  });

  it('atasan berizin melihat non-pelatihan bawahan, bukan tentang dirinya, dan tetap tanpa draf', () => {
    expect(classify({ findings: [f('non_training', 'approved', 'a')], vis: spvGrant, interviewed: true })).toBe('non_training');
    expect(classify({ findings: [f('non_training', 'approved', 'spv')], vis: spvGrant, interviewed: true })).toBe('review');
    expect(classify({ findings: [f('non_training', 'approved', 'a'), f('training', 'draft', 'a')], vis: spvGrant, interviewed: true })).toBe('non_training');
  });

  it('flag non-pelatihan mati: HR pun tidak melihat Improvement Needs', () => {
    const off = visibility({ role: 'hr_admin', flagNonTraining: false });
    expect(classify({ findings: [f('non_training', 'approved')], vis: off, interviewed: true })).toBe('review');
    const spvOff = visibility({ role: 'supervisor', userId: 'spv', hasGrant: true, flagNonTraining: false, directReportIds: ['a'] });
    expect(classify({ findings: [f('non_training', 'approved')], vis: spvOff, interviewed: true })).toBe('review');
  });
});

describe('ringkasan dan bukti (R4, R8, R9)', () => {
  it('KPI hanya menghitung baris gap; kontribusi 4 terbesar dari gap kompetensi', () => {
    const competencyRows = withPareto([
      { gap: 1, classification: 'training', interviewed: true }, { gap: 1, classification: 'pending', interviewed: false },
      { gap: 1, classification: 'review', interviewed: true }, { gap: 1, classification: 'pending', interviewed: false },
      { gap: 1, classification: 'pending', interviewed: false }, { gap: 0, classification: 'ok', interviewed: true },
    ]);
    const okrRows = [{ classification: 'non_training', interviewed: true }];
    expect(summarize({ competencyRows, okrRows })).toEqual({
      kpis: { competencyGaps: 5, okrGaps: 1, totalGaps: 6, interviewed: 3, top4Share: 0.8 },
      classification: { training: 1, non_training: 1, review: 1, pending: 3 },
    });
    expect(summarize({ competencyRows: [], okrRows: [] }).kpis).toEqual({ competencyGaps: 0, okrGaps: 0, totalGaps: 0, interviewed: 0, top4Share: 0 });
  });

  it('bukti dibangun dari data tanpa nama orang; tiga hipotesis belum terverifikasi', () => {
    const ev = evidenceFor(
      { kind: 'competency', target: 3, actual: 2, assessed: 2, peopleWithGap: 2, peopleTotal: 3 },
      [{ name: 'Dimas', value: 1 }, { name: 'Rina', value: 3 }, { name: 'Tono', value: null }],
    );
    expect(ev.join(' ')).toMatch(/2 dari 2 karyawan yang dinilai/);
    expect(ev.join(' ')).toMatch(/1 karyawan belum dinilai/);
    expect(ev.join(' ')).not.toMatch(/Dimas|Rina|Tono/);
    const okr = evidenceFor({ kind: 'okr', period: '2026-11', peopleMissed: 2, peopleTotal: 4, target: 15, actual: 20, unit: 'menit', tolerance: 2 }, []);
    expect(okr.join(' ')).toMatch(/2 dari 4 karyawan/);
    expect(okr.join(' ')).toMatch(/toleransi 2/i);
    expect(HYPOTHESES).toHaveLength(3);
  });
});

describe('penugasan wawancara (R10, R11)', () => {
  const now = new Date('2026-11-19T10:00:00Z'); // 17.00 WIB, 19 Nov

  it('tenggat: akhir hari WIB, paling cepat besok, paling lama 30 hari', () => {
    expect(parseDueDate('2026-11-20', now).toISOString()).toBe('2026-11-20T16:59:59.000Z');
    expect(parseDueDate('2026-12-19', now)).toBeInstanceOf(Date);
    for (const bad of ['2026-11-18', '2026-11-19', '2026-12-20']) {
      expect(() => parseDueDate(bad, now)).toThrow(expect.objectContaining({ status: 400, code: 'DUE_DATE_OUT_OF_RANGE' }));
    }
    for (const bad of ['20-11-2026', '2026-02-31', '', undefined, 20261120]) {
      expect(() => parseDueDate(bad, now)).toThrow(expect.objectContaining({ status: 400, code: 'BAD_REQUEST' }));
    }
    // 23.30 WIB tanggal 19 masih tanggal 19 WIB walau UTC belum berganti hari
    expect(() => parseDueDate('2026-11-19', new Date('2026-11-19T16:30:00Z'))).toThrow(expect.objectContaining({ code: 'DUE_DATE_OUT_OF_RANGE' }));
    // 00.30 WIB tanggal 20: tanggal 20 adalah "hari ini"
    expect(() => parseDueDate('2026-11-20', new Date('2026-11-19T17:30:00Z'))).toThrow(expect.objectContaining({ code: 'DUE_DATE_OUT_OF_RANGE' }));
  });

  const base = { projectId: C1, gap: { kind: 'okr', metricType: 'sla', name: 'Waktu respons', period: '2026-11' }, mode: 'affected', dueDate: '2026-11-25', durationMinutes: 15 };
  it('validasi bentuk permintaan', () => {
    expect(validateAssignment(base, now)).toMatchObject({ projectId: C1, mode: 'affected', durationMinutes: 15, employeeIds: null });
    const bad = (patch) => () => validateAssignment({ ...base, ...patch }, now);
    expect(bad({ durationMinutes: 20 })).toThrow(expect.objectContaining({ code: 'BAD_REQUEST' }));
    expect(bad({ durationMinutes: '15' })).toThrow();
    expect(bad({ mode: 'semua' })).toThrow();
    expect(bad({ mode: 'all_job_role' })).toThrow(/jabatan/i);
    expect(bad({ projectId: 'bukan-uuid' })).toThrow();
    expect(bad({ gap: { kind: 'okr', metricType: 'sla', name: 'Waktu respons' } })).toThrow(/periode/i);
    expect(bad({ gap: { kind: 'okr', metricType: 'abc', name: 'x', period: 'p' } })).toThrow();
    expect(bad({ gap: { kind: 'competency', competencyId: 'x' } })).toThrow();
    expect(bad({ gap: { kind: 'lain' } })).toThrow();
    expect(bad({ employeeIds: [] })).toThrow();
    expect(bad({ employeeIds: ['x'] })).toThrow();
    expect(bad({ employeeIds: Array.from({ length: 201 }, () => C1) })).toThrow();
    expect(validateAssignment({ ...base, mode: 'all_job_role', jobRoleId: C2, employeeIds: [C3, C3] }, now)).toMatchObject({ jobRoleId: C2, employeeIds: [C3] });
    expect(validateAssignment({ ...base, gap: { kind: 'competency', competencyId: C2 } }, now).gap).toEqual({ kind: 'competency', competencyId: C2 });
  });

  const members = [
    { id: 'spv', role: 'supervisor', jobRoleId: 'jr1' }, { id: 'a', role: 'learner', jobRoleId: 'jr1' },
    { id: 'b', role: 'learner', jobRoleId: 'jr1' }, { id: 'c', role: 'hr_admin', jobRoleId: 'jr2' }, { id: 'eta', role: 'eta_admin', jobRoleId: 'jr1' },
  ];
  it('mode affected vs all_job_role; penugas dan Admin ETA tidak ikut', () => {
    const records = [rec('r1', 'a', 'Waktu respons', 15, 30, false), rec('r2', 'b', 'Waktu respons', 15, 10, true), rec('r3', 'spv', 'Waktu respons', 15, 40, false),
      rec('r4', 'c', 'Waktu respons', 15, 40, false, { period: '2026-10' })];
    const gap = { kind: 'okr', metricType: 'sla', name: 'waktu respons', period: '2026-11' };
    expect(eligibleEmployees({ mode: 'affected', gap, members, records, selfId: 'spv' })).toEqual([{ userId: 'a', jobRoleId: 'jr1', triggerRecordIds: ['r1'] }]);
    expect(eligibleEmployees({ mode: 'all_job_role', jobRoleId: 'jr1', gap, members, records, selfId: 'c' })).toEqual([
      { userId: 'spv', jobRoleId: 'jr1', triggerRecordIds: ['r3'] }, { userId: 'a', jobRoleId: 'jr1', triggerRecordIds: ['r1'] }, { userId: 'b', jobRoleId: 'jr1', triggerRecordIds: [] },
    ]);
    const cgap = { kind: 'competency', competencyId: C1 };
    const latest = new Map([[`a|${C1}`, 2], [`b|${C1}`, 3]]);
    expect(eligibleEmployees({ mode: 'affected', gap: cgap, members, latest, competency: { id: C1, requiredScore: 3 }, selfId: 'spv' }).map((e) => e.userId)).toEqual(['a']);
  });

  it('rencana: sesi terbuka dilewati, sesi kedaluwarsa digantikan, sesi selesai tidak menghalangi', () => {
    const t = new Date('2026-11-20T00:00:00Z');
    expect(isOpen({ status: 'scheduled', inviteExpiresAt: '2026-11-21T00:00:00Z' }, t)).toBe(true);
    expect(isOpen({ status: 'scheduled', inviteExpiresAt: '2026-11-19T00:00:00Z' }, t)).toBe(false);
    expect(isOpen({ status: 'in_progress', inviteExpiresAt: '2026-11-19T00:00:00Z' }, t)).toBe(true);
    expect(isOpen({ status: 'completed' }, t)).toBe(false);
    const plan = planAssignments({
      now: t,
      eligible: [{ userId: 'a' }, { userId: 'b' }, { userId: 'c' }, { userId: 'd' }],
      existing: [
        { id: 's1', intervieweeId: 'a', status: 'scheduled', inviteExpiresAt: '2026-11-21T00:00:00Z' },
        { id: 's2', intervieweeId: 'b', status: 'scheduled', inviteExpiresAt: '2026-11-19T00:00:00Z' },
        { id: 's3', intervieweeId: 'c', status: 'in_progress', inviteExpiresAt: '2026-11-19T00:00:00Z' },
      ],
    });
    expect(plan.assign).toEqual([{ userId: 'b', replaceSessionIds: ['s2'] }, { userId: 'd', replaceSessionIds: [] }]);
    expect(plan.skipped).toEqual([{ employeeId: 'a', reason: 'open_session' }, { employeeId: 'c', reason: 'in_progress' }]);
  });
});
