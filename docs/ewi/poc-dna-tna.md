# POC ELGOS: DNA + TNA (live 2 Desember 2026)

Acuan: RG-1..RG-4 (rapat 10 Nov), catatan koordinasi ELGOS 10 Nov, keputusan teknis T1, T2, T4–T8, dan
arahan cadence 11 Nov (Ahmad Gilang) yang ditetapkan berlaku penuh pada 12 Nov:

- **C1** jadwal: mockup final 18 Nov, uji internal 25 Nov, POC live 2 Des.
- **C2** DNA di POC hanya menampilkan hasil wawancara DNA manual yang sudah dilakukan; wawancara AI DNA
  ditahan di balik flag `dna.ai_interview` (default mati).
- **C3** TNA reaktif: default hanya karyawan dengan target OKR/KPI/SLA merah yang diwawancarai (`red_only`).
  Klarifikasi user 12 Nov: cakupan mengikuti kebutuhan perusahaan, jadi HR juga bisa memilih semua karyawan
  di job role tertentu (`all_members` + `jobRoleId`). BT-29 final: cakupan diatur per klien/proyek.
  BT-19: POC ELGOS L1 memakai mode semua anggota tim L1 (seed dev: `tna.interviewScope = all_members`,
  `tna.interviewJobRoleId` = Service Delivery L1).
- **F6-A** (grilling komersial 13 Nov, menggantikan RG-1d): DNA = impor/bangun kamus kompetensi + asesmen
  gap individu yang proaktif; TNA tetap reaktif terhadap masalah kinerja. Kode POC sudah sesuai (gap individu
  ada di DNA lewat `lna_assessments`; TNA dipicu target merah), jadi tidak ada perubahan.
- **G2-A** (13 Nov): rekomendasi promosi adalah modul terpisah, di luar POC. Kode tetap ada tetapi di balik
  flag `promotion.recommendation` (default mati): `GET /api/dna/promotion-candidates` 403 dan
  `career.promotionCandidate` tidak dikirim. G4: pilot Desember 2026 (1 bulan).
- **G3-A** (13 Nov): nama produk resmi **ELGOS**. Teks yang dibaca orang memakai ELGOS; identifier teknis
  (schema `ewi`, variabel `EWI_*`, audience JWT `ewi`, path `docs/ewi/`) belum diganti dan menunggu keputusan user.
- **C4** TNA bisa berjalan tanpa DACUM/DNA: karyawan tanpa job role atau kamus kompetensi tetap bisa
  diwawancarai; temuannya tidak tertaut kompetensi dan training plan-nya menjadi `needs_module`.

INA tidak ikut POC (RG-4): temuan non-training tetap direkam, disembunyikan selama `module.ina` + `ina.dashboard` mati.

## Yang sudah dibangun

| Area | Endpoint | Catatan |
|---|---|---|
| Jenjang & kamus kompetensi | `GET/POST /api/dna/job-roles`, `GET/POST /api/dna/competencies`, `POST /competencies/bulk`, `POST /competencies/:id/approve` | Jumlah/nama jenjang dan syarat program per jenjang = konfigurasi per klien. `source` kompetensi dicatat (hr_rule, dacum, cca, both). |
| Posisi & program | `PUT /api/dna/employees/:id/position`, `POST /api/dna/program-completions` | Status lulus Basic/Intermediate/Advanced, sumber `manual` (HR). |
| Hasil DNA manual (C2) | `POST /api/dna/assessments/import` (rows JSON) atau impor file R3-3 | HR mengunggah: `employeeId`/`email`, `competency` (nama di kamus) atau `competencyId`, `score` 0–4, `evidence`. Pewawancara dan tanggal wawancara dicatat; baris tak dikenal ditolak per baris. Sumber skor (`manual_interview`, `ai_interview`, `eta_review`) tampil di detail karyawan. |
| Gap & karier | `GET /api/dna/employees`, `GET /api/dna/employees/:id`, `GET /api/dna/promotion-candidates` | Gap = skor terbaru vs skor minimal (0–4). Kandidat promosi (sudah lulus program jenjang berikutnya) hanya bila flag `promotion.recommendation` aktif (G2-A). |
| Wawancara AI (teks) | `/api/{dna,tna}/sessions` (+ `/:id/consent`, `/:id/turns`, `/:id/complete`) | Persetujuan wajib sebelum pertanyaan pertama. Analisis lewat port AI. Sesi DNA butuh flag `dna.ai_interview` (403 `FEATURE_DISABLED` bila mati). |
| Data kinerja | `POST /api/tna/performance/import`, `GET /api/tna/performance` | OKR/KPI/SLA, arah target higher/lower, baris tak dikenal ditolak per baris. |
| Aturan KPI (PK-20) | `GET/PUT /api/tna/kpi-rules` | Arah + toleransi per KPI (PM-1 ★ B). Kolom Toleransi di template kinerja; kosong = aturan tersimpan atau 0. Aturan berubah (lewat impor atau PUT) -> status semua periode KPI itu dihitung ulang dan diaudit (`tna.kpi_rule`). Sesi wawancara yang sudah terjadwal tidak dibatalkan otomatis. |
| Katalog course (PK-18) | Impor `catalog_courses` dan `catalog_completions` (DNA dan TNA), `GET /api/tna/catalog` | Daftar course Moodle sebagai katalog statis + pemetaan ke kompetensi (nama di kamus). Rencana `needs_module` yang kompetensinya mendapat course langsung terisi (`proposed`). Course lulus -> rencana yang menunjuknya `completed`. |
| Jadwal TNA | `POST /api/tna/projects/:id/interviews`, `GET /api/tna/job-roles` | Cakupan: `red_only` (default, dari `settings.tna.interviewScope`) atau `all_members` dengan `jobRoleId` wajib. Target merah jadi pemicu yang dibahas. Daftar job role tersedia tanpa modul DNA. |
| Temuan & prioritas | `GET /api/tna/findings`, `GET /api/tna/pareto`, `GET /api/tna/dashboard` | Pareto untuk HR dan atasan, bukan learner. |
| Training plan | `POST /api/tna/findings/:id/plan`, `POST /api/tna/training-requests`, `GET/PATCH /api/tna/plan-items` | Course dicari di katalog (EliteMentor stub, lalu Moodle statis). Tidak ada course -> `needs_module`. Item membawa `catalogItemUrl` dan `courseStatus`. Learner bisa request. |

Visibilitas (RG-3) berlaku di semua endpoint data karyawan: learner dirinya, atasan timnya, HR semua.

## Keputusan yang masih terbuka dan cara kodenya menunggu

| Keputusan | Perilaku sekarang | Tempat mengganti |
|---|---|---|
| T3 komponen AI | PK-06: `AI_PROVIDER=bedrock` (Amazon Bedrock, Claude, hanya ap-southeast-1; PD-1/PD-2 ★A, belum dijawab) wajib di produksi; `stub` deterministik tetap bawaan untuk test dan di luar produksi. Pemakaian token per panggilan di `ai_usage_logs` (R3-6). Rincian: [ai-teks.md](ai-teks.md) | `src/ai/` (`AI_PROVIDER`, `BEDROCK_MODEL_ID`) |
| RG-1a sumber kamus kompetensi | Semua sumber boleh masuk, dicatat di kolom `source` | `src/modules/dna` |
| RG-1b sumber status lulus | Hanya input manual HR; Sync Back belum disambungkan | `lna_program_completions.source` |
| RG-1c alur wawancara SME/DACUM | `POST /api/dna/dacum/sessions` -> 501 `DECISION_PENDING` | `src/modules/dna` |
| RG-1e kandidat promosi untuk atasan | Default paling sempit: hanya HR | `settings.dna.promotionVisibleTo` |
| RG-1g kekhususan klien | Disimpan di `tenants.settings` | `src/core/settings` |
| BT-30 rumus Pareto | Rumus ★ (meleset × orang × kepentingan), komponen bisa dimatikan | `settings.tna.pareto` |
| BT-31 alur request training | HR dan atasan sama-sama bisa mengubah status | `PATCH /api/tna/plan-items/:id` |
| K-1 jalur LMS | Adapter EliteMentor masih stub kosong; Moodle dilayani katalog statis hasil impor (PK-18). Sinkron API Moodle menyusul setelah pilot (PO-1 ★ B) | `src/integrations/catalog`, `settings.lms.targets` (default `elitementor`, `moodle`) |
| PM-1 definisi target meleset | ★ B dipakai: arah + toleransi per KPI, kosong = 0 (setara A) | `src/modules/tna/performance.js`, `lna_kpi_rules` |
| K-3 set status | Memakai status yang ada di skema (proposed … completed) | `lna_training_plan_items.status` |

## Keputusan yang sudah masuk kode (cadence 11 Nov)

| Keputusan | Perilaku | Tempat |
|---|---|---|
| C2 DNA di POC = tampilan hasil manual | Impor hasil + flag `dna.ai_interview` default mati; web tidak memuat sesi DNA bila flag mati | `src/modules/dna`, `src/core/flags` |
| C3 / BT-29 / BT-19 siapa diwawancarai TNA | Default produk `red_only`; per klien diatur `settings.tna.interviewScope` + `interviewJobRoleId` (ELGOS: semua anggota L1). Layar penjadwalan memakai default klien dan HR bisa menggantinya per proyek | `src/core/settings`, `src/modules/tna` |
| C4 TNA tanpa DACUM | Tidak ada syarat job role/kamus kompetensi untuk sesi TNA | `src/modules/tna`, `src/modules/interviews` |

## Keamanan data (grilling teknis 13 Nov)

| Keputusan | Perilaku | Tempat |
|---|---|---|
| R2-1 siapa mengubah flag | Hanya `eta_admin` (HR 403, termasuk baca rincian): `GET /api/admin/flags`, `PUT /api/admin/flags/:key` `{enabled}` untuk tenant tempat Admin ETA login. Kill switch global `PUT /api/admin/kill-switches/:key` `{active, reason}` mematikan fitur di semua tenant tanpa deploy (alasan wajib saat menyalakan). Setiap perubahan masuk `audit_logs` (`feature_flag`/`kill_switch`, nilai lama dan baru). | `src/core/flags`, tabel `feature_kill_switches` |
| R2-2 audit baca data individu | Wajib, tanpa flag. Dicatat: siapa, peran, kapan, tenant, karyawan (`meta.employeeIds`), objek (`meta.objectType/objectIds`). Endpoint: detail/daftar profil DNA, kandidat promosi, transkrip sesi DNA/TNA, temuan TNA, training plan. Dashboard agregat (`/tna/dashboard`, `/tna/pareto`) tidak dicatat. Gagal mencatat = request gagal. `audit_logs` append-only: UPDATE/DELETE/TRUNCATE ditolak trigger; pemeliharaan hanya DBA lewat `SET LOCAL ewi.audit_maintenance = 'on'`. | `src/core/audit`, migrasi `20261113000005` |

| R3-3 impor data POC | HR mengimpor file XLSX/CSV lewat `/api/{dna,tna}/imports`: unduh template (`GET /templates/:jenis.xlsx|csv`, XLSX berisi lembar Petunjuk), unggah (`POST /:jenis?filename=`, body file mentah), saran pemetaan kolom dari judul + sinonim, `POST /batches/:id/preview` (validasi semua baris, alasan penolakan per nomor baris), `POST /batches/:id/commit`, riwayat `GET /batches`. Jenis: jenjang & program, data karyawan & posisi (akun tanpa kata sandi, HR/Admin tidak bisa diubah), kamus kompetensi, status lulus program, hasil DNA manual, kinerja KPI/OKR/SLA. Baris mentah dihapus setelah disimpan; simpan masuk audit log. BT-26: tipe nilai angka/persen/rating/biner/tenggat. Template untuk klien: `node apps/api/scripts/export-templates.js <folder>`. | `src/modules/imports`, migrasi `20261113000006` |
| R3-2 login karyawan | Link email saja (tanpa SSO). `POST /api/auth/email-link` `{tenant, email}` selalu menjawab 202 dengan pesan yang sama (tanpa enumerasi akun), maks 3 link per 15 menit per akun. Link `APP_BASE_URL/masuk#token=…` berlaku 15 menit, sekali pakai, hanya hash SHA-256 yang disimpan; web menukar token lewat `POST /api/auth/email-link/verify` setelah tombol ditekan (pemindai link email tidak memakainya). HR: `POST /api/invitations` mengirim undangan 7 hari ke karyawan yang belum pernah masuk (HR/Admin tidak diundang). Login dan undangan masuk audit log. Pengiriman: `MAIL_PROVIDER=ses` + `MAIL_FROM` (wajib di produksi; domain pengirim menunggu R2-5), `log` untuk dev/staging. Login password tetap ada untuk HR/Admin. | `src/core/auth/email-link.js`, `src/integrations/mailer`, migrasi `20261113000007` |
| R2-3 enkripsi per tenant | Envelope encryption di aplikasi: tiap tenant punya data key AES-256 yang dibungkus kunci induk tenant (`ENCRYPTION_PROVIDER=kms`: KMS key per tenant lewat alias `alias/<KMS_KEY_ALIAS_PREFIX>-<tenantId>` dengan encryption context tenant; `local`: kunci induk `EWI_LOCAL_MASTER_KEY` untuk dev di luar AWS). DEK terbungkus di `tenant_keys`. Terenkripsi (AES-256-GCM, AAD = tenant): transkrip dan jawaban, bukti asesmen, judul dan detail temuan, catatan rencana training, baris mentah impor. Skor angka tetap terbuka agar bisa dihitung. Data lama dibaca apa adanya sampai `node apps/api/scripts/encrypt-existing.js` dijalankan. Produksi wajib KMS. Belum: rotasi key, pembuatan KMS key otomatis saat tenant dibuat, key milik klien (pertanyaan lanjutan R2-3); SSE-KMS S3 per tenant menunggu IaC. | `src/core/crypto`, migrasi `20261113000008` |

Catatan R2-1: panel Admin ETA lintas tenant (memilih tenant lain dari satu login) belum dibuat karena aturan arsitektur 2
(tenant hanya dari `req.tenantId`); Admin ETA masuk ke tenant yang mau diatur. Di produksi, role DB aplikasi
sebaiknya juga tanpa hak UPDATE/DELETE/TRUNCATE pada `audit_logs`.

## Review hasil AI oleh HR (PK-14, 17 Nov)

Dibangun dengan opsi ★ karena PD-13, PD-14, PM-3, dan PM-5 belum dijawab.

- **Analisis sebagai job (PD-13 ★A).** `POST /:submodule/sessions/:id/complete` hanya menutup sesi (update bersyarat, jadi dua permintaan bersamaan menghasilkan satu 202 dan satu 409) lalu membuat satu job di `lna_analysis_jobs` (unik per sesi) dan menjalankannya di latar. Job diklaim dengan update bersyarat dan lease 10 menit. Hasil disimpan dalam satu transaksi bersama penandaan job selesai, dan indeks unik `(analysis_job_id, finding_seq)` menjadi pengaman kedua, sehingga job yang diulang tidak menggandakan temuan. Gagal diulang otomatis sampai 3 kali (jeda 1, 2 menit); setelah itu HR mengulang lewat `POST /:submodule/sessions/:id/analysis/retry`. Status: `GET /:submodule/sessions/:id/analysis` (HR melihat jumlah hasil dan kode galat, peran lain hanya status). Server menyapu job tertinggal tiap menit; `node apps/api/scripts/run-analysis.js` untuk pemulihan manual.
- **Dua kali penilaian.** Model dipanggil dua kali. Temuan yang muncul di kedua penilaian (kunci: kategori + kompetensi + target) mendapat rata-rata keyakinan dan `scoring_agreement = true`; yang hanya muncul sekali mendapat setengah keyakinan. Temuan yang hanya muncul di penilaian kedua tidak disimpan, hanya dihitung (`result.onlySecond`). Biaya AI analisis menjadi dua kali.
- **Status review per temuan (PD-14 ★A).** `lna_findings.review_status`: `draft` → `approved` | `edited` | `rejected`, dengan `confidence`, `reviewed_by`, `reviewed_at`, `review_note`, dan versi asli AI (`original_title`, `original_detail`, `original_category`) bila diubah, sebagai bahan pemantauan akurasi (PM-2). Judul, rincian, catatan, dan versi asli terenkripsi per tenant. Penolakan wajib beralasan. Setiap putusan dicatat di audit (`update`, `tna.finding_review`).
- **Draf tersembunyi (PM-5 ★A).** `tna.listFindings` hanya mengembalikan temuan `approved`/`edited`, jadi draf dan yang ditolak tidak muncul di daftar temuan, Pareto, dashboard, rencana training, maupun ekspor data karyawan (PR #11 memakai `listFindings`). Training plan dan permintaan training dari draf ditolak. Dashboard HR menampilkan `reviewPending`.
- **Antrean HR (PM-3 ★A).** `GET /api/tna/review?status=draft|reviewed|all` dan `POST /api/tna/findings/:id/review` `{ decision: approve|edit|reject, title?, detail?, category?, note? }`, hanya HR (dan Admin ETA). Layar web `/m/tna/review`.
- **Tidak di balik flag.** Review adalah pengaman wajib sebelum hasil AI dipakai, bukan fitur opsional, jadi tidak mengikuti aturan "fitur baru di balik flag".
- **Migrasi.** `20261117000400-ai-review.js`. Temuan lama yang sudah ditindaklanjuti HR (status bukan `open`) dianggap disetujui; temuan lama lain menjadi draf.
- **Belum:** skor AI DNA tidak punya status review (wawancara AI DNA di balik flag `dna.ai_interview`, mati di POC; job DNA tetap dua kali nilai). Transkrip tidak ditampilkan di layar review karena PO-6 ★A (transkrip hanya untuk karyawan sendiri).

## Belum termasuk
SSO deep link (T1), token endpoint OAuth2 (T2), pengingat wawancara lewat email (T4), Sync Back webhook ke `lna_program_completions`.
Diputuskan 13 Nov, menyusul: R3-1 wawancara TNA teks + suara
(realtime speech-to-speech lewat voice gateway ELGOS, adapter penyedia bisa diganti).
