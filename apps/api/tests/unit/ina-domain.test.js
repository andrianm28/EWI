// B9: aturan murni Improvement Needs dan port AI verifikasi.
const { canTransition, kpis, isOverdue, isDate, isUuid, CATEGORIES } = require('../../src/modules/ina/domain');
const { createVerificationAi, classify, defaultSummary, MAX_QUESTIONS } = require('../../src/modules/ina/verification-ai');
const { inaAccess, requireLevel } = require('../../src/modules/ina/access');

const human = (...texts) => texts.map((text) => ({ speaker: 'human', text }));

describe('INA domain', () => {
  it('transisi status: Baru -> Berjalan -> Selesai/Ditolak, bisa dibuka lagi', () => {
    expect(canTransition('new', 'in_progress')).toBe(true);
    expect(canTransition('new', 'done')).toBe(true);
    expect(canTransition('in_progress', 'new')).toBe(true);
    expect(canTransition('done', 'in_progress')).toBe(true);
    expect(canTransition('rejected', 'new')).toBe(true);
    expect(canTransition('done', 'new')).toBe(false);
    expect(canTransition('done', 'rejected')).toBe(false);
    expect(canTransition('rejected', 'done')).toBe(false);
    expect(canTransition('new', 'apa')).toBe(false);
  });

  it('KPI: total, selesai, SOP/alat/sistem, budaya; lainnya hanya masuk total', () => {
    const rows = [
      { category: 'sop', status: 'new', dueDate: '2026-11-01' },
      { category: 'alat', status: 'done', dueDate: '2026-11-01' },
      { category: 'sistem', status: 'in_progress', dueDate: '2026-12-31' },
      { category: 'budaya', status: 'rejected', dueDate: '2026-11-01' },
      { category: 'lainnya', status: 'new', dueDate: null },
    ];
    expect(kpis(rows, '2026-11-19')).toEqual({ total: 5, done: 1, process: 3, culture: 1, overdue: 1 });
    expect(kpis([], '2026-11-19')).toEqual({ total: 0, done: 0, process: 0, culture: 0, overdue: 0 });
    expect(CATEGORIES).toEqual(['sop', 'alat', 'sistem', 'budaya', 'lainnya']);
  });

  it('lewat tenggat hanya untuk tindakan terbuka; tenggat hari ini belum lewat', () => {
    expect(isOverdue({ status: 'new', dueDate: '2026-11-18' }, '2026-11-19')).toBe(true);
    expect(isOverdue({ status: 'new', dueDate: '2026-11-19' }, '2026-11-19')).toBe(false);
    expect(isOverdue({ status: 'done', dueDate: '2026-11-18' }, '2026-11-19')).toBe(false);
    expect(isOverdue({ status: 'new', dueDate: null }, '2026-11-19')).toBe(false);
  });

  it('validasi tanggal dan uuid', () => {
    expect(isDate('2026-12-01')).toBe(true);
    expect(isDate('2026-02-30')).toBe(false);
    expect(isDate('01-12-2026')).toBe(false);
    expect(isDate(20261201)).toBe(false);
    expect(isUuid('3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b')).toBe(true);
    expect(isUuid('abc')).toBe(false);
  });
});

describe('INA verifikasi AI (bawaan)', () => {
  const action = { title: 'Perbarui SOP eskalasi', category: 'sop', dueDate: null };

  it('tiga pertanyaan, lalu berhenti', async () => {
    const v = createVerificationAi({});
    expect(v.providerName).toBe('bawaan');
    expect(MAX_QUESTIONS).toBe(3);
    const q = [];
    for (let i = 0; i < 4; i += 1) q.push(await v.nextQuestion({ action, askedCount: i }));
    expect(q[0]).toContain('Perbarui SOP eskalasi');
    expect(q.slice(0, 3).every((x) => typeof x === 'string' && x.length > 10)).toBe(true);
    expect(new Set(q.slice(0, 3)).size).toBe(3);
    expect(q[3]).toBeNull();
  });

  it('status yang dilaporkan dari kata kunci, dengan negasi', () => {
    expect(classify(human('Sudah selesai minggu lalu'))).toBe('done');
    expect(classify(human('Belum selesai, masih dikerjakan'))).toBe('in_progress');
    expect(classify(human('Masih berjalan', 'Terkendala anggaran'))).toBe('blocked');
    expect(classify(human('Masih berjalan', 'Tidak ada'))).toBe('in_progress');
    expect(classify(human('Sudah beres', 'Sempat terhambat vendor'))).toBe('done');
    for (const t of ['Hampir selesai', 'Akan selesai minggu ini', 'Selesai bulan depan', 'Target selesai Desember']) expect(classify(human(t))).toBe('in_progress');
    expect(classify([])).toBe('in_progress');
  });

  it('PO-6: ringkasan bawaan tidak pernah memuat teks jawaban', async () => {
    const rahasia = 'Atasan saya Pak Budi menolak tanda tangan, jadi terhambat';
    const out = await createVerificationAi(null).summarize({ action, turns: human('Belum selesai', rahasia, 'Butuh eskalasi XYZ-123') });
    expect(out.reportedStatus).toBe('blocked');
    expect(out.provider).toBe('bawaan');
    for (const kata of ['Budi', 'tanda tangan', 'XYZ-123', 'eskalasi']) expect(out.summary).not.toContain(kata);
    expect(defaultSummary(human('a')).summary).toContain('1 dari 3');
  });

  it('provider AI dipakai bila punya kedua method; hasil tidak sah atau galat jatuh ke bawaan', async () => {
    const baik = createVerificationAi({
      name: 'bedrock',
      nextVerificationQuestion: async ({ askedCount }) => `Pertanyaan AI ${askedCount + 1}`,
      summarizeVerification: async () => ({ summary: 'Ringkasan AI', reportedStatus: 'done' }),
    });
    expect(baik.providerName).toBe('bedrock');
    expect(await baik.nextQuestion({ action, askedCount: 1 })).toBe('Pertanyaan AI 2');
    expect(await baik.nextQuestion({ action, askedCount: 3 })).toBeNull(); // batas tetap berlaku
    expect(await baik.summarize({ action, turns: [] })).toEqual({ summary: 'Ringkasan AI', reportedStatus: 'done', provider: 'bedrock' });

    const rusak = createVerificationAi({
      nextVerificationQuestion: async () => { throw new Error('timeout'); },
      summarizeVerification: async () => ({ summary: 'x', reportedStatus: 'ngawur' }),
    });
    expect(await rusak.nextQuestion({ action, askedCount: 0 })).toContain('Perbarui SOP eskalasi');
    expect((await rusak.summarize({ action, turns: human('sudah selesai') })).provider).toBe('bawaan');
    // hanya satu method -> dianggap tidak punya provider
    expect(createVerificationAi({ nextVerificationQuestion: async () => 'x' }).providerName).toBe('bawaan');
  });
});

describe('INA akses (K1 = PM-6)', () => {
  const stores = (granted) => ({
    tna: { hasNonTrainingGrant: async () => granted },
    people: { directReportIds: async () => ['b-1', 'b-2'] },
  });
  const req = (role) => ({ tenantId: 't-1', user: { id: 'u-1', role } });

  it('hanya HR klien mengelola; Admin ETA baca saja seluruh tenant (keputusan user 23 Nov); pimpinan hanya ringkasan; atasan hanya bila diberi akses', async () => {
    expect(await inaAccess(req('hr_admin'), stores(false))).toEqual({ level: 'manage', scope: { all: true } });
    expect(await inaAccess(req('eta_admin'), stores(false))).toEqual({ level: 'read', scope: { all: true } });
    expect((await inaAccess(req('pimpinan'), stores(false))).level).toBe('summary');
    expect(await inaAccess(req('supervisor'), stores(false))).toEqual({ level: null, reason: 'NO_INA_ACCESS' });
    const spv = await inaAccess(req('supervisor'), stores(true));
    expect(spv.level).toBe('read');
    expect(spv.scope.all).toBeFalsy();
    expect([...spv.scope.userIds].sort()).toEqual(['b-1', 'b-2', 'u-1']);
    expect((await inaAccess(req('learner'), stores(true))).level).toBeNull();
    expect((await inaAccess(req('tenant_admin'), stores(true))).level).toBeNull();
  });

  it('requireLevel: kode galat berbeda untuk atasan tanpa izin dan peran lain', async () => {
    await expect(requireLevel(req('supervisor'), stores(false), ['manage', 'read'])).rejects.toMatchObject({ status: 403, code: 'NO_INA_ACCESS' });
    await expect(requireLevel(req('learner'), stores(false), ['manage', 'read'])).rejects.toMatchObject({ status: 403, code: 'ROLE_FORBIDDEN' });
    await expect(requireLevel(req('pimpinan'), stores(false), ['manage'])).rejects.toMatchObject({ status: 403, code: 'ROLE_FORBIDDEN' });
    expect((await requireLevel(req('hr_admin'), stores(false), ['manage'])).level).toBe('manage');
  });
});
