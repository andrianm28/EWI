const { careerStatus, okrAchievement, careerState, findCycle, decisionView, decisionState, promotionSettings } = require('../../src/modules/dna/career');

const rec = (o) => ({ metricType: 'okr', name: 'Resolusi tiket', target: 100, actual: 90, direction: 'higher', valueType: 'angka', isMet: false, period: '2026-11', createdAt: '2026-11-10T00:00:00Z', ...o });
const okr = (rows, types) => okrAchievement(rows, types);

describe('B16 pencapaian OKR (C2)', () => {
  it('arah higher dan lower, dibatasi 0-100, rata-rata dua desimal', () => {
    expect(okr([rec({ actual: 90 })])).toEqual({ achievement: 90, period: '2026-11', count: 1 });
    expect(okr([rec({ actual: 150 })]).achievement).toBe(100);
    expect(okr([rec({ name: 'MTTR', direction: 'lower', target: 4, actual: 5 })]).achievement).toBe(80);
    expect(okr([rec({ name: 'MTTR', direction: 'lower', target: 4, actual: 0 })]).achievement).toBe(100);
    expect(okr([rec({ name: 'a', actual: 79 }), rec({ name: 'b', actual: 80 })]).achievement).toBe(79.5);
    expect(okr([rec({ name: 'a', target: 3, actual: 2 })]).achievement).toBe(66.67);
  });
  it('biner dan tenggat memakai isMet', () => {
    expect(okr([rec({ valueType: 'biner', isMet: true, target: null, actual: null })]).achievement).toBe(100);
    expect(okr([rec({ valueType: 'tenggat', isMet: false })]).achievement).toBe(0);
  });
  it('baris tidak terhitung dilewati; tanpa baris terhitung = null', () => {
    expect(okr([rec({ target: 0 })])).toBeNull();
    expect(okr([rec({ actual: -1 })])).toBeNull();
    expect(okr([rec({ actual: null })])).toBeNull();
    expect(okr([])).toBeNull();
    expect(okr([rec({ name: 'a', target: 0 }), rec({ name: 'b', actual: 50 })])).toMatchObject({ achievement: 50, count: 1 });
  });
  it('hanya jenis metrik yang dikonfigurasi (default okr)', () => {
    expect(okr([rec({ metricType: 'kpi' })])).toBeNull();
    expect(okr([rec({ metricType: 'kpi', actual: 70 })], ['okr', 'kpi']).achievement).toBe(70);
  });
  it('periode terbesar yang dipakai; baris tanpa periode hanya bila tidak ada yang berperiode', () => {
    expect(okr([rec({ period: '2026-10', actual: 50 }), rec({ period: '2026-11', actual: 85 })])).toMatchObject({ achievement: 85, period: '2026-11' });
    expect(okr([rec({ period: null, actual: 50 }), rec({ period: '2026-09', actual: 85 })]).achievement).toBe(85);
    expect(okr([rec({ period: null, actual: 50 })])).toMatchObject({ achievement: 50, period: null });
  });
  it('impor ulang dengan waktu sama: id terbesar menang, tidak bergantung urutan masukan', () => {
    const a = rec({ id: 'b', actual: 90, createdAt: '2026-11-05T00:00:00Z' }); const b = rec({ id: 'a', actual: 40, createdAt: '2026-11-05T00:00:00Z' });
    expect(okr([a, b]).achievement).toBe(90);
    expect(okr([b, a]).achievement).toBe(90);
  });
  it('impor ulang: per nama metrik hanya baris terbaru', () => {
    const r = okr([rec({ actual: 40, createdAt: '2026-11-01T00:00:00Z' }), rec({ name: 'resolusi TIKET', actual: 90, createdAt: '2026-11-05T00:00:00Z' })]);
    expect(r).toMatchObject({ achievement: 90, count: 1 });
  });
});

const levels = [
  { id: 'l1', name: 'Junior', levelOrder: 1, requiredProgramTier: 'basic' },
  { id: 'l2', name: 'Senior', levelOrder: 2, requiredProgramTier: 'intermediate' },
  { id: 'l3', name: 'Team Leader', levelOrder: 3, requiredProgramTier: null },
];
const passed = (...tiers) => tiers.map((programTier) => ({ programTier, status: 'passed' }));
const state = ({ level = 'l1', done = [], achievement = null, hasDictionary = true, lv = levels, okrMin = 80 } = {}) => careerState({
  career: careerStatus({ levels: lv, currentLevelId: level, completions: passed(...done) }),
  hasPosition: Boolean(level), hasDictionary, okr: achievement == null ? null : { achievement }, okrMin,
});

describe('B16 status jenjang (C3, C4)', () => {
  it('delapan status berurutan', () => {
    expect(state({ hasDictionary: false }).status).toBe('no_path');
    expect(state({ level: null }).status).toBe('no_path');
    expect(state({ done: [] }).status).toBe('below_current');
    expect(state({ level: 'l3' }).status).toBe('top_level');
    expect(state({ level: 'l2', done: ['intermediate'] }).status).toBe('next_no_requirement');
    expect(state({ done: ['basic', 'intermediate'], achievement: 80 })).toMatchObject({ status: 'eligible', eligible: true });
    expect(state({ done: ['basic', 'intermediate'], achievement: 79.5 })).toMatchObject({ status: 'program_passed_okr_low', eligible: false });
    expect(state({ done: ['basic', 'intermediate'] })).toMatchObject({ status: 'program_passed_no_okr', eligible: false });
    expect(state({ done: ['basic'], achievement: 95 })).toMatchObject({ status: 'on_track', eligible: false });
  });
  it('jenjang sekarang tanpa syarat program tidak menghalangi; ambang mengikuti konfigurasi', () => {
    const lv = [{ id: 'l1', name: 'Probation', levelOrder: 1, requiredProgramTier: null }, { id: 'l2', name: 'Junior', levelOrder: 2, requiredProgramTier: 'basic' }];
    expect(state({ lv, done: ['basic'], achievement: 90 }).eligible).toBe(true);
    expect(state({ done: ['basic', 'intermediate'], achievement: 70, okrMin: 60 }).eligible).toBe(true);
  });
  it('kandidat tab keputusan (C5) = program jenjang berikutnya lulus', () => {
    expect(state({ done: ['basic', 'intermediate'] }).candidate).toBe(true);
    expect(state({ done: ['basic'] }).candidate).toBe(false);
  });
});

const row = (o) => ({ id: 'd1', userId: 'e1', fromLevelId: 'l1', toLevelId: 'l2', supervisorDecision: 'recommend', hrDecision: null, createdAt: '2026-11-10T00:00:00Z', ...o });
const emp = { id: 'e1', supervisorId: 's1', supervisorRole: 'supervisor' };
const view = (o) => decisionView({ viewer: { id: 's1', role: 'supervisor' }, employee: emp, eligible: true, cycle: findCycle([], 'l1', 'l2'), ...o });

describe('B16 siklus dan tindakan (C6-C10)', () => {
  it('findCycle: terbuka harus cocok jenjang asal; approved untuk jenjang tujuan menang; siklus usang diabaikan', () => {
    expect(findCycle([row()], 'l1', 'l2').open.id).toBe('d1');
    expect(findCycle([row({ fromLevelId: 'l0' })], 'l1', 'l2')).toMatchObject({ open: null, approved: null, latest: null });
    expect(findCycle([row({ toLevelId: 'l3' })], 'l1', 'l2').latest).toBeNull();
    expect(findCycle([row({ hrDecision: 'approved' })], 'l1', 'l2').approved.id).toBe('d1');
    const c = findCycle([row({ id: 'old', hrDecision: 'hold', createdAt: '2026-11-01T00:00:00Z' }), row({ id: 'new' })], 'l1', 'l2');
    expect(c.open.id).toBe('new');
    expect(c.latest.id).toBe('new');
    expect(findCycle([row()], 'l1', null).latest).toBeNull();
  });
  it('decisionState', () => {
    expect(decisionState(findCycle([], 'l1', 'l2'))).toBe('none');
    expect(decisionState(findCycle([row()], 'l1', 'l2'))).toBe('supervisor_recommend');
    expect(decisionState(findCycle([row({ supervisorDecision: 'hold' })], 'l1', 'l2'))).toBe('supervisor_hold');
    expect(decisionState(findCycle([row({ hrDecision: 'hold' })], 'l1', 'l2'))).toBe('hold');
    expect(decisionState(findCycle([row({ hrDecision: 'approved' })], 'l1', 'l2'))).toBe('approved');
  });
  it('atasan langsung: boleh memutuskan dan mengganti selama memenuhi syarat dan belum disetujui', () => {
    expect(view()).toEqual({ actions: ['recommend', 'hold'], blockedReason: null });
    expect(view({ cycle: findCycle([row()], 'l1', 'l2') }).actions).toEqual(['recommend', 'hold']);
    expect(view({ cycle: findCycle([row({ hrDecision: 'hold' })], 'l1', 'l2') }).actions).toEqual(['recommend', 'hold']);
    expect(view({ eligible: false })).toEqual({ actions: [], blockedReason: 'not_eligible' });
    // rekomendasi terbuka tetap bisa ditarik (tunda) walau karyawan tidak lagi memenuhi syarat
    expect(view({ eligible: false, cycle: findCycle([row()], 'l1', 'l2') })).toEqual({ actions: ['hold'], blockedReason: null });
    expect(view({ cycle: findCycle([row({ hrDecision: 'approved' })], 'l1', 'l2') })).toEqual({ actions: [], blockedReason: 'approved' });
  });
  it('HR: menunggu atasan, setujui hanya bila direkomendasi dan masih memenuhi syarat, tunda selalu boleh', () => {
    const hr = { id: 'h1', role: 'hr_admin' };
    expect(view({ viewer: hr })).toEqual({ actions: [], blockedReason: 'waiting_supervisor' });
    expect(view({ viewer: hr, cycle: findCycle([row()], 'l1', 'l2') })).toEqual({ actions: ['approve', 'hold'], blockedReason: null });
    expect(view({ viewer: hr, cycle: findCycle([row({ supervisorDecision: 'hold' })], 'l1', 'l2') }).actions).toEqual(['hold']);
    expect(view({ viewer: hr, eligible: false, cycle: findCycle([row()], 'l1', 'l2') }).actions).toEqual(['hold']);
    expect(view({ viewer: hr, eligible: false })).toEqual({ actions: [], blockedReason: 'not_eligible' });
    expect(view({ viewer: hr, cycle: findCycle([row({ hrDecision: 'hold' })], 'l1', 'l2') })).toEqual({ actions: [], blockedReason: 'held' });
    expect(view({ viewer: hr, cycle: findCycle([row({ hrDecision: 'approved' })], 'l1', 'l2') }).blockedReason).toBe('approved');
  });
  it('HR yang mencatat rekomendasi atasan pada siklus itu tidak mendapat tombol keputusan HR (pemisahan tugas, C7)', () => {
    const hr = { id: 'h1', role: 'hr_admin' };
    expect(view({ viewer: hr, cycle: findCycle([row({ supervisorBy: 'h1' })], 'l1', 'l2') })).toEqual({ actions: [], blockedReason: 'self_recommended' });
    expect(view({ viewer: hr, cycle: findCycle([row({ supervisorBy: 's1' })], 'l1', 'l2') }).actions).toEqual(['approve', 'hold']);
  });
  it('tanpa atasan yang sah: no_supervisor; Super Admin hanya melihat', () => {
    const hr = { id: 'h1', role: 'hr_admin' };
    expect(view({ viewer: hr, employee: { ...emp, supervisorId: null, supervisorRole: null } }).blockedReason).toBe('no_supervisor');
    expect(view({ viewer: hr, employee: { ...emp, supervisorRole: 'role_leader' } }).blockedReason).toBe('no_supervisor');
    expect(view({ viewer: { id: 'x', role: 'eta_admin' }, cycle: findCycle([row()], 'l1', 'l2') })).toEqual({ actions: [], blockedReason: 'view_only' });
  });
});

describe('B16 setelan rusak (C11)', () => {
  it('dna null atau promotion bukan objek jatuh ke default, tidak melempar', () => {
    const def = { okrMin: 80, metricTypes: ['okr'], visibleTo: ['hr_admin'] };
    expect(promotionSettings(null)).toEqual(def);
    expect(promotionSettings({ promotion: null })).toEqual(def);
    expect(promotionSettings({ promotion: 'x', promotionVisibleTo: null })).toEqual(def);
  });
});

describe('B16 tombol atasan mengikuti peran di basis data (C6)', () => {
  it('atasan yang perannya sudah dicabut di basis data tidak mendapat tombol', () => {
    expect(view({ employee: { ...emp, supervisorRole: 'learner' } })).toEqual({ actions: [], blockedReason: 'view_only' });
  });
});
