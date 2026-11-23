const { MIN_RESPONDENTS, HOT_GAP, EMPLOYEE_BATCH, respondentBand, synthesize, batchToSettle } = require('../../src/modules/cca/synthesis');

const REQ = [{ id: 'r1', name: 'Kolaborasi lintas tim' }, { id: 'r2', name: 'Fokus pelanggan' }];
let seq = 0;
// satu jawaban terkonfirmasi: siapa, tier, kapan, sikap per persyaratan; jawaban karyawan sudah masuk batch (settled)
const jawab = (assigneeId, tier, stances, completedAt = `2026-11-2${seq++ % 9}T08:00:00Z`, settled = true) => ({ assigneeId, tier, completedAt, stances, settled });
const karyawan = (n, stance, req = 'r1') => Array.from({ length: n }, (_, i) => jawab(`k${req}${stance}${i}`, 'employee', { [req]: stance }));
const baris = (out, id) => out.find((x) => x.requirementId === id);

describe('CCA sintesis pimpinan vs karyawan (D-6, D-7)', () => {
  it('konstanta mengikuti spek', () => {
    expect(MIN_RESPONDENTS).toBe(5);
    expect(HOT_GAP).toBe(20);
    expect(EMPLOYEE_BATCH).toBe(5);
  });

  it('skor = setuju + setengah partial dibagi responden yang menyinggung; not_covered tidak dihitung', () => {
    const out = synthesize(REQ, [
      jawab('p1', 'leader', { r1: 'agree' }),
      jawab('p2', 'leader', { r1: 'partial' }),
      jawab('p3', 'leader', { r1: 'disagree' }),
      jawab('p4', 'leader', { r1: 'not_covered', r2: 'agree' }),
    ]);
    // (1 + 0,5) / 3 = 50
    expect(baris(out, 'r1')).toMatchObject({ leaderAgree: 50, leaderRespondents: 3 });
    expect(baris(out, 'r2')).toMatchObject({ leaderAgree: 100, leaderRespondents: 1 });
  });

  it('tanpa responden: skor, gap null dan hot false', () => {
    const out = synthesize(REQ, []);
    expect(baris(out, 'r1')).toEqual({
      requirementId: 'r1', leaderAgree: null, leaderRespondents: 0, employeeAligned: null, employeeRespondents: '<5', gap: null, hot: false,
    });
  });

  it('angka karyawan disembunyikan di bawah 5 responden', () => {
    const out = synthesize(REQ, [jawab('p1', 'leader', { r1: 'agree' }), ...karyawan(4, 'aligned')]);
    expect(baris(out, 'r1')).toMatchObject({ leaderAgree: 100, employeeAligned: null, employeeRespondents: '<5', gap: null, hot: false });
  });

  it('angka karyawan dibulatkan ke kelipatan 5; gap dan hot dari angka itu', () => {
    // 11 sejalan + 3 partial + 1 tidak dari 15 = 83,3 -> 85; gap 100 - 85 = 15
    const out = synthesize(REQ, [jawab('p1', 'leader', { r1: 'agree' }), ...karyawan(11, 'aligned'), ...karyawan(3, 'partial'), ...karyawan(1, 'not_aligned')]);
    expect(baris(out, 'r1')).toMatchObject({ employeeAligned: 85, employeeRespondents: '10–19', gap: 15, hot: false });
    // 3 sejalan + 2 tidak dari 5 = 60; gap 40
    const b = synthesize(REQ, [jawab('p1', 'leader', { r1: 'agree' }), ...karyawan(3, 'aligned'), ...karyawan(2, 'not_aligned')]);
    expect(baris(b, 'r1')).toMatchObject({ employeeAligned: 60, employeeRespondents: '5–9', gap: 40, hot: true });
  });

  it('hot hanya bila gap 20 atau lebih', () => {
    // pimpinan 75 (agree + partial), karyawan 5 sejalan dari 5 = 100 -> gap -25 (tidak hot)
    const a = synthesize(REQ, [jawab('p1', 'leader', { r1: 'agree' }), jawab('p2', 'leader', { r1: 'partial' }), ...karyawan(5, 'aligned')]);
    expect(baris(a, 'r1')).toMatchObject({ leaderAgree: 75, employeeAligned: 100, gap: -25, hot: false });
    // pimpinan 100, karyawan 4 sejalan + 1 tidak = 80 -> gap 20 (hot)
    const b = synthesize(REQ, [jawab('p1', 'leader', { r1: 'agree' }), ...karyawan(4, 'aligned'), ...karyawan(1, 'not_aligned')]);
    expect(baris(b, 'r1')).toMatchObject({ gap: 20, hot: true });
    // karyawan 17 dari 20 = 85; gap 15
    const c = synthesize(REQ, [jawab('p1', 'leader', { r1: 'agree' }), ...karyawan(17, 'aligned'), ...karyawan(3, 'not_aligned')]);
    expect(baris(c, 'r1')).toMatchObject({ employeeAligned: 85, gap: 15, hot: false });
  });

  it('pita responden karyawan', () => {
    expect([0, 4, 5, 9, 10, 19, 20, 300].map(respondentBand)).toEqual(['<5', '<5', '5–9', '5–9', '10–19', '10–19', '20+', '20+']);
  });

  it('hanya putaran terbaru per orang per tier yang dihitung', () => {
    const out = synthesize(REQ, [
      jawab('p1', 'leader', { r1: 'disagree' }, '2026-10-01T00:00:00Z'),
      jawab('p1', 'leader', { r1: 'agree' }, '2026-11-20T00:00:00Z'),
    ]);
    expect(baris(out, 'r1')).toMatchObject({ leaderAgree: 100, leaderRespondents: 1 });
  });

  it('atasan menengah yang selesai di dua tier dihitung di keduanya', () => {
    const out = synthesize(REQ, [
      jawab('m1', 'leader', { r1: 'agree' }),
      jawab('m1', 'employee', { r1: 'not_aligned' }),
      ...karyawan(4, 'aligned'),
    ]);
    // karyawan: 4 sejalan + 1 tidak = 80
    expect(baris(out, 'r1')).toMatchObject({ leaderAgree: 100, leaderRespondents: 1, employeeAligned: 80, employeeRespondents: '5–9' });
  });

  it('sikap untuk persyaratan di luar daftar dan nilai tak dikenal diabaikan', () => {
    const out = synthesize(REQ, [jawab('p1', 'leader', { r1: 'agree', hilang: 'agree' }), jawab('p2', 'leader', { r1: 'aligned' })]);
    expect(out.map((x) => x.requirementId)).toEqual(['r1', 'r2']);
    // 'aligned' bukan sikap tier pimpinan
    expect(baris(out, 'r1')).toMatchObject({ leaderAgree: 100, leaderRespondents: 1 });
  });

  describe('angka karyawan diperbarui per 5 penyelesaian baru (keputusan user 23 Nov, D1)', () => {
    const tunggu = (assigneeId, stances) => jawab(assigneeId, 'employee', stances, '2026-11-23T10:00:00Z', false);

    it('jawaban karyawan yang belum masuk batch tidak dihitung; angka pimpinan tetap dihitung', () => {
      const lima = karyawan(5, 'aligned');
      const out = synthesize(REQ, [...lima, tunggu('t1', { r1: 'not_aligned' }), tunggu('t2', { r1: 'not_aligned' }), jawab('p1', 'leader', { r1: 'agree' })]);
      expect(baris(out, 'r1')).toMatchObject({ leaderAgree: 100, leaderRespondents: 1, employeeAligned: 100, employeeRespondents: '5–9', gap: 0 });
    });

    it('lima penyelesaian masuk batch tetapi hanya empat menyinggung persyaratan: angka tetap disembunyikan', () => {
      const out = synthesize(REQ, [...karyawan(4, 'aligned'), jawab('k-lain', 'employee', { r2: 'aligned' })]);
      expect(baris(out, 'r1')).toMatchObject({ employeeAligned: null, employeeRespondents: '<5' });
    });

    it('putaran ulang yang belum masuk batch: putaran lama orang itu tetap dipakai', () => {
      const lima = karyawan(5, 'aligned');
      const ulang = { ...tunggu(lima[0].assigneeId, { r1: 'not_aligned' }), completedAt: '2026-12-01T00:00:00Z' };
      expect(baris(synthesize(REQ, [...lima, ulang]), 'r1')).toMatchObject({ employeeAligned: 100 });
      expect(baris(synthesize(REQ, [...lima, { ...ulang, settled: true }]), 'r1')).toMatchObject({ employeeAligned: 80 });
    });

    it('batch dibentuk bila yang menunggu berasal dari paling sedikit 5 orang berbeda; semua yang menunggu ikut', () => {
      const p = (id, assigneeId) => ({ id, assigneeId });
      expect(batchToSettle([p('a1', 'A'), p('a2', 'B'), p('a3', 'C'), p('a4', 'D')], EMPLOYEE_BATCH)).toEqual([]);
      expect(batchToSettle([p('a1', 'A'), p('a2', 'B'), p('a3', 'C'), p('a4', 'D'), p('a5', 'E'), p('a6', 'F')], EMPLOYEE_BATCH))
        .toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
    });

    it('putaran ulang orang yang sama tidak mengisi batch sendirian', () => {
      const p = (id, assigneeId) => ({ id, assigneeId });
      const satuOrang = [p('a1', 'A'), p('a2', 'A'), p('a3', 'A'), p('a4', 'B'), p('a5', 'C')];
      expect(batchToSettle(satuOrang, EMPLOYEE_BATCH)).toEqual([]);
      expect(batchToSettle([...satuOrang, p('a6', 'D'), p('a7', 'E')], EMPLOYEE_BATCH)).toHaveLength(7);
    });
  });
});
