// B13 Learning Intervention: aturan murni (status sumber modul, saran sumber, prioritas Pareto, draf pengembangan).
const {
  moduleStatus, recommendedSource, priorityFromPareto, modulePriority, nextRequestStatuses, canRequestTransition, countItems,
} = require('../../src/modules/li/domain');
const { generateDraft, isMeasurable, validateDraft } = require('../../src/modules/li/design');

describe('moduleStatus', () => {
  it('tanpa permintaan, draf, atau course: belum tersedia', () => {
    expect(moduleStatus({})).toEqual({ key: 'none', via: null });
  });
  it('mengikuti alur vendor', () => {
    expect(moduleStatus({ request: { status: 'requested' } })).toEqual({ key: 'requested', via: 'vendor' });
    expect(moduleStatus({ request: { status: 'confirmed' } })).toEqual({ key: 'confirmed', via: 'vendor' });
    expect(moduleStatus({ request: { status: 'delivered' } })).toEqual({ key: 'delivered', via: 'vendor' });
    expect(moduleStatus({ request: { status: 'installed' } })).toEqual({ key: 'available', via: 'vendor' });
  });
  it('permintaan batal dianggap tidak ada', () => {
    expect(moduleStatus({ request: { status: 'cancelled' } })).toEqual({ key: 'none', via: null });
  });
  it('mengikuti alur draf ELGOS', () => {
    expect(moduleStatus({ draft: { status: 'draft' } })).toEqual({ key: 'dev_draft', via: 'elgos' });
    expect(moduleStatus({ draft: { status: 'returned' } })).toEqual({ key: 'dev_draft', via: 'elgos' });
    expect(moduleStatus({ draft: { status: 'sme_review' } })).toEqual({ key: 'dev_review', via: 'elgos' });
    expect(moduleStatus({ draft: { status: 'approved' } })).toEqual({ key: 'dev_approved', via: 'elgos' });
  });
  it('course katalog membuat modul tersedia walau tanpa permintaan', () => {
    expect(moduleStatus({ catalogItemId: 'c-1' })).toEqual({ key: 'available', via: 'catalog' });
    expect(moduleStatus({ catalogItemId: 'c-1', draft: { status: 'draft' } })).toEqual({ key: 'available', via: 'catalog' });
  });
});

describe('alur status permintaan vendor', () => {
  it('maju satu langkah dan tidak mundur', () => {
    expect(nextRequestStatuses('requested')).toEqual(['confirmed', 'cancelled']);
    expect(nextRequestStatuses('confirmed')).toEqual(['delivered', 'cancelled']);
    expect(nextRequestStatuses('delivered')).toEqual(['installed', 'cancelled']);
    expect(nextRequestStatuses('installed')).toEqual([]);
    expect(nextRequestStatuses('cancelled')).toEqual([]);
    expect(canRequestTransition('requested', 'delivered')).toBe(false);
    expect(canRequestTransition('delivered', 'confirmed')).toBe(false);
    expect(canRequestTransition('delivered', 'installed')).toBe(true);
  });
});

describe('recommendedSource', () => {
  it('rumpun spesifik perusahaan dikembangkan sendiri, lainnya vendor', () => {
    expect(recommendedSource({ stream: 'Specific Technical' }, ['Specific Technical'])).toBe('dev');
    expect(recommendedSource({ stream: 'specific technical ' }, ['Specific Technical'])).toBe('dev');
    expect(recommendedSource({ stream: 'Non-Technical' }, ['Specific Technical'])).toBe('vendor');
    expect(recommendedSource({ stream: null }, ['Specific Technical'])).toBe('vendor');
  });
});

describe('prioritas Pareto', () => {
  const rows = [
    { competencyId: 'c1', label: 'RCA', cumulativeShare: 0.4, share: 0.4 },
    { competencyId: 'c2', label: 'IaC', cumulativeShare: 0.75, share: 0.35 },
    { competencyId: 'c3', label: 'Ticket', cumulativeShare: 0.95, share: 0.2 },
    { competencyId: null, label: 'tanpa kompetensi', cumulativeShare: 1, share: 0.05 },
  ];
  it('mengambil baris sampai kumulatif 80%', () => {
    const p = priorityFromPareto(rows);
    expect([...p.keys()]).toEqual(['c1', 'c2']);
    expect(p.get('c2')).toEqual({ rank: 2, share: 0.35, cumulativeShare: 0.75, label: 'IaC' });
  });
  it('peringkat 1 selalu masuk walau melebihi 80%', () => {
    const p = priorityFromPareto([{ competencyId: 'c1', label: 'RCA', cumulativeShare: 0.9, share: 0.9 }, { competencyId: 'c2', cumulativeShare: 1, share: 0.1 }]);
    expect([...p.keys()]).toEqual(['c1']);
  });
  it('kosong bila tidak ada temuan', () => {
    expect(priorityFromPareto([]).size).toBe(0);
  });
  it('modul memakai peringkat terbaik dari kompetensinya', () => {
    const p = priorityFromPareto(rows);
    expect(modulePriority({ competencyIds: ['c2', 'c1'] }, p)).toMatchObject({ rank: 1 });
    expect(modulePriority({ competencyIds: ['c3'] }, p)).toBeNull();
    expect(modulePriority({ competencyIds: [] }, p)).toBeNull();
  });
});

describe('countItems', () => {
  it('menghitung butir per tipe', () => {
    expect(countItems([{ kind: 'K' }, { kind: 'K' }, { kind: 'A' }])).toEqual({ K: 2, S: 0, A: 1 });
  });
});

describe('generateDraft', () => {
  const mod = {
    name: 'Root Cause Analysis',
    items: [
      { id: 'i1', kind: 'K', text: 'Konsep 5 Whys' },
      { id: 'i2', kind: 'S', text: 'Menyusun Post-Incident Report' },
      { id: 'i3', kind: 'A', text: 'Teliti terhadap data' },
    ],
  };
  it('membuat satu tujuan terukur per butir dengan cara asesmennya', () => {
    const d = generateDraft(mod);
    expect(d.objectives).toHaveLength(3);
    expect(d.objectives[0]).toEqual(expect.objectContaining({ kind: 'K', item: 'Konsep 5 Whys', assessment: 'Tes tertulis' }));
    expect(d.objectives[0]).not.toHaveProperty('itemId');
    expect(d.objectives[0].text).toMatch(/menjelaskan "Konsep 5 Whys".*≥ 80%/);
    expect(d.objectives[1].text).toMatch(/mempraktikkan/);
    expect(d.objectives[2].text).toMatch(/menunjukkan/);
    expect(d.objectives.every((o) => isMeasurable(o.text))).toBe(true);
  });
  it('menyusun sesi dari pembuka sampai transfer, hanya untuk tipe yang ada', () => {
    const d = generateDraft(mod);
    expect(d.sessions.map((s) => s.title)).toEqual([
      'Pembuka: relevansi dan tujuan', 'Konsep inti', 'Demonstrasi dan praktik terbimbing', 'Studi kasus dan refleksi perilaku', 'Rangkuman dan transfer ke pekerjaan',
    ]);
    const noA = generateDraft({ ...mod, items: mod.items.slice(0, 2) });
    expect(noA.sessions).toHaveLength(4);
    expect(noA.assessments.map((a) => a.kind)).toEqual(['K', 'S']);
    expect(noA.sessions.map((s) => s.order)).toEqual([1, 2, 3, 4]);
  });
  it('asesmen mencakup semua tujuan per tipe', () => {
    const d = generateDraft(mod);
    expect(d.assessments).toEqual([
      expect.objectContaining({ kind: 'K', objectives: 1 }),
      expect.objectContaining({ kind: 'S', objectives: 1 }),
      expect.objectContaining({ kind: 'A', objectives: 1 }),
    ]);
  });
});

describe('validateDraft', () => {
  const ok = { objectives: [{ kind: 'K', item: 'x', text: 'Peserta mampu menjelaskan x (skor ≥ 80%).', assessment: 'Tes' }], sessions: [{ order: 1, title: 'a', detail: 'b' }], assessments: [{ kind: 'K', detail: 'c' }] };
  it('lolos bila semua tujuan terukur', () => {
    expect(validateDraft(ok)).toBeNull();
  });
  it('menolak tujuan tanpa kriteria ukur, tujuan kosong, dan draf tanpa sesi/asesmen', () => {
    expect(validateDraft({ ...ok, objectives: [{ ...ok.objectives[0], text: 'Peserta paham x' }] })).toMatch(/belum terukur/);
    expect(validateDraft({ ...ok, objectives: [] })).toMatch(/tujuan/i);
    expect(validateDraft({ ...ok, sessions: [] })).toMatch(/sesi/i);
    expect(validateDraft({ ...ok, assessments: [] })).toMatch(/asesmen/i);
  });
  it('isMeasurable butuh angka kriteria', () => {
    expect(isMeasurable('skor ≥ 80%')).toBe(true);
    expect(isMeasurable('memahami dengan baik')).toBe(false);
    expect(isMeasurable('')).toBe(false);
  });
});
