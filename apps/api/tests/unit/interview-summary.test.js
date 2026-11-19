// B6 Wawancara akar masalah: langkah ringkasan (docs/designs/b6-wawancara-akar-masalah.md).
const {
  MAX_RESTARTS, stepOf, summaryStateOf, questionLimit, publicSummary, sessionView, parseConfirmation,
} = require('../../src/modules/interviews/summary');
const { aiContext } = require('../../src/modules/interviews/ai-calls');
const P = require('../../src/ai/prompts');
const { createStubProvider } = require('../../src/ai/stub-provider');

const now = new Date('2026-11-20T00:00:00Z');
const future = '2026-11-25T00:00:00Z';
const past = '2026-11-19T00:00:00Z';

describe('langkah dan status ringkasan', () => {
  it('stepOf mengikuti status sesi, undangan, dan ringkasan', () => {
    expect(stepOf({ status: 'scheduled', inviteExpiresAt: future }, now)).toBe('consent');
    expect(stepOf({ status: 'scheduled', inviteExpiresAt: past }, now)).toBe('expired');
    expect(stepOf({ status: 'in_progress' }, now)).toBe('chat');
    expect(stepOf({ status: 'in_progress', summaryAt: past }, now)).toBe('summary');
    expect(stepOf({ status: 'completed', summaryAt: past }, now)).toBe('done');
    expect(stepOf({ status: 'abandoned' }, now)).toBe('closed');
  });

  it('summaryStateOf membedakan sesuai, tidak sesuai, tidak diperiksa, menunggu, dan tidak berlaku', () => {
    expect(summaryStateOf({ status: 'completed', summaryAt: past, summaryConfirmedAt: past, summaryDisputed: false })).toBe('confirmed');
    expect(summaryStateOf({ status: 'completed', summaryAt: past, summaryConfirmedAt: past, summaryDisputed: true })).toBe('disputed');
    expect(summaryStateOf({ status: 'completed', summaryAt: past })).toBe('unchecked'); // ditutup HR atau flag dimatikan
    expect(summaryStateOf({ status: 'completed' })).toBe('unchecked'); // alur tanpa langkah ringkasan
    expect(summaryStateOf({ status: 'in_progress', summaryAt: past })).toBe('pending');
    expect(summaryStateOf({ status: 'in_progress' })).toBe('not_applicable');
    expect(summaryStateOf(null)).toBe('not_applicable');
  });

  it('batas pertanyaan: 15 menit paling banyak 5, selain itu batas konfigurasi', () => {
    expect(questionLimit({ durationMinutes: 15 }, { maxQuestions: 8 })).toBe(5);
    expect(questionLimit({ durationMinutes: 15 }, { maxQuestions: 3 })).toBe(3);
    expect(questionLimit({ durationMinutes: 30 }, { maxQuestions: 8 })).toBe(8);
    expect(questionLimit({ durationMinutes: null }, {})).toBe(8);
  });

  it('ringkasan untuk karyawan memuat rincian tetapi tidak memuat ID kompetensi atau target', () => {
    const out = publicSummary([{ title: 'A', detail: 'bukti', category: 'training', confidence: 0.7, competencyId: 'c', performanceRecordId: 'r' },
      { title: 'B', category: 'non_training', confidence: 'tinggi' }]);
    expect(out).toEqual([{ title: 'A', detail: 'bukti', category: 'training', confidence: 0.7 }, { title: 'B', detail: null, category: 'non_training', confidence: null }]);
    expect(publicSummary(null)).toEqual([]);
  });

  it('sessionView: kolom ringkasan mentah tidak ikut; tambahan hanya untuk orang yang diwawancarai', () => {
    const s = { id: 'abcdef12-0000-4000-8000-000000000000', status: 'in_progress', summaryAt: past, summaryConfirmedAt: null, summaryDisputed: false, restartCount: 1, durationMinutes: 15, inviteExpiresAt: future };
    const other = sessionView(s, { now });
    expect(other).toMatchObject({ id: s.id, step: 'summary', summaryState: 'pending', durationMinutes: 15 });
    for (const k of ['summaryAt', 'summaryConfirmedAt', 'summaryDisputed', 'restartCount', 'answerCount', 'sessionCode']) expect(other).not.toHaveProperty(k);
    const mine = sessionView(s, { interviewee: true, answerCount: 3, aiConfig: { maxQuestions: 8 }, now });
    expect(mine).toMatchObject({ step: 'summary', answerCount: 3, questionLimit: 5, restartCount: 1, restartsLeft: MAX_RESTARTS - 1, summaryAt: past, aiLabel: 'ELGOS-AI', sessionCode: 'ABCDEF12' });
    expect(mine).not.toHaveProperty('summaryDisputed');
  });

  it('konfirmasi: tidak sesuai wajib bercatatan 10-1000 karakter', () => {
    expect(parseConfirmation(undefined)).toEqual({ disputed: false, note: null });
    expect(parseConfirmation({ accurate: true, note: 'diabaikan' })).toEqual({ disputed: false, note: null });
    expect(parseConfirmation({ accurate: false })).toBeNull();
    expect(parseConfirmation({ accurate: false, note: 'pendek' })).toBeNull();
    expect(parseConfirmation({ accurate: false, note: 'x'.repeat(1001) })).toBeNull();
    expect(parseConfirmation({ accurate: 'tidak', note: 'catatan yang cukup panjang' })).toBeNull();
    expect(parseConfirmation({ accurate: false, note: '  Temuan kedua tidak saya katakan.  ' })).toEqual({ disputed: true, note: 'Temuan kedua tidak saya katakan.' });
  });
});

describe('topik fokus kompetensi (A10)', () => {
  const session = { intervieweeId: 'u1', focusKind: 'competency', focusLabel: 'Analisis insiden' };
  const ctx = { competencies: [{ id: 'c1', name: 'Analisis insiden', requiredScore: 3 }], triggers: [], person: { name: 'Dimas Rahasia', email: 'dimas@x.test' } };

  it('konteks AI hanya membawa nama kompetensi fokus, bukan data orang', () => {
    const safe = aiContext(ctx, session);
    expect(safe.focus).toEqual({ kind: 'competency', label: 'Analisis insiden' });
    expect(JSON.stringify(safe)).not.toMatch(/Dimas|dimas@/);
    expect(aiContext(ctx, { intervieweeId: 'u1', focusKind: 'okr', focusLabel: 'Waktu respons' }).focus).toBeNull();
    expect(aiContext(ctx, { intervieweeId: 'u1' }).focus).toBeNull();
  });

  it('prompt wawancara TNA mengganti blok target dengan topik fokus bila tidak ada target meleset', () => {
    const context = aiContext(ctx, session);
    const withFocus = P.interviewSystemPrompt({ submodule: 'tna', context, askedCount: 0, maxQuestions: 5 });
    expect(withFocus).toMatch(/Topik wawancara: gap kompetensi "Analisis insiden"/);
    expect(withFocus).toMatch(/pengalaman kerja terakhir terkait topik/);
    expect(withFocus).not.toMatch(/Mulai dari target yang meleset/);
    expect(withFocus).not.toMatch(/Dimas/);
    const plain = P.interviewSystemPrompt({ submodule: 'tna', context: { ...context, focus: null }, askedCount: 0, maxQuestions: 5 });
    expect(plain).toMatch(/Mulai dari target yang meleset/);
    expect(plain).not.toMatch(/Topik wawancara/);
    // target meleset tetap diutamakan walau ada fokus
    const trig = { id: 't1', metricType: 'sla', name: 'Waktu respons', target: 15, actual: 30, period: '2026-11', direction: 'lower' };
    const both = P.interviewSystemPrompt({ submodule: 'tna', context: { ...context, triggers: [trig] }, askedCount: 0, maxQuestions: 5 });
    expect(both).toMatch(/Mulai dari target yang meleset/);
  });

  it('stub membuka dengan topik fokus lalu satu pertanyaan penutup', async () => {
    const ai = createStubProvider();
    const context = { competencies: [], triggers: [], focus: { kind: 'competency', label: 'Analisis insiden' } };
    expect((await ai.nextQuestion({ submodule: 'tna', askedCount: 0, context })).question).toMatch(/Analisis insiden/);
    expect((await ai.nextQuestion({ submodule: 'tna', askedCount: 1, context })).question).toMatch(/kendala lain/);
    expect((await ai.nextQuestion({ submodule: 'tna', askedCount: 2, context })).question).toBeNull();
  });
});
