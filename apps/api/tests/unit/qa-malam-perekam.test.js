'use strict';
// B18 QA malam: perekam membungkus penyedia AI (spek 5.3 dan 5.4). Seam: buatPerekam(ai, opsi).
const { buatPerekam, ringkasPanggilan } = require('../qa-malam/perekam');
const { AI_ERRORS } = require('../../src/ai/errors');

const penyedia = (usage = { inputTokens: 100, outputTokens: 20 }) => ({
  name: 'palsu',
  model: 'palsu-1',
  async verify() { return true; },
  async nextQuestion(args) { return { question: `Pertanyaan ke-${args.askedCount + 1}?`, usage: [{ operation: 'next_question', ...usage }] }; },
  async analyzeTna() { return { findings: [{ category: 'training', title: 'x', detail: 'y' }], usage: [{ operation: 'analyze_tna', ...usage }] }; },
});

describe('buatPerekam', () => {
  it('meneruskan panggilan dan merekam operasi, argumen, keluaran, dan token', async () => {
    const ai = buatPerekam(penyedia());
    const r = await ai.nextQuestion({ submodule: 'tna', askedCount: 0, context: { triggers: [{ name: 'FCR' }] } });
    expect(r.question).toBe('Pertanyaan ke-1?');
    expect(ai.name).toBe('palsu');
    expect(ai.rekaman.panggilan).toEqual([expect.objectContaining({
      operasi: 'nextQuestion',
      args: { submodule: 'tna', askedCount: 0, context: { triggers: [{ name: 'FCR' }] } },
      keluaran: { question: 'Pertanyaan ke-1?' },
      inputTokens: 100,
      outputTokens: 20,
    })]);
    expect(ai.rekaman.panggilan[0].latencyMs).toEqual(expect.any(Number));
  });

  it('menolak panggilan baru dengan QA_BATAS_TOKEN setelah total token mencapai batas', async () => {
    const ai = buatPerekam(penyedia({ inputTokens: 600, outputTokens: 0 }), { maksToken: 1000 });
    await ai.nextQuestion({ askedCount: 0, context: {} });
    await ai.nextQuestion({ askedCount: 1, context: {} });
    await expect(ai.analyzeTna({ transcript: [] })).rejects.toMatchObject({ code: 'QA_BATAS_TOKEN' });
    expect(ai.rekaman.panggilan).toHaveLength(2);
  });

  it('galat penyedia diteruskan apa adanya dan panggilan yang gagal tetap tercatat', async () => {
    const p = penyedia();
    p.analyzeTna = async () => { throw Object.assign(new Error('lambat'), { code: 'AI_TIMEOUT' }); };
    const ai = buatPerekam(p);
    await expect(ai.analyzeTna({ transcript: [] })).rejects.toMatchObject({ code: 'AI_TIMEOUT' });
    expect(ai.rekaman.panggilan).toEqual([expect.objectContaining({ operasi: 'analyzeTna', galat: 'AI_TIMEOUT' })]);
  });

  it('operasi AI baru di penyedia (mis. asisten B17) ikut direkam dan dibatasi tanpa mengubah perekam', async () => {
    const p = penyedia({ inputTokens: 700, outputTokens: 0 });
    p.assistantReply = async () => ({ answer: 'Jawaban', usage: [{ operation: 'assistant_reply', inputTokens: 700, outputTokens: 0 }] });
    const ai = buatPerekam(p, { maksToken: 700 });
    await ai.assistantReply({ question: 'x' });
    await expect(ai.assistantReply({ question: 'y' })).rejects.toMatchObject({ code: 'QA_BATAS_TOKEN' });
    expect(ai.rekaman.panggilan).toEqual([expect.objectContaining({ operasi: 'assistantReply', keluaran: { answer: 'Jawaban' } })]);
  });

  it('verify tidak direkam karena tidak memanggil model', async () => {
    const ai = buatPerekam(penyedia());
    await expect(ai.verify()).resolves.toBe(true);
    expect(ai.rekaman.panggilan).toEqual([]);
  });

  it('operasiAi(penyedia) menyebut semua operasi model yang ditawarkan penyedia', () => {
    const { operasiAi } = require('../qa-malam/perekam');
    expect(operasiAi(penyedia()).sort()).toEqual(['analyzeTna', 'nextQuestion']);
  });

  it('panggilan yang gagal tetap menghitung token yang terpakai (AI_BAD_OUTPUT membawa usage dua percobaan)', async () => {
    const ai = buatPerekam({
      name: 'palsu',
      async nextQuestion() { const e = AI_ERRORS.badOutput('pertanyaan'); e.usage = [{ inputTokens: 300, outputTokens: 50 }, { inputTokens: 320, outputTokens: 40 }]; throw e; },
    }, { maksToken: 700 });
    await expect(ai.nextQuestion({})).rejects.toMatchObject({ code: 'AI_BAD_OUTPUT' });
    expect(ai.rekaman.panggilan[0]).toMatchObject({ galat: 'AI_BAD_OUTPUT', inputTokens: 620, outputTokens: 90 });
    await expect(ai.nextQuestion({})).rejects.toMatchObject({ code: 'QA_BATAS_TOKEN' });
  });

  it('batas yang tercapai juga disimpan di rekaman, karena rute API mengubah galatnya menjadi HTTP 500', async () => {
    const ai = buatPerekam(penyedia({ inputTokens: 700, outputTokens: 0 }), { maksToken: 700 });
    await ai.nextQuestion({ askedCount: 0 });
    expect(ai.rekaman.galatBatas).toBeNull();
    await expect(ai.nextQuestion({ askedCount: 1 })).rejects.toBe(ai.rekaman.galatBatas);
    expect(ai.rekaman.galatBatas).toMatchObject({ code: 'QA_BATAS_TOKEN' });
  });

  it('ringkasPanggilan menjumlah token dan menghitung latensi p50/p95 per operasi', () => {
    const p = (operasi, latencyMs, inputTokens = 10, outputTokens = 1) => ({ operasi, latencyMs, inputTokens, outputTokens });
    const r = ringkasPanggilan([p('nextQuestion', 100), p('nextQuestion', 300), p('nextQuestion', 200), p('analyzeTna', 900, 50, 5)]);
    expect(r.token).toEqual({ input: 80, output: 8 });
    expect(r.latensi).toEqual({ nextQuestion: { jumlah: 3, p50: 200, p95: 300 }, analyzeTna: { jumlah: 1, p50: 900, p95: 900 } });
  });
});
