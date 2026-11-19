'use strict';
// B18 QA malam: laporan Markdown (spek 5.4). Format tetap, supaya angka antar malam bisa dibandingkan dan
// ringkasannya bisa ditempel apa adanya ke step summary GitHub Actions.

const WIB = 'Asia/Jakarta';
const STATUS = { 0: 'Lulus', 1: 'Gagal kualitas', 2: 'Gagal infrastruktur atau konfigurasi' };

/** Nama berkas tanpa ekstensi, memakai tanggal WIB (run 02.00 WIB = 19.00 UTC hari sebelumnya). */
function namaBerkas(tanggal = new Date()) {
  return `qa-malam-${tanggal.toLocaleDateString('en-CA', { timeZone: WIB })}`;
}

// Sebagian versi ICU menulis singkatan bulan dengan titik ("Nov."); titiknya dibuang supaya judul tetap.
const tanggalPanjang = (iso) => new Date(iso).toLocaleDateString('id-ID', { timeZone: WIB, day: 'numeric', month: 'short', year: 'numeric' })
  .replace(/\./g, '');
const jam = (iso) => new Date(iso).toLocaleTimeString('id-ID', { timeZone: WIB, hour: '2-digit', minute: '2-digit' });
const sel = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

function teksKlasifikasi(k) {
  if (!k) return '-';
  if (!k.dihitung) return k.alasan ? `tidak dihitung (${k.alasan})` : 'tidak dihitung';
  return k.cocok ? 'cocok' : 'tidak cocok';
}

function laporanMarkdown(l) {
  const baris = [];
  baris.push(`# QA malam ELGOS ${tanggalPanjang(l.mulai)}`, '');
  baris.push(`**${STATUS[l.kode] || 'Tidak diketahui'} (kode ${l.kode})**`, '');
  baris.push(`- Waktu: ${jam(l.mulai)} sampai ${jam(l.selesai)} WIB`);
  baris.push(`- Penyedia: ${l.penyedia}, model ${l.model || '-'}, region ${l.region || '-'}`);
  baris.push(`- Commit: ${l.commit || '-'}; sha256 prompts.js: ${l.hashPrompt ? l.hashPrompt.slice(0, 12) : '-'}`);
  const k = l.klasifikasi || {};
  baris.push(k.dihitung
    ? `- Klasifikasi (dilaporkan saja): ${k.cocok} dari ${k.dihitung} persona cocok (${k.persen}%)`
    : '- Klasifikasi (dilaporkan saja): tidak ada persona yang dihitung');
  baris.push(`- Token: ${l.token.input} masuk, ${l.token.output} keluar`);
  baris.push(`- Biaya: ${l.biayaUsd == null ? 'tidak dihitung, harga token belum diisi' : `US$${l.biayaUsd}`}`);
  const lat = Object.entries(l.latensi || {}).map(([op, v]) => `${op} p50 ${v.p50} ms, p95 ${v.p95} ms (${v.jumlah} panggilan)`);
  baris.push(`- Latensi: ${lat.length ? lat.join('; ') : '-'}`);
  if (l.cakupan) {
    baris.push(`- Belum diuji: ${l.cakupan.belumDiuji.length ? l.cakupan.belumDiuji.join(', ') : 'tidak ada'}`);
  }
  baris.push('');

  if (l.persona.length) {
    baris.push('| Persona | Alur | Pelanggaran | Klasifikasi | Pertanyaan | Temuan | Tautan |', '| --- | --- | --- | --- | --- | --- | --- |');
    for (const p of l.persona) {
      baris.push(`| ${sel(p.id)} | ${p.alur || '-'} | ${p.pelanggaran.length} | ${sel(teksKlasifikasi(p.klasifikasi))} | ${(p.pertanyaan || []).length} | ${(p.temuan || []).length} | ${p.tautan ?? '-'} |`);
    }
    baris.push('');
  }

  const semua = l.persona.flatMap((p) => p.pelanggaran.map((x) => ({ id: p.id, ...x })));
  if (semua.length) {
    baris.push('## Pelanggaran', '');
    for (const x of semua) {
      const contoh = x.contoh === undefined ? '' : `: ${sel([].concat(x.contoh).join('; ')).slice(0, 300)}`;
      baris.push(`- ${x.id}, ${x.jenis}, ${x.kode}. ${sel(x.pesan)}${contoh}`);
    }
    baris.push('');
  }
  return `${baris.join('\n')}\n`;
}

module.exports = { laporanMarkdown, namaBerkas };
