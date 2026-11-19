# B5 · Training Needs (backend)

Status: spek v3, sesuai backend yang sudah digabung ke branch integrasi (PR #25). Riwayat review ada di bagian 12 (review spek), 13 (review diff), dan 15 (egm-review dengan plugin, 19 Nov); aturan di bagian 1–11 sudah memuat semua keputusan "Perbaiki" dari ketiganya. Paket B5 dari `/mnt/project-files/elgos-eksekusi/brief-bangun-penuh-19nov.md` (thread T4). Kontrak layar web ditulis sebagai bagian "Kontrak layar web" sebelum PR layar dibuka, di atas PR B0.

Penanda: `[⚠️ BELUM TERVERIFIKASI]` = asumsi yang belum dikonfirmasi user/PM dan bisa berubah; `[⏳ DITERIMA]` = batas atau risiko yang sengaja diterima dan dicatat di PR. Kode keputusan (PM-x, BT-x, RG-x, PO-x, Q-x, K1–K4) merujuk ke `/mnt/project-files/ewi-grilling/keputusan-master-semua-grilling.md` dan tabel "Default keputusan terbuka" di brief. Istilah domain ada di `CONTEXT.md`.

## 1. Tujuan

Masalah sebelum B5: HR dan atasan hanya melihat temuan per orang, sehingga tidak bisa menjawab "kompetensi atau target kerja mana yang paling meleset di tim saya, dan sudah diwawancarai atau belum", dan tidak ada cara menugaskan wawancara akar masalah dengan tenggat. B5 memberi HR dan atasan daftar **gap** yang bisa ditindaklanjuti:

1. gap kompetensi tim terhadap Job Competency Model (kamus kompetensi jabatan);
2. gap OKR/KPI/SLA (target meleset setelah toleransi per KPI, PM-1);
3. klasifikasi tiap gap (Training Needs, Improvement Needs, Perlu ditinjau HR, Belum diwawancarai, Dalam batas);
4. detail gap dengan bukti dan hipotesis awal;
5. **penugasan wawancara akar masalah**: pilih gap, pilih karyawan, tenggat, durasi 15 atau 30 menit (action item cadence 18 Nov).

Di luar cakupan B5: percakapan wawancara dan ringkasan (B6), tinjauan HR dan solusi (B7), layar karyawan (B8), tindakan perbaikan (B9), email undangan saat penugasan (R13), "Terkait kompetensi" pada gap OKR (R9), detail gap dari butir visi/misi/nilai DNA di mockup, dan layar web (PR terpisah di atas B0).

## 2. Layar mockup Pak Eji yang dicakup

`/mnt/project-files/mockup-pak-eji/Main.dc.html` (mockup final), layar `tna` dan `gap`:

- Tab **Ringkasan**: 4 kartu KPI (GAP KOMPETENSI, GAP OKR, SUDAH DIWAWANCARAI "x dari y gap", KONTRIBUSI 4 GAP TERBESAR), "Klasifikasi gap" (3 batang), "Alur dari gap ke solusi" (teks statis di web).
- Tab **Gap kompetensi**: tabel Kode, Kompetensi, Target, Aktual, Gap, Klasifikasi. API belum mengirim kolom Kode karena kolom `code` ditambah paket B4 (migrasi 0400) yang belum ada di cabang ini; kolom ini ditambahkan setelah B4 digabung `[⏳ DITERIMA]`.
- Tab **Gap OKR**: tabel Key result, Target, Aktual, Selisih, Klasifikasi.
- **Detail gap**: jenis, judul, klasifikasi, TARGET/AKTUAL/GAP, "Bukti yang terdeteksi", "Hipotesis awal (belum terverifikasi)", tombol "Mulai wawancara akar masalah" dan "Langsung ke tinjauan HR".

Yang tidak ada di mockup tetapi dibangun di sini: penugasan dengan tenggat dan durasi (cadence 18 Nov; tenggat menggantikan undangan 7 hari masih ⚠️, bagian 10), mode peserta per penugasan (menyimpang dari BT-29, ⏳), dan toleransi KPI (PM-1).

## 3. Data yang sudah ada

| Data | Tabel / fungsi | Catatan |
| --- | --- | --- |
| Kamus kompetensi | `lna_competencies` (`required_score` 0-4, `importance`) | `stores.dna.competenciesForPosition` |
| Skor karyawan | `lna_assessments` (skor 0-4, beberapa baris per orang per kompetensi) | skor terbaru yang dipakai, sama dengan `modules/dna/gap.js` |
| Kinerja | `lna_performance_records` (`is_met`, `tolerance`, `direction`, `period`, `metric_type`, `name`) | `is_met` sudah menghitung toleransi (PR #13) |
| Temuan | `lna_findings` (`category`, `review_status`, `competency_id`, `performance_record_id`) | isi temuan di luar antrean review hanya `approved`/`edited` (PR #16); papan gap B5 juga memakai **keberadaan** draf untuk klasifikasi (R6) tanpa menampilkan isinya |
| Sesi wawancara | `lna_interview_sessions` | undangan 7 hari + pengingat H-3/H-1 (PR #12). **Diubah B5**: kolom penugasan dan fokus (bagian 5); sesi hasil penugasan memakai tenggat (R10) |
| Akses atasan ke temuan non-pelatihan | `lna_non_training_grants` | K1 / PM-6 (PR #12) |

## 4. Aturan bisnis

- **R1 Cakupan data (RG-3).** Semua agregat dihitung hanya dari karyawan dalam `scopeFor(req)`: HR dan Admin ETA semua, atasan dirinya dan bawahan langsung. Peran lain (learner, dan peran baru dari B2 seperti pimpinan/SME sampai B2 menetapkan aksesnya) ditolak 403 `ROLE_FORBIDDEN` di semua endpoint gap dan penugasan. `tenant_id` selalu dari `req.tenantId`. Pengguna berstatus `disabled` dan pengguna berperan `eta_admin` tidak pernah ikut dihitung.
- **R2 Gap kompetensi.** Hanya kompetensi yang **sudah disahkan HR** (`approved_at` terisi; mockup: "menunggu pengesahan HR sebelum dipakai sebagai target di Training Needs") dan berlaku untuk posisi karyawan dalam cakupan. Per kompetensi: `target` = `required_score`; `actual` = rata-rata skor terbaru karyawan yang sudah dinilai; `gap` = max(0, target − actual), dibulatkan 2 desimal; `assessed` = jumlah yang sudah dinilai; `peopleWithGap` = jumlah dengan skor terbaru < target; `peopleTotal` = jumlah karyawan yang posisinya memakai kompetensi itu. Kompetensi dengan `assessed = 0` tidak ditampilkan. Respons memuat `unapprovedCompetencies` (jumlah kompetensi belum disahkan yang berlaku untuk posisi karyawan dalam cakupan, termasuk filter `jobRoleId`) supaya layar bisa menjelaskan tab kosong.
- **R2b "Dalam batas".** Baris dengan `gap = 0` tetap tampil di tabel dengan klasifikasi `ok` ("Dalam batas", seperti mockup) dan **tidak** dihitung di KPI, Pareto, maupun klasifikasi ringkasan. "Baris gap" di dokumen ini berarti `gap > 0`. `peopleWithGap` tetap dikirim sehingga layar bisa menulis "2 orang di bawah target" walau rata-rata tim memenuhi. Karena `actual` dibulatkan 2 desimal sebelum `gap` dihitung, rata-rata 2,996 terhadap target 3 menjadi `gap = 0` (Dalam batas) `[⏳ DITERIMA]`.
- **R3 Skala.** Sistem menyimpan skor 0-4. Mockup menampilkan 0-100. API mengirim nilai asli dan `targetPct`, `actualPct` (= nilai / 4 × 100, dibulatkan) serta `gapPct = max(0, targetPct − actualPct)`. `[⚠️ BELUM TERVERIFIKASI]` Data DNA Mas Abdan (masuk 26 Nov) mungkin memakai skala lain; konversi ada di satu fungsi (`toPct`).
- **R4 Pareto (hanya gap kompetensi).** Baris kompetensi diurutkan `gap` menurun (lalu nama). `cumulativeShare` (0-1) = kumulatif gap ÷ total gap untuk baris gap; baris `ok` mendapat `null`. KPI `top4Share` = `cumulativeShare` baris gap ke-4 (atau terakhir bila kurang dari 4; 0 bila tidak ada), **hanya dari gap kompetensi** seperti mockup. Rumus Pareto prioritas pelatihan `tna/pareto.js` (BT-30) tidak dipakai di sini.
- **R5 Gap OKR.** Satu gap = satu metrik (`metric_type` + `metricKey(name)`) pada satu periode. Dihitung dari semua baris metrik itu dalam cakupan pada periode itu; menjadi gap bila `peopleMissed` (jumlah karyawan berbeda yang punya baris `is_met = false`) ≥ 1. `metricKey(name)` = nama dirapikan spasinya dan dihuruf-kecilkan (`tna/performance.js`). Baris OKR diurutkan `peopleMissed` menurun lalu nama.
  - Periode: bila `period` tidak dikirim, dipakai periode yang barisnya **paling baru diunggah** (`max(created_at)`), bukan urutan teks, karena format bebas (`2026-11`, `2026-Q4`). Baris tanpa periode diabaikan (impor mewajibkan periode). Respons memuat `period` yang dipakai dan `periods` yang tersedia.
  - `peopleTotal` = jumlah karyawan berbeda yang punya baris metrik itu pada periode itu.
  - Bila satu orang punya beberapa baris untuk metrik + periode yang sama (impor ulang menambah baris, `insertPerformance` tidak menimpa), semua baris ikut dihitung `[⏳ DITERIMA]`, lihat bagian 14.
  - `target`: nilai bersama bila semua baris sama; selain itu `null` dan `targetVaries = true`.
  - `actual`: rata-rata realisasi **semua** baris (angka tim, seperti mockup), hanya bila `valueType` semua baris `angka`/`persen`, target tidak beragam dan tidak kosong, dan semua baris punya realisasi; selain itu `null`.
  - `diff` = `actual − target` (bertanda) bila keduanya ada; selain itu `null`.
  - `direction`, `tolerance`, `unit`, `valueType` (`angka`, `persen`, `biner`): diambil dari baris bila seragam (aturan KPI per metrik membuatnya seragam); bila tidak, `null`. Nilai kosong diisi lebih dulu (`direction` → `higher`, `tolerance` → 0, `unit` → `null`) sebelum diperiksa keseragamannya.
- **R6 Klasifikasi gap.** Temuan ditautkan ke gap lewat `competency_id` atau `performance_record_id` (metrik + periode baris itu). Temuan tanpa keduanya ditautkan ke gap fokus sesinya (`focus_*`, R10). Temuan `rejected` diabaikan. Dua pertanyaan dipisah: **ada tidaknya** temuan (semua temuan selain `rejected`, terlihat atau tidak) dan **jenis** temuan yang terlihat oleh pemanggil (R7). Tabel keputusan, dibaca dari atas; baris pertama yang cocok menang:

  | Keadaan gap | Hasil |
  | --- | --- |
  | tidak ada temuan selain `rejected` dan belum diwawancarai (R8) | `pending` ("Belum diwawancarai") |
  | ada draf yang terlihat pemanggil (hanya HR/Admin ETA) | `review` ("Perlu ditinjau HR") |
  | temuan terlihat berisi pelatihan dan Improvement Needs | `review` |
  | temuan terlihat hanya pelatihan | `training` ("Training Needs") |
  | temuan terlihat hanya Improvement Needs | `non_training` ("Improvement Needs") |
  | selain itu: ada temuan tetapi tidak satu pun terlihat, atau sudah diwawancarai tanpa temuan | `review` |

  Akibatnya `pending` tidak pernah membocorkan keberadaan temuan tersembunyi (draf bagi atasan, Improvement Needs saat flag mati): bagi pemanggil yang tidak melihatnya, gap itu `review`. Ini sama dengan `CONTEXT.md` ("Belum diwawancarai") dan `classify` di `gaps.js`. `pending` tidak ada di mockup (data contohnya sudah berklasifikasi semua); ditambahkan supaya gap yang belum diwawancarai tidak diberi klasifikasi tanpa dasar temuan `[⏳ DITERIMA]`.
- **R7 Siapa melihat apa (K1, PM-6, RG-4).**
  - **Flag Improvement Needs** = `tna.non_training_hr` menyala, atau `module.ina` + `ina.dashboard` menyala (fungsi `nonTrainingEnabled` di `tna/gap-routes.js`; visibilitas per pemanggil di `callerVisibility`). Bila mati, tidak seorang pun (termasuk HR) melihat label "Improvement Needs" di papan gap.
  - HR dan Admin ETA: pelatihan, Improvement Needs (bila flag Improvement Needs), dan draf.
  - Atasan dengan izin aktif (`lna_non_training_grants`) dan flag `tna.non_training_hr` menyala (khusus `tna.non_training_hr`, bukan jalur INA, karena izin atasan diatur PM-6 di endpoint itu): pelatihan, dan Improvement Needs **milik bawahan langsung saja** (bukan temuan tentang dirinya, sama dengan endpoint PM-6). Tanpa draf.
  - Atasan tanpa izin: hanya pelatihan yang sudah direview.
  - Karena baris terakhir tabel R6, gap yang sudah diwawancarai atau punya temuan tidak pernah tampil "Belum diwawancarai" bagi siapa pun. Sisa inferensi: atasan tanpa izin melihat "Perlu ditinjau HR" yang tidak berubah saat HR sudah melihat "Improvement Needs"; pada tim berisi satu bawahan ini bisa ditebak `[⏳ DITERIMA]`. Diterima karena status sesi bawahan sudah terlihat atasan (RG-3).
- **R8 "Sudah diwawancarai".** `trigger_record_ids` adalah daftar baris kinerja yang memicu sesi (diisi alur lama dan R10). Sesi TNA ditautkan ke gap lewat kolom fokus (R10); sesi alur lama (tanpa fokus) ditautkan ke semua gap OKR dari `trigger_record_ids`-nya. Per gap, dalam cakupan pemanggil: `interviewedCount` = jumlah karyawan dengan sesi `completed`, `assignedCount` = jumlah karyawan dengan sesi terbuka (R10). Sesi `abandoned` (dibatalkan) tidak dihitung dan tidak tampil di R9. `interviewed = interviewedCount > 0`. KPI "SUDAH DIWAWANCARAI" = jumlah baris gap dengan `interviewed`, dari `totalGaps`.
- **R9 Detail gap.** Header (R2/R5 + klasifikasi + hitungan R8), `evidence` (kalimat dari data, tanpa nama orang), `hypotheses` (tiga hipotesis tetap dari mockup, `verified: false`), `jobRoles` (nama jabatan dalam cakupan yang memakai kompetensi itu; kosong untuk OKR), dan `employees` dalam cakupan: `{ id, name, jobRoleName, value, target, gap | isMet, self, assignable, session: { id, status, inviteExpiresAt } | null }`. Gap kompetensi: semua pemegang kompetensi itu (yang belum dinilai `value` dan `gap` = `null`). Gap OKR: karyawan yang punya baris metrik + periode itu, satu baris pertama per orang. `assignable` saat ini hanya berarti "bukan diri sendiri"; kelayakan per mode (R10) belum dikirim, dan kontrak kelayakan, `jobRoleId`, serta status sesi yang bisa dibatalkan ditetapkan di bagian "Kontrak layar web" sebelum PR layar. Atasan ikut tampil di daftar (`self: true`, `assignable: false`). Pembacaan dicatat `audit.readIndividual(req, 'tna.gap_detail', ...)`. "Terkait kompetensi" pada gap OKR di mockup belum dibangun `[⏳ DITERIMA]` (butuh pemetaan KPI ke kompetensi yang belum ada datanya). Agregat daftar tidak diaudit per baca: atasan memang berhak melihat timnya (RG-3) dan audit dipakai untuk data per orang.
- **R10 Penugasan wawancara.** `POST /assignments` oleh HR, Admin ETA, atau atasan:
  - `gap.kind = 'okr'` (`metricType`, `name`, `period` semuanya wajib) atau `gap.kind = 'competency'` (`competencyId`);
  - gap harus ada di papan pemanggil (dihitung sama dengan papan, `board()`), selain itu 404 `NOT_FOUND`; label fokus diambil dari baris gap, bukan dari body. Konsekuensi: kompetensi yang belum dinilai siapa pun (tidak tampil, R2) tidak bisa ditugaskan, termasuk dengan `all_job_role`;
  - `mode = 'affected'`: OKR = karyawan dengan baris `is_met = false` pada metrik + periode itu; kompetensi = **pemegang kompetensi yang disahkan itu** dengan skor terbaru < target (yang belum dinilai, dan asesmen dari jabatan lama, tidak ikut). `mode = 'all_job_role'` (wajib `jobRoleId`) = semua karyawan di jabatan itu. Mode dipilih per penugasan; BT-29 menyebut "dikonfigurasi per proyek/klien" `[⏳ DITERIMA]` (konfigurasi tenant `tna.interviewScope` tetap dipakai alur lama dan menjadi nilai awal di layar);
  - `employeeIds` opsional (1–200 id; duplikat dibuang, larik kosong 400) mempersempit; id di luar hasil mode atau di luar cakupan → 400 `EMPLOYEE_NOT_ELIGIBLE` (tidak dilewati diam-diam);
  - `dueDate` (YYYY-MM-DD, tanggal WIB) wajib, paling cepat besok, paling lama 30 hari dihitung dari hari ini (WIB). Undangan berakhir 23.59.59 WIB tanggal itu. **Tenggat = `invite_expires_at`** (tidak ada kolom tenggat terpisah, sehingga perpanjangan HR lewat `extend` otomatis menggeser tenggat yang dilihat karyawan). Pengingat H-3/H-1 mengikuti; tenggat besok berarti hanya H-1. Perpanjangan tetap hanya HR;
  - `durationMinutes` wajib 15 atau 30;
  - `projectId` wajib, proyek milik tenant dan tidak `closed`. Layar mengambil daftar proyek dari `GET /api/projects` yang sudah terbuka untuk semua peran;
  - semua ID dicek format UUID (400) dan keberadaannya **dalam tenant** (404), kecuali `employeeIds` yang diperiksa terhadap hasil mode (400 `EMPLOYEE_NOT_ELIGIBLE`);
  - yang bisa ditugaskan: R11;
  - **Satu sesi TNA terbuka per orang per proyek.** "Terbuka" = `in_progress`, atau `scheduled` yang undangannya belum lewat. Karyawan dengan sesi terbuka dilewati dan dilaporkan di `skipped` (`reason: 'open_session' | 'in_progress'`). Sesi `scheduled` yang undangannya **sudah lewat** digantikan: ditandai `abandoned` dalam transaksi yang sama, lalu sesi baru dibuat. Sesi `completed` tidak menghalangi (berbeda dari alur lama yang memakai `openFor`; alur lama tidak diubah). Batas yang diterima `[⏳ DITERIMA]`: di dalam satu proyek, karyawan yang sudah punya sesi terbuka untuk gap A dilewati saat ditugaskan untuk gap B (dilaporkan `skipped`), dan gap B baru bisa ditugaskan ulang setelah sesi A selesai. Satu sesi berfokus satu gap (B6 memakai satu `focusLabel`). Antarproyek tidak dicegah: orang yang sama bisa punya sesi terbuka di dua proyek. `open_session` = sesi terjadwal yang belum kedaluwarsa; `in_progress` = sesi yang sudah dimulai;
  - seluruh penugasan satu permintaan berjalan dalam **satu transaksi** yang lebih dulu mengambil `pg_advisory_xact_lock` per (tenant, proyek), sehingga dua permintaan `/assignments` bersamaan tidak membuat sesi ganda dan kegagalan di tengah tidak menyisakan hasil sebagian. Alur lama tidak memakai kunci ini, jadi kedua alur bersamaan masih bisa membuat dua sesi (bagian 14);
  - untuk gap OKR, `trigger_record_ids` = baris metrik itu milik karyawan yang meleset pada periode itu (kosong untuk yang tidak meleset pada mode `all_job_role`);
  - audit `create`, `tna.interview_assignment`, `{ employeeIds, objectIds, gap (dengan label), mode, dueAt, durationMinutes, replaced (jumlah) }`, hanya bila ada yang ditugaskan. Audit ditulis setelah transaksi commit; bila audit gagal, sesi sudah ada dan permintaan ulang melaporkan semua `skipped` tanpa baris audit `[⏳ DITERIMA]` (bagian 14).
  - Hasil: 201 bila ada yang ditugaskan; 200 bila semua dilewati; 409 `NO_ELIGIBLE_EMPLOYEE` bila mode tidak menghasilkan siapa pun.
- **R10b Batalkan penugasan.** `POST /assignments/:sessionId/cancel`, diperiksa berurutan: (1) sesi tidak ada, bukan TNA, atau karyawannya di luar cakupan → 404 `NOT_FOUND`; (2) sesi tanpa penugas (alur lama) atau bukan `scheduled` → 409 `INVALID_STATE`, siapa pun pemanggilnya; (3) atasan yang bukan penugasnya → 403 `NOT_ASSIGNER`. HR/Admin ETA boleh membatalkan penugasan siapa pun. Sesi menjadi `abandoned`; respons `{ data: { id, status } }`. Audit `update`, `tna.interview_assignment`, `{ decision: 'cancelled' }`.
- **R11 Siapa yang bisa ditugaskan.** Pengguna berstatus bukan `disabled` (termasuk `invited`, karena karyawan hasil impor belum pernah masuk sebelum 1 Des) dalam cakupan penugas, kecuali dirinya sendiri dan `eta_admin`, apa pun perannya (K2 di brief: HR dan atasan juga karyawan). Ini sengaja berbeda dari alur lama yang hanya `learner`.
- **R12 Flag.** Dua flag baru, default mati: `tna.gap_board` (endpoint gap) dan `tna.interview_assignment` (penugasan dan pembatalan). Router TNA sudah di balik `requireSubmodule('tna')`. Alur lama `POST /tna/projects/:id/interviews` tidak berubah di B5; nasibnya saat `tna.interview_assignment` menyala diangkat ke user (bagian 14, R-1).
- **R13 Email.** B5 tidak mengirim email undangan saat penugasan (alur lama juga tidak), jadi email pertama yang diterima karyawan bisa berupa pengingat. Belum ada paket pemilik email undangan; rencana 1 Des adalah undangan manual oleh HR, dan pemiliknya diangkat ke user di PR `[⏳ DITERIMA]`. Teks pengingat memakai durasi sesi (default 30 menit untuk sesi tanpa durasi) ("sekitar 15 menit" / "sekitar 30 menit").
- **R14 Serah terima ke B6.** `stores.interviews.get` dan `list` mengembalikan `durationMinutes`, `focusKind`, `focusLabel`, `assignedBy` (ID penugas) dan `assignedByName`. Respons `GET /tna/sessions/:id` hanya memuat kolom yang ada di allowlist `SHARED_FIELDS` (`modules/interviews/summary.js`), jadi kolom baru harus ditambahkan di sana. Daftar `GET /tna/sessions` mengembalikan baris `list` apa adanya (termasuk `intervieweeName`, `triggerCount`, `analysisStatus`); `list` tidak memuat kolom ringkasan. B6 memakai `focusKind`/`focusLabel` untuk prompt dan `durationMinutes` untuk batas pertanyaan (spek B6 A10).

## 5. Migrasi (blok 05)

`20261119000500-tna-penugasan-wawancara.js`, raw SQL dengan `down`:

```sql
ALTER TABLE lna_interview_sessions
  ADD COLUMN assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN duration_minutes smallint CHECK (duration_minutes IN (15, 30)),
  ADD COLUMN focus_kind varchar(16) CHECK (focus_kind IN ('okr', 'competency')),
  ADD COLUMN focus_competency_id uuid REFERENCES lna_competencies(id) ON DELETE SET NULL,
  ADD COLUMN focus_metric_type varchar(8) CHECK (focus_metric_type IN ('okr', 'kpi', 'sla')),
  ADD COLUMN focus_metric_key varchar(255),
  ADD COLUMN focus_period varchar(32),
  ADD COLUMN focus_label varchar(255),
  ADD CONSTRAINT lna_sessions_focus_chk CHECK (focus_kind IS NULL OR focus_label IS NOT NULL);
CREATE INDEX lna_sessions_focus_idx ON lna_interview_sessions
  (tenant_id, focus_kind, focus_competency_id, focus_metric_key, focus_period);
```

Semua kolom boleh kosong, jadi sesi lama dan alur lama tidak terpengaruh. `focus_label` (nama kompetensi atau KPI) bukan data pribadi. Bila kompetensi fokus dihapus, `focus_competency_id` menjadi kosong tetapi `focus_label` tetap (riwayat sesi masih terbaca). `down` menghapus indeks, constraint, dan kolom. Tidak ada unique index sesi terbuka: data lama bisa melanggarnya dan definisi "terbuka" bergantung waktu; penguncian ada di R10.

## 6. Endpoint

Semua di bawah `/api/tna`, sesudah `auth`, `tenantContext`, `requireSubmodule('tna')`. Peran: HR, Admin ETA, atasan. Respons sukses dibungkus `{ data }`, galat `{ error: { code, message } }`. `period` hanya memengaruhi gap OKR (dan KPI GAP OKR); tab kompetensi selalu memakai skor terbaru. Periode yang tidak ada di `periods` menghasilkan baris kosong dengan `period` itu (bukan 404); lebih dari 32 karakter → 400. `jobRoleId` mempersempit karyawan dalam cakupan ke jabatan itu, untuk ringkasan dan kedua daftar. Ketiga endpoint papan menghitung papan masing-masing, jadi satu halaman Training Needs menghitung papan lebih dari sekali (bagian 14).

| Metode | Path | Flag |
| --- | --- | --- |
| GET | `/gaps/summary?period=&jobRoleId=` | `tna.gap_board` |
| GET | `/gaps/competencies?period=&jobRoleId=` | `tna.gap_board` |
| GET | `/gaps/okr?period=&jobRoleId=` | `tna.gap_board` |
| GET | `/gaps/detail?kind=competency&competencyId=` atau `?kind=okr&metricType=&name=&period=` | `tna.gap_board` |
| POST | `/assignments` | `tna.interview_assignment` |
| POST | `/assignments/:sessionId/cancel` | `tna.interview_assignment` |

```jsonc
// GET /gaps/summary
{ "data": {
  "period": "2026-11", "periods": ["2026-11", "2026-Q3"],
  "kpis": { "competencyGaps": 5, "okrGaps": 2, "totalGaps": 7, "interviewed": 3, "top4Share": 0.86 },
  "classification": { "training": 2, "non_training": 1, "review": 2, "pending": 2 },
  "unapprovedCompetencies": 0 } }

// GET /gaps/competencies → data.rows[] + data.unapprovedCompetencies (cumulativeShare null pada baris ok)
{ "key": "c:<uuid>", "kind": "competency", "competencyId": "<uuid>", "name": "Analisis insiden",
  "target": 3, "actual": 2.25, "gap": 0.75, "targetPct": 75, "actualPct": 56, "gapPct": 19,
  "assessed": 4, "peopleWithGap": 3, "peopleTotal": 5, "cumulativeShare": 0.41,
  "classification": "pending", "interviewed": false, "interviewedCount": 0, "assignedCount": 0 }

// GET /gaps/okr → data.rows[] (+ data.period, data.periods)
{ "key": "o:sla|waktu respons|2026-11", "kind": "okr", "metricType": "sla", "name": "Waktu respons", "period": "2026-11",
  "target": 15, "actual": 22.5, "diff": 7.5, "targetVaries": false, "direction": "lower", "tolerance": 0,
  "unit": "menit", "valueType": "angka", "peopleMissed": 2, "peopleTotal": 4,
  "classification": "review", "interviewed": true, "interviewedCount": 1, "assignedCount": 1 }

// GET /gaps/detail → data = baris kompetensi atau OKR (sesuai kind) ditambah:
{ "evidence": ["3 dari 4 karyawan yang dinilai berada di bawah target.", "..."],
  "hypotheses": [{ "text": "...", "verified": false }], "jobRoles": ["Service Delivery L1"],
  "employees": [{ "id": "<uuid>", "name": "Dimas", "jobRoleName": "Service Delivery L1", "value": 2, "target": 3,
                  "gap": 1, "self": false, "assignable": true,
                  "session": { "id": "<uuid>", "status": "scheduled", "inviteExpiresAt": "..." } }] }

// POST /assignments
{ "projectId": "<uuid>", "gap": { "kind": "okr", "metricType": "sla", "name": "Waktu respons", "period": "2026-11" },
  "mode": "affected", "employeeIds": ["<uuid>"], "dueDate": "2026-12-05", "durationMinutes": 15 }
// → 201 / 200
{ "data": { "assigned": [{ "sessionId": "<uuid>", "employeeId": "<uuid>", "inviteExpiresAt": "...", "durationMinutes": 15, "replaced": false }],
            "skipped": [{ "employeeId": "<uuid>", "reason": "open_session" }] } }
```

Kode galat:

| Keadaan | Status | Kode |
| --- | --- | --- |
| Peran bukan HR/Admin ETA/atasan (diperiksa pertama) | 403 | `ROLE_FORBIDDEN` |
| Flag mati (diperiksa setelah peran) | 403 | `FEATURE_DISABLED` |
| Parameter salah bentuk (UUID, `kind`, `mode`, `dueDate`, `durationMinutes`, `jobRoleId` hilang pada `all_job_role`, `employeeIds` kosong atau > 200, `period` > 32 karakter) | 400 | `BAD_REQUEST` |
| Tenggat sebelum besok atau lebih dari 30 hari | 400 | `DUE_DATE_OUT_OF_RANGE` |
| `employeeIds` memuat orang yang tidak memenuhi | 400 | `EMPLOYEE_NOT_ELIGIBLE` |
| Proyek, kompetensi, jabatan, atau gap tidak ada di tenant/cakupan; sesi yang dibatalkan tidak ada, bukan TNA, atau di luar cakupan | 404 | `NOT_FOUND` |
| Proyek `closed` | 409 | `PROJECT_CLOSED` |
| Mode tidak menghasilkan karyawan | 409 | `NO_ELIGIBLE_EMPLOYEE` |
| Batal pada sesi yang bukan `scheduled`/bukan penugasan | 409 | `INVALID_STATE` |
| Batal oleh atasan yang bukan penugas (diperiksa setelah 409) | 403 | `NOT_ASSIGNER` |

## 7. Alur

1. HR/atasan membuka Training Needs: ringkasan dan dua tab (`/gaps/*`).
2. Klik baris: detail gap (`/gaps/detail`), bukti, hipotesis, daftar karyawan dan status sesinya.
3. "Mulai wawancara akar masalah" membuka form penugasan (tidak ada di mockup; dibangun dengan pola form mockup): proyek (dari `/api/projects`, terisi otomatis bila hanya satu yang aktif), mode, karyawan (centang), tenggat, durasi 15/30 menit. Kirim → `/assignments`.
4. Karyawan melihat undangan di daftar sesinya (tenggat, durasi, topik) dan menjalani wawancara (B6).
5. Setelah HR meninjau temuan (B7), klasifikasi gap berubah.
6. "Langsung ke tinjauan HR" hanya tautan ke layar tinjauan B7, tampil untuk HR; tanpa endpoint.

E2E layar (di PR layar, API mock): buka ringkasan, pindah tab, buka detail, tugaskan dua karyawan, lihat status "Ditugaskan".

## 8. Susunan kode

Per modul dan tanggung jawabnya (nama fungsi lengkap ada di kode):

- `apps/api/src/modules/tna/gaps.js`: perhitungan papan, fungsi murni tanpa DB. Skor terbaru, gap kompetensi dan OKR, Pareto, kunci gap (`c:<competencyId>`, `o:<metricType>|<metricKey>|<period>`), tautan sesi ke gap, definisi sesi terbuka (`isOpen`), visibilitas (R7), klasifikasi (R6), KPI, kalimat bukti, dan tiga hipotesis tetap. Satu-satunya konversi skala ada di `toPct`.
- `apps/api/src/modules/tna/assignment.js`: aturan penugasan, fungsi murni. Validasi body dan tenggat (memakai `WIB_OFFSET_MS`/`wibDay` dari `interviews/invitation.js`), pemilihan karyawan per mode, dan rencana assign/skip/replace (`planAssignments`, memakai `isOpen`).
- `apps/api/src/modules/tna/gap-routes.js`: router Express (dipasang dari `tna/index.js`). Membangun papan per permintaan (`board()`), memeriksa gap ada di papan sebelum penugasan, dan menulis audit.
- `apps/api/src/db/lna-stores.js`: kueri papan (`tna.performancePeriods`, `tna.findingsForGaps` tanpa kolom terenkripsi, `interviews.gapSessions`), `interviews.assign` dan `interviews.cancelAssigned`, `projectsExtra.status`, kolom penugasan di `interviews.list/get`, `durationMinutes` di `reminderCandidates`. Arah dependensi: `interviews.assign` memanggil `planAssignments` dari `tna/assignment.js` **di dalam** transaksi dan kunci, setelah membaca sesi yang ada; rencana tidak boleh dihitung di luar kunci.
- `apps/api/src/modules/interviews/invitation.js` dan `apps/api/src/jobs/interview-reminders.js`: teks pengingat memakai `durationMinutes`.
- `apps/api/src/modules/interviews/summary.js`: `SHARED_FIELDS` memuat kolom penugasan supaya ikut di respons detail sesi (R14).
- `apps/api/src/core/flags/index.js`: dua flag baru.

## 9. Test yang ditulis lebih dulu

Unit (`tests/unit/tna-gaps.test.js`):
- R2/R2b/R3/R4: skor terbaru, kompetensi belum disahkan dilewati, `ok` saat rata-rata ≥ target walau ada orang di bawah target, persen, urutan, kontribusi kumulatif, total gap 0.
- R5: pengelompokan metrik + periode, target beragam, nilai biner tanpa rata-rata, selisih bertanda, urutan baris OKR.
- R6/R7: seluruh tabel keputusan; `rejected` diabaikan; temuan tak tertaut memakai fokus sesi; atasan tanpa izin; atasan berizin tidak menghitung temuan tentang dirinya; flag non-pelatihan mati.
- R8: tautan sesi berfokus dan sesi lama, hitungan per gap.
- R10: tenggat (kemarin, hari ini, besok, 31 hari, format salah, batas akhir hari WIB), durasi, mode, sesi terbuka vs kedaluwarsa vs selesai.

Integrasi (`tests/integration/tna-gaps.test.js`, Postgres). Suite ini hanya jalan bila `DATABASE_URL` di-set dan migrasi sudah dijalankan; tanpa itu suite dilewati dan tetap tampak hijau. Pembersihan memakai `SET LOCAL ewi.audit_maintenance = 'on'` sebelum menghapus tenant uji.
- flag mati → 403 `FEATURE_DISABLED` untuk keenam endpoint; learner 403;
- HR melihat semua, atasan timnya (angka berbeda), tenant lain kosong; periode terbaru menurut waktu unggah, bukan urutan teks;
- klasifikasi: `pending` → `review` setelah wawancara selesai → `training` setelah HR menyetujui; temuan non-pelatihan: HR `non_training` (flag nyala), atasan tanpa izin `review`, atasan berizin `non_training`; flag mati → HR `review`;
- detail mencatat audit baca; gap di luar cakupan dan ID tenant lain → 404; UUID rusak → 400;
- penugasan: gap OKR mode `affected` (hanya yang meleset, `trigger_record_ids`, `invite_expires_at` akhir hari WIB, kolom fokus); atasan menugaskan bawahan, ditolak untuk orang di luar tim dan dirinya; `all_job_role` butuh `jobRoleId`; sesi terbuka dilewati; sesi kedaluwarsa digantikan (`abandoned`); dua permintaan bersamaan menghasilkan satu sesi; `projectId`/`competencyId` tenant lain → 404; proyek `closed` → 409; perpanjangan HR menggeser tenggat yang dilihat karyawan; pembatalan oleh penugas, ditolak untuk atasan lain; audit tercatat; `GET /tna/sessions` karyawan memuat durasi dan label gap;
- pengingat memakai durasi sesi;
- migrasi naik-turun-naik (langkah CI).

## 10. Keputusan default dan asumsi

- K1 (brief: akses atasan ke Improvement Needs hanya lewat izin HR, PM-6) dipakai seperti R7. K2 (brief: HR dan atasan juga karyawan) dipakai di R11. Peran tambahan B2 (pimpinan, SME) dikerjakan B2; B5 memakai `hr_admin`, `supervisor`, `eta_admin`.
- `[⚠️ BELUM TERVERIFIKASI]` R3 skala 0-4 → persen: diperiksa saat data DNA Mas Abdan (HR Elitery) masuk 26 Nov; bila skalanya lain, `toPct` dan gap R2 disesuaikan.
- `[⚠️ BELUM TERVERIFIKASI]` Tenggat menggantikan masa undangan 7 hari (Q38) untuk sesi hasil penugasan. Dasar: action item cadence 18 Nov; belum dikonfirmasi PM.
- `[⏳ DITERIMA]` R2b pembulatan "Dalam batas"; R6 label `pending`; R7 sisa inferensi; R9 "Terkait kompetensi"; R10 mode per penugasan, satu sesi terbuka per orang per proyek, audit setelah commit; R13 tanpa email undangan; kolom Kode menunggu B4; risiko bagian 14.
- `[⚠️ BELUM TERVERIFIKASI]` Atasan boleh menugaskan (cadence 18 Nov). Bila ditolak, perlu guard baru khusus penugasan (guard `staff` dipakai bersama papan dan penugasan), lalu R10b `NOT_ASSIGNER`, R11 cakupan penugas, dan test atasan disesuaikan.
- Penugasan untuk gap kompetensi melebihi kalimat brief ("pilih masalah KPI/OKR") tetapi mengikuti mockup, yang punya tombol wawancara di detail kedua jenis gap.

## 11. Daftar perubahan file

- [x] Buat `apps/api/migrations/20261119000500-tna-penugasan-wawancara.js` (reviewer Andrian, CLAUDE.md aturan 7)
- [x] Ubah `apps/api/src/core/flags/index.js`
- [x] Buat `apps/api/src/modules/tna/gaps.js`
- [x] Buat `apps/api/src/modules/tna/assignment.js`
- [x] Buat `apps/api/src/modules/tna/gap-routes.js`
- [x] Ubah `apps/api/src/modules/tna/index.js` (pasang router)
- [x] Ubah `apps/api/src/modules/interviews/invitation.js` (durasi, helper WIB)
- [x] Ubah `apps/api/src/jobs/interview-reminders.js` (durasi)
- [x] Ubah `apps/api/src/modules/interviews/summary.js` (`SHARED_FIELDS`, milik B6)
- [x] Ubah `apps/api/src/db/lna-stores.js` (kode bersama, reviewer Andrian)
- [x] Buat `apps/api/tests/unit/tna-gaps.test.js`
- [x] Buat `apps/api/tests/integration/tna-gaps.test.js`
- [x] Ubah `docs/ewi/poc-dna-tna.md` (catatan flag baru)
- [x] Kontrak layar web (bagian 16), layar di `apps/web/src/screens/b5-tna/`, `apps/web/e2e/tna-gap.spec.ts`; `gaps.js`/`gap-routes.js` menambah `session.projectId`, `assignedBy`, `open` dan `jobRoleId` di detail

## 12. Review egm atas spek (19 Nov)

Reviewer: subagent baru tanpa konteks percakapan, 20 temuan. Triase:

| # | Temuan | Keputusan |
| --- | --- | --- |
| 1 | Sesi kedaluwarsa memblokir penugasan; tidak bisa membatalkan | **Perbaiki**: definisi "terbuka", pengganti sesi kedaluwarsa (R10), pembatalan (R10b) |
| 2 | Penugasan ganda saat bersamaan | **Perbaiki** dengan transaksi + advisory lock. Unique index **ditolak**: data lama bisa melanggar dan "terbuka" bergantung waktu |
| 3 | Atasan berizin melihat non-pelatihan tentang dirinya | **Perbaiki**: R7 hanya bawahan langsung; `self`/`assignable` di R9 |
| 4 | `interviewed` + `pending` membocorkan temuan tersembunyi | **Perbaiki**: gap yang sudah diwawancarai tanpa temuan terlihat = `review` untuk semua; sisa inferensi dicatat ⏳ |
| 5 | R6 bertentangan, `rejected` dan temuan tak tertaut | **Perbaiki**: tabel keputusan, fokus sesi |
| 6 | "Dalam batas" dan definisi baris gap | **Perbaiki**: R2b, R4 |
| 7 | `due_at` vs `invite_expires_at` | **Perbaiki**: kolom `due_at` dibuang |
| 8 | Isolasi tenant untuk ID dari body | **Perbaiki**: R10 + test |
| 9 | Flag non-pelatihan | **Perbaiki**: R7 |
| 10 | Periode terbaru menurut teks | **Perbaiki**: menurut waktu unggah; tanpa periode diabaikan |
| 11 | Agregasi R5 ambigu | **Perbaiki**: R5 per kasus + `unit`, `valueType`, `peopleTotal` |
| 12 | Kolom Kode, jabatan di detail, kompetensi terkait | **Perbaiki sebagian**: `jobRoles` ditambah; Kode **ditunda** ke B4; kompetensi terkait **ditunda** ⏳ |
| 13 | Kompetensi belum disahkan menjadi target | **Perbaiki**: R2 |
| 14 | "Pengguna aktif" ambigu; beda dengan alur lama | **Perbaiki**: R11 |
| 15 | Serah terima ke B6; teks durasi pengingat | **Perbaiki**: R14, R13 |
| 16 | Satu sesi terbuka per orang vs penugasan per gap | **Tolak** sesi per gap (dua wawancara bersamaan untuk satu orang tidak diinginkan), batas ditulis ⏳; hitungan per gap **ditambah** |
| 17 | Bentuk respons, kode galat, filter | **Perbaiki**: bagian 6 |
| 18 | Alur, proyek di layar, "Langsung ke tinjauan HR" | **Perbaiki**: bagian 7; layar tetap menyusul di atas PR B0 |
| 19 | Penyimpangan BT-29, Q38, email, pembulatan | **Perbaiki** pembulatan dan batas 30 hari; sisanya dicatat ⏳/⚠️ dan diangkat di PR |
| 20 | Indeks, CHECK, audit agregat, test | **Perbaiki** indeks/CHECK/test; audit agregat **ditolak** dengan alasan di R9 |

## 13. Review diff dan code review (19 Nov)

Review diff oleh subagent baru (diff `origin/claude/project-thread-scbrmb...HEAD` + spek B5/B6) dan `mattpocock-skills:code-review` sumbu Standards. Triase untuk B5:

| # | Temuan | Keputusan |
| --- | --- | --- |
| D1 | Penugasan tidak memeriksa gap ada di tenant/cakupan (label OKR teks bebas) | **Perbaiki**: `/assignments` membangun papan yang sama (`board()`), gap tidak ditemukan 404 `NOT_FOUND`, label diambil dari baris gap. |
| D2 | Mode `affected` gap kompetensi menghitung asesmen dari jabatan lama | **Perbaiki**: peserta hanya pemegang kompetensi yang disahkan, sama dengan papan dan detail. |
| D3 | `pending` muncul padahal temuan ada tetapi tersembunyi bagi pemanggil | **Perbaiki**: temuan apa pun selain `rejected` membuat gap minimal `review` (R7). |
| D8 | Atasan membatalkan sesi alur lama mendapat 403 | **Perbaiki**: sesi tanpa penugas atau yang sudah dimulai 409 `INVALID_STATE` lebih dulu (R10b). |
| D9 | Kunci advisory tidak dipakai alur lama `POST /tna/projects/:id/interviews` | **Tunda** `[⏳ DITERIMA]`: alur lama akan diganti layar penugasan B5; mengubah alur lama menyentuh kode bersama di luar paket. Risiko: dua sesi terbuka bila HR memakai kedua alur bersamaan untuk orang yang sama. |
| D11 | Learner mendapat `ROLE_FORBIDDEN` walau flag mati | **Tolak dengan alasan**: urutan peran lalu flag dipakai di semua modul TNA; tidak ada data bocor. Tabel galat: peran diperiksa sebelum flag. |
| D13 | Papan memuat semua periode kinerja tiap request | **Tunda**: optimasi setelah data pilot 26 Nov menunjukkan ukuran nyata. |
| S1 | Pesan galat memuat nama parameter Inggris; `REVIEWED`/helper WIB disalin; perantara `isOpenSession` | **Perbaiki** (4851068). |
| S2 | Tipe `Gap` bersama untuk parser dan kunci (Primitive Obsession, Repeated Switches) | **Tunda**: dikerjakan bersama layar supaya kontrak kunci tidak berubah dua kali. |

## 14. Risiko, batas, dan alternatif yang ditolak

Risiko dan batas yang diterima (backend sudah digabung; masing-masing punya pemicu tinjau ulang):

| # | Risiko / batas | Akibat | Mitigasi atau pemicu |
| --- | --- | --- | --- |
| R-1 | Dua jalur pembuat sesi TNA: alur lama `POST /tna/projects/:id/interviews` (hanya `learner`, `openFor` menghitung sesi `completed` sebagai penghalang, tanpa kunci, tanpa kolom fokus) dan `/assignments` | Saat dipakai bersamaan untuk orang yang sama, bisa terbentuk dua sesi terbuka; ada tiga definisi "terbuka" | **Diangkat ke user**: rekomendasi, saat `tna.interview_assignment` menyala, layar baru hanya memakai `/assignments` dan alur lama dipensiunkan di PR layar. Sampai diputuskan, alur lama tetap |
| R-2 | Identitas gap adalah kunci turunan (`metricKey(name)` + `period`, atau `competencyId`), tidak disimpan | KPI diganti nama atau label periode ditulis berbeda saat impor ulang ("2026-11" vs "Nov 2026") melepas sesi dari gapnya, gap kembali "Belum diwawancarai" | Template impor mewajibkan format periode; tinjau ulang bila data pilot 26 Nov menunjukkan nama KPI berubah |
| R-3 | Impor kinerja hanya menambah baris (`insertPerformance`) | Impor ulang untuk orang + metrik + periode yang sama ikut dihitung ganda di `actual`; detail mengambil baris pertama | Perbaikan di jalur impor (ganti per batch), bukan di B5 |
| R-4 | Papan dihitung ulang tiap permintaan: semua asesmen, semua periode kinerja, sesi, temuan, dan satu kueri kompetensi per posisi; ringkasan dan tab dipanggil terpisah | Biaya naik sebanding ukuran tenant | D13: diukur dengan data pilot 26 Nov sebelum dioptimasi. Kontrak endpoint layar ditetapkan di "Kontrak layar web" |
| R-5 | Mode tanpa `employeeIds` tidak dibatasi; penyisipan berurutan dalam satu transaksi berkunci | Penugasan seluruh tenant memegang kunci proyek lebih lama | Ukuran pilot ELGOS (satu tim L1) jauh di bawah batas ini; batasi bila ada tenant > 200 karyawan per jabatan |
| R-6 | Audit penugasan ditulis setelah commit | Bila audit gagal, sesi sudah ada tanpa baris audit, dan permintaan ulang melaporkan semua `skipped` | Pola yang sama dengan alur lain; ditinjau bila audit gagal terlihat di log |
| R-7 | Skala 0-4 (R3) | Data dengan skala lain salah persen dan gap | Lihat bagian 10 |

Alternatif yang ditolak:

- **Entitas gap tersimpan atau papan yang di-cache** (vs dihitung per permintaan): menambah tabel dan invalidasi saat impor, review, dan sesi berubah, sebelum ada ukuran data nyata. Ditinjau bersama R-2 dan R-4.
- **Satu sesi per gap** (vs satu sesi terbuka per orang per proyek): dua wawancara bersamaan untuk satu orang tidak diinginkan; sesi berisi beberapa gap menambah migrasi dan prompt multi-fokus di B6.
- **Kolom `due_at` terpisah** (vs tenggat = `invite_expires_at`): perpanjangan HR tidak otomatis menggeser tenggat yang dilihat karyawan.
- **Unique index sesi terbuka** (vs advisory lock): data lama bisa melanggarnya dan "terbuka" bergantung waktu.
- **Rumus Pareto BT-30 (`tna/pareto.js`)** (vs kontribusi kumulatif gap): KPI mockup "KONTRIBUSI 4 GAP TERBESAR" adalah porsi gap, bukan skor prioritas pelatihan.
- **Periode terbaru menurut urutan teks** (vs waktu unggah): format periode bebas.

## 15. egm-review dengan plugin (19 Nov)

Dijalankan ulang dengan plugin egm (`egm-review` mode laporan gabungan, tahap 5–9) karena review sebelumnya manual. Reviewer ikan mas dipanggil langsung sebagai agent `egm:egm-*` (zoom-out, inventive-catalyst, comprehension, design, structural, style, implementation-readiness, codebase-details), dengan konteks hanya dokumen dan file yang dirujuk. Laporan: `/mnt/project-files/elgos-eksekusi/egm-b5-b6/b5/`. Triase (`egm-resolve`), dikelompokkan per tema:

| Tema (temuan) | Keputusan |
| --- | --- |
| Aturan R6/R7/R10/R10b tertinggal dari D1, D2, D3, D8 (Stage 5 F6; Stage 6 M1, M2; Stage 7 T-B1, D-M2, S-M2, T-M10; Stage 8 #2; Stage 9 IR-M5, style M1) | **Perbaiki**: tabel R6 ditulis ulang, R10 memuat pemeriksaan gap di papan dan pemegang kompetensi, R10b memuat urutan 404/409/403 |
| Tidak ada alternatif dan risiko (Stage 7 D-B1, S-B1, S-B2, D-M1) | **Perbaiki** sesuai Stage 8 #5: bagian 14 yang ringkas, bukan bagian formal panjang. Turun ke Major karena backend sudah digabung |
| Dua jalur pembuat sesi (Stage 5 M1, F2; Stage 7 D-M5, S-M1, T-M12; Stage 8 #1) | **Eskalasi ke user** (R-1). Ditolak: kunci di alur lama dan partial unique index (memperpanjang hidup dua jalur) |
| Kontrak layar: endpoint gabungan, `assignable` vs kelayakan, sumber `jobRoleId` dan kandidat `all_job_role`, status sesi dan tombol batal (Stage 5 M2, M4, F4; Stage 7 D-M7; Stage 8 #3, #4; Stage 9 IR-B1, IR-M2, IR-M3, IR-M4) | **Tunda ke "Kontrak layar web"**, ditulis dan direview sebelum PR layar dibuka (aturan 11 langkah 1–2). Kontrak belum dipakai layar mana pun, jadi masih murah diubah |
| Pernyataan masalah, non-goals, legenda penanda, kode keputusan, nama orang (Stage 6 M3, M6; Stage 7 S-M4, S-M5, S-N1, T-N2, T-N4) | **Perbaiki**: bagian 1, baris status, legenda |
| `period`/`jobRoleId`, `cumulativeShare` null, `peopleTotal`, `valueType`, `metricKey`, urutan OKR, respons cancel, amplop galat, kasus `employeeIds` (Stage 6 M5, N8–N10; Stage 7 T-M7, T-M8, S-N3; Stage 9 IR-M6, IR-M7, CD-M1, CD-M2) | **Perbaiki**: R4, R5, R9, R10, bagian 6 |
| Alasan batas sesi per proyek salah; jaminan konkurensi terlalu luas (Stage 5 F3; Stage 6 M4; Stage 7 D-M4, T-M11, T-M12) | **Perbaiki** kalimatnya (R10). Ditolak: sesi berisi beberapa gap (YAGNI) |
| Email undangan tanpa pemilik (Stage 5 M3, F5) | **Perbaiki** R13 (pemilik diangkat ke user). Ditolak: jenis email undangan baru di B5 |
| Audit setelah commit (Stage 5 F1) | **Terima** sebagai R-6. Ditolak: kunci idempoten atau outbox untuk kegagalan langka |
| Baris kinerja ganda, identitas gap turunan, biaya papan, batas batch (Stage 7 D-B1, D-M3, D-M6; Stage 9 CD-N18) | **Catat** sebagai R-2 sampai R-5; optimasi menunggu data pilot (D13) |
| Daftar file dan susunan kode (Stage 5 N1; Stage 9 IR-M8, CD-M3, CD-M6, CD-N7) | **Perbaiki** bagian 8 (per tanggung jawab, arah dependensi) dan 11 (Buat/Ubah, path lengkap) |
| Setup test integrasi; test periode salah tempat (Stage 9 CD-M4, CD-M5) | **Perbaiki** bagian 9 |
| `peopleMissed` menghitung baris (Stage 7 T-M8) | **Tolak**: `okrGaps` menghitung karyawan berbeda (`new Set(... userId)`), sekarang dinyatakan di R5 |
| Skala global (Stage 5 F7) | **Tolak**: `toPct` satu titik konversi + ⚠️ R3 cukup sampai data 26 Nov |
| Glosarium "masalah", "non-pelatihan" di prosa (Stage 5 N4; Stage 7 T-M13, S-N4) | **Perbaiki** di bagian 1 dan R7; nilai enum `non_training` tetap |
| Duplikasi `latestScores`/`computeGap` dan `parseGap`/`parseGapQuery`, `getCompetency` redundan, indeks fokus tanpa kueri (Stage 5 N2, N3; Stage 9 CD-N8, CD-N9, CD-N15) | **Tunda** ke S2 (tipe `Gap` bersama, dikerjakan bersama layar); usulan `/mattpocock-skills:to-tickets` ke user |
| DDL disalin, log triase panjang, gaya kalimat lain (Stage 5 N6, N7; Stage 7 T-N, S-N2, S-N5; Stage 9 style N) | **Tolak sebagian**: DDL dipertahankan karena reviewer migrasi (Andrian) membacanya di sini; log triase dipertahankan sebagai riwayat; kalimat yang ambigu diperbaiki |

Cek drift (`egm-drift-report`, `/mnt/project-files/elgos-eksekusi/egm-b5-b6/2026-11-19_DRIFT_REPORT.md`) dan code review (`mattpocock-skills:code-review`, sumbu Standards dan Spec) di PR susulan:

| Temuan | Keputusan |
| --- | --- |
| `GET /gaps/detail` tidak menolak `period` > 32 karakter | **Perbaiki** di kode (`parseGapQuery`), test merah lebih dulu di `tna-gaps.test.js` |
| R7 menunjuk `visibleCategories`; R5 `actual` dan isian bawaan; R2 cakupan `unapprovedCompetencies`; R8/R9 sesi `abandoned`; R14 `assignedBy`; R14 allowlist hanya untuk detail sesi | **Perbaiki** teks spek agar sesuai kode |
| `assignedBy` (ID penugas) terkirim ke semua peran | **Terima**: nama penugas sudah tampil; ID HR bukan data karyawan yang dinilai |

## 16. Kontrak layar web (B5, rute `tna`)

Ditulis sebelum PR layar (aturan 11 langkah 1). Dasar: B0 bagian 4 dan 5.3, mockup Pak Eji layar `tna` dan `gap` (`/mnt/project-files/mockup-pak-eji/Main.dc.html`). Folder `apps/web/src/screens/b5-tna/`.

**Rute** (`routes.ts`, datar, tanpa `children`):

| Nama | Path | `meta` |
| --- | --- | --- |
| `tna` | `/tna` | `views: ['hr','atasan','karyawan','admin','super']`, `submodule: 'tna'`, `menuKey: 'tna'`, `title: 'Training Needs'` |
| `tna-gap` | `/tna/gap` (query `kind`, `competencyId` atau `metricType`, `name`, `period`, ditambah `tab` asal) | `views: ['hr','atasan','admin','super']` (tanpa `karyawan`: API menolak learner), `submodule: 'tna'`, `flag: 'tna.gap_board'`, `roles: ['hr_admin','eta_admin','supervisor']` (peran R1), `menuKey: 'tna'`, `title: 'Detail gap'` |
| `tna-lama` | `/m/tna` | `redirect: { name: 'tna' }` |

- Daftar `views` lima tampilan sampai B8 (`my`), B11, dan B12 memasang beranda masing-masing (aturan 6 koordinator); otorisasi tetap di API. Rute anak mengulang gerbang induknya (aturan 2).
- Rute `tna` **tidak** memakai `meta.flag`: fitur lama (impor, KPI rule, jadwal, undangan, pareto, temuan, akses non-pelatihan, training plan) harus tetap terbuka saat `tna.gap_board` mati. Flag papan diperiksa di layar. Alasan yang sama dengan B10 `aiv`.
- Folder `screens/legacy-tna/` dihapus. `views/TnaView.vue` dipindah menjadi `screens/b5-tna/TnaPengelolaan.vue` (tanpa `<AppShell>`, isi dan `data-testid` sama: `tna-my-sessions`, `tna-stats`, `tna-pareto`, `tna-findings`, `tna-invites`, `tna-non-training`, `tna-non-training-access`, `tna-plan`, `tna-review-banner`, `tna-scope-note`). Tautan sesi karyawan menjadi `/iv/:id` (rute B6). Tautan review tetap `/m/tna/review` sampai B7.
- Jalur penugasan (R-1): saat `tna.interview_assignment` menyala, formulir "Jadwalkan wawancara TNA" lama disembunyikan dan penugasan hanya lewat detail gap. Bila user memilih mempertahankan dua alur, formulir lama tetap tampil (satu `v-if`).

**Layar `tna`** (`TnaScreen.vue`): breadcrumb "Learning Needs Analysis › Training Needs", `<h1>` "Training Needs".
- Papan tampil bila `tna.gap_board` menyala, tampilan aktif bukan `karyawan`, **dan** `session.roles` memuat `hr_admin`, `eta_admin`, atau `supervisor` (peran yang diterima R1; `pimpinan`, `role_leader`, `tenant_admin` akan mendapat 403 `ROLE_FORBIDDEN`). Bila tidak, layar tidak memanggil `/gaps/*` sama sekali (tidak ada galat tambahan). `UiTabs` `id="tna-tab"`, `label="Bagian Training Needs"`: "Ringkasan", "Gap kompetensi", "Gap OKR" (kunci `ringkasan`, `kompetensi`, `okr`; tab disimpan di query `tab`).
  - Ringkasan: empat `UiKpiCard` dari `GET /gaps/summary`: "GAP KOMPETENSI", "GAP OKR", "SUDAH DIWAWANCARAI" (`interviewed` / `totalGaps`), "KONTRIBUSI 4 GAP TERBESAR" (`top4Share` sebagai persen; "–" bila `totalGaps = 0`, karena API mengirim 0); kartu "Klasifikasi gap" (empat nilai `classification`, `UiProgressBar` bernilai jumlah / `totalGaps` × 100); ringkasan memakai periode yang sama dengan tab OKR (ganti periode memuat ulang ringkasan dan tab OKR); kartu "Alur dari gap ke solusi" (teks mockup). Bila `unapprovedCompetencies > 0`: `UiNote` "n kompetensi menunggu pengesahan HR sebelum dipakai sebagai target".
  - Gap kompetensi: `UiDataTable` dari `GET /gaps/competencies`: Kompetensi, Target (`targetPct`), Aktual (`actualPct`), Gap (`gapPct` + bar), Orang (`peopleWithGap` dari `assessed`), Status wawancara, Klasifikasi. Kolom Kode mockup ditunda (B4). Nama kompetensi adalah tautan (slot `#cell-name` `UiDataTable`, yang tidak punya klik baris) ke `tna-gap`.
  - Gap OKR: pemilih periode (`periods`, nilai awal `period`), tabel dari `GET /gaps/okr`: Key result, Target, Aktual, Selisih (`diff` + `unit`), Orang (`peopleMissed` dari `peopleTotal`), Status wawancara, Klasifikasi. Nama key result adalah tautan ke `tna-gap`.
  - Label klasifikasi (`labels.ts`, satu peta bersama): `training` "Training Needs", `non_training` "Improvement Needs", `review` "Perlu ditinjau HR", `pending` "Belum diwawancarai", `ok` "Dalam batas". Status wawancara: "n selesai · n berjalan" dari `interviewedCount`/`assignedCount`.
  - Galat API tampil di `UiErrorSummary`; tabel kosong memakai `emptyText` "Belum ada gap. Impor data asesmen atau kinerja lebih dulu."
- Di bawahnya selalu `TnaPengelolaan` (judul `<h2>` "Pengelolaan TNA" bila papan tampil).

**Layar `tna-gap`** (`TnaGapView.vue`, `GET /gaps/detail`): breadcrumb "Training Needs › Detail gap" (kembali ke tab asal), chip jenis ("Gap kompetensi"/"Gap OKR"), `<h1>` nama, chip klasifikasi; tiga `UiKpiCard` TARGET, AKTUAL, GAP (kompetensi: `targetPct`, `actualPct`, `gapPct` dengan "%"; OKR: `target`, `actual`, `diff` dengan `unit`; "–" bila `null`); kartu "Bukti yang terdeteksi" (`evidence`) dan "Hipotesis awal (belum terverifikasi)" (`hypotheses`) dengan kalimat mockup "Gap hanya menunjukkan adanya masalah. Penyebabnya dicari lewat wawancara."; tabel karyawan (Nama, Jabatan, Nilai "n / target" atau "Belum dinilai" bila `value` `null`, lalu untuk OKR "Tercapai"/"Belum tercapai" dari `isMet`; Wawancara: status sesi + tenggat WIB; "(Anda)" bila `self`). `employees[].session` memuat `{ id, status, inviteExpiresAt, projectId, assignedBy, open }` dan `employees[]` memuat `jobRoleId` (ditambahkan untuk layar ini; `open` memakai definisi `isOpen` server).
- Kartu "Cari akar masalah" (tampil bila `tna.interview_assignment` menyala): formulir penugasan.
  - Proyek (`GET /api/projects`, `data[].status`, hanya yang bukan `closed`; bila satu, terpilih otomatis);
  - "Siapa yang diwawancarai": "Karyawan yang terdampak gap ini" (`affected`) atau "Semua karyawan di jabatan" (`all_job_role`, lalu pilih jabatan dari `GET /tna/job-roles`, nilai awal dari `defaults`). `GET /tna/job-roles` hanya untuk HR, jadi pilihan `all_job_role` hanya tampil untuk `hr_admin`/`eta_admin`; atasan memakai `affected` `[⏳ DITERIMA]`;
  - mode `affected`: daftar centang karyawan yang memenuhi R10 (`assignable`, dan kompetensi `gap > 0` atau OKR `isMet === false`), tanpa yang punya sesi `open` di proyek terpilih (opsional; kosong = semua hasil mode, `employeeIds` tidak dikirim). Mode `all_job_role`: tanpa daftar centang, `employeeIds` tidak dikirim; jabatan awal dari `defaults` (di tingkat atas respons `/tna/job-roles`, di samping `data`);
  - Tenggat (`<input type="date">`, min besok, max +30 hari WIB) dan Durasi ("15 menit", "30 menit");
  - tombol "Tugaskan wawancara". Hasil: `UiStatus` "n wawancara ditugaskan, n dilewati (sudah punya sesi terbuka)". Galat 400/409 dipetakan ke pesan API apa adanya di `UiErrorSummary`, field terkait ditandai.
  - Tombol "Batalkan" (nama aksesibel "Batalkan penugasan <nama>", `POST /assignments/:id/cancel`) hanya pada sesi `scheduled` dan `open` yang punya `assignedBy`, dan hanya bila pemanggil HR/Admin ETA atau `assignedBy === user.id`. 403/409 dari API tetap ditampilkan sebagai galat.
  - Tombol "Langsung ke tinjauan HR" (`/m/tna/review`) hanya untuk peran `hr_admin`/`eta_admin`.
- Detail dimuat ulang setelah penugasan dan pembatalan.

**Klien API** `screens/b5-tna/api.ts` (tidak mengubah `api/lna.ts`): `gapSummary`, `gapCompetencies`, `gapOkr`, `gapDetail`, `assign`, `cancelAssignment`, `projects`, `jobRoles`. Tipe mengikuti bagian 6.

**Test e2e lebih dulu** (`apps/web/e2e/tna-gap.spec.ts`, `page.route`): flag papan mati → tab tidak ada, `tna-findings` tetap; flag nyala (HR) → KPI, tab kompetensi dengan label klasifikasi, klik baris → detail dengan bukti dan karyawan; penugasan mengirim body yang benar (mode, employeeIds terpilih, dueDate, durationMinutes) dan menampilkan hasil; `NOT_ASSIGNER` tampil; `/m/tna` dialihkan ke `/tna`; atasan tidak melihat tombol tinjauan HR. `e2e/poc-dna-tna.spec.ts` tetap lulus untuk halaman TNA tanpa diubah (testid sama, `/m/tna` dialihkan). Yang diubah hanya langkah wawancara di test learner, karena layar wawancara diganti B6: tombol "Lanjut ke wawancara" (bukan "Setuju dan mulai" yang nonaktif), dan setelah "Selesai dan kirim" URL menjadi `/iv` (bukan `/m/tna`).

Asumsi: `[⚠️ BELUM TERVERIFIKASI]` R-1 (formulir lama disembunyikan); `[⏳ DITERIMA]` papan dihitung tiga kali per halaman (R-4); kolom Kode mockup menunggu B4; `TnaPengelolaan` memilih isi dari peran asli, jadi saat B8 memasang ganti tampilan, HR di tampilan "Karyawan (saya)" masih melihat data HR di `/tna` (sama dengan B0 5.1) sampai B8 punya halaman sendiri.

### 16.1 Review kontrak layar (19 Nov)

Ikan mas `egm:egm-design` dan `egm:egm-implementation-readiness`, konteks hanya bagian 16, B0 bagian 4–5, kode web/API yang dirujuk, mockup, dan e2e lama. Triase (`egm-resolve`):

| Temuan | Keputusan |
| --- | --- |
| Langkah wawancara di `poc-dna-tna.spec.ts` tidak bisa lulus tanpa diubah (tombol persetujuan, URL sesudah kirim, mock tanpa `step`) | **Perbaiki**: perubahan test disebut terang di bagian 16 dan B6 bagian 15; `step` diturunkan dari `status` bila tidak ada |
| Tombol "Batalkan" tidak bisa diputuskan dari data | **Perbaiki** di API (test merah lebih dulu): `employees[].session` membawa `projectId`, `assignedBy`, `open`; `employees[]` membawa `jobRoleId` |
| Daftar centang menawarkan orang yang tidak memenuhi; "terbuka" tidak didefinisikan; sesi di proyek lain menyembunyikan orang | **Perbaiki**: kelayakan R10 dan `open` per proyek terpilih |
| Peran `pimpinan`/`role_leader`/`tenant_admin` mendapat 403; learner bisa membuka detail | **Perbaiki**: papan berdasarkan peran R1; `tna-gap` tanpa `karyawan` + `meta.roles` |
| `UiDataTable` tanpa klik baris; satuan KPI detail; nilai `null`; id/label `UiTabs`; penyebut `UiProgressBar`; `top4Share` tidak pernah `null`; periode ringkasan vs tab OKR; `tab` di query; `status` proyek dan `defaults` | **Perbaiki** teks bagian 16 |
| HR di tampilan "Karyawan (saya)" masih melihat data HR di `/tna` | **Terima** (⏳), sama dengan B0 5.1 sampai B8 |
| Atasan tidak bisa memilih jabatan (`/tna/job-roles` hanya HR) | **Terima** (⏳): atasan memakai `affected` |

### 16.2 Code review layar (`mattpocock-skills:code-review`, 19 Nov)

Dua sumbu paralel atas `git diff 3bf15c2...HEAD` (layar B5/B6 dan kolom API detail). Triase (`egm-resolve`); perbaikan di commit "Perbaiki temuan code review layar B5/B6", test merah lebih dulu:

| Sumbu | Temuan | Keputusan |
| --- | --- | --- |
| Spec | `assignedBy` selalu `null` karena `gapSessions` tidak memilih `assigned_by`, jadi tombol Batalkan tidak pernah muncul (unit test menyuntik kolom itu sendiri) | **Perbaiki**: store memilih `assigned_by`; test integrasi detail memeriksa `projectId`, `assignedBy`, `open`; test alur `alur-gap-wawancara.test.js` gagal tanpa perbaikan ini |
| Spec | Galat 400/409 penugasan tidak menandai field | **Perbaiki**: validasi peramban (proyek, jabatan, tenggat) dan galat API dipetakan ke field (`tna-project`, `tna-jobrole`, `tna-due`, `tna-employees`) lewat `UiField`, tautan di `UiErrorSummary` |
| Spec | Kolom "Wawancara" dan "Belum ada" | **Perbaiki**: "Status wawancara", selalu "n selesai · n berjalan" |
| Standards | Panel tab tanpa `role="tabpanel"`; kelas formulir sendiri; tautan tinjauan memakai path | **Perbaiki**: panel `tna-tab-panel-*`, `el-input`/`el-check`, rute bernama `tna-review`; `watch(fullPath)` mengosongkan detail dan galat lama |
| Spec | Nama klien API berbeda dari teks spek (`gaps.summary` dst.) | **Tolak**: nama hanya internal layar; perilaku dan rute sama |
| Spec | Teks pengantar, judul "Perlu dikerjakan"/"Riwayat", label "Ditugaskan"/"Undangan berakhir" tidak disebut spek | **Terima**: dari mockup, tidak mengubah kontrak |
| Spec | Perubahan `gating.spec.ts`/`shell.spec.ts` di luar spek | **Terima**: dipaksa judul `Training Needs` dan menu `iv` baru; dicatat di sini |
| Standards | Duplikasi `call`/`post`, `ALL_VIEWS`, pola `ApiError ? message : …`; `tna.css` dipakai B6 | **Tunda** ke `/mattpocock-skills:to-tickets` bersama tipe Gap bersama |
| Standards | `assignedBy` (id pengguna) ikut terkirim ke atasan | **Terima**: id saja, tanpa nama; dibutuhkan untuk tombol Batalkan atasan penugas |
