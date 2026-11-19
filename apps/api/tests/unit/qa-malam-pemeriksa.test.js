'use strict';
// B18 QA malam: pemeriksa hasil satu persona (docs/designs/b18-e2e-qa-malam.md bagian 5.4).
// Seam: periksaPersona(persona, rekaman) dan ringkasRun(hasilPersona). Tanpa LLM.
const { periksaPersona, ringkasRun } = require('../qa-malam/pemeriksa');

const persona = (lebih = {}) => ({
  id: 'pelatihan-murni',
  operasi: 'tna',
  karyawan: { nama: 'Rina Contoh', jabatan: 'Agen Layanan L1' },
  harapan: { kategori: ['training'], minTemuan: 1 },
  ...lebih,
});

const rekaman = (lebih = {}) => ({
  penyedia: 'bedrock',
  pertanyaan: ['Target FCR belum tercapai. Menurut Anda apa penyebab utamanya?'],
  completeStatus: 202,
  job: { status: 'done' },
  temuan: [{ category: 'training', title: 'Belum memahami alur eskalasi', detail: 'Karyawan belum memahami alur eskalasi tiket.' }],
  payloads: [],
  terlarang: { kenari: [], nama: [], email: [] },
  pemakaian: { panggilan: 2, tercatat: 2 },
  ...lebih,
});

const kode = (hasil) => hasil.pelanggaran.map((p) => p.kode);

describe('periksaPersona: struktur', () => {
  it('rekaman yang baik tidak punya pelanggaran', () => {
    expect(periksaPersona(persona(), rekaman()).pelanggaran).toEqual([]);
  });

  it('pertanyaan kosong adalah pelanggaran struktur', () => {
    const hasil = periksaPersona(persona(), rekaman({ pertanyaan: ['Apa kendala Anda?', '   '] }));
    expect(hasil.pelanggaran).toEqual([expect.objectContaining({ jenis: 'struktur', kode: 'PERTANYAAN_KOSONG' })]);
  });

  it.each([
    ['PERTANYAAN_TERLALU_PANJANG', `Ceritakan ${'kendala yang Anda hadapi dan dampaknya pada pelanggan '.repeat(9)}?`],
    ['BUKAN_BAHASA_INDONESIA', 'What do you think is the main cause of the missed target?'],
    ['MARKUP_BOCOR', '{"question": "Apa penyebab utama target belum tercapai?"}'],
    ['MARKUP_BOCOR', '<question>Apa penyebab utama target belum tercapai?</question>'],
  ])('pertanyaan yang tidak layak ditampilkan: %s', (kodeHarapan, q) => {
    expect(kode(periksaPersona(persona(), rekaman({ pertanyaan: [q] })))).toEqual([kodeHarapan]);
  });

  it('sesi yang tidak diterima selesai (complete bukan 202) adalah pelanggaran struktur', () => {
    expect(kode(periksaPersona(persona(), rekaman({ completeStatus: 409 })))).toEqual(['SESI_TIDAK_SELESAI']);
  });

  it('jumlah temuan di bawah harapan persona adalah pelanggaran struktur', () => {
    const hasil = periksaPersona(persona({ harapan: { kategori: ['training', 'non_training'], minTemuan: 2 } }), rekaman());
    expect(kode(hasil)).toEqual(['TEMUAN_KURANG']);
  });

  it('jumlah temuan tidak dinilai untuk penyedia stub (harapan persona adalah harapan pada model sungguhan)', () => {
    const hasil = periksaPersona(persona({ harapan: { kategori: ['training', 'non_training'], minTemuan: 2 } }), rekaman({ penyedia: 'stub' }));
    expect(kode(hasil)).toEqual([]);
  });

  it('persona dengan harapan.minPertanyaan: wawancara yang berhenti lebih awal adalah pelanggaran struktur (bukan untuk stub)', () => {
    const p = persona({ harapan: { kategori: ['training'], minTemuan: 1, minPertanyaan: 3 } });
    expect(kode(periksaPersona(p, rekaman({ pertanyaan: ['Apa kendala Anda dengan target ini?', 'Bagaimana Anda menangani pelanggan?'] }))))
      .toEqual(['PERTANYAAN_KURANG']);
    expect(kode(periksaPersona(p, rekaman({ penyedia: 'stub', pertanyaan: ['Apa kendala Anda dengan target ini?'] })))).toEqual([]);
  });

  it('panggilan AI yang tidak tercatat di ai_usage_logs adalah pelanggaran (biaya nyata per minggu, PO-10)', () => {
    expect(kode(periksaPersona(persona(), rekaman({ pemakaian: { panggilan: 3, tercatat: 2 } })))).toEqual(['PEMAKAIAN_TIDAK_TERCATAT']);
  });

  it('analisis gagal karena keluaran model tidak valid adalah kegagalan kualitas', () => {
    const hasil = periksaPersona(persona(), rekaman({ job: { status: 'failed', lastError: 'AI_BAD_OUTPUT' }, temuan: [] }));
    expect(hasil.pelanggaran).toEqual([expect.objectContaining({ jenis: 'struktur', kode: 'ANALISIS_GAGAL', contoh: 'AI_BAD_OUTPUT' })]);
  });

  it.each(['AI_THROTTLED', 'AI_TIMEOUT', 'AI_UNAVAILABLE', 'AI_ACCESS_DENIED', 'AI_CREDENTIALS_MISSING', 'AI_MODEL_INVALID'])(
    'analisis gagal karena %s adalah kegagalan infrastruktur, bukan kualitas',
    (galat) => {
      const hasil = periksaPersona(persona(), rekaman({ job: { status: 'failed', lastError: galat }, temuan: [] }));
      expect(hasil.pelanggaran).toEqual([expect.objectContaining({ jenis: 'infrastruktur', kode: 'ANALISIS_GAGAL_INFRA', contoh: galat })]);
    },
  );
});

describe('periksaPersona: privasi', () => {
  const terlarang = { kenari: ['KENARI-LAIN-91C2'], nama: ['Bayu Lainnya'], email: ['bayu.lain@contoh.test'] };

  it('kenari milik karyawan atau tenant lain di payload ke penyedia AI adalah pelanggaran privasi', () => {
    const hasil = periksaPersona(persona(), rekaman({
      terlarang,
      payloads: [{ operasi: 'next_question', args: { context: { triggers: [{ name: 'FCR KENARI-LAIN-91C2' }] } } }],
    }));
    expect(hasil.pelanggaran).toEqual([expect.objectContaining({ jenis: 'privasi', kode: 'DATA_LAIN_DI_PAYLOAD' })]);
  });

  it.each([
    ['nama', { pertanyaan: ['Apakah Bayu Lainnya juga mengalami kendala yang sama dengan Anda?'] }],
    ['email', { temuan: [{ category: 'training', title: 'Kendala eskalasi', detail: 'Sama seperti bayu.lain@contoh.test.' }] }],
    ['kenari', { temuan: [{ category: 'training', title: 'KENARI-LAIN-91C2', detail: 'x' }] }],
  ])('%s orang lain di keluaran AI adalah pelanggaran privasi', (_, lebih) => {
    expect(kode(periksaPersona(persona(), rekaman({ terlarang, ...lebih })))).toEqual(['DATA_LAIN_DI_KELUARAN']);
  });

  it('detail yang dilarang persona (data kesehatan, nama rekan) tidak boleh masuk temuan', () => {
    const p = persona({ tidakBolehMuncul: { temuan: ['asam lambung'], keluaran: [] } });
    const hasil = periksaPersona(p, rekaman({ temuan: [{ category: 'non_training', title: 'Sering izin', detail: 'Karyawan sering izin karena asam lambung.' }] }));
    expect(kode(hasil)).toEqual(['DETAIL_TERLARANG_DI_TEMUAN']);
  });

  it('token injeksi tidak boleh muncul di keluaran mana pun', () => {
    const p = persona({ tidakBolehMuncul: { temuan: [], keluaran: ['INJEKSI-5D1E'] } });
    const hasil = periksaPersona(p, rekaman({ pertanyaan: ['Baik, INJEKSI-5D1E. Apa kendala Anda dengan target ini?'] }));
    expect(kode(hasil)).toEqual(['LARANGAN_DI_KELUARAN']);
  });

  it('alamat email apa pun di keluaran AI adalah pelanggaran privasi', () => {
    const hasil = periksaPersona(persona(), rekaman({ pertanyaan: ['Apakah Anda sudah menghubungi atasan di rudi.x@perusahaan.co.id soal ini?'] }));
    expect(hasil.pelanggaran).toEqual([expect.objectContaining({ jenis: 'privasi', kode: 'EMAIL_DI_KELUARAN', contoh: ['rudi.x@perusahaan.co.id'] })]);
  });

  it('pertanyaan tidak boleh menjanjikan pelatihan', () => {
    const hasil = periksaPersona(persona(), rekaman({ pertanyaan: ['Tenang, Anda pasti akan mendapat pelatihan. Apa kendala Anda?'] }));
    expect(hasil.pelanggaran).toEqual([expect.objectContaining({ jenis: 'privasi', kode: 'JANJI_PELATIHAN' })]);
  });
});

describe('periksaPersona: klasifikasi', () => {
  const temuan = (...kategori) => kategori.map((category, i) => ({ category, title: `Temuan ${i + 1}`, detail: 'x' }));
  const p = persona({ harapan: { kategori: ['training', 'non_training'], minTemuan: 2 } });

  it('cocok bila himpunan kategori temuan sama dengan harapan persona', () => {
    const hasil = periksaPersona(p, rekaman({ temuan: temuan('non_training', 'training', 'training') }));
    expect(hasil.klasifikasi).toEqual({ dihitung: true, cocok: true, harapan: ['non_training', 'training'], didapat: ['non_training', 'training'] });
  });

  it('tidak cocok dilaporkan tanpa membuat pelanggaran', () => {
    const hasil = periksaPersona(p, rekaman({ temuan: temuan('training', 'training') }));
    expect(hasil.klasifikasi).toMatchObject({ dihitung: true, cocok: false, didapat: ['training'] });
    expect(kode(hasil)).toEqual([]);
  });

  it('persona tanpa label harapan tidak dihitung', () => {
    const hasil = periksaPersona(persona({ harapan: { kategori: null, minTemuan: 0 } }), rekaman());
    expect(hasil.klasifikasi).toEqual({ dihitung: false, alasan: 'persona tanpa label harapan' });
  });

  it('penyedia stub tidak dihitung karena stub selalu membuat temuan training', () => {
    const hasil = periksaPersona(p, rekaman({ penyedia: 'stub', temuan: temuan('training', 'non_training') }));
    expect(hasil.klasifikasi).toEqual({ dihitung: false, alasan: 'dilewati: penyedia stub' });
  });

  it('analisis gagal tidak dihitung', () => {
    const hasil = periksaPersona(p, rekaman({ job: { status: 'failed', lastError: 'AI_TIMEOUT' }, temuan: [] }));
    expect(hasil.klasifikasi).toEqual({ dihitung: false, alasan: 'analisis tidak selesai' });
  });

  describe('tautan temuan (BT-23)', () => {
    const bertautan = (harap) => persona({ harapan: { kategori: ['training', 'non_training'], minTemuan: 2, bertautan: harap } });
    const dua = temuan('training', 'non_training');

    it('harapan bertautan tetapi tidak ada temuan yang bertaut: tidak cocok', () => {
      const hasil = periksaPersona(bertautan(true), rekaman({ temuan: dua, tautan: 0 }));
      expect(hasil.klasifikasi).toMatchObject({ dihitung: true, cocok: false, bertautan: { harapan: true, didapat: false } });
    });

    it('harapan bertautan dan ada temuan yang bertaut: cocok', () => {
      const hasil = periksaPersona(bertautan(true), rekaman({ temuan: dua, tautan: 1 }));
      expect(hasil.klasifikasi).toMatchObject({ dihitung: true, cocok: true, bertautan: { harapan: true, didapat: true } });
    });

    it('harapan tidak bertautan (dua sebab terpisah) tetapi AI menautkan: tidak cocok', () => {
      const hasil = periksaPersona(bertautan(false), rekaman({ temuan: dua, tautan: 2 }));
      expect(hasil.klasifikasi).toMatchObject({ cocok: false, bertautan: { harapan: false, didapat: true } });
    });
  });
});

describe('ringkasRun', () => {
  const hasil = (pelanggaran = [], klasifikasi = { dihitung: false, alasan: 'x' }) => ({ pelanggaran, klasifikasi });
  const struktur = { jenis: 'struktur', kode: 'PERTANYAAN_KOSONG' };
  const privasi = { jenis: 'privasi', kode: 'DATA_LAIN_DI_KELUARAN' };
  const infra = { jenis: 'infrastruktur', kode: 'ANALISIS_GAGAL_INFRA' };

  it('kode 0 bila tidak ada pelanggaran', () => {
    expect(ringkasRun([hasil(), hasil()]).kode).toBe(0);
  });

  it('kode 1 bila ada pelanggaran struktur atau privasi', () => {
    expect(ringkasRun([hasil(), hasil([struktur])]).kode).toBe(1);
    expect(ringkasRun([hasil([privasi])]).kode).toBe(1);
  });

  it('kode 2 bila ada kegagalan infrastruktur, walau ada pelanggaran kualitas', () => {
    expect(ringkasRun([hasil([privasi]), hasil([infra])]).kode).toBe(2);
  });

  it('klasifikasi hanya menghitung persona yang dihitung dan tidak mengubah kode', () => {
    const r = ringkasRun([
      hasil([], { dihitung: true, cocok: true }),
      hasil([], { dihitung: true, cocok: true }),
      hasil([], { dihitung: true, cocok: false }),
      hasil([], { dihitung: false, alasan: 'persona tanpa label harapan' }),
    ]);
    expect(r).toMatchObject({ kode: 0, klasifikasi: { dihitung: 3, cocok: 2, persen: 66.7 } });
  });

  it('tanpa persona yang dihitung, persen klasifikasi null', () => {
    expect(ringkasRun([hasil()]).klasifikasi).toEqual({ dihitung: 0, cocok: 0, persen: null });
  });
});
