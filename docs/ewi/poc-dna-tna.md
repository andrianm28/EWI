# POC ELGOS Desember: DNA + TNA

Acuan: RG-1..RG-4 (rapat 10 Nov), catatan koordinasi ELGOS 10 Nov, keputusan teknis T1, T2, T4–T8.
INA tidak ikut POC (RG-4): temuan non-training tetap direkam, disembunyikan selama `module.ina` + `ina.dashboard` mati.

## Yang sudah dibangun

| Area | Endpoint | Catatan |
|---|---|---|
| Jenjang & kamus kompetensi | `GET/POST /api/dna/job-roles`, `GET/POST /api/dna/competencies`, `POST /competencies/bulk`, `POST /competencies/:id/approve` | Jumlah/nama jenjang dan syarat program per jenjang = konfigurasi per klien. `source` kompetensi dicatat (hr_rule, dacum, cca, both). |
| Posisi & program | `PUT /api/dna/employees/:id/position`, `POST /api/dna/program-completions` | Status lulus Basic/Intermediate/Advanced, sumber `manual` (HR). |
| Gap & karier | `GET /api/dna/employees`, `GET /api/dna/employees/:id`, `GET /api/dna/promotion-candidates` | Gap = skor terbaru vs skor minimal (0–4). Kandidat promosi = sudah lulus program jenjang berikutnya. |
| Wawancara (teks) | `/api/{dna,tna}/sessions` (+ `/:id/consent`, `/:id/turns`, `/:id/complete`) | Persetujuan wajib sebelum pertanyaan pertama. Analisis lewat port AI. |
| Data kinerja | `POST /api/tna/performance/import`, `GET /api/tna/performance` | OKR/KPI/SLA, arah target higher/lower, baris tak dikenal ditolak per baris. |
| Jadwal TNA | `POST /api/tna/projects/:id/interviews` | Target merah jadi pemicu yang dibahas di wawancara. |
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
| BT-29 siapa diwawancarai TNA | Tidak ada default: HR wajib memilih `all_members` atau `red_only` (atau diisi di settings) | `settings.tna.interviewScope` |
| BT-30 rumus Pareto | Rumus ★ (meleset × orang × kepentingan), komponen bisa dimatikan | `settings.tna.pareto` |
| BT-31 alur request training | HR dan atasan sama-sama bisa mengubah status | `PATCH /api/tna/plan-items/:id` |
| K-1 jalur LMS | Adapter EliteMentor dan Moodle masih stub kosong | `src/integrations/catalog` |
| K-3 set status | Memakai status yang ada di skema (proposed … completed) | `lna_training_plan_items.status` |

## Belum termasuk
SSO deep link (T1), token endpoint OAuth2 (T2), email undangan (T4), Sync Back webhook ke `lna_program_completions`, suara.
