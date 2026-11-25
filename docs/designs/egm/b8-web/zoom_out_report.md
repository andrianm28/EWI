# Zoom-out review (egm:egm-zoom-out) · b8-karyawan.md "Layar web"

Disalin dari laporan subagent (agen read-only). Kesimpulan: masalahnya benar dan pendekatannya minimal (dua rute, gerbang sama dengan API, shell B0 tidak diubah). Dua temuan tinggi.

1. TINGGI · "Baca transkrip" ke `iv-session` tidak pernah menampilkan transkrip: untuk `done` hanya "Wawancara ini sudah selesai", `closed` "Sesi ini dibatalkan" (IvSessionView.vue:191-195), padahal API mengirim `turns` ke yang diwawancarai (interviews/index.js:83-87). Perbaiki B6: tampilkan giliran read-only untuk done/closed + label "Persetujuan ditarik".
2. TINGGI · Karyawan bisa minta hapus (tenggat 3×24 jam, tanpa notifikasi) tetapi HR tidak punya layar; `lna.dataRequests`/`fulfillDataRequest` tidak dipakai (lna.ts:130-132). A: daftar HR minimal; B: tahan tombol "Minta hapus data".
3. SEDANG · Kartu "Data saya" kembali di balik flag `learner.home` (rute `my`), bertentangan dengan prinsip hak subjek data tanpa flag; `openRequests` dari `/my/results`.
4. SEDANG · Tidak ada langkah menyalakan flag (default mati; seed-dev hanya module.dna/tna, seed-dev.js:86-89).
5. SEDANG · Kartu "Wawancara selesai" mengulang Riwayat di IvListView dan tidak ada di mockup.
6. RENDAH · Kewajiban B0 mempersempit `views` dna/tna/iv tidak dibahas (sebaiknya "belum", karena flag default mati).
7. RENDAH · Label status rencana kedua ("Belum dimulai…") vs `PLAN_STATUS_LABEL` bersama ("Baru/Berjalan/Selesai", lna.ts:160-164); mockup memakai "Belum dimulai".
8. RENDAH · Kode unduh blob disalin keempat kalinya.
9. RENDAH · "Minta hapus data" selalu 409 `ADMIN_ACCOUNT` untuk HR/admin; sembunyikan. Bagian fungsi murni terlalu rinci.
10. RENDAH · Kewajiban helper login e2e (B0) tidak disebut.

Yang sudah benar: gerbang rute = API; `homeReady`/`VIEW_HOME` tanpa ubah shell; jalur B2 berjalan (`switchableRoles` menambah `learner` untuk HR/atasan/admin, rbac/roles.js:47-52); tombol demo mockup tidak ditiru.
