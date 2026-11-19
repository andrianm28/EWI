# B5 · Training Needs (backend)

Status: spek untuk direview. Paket B5 dari `brief-bangun-penuh-19nov.md` (thread T4). Layar (web) menyusul di atas PR B0 dan akan menambah bagian "Layar" di dokumen ini.

## 1. Tujuan

HR dan atasan melihat **gap** sebagai daftar masalah yang bisa ditindaklanjuti, bukan hanya daftar temuan per orang:

1. gap kompetensi tim terhadap Job Competency Model (kamus kompetensi jabatan);
2. gap OKR/KPI/SLA (target meleset setelah toleransi per KPI, PM-1);
3. klasifikasi tiap gap (Training Needs, Improvement Needs, Perlu ditinjau HR);
4. detail gap dengan bukti dan hipotesis awal;
5. **penugasan wawancara akar masalah**: pilih gap, pilih karyawan, tenggat, durasi 15 atau 30 menit (action item cadence 18 Nov).

Di luar cakupan B5: percakapan wawancara dan ringkasan (B6), tinjauan HR dan solusi (B7), layar karyawan (B8), tindakan perbaikan (B9).

## 2. Layar mockup Pak Eji yang dicakup

`project/Main.dc.html`, layar `tna` dan `gap`:

- Tab **Ringkasan**: 4 kartu KPI (GAP KOMPETENSI, GAP OKR, SUDAH DIWAWANCARAI "x dari y gap", KONTRIBUSI 4 GAP TERBESAR), "Klasifikasi gap" (3 batang), "Alur dari gap ke solusi" (teks statis di web).
- Tab **Gap kompetensi**: tabel Kode, Kompetensi, Target, Aktual, Gap, Klasifikasi.
- Tab **Gap OKR**: tabel Key result, Target, Aktual, Selisih, Klasifikasi.
- **Detail gap**: jenis, judul, klasifikasi, TARGET/AKTUAL/GAP, "Bukti yang terdeteksi", "Hipotesis awal (belum terverifikasi)", tombol "Mulai wawancara akar masalah" dan "Langsung ke tinjauan HR".

Yang tidak ada di mockup tetapi sudah diputuskan dan dibangun di sini: penugasan dengan tenggat dan durasi, mode peserta (BT-29), toleransi KPI.

## 3. Data yang sudah ada (tidak diubah)

| Data | Tabel / fungsi | Catatan |
| --- | --- | --- |
| Kamus kompetensi | `lna_competencies` (`required_score` 0-4, `importance`) | `stores.dna.competenciesForPosition` |
| Skor karyawan | `lna_assessments` (skor 0-4, beberapa baris per orang per kompetensi) | skor terbaru yang dipakai, sama dengan `modules/dna/gap.js` |
| Kinerja | `lna_performance_records` (`is_met`, `tolerance`, `direction`, `period`, `metric_type`, `name`) | `is_met` sudah menghitung toleransi (PR #13) |
| Temuan | `lna_findings` (`category`, `review_status`, `competency_id`, `performance_record_id`) | hanya `approved`/`edited` yang dipakai di luar antrean review (PR #16) |
| Sesi wawancara | `lna_interview_sessions` | undangan 7 hari + pengingat H-3/H-1 (PR #12) |
| Akses atasan ke temuan non-pelatihan | `lna_non_training_grants` | K1 / PM-6 (PR #12) |

## 4. Aturan bisnis

- **R1 Cakupan data (RG-3).** Semua agregat dihitung hanya dari karyawan dalam `scopeFor(req)`: HR dan Admin ETA semua, atasan dirinya dan bawahan langsung. Karyawan (learner) ditolak 403 di semua endpoint gap dan penugasan. `tenant_id` selalu dari `req.tenantId`.
- **R2 Gap kompetensi.** Per kompetensi yang berlaku untuk posisi karyawan dalam cakupan: `target` = `required_score`, `aktual` = rata-rata skor terbaru karyawan yang sudah dinilai, `gap` = max(0, target − aktual), `peopleWithGap` = jumlah karyawan dengan skor terbaru < target, `assessed` = jumlah yang sudah dinilai. Kompetensi tanpa satu pun penilaian tidak ditampilkan sebagai gap (`assessed` = 0 dilewati).
- **R3 Skala.** Sistem menyimpan skor 0-4. Mockup menampilkan 0-100. API mengirim keduanya: nilai asli dan `targetPct`/`actualPct`/`gapPct` (= nilai / 4 × 100, dibulatkan). `[⚠️ BELUM TERVERIFIKASI]` Data DNA Mas Abdan (masuk 26 Nov) mungkin memakai skala lain; konversi ada di satu fungsi (`toPct`) supaya mudah diganti.
- **R4 Pareto.** Baris diurutkan gap menurun. `cumulativeShare` = kumulatif gap ÷ total gap. KPI "kontribusi 4 gap terbesar" = `cumulativeShare` baris ke-4 (atau baris terakhir bila kurang dari 4). Rumus Pareto prioritas pelatihan `tna/pareto.js` (BT-30) tidak diubah dan tidak dipakai di sini; ini hanya kontribusi gap skor seperti di mockup.
- **R5 Gap OKR.** Satu gap = satu metrik (`metric_type` + nama dinormalkan lewat `metricKey`) pada satu periode, dari baris `is_met = false` dalam cakupan. Bila `period` tidak dikirim, dipakai periode terbaru yang punya data dalam cakupan (urutan teks menurun). Tiap baris: `target` dan `actual` rata-rata bila semua baris punya target yang sama, selain itu `target = null` dan `targetVaries = true`; `peopleMissed`; `tolerance`; `direction`; `diff` = aktual − target (bertanda).
- **R6 Klasifikasi gap.** Dihitung dari temuan **yang sudah direview** (`approved`/`edited`) yang tertaut ke gap itu (kompetensi: `competency_id`; OKR: `performance_record_id` milik metrik + periode itu), dalam cakupan pemanggil:
  - hanya temuan `training` → `training` (label "Training Needs");
  - hanya temuan `non_training` → `non_training` ("Improvement Needs");
  - keduanya, atau masih ada temuan `draft` → `review` ("Perlu ditinjau HR");
  - belum ada temuan → `pending` ("Belum diwawancarai"). Label ini tidak ada di mockup (mockup memakai data contoh yang sudah berklasifikasi); ditambahkan supaya gap yang belum diwawancarai tidak diberi klasifikasi palsu. `[⏳ DITERIMA]` dicatat di PR untuk dikonfirmasi Pak Eji.
- **R7 K1 untuk atasan.** Atasan tanpa izin aktif di `lna_non_training_grants` tidak boleh tahu ada temuan non-pelatihan: untuk atasan itu temuan `non_training` dan temuan `draft` tidak ikut dihitung di R6 (jadi gap bisa tampil `pending` atau `training`). HR dan Admin ETA selalu menghitung semuanya. Atasan yang punya izin menghitung `non_training` yang sudah direview, tetap tanpa `draft`.
- **R8 "Sudah diwawancarai".** Gap dihitung sudah diwawancarai bila ada minimal satu sesi TNA berstatus `completed` yang ditugaskan untuk gap itu (kolom fokus di R10) atau, untuk gap OKR, yang `trigger_record_ids`-nya memuat baris metrik itu.
- **R9 Detail gap.** Mengembalikan header (R2/R5), `evidence` (kalimat yang dibangun dari data: rata-rata skor vs target, jumlah orang di bawah target, skor terendah-tertinggi; untuk OKR: jumlah orang meleset, rata-rata realisasi, periode, toleransi), `hypotheses` (tiga hipotesis tetap dari mockup, ditandai belum terverifikasi), daftar `employees` dalam cakupan (id, nama, nilai individu, gap individu, status sesi terakhir untuk gap ini), dan `classification`. Karena memuat data individu, pembacaan dicatat lewat `audit.readIndividual` (R2-2). Teks bukti tidak memuat nama karyawan.
- **R10 Penugasan wawancara.** HR atau atasan memilih satu gap dan karyawan:
  - `gap.kind = 'okr'` (`metricType`, `name`, `period`) atau `gap.kind = 'competency'` (`competencyId`);
  - `mode = 'affected'` (hanya karyawan yang bermasalah pada gap itu) atau `mode = 'all_job_role'` (semua karyawan di `jobRoleId`), sesuai BT-29. `employeeIds` opsional mempersempit ke karyawan yang dipilih; id di luar hasil mode atau di luar cakupan ditolak 400 (`EMPLOYEE_NOT_ELIGIBLE`), tidak dilewati diam-diam;
  - `dueDate` (YYYY-MM-DD, tanggal WIB) wajib, minimal besok dan maksimal 60 hari ke depan. Undangan berakhir pada 23.59.59 WIB tanggal itu: `invite_expires_at` diisi dari tenggat, menggantikan bawaan 7 hari. Pengingat H-3/H-1 (PR #12) otomatis mengikuti. HR tetap bisa memperpanjang lewat endpoint `extend` yang ada;
  - `durationMinutes` wajib 15 atau 30;
  - `projectId` wajib (sesi selalu milik proyek);
  - siapa yang boleh ditugaskan mengikuti R11;
  - karyawan yang sudah punya sesi TNA terbuka (`scheduled`/`in_progress`) di proyek itu dilewati dan dilaporkan di `skipped` beserta alasannya;
  - untuk gap OKR, `trigger_record_ids` diisi baris metrik milik karyawan itu yang meleset pada periode itu (kosong untuk yang tidak meleset pada mode `all_job_role`);
  - setiap penugasan dicatat audit (`create`, `tna.interview_assignment`) dengan penugas, karyawan, gap, tenggat, durasi.
- **R11 Siapa yang bisa ditugaskan.** Semua pengguna aktif dalam cakupan penugas kecuali dirinya sendiri, apa pun perannya (K2: HR dan atasan juga karyawan). Admin ETA tidak pernah menjadi peserta.
- **R12 Flag.** Dua flag baru, default mati: `tna.gap_board` (endpoint gap) dan `tna.interview_assignment` (penugasan). Semua endpoint sudah berada di router TNA yang dipasang lewat `requireSubmodule('tna')` (`module.tna`). Alur lama `POST /tna/projects/:id/interviews` tetap ada dan tidak berubah.
- **R13 Email.** B5 tidak mengirim email undangan saat penugasan (alur lama juga tidak). Pengingat H-3/H-1 tetap jalan. `[⏳ DITERIMA]` email undangan 1 Des dikirim manual/oleh paket lain; dicatat di PR.

## 5. Migrasi (blok 05)

`20261119000500-tna-penugasan-wawancara.js`, raw SQL dengan `down`:

```sql
ALTER TABLE lna_interview_sessions
  ADD COLUMN assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN due_at timestamptz,
  ADD COLUMN duration_minutes smallint CHECK (duration_minutes IN (15, 30)),
  ADD COLUMN focus_kind varchar(16) CHECK (focus_kind IN ('okr', 'competency')),
  ADD COLUMN focus_competency_id uuid REFERENCES lna_competencies(id) ON DELETE SET NULL,
  ADD COLUMN focus_metric_type varchar(8),
  ADD COLUMN focus_metric_key varchar(255),
  ADD COLUMN focus_period varchar(32),
  ADD COLUMN focus_label varchar(255);
CREATE INDEX lna_sessions_focus_idx ON lna_interview_sessions (tenant_id, focus_kind, focus_competency_id, focus_metric_key);
```

Semua kolom boleh kosong, jadi sesi lama dan alur lama tidak terpengaruh. `focus_label` (nama kompetensi atau nama KPI) bukan data pribadi dan tidak dienkripsi. `down` menghapus indeks dan kolom.

## 6. Endpoint

Semua di bawah `/api/tna`, sesudah `auth`, `tenantContext`, `requireSubmodule('tna')`. Peran: HR, Admin ETA, atasan. Galat memakai `core/errors` dengan pesan Indonesia.

| Metode | Path | Flag | Isi |
| --- | --- | --- | --- |
| GET | `/gaps/summary?period=&jobRoleId=` | `tna.gap_board` | `{ kpis: { competencyGaps, okrGaps, interviewed, totalGaps, top4Share }, classification: { training, non_training, review, pending }, period }` |
| GET | `/gaps/competencies?jobRoleId=` | `tna.gap_board` | daftar R2 + R4 + R6 + `interviewed` |
| GET | `/gaps/okr?period=` | `tna.gap_board` | daftar R5 + R6 + `interviewed`, plus `period` yang dipakai dan `periods` yang tersedia |
| GET | `/gaps/detail?kind=competency&competencyId=` atau `?kind=okr&metricType=&name=&period=` | `tna.gap_board` | R9; 404 bila gap tidak ada dalam cakupan |
| POST | `/assignments` | `tna.interview_assignment` | R10; 201 `{ assigned: [{ sessionId, employeeId, dueAt, durationMinutes }], skipped: [{ employeeId, reason }] }` |

`GET /tna/sessions` dan `GET /tna/sessions/:id` (sudah ada, sudah dibatasi cakupan) ditambah kolom `assignedByName`, `dueAt`, `durationMinutes`, `focusKind`, `focusLabel` supaya daftar penugasan dan undangan karyawan tidak butuh endpoint baru.

## 7. Susunan kode

- `apps/api/src/modules/tna/gaps.js`: fungsi murni tanpa DB. `toPct`, `competencyGaps({ people, competenciesByPosition, assessments })`, `okrGaps(records)`, `classify(findings, { includeNonTraining, includeDraft })`, `evidenceFor(...)`, `HYPOTHESES`.
- `apps/api/src/modules/tna/assignment.js`: fungsi murni. `parseDueDate(str, now)` (akhir hari WIB), `validateAssignment(body)`, `eligibleEmployees({ mode, gap, members, records, assessments })`.
- `apps/api/src/modules/tna/gap-routes.js`: router Express untuk tabel di bagian 6, dipasang dari `tna/index.js` dengan `r.use(gapRouter(deps))`.
- `apps/api/src/db/lna-stores.js`: `tna.findingsForGaps(tenantId, scope, { statuses })` (kolom minimal, tanpa judul/rincian sehingga tidak perlu dekripsi), `tna.latestPeriod(tenantId, scope)`, `interviews.createAssigned(...)`, `interviews.focusSessions(tenantId, scope)`; `interviews.list/get` ditambah kolom penugasan.
- `apps/api/src/core/flags/index.js`: dua flag baru.

## 8. Test yang ditulis lebih dulu

Unit (`tests/unit/tna-gaps.test.js`):
- R2/R3/R4: rata-rata skor terbaru, gap, persen, urutan, kontribusi kumulatif, kompetensi tanpa penilaian dilewati.
- R5: pengelompokan per metrik + periode, target beragam, selisih bertanda untuk arah `lower`.
- R6/R7: empat hasil klasifikasi; atasan tanpa izin tidak terpengaruh temuan non-pelatihan dan draf.
- R10: tenggat (kemarin, hari ini, besok, > 60 hari, format salah; batas akhir hari WIB), durasi selain 15/30, mode `affected` vs `all_job_role`.

Integrasi (`tests/integration/tna-gaps.test.js`, Postgres):
- flag mati → 403 `FEATURE_DISABLED` untuk kelima endpoint;
- HR melihat semua; atasan hanya timnya (angka berbeda); karyawan 403; tenant lain kosong;
- klasifikasi berubah `pending` → `review` (draf) → `training` setelah HR menyetujui; atasan tanpa izin tetap `pending` saat hanya ada temuan non-pelatihan, berubah setelah HR memberi izin;
- detail gap mencatat audit baca; gap di luar cakupan → 404;
- penugasan: HR menugaskan gap OKR mode `affected` (hanya yang meleset, `trigger_record_ids` terisi, `invite_expires_at` = akhir hari tenggat WIB); atasan menugaskan bawahan, ditolak untuk orang di luar timnya dan untuk dirinya; mode `all_job_role` butuh `jobRoleId`; sesi terbuka dilewati dengan alasan; audit tercatat; `GET /tna/sessions` karyawan memuat tenggat, durasi, dan label gap;
- migrasi naik-turun-naik (langkah CI).

## 9. Keputusan default dan asumsi

- K1 dipakai seperti R7. K2: peran tambahan dikerjakan B2; B5 memakai `hr_admin`, `supervisor`, `eta_admin` yang ada.
- `[⚠️ BELUM TERVERIFIKASI]` R3 skala 0-4 → persen.
- `[⏳ DITERIMA]` R6 label `pending`. Test: unit klasifikasi + integrasi.
- `[⏳ DITERIMA]` R13 tanpa email undangan.
- `[⚠️ BELUM TERVERIFIKASI]` Tenggat menggantikan masa undangan 7 hari (Q38). Dasar: action item cadence 18 Nov "undangan dengan tenggat"; belum dikonfirmasi PM.
- Atasan boleh menugaskan (cadence 18 Nov; mockup lama menandainya untuk dikonfirmasi Pak Eji). Bila ditolak, cukup ubah satu `requireRole`.

## 10. Daftar perubahan file

- [ ] `apps/api/migrations/20261119000500-tna-penugasan-wawancara.js`
- [ ] `apps/api/src/core/flags/index.js`
- [ ] `apps/api/src/modules/tna/gaps.js`
- [ ] `apps/api/src/modules/tna/assignment.js`
- [ ] `apps/api/src/modules/tna/gap-routes.js`
- [ ] `apps/api/src/modules/tna/index.js` (pasang router)
- [ ] `apps/api/src/db/lna-stores.js`
- [ ] `apps/api/tests/unit/tna-gaps.test.js`
- [ ] `apps/api/tests/integration/tna-gaps.test.js`
- [ ] `docs/ewi/poc-dna-tna.md` (catatan flag baru)
- [ ] Layar web (menyusul, di atas PR B0)
