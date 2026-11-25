'use strict';
// B19 bagian 4.4: penyedia suara fake (dev tanpa kunci, test integrasi) dan pabrik penyedia.
const { createVoiceProvider } = require('../../src/voice');

const tick = () => new Promise((r) => setImmediate(r));
function record(s) {
  const ev = [];
  for (const name of ['ready', 'audio', 'inputText', 'outputText', 'turnComplete', 'toolCall', 'usage', 'close']) {
    s.on(name, (p) => ev.push([name, p]));
  }
  return ev;
}
const names = (ev) => ev.map(([n]) => n);

describe('penyedia suara fake (B19)', () => {
  test('naskah: sapaan, tiga jawaban, alat akhiri, penutup', async () => {
    const p = createVoiceProvider({ provider: 'fake', model: 'fake-live', location: 'lokal' });
    expect(p).toMatchObject({ name: 'fake', model: 'fake-live', location: 'lokal' });
    const s = await p.openSession({ systemInstruction: 'x', tools: [] });
    const ev = record(s);
    await tick();
    expect(names(ev)).toEqual(['ready']);
    s.sendText('Mulai wawancara.');
    await tick();
    expect(ev.find(([n]) => n === 'outputText')[1].text).toBe('Halo, terima kasih sudah bersedia. Pertanyaan 1: apa kendala terbesar Anda bulan ini?');
    expect(names(ev).slice(-3)).toEqual(['audio', 'turnComplete', 'usage']);
    ev.length = 0;

    s.endAudio(); // tanpa audio: diabaikan
    await tick();
    expect(ev).toEqual([]);
    s.sendAudio(Buffer.alloc(3200).toString('base64'));
    s.endAudio();
    await tick();
    expect(ev.filter(([n]) => n === 'inputText').map(([, p]) => p.text)).toEqual(['Jawaban suara 1']);
    expect(ev.filter(([n]) => n === 'outputText').map(([, p]) => p.text)).toEqual(['Pertanyaan 2: apa yang sudah Anda coba?']);
    ev.length = 0;

    s.sendAudio(Buffer.alloc(3200).toString('base64'));
    s.endAudio();
    await tick();
    expect(ev.filter(([n]) => n === 'outputText').map(([, p]) => p.text)).toEqual(['Pertanyaan 3: dukungan apa yang Anda butuhkan?']);
    ev.length = 0;

    s.sendAudio(Buffer.alloc(3200).toString('base64'));
    s.endAudio();
    await tick();
    const call = ev.find(([n]) => n === 'toolCall')[1].calls[0];
    expect(call).toMatchObject({ name: 'akhiri_wawancara', args: {} });
    ev.length = 0;
    s.sendToolResponse([{ id: call.id, name: call.name, response: { ok: true } }]);
    await tick();
    expect(ev.filter(([n]) => n === 'outputText').map(([, p]) => p.text)).toEqual(['Terima kasih, wawancara selesai.']);
    expect(names(ev)).toContain('turnComplete');
    s.close();
    await tick();
    expect(ev[ev.length - 1]).toEqual(['close', { code: 1000, reason: '' }]);
  });

  test('penyedia none tidak bisa membuka sesi', async () => {
    const p = createVoiceProvider({ provider: 'none' });
    expect(p.name).toBe('none');
    await expect(p.openSession({})).rejects.toMatchObject({ code: 'VOICE_UNAVAILABLE' });
  });
});
