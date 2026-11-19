Status: resolved

# Goldfish Annotated Review Report

**Target:** `docs/designs/b13-learning-intervention.md`, `docs/designs/b14-learning-delivery.md` (full file) dan diff PR #23 (head `ce0fa6c`, berkas paket B13/B14 saja)

Dijalankan 19 Nov 2026 dengan plugin egm yang termuat di sesi (thread susulan B13/B14):

- **egm-drift-report** (`skills/egm-drift-report/SKILL.md`), subagen baru. Laporan: [b13-b14-2026-11-19_DRIFT_REPORT.md](b13-b14-2026-11-19_DRIFT_REPORT.md). 0 berat, 7 sedang, 17 ringan.
- **egm-review tahap 9** (Implementation Readiness) atas diff, dengan dua persona terdaftar sebagai subagen terisolasi: `egm:egm-codebase-details` (CD: 6 Major, 9 Nit) dan `egm:egm-implementation-readiness` (IR: 9 Major, 12 Nit), standar `implementation-readiness-standard.md`. Tidak ada Blocker.
- **egm-resolve** (dokumen ini): tiap temuan diberi satu kategori. Perbaikan kode dikerjakan test-first (skill `mattpocock-skills:tdd`); commit disebut per butir.

Ringkasan 46 butir (temuan yang sama dari beberapa reviewer digabung): 35 PROPOSE FIX (diterapkan; 4 di antaranya sebagian CONTEST), 1 CONTEST, 0 ESCALATE, 10 DECLINE atau tunda.

## Major

| # | Reviewer | Temuan | Kategori | Tindakan / alasan |
| --- | --- | --- | --- | --- |
| 1 | CD M1, IR M1 | Diff tidak memuat `app.js`, `core/entitlement`, `gating.test.js` yang dicentang di §7; daftar file memakai folder; tidak ada tahap | PROPOSE FIX (sebagian CONTEST) | Ketiga file memang berubah di PR #23; diff review dibatasi ke berkas yang tidak ada di B0 karena ketiganya juga disentuh #18. §7 kedua spek kini menyebut tiap file dengan path lengkap, plus tahap dan titik periksa |
| 2 | CD M2, IR M2 | Gerbang entitlement `li`/`ld` dijanjikan tetapi tidak dites; webhook tanpa entitlement tidak dites | PROPOSE FIX | `gating.test.js`: tanpa `full_suite` → `NOT_ENTITLED`, flag mati → `FEATURE_DISABLED`, keduanya → 200, learner 403. `ld.test.js`: event untuk tenant tanpa `full_suite` tidak dicatat. Commit `1432cfe`, `d432479` |
| 3 | CD M3 | `listTrainingGaps` tidak memakai `visibleEmployeeScope` dan menulis ulang filter tinjauan | PROPOSE FIX | Store menerima `scope` (`scopeSql`) dan memakai `REVIEWED`; router memanggil `scopeFor`. Commit `b335d82` |
| 4 | CD M4 | Pilihan dan daftar peserta LD tidak memakai `visibleEmployeeScope`; `/options` tidak diaudit | PROPOSE FIX | `participantOptions`/`listParticipants` menerima `scope`; `/options` dicatat `audit.readIndividual` (`ld.options`). `scopeSql` dipindah ke `src/db/scope-sql.js` agar tidak ada require melingkar. Commit `b335d82` |
| 5 | CD M5 | Menu web hanya memeriksa flag, API juga entitlement | PROPOSE FIX | Rute `li`/`ld` memakai `meta.entitlement = 'full_suite'` dari B0 #18 (`c171592`); e2e negatif ditambah. Commit `510c98e` |
| 6 | CD M6 | Kunci unik `ld_trainings` LMS berbeda dari `lna_catalog_items`; judul/nonaktif tidak diteruskan | DECLINE (tunda) | Laten: hanya sumber `moodle` yang diimpor (`catalog-courses.js`). Perlu migrasi indeks baru; dicatat di §3 dan §8 B14 dan di PR |
| 7 | IR M3 | Kode galat dan status sukses tidak terdokumentasi; `PATCH /requests/:id` tanpa status → 409 | PROPOSE FIX | Tabel galat di §5 kedua spek; status kosong/tidak dikenal kini 400. Commit `9ce5e37` |
| 8 | IR M4, drift B14-1 | Aturan insight di kode berbeda dari §4.9; KPI `upcoming`/`today` tidak tertulis | PROPOSE FIX (spek) | Kode dipertahankan (aturan tambahan memberi tindakan yang jelas); §4.8 dan §4.9 B14 ditulis ulang sebagai tabel aturan berurutan |
| 9 | IR M5, drift B14-3 | "Tuntas" tidak didefinisikan: peserta gagal membuat pelatihan online menggantung; peserta yang belum pernah aktif tidak dihitung tidak aktif | PROPOSE FIX | Tuntas = `completed` atau `failed` (hitungan `failed` baru, progres 100); tidak aktif memakai waktu terdaftar bila belum pernah aktif; insight tidak mengingatkan peserta gagal. Commit `8a6000e`, `28c1157` |
| 10 | IR M6 | Baris B18 B13/B14 bertentangan dengan kode | PROPOSE FIX | Tabel 3.3 `b18-e2e-qa-malam.md` diperbaiki (endpoint, alur `installed`, kode 403, `assessmentStatus`) |
| 11 | IR M7 | Batas unggah: body dibaca sebelum cek lain, rentang 200 MB tidak tertulis, batas 60 tidak atomik, tanpa test | PROPOSE FIX | Cek pelatihan/storage/jenis/jumlah/`Content-Length` sebelum body dibaca; 413 `FILE_TOO_LARGE`; hitung ulang dengan `FOR UPDATE`; test 413 dan `LIMIT_REACHED`. Commit `df732ba` |
| 12 | IR M8 | Tidak ada serah terima ke B8 untuk tautan course | PROPOSE FIX | §9 B13 (B7/B8 membaca `catalog_item_id`) dan §9 B14 (pemetaan course LMS ke modul) |
| 13 | IR M9 | Isolasi tenant beberapa endpoint, webhook tenant ambigu, akun nonaktif di pengingat, hapus tanpa storage belum dites | DECLINE (tunda) | Isolasi dijaga oleh `tenant_id` di setiap query store yang sama yang sudah dites; dicatat sebagai test lanjutan di PR, dikerjakan bersama test alur B18 |

## Nit

| # | Reviewer | Temuan | Kategori | Tindakan / alasan |
| --- | --- | --- | --- | --- |
| 14 | CD N1 | `organizationId`/`elitementorUserId` di luar int4 → 5xx berulang | PROPOSE FIX | `intId` 1–2147483647; test unit + integrasi. Commit `d432479` |
| 15 | CD N2 | `UPDATE ld_sync_events` tanpa `tenant_id` | PROPOSE FIX | Commit `d432479` |
| 16 | CD N3 | Pelatihan terhapus saat unggah → berkas yatim + 500 | PROPOSE FIX | Berkas dihapus, 404. Commit `df732ba` |
| 17 | CD N4, N5 | Helper dan query katalog diduplikasi | DECLINE (tunda) | Refaktor lintas modul; ikut butir "helper bersama" yang sudah ditunda di §8 |
| 18 | CD N6 | Status permintaan kosong → 409 | PROPOSE FIX | Sama dengan #7 |
| 19 | CD N7, IR N10, drift B13-1 | `PUT /drafts/:id` tidak diaudit; `ACTIVE_REQUEST` tidak dipakai | PROPOSE FIX | Diaudit dengan `fields`; konstanta dihapus. Commit `9ce5e37` |
| 20 | CD N8 | Pesan 413 Inggris; env menerima 0,5; `sessionCount` string di POST | PROPOSE FIX | Commit `df732ba`, `caaadfd` |
| 21 | CD N9 | Layar tinjauan SME belum ada | DECLINE | Sudah ditunda di §8 B13 |
| 22 | IR N1 | Kalimat "ditolak per baris" bertentangan dengan impor atomik | PROPOSE FIX | §3 B13 |
| 23 | IR N2, drift B14-4/5/6, drift B13-6/7 | Amplop respons dan field tambahan tidak tertulis | PROPOSE FIX | §5 kedua spek |
| 24 | IR N3 | `GET /documents/:id` tidak ada | PROPOSE FIX | §2 B14 |
| 25 | IR N4 | Aturan siap offline juga berlaku setelah mulai | PROPOSE FIX (spek) | §4.6 B14 |
| 26 | IR N5 | Filter jabatan Pareto memakai jabatan karyawan sekarang | PROPOSE FIX (spek) | §4.6 B13 |
| 27 | IR N6 | `assessment_ref` unik hanya di aplikasi | DECLINE (tunda) | Perlu indeks parsial baru; risiko rendah (satu HR per tenant). Di PR |
| 28 | IR N7 | `syncFromCatalog` menulis tiap GET tanpa kunci; tidak menghapus | DECLINE (tunda) | Upsert idempoten; dicatat di §3 B14 dan PR |
| 29 | IR N8 | `GET /api/li/` tanpa `requireRole` | PROPOSE FIX | Kini HR/SME/role leader; test learner 403. Commit `1432cfe` |
| 30 | IR N9 | Kasus tepi (minta modul yang sudah tersedia, buka `done` lagi, dst.) | DECLINE (tunda) | Tidak mengubah data penting; dicatat di PR untuk diputuskan bersama B18 |
| 31 | IR N11 | Env unggah tidak ada di `.env.example`; config tidak dites | PROPOSE FIX | `.env.example` + `config.test.js`. Commit `caaadfd`. `deploy/*` milik thread infra |
| 32 | IR N12 | Kolom `submitted_by`/`updated_by`/`review_recorded_by_hr`, tiket ELITMEN, CASCADE | PROPOSE FIX (sebagian CONTEST) | Kolom dan CASCADE ditulis di §3/§9. Tiket ELITMEN: paket ELGOS memakai brief `bangun-penuh-19nov`, bukan tiket Asana; reviewer migrasi Andrian tetap berlaku (CLAUDE.md aturan 7) |
| 33 | drift B13-2 | Syarat `submit` lebih banyak dari spek; cek "modul tanpa butir" tidak ada di `submit` | PROPOSE FIX + CONTEST | §4.9 B13 kini menulis semua syarat `validateDraft`. Cek butir di `submit` tidak perlu: impor mewajibkan kolom Butir, jadi impor ulang tidak bisa membuat modul tanpa butir |
| 34 | drift B13-3 | Course katalog nonaktif bisa ditautkan | PROPOSE FIX | Commit `9ce5e37` |
| 35 | drift B13-4/5, B14-9 | Kolom migrasi dan probe `GET /` tidak tertulis | PROPOSE FIX | §3 dan §5 |
| 36 | drift B13-8 | `gating.test.js` tidak mengetes `li` | PROPOSE FIX | Sama dengan #2 |
| 37 | drift B13-9 | Layar menulis "Tool 1 dan Tool 2" | CONTEST | Butir KSA Tool 2 disusun dari daftar tugas Tool 1; teks layar benar. Dicatat di §8 B13 |
| 38 | drift B13-10, B14-13 | Tanpa `visibleEmployeeScope` | PROPOSE FIX | Sama dengan #3, #4 |
| 39 | drift B13-11, B14-12 | Handler `stores.elitementorEvents` didahulukan | CONTEST + PROPOSE FIX (komentar) | Itu titik injeksi test (`tests/unit/elitementor.test.js`); aplikasi nyata tidak punya store itu. Komentar di `app.js`. Commit `b100d63` |
| 40 | drift B14-2 | Offline yang sesinya tertinggal tidak pernah `watch` | PROPOSE FIX (spek) | Perilaku dipertahankan dan ditulis di §4.6 B14: offline yang lewat batas menjadi `late` |
| 41 | drift B14-7 | Aturan pengingat 409/400 tidak tertulis | PROPOSE FIX | §4.10 dan tabel galat B14 |
| 42 | drift B14-8 | `kind` default `photo` | PROPOSE FIX (spek) | §3 B14 |
| 43 | drift B14-10 | UI menyaring di browser, bukan filter server | DECLINE | Satu permintaan untuk semua tab; filter server tetap tersedia untuk API |
| 44 | drift B14-11 | Komentar "idempoten menyusul (B21)" basi | PROPOSE FIX | Commit `b100d63` |
| 45 | IR M5 (progres) | Progres LMS `in_progress` tanpa persen dihitung 0 | DECLINE | Dikecualikan dari rata-rata membuat progres terlihat 100% padahal ada yang belum selesai; 0 lebih aman. Ditulis di §4.6 B14 |
| 46 | CD N7 | Admin ETA boleh menghapus foto yang tidak boleh dibukanya | DECLINE | Sesuai §2 B14 (admin ETA lolos `requireRole` untuk pengelolaan); dikonfirmasi tidak membuka isi berkas |
