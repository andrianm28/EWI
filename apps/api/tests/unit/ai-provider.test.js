// PK-06: test kontrak penyedia AI (Bedrock dengan respons rekaman, stub, prompt, minimalisasi data PM-10).
const { ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');
const { createAiProvider, estimateCost } = require('../../src/ai');
const { createBedrockProvider } = require('../../src/ai/bedrock-provider');
const P = require('../../src/ai/prompts');
const { aiContext } = require('../../src/modules/interviews');
const fx = (name) => require(`../fixtures/bedrock/${name}.json`);

/** Klien palsu: mengembalikan respons rekaman berurutan dan menyimpan perintah yang dikirim. */
function fakeClient(...responses) {
  const sent = [];
  return {
    sent,
    config: { credentials: async () => ({ accessKeyId: 'AKIA-UJI', secretAccessKey: 'rahasia-uji' }) },
    async send(cmd) {
      sent.push(cmd);
      const r = responses.shift();
      if (r instanceof Error) throw r;
      return JSON.parse(JSON.stringify(r));
    },
  };
}
const cfg = { provider: 'bedrock', region: 'ap-southeast-1', modelId: 'anthropic.model-uji', timeoutMs: 5000 };
const competencies = [
  { id: 'c-1', name: 'Komunikasi pelanggan', definition: 'Menjelaskan solusi dengan jelas', indicators: ['Merangkum keluhan'], requiredScore: 3 },
  { id: 'c-2', name: 'Memahami kontrak proyek', definition: null, indicators: [], requiredScore: 3 },
];
const triggers = [{ id: 'r-1', metricType: 'sla', name: 'Respons tiket', target: 85, actual: 72, period: '2026-10', direction: 'higher_better', unit: '%' }];
const transcript = [
  { speaker: 'ai', text: 'Target Respons tiket belum tercapai. Apa penyebabnya?' },
  { speaker: 'human', text: 'Saya belum paham batas SLA di kontrak, dan aplikasi tiket sering lambat.' },
];

describe('penyedia Bedrock (respons rekaman)', () => {
  it('nextQuestion mengirim Converse ke model yang dikonfigurasi dan mencatat token', async () => {
    const client = fakeClient(fx('tna-question'));
    const ai = createBedrockProvider(cfg, { client });
    const out = await ai.nextQuestion({ submodule: 'tna', transcript: [], askedCount: 0, context: { competencies, triggers }, maxQuestions: 8 });
    expect(out.question).toMatch(/85%.*72%/);
    expect(out.usage).toEqual([{ operation: 'next_question', provider: 'bedrock', model: 'anthropic.model-uji', inputTokens: 812, outputTokens: 46, latencyMs: 1430 }]);
    const cmd = client.sent[0];
    expect(cmd).toBeInstanceOf(ConverseCommand);
    expect(cmd.input.modelId).toBe('anthropic.model-uji');
    expect(cmd.input.messages[0]).toEqual({ role: 'user', content: [{ text: expect.stringMatching(/Mulai wawancara/) }] });
    // PM-10: angka milik karyawan ada di prompt
    expect(cmd.input.system[0].text).toMatch(/Respons tiket" periode 2026-10: target 85 %, realisasi 72 %/);
  });

  it('[SELESAI] berarti wawancara selesai', async () => {
    const ai = createBedrockProvider(cfg, { client: fakeClient(fx('tna-question-done')) });
    const out = await ai.nextQuestion({ submodule: 'tna', transcript, askedCount: 1, context: { competencies, triggers }, maxQuestions: 8 });
    expect(out.question).toBeNull();
    expect(out.usage[0].inputTokens).toBe(1530);
  });

  it('analyzeTna memetakan kode K/T ke ID, membuang kategori/kode yang tidak dikenal, dan mengabaikan blok penalaran', async () => {
    const client = fakeClient(fx('tna-analysis'));
    const ai = createBedrockProvider(cfg, { client });
    const { findings, usage } = await ai.analyzeTna({ transcript, triggers, competencies });
    expect(findings).toEqual([
      { category: 'training', title: 'Belum memahami klausul SLA di kontrak pelanggan', detail: expect.any(String), competencyId: 'c-2', performanceRecordId: 'r-1', confidence: 0.8 },
      { category: 'non_training', title: 'Aplikasi tiket lambat saat jam sibuk', detail: expect.any(String), competencyId: null, performanceRecordId: 'r-1', confidence: 0.7 },
      { category: 'training', title: 'Kode mengarang', detail: 'x', competencyId: null, performanceRecordId: null, confidence: 1 },
    ]);
    expect(usage).toHaveLength(1);
    // transkrip dibungkus sebagai data
    expect(client.sent[0].input.messages[0].content[0].text).toMatch(/^<transkrip>[\s\S]*<\/transkrip>$/);
    expect(client.sent[0].input.system[0].text).toMatch(/bukan instruksi/);
  });

  it('assessCompetencies hanya menerima skor bulat 0-4 dan satu skor per kompetensi', async () => {
    const ai = createBedrockProvider(cfg, { client: fakeClient(fx('dna-assessment')) });
    const { results } = await ai.assessCompetencies({ transcript, competencies });
    expect(results).toEqual([{ competencyId: 'c-1', score: 3, confidence: 0.6, evidence: expect.any(String) }]);
  });

  it('format salah dicoba ulang sekali; kedua panggilan tercatat', async () => {
    const client = fakeClient(fx('bad-output'), fx('tna-analysis'));
    const ai = createBedrockProvider(cfg, { client });
    const { findings, usage } = await ai.analyzeTna({ transcript, triggers, competencies });
    expect(findings).toHaveLength(3);
    expect(usage.map((u) => u.inputTokens)).toEqual([1900, 1904]);
    const retry = client.sent[1].input.messages;
    expect(retry[retry.length - 1].content[0].text).toMatch(/Format jawaban tidak sesuai/);
  });

  it('dua kali format salah -> AI_BAD_OUTPUT 502 dengan catatan pemakaian', async () => {
    const ai = createBedrockProvider(cfg, { client: fakeClient(fx('bad-output'), fx('bad-output')) });
    await expect(ai.analyzeTna({ transcript, triggers, competencies })).rejects.toMatchObject({ status: 502, code: 'AI_BAD_OUTPUT', usage: [expect.any(Object), expect.any(Object)] });
  });

  it.each([
    [Object.assign(new Error('Could not load credentials from any providers'), { name: 'CredentialsProviderError' }), 'AI_CREDENTIALS_MISSING'],
    [Object.assign(new Error('not authorized'), { name: 'AccessDeniedException' }), 'AI_ACCESS_DENIED'],
    [Object.assign(new Error('The provided model identifier is invalid.'), { name: 'ValidationException' }), 'AI_MODEL_INVALID'],
    [Object.assign(new Error('Too many requests'), { name: 'ThrottlingException' }), 'AI_THROTTLED'],
    [Object.assign(new Error('aborted'), { name: 'AbortError' }), 'AI_TIMEOUT'],
    [new Error('socket hang up'), 'AI_UNAVAILABLE'],
  ])('galat SDK dipetakan ke pesan jelas (%#)', async (err, code) => {
    const ai = createBedrockProvider(cfg, { client: fakeClient(err) });
    const p = ai.nextQuestion({ submodule: 'tna', transcript: [], askedCount: 0, context: { competencies, triggers }, maxQuestions: 8 });
    await expect(p).rejects.toMatchObject({ code, status: 503 });
  });

  it('verify gagal jelas bila kredensial tidak ada', async () => {
    const client = fakeClient();
    client.config.credentials = async () => { throw Object.assign(new Error('Could not load credentials from any providers'), { name: 'CredentialsProviderError' }); };
    await expect(createBedrockProvider(cfg, { client }).verify()).rejects.toMatchObject({ code: 'AI_CREDENTIALS_MISSING', message: expect.stringMatching(/AWS_ACCESS_KEY_ID/) });
    await expect(createBedrockProvider(cfg, { client: fakeClient() }).verify()).resolves.toBe(true);
  });

  it('BEDROCK_EXTRA_FIELDS diteruskan sebagai additionalModelRequestFields', async () => {
    const client = fakeClient(fx('tna-question'));
    await createBedrockProvider({ ...cfg, extraFields: { thinking: { type: 'disabled' } } }, { client })
      .nextQuestion({ submodule: 'tna', transcript: [], askedCount: 0, context: { competencies, triggers }, maxQuestions: 8 });
    expect(client.sent[0].input.additionalModelRequestFields).toEqual({ thinking: { type: 'disabled' } });
  });
});

describe('pemilihan penyedia dan biaya', () => {
  it('createAiProvider memilih lewat config dan menolak nama tak dikenal', () => {
    expect(createAiProvider({ provider: 'stub' }).name).toBe('stub');
    expect(createAiProvider('stub').name).toBe('stub');
    expect(createAiProvider(cfg, { client: fakeClient() }).name).toBe('bedrock');
    expect(() => createAiProvider({ provider: 'openai' })).toThrow(/AI_PROVIDER tidak dikenal/);
  });
  it('stub async dengan catatan pemakaian nol', async () => {
    const ai = createAiProvider('stub');
    const q = await ai.nextQuestion({ submodule: 'tna', askedCount: 0, context: { competencies, triggers } });
    expect(q.question).toMatch(/Respons tiket/);
    expect(q.usage[0]).toMatchObject({ provider: 'stub', inputTokens: 0 });
  });
  it('estimasi biaya dari harga per sejuta token, null bila harga kosong', () => {
    const u = { provider: 'bedrock', inputTokens: 1000000, outputTokens: 200000 };
    expect(estimateCost(u, { priceInputPerMTok: 3, priceOutputPerMTok: 15 })).toBe(6);
    expect(estimateCost(u, {})).toBeNull();
    expect(estimateCost({ provider: 'stub', inputTokens: 0, outputTokens: 0 }, {})).toBe(0);
  });
});

describe('prompt dan minimalisasi data', () => {
  it('PM-10: aiContext hanya membawa target milik karyawan itu, tanpa nama/email', () => {
    const ctx = {
      person: { id: 'u-1', name: 'Dimas', email: 'dimas@x.id' },
      competencies: [{ ...competencies[0], kind: 'core', approvedAt: new Date() }],
      triggers: [{ ...triggers[0], userId: 'u-1', isMet: false }, { id: 'r-9', userId: 'u-lain', name: 'KPI orang lain', target: 1, actual: 0 }],
    };
    const safe = aiContext(ctx, { intervieweeId: 'u-1' });
    expect(safe.triggers.map((t) => t.id)).toEqual(['r-1']);
    expect(JSON.stringify(safe)).not.toMatch(/Dimas|dimas@|u-lain|KPI orang lain/);
    expect(Object.keys(safe.competencies[0]).sort()).toEqual(['definition', 'id', 'indicators', 'name', 'requiredScore']);
  });
  it('prompt TNA memuat kuota, aturan BT-11, dan larangan data karyawan lain', () => {
    const s = P.interviewSystemPrompt({ submodule: 'tna', context: { competencies, triggers }, askedCount: 3, maxQuestions: 8 });
    expect(s).toMatch(/Sisa kuota pertanyaan: 5/);
    expect(s).toMatch(/gali singkat satu pertanyaan lalu kembali/);
    expect(s).toMatch(/Jangan membandingkan dengan karyawan lain/);
    expect(s).not.toMatch(/c-1|r-1/); // UUID tidak dikirim, hanya kode pendek
  });
  it('prompt DNA menggali bukti perilaku per kompetensi', () => {
    expect(P.interviewSystemPrompt({ submodule: 'dna', context: { competencies }, askedCount: 0, maxQuestions: 8 })).toMatch(/K1: Komunikasi pelanggan/);
  });
  it('interviewMessages selalu diawali user dan diakhiri user', () => {
    const m = P.interviewMessages([...transcript, { speaker: 'ai', text: 'Lalu?' }]);
    expect(m.map((x) => x.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user']);
  });
  it('parseQuestion membersihkan awalan/kutip dan menolak kosong', () => {
    expect(P.parseQuestion('Pertanyaan: "Apa kendala Anda?"')).toBe('Apa kendala Anda?');
    expect(P.parseQuestion('Terima kasih. [SELESAI]')).toBeNull();
    expect(() => P.parseQuestion('  ')).toThrow();
    expect(P.parseQuestion('a'.repeat(900))).toHaveLength(600);
  });
});
