# Siap implementasi (egm:egm-implementation-readiness) · b8-karyawan.md "Layar web"

Disalin dari laporan subagent (agen read-only). Vonis: belum siap; tiga pernyataan spek salah terhadap kode.

1. TINGGI · Transkrip tidak tampil di `iv-session` (IvSessionView.vue:191-195).
2. TINGGI · Jalur ekspor ganda `/api/api` (my/index.js:61, imports.ts:5,32); helper unduh tidak disebut.
3. TINGGI · `ADMIN_ACCOUNT` tidak terpicu untuk HR lewat switch-role (roles.js:47-51, employees/index.js:66,82).
4. SEDANG · Helper e2e tidak menguji jalur B2 (sesi.ts:65 tanpa `roles`); `support/sesi.ts` tidak di checklist.
5. SEDANG · `e2e/alur/menu-peran.spec.ts` belum ada.
6. SEDANG · Aturan 6 B0 tidak dibahas; mempersempit tanpa syarat merusak karyawan saat flag mati.
7. SEDANG · Kontrak interaksi hak data (teks konfirmasi, label tombol, umpan balik, muat ulang, batas 1000 karakter).
8. SEDANG · Keadaan memuat/galat; `person`/`careerLevelName`/`inviteExpiresAt`/`endedAt` null.
9. SEDANG · "Teks mockup" tanpa kutipan; mockup tidak ada di repo.
10. SEDANG · Kontrak fungsi `view.ts` hanya nama.
11. RENDAH · Ekspektasi menu test 1 tidak lengkap ("Wawancara visi & nilai").
12. RENDAH · Tanda tangan `routeOpen`.
13. RENDAH · Detail kartu (format skor, `status` vs `courseStatus`, tone chip, breakpoint, angka nol).
14. RENDAH · Kartu "Wawancara selesai" memuat sesi `abandoned`.
15. RENDAH · Teks undangan lewat beda dengan B6.
16. RENDAH · `b8-karyawan.spec.ts` sudah ada (checklist).
