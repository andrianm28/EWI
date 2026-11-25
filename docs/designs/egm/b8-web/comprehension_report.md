# Comprehension review (egm:egm-comprehension) · b8-karyawan.md "Layar web"

Disalin dari laporan subagent (agen read-only, tidak bisa menulis berkas). 20 temuan: 1 tinggi, 10 sedang, 9 rendah. Pembaca bisa memparafrasekan semua subbagian.

1. TINGGI · Tarik persetujuan kurang spesifik: kapan tombol tampil, bentuk konfirmasi, umpan balik sukses, galat; API idempoten (200) tetapi UI tidak bilang "sudah ditarik"; janji "sampai HR menghapus" merujuk aksi HR tanpa UI.
2. SEDANG · Minta hapus: "apa adanya" ambigu (pesan/kode); setelah 201 apa; tombol saat sudah ada `delete_data` terbuka; label jenis dan format tanggal daftar permintaan; baris `withdraw_consent` terbuka tampil atau tidak; daftar kosong.
3. SEDANG · `delivery` (halaman) vs `where` (kartu) tidak dibedakan; label tombol memakai yang mana.
4. SEDANG · Teks pengantar mockup "EliteMentor langsung membantu Anda belajar" janggal bila diganti nama LMS; sama untuk catatan bawah.
5. SEDANG · Teks undangan hanya sebagian dikutip (kalimat "1 wawancara ±10 menit" dibuang atau tidak); `inviteExpiresAt` null; `consentVersionRequired`.
6. SEDANG · Keadaan galat dan memuat tidak ada; `person` bisa null.
7. SEDANG · Asimetri gerbang rute vs butir menu (`menu.ts` tanpa flag/submodul) tidak dijelaskan.
8. SEDANG · B0 §5.3 aturan 6: rute `dna`/`tna` lima tampilan dipersempit di PR beranda `my` — tidak dibahas.
9. SEDANG · Janji "memperbarui helper login e2e" tidak dijelaskan.
10. SEDANG · Klaim B6 menampilkan transkrip untuk sesi `completed` dan `abandoned` yang ditarik belum dibuktikan.
11. SEDANG · Kalimat sebab di awal terbaca seperti bug padahal perilaku sesuai rancangan.
12. RENDAH · Asal label "Karyawan (saya)" (AppTopBar.vue:27–30).
13. RENDAH · Efek B2 switch-role saat memilih "Karyawan (saya)".
14. RENDAH · Singkatan tanpa definisi: Beranda lama, butir peralihan, K2, B18, thread.
15. RENDAH · Premis catatan `full_suite` (li = MODUL 2) tidak disebut.
16. RENDAH · `UiStatus`, `raw`, `routeOpen(name, view)`, format `<tanggal>`.
17. RENDAH · Akibat antrean HR di luar cakupan tidak ditarik.
18. RENDAH · Detail kartu: `courseStatus` tak dipakai, format skor, presedensi `needsModule` vs `launchUrl`, judul pengganti dan chip kembar "Modul sedang disiapkan", breakpoint.
19. RENDAH · Label ringkasan rencana dan angka nol.
20. RENDAH · Paragraf fungsi murni tipis.
