'use strict';
// B18 QA malam: laporan Markdown (spek 5.4, keluaran qa-malam-<tanggal>.md). Seam: laporanMarkdown(laporan), namaBerkas(tanggal).
const { laporanMarkdown, namaBerkas } = require('../qa-malam/laporan');

const laporan = (lebih = {}) => ({
  kode: 1,
  mulai: '2026-11-24T19:00:00.000Z',
  selesai: '2026-11-24T19:12:00.000Z',
  penyedia: 'bedrock',
  model: 'apac.model-contoh',
  region: 'ap-southeast-1',
  commit: 'abc1234',
  hashPrompt: 'f'.repeat(64),
  klasifikasi: { dihitung: 2, cocok: 1, persen: 50 },
  cakupan: { operasi: { nextQuestion: 9, analyzeTna: 4 }, belumDiuji: ['assessCompetencies'], alur: { selesai: 1, ringkasan: 1 } },
  token: { input: 12000, output: 3400 },
  biayaUsd: 0.0871,
  latensi: { nextQuestion: { jumlah: 9, p50: 1200, p95: 2100 }, analyzeTna: { jumlah: 4, p50: 4000, p95: 5200 } },
  persona: [
    { id: 'pelatihan-murni', alur: 'selesai', pelanggaran: [], klasifikasi: { dihitung: true, cocok: true }, pertanyaan: ['a'], temuan: [{}], tautan: 0 },
    { id: 'nama-rekan', alur: 'ringkasan', pelanggaran: [{ jenis: 'privasi', kode: 'DETAIL_TERLARANG_DI_TEMUAN', pesan: 'Detail yang dilarang persona masuk ke temuan', contoh: ['Joko Fiktif-Rekan'] }],
      klasifikasi: { dihitung: true, cocok: false }, pertanyaan: ['a', 'b'], temuan: [{}, {}], tautan: 0 },
  ],
  ...lebih,
});

describe('laporanMarkdown', () => {
  it('memuat status, identitas run, ringkasan angka, dan baris per persona', () => {
    const md = laporanMarkdown(laporan());
    expect(md).toMatch(/^# QA malam ELGOS 25 Nov 2026/m);
    expect(md).toMatch(/Gagal kualitas \(kode 1\)/);
    expect(md).toMatch(/apac\.model-contoh/);
    expect(md).toMatch(/ap-southeast-1/);
    expect(md).toMatch(/abc1234/);
    expect(md).toMatch(/1 dari 2 persona cocok \(50%\)/);
    expect(md).toMatch(/12000 masuk, 3400 keluar/);
    expect(md).toMatch(/US\$0\.0871/);
    expect(md).toMatch(/\| nama-rekan \| ringkasan \| 1 \| tidak cocok \|/);
    expect(md).toMatch(/\| pelatihan-murni \| selesai \| 0 \| cocok \|/);
  });

  it('menulis rincian pelanggaran dan operasi AI yang belum diuji', () => {
    const md = laporanMarkdown(laporan());
    expect(md).toMatch(/nama-rekan.*DETAIL_TERLARANG_DI_TEMUAN.*Joko Fiktif-Rekan/);
    expect(md).toMatch(/Belum diuji: assessCompetencies/);
  });

  it('biaya tanpa harga dan klasifikasi yang tidak dihitung ditulis terang', () => {
    const md = laporanMarkdown(laporan({ kode: 0, biayaUsd: null, klasifikasi: { dihitung: 0, cocok: 0, persen: null }, persona: [] }));
    expect(md).toMatch(/Lulus \(kode 0\)/);
    expect(md).toMatch(/harga token belum diisi/);
    expect(md).toMatch(/tidak ada persona yang dihitung/);
  });

  it('kode 2 ditulis sebagai gagal infrastruktur', () => {
    expect(laporanMarkdown(laporan({ kode: 2 }))).toMatch(/Gagal infrastruktur atau konfigurasi \(kode 2\)/);
  });
});

describe('namaBerkas', () => {
  it('memakai tanggal WIB, bukan UTC (run 02.00 WIB jatuh di hari berikutnya dalam UTC-nya kemarin)', () => {
    expect(namaBerkas(new Date('2026-11-24T19:00:00.000Z'))).toBe('qa-malam-2026-11-25');
  });
});
