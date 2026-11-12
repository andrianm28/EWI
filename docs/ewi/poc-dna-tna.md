# POC ELGOS: DNA + TNA (live 2 Desember 2026)

Acuan: RG-1..RG-4 (rapat 10 Nov), catatan koordinasi ELGOS 10 Nov, keputusan teknis T1, T2, T4–T8, dan
arahan cadence 11 Nov (Ahmad Gilang) yang ditetapkan berlaku penuh pada 12 Nov:

- **C1** jadwal: mockup final 18 Nov, uji internal 25 Nov, POC live 2 Des.
- **C2** DNA di POC hanya menampilkan hasil wawancara DNA manual yang sudah dilakukan; wawancara AI DNA
  ditahan di balik flag `dna.ai_interview` (default mati).
- **C3** TNA reaktif: default hanya karyawan dengan target OKR/KPI/SLA merah yang diwawancarai (`red_only`).
  Klarifikasi user 12 Nov: cakupan mengikuti kebutuhan perusahaan, jadi HR juga bisa memilih semua karyawan
  di job role tertentu (`all_members` + `jobRoleId`). BT-29 difinalkan di grilling bisnis.
- **C4** TNA bisa berjalan tanpa DACUM/DNA: karyawan tanpa job role atau kamus kompetensi tetap bisa
  diwawancarai; temuannya tidak tertaut kompetensi dan training plan-nya menjadi `needs_module`.

INA tidak ikut POC (RG-4): temuan non-training tetap direkam, disembunyikan selama `module.ina` + `ina.dashboard` mati.

## Yang sudah dibangun

| Area | Endpoint | Catatan |
|---|---|---|
| Jenjang & kamus kompetensi | `GET/POST /api/dna/job-roles`, `GET/POST /api/dna/competencies`, `POST /competencies/bulk`, `POST /competencies/:id/approve` | Jumlah/nama jenjang dan syarat program per jenjang = konfigurasi per klien. `source` kompetensi dicatat (hr_rule, dacum, cca, both). |
| Posisi & program | `PUT /api/dna/employees/:id/position`, `POST /api/dna/program-completions` | Status lulus Basic/Intermediate/Advanced, sumber `manual` (HR). |
| Hasil DNA manual (C2) | `POST /api/dna/assessments/import` | HR mengunggah CSV: `employeeId`/`email`, `competency` (nama di kamus) atau `competencyId`, `score` 0–4, `evidence`. Pewawancara dan tanggal wawancara dicatat; baris tak dikenal ditolak per baris. Sumber skor (`manual_interview`, `ai_interview`, `eta_review`) tampil di detail karyawan. |
| Gap & karier | `GET /api/dna/employees`, `GET /api/dna/employees/:id`, `GET /api/dna/promotion-candidates` | Gap = skor terbaru vs skor minimal (0–4). Kandidat promosi = sudah lulus program jenjang berikutnya. |
| Wawancara AI (teks) | `/api/{dna,tna}/sessions` (+ `/:id/consent`, `/:id/turns`, `/:id/complete`) | Persetujuan wajib sebelum pertanyaan pertama. Analisis lewat port AI. Sesi DNA butuh flag `dna.ai_interview` (403 `FEATURE_DISABLED` bila mati). |
| Data kinerja | `POST /api/tna/performance/import`, `GET /api/tna/performance` | OKR/KPI/SLA, arah target higher/lower, baris tak dikenal ditolak per baris. |
| Jadwal TNA | `POST /api/tna/projects/:id/interviews`, `GET /api/tna/job-roles` | Cakupan: `red_only` (default, dari `settings.tna.interviewScope`) atau `all_members` dengan `jobRoleId` wajib. Target merah jadi pemicu yang dibahas. Daftar job role tersedia tanpa modul DNA. |
| Temuan & prioritas | `GET /api/tna/findings`, `GET /api/tna/pareto`, `GET /api/tna/dashboard` | Pareto untuk HR dan atasan, bukan learner. |
| Training plan | `POST /api/tna/findings/:id/plan`, `POST /api/tna/training-requests`, `GET/PATCH /api/tna/plan-items` | Modul tak ada di katalog -> `needs_module`. Learner bisa request. |

Visibilitas (RG-3) berlaku di semua endpoint data karyawan: learner dirinya, atasan timnya, HR semua.

## Keputusan yang masih terbuka dan cara kodenya menunggu

| Keputusan | Perilaku sekarang | Tempat mengganti |
|---|---|---|
| T3 komponen AI | Penyedia `stub` deterministik (tanpa LLM); skor ber-confidence 0,2 dan bertanda "perlu dinilai ulang ETA" | `src/ai/` (`AI_PROVIDER`) |
| RG-1a sumber kamus kompetensi | Semua sumber boleh masuk, dicatat di kolom `source` | `src/modules/dna` |
| RG-1b sumber status lulus | Hanya input manual HR; Sync Back belum disambungkan | `lna_program_completions.source` |
| RG-1c alur wawancara SME/DACUM | `POST /api/dna/dacum/sessions` -> 501 `DECISION_PENDING` | `src/modules/dna` |
| RG-1e kandidat promosi untuk atasan | Default paling sempit: hanya HR | `settings.dna.promotionVisibleTo` |
| RG-1g kekhususan klien | Disimpan di `tenants.settings` | `src/core/settings` |
| BT-30 rumus Pareto | Rumus ★ (meleset × orang × kepentingan), komponen bisa dimatikan | `settings.tna.pareto` |
| BT-31 alur request training | HR dan atasan sama-sama bisa mengubah status | `PATCH /api/tna/plan-items/:id` |
| K-1 jalur LMS | Adapter EliteMentor dan Moodle masih stub kosong | `src/integrations/catalog` |
| K-3 set status | Memakai status yang ada di skema (proposed … completed) | `lna_training_plan_items.status` |

## Keputusan yang sudah masuk kode (cadence 11 Nov)

| Keputusan | Perilaku | Tempat |
|---|---|---|
| C2 DNA di POC = tampilan hasil manual | Impor hasil + flag `dna.ai_interview` default mati; web tidak memuat sesi DNA bila flag mati | `src/modules/dna`, `src/core/flags` |
| C3 / BT-29 siapa diwawancarai TNA | Default `red_only`; HR bisa memilih semua karyawan di job role tertentu per penjadwalan; default organisasi diatur di settings | `settings.tna.interviewScope`, `src/modules/tna` |
| C4 TNA tanpa DACUM | Tidak ada syarat job role/kamus kompetensi untuk sesi TNA | `src/modules/tna`, `src/modules/interviews` |

## Belum termasuk
SSO deep link (T1), token endpoint OAuth2 (T2), email undangan (T4), Sync Back webhook ke `lna_program_completions`, suara.
