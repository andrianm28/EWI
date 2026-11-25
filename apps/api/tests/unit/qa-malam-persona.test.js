'use strict';
// B18 QA malam: berkas persona (spek 5.2). Seam: validasiPersona(persona, namaBerkas) dan muatPersona(folder).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { validasiPersona, muatPersona, FOLDER_PERSONA } = require('../qa-malam/persona');

const sah = (lebih = {}) => ({
  id: 'pelatihan-murni',
  versi: 1,
  operasi: 'tna',
  deskripsi: 'Kendala murni karena belum dilatih.',
  karyawan: { nama: 'Rina Contoh', jabatan: 'Agen Layanan L1' },
  target: [{ kpi: 'First Contact Resolution (%)', target: 80, aktual: 62 }],
  naskah: ['Saya belum pernah dilatih fitur baru.'],
  jawabanCadangan: 'Saya rasa itu saja.',
  harapan: { kategori: ['training'], minTemuan: 1 },
  ...lebih,
});

describe('validasiPersona', () => {
  it('persona yang lengkap tidak punya galat', () => {
    expect(validasiPersona(sah(), 'pelatihan-murni.json')).toEqual([]);
  });

  it.each([
    ['id tidak sama dengan nama berkas', sah({ id: 'lain' }), /nama berkas/],
    ['target kosong', sah({ target: [] }), /target/],
    ['target tanpa angka', sah({ target: [{ kpi: 'FCR', target: '80', aktual: 62 }] }), /target/],
    ['naskah kosong', sah({ naskah: [] }), /naskah/],
    ['kategori di luar training/non_training', sah({ harapan: { kategori: ['pelatihan'], minTemuan: 1 } }), /kategori/],
    ['harapan tanpa minTemuan', sah({ harapan: { kategori: null } }), /minTemuan/],
    ['alur tidak dikenal', sah({ alur: 'cepat' }), /alur/],
    ['minPertanyaan bukan bilangan bulat positif', sah({ harapan: { kategori: null, minTemuan: 0, minPertanyaan: 0 } }), /minPertanyaan/],
    ['operasi tidak dikenal', sah({ operasi: 'cca' }), /operasi/],
    ['tidakBolehMuncul bukan daftar teks', sah({ tidakBolehMuncul: { temuan: 'x' } }), /tidakBolehMuncul/],
  ])('menolak %s', (_, persona, pola) => {
    const galat = validasiPersona(persona, `${sah().id}.json`);
    expect(galat.join('\n')).toMatch(pola);
  });
});

describe('muatPersona', () => {
  it('folder persona bawaan: dua belas persona TNA yang sah, id unik, urut nama', () => {
    const daftar = muatPersona(FOLDER_PERSONA);
    expect(daftar).toHaveLength(12);
    const ids = daftar.map((p) => p.id);
    expect(new Set(ids).size).toBe(12);
    expect(ids).toEqual([...ids].sort());
    expect(daftar.every((p) => p.operasi === 'tna')).toBe(true);
  });

  it('folder bawaan mencakup alur ringkasan B6 dan persona privasi', () => {
    const daftar = muatPersona(FOLDER_PERSONA);
    expect(daftar.some((p) => p.alur === 'ringkasan')).toBe(true);
    expect(daftar.some((p) => p.harapan.bertautan === true)).toBe(true);
    expect(daftar.filter((p) => p.tidakBolehMuncul).length).toBeGreaterThanOrEqual(3);
    // Persona injeksi: AI harus tetap bertanya setelah jawaban berisi perintah (spek 5.4).
    expect(daftar.find((p) => p.id === 'injeksi-perintah').harapan.minPertanyaan).toBeGreaterThan(2);
  });

  it('data persona fiktif: tidak ada alamat email di naskah', () => {
    for (const p of muatPersona(FOLDER_PERSONA)) expect(p.naskah.join(' ')).not.toMatch(/@/);
  });

  it('berkas rusak ditolak dengan QA_PERSONA dan nama berkasnya', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-'));
    fs.writeFileSync(path.join(dir, 'pelatihan-murni.json'), JSON.stringify(sah()));
    fs.writeFileSync(path.join(dir, 'rusak.json'), '{ bukan json');
    fs.writeFileSync(path.join(dir, 'tanpa-target.json'), JSON.stringify(sah({ id: 'tanpa-target', target: [] })));
    let galat;
    try { muatPersona(dir); } catch (e) { galat = e; }
    expect(galat).toMatchObject({ code: 'QA_PERSONA' });
    expect(galat.message).toMatch(/rusak\.json/);
    expect(galat.message).toMatch(/tanpa-target\.json/);
  });
});
