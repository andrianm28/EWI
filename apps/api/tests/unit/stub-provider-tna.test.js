// C4 demo 25 Nov: AI tiruan untuk wawancara akar masalah gap kompetensi (tanpa target meleset).
const { createStubProvider } = require('../../src/ai/stub-provider');

const ai = createStubProvider();
const comps = [{ id: 'k-ai', name: 'Analisis insiden' }, { id: 'k-sla', name: 'Pemahaman SLA' }];
const said = (...texts) => texts.flatMap((t) => [{ speaker: 'ai', text: 'Pertanyaan?' }, { speaker: 'human', text: t }]);

describe('stub analyzeTna untuk gap kompetensi', () => {
  it('jawaban bernada pengetahuan pada fokus kompetensi menghasilkan temuan training yang terpetakan', async () => {
    const { findings } = await ai.analyzeTna({
      transcript: said('Saat insiden P2 saya langsung eskalasi ke L2, karena belum pernah dilatih teknik 5 Whys.'),
      triggers: [], competencies: comps, focus: { kind: 'competency', label: 'Analisis insiden' },
    });
    expect(findings).toEqual([expect.objectContaining({ category: 'training', competencyId: 'k-ai', title: 'Perlu pelatihan Analisis insiden' })]);
  });

  it('jawaban demo dua penyebab: training dan non-training', async () => {
    const { findings } = await ai.analyzeTna({
      transcript: said('Belum pernah dilatih teknik 5 Whys.', 'SOP eskalasi masih merujuk tim lama dan akses aplikasi monitoring terbatas.'),
      triggers: [], competencies: comps, focus: { kind: 'competency', label: 'Analisis insiden' },
    });
    expect(findings.map((f) => f.category)).toEqual(['training', 'non_training']);
  });

  it('tanpa fokus: kompetensi yang paling banyak disebut dipakai bila ada nada pengetahuan', async () => {
    const { findings } = await ai.analyzeTna({ transcript: said('Saya belum paham pemahaman SLA kontrak baru.'), triggers: [], competencies: comps });
    expect(findings[0]).toMatchObject({ category: 'training', competencyId: 'k-sla' });
  });

  it('tanpa nada pengetahuan dan tanpa kendala: tidak ada temuan (perilaku lama)', async () => {
    const { findings } = await ai.analyzeTna({ transcript: said('Semua berjalan baik.'), triggers: [], competencies: comps, focus: { kind: 'competency', label: 'Analisis insiden' } });
    expect(findings).toEqual([]);
  });

  it('dengan target meleset: perilaku lama tidak berubah (satu temuan training per pemicu)', async () => {
    const { findings } = await ai.analyzeTna({ transcript: said('belum pernah dilatih'), triggers: [{ id: 'p1', name: 'SLA respons' }], competencies: comps });
    expect(findings).toEqual([expect.objectContaining({ category: 'training', title: 'Kesulitan mencapai target SLA respons', performanceRecordId: 'p1' })]);
  });
});
