# Review penuh 24 Nov: perbaikan PR #8 (impor, link email, turun migrasi, admin interim, ekspor asisten)

Status: diterapkan di PR review 24 Nov (base `claude/project-thread-scbrmb`). Temuan berasal dari review ikan mas
(`egm-design` atas seluruh API PR #8, laporan audit 23 Nov) dan `mattpocock-skills:code-review` (Standards + Spec)
atas selisih PR #8 sejak `a8e48b6`. Laporan: `/mnt/project-files/elgos-eksekusi/audit-pr-23nov/review-24nov/`.

## 1. Impor XLSX jarang/lebar membuat API macet (8-9, P2 keamanan)

**Masalah.** `parseXlsx` membaca `ws.eachRow({ includeEmpty: true })` dan `ws.columnCount` kolom per baris. Satu sel
di baris 1.048.576 atau kolom XFD (file < 10 MB) membuat jutaan baris/sel kosong; test merah membuktikan parser macet.

**Perubahan.**
- [x] Hanya baris dan sel berisi yang dibaca; nomor baris spreadsheet tetap dibawa (`__row`).
- [x] Batas lebar `MAX_COLS = 200` (XLSX dan CSV) dengan pesan Indonesia; batas baris dicek selama membaca (413).
- [x] Kolom tanpa judul tetap jadi "Kolom N" seperti sebelumnya (lebar = sel berisi paling kanan).
- [x] Test: `tests/unit/imports.test.js` blok "Audit 24 Nov".

## 2. Waktu jawab minta link membocorkan akun terdaftar (8-11, P2 keamanan)

**Masalah.** `POST /api/auth/email-link` menjawab 202 setelah cek batas, simpan link, dan kirim email (SES) untuk akun
terdaftar; email tak dikenal dijawab langsung. Selisih waktu ratusan milidetik cukup untuk enumerasi akun.

**Perubahan.**
- [x] Jawaban 202 dikirim setelah satu lookup yang sama untuk semua email; pekerjaan akun terdaftar berjalan di
  `core/auth/background-queue.js` (berurutan per akun, sehingga batas 3 link per 15 menit tetap tepat).
- [x] `app.locals.emailLinks.drain()` untuk test. Galat dicatat ke log, tidak memutus proses.
- [x] Test: `tests/integration/email-link.test.js` "8-11" (mailer yang tertahan tidak menahan jawaban).

`[⏳ DITERIMA]` Proses mati tepat setelah jawaban = link tidak terkirim; karyawan meminta ulang (pesan generik sudah
menyarankan memeriksa kotak masuk). Belum ada penanganan berhenti terkendali di `server.js`.

## 3. Turun migrasi menghapus catatan hukum dan hak akses (P1/P2, review egm-design)

**Masalah.** `db/undo-guard.js` hanya menjaga migrasi `tenant-keys`. Turun `20261119000800` membatalkan semua
penarikan persetujuan dan menghapus `data_subject_requests`; `20261117000501` menghapus bukti versi persetujuan;
`20261119000200` menurunkan Admin Tenant jadi karyawan dan menghapus peran tambahan; `20261117000400` menghapus
keputusan review HR.

**Perubahan.**
- [x] `rowsCheck` + empat pengaman baru di `GUARDS`; menolak bila ada data, dengan saran pulihkan dari backup.
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

- [x] `assistantLogs` hanya pada ekspor milik sendiri.
- [x] Test: `tests/integration/asisten.test.js` (ekspor oleh HR berisi `assistantLogs: []`).

## 6. Sisa langkah etavm1 di dokumen (Standards)

- [x] `deploy/dev-public/README.md` ditulis ulang tanpa langkah setup/operasi server lama; komentar compose.
- [x] Test penjaga baru: dokumen di `deploy/`, `docs/infra/`, `README.md` tidak menyebut skrip `deploy/*.sh` yang
  tidak ada (merah pada versi sebelum perbaikan).

## Di luar cakupan (diteruskan)

Super Admin (`eta_admin`) masih membaca isi wawancara lewat modul selain `interviews` (CCA, ekspor, Pareto dasbor);
penarikan persetujuan belum menjangkau CCA/LIM/INA; aksi INA tidak dibekukan setelah penarikan; flag
`ina.dashboard` vs cakupan 5 modul; retensi data per kelas. Butuh keputusan Andrian/user atau paket tersendiri;
dicatat di laporan review 24 Nov.
