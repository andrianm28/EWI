# B5 · Training Needs (backend)

Status: spek v2, sudah direview subagent baru dan ditriase (bagian 11). Paket B5 dari `brief-bangun-penuh-19nov.md` (thread T4). Layar (web) menyusul di atas PR B0 dan akan menambah bagian "Layar" di dokumen ini.

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
- Tab **Gap kompetensi**: tabel Kode, Kompetensi, Target, Aktual, Gap, Klasifikasi. Kolom Kode belum dikirim: kolom `code` ditambah paket B4 (migrasi 0400) yang belum ada di cabang ini. `[⏳ DITERIMA]` ditambahkan setelah B4 digabung.
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

- **R1 Cakupan data (RG-3).** Semua agregat dihitung hanya dari karyawan dalam `scopeFor(req)`: HR dan Admin ETA semua, atasan dirinya dan bawahan langsung. Peran lain (learner, dan peran baru dari B2 seperti pimpinan/SME sampai B2 menetapkan aksesnya) ditolak 403 `ROLE_FORBIDDEN` di semua endpoint gap dan penugasan. `tenant_id` selalu dari `req.tenantId`. Pengguna berstatus `disabled` dan berperan `eta_admin` tidak pernah ikut dihitung.
- **R2 Gap kompetensi.** Hanya kompetensi yang **sudah disahkan HR** (`approved_at` terisi; mockup: "menunggu pengesahan HR sebelum dipakai sebagai target di Training Needs") dan berlaku untuk posisi karyawan dalam cakupan. Per kompetensi: `target` = `required_score`; `actual` = rata-rata skor terbaru karyawan yang sudah dinilai; `gap` = max(0, target − actual), dibulatkan 2 desimal; `assessed` = jumlah yang sudah dinilai; `peopleWithGap` = jumlah dengan skor terbaru < target; `peopleTotal` = jumlah karyawan yang posisinya memakai kompetensi itu. Kompetensi dengan `assessed = 0` tidak ditampilkan. Respons memuat `unapprovedCompetencies` (jumlah kompetensi yang belum disahkan) supaya layar bisa menjelaskan tab kosong.
- **R2b "Dalam batas".** Baris dengan `gap = 0` tetap tampil di tabel dengan klasifikasi `ok` ("Dalam batas", seperti mockup) dan **tidak** dihitung di KPI, Pareto, maupun klasifikasi ringkasan. "Baris gap" di dokumen ini berarti `gap > 0`. `peopleWithGap` tetap dikirim sehingga layar bisa menulis "2 orang di bawah target" walau rata-rata tim memenuhi. `[⏳ DITERIMA]` ambang "Dalam batas" = rata-rata tim ≥ target.
- **R3 Skala.** Sistem menyimpan skor 0-4. Mockup menampilkan 0-100. API mengirim nilai asli dan `targetPct`, `actualPct` (= nilai / 4 × 100, dibulatkan) serta `gapPct = max(0, targetPct − actualPct)`. `[⚠️ BELUM TERVERIFIKASI]` Data DNA Mas Abdan (masuk 26 Nov) mungkin memakai skala lain; konversi ada di satu fungsi (`toPct`).
- **R4 Pareto.** Baris gap diurutkan `gap` menurun (lalu nama). `cumulativeShare` (0-1) = kumulatif gap ÷ total gap; 0 bila total 0. KPI `top4Share` = `cumulativeShare` baris gap ke-4 (atau terakhir bila kurang dari 4; 0 bila tidak ada), **hanya dari gap kompetensi** seperti mockup. Rumus Pareto prioritas pelatihan `tna/pareto.js` (BT-30) tidak dipakai di sini.
- **R5 Gap OKR.** Satu gap = satu metrik (`metric_type` + `metricKey(name)`) pada satu periode. Dihitung dari semua baris metrik itu dalam cakupan pada periode itu; menjadi gap bila `peopleMissed` (baris `is_met = false`) ≥ 1.
  - Periode: bila `period` tidak dikirim, dipakai periode yang barisnya **paling baru diunggah** (`max(created_at)`), bukan urutan teks, karena format bebas (`2026-11`, `2026-Q4`). Baris tanpa periode diabaikan (impor mewajibkan periode). Respons memuat `period` yang dipakai dan `periods` yang tersedia.
  - `peopleTotal`, `peopleMissed`.
  - `target`: nilai bersama bila semua baris sama; selain itu `null` dan `targetVaries = true`.
  - `actual`: rata-rata realisasi **semua** baris (angka tim, seperti mockup), hanya bila `valueType` semua baris `angka`/`persen` dan target tidak beragam; selain itu `null`.
  - `diff` = `actual − target` (bertanda) bila keduanya ada; selain itu `null`.
  - `direction`, `tolerance`, `unit`, `valueType`: diambil dari baris bila seragam (aturan KPI per metrik membuatnya seragam); bila tidak, `null`.
- **R6 Klasifikasi gap.** Temuan ditautkan ke gap lewat `competency_id` atau `performance_record_id` (metrik + periode baris itu). Temuan tanpa keduanya ditautkan ke gap fokus sesinya (`focus_*`, R10). Temuan `rejected` diabaikan. "Terlihat" ditentukan R7. Tabel keputusan:

  | Temuan terlihat untuk gap itu | Hasil |
  | --- | --- |
  | ada draf (hanya terlihat HR/Admin ETA) | `review` ("Perlu ditinjau HR") |
  | pelatihan dan non-pelatihan (sudah direview) | `review` |
  | hanya pelatihan | `training` ("Training Needs") |
  | hanya non-pelatihan | `non_training` ("Improvement Needs") |
  | tidak ada, tetapi gap sudah diwawancarai (R8) | `review` |
  | tidak ada dan belum diwawancarai | `pending` ("Belum diwawancarai") |

  `pending` tidak ada di mockup (data contohnya sudah berklasifikasi semua); ditambahkan supaya gap yang belum diwawancarai tidak diberi klasifikasi palsu. `[⏳ DITERIMA]` diangkat di PR.
- **R7 Siapa melihat apa (K1, PM-6, RG-4).**
  - Temuan non-pelatihan hanya ikut dihitung bila flag `tna.non_training_hr` menyala, atau `module.ina` + `ina.dashboard` menyala (aturan `visibleCategories` yang sudah ada). Bila mati, tidak seorang pun (termasuk HR) melihat label "Improvement Needs" di papan gap.
  - HR dan Admin ETA: pelatihan, non-pelatihan (bila flag), dan draf.
  - Atasan dengan izin aktif (`lna_non_training_grants`) dan flag `tna.non_training_hr` menyala: pelatihan, dan non-pelatihan **milik bawahan langsung saja** (bukan temuan tentang dirinya, sama dengan endpoint PM-6). Tanpa draf.
  - Atasan tanpa izin: hanya pelatihan yang sudah direview.
  - Karena baris ke-5 tabel R6, gap yang sudah diwawancarai tidak pernah kembali ke "Belum diwawancarai" bagi siapa pun. `[⏳ DITERIMA]` Sisa inferensi: atasan tanpa izin melihat "Perlu ditinjau HR" yang tidak berubah saat HR sudah melihat "Improvement Needs"; pada tim sangat kecil ini bisa ditebak. Diterima karena status sesi bawahan memang terlihat atasan (RG-3).
- **R8 "Sudah diwawancarai".** Sesi TNA ditautkan ke gap lewat kolom fokus (R10); sesi alur lama (tanpa fokus) ditautkan ke semua gap OKR dari `trigger_record_ids`-nya. Per gap, dalam cakupan pemanggil: `interviewedCount` = jumlah karyawan dengan sesi `completed`, `assignedCount` = jumlah karyawan dengan sesi terbuka (R10). `interviewed = interviewedCount > 0`. KPI "SUDAH DIWAWANCARAI" = jumlah baris gap dengan `interviewed`, dari `totalGaps`.
- **R9 Detail gap.** Header (R2/R5 + klasifikasi + hitungan R8), `evidence` (kalimat dari data, tanpa nama orang), `hypotheses` (tiga hipotesis tetap dari mockup, `verified: false`), `jobRoles` (nama jabatan dalam cakupan yang memakai kompetensi itu; kosong untuk OKR), dan `employees` dalam cakupan: `{ id, name, jobRoleName, value, target, gap | isMet, self, assignable, session: { id, status, inviteExpiresAt } | null }`. Atasan ikut tampil di daftar (`self: true`, `assignable: false`). Pembacaan dicatat `audit.readIndividual(req, 'tna.gap_detail', ...)`. "Terkait kompetensi" pada gap OKR di mockup belum dibangun `[⏳ DITERIMA]` (butuh pemetaan KPI ke kompetensi yang belum ada datanya). Agregat daftar tidak diaudit per baca: atasan memang berhak melihat timnya (RG-3) dan audit dipakai untuk data per orang.
- **R10 Penugasan wawancara.** `POST /assignments` oleh HR, Admin ETA, atau atasan:
  - `gap.kind = 'okr'` (`metricType`, `name`, `period` semuanya wajib) atau `gap.kind = 'competency'` (`competencyId`);
  - `mode = 'affected'`: OKR = karyawan dengan baris `is_met = false` pada metrik + periode itu; kompetensi = karyawan dengan skor terbaru < target (yang belum dinilai tidak ikut). `mode = 'all_job_role'` (wajib `jobRoleId`) = semua karyawan di jabatan itu. Mode dipilih per penugasan; BT-29 menyebut "dikonfigurasi per proyek/klien" `[⏳ DITERIMA]` (konfigurasi tenant `tna.interviewScope` tetap dipakai alur lama dan menjadi nilai awal di layar);
  - `employeeIds` opsional (paling banyak 200) mempersempit; id di luar hasil mode atau di luar cakupan → 400 `EMPLOYEE_NOT_ELIGIBLE` (tidak dilewati diam-diam);
  - `dueDate` (YYYY-MM-DD, tanggal WIB) wajib, paling cepat besok, paling lama 30 hari. Undangan berakhir 23.59.59 WIB tanggal itu. **Tenggat = `invite_expires_at`** (tidak ada kolom tenggat terpisah, sehingga perpanjangan HR lewat `extend` otomatis menggeser tenggat yang dilihat karyawan). Pengingat H-3/H-1 mengikuti; tenggat besok berarti hanya H-1. Perpanjangan tetap hanya HR;
  - `durationMinutes` wajib 15 atau 30;
  - `projectId` wajib, proyek milik tenant dan tidak `closed`. Layar mengambil daftar proyek dari `GET /api/projects` yang sudah terbuka untuk semua peran;
  - semua ID dicek format UUID (400) dan keberadaannya **dalam tenant** (404);
  - yang bisa ditugaskan: R11;
  - **Satu sesi TNA terbuka per orang per proyek.** "Terbuka" = `in_progress`, atau `scheduled` yang undangannya belum lewat. Karyawan dengan sesi terbuka dilewati dan dilaporkan di `skipped` (`reason: 'open_session' | 'in_progress'`). Sesi `scheduled` yang undangannya **sudah lewat** digantikan: ditandai `abandoned` dalam transaksi yang sama, lalu sesi baru dibuat. Sesi `completed` tidak menghalangi (berbeda dari alur lama yang memakai `openFor`; alur lama tidak diubah). Batas yang diterima `[⏳ DITERIMA]`: seorang karyawan tidak bisa punya dua wawancara berjalan untuk dua gap sekaligus; sesi OKR-nya memang membahas semua target melesetnya;
  - seluruh penugasan satu permintaan berjalan dalam **satu transaksi** yang lebih dulu mengambil `pg_advisory_xact_lock` per (tenant, proyek), sehingga dua permintaan bersamaan tidak membuat sesi ganda dan kegagalan di tengah tidak menyisakan hasil sebagian;
  - untuk gap OKR, `trigger_record_ids` = baris metrik itu milik karyawan yang meleset pada periode itu (kosong untuk yang tidak meleset pada mode `all_job_role`);
  - audit `create`, `tna.interview_assignment`, `{ employeeIds, gap, dueAt, durationMinutes, replaced }`.
  - Hasil: 201 bila ada yang ditugaskan; 200 bila semua dilewati; 409 `NO_ELIGIBLE_EMPLOYEE` bila mode tidak menghasilkan siapa pun.
- **R10b Batalkan penugasan.** `POST /assignments/:sessionId/cancel`: sesi TNA hasil penugasan (`assigned_by` terisi) yang masih `scheduled`; oleh HR/Admin ETA atau penugasnya sendiri; karyawan harus dalam cakupan. Sesi menjadi `abandoned`. Selain itu 409 `INVALID_STATE`. Audit `update`, `tna.interview_assignment`, `{ decision: 'cancelled' }`.
- **R11 Siapa yang bisa ditugaskan.** Pengguna berstatus bukan `disabled` (termasuk `invited`, karena karyawan hasil impor belum pernah masuk sebelum 1 Des) dalam cakupan penugas, kecuali dirinya sendiri dan `eta_admin`, apa pun perannya (K2: HR dan atasan juga karyawan). Ini sengaja berbeda dari alur lama yang hanya `learner`.
- **R12 Flag.** Dua flag baru, default mati: `tna.gap_board` (endpoint gap) dan `tna.interview_assignment` (penugasan dan pembatalan). Router TNA sudah di balik `requireSubmodule('tna')`. Alur lama `POST /tna/projects/:id/interviews` tidak berubah.
- **R13 Email.** B5 tidak mengirim email undangan saat penugasan (alur lama juga tidak), jadi email pertama yang diterima karyawan bisa berupa pengingat. `[⏳ DITERIMA]` Email undangan 1 Des dikirim paket lain/manual; diangkat di PR. Teks pengingat kini memakai durasi sesi ("sekitar 15 menit" / "sekitar 30 menit").
- **R14 Serah terima ke B6.** `stores.interviews.get` dan `list` mengembalikan `durationMinutes`, `focusKind`, `focusLabel`, `assignedByName`. B6 memakai `focusKind`/`focusLabel` untuk prompt dan `durationMinutes` untuk batas pertanyaan (spek B6 A10).

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

Semua di bawah `/api/tna`, sesudah `auth`, `tenantContext`, `requireSubmodule('tna')`. Peran: HR, Admin ETA, atasan. Semua respons dibungkus `{ data }`. Filter `period` dan `jobRoleId` berlaku sama di ringkasan dan kedua daftar, supaya angka KPI sama dengan isi tab.

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

// GET /gaps/competencies → data.rows[]
{ "key": "c:<uuid>", "kind": "competency", "competencyId": "<uuid>", "name": "Analisis insiden",
  "target": 3, "actual": 2.25, "gap": 0.75, "targetPct": 75, "actualPct": 56, "gapPct": 19,
  "assessed": 4, "peopleWithGap": 3, "peopleTotal": 5, "cumulativeShare": 0.41,
  "classification": "pending", "interviewed": false, "interviewedCount": 0, "assignedCount": 0 }

// GET /gaps/okr → data.rows[] (+ data.period, data.periods)
{ "key": "o:sla|waktu respons|2026-11", "kind": "okr", "metricType": "sla", "name": "Waktu respons", "period": "2026-11",
  "target": 15, "actual": 22.5, "diff": 7.5, "targetVaries": false, "direction": "lower", "tolerance": 0,
  "unit": "menit", "valueType": "angka", "peopleMissed": 2, "peopleTotal": 4,
  "classification": "review", "interviewed": true, "interviewedCount": 1, "assignedCount": 1 }

// GET /gaps/detail → data = baris di atas + 
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
| Flag mati | 403 | `FEATURE_DISABLED` |
| Peran bukan HR/Admin ETA/atasan | 403 | `ROLE_FORBIDDEN` |
| Parameter salah bentuk (UUID, `kind`, `mode`, `dueDate`, `durationMinutes`, `jobRoleId` hilang pada `all_job_role`, `employeeIds` > 200) | 400 | `BAD_REQUEST` |
| Tenggat sebelum besok atau lebih dari 30 hari | 400 | `DUE_DATE_OUT_OF_RANGE` |
| `employeeIds` memuat orang yang tidak memenuhi | 400 | `EMPLOYEE_NOT_ELIGIBLE` |
| Proyek, kompetensi, jabatan, atau gap tidak ada di tenant/cakupan | 404 | `NOT_FOUND` |
| Proyek `closed` | 409 | `PROJECT_CLOSED` |
| Mode tidak menghasilkan karyawan | 409 | `NO_ELIGIBLE_EMPLOYEE` |
| Batal pada sesi yang bukan `scheduled`/bukan penugasan | 409 | `INVALID_STATE` |
| Batal oleh atasan yang bukan penugas | 403 | `NOT_ASSIGNER` |

## 7. Alur

1. HR/atasan membuka Training Needs: ringkasan dan dua tab (`/gaps/*`).
2. Klik baris: detail gap (`/gaps/detail`), bukti, hipotesis, daftar karyawan dan status sesinya.
3. "Mulai wawancara akar masalah" membuka form penugasan (tidak ada di mockup; dibangun dengan pola form mockup): proyek (dari `/api/projects`, terisi otomatis bila hanya satu yang aktif), mode, karyawan (centang), tenggat, durasi 15/30 menit. Kirim → `/assignments`.
4. Karyawan melihat undangan di daftar sesinya (tenggat, durasi, topik) dan menjalani wawancara (B6).
5. Setelah HR meninjau temuan (B7), klasifikasi gap berubah.
6. "Langsung ke tinjauan HR" hanya tautan ke layar tinjauan B7, tampil untuk HR; tanpa endpoint.

E2E layar (di PR layar, API mock): buka ringkasan, pindah tab, buka detail, tugaskan dua karyawan, lihat status "Ditugaskan".

## 8. Susunan kode

- `apps/api/src/modules/tna/gaps.js`: fungsi murni tanpa DB. `toPct`, `latestScores`, `competencyGaps`, `okrGaps`, `withPareto`, `gapKeyOf`, `linkSessions`, `classify`, `visibility`, `evidenceFor`, `HYPOTHESES`, `summarize`.
- `apps/api/src/modules/tna/assignment.js`: fungsi murni. `parseDueDate(str, now)` (akhir hari WIB), `validateAssignment(body)`, `eligibleEmployees(...)`, `planAssignments(...)` (assign / skip / replace).
- `apps/api/src/modules/tna/gap-routes.js`: router Express, dipasang dari `tna/index.js`.
- `apps/api/src/db/lna-stores.js`: `tna.performancePeriods(tenantId, scope)`, `tna.findingsForGaps(tenantId, scope)` (kolom minimal, tanpa judul/rincian sehingga tanpa dekripsi), `interviews.gapSessions(tenantId, scope)`, `interviews.assign(tenantId, { projectId, assignedBy, rows })` (transaksi + advisory lock + pengganti sesi kedaluwarsa), `interviews.cancelAssigned`, `projectsExtra.status`; `interviews.list/get` + kolom penugasan; `listPerformance` + `createdAt`; `reminderCandidates` + `durationMinutes`.
- `apps/api/src/modules/interviews/invitation.js`: `reminderMessage` memakai `durationMinutes`.
- `apps/api/src/core/flags/index.js`: dua flag baru.

## 9. Test yang ditulis lebih dulu

Unit (`tests/unit/tna-gaps.test.js`):
- R2/R2b/R3/R4: skor terbaru, kompetensi belum disahkan dilewati, `ok` saat rata-rata ≥ target walau ada orang di bawah target, persen, urutan, kontribusi kumulatif, total gap 0.
- R5: pengelompokan metrik + periode, target beragam, nilai biner tanpa rata-rata, selisih bertanda, periode terbaru menurut waktu unggah dengan format campuran.
- R6/R7: seluruh tabel keputusan; `rejected` diabaikan; temuan tak tertaut memakai fokus sesi; atasan tanpa izin; atasan berizin tidak menghitung temuan tentang dirinya; flag non-pelatihan mati.
- R8: tautan sesi berfokus dan sesi lama, hitungan per gap.
- R10: tenggat (kemarin, hari ini, besok, 31 hari, format salah, batas akhir hari WIB), durasi, mode, sesi terbuka vs kedaluwarsa vs selesai.

Integrasi (`tests/integration/tna-gaps.test.js`, Postgres):
- flag mati → 403 `FEATURE_DISABLED` untuk keenam endpoint; learner 403;
- HR melihat semua, atasan timnya (angka berbeda), tenant lain kosong;
- klasifikasi: `pending` → `review` setelah wawancara selesai → `training` setelah HR menyetujui; temuan non-pelatihan: HR `non_training` (flag nyala), atasan tanpa izin `review`, atasan berizin `non_training`; flag mati → HR `review`;
- detail mencatat audit baca; gap di luar cakupan dan ID tenant lain → 404; UUID rusak → 400;
- penugasan: gap OKR mode `affected` (hanya yang meleset, `trigger_record_ids`, `invite_expires_at` akhir hari WIB, kolom fokus); atasan menugaskan bawahan, ditolak untuk orang di luar tim dan dirinya; `all_job_role` butuh `jobRoleId`; sesi terbuka dilewati; sesi kedaluwarsa digantikan (`abandoned`); dua permintaan bersamaan menghasilkan satu sesi; `projectId`/`competencyId` tenant lain → 404; proyek `closed` → 409; perpanjangan HR menggeser tenggat yang dilihat karyawan; pembatalan oleh penugas, ditolak untuk atasan lain; audit tercatat; `GET /tna/sessions` karyawan memuat durasi dan label gap;
- pengingat memakai durasi sesi;
- migrasi naik-turun-naik (langkah CI).

## 10. Keputusan default dan asumsi

- K1 dipakai seperti R7. K2: peran tambahan dikerjakan B2; B5 memakai `hr_admin`, `supervisor`, `eta_admin`.
- `[⚠️ BELUM TERVERIFIKASI]` R3 skala 0-4 → persen.
- `[⚠️ BELUM TERVERIFIKASI]` Tenggat menggantikan masa undangan 7 hari (Q38) untuk sesi hasil penugasan. Dasar: action item cadence 18 Nov; belum dikonfirmasi PM.
- `[⏳ DITERIMA]` R2b ambang "Dalam batas"; R6 label `pending`; R7 sisa inferensi; R9 "Terkait kompetensi"; R10 mode per penugasan dan satu sesi terbuka per orang per proyek; R13 tanpa email undangan; kolom Kode menunggu B4.
- Atasan boleh menugaskan (cadence 18 Nov). Bila ditolak, cukup ubah satu `requireRole`.
- Penugasan untuk gap kompetensi melebihi kalimat brief ("pilih masalah KPI/OKR") tetapi mengikuti mockup, yang punya tombol wawancara di detail kedua jenis gap.

## 11. Daftar perubahan file

- [ ] `apps/api/migrations/20261119000500-tna-penugasan-wawancara.js`
- [ ] `apps/api/src/core/flags/index.js`
- [ ] `apps/api/src/modules/tna/gaps.js`
- [ ] `apps/api/src/modules/tna/assignment.js`
- [ ] `apps/api/src/modules/tna/gap-routes.js`
- [ ] `apps/api/src/modules/tna/index.js` (pasang router)
- [ ] `apps/api/src/modules/interviews/invitation.js` + job pengingat (durasi)
- [ ] `apps/api/src/db/lna-stores.js`
- [ ] `apps/api/tests/unit/tna-gaps.test.js`
- [ ] `apps/api/tests/integration/tna-gaps.test.js`
- [ ] `docs/ewi/poc-dna-tna.md` (catatan flag baru)
- [ ] Layar web (menyusul, di atas PR B0)

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
