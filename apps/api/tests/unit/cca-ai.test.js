// B10 tahap 2: kontrak AI wawancara Core Competencies (Bedrock dengan respons buatan, prompt, parser, stub).
const { createBedrockProvider } = require('../../src/ai/bedrock-provider');
const { createStubProvider } = require('../../src/ai/stub-provider');
const P = require('../../src/ai/prompts');

const reply = (text, inputTokens = 300, outputTokens = 60) => ({ output: { message: { content: [{ text }] } }, usage: { inputTokens, outputTokens }, metrics: { latencyMs: 900 } });
function fakeClient(...responses) {
  const sent = [];
  return { sent, async send(cmd) { sent.push(cmd); return JSON.parse(JSON.stringify(responses.shift())); } };
}
const cfg = { provider: 'bedrock', region: 'ap-southeast-1', modelId: 'anthropic.model-uji', timeoutMs: 5000 };
const sources = { vision: { title: 'Corporate Vision', text: 'Mitra transformasi digital.' }, mission: null, values: ['Credible', 'Competent'] };
const requirements = [{ id: 'r-1', name: 'Kolaborasi lintas tim', sourceTitle: 'Corporate Vision' }, { id: 'r-2', name: 'Integritas data', sourceTitle: 'Credible' }];
const turns = [
  { role: 'ai', theme: 'vision', text: 'Apa arti visi bagi unit Anda?' }, { role: 'participant', theme: 'vision', text: 'Kami berkolaborasi.' },
  { role: 'ai', theme: 'mission', text: 'Misi?' }, { role: 'participant', theme: 'mission', text: 'Pelanggan.' },
  { role: 'ai', theme: 'values', text: 'Nilai?' }, { role: 'participant', theme: 'values', text: 'Credible.' },
  { role: 'ai', theme: 'behavior', text: 'Perilaku?' }, { role: 'participant', theme: 'behavior', text: 'Memberi contoh.' },
];

describe('AI wawancara Core Competencies', () => {
  it('ccaQuestion: prompt memuat sumber organisasi dan tema, keluaran { text, options<=3 }, dicatat sebagai next_question', async () => {
    const client = fakeClient(reply('```json\n{"text":"Apa arti visi bagi tim Anda?","options":["A","B","C","D"]}\n```'));
    const out = await createBedrockProvider(cfg, { client }).ccaQuestion({ tier: 'leader', theme: 'vision', position: 1, sources, turns: [] });
    expect(out.question).toEqual({ text: 'Apa arti visi bagi tim Anda?', options: ['A', 'B', 'C'] });
    expect(out.usage[0]).toMatchObject({ operation: 'next_question', inputTokens: 300 });
    const system = client.sent[0].input.system[0].text;
    expect(system).toMatch(/Corporate Vision\. Mitra transformasi digital\./);
    expect(system).toMatch(/Misi: \(belum diisi\)/);
    expect(system).toMatch(/Nilai: Credible, Competent/);
    expect(system).toMatch(/pertanyaan 1 dari 4.*pemahaman visi/);
    expect(system).toMatch(/bukan penilaian kinerja/);
  });

  it('parseCcaQuestion menolak pertanyaan kosong', () => {
    expect(() => P.parseCcaQuestion('{"text":"  ","options":[]}')).toThrow();
    expect(P.parseCcaQuestion('{"text":"Tanya?"}')).toEqual({ text: 'Tanya?', options: [] });
  });

  it('summarizeCca: kode P dipetakan ke ID, sikap tier lain dan kode asing dibuang, yang tidak dijawab not_covered', async () => {
    const raw = JSON.stringify({
      themes: [{ theme: 'vision', summary: 'Kolaborasi dijalankan.' }, { theme: 'behavior', summary: 'Memberi contoh.' }, { theme: 'asing', summary: 'x' }],
      stances: [{ persyaratan: 'P1', sikap: 'agree' }, { persyaratan: 'P9', sikap: 'agree' }, { persyaratan: 'P2', sikap: 'aligned' }],
    });
    const client = fakeClient(reply(raw));
    const out = await createBedrockProvider(cfg, { client }).summarizeCca({ tier: 'leader', turns, requirements });
    expect(out.themes).toEqual([
      { theme: 'vision', question: 'Apa arti visi bagi unit Anda?', answer: 'Kolaborasi dijalankan.' },
      { theme: 'mission', question: 'Misi?', answer: null },
      { theme: 'values', question: 'Nilai?', answer: null },
      { theme: 'behavior', question: 'Perilaku?', answer: 'Memberi contoh.' },
    ]);
    expect(out.stances).toEqual([{ requirementId: 'r-1', stance: 'agree' }, { requirementId: 'r-2', stance: 'not_covered' }]);
    expect(out.usage[0].operation).toBe('summarize_cca');
    const { system } = client.sent[0].input;
    expect(system[0].text).toMatch(/P1: Kolaborasi lintas tim \(sumber: Corporate Vision\)/);
    expect(system[0].text).toMatch(/agree, partial, disagree/);
    expect(JSON.stringify(client.sent[0].input)).not.toMatch(/r-1|r-2/);
  });

  it('ringkasan tanpa satu tema pun dianggap format salah', () => {
    expect(() => P.parseCcaSummary('{"themes":[],"stances":[]}', { tier: 'employee', turns, codes: [] })).toThrow();
  });

  it('pertanyaan bawaan per tier memakai sumber atau kata umum bila kosong', () => {
    expect(P.CCA_THEMES).toEqual({ leader: ['vision', 'mission', 'values', 'behavior'], employee: ['vision', 'mission', 'values', 'support'] });
    expect(P.ccaDefaultQuestion('employee', 'mission', {}).text).toMatch(/misi perusahaan/);
    expect(P.ccaDefaultQuestion('leader', 'values', sources).text).toMatch(/Credible, Competent/);
    for (const tier of ['leader', 'employee']) {
      for (const theme of P.CCA_THEMES[tier]) expect(P.ccaDefaultQuestion(tier, theme, sources).options.length).toBeLessThanOrEqual(3);
    }
  });

  it('stub: sikap penuh bila nama persyaratan disebut, partial bila nama sumbernya disebut', async () => {
    const out = await createStubProvider().summarizeCca({
      tier: 'employee',
      turns: [{ role: 'ai', theme: 'vision', text: 'Q' }, { role: 'participant', theme: 'vision', text: 'Saya menjaga kolaborasi dan nilai credible.' }],
      requirements: [...requirements, { id: 'r-3', name: 'Fokus pelanggan', sourceTitle: 'Corporate Mission' }],
    });
    expect(out.stances).toEqual([{ requirementId: 'r-1', stance: 'aligned' }, { requirementId: 'r-2', stance: 'partial' }, { requirementId: 'r-3', stance: 'not_covered' }]);
    expect(out.usage[0]).toMatchObject({ operation: 'summarize_cca', provider: 'stub' });
  });
});
