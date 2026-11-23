// B15 tahap 3: kontrak AI wawancara ulang (Bedrock dengan respons buatan, parser, stub). Spek bagian 12 T-4, T-5.
const { createBedrockProvider } = require('../../src/ai/bedrock-provider');
const { createStubProvider } = require('../../src/ai/stub-provider');
const P = require('../../src/ai/prompts');

const reply = (text) => ({ output: { message: { content: [{ text }] } }, usage: { inputTokens: 200, outputTokens: 40 }, metrics: { latencyMs: 500 } });
function fakeClient(...responses) {
  const sent = [];
  return { sent, async send(cmd) { sent.push(cmd); return JSON.parse(JSON.stringify(responses.shift())); } };
}
const cfg = { provider: 'bedrock', region: 'ap-southeast-1', modelId: 'anthropic.model-uji', timeoutMs: 5000 };
const competencies = [
  { id: 'c-1', name: 'Eskalasi insiden', definition: 'Meneruskan insiden ke tim yang tepat.', indicators: ['Memakai matriks eskalasi'] },
  { id: 'c-2', name: 'Dokumentasi tiket', definition: null, indicators: [] },
];
const turns = [
  { role: 'ai', kind: 'scenario', competencyId: 'c-1', text: 'Server mati jam 2 pagi. Apa langkah Anda?' },
  { role: 'participant', kind: 'scenario', competencyId: 'c-1', text: 'Saya cek matriks lalu telepon on-call.' },
];

describe('AI wawancara ulang LIM', () => {
  it('limQuestion: prompt memuat kompetensi, jenis pertanyaan, posisi; keluaran { text, options<=3 }; operasi lim_question', async () => {
    const client = fakeClient(reply('{"text":"Bagaimana Anda memastikan eskalasi tepat?","options":["A","B","C","D"]}'));
    const out = await createBedrockProvider(cfg, { client }).limQuestion({ competency: competencies[0], kind: 'verify', position: 2, total: 5, turns });
    expect(out.question).toEqual({ text: 'Bagaimana Anda memastikan eskalasi tepat?', options: ['A', 'B', 'C'] });
    expect(out.usage[0]).toMatchObject({ operation: 'lim_question', inputTokens: 200 });
    const system = client.sent[0].input.system[0].text;
    expect(system).toMatch(/Eskalasi insiden\. Meneruskan insiden ke tim yang tepat\. Indikator: Memakai matriks eskalasi/);
    expect(system).toMatch(/pertanyaan 2 dari 5/);
    expect(system).toMatch(/memastikan hasilnya benar/);
    expect(JSON.stringify(client.sent[0].input)).not.toMatch(/c-1/);
  });

  it('limQuestion apply: tanpa kompetensi tunggal, membahas perubahan di pekerjaan', async () => {
    const client = fakeClient(reply('{"text":"Apa yang berubah?","options":[]}'));
    await createBedrockProvider(cfg, { client }).limQuestion({ competency: null, competencies, kind: 'apply', position: 5, total: 5, turns });
    const system = client.sent[0].input.system[0].text;
    expect(system).toMatch(/sudah dibahas: Eskalasi insiden, Dokumentasi tiket\./);
    expect(system).toMatch(/apa yang berubah di pekerjaan/);
  });

  it('summarizeLim: kode K dipetakan ke ID, skor dibulatkan dan dijepit 0-100, alasan maks 200, prompt melarang mengutip', async () => {
    const long = 'x'.repeat(400);
    const client = fakeClient(reply(JSON.stringify({ scores: [{ competency: 'K1', score: 112.4, reason: long }, { competency: 'k2', score: 61.6, reason: 'Sebagian langkah.' }, { competency: 'K9', score: 10, reason: 'asing' }] })));
    const out = await createBedrockProvider(cfg, { client }).summarizeLim({ competencies, turns });
    expect(out.scores).toEqual([
      { competencyId: 'c-1', score: 100, reason: 'x'.repeat(200) },
      { competencyId: 'c-2', score: 62, reason: 'Sebagian langkah.' },
    ]);
    expect(out.usage[0].operation).toBe('summarize_lim');
    const system = client.sent[0].input.system[0].text;
    expect(system).toMatch(/K1: Eskalasi insiden/);
    expect(system).toMatch(/Jangan mengutip jawaban/);
    expect(JSON.stringify(client.sent[0].input)).not.toMatch(/c-1|c-2/);
  });

  it('parseLimScores menolak bila ada kompetensi yang tidak dinilai atau skor bukan angka', () => {
    const codes = [{ code: 'K1', id: 'c-1' }, { code: 'K2', id: 'c-2' }];
    expect(() => P.parseLimScores('{"scores":[{"competency":"K1","score":80,"reason":"ok"}]}', codes)).toThrow();
    expect(() => P.parseLimScores('{"scores":[{"competency":"K1","score":"tinggi","reason":"ok"},{"competency":"K2","score":50,"reason":"ok"}]}', codes)).toThrow();
  });

  it('stub: pertanyaan bawaan per jenis dan skor tetap untuk semua kompetensi', async () => {
    const stub = createStubProvider();
    const q = await stub.limQuestion({ competency: competencies[0], kind: 'scenario', position: 1, total: 3, turns: [] });
    expect(q.question.text).toMatch(/Eskalasi insiden/);
    expect(q.question.options).toHaveLength(3);
    expect(q.usage[0].operation).toBe('lim_question');
    const s = await stub.summarizeLim({ competencies, turns });
    expect(s.scores.map((x) => x.competencyId)).toEqual(['c-1', 'c-2']);
    expect(s.scores.every((x) => Number.isInteger(x.score) && x.reason)).toBe(true);
    expect(s.usage[0].operation).toBe('summarize_lim');
  });
});
