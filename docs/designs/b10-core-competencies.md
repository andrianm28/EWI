# B10 · Core Competencies (modul `cca`)

Status: tahap 1 (backend dan impor) dan tahap 3 (layar, bagian 13) dikerjakan di PR ini dan mengikat. Tahap 2 menunggu PR B6 dan mendapat tambahan spek sendiri sebelum dibangun (bagian 11). Layar `aiv` sudah ada, tetapi penugasan belum bisa diselesaikan sampai tahap 2.
Acuan layar: mockup Pak Eji `project/Main.dc.html`, layar `s.cc`, `s.ccvm`, `s.ccval`, `s.aiv`.
Acuan aturan: brief `elgos-eksekusi/brief-bangun-penuh-19nov.md` bagian T7, rekap keputusan bagian 4b (CCA-B1..B15), CLAUDE.md.

## 1. Tujuan

HR melihat kompetensi inti perusahaan dari tiga sumber dan seberapa siap karyawan terhadapnya:

1. persyaratan kompetensi yang diturunkan dari dokumen visi dan misi;
2. indikator perilaku per nilai korporasi (di Elitery: 5C), ditambah hasil program pelatihan nilai yang diimpor dari laporan program;
3. wawancara AI berjenjang: HR menugaskan pimpinan, pimpinan diwawancarai, pimpinan menugaskan timnya, karyawan diwawancarai. AI menyintesis jawaban pimpinan dan karyawan.

ELGOS adalah produk multi-tenant. "5C", "Elitery's DNA 5C", nama nilai, komponen program, dan ambang status adalah konfigurasi tenant, bukan konstanta kode.

## 2. Pentahapan

| Tahap | Isi | Syarat mulai |
| --- | --- | --- |
| 1 (PR ini) | Migrasi, store, API sumber dan persyaratan, konfigurasi program nilai, impor laporan program, laporan agregat, penugasan wawancara berjenjang (status saja), flag | Tidak ada |
| 2 | Turunan persyaratan oleh AI dari dokumen visi-misi, percakapan wawancara visi-misi-nilai, ringkasan yang diperiksa peserta, sintesis pimpinan vs karyawan, pengisian nilai aktual dari sintesis | PR B6 (mesin wawancara dan penyedia AI, thread T4) terbuka |
| 3 | Layar HR (tab Vision & Mission, Corporate Values, Wawancara AI), layar atasan dan karyawan, e2e (bagian 13) | PR B0 (fondasi UI, thread T1) terbuka; dikerjakan di PR yang sama setelah B0 #18 digabung ke branch ini |

Tahap 1 sengaja tidak menyentuh `src/modules/interviews` agar tidak bentrok dengan B6. Tahap 1 tidak punya endpoint untuk menyelesaikan penugasan, jadi flag `cca.interview` jangan dinyalakan untuk tenant sungguhan sebelum tahap 2.

## 3. Layar mockup dan data yang dilayani tahap 1

| Layar mockup | Elemen | Endpoint tahap 1 |
| --- | --- | --- |
| Tab Vision & Mission | KPI (kesiapan, gap terbesar, di bawah target), grup Visi dan Misi berisi tabel persyaratan (target, aktual, gap, klasifikasi), catatan "menunggu validasi HR" | `GET /api/cca/overview?group=vm` |
| Tab Corporate Values, bagian gap perilaku | KPI, kesiapan per nilai, tabel indikator perilaku per nilai | `GET /api/cca/overview?group=values` |
| Tab Corporate Values, bagian hasil program | KPI (terdaftar, selesai, lulus, rata-rata skor nilai), status karyawan, skor per nilai, komponen berbobot, per divisi, temuan, rekomendasi | `GET /api/cca/programs/:key/report` (dari impor per karyawan, atau dari isian agregat) |
| Tab Wawancara AI (HR) | KPI penugasan, tabel pimpinan (status, tim selesai, tindakan) | `GET /api/cca/assignments`, `POST /api/cca/assignments` |
| Wawancara AI (atasan) | Status wawancara sendiri, tabel anggota tim (status saja), tombol tugaskan | sama, hasil dibentuk per peran |
| Wawancara visi & nilai (karyawan) | Status penugasan sendiri | sama |
| Percakapan, ringkasan, sintesis tema | tahap 2 | belum ada |

## 4. Data dan migrasi

Satu migrasi `apps/api/migrations/20261119001000-cca-core-competencies.js` (blok 10), schema `ewi`, punya `down` yang menghapus kelima tabel. Semua tabel punya `tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`.

- `cca_sources`: pernyataan strategis. `kind` (`vision`, `mission`, `value`), `title`, `text`, `source_ref` (mis. URL atau nama dokumen), `position` (urutan tampil), `status` (`active`, `archived`), `created_by`, waktu. Satu set per organisasi (CCA-B2).
- `cca_requirements`: persyaratan kompetensi (untuk visi dan misi) atau indikator perilaku (untuk nilai). `source_id` FK ke `cca_sources` ON DELETE CASCADE, `name`, `definition`, `target_score` numeric 0–100, `actual_score` numeric 0–100 boleh NULL, `actual_source` (`manual`, `synthesis`), `actual_updated_at`, `origin` (`hr`, `ai`), `status` (`draft`, `validated`, `rejected`), `validated_by`, `validated_at`, waktu.
- `cca_programs`: konfigurasi program nilai. `key` (unik per tenant, pola `[a-z0-9-]{1,32}`), `name`, `provider`, `cutoff_date`, `config` jsonb, `insight` text, `recommendations` jsonb (`[{ title, detail }]`), `manual_report` jsonb NULL (isian agregat, lihat 6.2), `updated_by`, waktu. Bentuk `config`:
  - `values`: daftar berurut `[{ name }]`, maksimal 8;
  - `components`: daftar berurut `[{ name, weight }]`, maksimal 10, `weight` 0–100, jumlah bobot harus 100 bila ada komponen;
  - `totalActivities`: bilangan bulat ≥ 1;
  - `passScore`: 0–100;
  - `bands`: `[{ key, label, min, description }]`, disimpan urut menurun menurut `min`. `key` dan `min` unik, `key` bukan `not_passed` atau `in_progress`, dan `min` band terendah wajib sama dengan `passScore` (P-2). Skor akhir di bawah `passScore` selalu `not_passed`.
  - Nama nilai di `config.values` berdiri sendiri, tidak ditautkan ke `cca_sources` berjenis `value` (ditolak saat triase: program bisa memakai penamaan atau subset yang berbeda).
- `cca_program_results`: satu baris per karyawan per program. `program_id` FK ON DELETE CASCADE, `user_id` FK `users` ON DELETE CASCADE, `division` varchar, `activities_done` int, `final_score` numeric NULL, `value_scores` jsonb (larik sepanjang `values`, elemen angka atau null), `component_scores` jsonb (larik sepanjang `components`), `import_batch_id` uuid, waktu. `UNIQUE (tenant_id, program_id, user_id)`. `import_batch_id` tanpa FK, sama dengan tabel LNA lain.
- `cca_assignments`: penugasan wawancara berjenjang. `assignee_id` FK users ON DELETE CASCADE, `assigned_by` FK users ON DELETE SET NULL, `tier` (`leader`, `employee`), `parent_id` FK `cca_assignments` ON DELETE SET NULL (penugasan pimpinan yang menjadi induk penugasan karyawan), `due_date` date, `duration_minutes` smallint default 10, `status` (`assigned`, `in_progress`, `completed`, `cancelled`), `session_id` uuid NULL (diisi tahap 2), `summary` text NULL terenkripsi per tenant (diisi tahap 2), `completed_at`, waktu. Indeks unik parsial `(tenant_id, assignee_id, tier) WHERE status IN ('assigned','in_progress')`: satu penugasan berjalan per orang per tier. Setelah selesai atau batal, putaran baru boleh dibuat. Atasan menengah boleh punya penugasan `leader` (dari HR) dan `employee` (dari atasannya) sekaligus. Yang dipakai layar selalu penugasan terbaru per orang per tier.

Skor angka disimpan terbuka agar bisa diagregasi, sama dengan aturan `lna-stores.js`. Teks ringkasan wawancara dienkripsi dengan `cipher` yang sama.

Store baru `apps/api/src/db/cca-stores.js` (`createCcaStores(sequelize, { cipher })`), digabung di `src/db/stores.js` sebagai `stores.cca`. Setiap query memfilter `tenant_id`. Metodenya:

- sumber dan persyaratan: `listSources`, `getSource`, `createSource`, `updateSource`, `getRequirement`, `createRequirement`, `updateRequirement`;
- program: `listPrograms`, `getProgram`, `upsertProgram`, `setProgramManualReport`, `countProgramResults`, `listProgramResults`, `replaceProgramResults`;
- penugasan: `listEligibleLeaders`, `listAssignments` (terbaru per orang per tier, yang batal diabaikan), `getAssignment`, `createAssignment`, `cancelAssignment`, `completeAssignment`, `getAssignmentSummary`;
- ekspor: `exportFor`.

## 5. Endpoint dan flag

Semua di bawah `/api/cca`, sudah dipasang lewat `requireSubmodule('cca')` di `src/app.js` (entitlement + flag `module.cca`). Flag baru `cca.interview` (`FLAGS.CCA_INTERVIEW`, default mati) menahan seluruh endpoint `/assignments`, supaya hasil program dan persyaratan bisa dibuka tanpa wawancara AI.

| Metode dan path | Peran | Isi |
| --- | --- | --- |
| `GET /overview?group=vm\|values` | HR | KPI + grup + baris, lihat aturan 6.1 |
| `GET /sources` | HR | daftar kelola: sumber aktif beserta semua persyaratannya termasuk `rejected`; `?archived=1` ikut memuat sumber arsip |
| `POST /sources` | HR | buat sumber `{ kind, title, text, sourceRef, position }` |
| `PATCH /sources/:id` | HR | ubah `title`, `text`, `sourceRef`, `position`, `status` |
| `POST /sources/:id/requirements` | HR | buat persyaratan `{ name, definition, targetScore, actualScore }`; `origin = hr`, `status = draft` |
| `PATCH /requirements/:id` | HR | ubah `name`, `definition`, `targetScore`, `actualScore`, `status` (transisi bebas); `status = validated` mengisi `validated_by` dan `validated_at`; mengubah nama, definisi, atau target baris `validated` tanpa mengirim `status` mengembalikannya ke `draft` |
| `GET /programs` | HR | daftar program, masing-masing dengan `participants` (jumlah hasil impor) dan `manualReport` |
| `PUT /programs/:key` | HR | buat atau ubah konfigurasi program, `insight`, `recommendations` |
| `GET /programs/:key/report` | HR | laporan agregat, lihat aturan 6.2 |
| `PUT /programs/:key/manual-report` | HR | simpan isian agregat `{ report }`; `{ report: null }` menghapusnya. Respons `{ saved, shadowedByImport, report }` (`shadowedByImport` = program sudah punya hasil impor, jadi isian tidak dipakai di laporan) |
| `/imports/*` | HR | `importRouter({ submodule: 'cca' })`: jenis impor baru `cca_program_results`, ditambah `dna_job_levels` dan `employees` yang kini juga terbuka untuk `cca` (CCA dijual satuan, dan penugasan berjenjang butuh data atasan) |
| `GET /assignments` | semua | dibentuk per peran, lihat aturan 6.3 |
| `POST /assignments` | HR, `supervisor`, `pimpinan` | `{ assigneeIds, dueDate, durationMinutes }` |
| `PATCH /assignments/:id` | penugas, atau HR untuk tier `leader` saja (6.3) | hanya `{ status: 'cancelled' }` |
| `GET /assignments/:id/summary` | HR (tier pimpinan), peserta sendiri | ringkasan wawancara; dicatat `audit.readIndividual` |

`tenant_id` selalu dari `req.tenantId`. Perubahan data dicatat `audit.record` (aksi `create` atau `update`, resource `cca.source`, `cca.requirement`, `cca.program`, `cca.assignment`). Objek milik tenant lain dan id yang bukan UUID dijawab 404. `eta_admin` lolos `requireRole` seperti di modul lain.

Kode galat khusus: `PROGRAM_HAS_RESULTS` (409), `LEADER_INTERVIEW_REQUIRED` (409), `INVALID_STATE` (409), `SUMMARY_RESTRICTED` (403), `FEATURE_DISABLED` (403). Galat validasi memakai 400 `BAD_REQUEST` dengan pesan Indonesia.

Bentuk respons (semua di dalam `{ data }`):

```jsonc
// GET /overview?group=vm
{ "kpis": { "readiness": 79, "biggestGap": { "name": "…", "gap": 17 }, "belowTarget": { "count": 1, "measured": 1, "total": 2 },
            "pendingValidation": 2 /* group=values menambah "weakestSource": { "title", "readiness" } */ },
  "groups": [{ "id", "kind": "vision", "title", "text", "sourceRef", "readiness": 79,
               "rows": [{ "id", "name", "definition", "targetScore": 80, "actualScore": 63, "actualSource": "manual",
                          "gap": 17, "classification": "perlu_ditinjau", "status": "draft" }] }] }

// GET /programs/:key/report  (source: "results" dari impor, "manual" dari isian agregat)
{ "source": "results", "program": { "key", "name", "provider", "cutoffDate" },
  "kpis": { "registered", "completed", "completedPct", "passed", "passedPct", "avgValueScore" },
  "statuses": [{ "key", "label", "description", "min", "count", "pct" }],   // band, lalu not_passed, in_progress
  "values": [{ "name", "avgCompleted", "avgAll" }],
  "components": [{ "name", "weight", "done", "donePct", "avg", "contribution" }],
  "total": { "done", "donePct", "avgFinal" },
  "divisions": [{ "name", "participants", "completed", "completedPct", "passed", "passedPct", "avgFinal", "avgValueScore" }],
  "allDivisions": { /* sama, name "Semua divisi" */ }, "insight", "recommendations": [{ "title", "detail" }] }

// GET /assignments
// HR:       { "role": "hr", "mine", "kpis": { "leadersEligible", "leadersAssigned", "leadersCompleted", "employeesAssigned", "employeesCompleted" },
//             "leaders": [{ "userId", "name", "division", "jobRoleName", "assignmentId", "status", "dueDate", "teamTotal", "teamAssigned", "teamDone" }] }
// pimpinan: { "role": "leader", "mine", "canAssign", "team": [{ "userId", "name", "jobRoleName", "status" }] }
// lainnya:  { "role": "employee", "mine" }
// mine = { "leader": penugasan | null, "employee": penugasan | null }
// penugasan = { "id", "tier", "status", "dueDate", "durationMinutes", "completedAt" }; status "none" = belum ditugaskan

// POST /assignments -> 201 { "tier", "assigned": [penugasan + "assigneeId"], "skipped": [id], "rejected": [id] }
```

## 6. Aturan bisnis

### 6.1 Persyaratan dan kesiapan

- Baris yang dihitung dan ditampilkan: `status` `draft` atau `validated`. `rejected` disembunyikan. Tiap baris membawa `status` supaya layar bisa menulis "menunggu validasi HR" (mockup).
- `gap = targetScore − actualScore`, minimal 0. Baris tanpa `actualScore` punya `gap = null` dan klasifikasi `belum_diukur`.
- Klasifikasi mengikuti fungsi `deco` di mockup: gap ≤ 8 berarti `dalam_batas` ("Dalam batas"), selain itu `perlu_ditinjau` ("Perlu ditinjau HR"). Angka 8 adalah konstanta `GAP_TOLERANCE` di `readiness.js`. [⚠️ BELUM TERVERIFIKASI: ambang 8 berasal dari mockup, belum ada keputusan bisnis.]
- Kesiapan grup = `round(Σ min(aktual, target) / Σ target × 100)` atas baris yang sudah punya nilai aktual (fungsi `ready` di mockup, ditambah jepitan supaya baris yang melampaui target tidak menutupi gap baris lain). Tanpa baris terukur, kesiapan `null`.
- Baris `draft` ikut dihitung, sama dengan mockup; KPI `pendingValidation` memberi tahu layar berapa baris yang belum divalidasi.
- KPI: kesiapan keseluruhan, gap terbesar (nama + nilai), jumlah baris dengan gap > 8 dari jumlah baris terukur. Untuk `group=values` ditambah nilai dengan kesiapan terendah.
- `group=vm` mengembalikan sumber `vision` dan `mission`. `group=values` mengembalikan sumber `value`.
- Nilai aktual di tahap 1 diisi HR (`actual_source = manual`). Tahap 2 mengisinya dari sintesis wawancara (`synthesis`). [⏳ DITERIMA: sampai tahap 2, nilai aktual adalah isian HR. Test tahap 2: sintesis menimpa nilai dan mengubah `actual_source`.] Tiap baris membawa `actualSource` supaya layar bisa memberi label "isian HR". Ini berbeda dari CCA-B3 (12 Nov: gap CCA diturunkan dari hasil TNA; statusnya di rekap memang "perlu dicek ulang"). Dasarnya: user menetapkan mockup Pak Eji final (19 Nov), dan di mockup nilai aktual sama dengan angka "karyawan sejalan" pada sintesis wawancara. Perbedaan ini dicatat di PR.
- Persetujuan peta oleh pimpinan (CCA-B12) dan 3–5 indikator per kompetensi (CCA-B1) tidak ada di mockup final. [⏳ DITERIMA: tahap 1 hanya punya validasi HR dan kolom `definition`. Ditinjau lagi bersama sintesis tahap 2.]
- Versi peta kompetensi (CCA-B2 "berversi", CCA-B13) belum dibangun. [⏳ DITERIMA: sumber diarsipkan, bukan dihapus, sehingga riwayat tidak hilang. Versi penuh ditunda setelah pilot.]

### 6.2 Program nilai dan laporan agregat

Keputusan user 19 Nov (kartu keputusan di thread): dua jalur masuk data, yaitu impor per karyawan dan isian agregat. Hasil impor didahulukan; isian agregat dipakai hanya selama program belum punya hasil per karyawan. Respons laporan membawa `source` (`results` atau `manual`).

Jalur 1, impor `cca_program_results` (satu baris per karyawan):

- Opsi: `programKey` wajib (bentuknya diperiksa `checkOptions`; keberadaan program diperiksa `context()`, yang menggagalkan seluruh impor bila program belum dikonfigurasi), `cutoffDate` opsional (memperbarui `cutoff_date` program saat disimpan).
- Kolom: ID Karyawan atau Email (salah satu wajib), Divisi, Kegiatan Selesai (bilangan bulat 0..`totalActivities`), Skor Akhir, Skor Nilai 1..8, Skor Komponen 1..10.
- Kerangka impor memakai daftar kolom statis, jadi kolom nilai dan komponen dipetakan menurut urutan konfigurasi program. Supaya salah petakan tidak diam-diam: pratinjau dan simpan gagal total bila kolom Skor Nilai yang dipetakan bukan tepat 1..N (N = jumlah nilai program), begitu juga Skor Komponen. Pesan galatnya menulis pasangan urutan dan nama, mis. "Skor Nilai 1 = Credible; Skor Nilai 2 = Competent". Berkas dengan judul kolom lain (mis. "Credible") dipetakan HR di layar pemetaan.
- Semua skor 0–100; selain itu baris ditolak. Karyawan harus sudah ada di tenant (pesan sama dengan jenis impor lain).
- Divisi kosong diisi divisi job role karyawan bila ada, selain itu "Tanpa divisi". Di laporan, divisi dikelompokkan tanpa membedakan huruf besar/kecil; labelnya ejaan terbanyak.
- Skor Akhir kosong pada peserta yang selesai dihitung dari `Σ skor komponen × bobot / 100` (komponen kosong dihitung 0). Peserta selesai tanpa Skor Akhir dan tanpa satu pun skor komponen ditolak.
- Karyawan yang muncul dua kali di berkas: baris terakhir dipakai.
- Laporan program adalah potret per tanggal cut off. Menyimpan impor mengganti seluruh hasil program itu: karyawan yang tidak ada di berkas baru dikeluarkan, dan jumlahnya dilaporkan sebagai `removed`.

Jalur 2, isian agregat `PUT /programs/:key/manual-report` dengan `{ report }`:

- `registered`, `completed`, `passed` (bilangan bulat, `passed ≤ completed ≤ registered`), `avgValueScore`, `avgFinal` (0–100 atau null);
- `statuses`: objek `{ <key band>: jumlah, not_passed, in_progress }`, totalnya harus sama dengan `registered`;
- `values`: larik sepanjang nilai program, `{ avgCompleted, avgAll }`;
- `components`: larik sepanjang komponen program, `{ done, avg }`;
- `divisions`: maksimal 200 baris `{ name, participants, completed, passed, avgFinal, avgValueScore }`; bila diisi, jumlah peserta harus sama dengan `registered`.

Hanya angka mentah yang disimpan; persen dan kontribusi dihitung saat ditampilkan, sehingga bentuk responsnya sama dengan laporan dari impor. Jalur ini tidak menyimpan data per orang.

Skor minimum band terendah harus sama dengan `passScore`, supaya setiap peserta lulus masuk tepat satu band (temuan code review S2).

Setelah program punya hasil impor atau isian agregat, jumlah nilai, jumlah komponen, dan daftar key band tidak bisa diubah (409 `PROGRAM_HAS_RESULTS`), karena skor tersimpan berurut.

Status per karyawan (dihitung saat laporan dibuat, tidak disimpan):

- `in_progress` bila `activitiesDone < totalActivities`;
- selain itu `not_passed` bila skor akhir < `passScore`;
- selain itu `key` band pertama yang `min`-nya ≤ skor akhir.

Laporan (`program-report.js`, fungsi murni):

- `registered`, `completed`, `passed` beserta persen terhadap terdaftar;
- `avgValueScore`: rata-rata, atas peserta selesai, dari rata-rata skor nilai tiap peserta;
- `statuses`: jumlah dan persen per band, `not_passed`, `in_progress`;
- `values`: per nilai, rata-rata peserta selesai dan rata-rata semua peserta (skor kosong dihitung 0, sesuai catatan mockup);
- `components`: bobot, jumlah dan persen yang sudah mengerjakan (skor tidak kosong, atas semua peserta), rata-rata atas peserta selesai, kontribusi = rata-rata × bobot / 100; ditambah baris total (jumlah selesai, rata-rata skor akhir peserta selesai);
- `divisions`: per divisi jumlah peserta, selesai, lulus, rata-rata skor akhir dan rata-rata skor nilai atas peserta selesai (null bila tidak ada yang selesai), diurutkan menurut jumlah peserta; ditambah baris semua divisi;
- `insight`, `recommendations`, `cutoffDate`, `name`, `provider` dari konfigurasi program.

Persen (`completedPct`, `passedPct`, `pct`, `donePct`) dibulatkan ke bilangan bulat; skor rata-rata satu desimal; kontribusi dua desimal. Skor disimpan `numeric(5,2)` (dua desimal). [⚠️ BELUM TERVERIFIKASI: rumus di atas direkonstruksi dari angka mockup; format berkas laporan Elite Academy yang asli belum dilihat.]

Privasi: endpoint laporan hanya untuk HR, dan HR memang boleh melihat semua karyawan (RG-3). Karena itu divisi kecil tetap ditampilkan, sama dengan mockup; ambang minimum per divisi ditolak saat triase dengan alasan itu. Tidak ada endpoint hasil per orang di paket ini. Mockup menawarkan "Wawancarai karyawan yang belum selesai"; itu butuh membuka status program per orang kepada atasan, jadi ditunda dan dicatat di PR sebagai keputusan pemilik produk.

### 6.3 Penugasan wawancara berjenjang

- HR menugaskan tier `leader`. Yang boleh ditugaskan: pengguna tenant ini yang tidak nonaktif (`status <> 'disabled'`, sama dengan `people.list`) dan berperan `supervisor` atau `pimpinan`. `hr_admin` tidak bisa menjadi `leader`, tetapi bisa ditugaskan sebagai `employee` oleh atasannya.
- Pimpinan (peran `supervisor` atau `pimpinan`) menugaskan tier `employee` hanya bila penugasan `leader` terbarunya berstatus `completed` (mockup: "Atasan yang selesai bisa meneruskan"); selain itu 409 `LEADER_INTERVIEW_REQUIRED`. Yang boleh ditugaskan: bawahan langsungnya (`users.supervisor_id`). `parent_id` = penugasan pimpinan itu.
- Cakupan tim dihitung lewat `visibleEmployeeScope()` dengan bawahan langsung pemanggil. Fungsi itu hanya memberi tim kepada peran `supervisor`, padahal impor karyawan memetakan "manajer", "kepala", "direktur" ke `pimpinan`. Karena itu modul ini memanggilnya dengan cakupan atasan untuk kedua peran pimpinan. Datanya terbatas pada nama, jabatan, dan status penugasan bawahan langsung. [⏳ DITERIMA: pemetaan peran final menunggu B2 (K2); perlu ditinjau Andrian karena menyangkut aturan visibilitas. Test: orang di luar bawahan langsung ditolak, untuk `supervisor` maupun `pimpinan`.]
- Orang yang masih punya penugasan berjalan di tier yang sama dilewati dan dilaporkan di `skipped`. Id di luar aturan, termasuk id tenant lain dan id yang bukan UUID, dilaporkan di `rejected` tanpa membedakan sebabnya.
- `dueDate` wajib, tanggal valid, tidak sebelum hari ini menurut WIB (UTC+7). `durationMinutes` 5–60, default 10. Maksimal 200 orang per permintaan.
- Pembatalan oleh penugas, atau oleh HR untuk tier `leader` saja, hanya dari status `assigned`; selain itu 409 `INVALID_STATE`. Penugasan karyawan yang dibuat atasan dijawab 404 bagi HR. Membatalkan penugasan pimpinan tidak mengubah penugasan karyawan di bawahnya.
- `GET /assignments` selalu memuat `mine` (penugasan terbaru pemanggil per tier), lalu per peran:
  - HR: `leaders` = semua calon pimpinan, termasuk yang belum ditugaskan (`status: none`), dengan `teamTotal` (jumlah bawahan langsung), `teamAssigned`, `teamDone`; dan `kpis` dengan penyebutnya (`leadersEligible`). HR tidak menerima daftar karyawan per orang di endpoint ini.
  - Pimpinan: `canAssign`, `team` (bawahan langsung: nama, jabatan, status penugasan `employee` terbaru atau `none`). Hanya status; tidak ada ringkasan (mockup: "Atasan hanya melihat status tim").
  - Peran lain: `mine` saja.
- Ringkasan (`GET /assignments/:id/summary`): peserta membaca ringkasannya sendiri. HR membaca ringkasan tier `leader`; untuk tier `employee` HR mendapat 403 `SUMMARY_RESTRICTED`. Orang lain mendapat 404. Penugasan yang belum selesai atau belum punya ringkasan dijawab 404 "Ringkasan belum tersedia" (di tahap 1 ringkasan hanya terisi lewat `completeAssignment`). Ringkasan tier `employee` sampai ke HR sebagai sintesis di tahap 2 (mockup: "Isi jawaban karyawan diringkas dan tidak ditampilkan per orang"). Transkrip tidak pernah keluar dari modul ini (PO-6).
- Tahap 1 tidak punya endpoint untuk menyelesaikan penugasan. Store menyediakan `completeAssignment(tenantId, id, { sessionId, summary })` sebagai sambungan untuk mesin wawancara tahap 2.

### 6.4 Ekspor dan hapus data karyawan (PK-15)

Basis integrasi e2d3707 sudah memuat PR #11, jadi paket ini langsung menyambung ke sana:

- `GET /api/employees/:userId/export` menambah `coreCompetencies: { programResults, interviewAssignments }` lewat `stores.cca.exportFor`. Skor program ditulis dengan nama nilai dan komponennya. Ringkasan wawancara hanya ikut bila karyawan mengekspor datanya sendiri, sama dengan aturan transkrip.
- Hapus karyawan menghapus hasil program dan penugasannya lewat `ON DELETE CASCADE`.

### 6.5 Batas dan konsistensi (review diff egm)

- Isian agregat harus konsisten: jumlah band lulus = `passed`, `in_progress` = `registered − completed`, `not_passed` = `completed − passed`; status yang tidak dikenal diabaikan dan yang tidak dikirim dianggap 0.
- Batas teks dan jumlah: `totalActivities` ≤ 1000; rekomendasi ≤ 20 butir, detail ≤ 1000 karakter; teks sumber ≤ 5000, definisi ≤ 2000, insight ≤ 4000; posisi 0–9999; nama divisi isian agregat dipotong 255 karakter.
- `dueDate` menerima format tanggal impor bersama (`imports/values.js`: ISO, `dd/mm/yyyy`, `dd-mm-yyyy`, nomor seri Excel).
- Ekspor karyawan membawa `finalScore` yang tersimpan (dari berkas); skor yang dihitung dari komponen hanya ada di laporan.
- `biggestGap` = null bila tidak ada gap di atas 0.

## 7. Keputusan default yang dipakai

- K2: peran mengikuti kode saat ini (`hr_admin`, `supervisor`, `pimpinan`, `learner`); `eta_admin` lolos `requireRole` seperti modul lain.
- CCA-B4 (dokumen + minimal satu pimpinan) dan CCA-B10 (AI menggabung, HR memutuskan) berlaku di tahap 2.
- CCA-B9: penunjuk pimpinan kunci adalah HR.
- CCA-B15: jumlah persyaratan tidak dibatasi.

## 8. Test

- Unit `tests/unit/cca-domain.test.js`: kesiapan dan klasifikasi (termasuk tanpa nilai aktual), status band, laporan program (angka contoh kecil yang bisa dihitung tangan), isian agregat, validasi konfigurasi program, validasi baris impor dan pemetaan kolom.
- Integrasi `tests/integration/cca.test.js` (Postgres), sekaligus test rute: peran (karyawan dan atasan ditolak di endpoint HR); alur sumber → persyaratan → overview, validasi dan kembali ke draft; konfigurasi program → isian agregat → impor (pemetaan kolom tidak pas, baris ditolak) → laporan → impor ulang sebagai potret; flag `cca.interview`; penugasan berjenjang lewat `completeAssignment` untuk `supervisor` dan `pimpinan`, di luar tim ditolak, duplikat dilewati, putaran baru; bentuk `GET /assignments` per peran; ringkasan karyawan tertutup untuk HR dan atasan, tersimpan terenkripsi, baca dicatat audit; ekspor dan hapus karyawan; isolasi tenant.
- Test rute dengan store in-memory tidak dibuat: CI selalu menyediakan Postgres, dan store tiruan akan menduplikasi aturan SQL.
- CI yang ada menjalankan migrasi naik, turun, naik.

## 9. Daftar perubahan berkas (tahap 1)

- [x] `apps/api/migrations/20261119001000-cca-core-competencies.js`
- [x] `apps/api/src/core/flags/index.js` (flag `cca.interview`)
- [x] `apps/api/src/db/cca-stores.js`
- [x] `apps/api/src/db/stores.js` (gabungkan `stores.cca`)
- [x] `apps/api/src/modules/cca/readiness.js`
- [x] `apps/api/src/modules/cca/program-report.js`
- [x] `apps/api/src/modules/cca/index.js`
- [x] `apps/api/src/modules/imports/kinds/cca-program-results.js`
- [x] `apps/api/src/modules/imports/kinds/index.js`
- [x] `apps/api/tests/unit/cca-domain.test.js`
- [x] `apps/api/src/modules/imports/kinds/employees.js`, `job-levels.js` (tambah `cca` di `submodules`)
- [x] `apps/api/tests/integration/cca.test.js`
- [x] `apps/api/src/modules/employees/index.js` (ekspor memuat data Core Competencies)
- [x] `docs/designs/b10-core-competencies.md`
- [x] `apps/api/src/modules/imports/index.js` (penanda `allOrNothing` untuk jenis impor yang mengganti seluruh data)

Tahap 3 (layar):

- [x] `apps/web/src/api/cca.ts`, `apps/web/src/api/imports.ts` (submodul `cca`)
- [x] `apps/web/src/screens/b10-core-competencies/` (`routes.ts`, `CoreCompetenciesView.vue`, `RequirementsTab.vue`, `ProgramSection.vue`, `ProgramForm.vue`, `ManualReportForm.vue`, `AssignmentsHr.vue`, `InterviewAssignmentView.vue`, `InterviewFlow.vue`, `due.ts`, `cc.css`)
- [x] hapus `apps/web/src/screens/legacy-cca/` (terhapus lewat fondasi B0 #18 yang digabung ke branch ini, bukan di diff B10)
- [x] `apps/web/e2e/core-competencies.spec.ts`

## 10. Di luar cakupan tahap 1

- Turunan persyaratan oleh AI dari dokumen visi-misi (unggah dokumen, CCA-B21/B22 masih terbuka): tahap 2. Tahap 1 menerima persyaratan yang diisi HR; kolom `origin` sudah menyediakan `ai`.
- Percakapan, ringkasan, sintesis tema, pratinjau sesi pimpinan (tahap 2).
- Detail gap per persyaratan (layar `s.gap`) dan alur ke tinjauan HR: milik B5 dan B7.
- Persetujuan karyawan atas penyimpanan skor program: data berasal dari program pelatihan klien sendiri dan diunggah HR; dasar pemrosesannya mengikuti dokumen legal PK-17, bukan paket ini.
- Undangan email dan pengingat tenggat.

## 11. Tahap 2: percakapan wawancara, ringkasan, dan sintesis (spek 23 Nov)

Status: draf untuk review egm. Tahap 2 dibangun setelah B6 (#25, #29) masuk integrasi. Turunan persyaratan oleh AI dari
dokumen visi-misi (CCA-B21/B22) **tidak** ikut tahap 2a ini (lihat 11.9).

### 11.1 Yang dibangun

| Layar mockup | Elemen | Tahap 2a |
| --- | --- | --- |
| Wawancara visi & nilai (atasan dan karyawan) | Persetujuan, percakapan "Pertanyaan n dari 4" dengan pilihan jawaban + isian bebas, ringkasan AI per tema, "Periksa ringkasan ini sebelum dianggap final", "Terkirim" | ya |
| Tab Wawancara AI (HR) | Kartu "Sintesis AI: pimpinan dan karyawan" (tema, sumber, pimpinan sepakat %, karyawan sejalan %, gap, batang merah bila gap ≥ 20), KPI "Tema tersintesis" | ya |
| Tab Wawancara AI (HR) | "Pratinjau sesi pimpinan" (tidak disimpan) | ya, tanpa AI (pertanyaan bawaan) |
| Tab Vision & Mission / Corporate Values | Nilai aktual dari sintesis (`actual_source = synthesis`) | ya, lewat tindakan HR |

### 11.2 Keputusan rancangan

- **D-1 Sesi = penugasan.** Wawancara CCA tidak memakai `lna_interview_sessions` (kolom `project_id` NOT NULL, router B6
  terikat proyek dan analisis TNA). Penugasan `cca_assignments` menjadi sesinya; giliran disimpan di tabel baru
  `cca_interview_turns`. Alasan: tidak mengubah tabel dan router bersama B6, dan aturan privasi CCA (ringkasan karyawan
  hanya agregat) berbeda dari TNA. Yang dipakai ulang: `core/consent`, `cipher`, dan `callAi`/`recordUsage` lewat
  adaptor `{ projectId: null, id: null, intervieweeId, submodule: 'cca' }` (kolom `session_id` di `ai_usage_logs` ber-FK
  ke `lna_interview_sessions`, jadi harus NULL). Kolom tahap 1 `cca_assignments.session_id` dibiarkan dan tetap NULL.
- **D-2 Empat tema tetap per tier** (mockup `LQ`/`EQ`), disimpan sebagai kunci netral: pimpinan = `vision`, `mission`,
  `values`, `behavior`; karyawan = `vision`, `mission`, `values`, `support`. Label tampilan dari layar ("Visi", "Misi",
  "Perilaku kunci", "Dukungan"); label tema `values` memakai nama program/nilai tenant, bukan "5C" tetap (bagian 1: 5C
  adalah konfigurasi). Satu pertanyaan per tema, 4 pertanyaan (mockup "Sekitar 10 menit, 4 pertanyaan").
  `duration_minutes` tidak mengubah jumlah pertanyaan. [⏳ DITERIMA: mengikuti mockup.]
- **D-3 Pertanyaan dirumuskan AI dari sumber organisasi.** Konteks ke model hanya: tier, kunci tema ke-n, judul+teks
  sumber `vision`/`mission` aktif, nama sumber `value` aktif, dan nama persyaratan tervalidasi (paling banyak
  `CCA_MAX_REQUIREMENTS` = 20, urut `position` sumber lalu nama). Tanpa nama atau data karyawan (PM-10). Saat persetujuan,
  ID persyaratan yang dikirim disimpan sebagai potret di penugasan (`context_requirement_ids`), supaya ringkasan memakai
  himpunan yang sama walau persyaratan berubah di tengah. Model mengembalikan `{ text, options[≤3] }` (parser baru
  `parseCcaQuestion`); pilihan hanya saran, peserta boleh menulis bebas. Stub deterministik: teks bawaan mockup dengan
  nama sumber disisipkan.
- **D-4 Ringkasan per tema + sikap per persyaratan.** Setelah jawaban keempat, peserta meminta ringkasan
  (`summarizeCca`, operasi AI baru). Keluaran: `themes: [{ theme, question, answer }]` (1–2 kalimat per tema) dan
  `stances: [{ requirementId, stance }]`. `stance`: `agree` / `partial` / `disagree` (pimpinan), `aligned` / `partial` /
  `not_aligned` (karyawan), atau `not_covered` bila jawaban tidak menyinggung persyaratan itu. Persyaratan di luar potret
  dan nilai lain dibuang; persyaratan potret yang tidak dikembalikan model dianggap `not_covered`. Ringkasan dan sikap
  disimpan terenkripsi di penugasan; sikap selain `not_covered` juga disimpan terbuka per baris di
  `cca_interview_stances` saat konfirmasi.
- **D-5 Konfirmasi peserta menyelesaikan penugasan.** "Sesuai, kirim" → status `completed`, `completed_at`; tidak bisa
  diubah. "Ulangi" sekali (giliran, ringkasan dihapus; persetujuan dan potret tetap). [⏳ DITERIMA: mockup tidak punya
  tombol ulangi; batas satu kali mengikuti biaya token.]
- **D-6 Sintesis dihitung aturan, bukan AI.** Per persyaratan tervalidasi aktif dan per tier: `n` = responden yang
  sikapnya bukan `not_covered` (baris di `cca_interview_stances`), `score = round(100 × (setuju/sejalan + 0,5 × partial) / n)`,
  `null` bila `n = 0`. `gap = leaderAgree − employeeAligned` bila keduanya ada, selain itu `null`; `hot = gap ≥ 20` (mockup
  `cls: 'hot'`), `false` bila `gap` null. Hanya penugasan `completed`, putaran terbaru per orang per tier. Atasan menengah
  yang selesai di dua tier dihitung di keduanya. CCA-B10 "AI menggabung, konflik ditandai, HR memutuskan" dipenuhi dengan:
  AI memberi sikap per orang, aturan menggabung, `hot` menandai konflik, HR memutuskan lewat `apply`.
  [⏳ DITERIMA: tema bebas di luar persyaratan tervalidasi tidak dibuat di tahap 2a.]
- **D-7 Anonimitas karyawan.** Angka karyawan hanya dikirim bila `n` karyawan untuk persyaratan itu ≥
  `CCA_MIN_RESPONDENTS` = 5; selain itu `employeeAligned`, `gap` null. Agar HR tidak bisa menebak sikap satu orang dengan
  membandingkan dua tampilan sebelum dan sesudah satu penyelesaian: `employeeAligned` dibulatkan ke kelipatan 5 dan
  `employeeRespondents` dikirim sebagai pita (`"<5"`, `"5–9"`, `"10–19"`, `"20+"`). Pimpinan tidak diberi ambang (HR sudah
  boleh membaca ringkasan pimpinan per orang). [⚠️ BELUM TERVERIFIKASI: angka 5 dan pita adalah pilihan penulis; risiko
  sisa (selisih pita di batas) dicatat untuk Andrian dan legal.]
- **D-8 Teks persetujuan CCA.** `CONSENT_VERSIONS.cca` belum ada; menambahnya mengubah `core/consent` (kode bersama,
  review Andrian). Diajukan ke user (kartu). Default sambil menunggu: draf `cca-consent-id-v1.0` dari teks TNA v1.0
  dengan tujuan "pemetaan pemahaman visi, misi, dan nilai; bukan penilaian kinerja" (kalimat mockup), menunggu legal.
- **D-9 Nilai aktual dari sintesis.** Bagian 6.1 sudah menetapkan (mockup final 19 Nov) bahwa nilai aktual persyaratan
  sama dengan angka "karyawan sejalan". `apply` mengikuti itu: `actual_score = employeeAligned` (setelah pembulatan D-7),
  dihitung ulang di server saat `apply` dijalankan, hanya atas pilihan HR per baris. Nilai lama dikembalikan dan dicatat
  di audit supaya isian manual yang tertimpa bisa dipulihkan.

### 11.3 Data dan migrasi

Migrasi baru `apps/api/migrations/20261123001000-cca-wawancara.js` (blok 10, berkas kedua), raw SQL.

`up`:
- `cca_assignments` + `consent_version varchar(64)`, `consent_at timestamptz`, `started_at timestamptz`,
  `summary_at timestamptz`, `restart_count smallint NOT NULL DEFAULT 0`, `context_requirement_ids uuid[]`. Kolom `summary`
  (tahap 1, teks terenkripsi) kini berisi JSON `{ themes, stances }` terenkripsi; `completeAssignment` tahap 1 yang
  menerima teks tetap didukung (dibaca sebagai satu tema).
- `cca_interview_turns`: `id uuid`, `tenant_id` FK tenants CASCADE, `assignment_id` FK `cca_assignments` ON DELETE
  CASCADE, `position smallint`, `role` (`ai`, `participant`), `theme varchar(16)`, `text` text terenkripsi, `options`
  jsonb NULL (hanya giliran AI), `created_at`. `UNIQUE (assignment_id, position)`.
- `cca_interview_stances`: `tenant_id`, `assignment_id` FK CASCADE, `requirement_id` FK `cca_requirements` CASCADE,
  `tier`, `stance` (`agree`, `partial`, `disagree`, `aligned`, `not_aligned`); PK `(assignment_id, requirement_id)`,
  indeks `(tenant_id, requirement_id)`.
- `ai_usage_logs`: CHECK `operation` ditambah `summarize_cca`.

`down` (urutan): `DELETE FROM ai_usage_logs WHERE operation = 'summarize_cca'`, kembalikan CHECK ke daftar sebelum
migrasi ini (`next_question`, `assess_competencies`, `analyze_tna`, `assistant_reply`), `DROP TABLE cca_interview_stances`,
`DROP TABLE cca_interview_turns`, hapus enam kolom `cca_assignments`. CI menjalankan naik-turun-naik.

Kode bersama yang berubah (review Andrian, aturan 7): migrasi ini, `core/consent` (D-8), `src/ai/prompts.js`,
`stub-provider.js`, `bedrock-provider.js` (operasi `cca`), `interviews/ai-calls.js` hanya dipakai, tidak diubah.

### 11.4 Endpoint (flag `module.cca` + `cca.interview`)

Urutan pemeriksaan semua rute: flag (403 `FEATURE_DISABLED`) → peran (403) → penugasan ada, UUID sah, dan milik
pemanggil (404) → keadaan (409) → body (400).

**Sesi peserta** di `/api/cca/assignments/:id/…`, hanya peserta penugasan itu (`assignee_id = req.user.id`), orang lain
404. Keadaan: `cancelled` atau `completed` → 409 `INVALID_STATE` untuk semua rute tulis (GET tetap 200). Lewat
`dueDate` tetap boleh. [⏳ DITERIMA: tenggat adalah target, bukan kunci; HR membatalkan bila perlu.]

| Metode | Path | Hasil |
| --- | --- | --- |
| GET | `/session` | `{ assignment, step, consentVersionRequired, turns: [{ role, theme, text, options }], answerCount, questionCount: 4, summary: { themes, createdAt } \| null }`. `step`: `consent` (status `assigned`), `chat`, `summary` (`summary_at` terisi), `done` |
| POST | `/consent` | `{ consentVersion }`; status harus `assigned`; versi harus berlaku (400 `CONSENT_VERSION_INVALID`). Satu transaksi: status `in_progress`, `consent_*`, `started_at`, potret persyaratan. Lalu pertanyaan pertama diminta ke AI; bila AI gagal, persetujuan tetap tersimpan dan respons 200 `{ question: null }` (layar meminta ulang lewat `POST /turns` tanpa `text`). Audit `create` `cca.interview_consent` |
| POST | `/turns` | `{ text? }`. Dengan `text` (1–2000 karakter): status `in_progress`, belum ada ringkasan (409 `SUMMARY_EXISTS`), jawaban < 4 (bila sudah 4 → 409 `INVALID_STATE`), giliran terakhir harus pertanyaan AI (selain itu 409 `INVALID_STATE`). Jawaban keempat tidak memanggil AI dan mengembalikan `{ question: null, done: true }`. Tanpa `text`: bila giliran terakhir jawaban peserta (atau belum ada giliran) dan jawaban < 4, server meminta pertanyaan berikutnya; selain itu 409 `INVALID_STATE`. AI gagal → 502 `AI_UNAVAILABLE`, jawaban tetap tersimpan |
| POST | `/summary` | Syarat 4 jawaban (409 `INVALID_STATE`). Bila ringkasan sudah ada, dikembalikan 200 tanpa memanggil model. Selain itu `summarizeCca` lalu simpan bersyarat (`WHERE summary_at IS NULL AND restart_count = :awal`); yang kalah membuang hasilnya dan mengembalikan ringkasan pemenang. 201 `{ themes, createdAt }`. Sikap tidak dikirim ke peserta. Audit `create` `cca.interview_summary` |
| POST | `/summary/confirm` | Satu transaksi bersyarat (`status = 'in_progress' AND summary_at IS NOT NULL`): status `completed`, `completed_at`, sikap selain `not_covered` disalin ke `cca_interview_stances`. Yang kalah 409 `INVALID_STATE`. 200 `{ status: 'completed' }`. Audit `update` `cca.assignment` `{ status: 'completed' }` |
| POST | `/restart` | `restart_count < 1` (lalu 409 `RESTART_LIMIT`); satu transaksi (kunci baris `FOR UPDATE`): hapus giliran, ringkasan, `summary_at`, `restart_count + 1`; status tetap `in_progress`. 200 `{ restartsLeft: 0 }`; layar meminta pertanyaan pertama lewat `POST /turns` tanpa `text`. Audit `delete` `cca.interview_transcript` |

Konkurensi: `POST /turns` mengunci baris penugasan (`SELECT … FOR UPDATE`) saat menyisipkan; pelanggaran
`UNIQUE (assignment_id, position)` dipetakan ke 409 `INVALID_STATE`, bukan 500.

**HR** (`hr_admin`, `eta_admin`), juga di balik `cca.interview`; peran lain 403:

| Metode | Path | Hasil |
| --- | --- | --- |
| GET | `/api/cca/synthesis` | `{ themes: [{ requirementId, name, sourceKind, sourceTitle, leaderAgree, leaderRespondents, employeeAligned, employeeRespondents (pita), gap, hot, actualScore, actualSource }], minRespondents, kpis: { themes, leadersCompleted, employeesCompleted } }`. `kpis.themes` = baris dengan `leaderRespondents > 0` (mockup "Tema tersintesis") |
| POST | `/api/cca/synthesis/apply` | `{ requirementIds }` (1–100) → dihitung ulang di server; baris dengan `employeeAligned` diisi `actual_score`, `actual_source = 'synthesis'`; 200 `{ applied: [{ requirementId, previous: { actualScore, actualSource } }], skipped: [{ requirementId, reason }] }`. Audit `update` `cca.requirement` berisi nilai lama |
| GET | `/api/cca/interview/preview?tier=leader\|employee` | Empat pertanyaan bawaan dengan sumber organisasi disisipkan, tanpa AI, tanpa simpan |

`GET /assignments/:id/summary` (tahap 1) membaca `themes` dari JSON ringkasan; aksesnya tidak berubah (peserta
sendiri; HR untuk tier pimpinan; tier karyawan 403 `SUMMARY_RESTRICTED`).

### 11.5 Aturan

- **R-1 Privasi.** Transkrip hanya untuk peserta (PO-6), lewat `GET /session`; tidak ada endpoint transkrip untuk HR
  atau atasan. Ringkasan karyawan sampai ke HR hanya sebagai agregat sintesis (D-7). Atasan hanya status (tahap 1).
- **R-2 Konteks AI tanpa data orang** (D-3). Test memeriksa payload stub tidak memuat nama/email peserta atau orang lain.
- **R-3 Pimpinan meneruskan setelah selesai** tetap memakai syarat tahap 1 (`LEADER_INTERVIEW_REQUIRED`), kini bisa
  dipenuhi lewat `/summary/confirm`. `stores.cca.completeAssignment` tetap ada; langkah driver
  `cca.selesaikanWawancara` diganti ke API.
- **R-4 Persyaratan berubah setelah wawancara.** Sintesis hanya baris `validated` dari sumber aktif; sikap untuk baris
  yang kemudian ditolak atau diarsipkan tidak dihitung. Persyaratan baru tidak punya responden sampai putaran berikutnya.
- **R-5 Retensi, hapus, dan ekspor (PK-15).** Giliran, ringkasan, dan sikap disimpan selama penugasan ada dan terhapus
  lewat CASCADE bila penugasan atau karyawan dihapus. Ekspor karyawan sendiri memuat ringkasan `themes` dan sikapnya.
  [⏳ DITERIMA: retensi mengikuti penugasan, sama dengan sesi TNA (B6 A12).]
- **R-6 Biaya.** Paling banyak 4 `next_question` + 1 `summarize_cca` per putaran, dua kali bila diulang.

### 11.6 AI

- `prompts.js`: cabang `cca` di `interviewSystemPrompt` (tema, sumber, larangan menilai kinerja, keluaran JSON
  `{ text, options }`) dan `ccaSummaryPrompt({ tier, turns, requirements })` keluaran `{ themes, stances }` dengan
  `not_covered` sebagai bawaan.
- `stub-provider` dan `bedrock-provider`: `nextQuestion` untuk `cca`, `summarizeCca`. Stub: sikap setuju/sejalan untuk
  persyaratan yang namanya muncul di jawaban, `partial` bila nama sumbernya muncul, `not_covered` selain itu.

### 11.7 Test yang ditulis lebih dulu

Seam: API (`supertest`, Postgres, stub AI) dan unit `synthesis.js`.

1. Unit sintesis: rumus, `not_covered` tidak masuk `n`, `n = 0` → null, ambang 5, pembulatan 5, pita, `hot` ≥ 20, putaran
   terbaru, atasan menengah di dua tier.
2. Integrasi: alur pimpinan penuh (consent → 4 giliran → ringkasan → konfirmasi) lalu pimpinan bisa menugaskan tim.
3. Integrasi: orang lain 404 di semua rute sesi; HR dan atasan tidak punya jalur ke transkrip; HR 403 `SUMMARY_RESTRICTED`
   untuk tier karyawan.
4. Integrasi: `SUMMARY_EXISTS`, jawaban kelima 409, `RESTART_LIMIT`, konfirmasi ganda (satu menang), `/turns` paralel
   (satu 409, tanpa 500), versi persetujuan salah, AI gagal saat persetujuan → persetujuan tersimpan dan `question: null`.
5. Integrasi: payload AI tanpa nama/email (stub merekam konteks); potret persyaratan dipakai ringkasan walau persyaratan
   baru ditambah di tengah.
6. Integrasi: sintesis < 5 karyawan → angka karyawan null; ≥ 5 → angka; `apply` mengisi nilai aktual, mengembalikan
   nilai lama, dan overview menampilkan `actualSource = synthesis`.
7. Migrasi naik-turun-naik.
8. Test alur B18 B10: `cca.selesaikanWawancara` lewat API; baris 3.3 diperbarui.

### 11.8 Layar (tahap 3, berkas yang sama)

Rute `aiv`: percakapan dengan pilihan jawaban dan isian bebas, ringkasan per tema, tombol "Sesuai, kirim" dan "Ulangi"
(sekali). Tab Wawancara AI HR: kartu sintesis + tombol "Isi nilai aktual dari sintesis" per tema, pratinjau sesi. E2E
memakai `support/` (`loginSebagai`, `mockApi`).

### 11.9 Di luar tahap 2a

- Turunan persyaratan oleh AI dari dokumen visi-misi (CCA-B21/B22, unggah dokumen).
- Tema bebas dari jawaban pimpinan di luar persyaratan tervalidasi.
- Durasi wawancara mengubah jumlah pertanyaan.

### 11.10 Review spek tahap 2 (goldfish, 23 Nov)

Satu subagent baru tanpa riwayat, empat lensa egm (zoom out, pemahaman, kritik desain, siap implementasi). Triase
`egm-resolve`:

| # | Temuan | Kategori | Tindakan |
| --- | --- | --- | --- |
| G1 | Sikap `partial` untuk semua persyaratan menyeret skor ke 50 | PROPOSE FIX | `not_covered`, `n` per persyaratan, batas 20 persyaratan (D-3, D-4, D-6) |
| G2 | Skala "% sejalan" berbeda dari skor kompetensi; `apply` menimpa isian manual | CONTEST + PROPOSE FIX | skala sudah diputuskan di 6.1 (mockup final); `apply` dihitung di server, mengembalikan dan mengaudit nilai lama (D-9) |
| G3 | Ambang 5 bisa dibobol dengan membandingkan dua tampilan | PROPOSE FIX + ESCALATE | pembulatan 5 dan pita responden (D-7); risiko sisa ke Andrian dan legal |
| G4 | Teks persetujuan CCA tidak ada; AI gagal saat persetujuan | ESCALATE + PROPOSE FIX | kartu ke user (D-8); persetujuan disimpan dulu, `question: null` |
| G5 | `recordUsage` terikat sesi, parser pertanyaan teks saja | PROPOSE FIX | adaptor dan `parseCcaQuestion` (D-1, D-3) |
| G6 | `down` tidak dirinci; `session_id` tahap 1 | PROPOSE FIX | urutan `down` ditulis; `session_id` dibiarkan NULL |
| G7 | Konkurensi `/turns` dan `/summary` | PROPOSE FIX | kunci baris, unik → 409, simpan bersyarat; test |
| G8 | Urutan pemeriksaan dan keadaan; nama `SUMMARY_PENDING`; kalimat jawaban keempat terbalik | PROPOSE FIX | 11.4 ditulis ulang, `SUMMARY_EXISTS` |
| G9 | `{ retry: true }` membebani body | PROPOSE FIX | tanpa `text` = minta pertanyaan berikutnya |
| G10 | "5C" konfigurasi; potret persyaratan | PROPOSE FIX | kunci tema netral, `context_requirement_ids` |
| G11 | Bagi nol; atasan menengah | PROPOSE FIX | null, `hot = false`, dihitung di dua tier |
| G12 | Tabel endpoint mencampur peserta dan HR | PROPOSE FIX | dua tabel |
| G13 | Retensi transkrip | PROPOSE FIX | R-5 |
| G14 | KPI "Tema tersintesis"; urutan bagian 12/13 | PROPOSE FIX / DECLINE | KPI didefinisikan; urutan bagian dibiarkan (dirujuk dari tempat lain) |

## 13. Layar (tahap 3)

Mengikuti kontrak B0 (`docs/designs/b0-fondasi-ui.md` bagian 4 dan 5.3). `router/index.ts` dan `shell/menu.ts` tidak diedit.

| Rute | Path | Tampilan | Gerbang | Isi |
| --- | --- | --- | --- | --- |
| `cc` | `/cc` | hr | submodul `cca` | Tab Corporate Vision & Mission, Corporate Values, dan Wawancara AI. Tab dipilih lewat `?tab=val` atau `?tab=aiv` supaya bisa ditautkan |
| `cc-lama` | `/m/cca` | - | - | Alih ke `cc` (kartu Beranda lama masih menautkan alamat ini) |
| `aiv` | `/aiv` | atasan, karyawan | submodul `cca` | Atasan: status wawancara pimpinan sendiri, tabel tim (status saja), tugaskan. Karyawan: penugasan sendiri |

- Flag `cca.interview` tidak dipasang di `meta.flag` rute `aiv`. Alasannya: penjaga rute mengalihkan diam-diam ke beranda, padahal butir menu `aiv` tetap tampil karena syaratnya hanya submodul. Layar menangkap 403 `FEATURE_DISABLED` dan menulis "Wawancara AI Core Competencies belum diaktifkan untuk organisasi Anda." Di layar HR, tab Wawancara AI hanya muncul bila flag menyala.
- Tampilan atasan dipakai hanya bila API menjawab `role: leader`. Bila tampilan aktif atasan tetapi API menganggap pemanggil karyawan (peran belum dipetakan), layar menampilkan kartu karyawan.
- Tab Corporate Values: hasil program (laporan agregat, pemilih program bila lebih dari satu, tombol impor, isian agregat, ubah program, program baru), lalu gap perilaku per nilai. Halaman ini tidak pernah menampilkan hasil per orang.
- Kelola persyaratan memakai formulir sebaris di kartu sumber (tambah, ubah, validasi, tolak). Dialog belum ada di `src/ui`, jadi tidak ditambahkan.
- Formulir program memakai satu baris per butir dengan pemisah `|` (nilai, komponen, status, rekomendasi). [⏳ DITERIMA: cukup untuk pilot yang dikonfigurasi tim ETA; editor per butir menyusul bila HR klien mengatur sendiri.]
- Bagian mockup yang belum ada datanya (sintesis tema, pratinjau sesi pimpinan, percakapan, ringkasan) tidak digambar dengan angka contoh. Layar menulis catatan bahwa percakapan menyusul.
- Batas waktu penugasan default 14 hari dari hari ini, minimal hari ini, keduanya dihitung dalam WIB seperti API.
- Tab Corporate Values menampilkan empat KPI: kesiapan, nilai dengan kesiapan terendah, gap terbesar, di bawah target.
- Baris yang ditolak hilang dari overview dan belum bisa dipulihkan dari layar (API `PATCH /requirements/:id` bisa). [⏳ DITERIMA: layar kelola sumber dan baris `rejected` ditambahkan bersama turunan AI tahap 2, saat penolakan menjadi alur utama.]

## 12. Catatan review egm

Review spek oleh subagent tanpa konteks, 19 Nov: 18 temuan (4 berat, 12 sedang, 2 ringan).

| # | Temuan | Keputusan |
| --- | --- | --- |
| 1 | Peran `pimpinan` tidak bisa meneruskan karena `visibleEmployeeScope()` hanya memberi tim kepada `supervisor` | Diperbaiki: 6.3, cakupan atasan untuk kedua peran, ditandai ⏳ untuk ditinjau Andrian |
| 2 | Impor per karyawan mungkin tidak punya sumber data (mockup menyebut laporan ringkasan) | Diangkat ke user; jawaban "dua-duanya": impor per karyawan + isian agregat (6.2) |
| 3 | Turunan AI dan asal nilai aktual tidak terjadwal; CCA-B3 diganti | Diperbaiki: turunan AI masuk tahap 2, `actualSource` di respons; dasar penggantian CCA-B3 ditulis di 6.1 dan PR |
| 4 | Kolom nilai/komponen bergantung konfigurasi, kerangka impor statis | Diperbaiki tanpa mengubah kerangka: gagal total bila pemetaan tidak pas, pesan memuat pasangan urutan dan nama |
| 5 | Indeks unik mengunci penugasan seumur hidup | Diperbaiki: unik per tier dan hanya untuk status berjalan |
| 6 | Bentuk `GET /assignments` HR kurang untuk layar | Diperbaiki: calon pimpinan `none`, penyebut KPI, `teamTotal` = ukuran tim |
| 7 | HR yang juga karyawan tidak punya `mine` | Diperbaiki: `mine` di semua bentuk |
| 8 | "Wawancarai karyawan yang belum selesai" tidak bisa dijalankan | Ditunda: membuka data per orang ke atasan, perlu keputusan pemilik produk (PR) |
| 9 | Skor per karyawan tanpa ekspor; divisi kecil terbaca | Diperbaiki: ekspor dan hapus (6.4) setelah basis integrasi memuat PR #11; ambang divisi ditolak dengan alasan RG-3 dan mockup |
| 10 | Tenant CCA saja tidak bisa mengimpor karyawan | Diperbaiki: `employees` dan `dna_job_levels` dibuka untuk `cca` |
| 11 | Aturan impor yang harus ditebak | Diperbaiki: baris ganda, potret, perubahan konfigurasi, divisi, peserta selesai tanpa skor |
| 12 | Validasi konfigurasi belum lengkap | Diperbaiki: bobot 100, aturan band, deskripsi band; tautan nama nilai ditolak dengan alasan |
| 13 | Kontrak respons dan store tidak ditulis | Diperbaiki: bagian 4 dan 5 |
| 14 | Ketentuan bertentangan (pembatalan, ringkasan, pengguna aktif, transisi status) | Diperbaiki: 5 dan 6.3 |
| 15 | CCA-B12 dan CCA-B1 tidak dipenuhi | Diterima sebagai penyimpangan ⏳ (6.1), dicatat di PR |
| 16 | Tahap 2 dan 3 tanpa rancangan | Diperbaiki sebagian: spek ini hanya mengikat tahap 1, sketsa di bagian 11 |
| 17 | Kesiapan bisa lebih dari 100% | Diperbaiki: jepitan di rumus |
| 18 | Rincian kecil (nama flag, zona waktu, FK batch) | Diperbaiki atau dijelaskan di 4, 5, 6.3 |

Review diff tahap 1 oleh subagent baru, 19 Nov: 11 temuan (0 berat, 5 sedang, 6 ringan). Temuan 1 sampai 7 dibuktikan subagent dengan skrip terhadap Postgres test.

| # | Temuan | Keputusan |
| --- | --- | --- |
| D1 | Impor ulang menghapus karyawan yang barisnya ditolak validasi | Diperbaiki: jenis impor ini `allOrNothing`, commit ditolak bila ada baris ditolak. Test ditambah |
| D2 | Template resmi apa adanya selalu gagal karena slot 1..8 dan 1..10 terpetakan otomatis | Diperbaiki: slot di atas jumlah program boleh terpetakan selama seluruh selnya kosong; teks bantuan diperbaiki. Test memakai template asli |
| D3 | Divisi lebih dari 255 karakter menghasilkan 500 | Diperbaiki: baris ditolak dengan pesan. Test ditambah |
| D4 | `PUT /programs/:key` tanpa `cutoffDate` menghapus tanggal dari impor | Diperbaiki: field opsional yang tidak dikirim mempertahankan nilai lama, `null` mengosongkan. Test ditambah |
| D5 | 409 palsu saat urutan `min` band bertukar | Diperbaiki: himpunan key dibanding setelah diurutkan nama. Test ditambah |
| D6 | Hitungan tim HR jadi nol setelah putaran baru | Diperbaiki: dihitung per penugas, cocok dengan KPI |
| D7 | Misi tampil sebelum Visi | Diperbaiki: urutan `vision`, `mission`, `value`, lalu posisi. Test ditambah |
| D8 | Cakupan tim memakai peran `supervisor` untuk pemanggil `pimpinan` | Tidak diubah sepihak: keputusan visibilitas untuk Andrian (6.3, PR). Bila disetujui, dipindah ke `core/rbac` sebagai aturan eksplisit |
| D9 | Hanya `/assignments` di balik flag baru | Tidak diubah: sebelum paket ini `module.cca` hanya kerangka dan tidak ada tenant pilot yang menyalakannya; spek bagian 5 sengaja hanya menahan wawancara. Dicatat di PR untuk Andrian |
| D10 | Penolakan di luar tim tidak diuji untuk `pimpinan` | Diperbaiki: test `dir` menugaskan `u.a` dan mendapat `rejected` |
| D11 | Test integrasi bergantung urutan | Ditunda: pola yang sama dipakai test integrasi lain di repo (satu tenant per berkas, `it` berurutan); memecahnya tidak mengubah perilaku. Dicatat sebagai utang test |

Layar tahap 3 tidak direview subagent terpisah (batas satu review diff per paket); diperiksa lewat e2e (8 skenario) dan tinjauan sendiri.

Review diff ulang dengan plugin egm (19 Nov, thread penerus): dua subagent terdaftar `egm:egm-codebase-details` dan `egm:egm-implementation-readiness`, mode REVIEW, standar `implementation-readiness-standard`, atas diff B10 saja (tanpa berkas B0). Triase dengan `egm-resolve`; laporan: `/mnt/project-files/elgos-eksekusi/egm-b10-b15/b10-goldfish_review_report.md`. 0 berat, 7 sedang (setelah duplikat digabung), 15 ringan.

| # | Temuan | Keputusan |
| --- | --- | --- |
| E1 | Baris status spek bertentangan dengan isi PR (tahap 3 ada di PR) | Diperbaiki: baris status |
| E2 | Aturan band terendah di bagian 4 (≥) beda dengan 6.2 dan kode (=); cabang cadangan `statusOf` mati | Diperbaiki: bagian 4, cabang dihapus |
| E3 | Jalur izin dan flag tanpa test (eta_admin, `cca.interview` di POST/PATCH/summary, `module.cca` mati, durasi, >200 penerima) | Diperbaiki: test ditambah |
| E4 | `audit.record` tidak pernah diuji | Diperbaiki: test empat resource |
| E5 | Isian agregat bisa tidak konsisten (band ≠ lulus) | Diperbaiki: validasi 6.5 + test (merah dulu) |
| E6 | Keputusan tahap 2 belum diputuskan (`in_progress`, isian HR vs sintesis, bentuk ringkasan, ambang responden, tabel tema) | Ditunda: wajib diputuskan di tambahan spek tahap 2 sebelum dibangun (dicatat di PR) |
| E7 | Fitur selain `/assignments` hanya di balik `module.cca`; `teamOf` memakai peran palsu | Sama dengan D8/D9: keputusan Andrian |
| E8 | `?group=toString` menghasilkan 500 | Diperbaiki: pemeriksaan own property + test (merah dulu) |
| E9 | `NOT IN ()` dengan larik kosong di `replaceProgramResults` | Diperbaiki: `NOT (user_id = ANY(CAST(:userIds AS uuid[])))` |
| E10 | Batas teks, format tanggal, presisi, persen bulat, `finalScore` ekspor, `biggestGap` null tidak tertulis | Diperbaiki: 6.5, bagian laporan |
| E11 | Tabel endpoint lebih longgar dari 6.3 soal pembatalan HR | Diperbaiki: bagian 5 |
| E12 | Tipe `Requirement` web tanpa `actualSource`/`origin` | Diperbaiki |
| E13 | Penghapusan `legacy-cca` tidak ada di diff | Dijelaskan di bagian 9 (lewat B0) |
| E14 | Bagian 12 sesudah 13 | Ditolak: nomor bagian dirujuk dari PR dan dokumen lain |
| E15 | Test isian agregat `null` dan cabang `PROGRAM_HAS_RESULTS` dari impor belum ada | Ditunda bersama D11 (utang test) |

Code review dua sumbu (`mattpocock-skills:code-review`, aturan 12), 19 Nov, dua subagent paralel atas `git diff review-base-b10 HEAD` (basis = scbrmb + B0).

Sumbu Standards (CLAUDE.md, kontrak B0, smell Fowler):

| # | Temuan | Keputusan |
| --- | --- | --- |
| S-1 | `teamOf` memalsukan peran ke `visibleEmployeeScope()` | Sama dengan D8: keputusan Andrian, tidak diubah sepihak |
| S-2 | Tombol teks dan kartu formulir tidak memakai `UiButton`/`UiCard` | Diperbaiki |
| S-3 | Rute `aiv` tidak memakai `meta.flag` | Ditolak dengan alasan: bagian 13 (butir menu tetap tampil karena syaratnya submodul; flag di meta membuat klik menu mengalihkan diam-diam) |
| S-4 | Gaya margin sebaris dan `h4` berkelas `el-h3` | Ditunda: kosmetik, dirapikan bersama token spasi B0 bila tersedia |
| S-5 | Duplikasi: `isHr`, `wrap`, pencarian program, daftar field patch, validator field | Pencarian program diperbaiki (`loadProgram`). `isHr`/`wrap`/validator dipindah ke `core` ditunda: kode bersama, butuh review Andrian dan menyentuh modul lain |
| S-6 | Status penugasan berupa string tersebar | Ditolak sebagian: label status sudah satu peta (`STATUS_LABEL`); sisa teks tindakan per layar memang berbeda |
| S-7 | Speculative generality (`origin 'ai'`, `completeAssignment`) | Ditolak dengan alasan: sambungan tahap 2 yang dijadwalkan di bagian 2 dan 11 |
| S-8 | `cca/index.js` memuat tiga urusan | Ditunda: dipecah per sub-router saat tahap 2 menambah endpoint percakapan |

Sumbu Spec (spek ini):

| # | Temuan | Keputusan |
| --- | --- | --- |
| P-1 | HR bisa membatalkan penugasan karyawan | Diperbaiki + test |
| P-2 | Skor di antara skor lulus dan band terendah masuk band terendah diam-diam | Diperbaiki: band terendah wajib sama dengan skor lulus (6.2) + test |
| P-3 | Tab nilai mengganti KPI gap terbesar, bukan menambah | Diperbaiki: empat KPI |
| P-4 | Baris yang ditolak tidak bisa dipulihkan dari layar | Ditunda, ⏳ di bagian 13 |
| P-5..7 | `role` di `GET /`, `participants`, bentuk respons isian agregat tidak tertulis | Dicatat di bagian 5 |
| P-8 | Tanggal layar memakai zona peramban, API memakai WIB | Diperbaiki (`due.ts`) |
