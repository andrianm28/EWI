# Triase review spek B8 web (egm-resolve), 23 Nov 2026

Empat lensa: zoom out (ZO), pemahaman (KO), kritik desain (KD), siap implementasi (IR). Temuan sama digabung.

| # | Temuan | Sumber | Keputusan | Bukti / tindakan |
| --- | --- | --- | --- | --- |
| 1 | "Baca transkrip" tidak menampilkan transkrip | ZO1 KD1 IR1 KO10 | **Perbaiki** | B6 `IvSessionView.vue`: giliran read-only untuk langkah `done`/`closed` bila `turns` dikirim, plus label "Persetujuan ditarik". Kartu "Wawancara selesai" di Hasil saya **dihapus** (ZO5): riwayat sudah di `IvListView` |
| 2 | HR di tampilan karyawan lolos `ADMIN_ACCOUNT` | KD2 IR3 ZO9 | **Perbaiki** web + API | Web: "Minta hapus data" diganti teks "Hubungi Admin ETA" bila `session.roles` memuat `hr_admin`/`eta_admin`. API: cek peran akun (`roles`), bukan peran aktif |
| 3 | Antrean HR untuk permintaan data tidak ada | ZO2 KO17 | **Diangkat ke user** (kartu keputusan) | Rekomendasi: layar HR minimal di PR ini |
| 4 | Jalur ekspor `/api/api` | IR2 KD5 | **Perbaiki** | `raw('/employees/<id>/export')` lewat helper unduh bersama baru `downloadFile` di `api/imports.ts` (ZO8: tidak menyalin kode blob lagi; pemakai lama tidak diubah) |
| 5 | Hak data di balik `learner.home` dan payload `/my/results` | ZO3 KD3 | **Perbaiki sebagian, sisanya ⏳** | Kartu "Data saya" memakai `GET /employees/me/data-requests` dan id sesi, tetap tampil bila `/my/results` gagal. Rute `my` tetap di balik flag `[⏳ DITERIMA]`: sebelum PR ini tidak ada UI hak data sama sekali; API-nya tanpa flag |
| 6 | Flag tidak pernah dinyalakan | ZO4 | **Perbaiki** | `scripts/seed-dev.js` menyalakan `learner.home` di tenant dev; produksi/POC dinyalakan HR/Admin ETA lewat konfigurasi flag (dicatat di PR) |
| 7 | Aturan 6 B0 (persempit views) | ZO6 KD6 IR6 KO8 | **Tolak dengan alasan** | Rute `my` di balik flag default mati; mempersempit dna/tna/iv merusak karyawan saat flag mati. Dicatat di spek sebagai penyimpangan sampai flag menyala default |
| 8 | Ketergantungan `auth.multi_role` | KD4 KO13 | **Perbaiki (dokumen + test)** | Spek menyebutnya; e2e tambahan dengan `roles` dari API dan `switch-role` di-mock |
| 9 | Memuat/galat, `person` null | KD7 IR8 KO6 | **Perbaiki** | Teks memuat, `UiErrorSummary` + "Coba lagi"; 403 `FEATURE_DISABLED` → `loadAccess()` lalu ke beranda |
| 10 | Kontrak interaksi tarik persetujuan / hapus | KO1 KO2 IR7 KD8 KD9 KD15 | **Perbaiki** | Teks final di spek; tarik hanya bila ada undangan terbuka atau wawancara yang belum ditarik; konfirmasi di halaman dengan fokus; jumlah sesi di `role="status"`; tombol nonaktif saat sibuk; `maxlength` 1000 + penghitung; "Minta hapus" disembunyikan saat sudah ada `delete_data` terbuka |
| 11 | Teks mockup tidak dikutip; nama tempat belajar | KO4 KO5 IR9 KD16 | **Perbaiki** | String final ditulis di spek. Kalimat "1 wawancara ±10 menit … gap terbesar" tidak dipakai (API tidak mengirim jumlah/durasi/topik). Catatan ujian offline tidak dipakai (`mode` selalu null) |
| 12 | Teks undangan lewat beda dengan B6 | KD13 IR15 | **Perbaiki** | Pakai teks B6 "Undangan sudah berakhir. Minta HR memperpanjang undangan Anda." |
| 13 | Label status rencana ganda | ZO7 | **Tolak dengan alasan** | Tampilan karyawan mengikuti mockup ("Belum dimulai"); label HR bersama tetap. Dicatat di `view.ts` |
| 14 | `courseStatus` gagal | KD10 | **Perbaiki** | Chip "Tidak lulus" dari `COURSE_STATUS_LABEL` bila `courseStatus = 'failed'` |
| 15 | Format skor, `required` 0 | KD12 IR13 | **Perbaiki** | Angka `id-ID`; `required` 0 apa adanya (status dari API) |
| 16 | `menu-peran.spec.ts` belum ada | IR5 | **Tunda** | Dimiliki thread integrasi B18; diaktifkan setelah berkasnya masuk scbrmb |
| 17 | Helper login e2e | ZO10 IR4 KO9 | **Tolak dengan alasan** | `loginSebagai` sudah menerima `flags`; flag default mati sehingga test lama tidak berubah. Dicatat di spek |
| 18 | Singkatan, `routeOpen(name, view)`, label "Karyawan (saya)", bagian fungsi murni terlalu rinci | KO11–16 KO20 ZO9 IR10 IR12 | **Perbaiki** | Spek dirapikan |
| 19 | Peringatan perangkat bersama untuk ekspor | KD17 | **Perbaiki** | Satu kalimat di kartu |
| 20 | Menu test 1 tidak lengkap | IR11 | **Sudah** | Test memakai daftar lengkap termasuk "Wawancara visi & nilai" |
