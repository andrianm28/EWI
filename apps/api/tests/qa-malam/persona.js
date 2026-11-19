'use strict';
// B18 QA malam: memuat dan memeriksa berkas persona (docs/designs/b18-e2e-qa-malam.md bagian 5.2).
// Persona salah ditolak sebelum run dimulai, supaya kegagalan tidak tercampur dengan hasil model.
const fs = require('fs');
const path = require('path');

const FOLDER_PERSONA = path.join(__dirname, 'persona');
const OPERASI = ['tna'];
const ALUR = ['selesai', 'ringkasan']; // selesai = POST .../complete; ringkasan = langkah ringkasan B6 lalu kirim ke HR
const KATEGORI = ['training', 'non_training'];

const teks = (v) => typeof v === 'string' && v.trim().length > 0;
const angka = (v) => typeof v === 'number' && Number.isFinite(v);
const daftarTeks = (v) => Array.isArray(v) && v.every(teks);

/** Mengembalikan daftar galat (kosong bila sah). namaBerkas dipakai untuk mencocokkan id. */
function validasiPersona(p, namaBerkas) {
  const g = [];
  if (!p || typeof p !== 'object' || Array.isArray(p)) return ['isi berkas harus objek JSON'];
  if (!teks(p.id)) g.push('id wajib diisi');
  else if (namaBerkas && `${p.id}.json` !== namaBerkas) g.push(`id "${p.id}" harus sama dengan nama berkas (${namaBerkas})`);
  if (!Number.isInteger(p.versi) || p.versi < 1) g.push('versi harus bilangan bulat >= 1');
  if (!OPERASI.includes(p.operasi)) g.push(`operasi harus salah satu dari ${OPERASI.join(', ')}`);
  if (p.alur !== undefined && !ALUR.includes(p.alur)) g.push(`alur harus salah satu dari ${ALUR.join(', ')}`);
  if (!teks(p.deskripsi)) g.push('deskripsi wajib diisi');
  if (!p.karyawan || !teks(p.karyawan.nama) || !teks(p.karyawan.jabatan)) g.push('karyawan.nama dan karyawan.jabatan wajib diisi');
  if (!Array.isArray(p.target) || !p.target.length || !p.target.every((t) => t && teks(t.kpi) && angka(t.target) && angka(t.aktual))) {
    g.push('target harus daftar { kpi, target, aktual } dengan target dan aktual berupa angka');
  }
  if (!Array.isArray(p.naskah) || !p.naskah.length || !daftarTeks(p.naskah)) g.push('naskah harus daftar jawaban (minimal satu)');
  if (!teks(p.jawabanCadangan)) g.push('jawabanCadangan wajib diisi');
  const h = p.harapan;
  if (!h || typeof h !== 'object') g.push('harapan wajib diisi');
  else {
    if (h.kategori !== null && (!Array.isArray(h.kategori) || !h.kategori.length || !h.kategori.every((k) => KATEGORI.includes(k)))) {
      g.push(`harapan.kategori harus null atau daftar dari ${KATEGORI.join(', ')}`);
    }
    if (!Number.isInteger(h.minTemuan) || h.minTemuan < 0) g.push('harapan.minTemuan harus bilangan bulat >= 0');
    if (h.bertautan !== undefined && typeof h.bertautan !== 'boolean') g.push('harapan.bertautan harus true atau false');
    if (h.minPertanyaan !== undefined && (!Number.isInteger(h.minPertanyaan) || h.minPertanyaan < 1)) g.push('harapan.minPertanyaan harus bilangan bulat >= 1');
  }
  const t = p.tidakBolehMuncul;
  if (t !== undefined && (!t || typeof t !== 'object' || (t.temuan !== undefined && !daftarTeks(t.temuan))
    || (t.keluaran !== undefined && !daftarTeks(t.keluaran)))) {
    g.push('tidakBolehMuncul harus { temuan?: [teks], keluaran?: [teks] }');
  }
  return g;
}

/** Membaca semua *.json di folder, urut nama berkas. Galat dari semua berkas dikumpulkan lalu dilempar sekali. */
function muatPersona(folder = FOLDER_PERSONA) {
  const berkas = fs.readdirSync(folder).filter((f) => f.endsWith('.json')).sort();
  const galat = [];
  const daftar = [];
  for (const f of berkas) {
    let p;
    try { p = JSON.parse(fs.readFileSync(path.join(folder, f), 'utf8')); } catch (e) { galat.push(`${f}: bukan JSON yang sah (${e.message})`); continue; }
    const g = validasiPersona(p, f);
    if (g.length) galat.push(...g.map((x) => `${f}: ${x}`));
    else daftar.push(p);
  }
  if (!berkas.length) galat.push(`tidak ada berkas persona di ${folder}`);
  if (galat.length) throw Object.assign(new Error(`Persona QA malam tidak sah:\n- ${galat.join('\n- ')}`), { code: 'QA_PERSONA' });
  return daftar;
}

module.exports = { validasiPersona, muatPersona, FOLDER_PERSONA };
