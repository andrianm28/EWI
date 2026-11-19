'use strict';
// B18 QA malam: pelaksana dengan penyedia stub terhadap Postgres test (spek 5.3, bagian 9 butir 2).
// Seam: jalankanQaMalam(opsi) -> laporan. Jalan hanya bila DATABASE_URL di-set dan migrasi sudah dijalankan.
const { createDb } = require('../../src/db');
const { createStubProvider } = require('../../src/ai/stub-provider');
const { AI_ERRORS } = require('../../src/ai/errors');
const { makeConfig } = require('../helpers');
const { jalankanQaMalam } = require('../qa-malam/jalankan');
const { KARYAWAN_LAIN } = require('../alur/data');

const run = process.env.DATABASE_URL ? describe : describe.skip;

const personaUji = (lebih = {}) => ({
  id: 'uji-pelatihan',
  operasi: 'tna',
  karyawan: { nama: 'Sinta Contoh', jabatan: 'Agen Layanan L1' },
  target: [{ kpi: 'First Contact Resolution (%)', target: 80, aktual: 62 }],
  naskah: ['Saya belum paham alur eskalasi tiket ke tim L2.', 'Materi produk baru juga belum pernah saya pelajari.'],
  jawabanCadangan: 'Saya rasa itu saja yang bisa saya ceritakan.',
  harapan: { kategori: ['training'], minTemuan: 1 },
  ...lebih,
});

run('QA malam dengan penyedia stub (Postgres)', () => {
  let db;
  const env = { NODE_ENV: 'test', DATABASE_URL: 'postgres://u@localhost:5432/ewi_test', MAIL_PROVIDER: 'memory' };

  beforeAll(() => { db = createDb({ databaseUrl: process.env.DATABASE_URL, dbSchema: process.env.DB_SCHEMA || 'ewi' }); });
  afterAll(() => db.close());

  const slugTersisa = async (slug) => (await db.query('SELECT count(*)::int AS n FROM tenants WHERE slug LIKE :s',
    { replacements: { s: `${slug}%` }, type: 'SELECT' }))[0].n;

  it('menjalankan wawancara TNA lewat API sungguhan, membuat laporan, dan membersihkan tenant uji', async () => {
    const laporan = await jalankanQaMalam({ db, config: makeConfig(), ai: createStubProvider(), persona: [personaUji()], env });
    expect(laporan.kode).toBe(0);
    expect(laporan.penyedia).toBe('stub');
    const [p] = laporan.persona;
    expect(p).toMatchObject({ id: 'uji-pelatihan', alur: 'selesai', pelanggaran: [], klasifikasi: { dihitung: false, alasan: 'dilewati: penyedia stub' } });
    expect(p.pertanyaan.length).toBeGreaterThan(0);
    expect(p.pertanyaan[0]).toMatch(/First Contact Resolution/);
    expect(p.temuan.length).toBeGreaterThan(0);
    expect(laporan.token).toEqual({ input: 0, output: 0 });
    // Semua panggilan model sesi ini tercatat di ai_usage_logs (spek 5.3 butir 7).
    expect(p.pemakaian.panggilan).toBeGreaterThan(0);
    expect(p.pemakaian.tercatat).toBe(p.pemakaian.panggilan);
    expect(Object.keys(laporan.latensi)).toEqual(expect.arrayContaining(['nextQuestion', 'analyzeTna']));
    expect(await slugTersisa(laporan.slug)).toBe(0);
  });

  it('data karyawan lain yang muncul di keluaran AI membuat kode 1', async () => {
    const bocor = createStubProvider();
    const asli = bocor.nextQuestion;
    bocor.nextQuestion = async (args) => {
      const r = await asli(args);
      return r.question ? { ...r, question: `${r.question} Apakah ${KARYAWAN_LAIN.nama} juga begitu?` } : r;
    };
    const laporan = await jalankanQaMalam({ db, config: makeConfig(), ai: bocor, persona: [personaUji()], env });
    expect(laporan.kode).toBe(1);
    expect(laporan.persona[0].pelanggaran.map((x) => x.kode)).toContain('DATA_LAIN_DI_KELUARAN');
    expect(await slugTersisa(laporan.slug)).toBe(0);
  });

  it('alur ringkasan B6: karyawan membuat ringkasan lalu mengirim ke HR; ringkasan ikut diperiksa', async () => {
    const laporan = await jalankanQaMalam({ db, config: makeConfig(), ai: createStubProvider(), persona: [personaUji({ id: 'uji-ringkasan', alur: 'ringkasan' })], env });
    expect(laporan.kode).toBe(0);
    const [p] = laporan.persona;
    expect(p.pelanggaran).toEqual([]);
    expect(p.alur).toBe('ringkasan');
    expect(p.ringkasan.length).toBeGreaterThan(0);
    expect(p.temuan.length).toBeGreaterThan(0);
  });

  it('ringkasan B6 yang memuat data karyawan lain membuat kode 1', async () => {
    const bocor = createStubProvider();
    const asli = bocor.analyzeTna;
    let ke = 0;
    // Hanya panggilan pertama (ringkasan) yang bocor, supaya terbukti ringkasan ikut diperiksa.
    bocor.analyzeTna = async (args) => {
      const r = await asli(args);
      ke += 1;
      return ke === 1 ? { ...r, findings: r.findings.map((f) => ({ ...f, detail: `${f.detail} Seperti ${KARYAWAN_LAIN.nama}.` })) } : r;
    };
    const laporan = await jalankanQaMalam({ db, config: makeConfig(), ai: bocor, persona: [personaUji({ id: 'uji-ringkasan', alur: 'ringkasan' })], env });
    expect(laporan.kode).toBe(1);
    expect(laporan.persona[0].ringkasan.some((f) => f.detail.includes(KARYAWAN_LAIN.nama))).toBe(true);
    expect(laporan.persona[0].pelanggaran.map((x) => x.kode)).toContain('DATA_LAIN_DI_KELUARAN');
  });

  it('laporan mencatat tautan temuan (BT-23) dan cakupan operasi AI, termasuk yang belum punya persona', async () => {
    const laporan = await jalankanQaMalam({ db, config: makeConfig(), ai: createStubProvider(), persona: [personaUji()], env });
    expect(laporan.persona[0].tautan).toEqual(expect.any(Number));
    expect(laporan.cakupan.operasi).toEqual(expect.objectContaining({ nextQuestion: expect.any(Number), analyzeTna: expect.any(Number) }));
    expect(laporan.cakupan.belumDiuji).toEqual(['assessCompetencies', 'assistantReply']); // assistantReply (B17) belum punya persona QA malam
    expect(laporan.cakupan.alur).toEqual({ selesai: 1 });
  });

  it('batas token yang tercapai di dalam rute API menghentikan run dengan kode 2 dan laporan tetap dibuat', async () => {
    // Batas dilempar perekam di dalam handler Express (menjadi HTTP 500), jadi pelaksana harus membacanya dari perekam.
    const mahal = createStubProvider();
    const asli = mahal.nextQuestion;
    mahal.nextQuestion = async (args) => ({ ...(await asli(args)), usage: [{ inputTokens: 60, outputTokens: 40 }] });
    const laporan = await jalankanQaMalam({ db, config: makeConfig(), ai: mahal, persona: [personaUji(), personaUji({ id: 'uji-kedua' })], env, maksToken: 150 });
    expect(laporan.kode).toBe(2);
    expect(laporan.persona).toHaveLength(1);
    expect(laporan.persona[0].pelanggaran.map((x) => x.kode)).toEqual(['QA_BATAS_TOKEN']);
    expect(await slugTersisa(laporan.slug)).toBe(0);
  });

  it.each([
    ['AI_BAD_OUTPUT (mutu keluaran model)', () => AI_ERRORS.badOutput('pertanyaan'), 1, 'struktur'],
    ['AI_THROTTLED (infrastruktur)', () => AI_ERRORS.throttled(), 2, 'infrastruktur'],
  ])('galat %s di tengah wawancara dicatat per persona menurut kodenya', async (_, galat, kode, jenis) => {
    const rusak = createStubProvider();
    const asli = rusak.nextQuestion;
    let ke = 0;
    rusak.nextQuestion = async (args) => { ke += 1; if (ke === 2) throw galat(); return asli(args); };
    const laporan = await jalankanQaMalam({ db, config: makeConfig(), ai: rusak, persona: [personaUji(), personaUji({ id: 'uji-kedua' })], env });
    expect(laporan.kode).toBe(kode);
    expect(laporan.persona).toHaveLength(2);
    expect(laporan.persona[0].pelanggaran).toEqual([expect.objectContaining({ jenis, kode: 'WAWANCARA_GAGAL', contoh: galat().code })]);
    expect(laporan.persona[1].pelanggaran).toEqual([]);
    expect(await slugTersisa(laporan.slug)).toBe(0);
  });

  it('penyedia bedrock tanpa harga token ditolak QA_KONFIGURASI sebelum panggilan pertama', async () => {
    const palsu = { ...createStubProvider(), name: 'bedrock' };
    let dipanggil = false;
    palsu.nextQuestion = async () => { dipanggil = true; return { question: null, usage: [] }; };
    await expect(jalankanQaMalam({ db, config: makeConfig({ AI_PROVIDER: 'stub' }), ai: palsu, persona: [personaUji()], env }))
      .rejects.toMatchObject({ code: 'QA_KONFIGURASI' });
    expect(dipanggil).toBe(false);
  });

  it('pengaman memeriksa database yang benar-benar tersambung, bukan hanya DATABASE_URL di env', async () => {
    const dbLain = { query: async () => [{ nama: 'ewi' }] };
    await expect(jalankanQaMalam({ db: dbLain, config: makeConfig(), ai: createStubProvider(), persona: [personaUji()], env }))
      .rejects.toMatchObject({ code: 'QA_PENGAMAN', message: expect.stringMatching(/"ewi"/) });
  });

  it.each([
    ['nama database tanpa akhiran _qa atau _test', { DATABASE_URL: 'postgres://u@db:5432/ewi_prod' }],
    ['NODE_ENV bukan test', { NODE_ENV: 'production' }],
    ['EWI_ENV staging', { EWI_ENV: 'staging' }],
    ['MAIL_PROVIDER bukan memory', { MAIL_PROVIDER: 'ses' }],
  ])('pengaman menolak run bila %s', async (_, ubah) => {
    await expect(jalankanQaMalam({ db, config: makeConfig(), ai: createStubProvider(), persona: [personaUji()], env: { ...env, ...ubah } }))
      .rejects.toMatchObject({ code: 'QA_PENGAMAN' });
  });
});
