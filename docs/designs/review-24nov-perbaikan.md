# Review penuh 24 Nov: perbaikan PR #8 (impor, link email, turun migrasi, admin interim, ekspor asisten)

Status: diterapkan di PR review 24 Nov (base `claude/project-thread-scbrmb`). Temuan berasal dari review ikan mas
(`egm-design` atas seluruh API PR #8, laporan audit 23 Nov) dan `mattpocock-skills:code-review` (Standards + Spec)
atas selisih PR #8 sejak `a8e48b6`. Laporan lengkap ada di folder project (di luar repo).

## 1. Impor XLSX jarang/lebar membuat API macet (8-9, P2 keamanan)

**Masalah.** `parseXlsx` membaca `ws.eachRow({ includeEmpty: true })` dan `ws.columnCount` kolom per baris. Satu sel
di baris 1.048.576 atau kolom XFD (file < 10 MB) membuat jutaan baris/sel kosong; test merah membuktikan parser macet.

**Perubahan.**
- [x] Hanya baris berisi yang disimpan (XLSX dan CSV); nomor baris spreadsheet tetap dibawa (`__row`). Sel kosong
  atau spasi di ujung kanan diabaikan (CSV Excel dengan titik koma pengisi tetap diterima).
- [x] Batas lebar isi `MAX_COLS = 200` dengan pesan Indonesia; pembacaan berhenti bila baris berisi melewati
  `MAX_ROWS + 20` (baris judul laporan di atas tabel), batas tepat `MAX_ROWS` dicek di akhir (413).
- [x] XLSX "bom zip": total ukuran setelah dibuka dibaca dari direktori zip (`jszip`, kini dependensi langsung)
  sebelum exceljs membaca isi; di atas 50 MB ditolak 413 `FILE_TOO_LARGE`.
- [x] Rumus tanpa hasil tersimpan dibaca kosong (dulu jadi teks "[object Object]").
- [x] Kolom berisi tanpa judul tetap jadi "Kolom N" (lebar = isi paling kanan di seluruh lembar).
- [x] Test: `tests/unit/imports.test.js` blok "Audit 24 Nov".

## 2. Waktu jawab minta link membocorkan akun terdaftar (8-11, P2 keamanan)

**Masalah.** `POST /api/auth/email-link` menjawab 202 setelah cek batas, simpan link, dan kirim email (SES) untuk akun
terdaftar; email tak dikenal dijawab langsung. Selisih waktu ratusan milidetik cukup untuk enumerasi akun.

**Perubahan.**
- [x] Jawaban 202 dikirim setelah satu lookup yang sama untuk semua email; pekerjaan akun terdaftar berjalan di
  `core/background-queue.js`, berurutan per akun sehingga batas 3 link per 15 menit tetap tepat (test 5 permintaan
  bersamaan → 3 email; merah bila antrean tidak berurutan). Email tak dikenal tidak diantrikan berurutan.
- [x] Gagal kirim link tercatat di audit tenant (`outcome: link_failed`) dan log proses (kunci + stack); dulu 500.
- [x] `app.locals.emailLinks.drain()` untuk test. Pencatat galat yang rusak atau penolakan bukan `Error` tidak
  menjatuhkan proses (`tests/unit/background-queue.test.js`).
- [x] Test: `tests/integration/email-link.test.js` "8-11" (mailer yang tertahan tidak menahan jawaban).

`[⏳ DITERIMA]` Proses mati tepat setelah jawaban = link tidak terkirim; karyawan meminta ulang (pesan generik sudah
menyarankan memeriksa kotak masuk). Belum ada penanganan berhenti terkendali di `server.js`.

## 3. Turun migrasi menghapus catatan hukum dan hak akses (P1/P2, review egm-design)

**Masalah.** `db/undo-guard.js` hanya menjaga migrasi `tenant-keys`. Turun `20261119000800` membatalkan semua
penarikan persetujuan dan menghapus `data_subject_requests`; `20261117000501` menghapus bukti versi persetujuan;
`20261119000200` menurunkan Admin Tenant jadi karyawan dan menghapus peran tambahan; `20261117000400` menghapus
keputusan review HR; `20261123001000` dan `20261123003000` menghapus persetujuan wawancara Core Competencies dan
wawancara ulang dampak belajar.

**Perubahan.**
- [x] `rowsCheck` + enam pengaman baru di `GUARDS`; menolak bila ada data, dengan saran pulihkan dari backup.
  Review HR dihitung dari `reviewed_by` (arah naik mengisi `reviewed_at` untuk temuan lama tanpa peninjau).
- [x] Basis data kosong tetap bisa naik-turun-naik (CI) — diverifikasi lokal.
- [x] Test: `tests/unit/db-roles.test.js` blok "Audit 24 Nov".

Catatan: temuan 8-10 (turun `tenant-keys` memotong ciphertext) ternyata sudah dijaga `undo-guard` sejak PK-07;
laporan 23 Nov dikoreksi.

## 4. Pengelola interim bisa mengirim ulang undangan ke Admin Tenant (P3)

- [x] `POST /tenant-admin/users/:id/invite` memanggil `assertCanManage` (sama dengan PATCH).
- [x] Test: `tests/integration/tenant-admin.test.js` blok "audit 23 Nov".

## 5. Ekspor HR memuat log Asisten ELGOS (P1 privasi)

**Masalah.** Spek B17 (risiko "Nama anggota tim tertinggal di log dan ekspor atasan"): "ekspor hanya ke atasan itu
sendiri". `employees/index.js` menyertakan `assistantLogs` di setiap ekspor, termasuk yang diminta HR/Admin ETA.

- [x] `assistantLogs` hanya pada ekspor milik sendiri; penanda `assistantLogsIncluded` (seperti `transcriptIncluded`).
  Spek B17 diperbarui.
- [x] Test: `tests/integration/asisten.test.js` (ekspor oleh HR berisi `assistantLogs: []`).

## 6. Sisa langkah etavm1 di dokumen (Standards)

- [x] `deploy/dev-public/README.md` ditulis ulang tanpa langkah setup/operasi server lama; komentar compose.
- [x] Test penjaga baru: dokumen di `deploy/`, `docs/infra/`, `README.md` tidak menyebut skrip `deploy/*.sh` yang
  tidak ada (merah pada versi sebelum perbaikan).

## Review atas diff ini dan triase

| Temuan (ikan mas `egm-codebase-details` / code-review) | Keputusan |
| --- | --- |
| P2 batas baris menghitung baris rumus kosong/spasi | Perbaiki + test (juga rumus tanpa hasil → kosong) |
| P2 bom zip XLSX lolos ke exceljs | Perbaiki + test |
| P2 pengaman turun CCA/LIM belum ada | Perbaiki + test |
| P3 CSV membangun grid penuh; titik koma pengisi menambah kolom | Perbaiki + test |
| P3 rantai global email tak dikenal; onError rapuh; komentar "saat berhenti" | Perbaiki + test |
| P3 ekspor HR tanpa penanda; spek B17 basi | Perbaiki |
| P3 tanpa test berurutan per akun / unit antrean / tepat 5000 baris | Tambah test |
| Smell: test GUARDS dilonggarkan (`toContain`) | Kembali `toEqual` daftar lengkap |
| Smell: guard `reviewed_at` terlalu luas | `reviewed_by` |
| Smell: antrean umum di `core/auth` | Pindah ke `core/background-queue.js` |
| Baris judul laporan di atas judul kolom | Tolak: perilaku lama sama (baris berisi pertama = judul kolom) |
| Ekspor HR untuk karyawan tanpa tim juga tanpa log | Tetap (minimisasi data; karyawan mengekspor sendiri lewat B8) |

## Di luar cakupan (diteruskan)

Super Admin (`eta_admin`) masih membaca isi wawancara lewat modul selain `interviews` (CCA, ekspor, Pareto dasbor);
penarikan persetujuan belum menjangkau CCA/LIM/INA; aksi INA tidak dibekukan setelah penarikan; flag
`ina.dashboard` vs cakupan 5 modul; retensi data per kelas. Butuh keputusan Andrian/user atau paket tersendiri;
dicatat di laporan review 24 Nov.


## Super Admin tidak membaca isi data karyawan (keputusan user 24 Nov)

**Keputusan:** kartu "Block Super Admin from reading employee content in every module?", pilihan "Yes, one core rule (recommended)", 24 Nov 2026 17.14 WIB. Menggantikan keputusan 19 Nov 20.30 WIB ("Seperti sekarang", `b2-peran.md`) dan baca-saja Admin ETA di spek B9 §15.

**Masalah (temuan P1 review 24 Nov):** `requireRole` meloloskan `eta_admin` dan banyak modul menyamakannya dengan HR, jadi Super Admin di tenant membaca ringkasan CCA, temuan, ekspor karyawan, Pareto dashboard, aksi INA, keputusan promosi, dan fakta asisten. Hanya `modules/interviews` yang menolaknya.

**Aturan:**
1. `core/rbac` `denyEmployeeContent` menolak peran aktif `eta_admin` dengan 403 `EMPLOYEE_CONTENT_PRIVATE`.
2. `app.js` memasangnya pada `/api/employees`, `/api/dashboard`, `/api/assistant`, dan setiap router submodul (`cca`, `dna`, `tna`, `ina`, `li`, `ld`, `lim`), sebelum flag dan entitlement, supaya jawabannya sama apa pun modul yang aktif. Router baru yang membaca data karyawan wajib ikut dipasang di sini.
3. Lapis kedua: `visibleEmployeeScope` untuk `eta_admin` = `{ userIds: [] }`.
4. Tetap terbuka untuk Super Admin: `/api/platform` (ADR 0002), `/api/admin` (flag, kill switch), `/api/me/access`, `/api/users` (peran), `/api/sessions`, `/api/projects`, `/api/tenant-admin`, `/api/invitations`, `/api/my` (hanya data dirinya).

**Menu:** tampilan `super` di API (`core/rbac/menu.js`) hanya Tenant dan Konfigurasi platform, jadi tidak ada layar yang rusak. `apps/web/src/shell/menu.ts` masih mencantumkan butir peralihan DNA/TNA untuk `super`; menu dari API yang dipakai.

**Ditunda (perapian, tidak mengubah perilaku):** cek `[HR_ADMIN, ETA_ADMIN]` di modul (cca, tna, li, lim, dna, employees, dashboard, interviews, ina/access) kini tak terjangkau untuk `eta_admin`; dirapikan terpisah supaya PR ini kecil.

**Test:** `tests/integration/super-admin-isi-karyawan.test.js` (satu baca per router + tulis + peran lain + jalur konfigurasi), `tests/unit/rbac.test.js`. Test lama yang mengunci akses lama diubah ke kode baru.
