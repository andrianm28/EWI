# Kritik desain (egm:egm-design) · b8-karyawan.md "Layar web"

Disalin dari laporan subagent (agen read-only). 2 tinggi, 7 sedang, 8 rendah.

1. TINGGI · "Baca transkrip" ke `iv-session` tidak menampilkan transkrip (IvSessionView.vue:191-195; giliran hanya di langkah chat :145-146); sesi ditarik tampil "dibatalkan".
2. TINGGI · HR di tampilan "Karyawan (saya)" (B2: peran aktif `learner`) lolos dari `ADMIN_ACCOUNT` (employees/index.js:82 memeriksa peran aktif) dan membuat `delete_data` yang tidak pernah bisa dipenuhi (:167, :170-171), lalu `overdue` selamanya. Web: sembunyikan untuk `session.roles` hr_admin/eta_admin. API: periksa peran akun.
3. SEDANG · Kartu hak data di balik `learner.home` dan bergantung pada payload `/my/results`; pakai `GET /employees/me/data-requests` dan `/employees/<id>/export`.
4. SEDANG · "Karyawan (saya)" juga butuh `auth.multi_role` bila API mengirim `roles` (sessions.js:29, app.js:158, session.ts:162-169).
5. SEDANG · Unduhan ke `/api/api/...` (exportPath sudah berawalan `/api`, `raw` menambah BASE).
6. SEDANG · Aturan 6 B0 (mempersempit views dna/tna/iv) tidak dibahas.
7. SEDANG · Keadaan memuat/galat; akses basi → 403 `FEATURE_DISABLED`; galat aksi (400, 409 `INVALID_STATE`/`CANNOT_CANCEL`).
8. SEDANG · Tarik persetujuan tampil walau tidak ada yang bisa ditarik (membuat permintaan kosong; HR tunggal `CANNOT_FULFILL_OWN`); tampilkan jumlah `sessions`.
9. SEDANG · Aksesibilitas: fokus ke konfirmasi, `role="status"`, tombol nonaktif saat sibuk, penghitung karakter, teks "tab baru".
10. RENDAH · `courseStatus` gagal ("Tidak lulus") diabaikan.
11. RENDAH · `person: null`.
12. RENDAH · Format skor desimal; `required = 0`.
13. RENDAH · Teks undangan lewat bertentangan dengan B6 ("Minta HR memperpanjang").
14. RENDAH · `routeOpen(name, view)`; tautan transkrip menyorot menu `iv`.
15. RENDAH · Hanya permintaan terbuka; sembunyikan "Minta hapus" saat sudah ada yang terbuka.
16. RENDAH · Catatan ujian offline padahal `mode` selalu null; kalimat "±10 menit" dibuang.
17. RENDAH · Peringatan perangkat bersama untuk ekspor; cakupan e2e.
