// Batas keluaran Bedrock tidak boleh memotong JSON pertanyaan Claude asli (gladi 25 Nov: visi & nilai dan LIM gagal di 400/500 token).
const { createBedrockProvider, MAX_TOKENS } = require('../../src/ai/bedrock-provider');

const reply = (text) => ({ output: { message: { content: [{ text }] } }, usage: { inputTokens: 100, outputTokens: 20 }, metrics: { latencyMs: 100 } });
const cfg = { provider: 'bedrock', region: 'ap-southeast-1', modelId: 'anthropic.model-uji', timeoutMs: 5000 };

describe('batas token keluaran Bedrock', () => {
  it.each(['next_question', 'lim_question'])('%s minimal 1200 token', (op) => {
    expect(MAX_TOKENS[op]).toBeGreaterThanOrEqual(1200);
  });

  it('ringkasan tidak lebih kecil dari pertanyaan', () => {
    expect(MAX_TOKENS.summarize_lim).toBeGreaterThanOrEqual(MAX_TOKENS.lim_question);
    expect(MAX_TOKENS.summarize_cca).toBeGreaterThanOrEqual(MAX_TOKENS.next_question);
  });

  it('limQuestion mengirim maxTokens dari tabel ke Converse', async () => {
    const sent = [];
    const client = { async send(cmd) { sent.push(cmd); return reply('{"text":"Apa yang berubah?","options":[]}'); } };
    await createBedrockProvider(cfg, { client }).limQuestion({ competency: null, competencies: [{ id: 'c', name: 'K', definition: null, indicators: [] }], kind: 'apply', position: 1, total: 3, turns: [] });
    expect(sent[0].input.inferenceConfig.maxTokens).toBe(MAX_TOKENS.lim_question);
  });
});
