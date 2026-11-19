# B7 · Tinjauan HR atas temuan AI

Status: backend terbangun dan direview egm tahap 5–9 (19 Nov 2026), PR #24. Paket T5 di brief bangun penuh. Dasar kode: PR #16 (review hasil AI, PK-14), PR #12 (status rencana K-3), PR #13 (katalog course), PR #11 (privasi).

Penanda: `[⚠️ BELUM TERVERIFIKASI]` = asumsi yang belum dikonfirmasi pemiliknya; `[⏳ DITERIMA]` = kekurangan yang sengaja diterima untuk POC 2 Des, dicatat di PR. Laporan review: `docs/designs/egm/b7/`.

## Tujuan

HR memastikan klasifikasi tiap temuan AI sebelum solusi dijalankan ("AI tidak memutuskan sendiri", mockup Pak Eji layar "Tinjauan temuan AI"). Setelah klasifikasi, temuan Training Needs mendapat rekomendasi modul dan bisa ditugaskan, temuan Improvement Needs (kategori `non_training`) diteruskan ke modul Improvement Needs.

Bukan tujuan paket ini: tabel dan layar Improvement Needs (B9, thread T6), Library modul (B13), sinkron progres dari EliteMentor (B14). Layar web dibangun di PR lanjutan di atas B0: rute bernama `review` (B0 §5.3, `meta.roles: ['hr_admin', 'eta_admin']`), dan `screens/legacy-review` dihapus begitu rute itu ada (B0 §4). Spek ini mencakup backend dan kontrak layar.

## Layar mockup yang dicakup

`project/Main.dc.html` bagian `TINJAUAN HR` (baris 671–702) dan logika `tinjauan HR` (baris 1933–1944):

1. Kartu "Temuan dan klasifikasi": tiap temuan menampilkan teks, keyakinan AI (%), dan tiga tombol: **Training Needs**, **Improvement Needs**, **Perlu ditinjau HR**. Label tombol ketiga mengikuti mockup; di model dan di spek ini artinya "ditahan" (lihat pemetaan di bawah).
2. Kartu "Solusi pelatihan": modul rekomendasi (kode, nama, level) dan tombol "Tugaskan di EliteMentor". Catatan mockup: "Bila klien tidak memakai EliteMentor, gap diekspor ke LMS klien."
3. Kartu "Tindakan perbaikan": tombol "Buat tindakan di Improvement Needs".

Yang tidak ada di mockup tetapi sudah diputuskan dan tetap dibangun: target tinjauan 2 hari kerja (PM-3), tanpa transkrip di layar tinjauan (PO-6 A).

## Model yang sudah ada (PR #16)

`lna_findings.review_status`: `draft` → `approved | edited | rejected`. `category`: `training | non_training`. Temuan draf tidak tampil di luar antrean review. Endpoint: `GET /api/tna/review`, `POST /api/tna/findings/:id/review` (`approve | edit | reject`).

## Pemetaan tiga tombol mockup ke model

| Tombol | Akibat |
| --- | --- |
| Training Needs | `category = training`; `review_status = approved` bila kategori AI sudah `training`, `edited` bila HR mengubahnya (kategori asli disimpan di `original_category`) |
| Improvement Needs | `category = non_training`; aturan `approved`/`edited` sama |
| Perlu ditinjau HR | Temuan tetap `draft` (tidak tampil di luar antrean) dan ditandai ditahan: `review_hold_at`, `review_hold_by`, `review_hold_note` |

- Temuan yang ditahan tetap bisa diklasifikasi atau ditolak kemudian. Tanda tahan tidak dihapus saat keputusan akhir (jejak). Menahan temuan yang sudah ditahan memperbarui catatan dan waktunya.
- `held` di respons = `review_hold_at` terisi **dan** `review_status = 'draft'`.
- Di mockup "Perlu ditinjau HR" juga bisa menjadi saran AI (keyakinan rendah). Model AI hanya menghasilkan dua kategori, jadi `suggestedClassification` = `needs_review` bila `confidence < 0.5` atau `scoringAgreement = false`; selain itu mengikuti kategori AI.
- **Koreksi salah klik.** Di mockup HR bisa berpindah pilihan sebelum solusi dijalankan. Karena itu temuan `approved`/`edited` boleh diklasifikasi ulang antara `training` dan `improvement` selama belum punya rencana training dan belum diserahkan ke Improvement Needs. Sesudah itu `409 ALREADY_ACTIONED`. Temuan `rejected` final. Klasifikasi ulang ke `needs_review` tidak ada (temuan sudah terlihat pihak lain).
- `POST /findings/:id/review` (PR #16) tetap dipakai untuk mengubah teks dan menolak. `classify` adalah jalur cepat tiga tombol mockup.

## Data dan migrasi

`apps/api/migrations/20261119000700-tinjauan-hr.js` (raw SQL, ada `down`):

- `lna_findings`: `review_hold_at timestamptz`, `review_hold_by uuid REFERENCES users ON DELETE SET NULL`, `review_hold_note text` (terenkripsi seperti `review_note`; masuk `REVIEW_COLS` dan `REVIEW_ENC`, dengan join `users` untuk `heldByName`), `improvement_handoff_at timestamptz`, `improvement_handoff_by uuid REFERENCES users ON DELETE SET NULL`.
- `lna_training_plan_items`: `assignment_target varchar(16) CHECK IN ('elitementor')`, `assignment_status varchar(16) CHECK IN ('sending','sent','failed')`, `assignment_ref varchar(128)`, `assignment_claimed_at timestamptz`, `assigned_at timestamptz`, `assigned_by uuid REFERENCES users ON DELETE SET NULL`.

Konfigurasi tenant (`tenants.settings`, lewat `core/settings`), tanpa migrasi. Nilai tidak valid jatuh ke default:

- `tna.reviewTargetDays`: bilangan bulat 1–30, default `2` (PM-3).
- `lms.delivery`: `'elitementor'` (default) atau `'lms_export'` (K4). Ini **tempat karyawan belajar**; berbeda dari `lms.targets` (yang ada), yaitu urutan katalog yang dicari saat mencocokkan course.
- `lms.lmsName`: nama LMS klien untuk label, default `'LMS perusahaan'`.
- `lms.elitementorOrganizationId`: id organisasi tenant di EliteMentor, default `null`.

**Tenant pilot ELGOS (2 Des):** katalognya impor Moodle dan adapter katalog EliteMentor masih kosong, jadi tenant pilot diset `lms.delivery = 'lms_export'` dan jalur yang berfungsi adalah ekspor CSV. Penugasan langsung ke EliteMentor baru hidup setelah kontrak FR-EM final.

## Alur

1. HR membuka antrean (`GET /review`), mengklasifikasi tiap temuan (`POST /findings/:id/classify`).
2. HR membuka solusi (`GET /review/solutions`): temuan training dengan rekomendasi course, temuan improvement.
3. Untuk temuan training, HR membuat rencana lewat endpoint yang ada `POST /findings/:id/plan` (mengisi course dari katalog), lalu menugaskannya (`POST /plan-items/:id/assign`) atau mengekspor daftar (`GET /plan-items/export.csv`). Di web: bila `delivery.assignAvailable` benar, satu tombol "Tugaskan" memanggil plan lalu assign; bila salah (termasuk tenant pilot `lms_export`), tombolnya "Buat rencana" dan hanya memanggil plan, lalu HR mengunduh CSV. Rencana per temuan idempoten: klik ulang mendapat `409 ALREADY_ACTIONED`, tidak membuat baris kedua.
4. Untuk temuan improvement, HR meneruskannya ke Improvement Needs (`POST /review/improvement-handoff`).

## Endpoint

Semua di router `tna`, jadi lewat `requireSubmodule('tna')`. Semua hanya HR (`requireRole(HR_ADMIN)`, dipasang sebelum pemeriksaan flag supaya peran lain mendapat `403 ROLE_FORBIDDEN`, bukan status flag). Karena hanya HR (cakupan seluruh tenant), `visibleEmployeeScope()` tidak dipanggil. Admin ETA ikut lolos seperti di seluruh `requireRole`; setiap aksesnya tercatat di audit dengan perannya, dan itu dianggap memenuhi "akses tercatat" PM-3 `[⏳ DITERIMA]` (pembatasan Super Admin adalah urusan B2). `tenant_id` dari `req.tenantId`; objek tenant lain selalu `404`.

### Tanpa flag (hanya menambah field baca pada pengaman review PR #16)

1. `GET /api/tna/review` (ada, `projectId` opsional). Tambahan per item: `held`, `heldAt`, `heldByName`, `holdNote`, `suggestedClassification`, `reviewDueAt`, `overdue`. Tambahan di respons: `counts.held`, `counts.overdue` (dihitung dari seluruh draf dalam cakupan `projectId` yang sama, bukan hanya baris yang difilter `status`), `targetDays`.
   - Awal hitungan = waktu sesi wawancara selesai (`lna_interview_sessions.ended_at`, sesuai PM-3 "setelah wawancara selesai"); temuan tanpa sesi memakai `createdAt` temuan.
   - `reviewDueAt` = jam yang sama pada hari kerja ke-`targetDays` setelah tanggal awal (tanggal dan hari menurut WIB; hari kerja = Senin–Jumat). Contoh dengan 2 hari: Senin 10.00 → Rabu 10.00; Kamis 10.00 → Senin 10.00; Jumat 23.30 → Selasa 23.30; Sabtu 10.00 → Selasa 10.00; Minggu 10.00 → Selasa 10.00. `[⏳ DITERIMA]` tanpa kalender libur nasional; test unit mencakup kelima contoh.
   - `overdue` = masih `draft` dan `now > reviewDueAt`. Temuan yang ditahan tetap dihitung terlambat.

### Di balik flag baru `tna.review_workspace` (default mati)

Aturan CLAUDE.md nomor 3: klasifikasi, tahan, solusi, penugasan, ekspor, dan serah ke Improvement Needs adalah perilaku baru, jadi semuanya di balik satu flag. Flag mati → `403 FEATURE_DISABLED`.

2. `POST /api/tna/findings/:id/classify` body `{ classification: 'training' | 'improvement' | 'needs_review', note? }`.
   - Temuan dari sesi yang persetujuannya ditarik (B8), draf maupun sudah diputus → `409 CONSENT_WITHDRAWN` (dibekukan, keputusan user 19 Nov; B8 "Aturan baca").
   - Temuan `draft`: `training`/`improvement` memakai `stores.tna.reviewFinding` (bersyarat `review_status = 'draft'`, dua HR bersamaan tidak saling timpa; yang kalah `409 ALREADY_REVIEWED`); `needs_review` memakai `stores.tna.holdFinding` (bersyarat `draft`).
   - Temuan `approved`/`edited`: hanya `training`/`improvement`, lewat `stores.tna.reclassifyFinding` (satu `UPDATE` bersyarat: `status = 'open'`, belum ada baris rencana untuk temuan itu, dan `improvement_handoff_at IS NULL`; `original_category` diisi bila belum terisi; `review_status` menjadi `edited`). Tidak memenuhi syarat → `409 ALREADY_ACTIONED`. Kategori sama → `200` tanpa perubahan. `needs_review` → `409 ALREADY_REVIEWED`.
   - Temuan `rejected` → `409 ALREADY_REVIEWED`. `classification` lain → `400`. `note` maks 2000 karakter.
   - Audit `update` `tna.finding_review` `{ employeeIds, objectIds, decision: 'approved' | 'edited' | 'hold' | 'reclassified', classification, from, confidence }`. Audit ditulis setelah perubahan tersimpan (pola PR #16) `[⏳ DITERIMA]`.
   - Respons: item review terbaru (bentuk butir 1).
3. `GET /api/tna/review/solutions` (`projectId` opsional). Respons:
   ```json
   { "data": {
       "training": [{ "findingId", "userId", "userName", "title", "competencyName",
                      "recommendation": { "source", "ref", "title", "url", "programTier" } | null,
                      "planItem": { "id", "status", "needsModule", "catalogSource", "catalogItemRef", "catalogItemTitle",
                                    "assignmentStatus", "assignmentTarget", "assignedAt" } | null }],
       "improvement": [{ "findingId", "userId", "userName", "title", "handedOffAt" }],
       "delivery": { "target", "label", "assignAvailable" },
       "inaEnabled": true | false } }
   ```
   - Hanya temuan `approved`/`edited`. `planItem` = rencana terbaru untuk temuan itu yang tidak `rejected`. `recommendation` hanya dihitung bila belum ada `planItem` dan temuan punya kompetensi, dari `catalog.match`. `null` berarti perlu modul baru, termasuk temuan tanpa kompetensi (katalog dicocokkan per kompetensi, jadi tidak dicari). Satu panggilan per temuan `[⏳ DITERIMA]` (antrean pilot puluhan baris).
   - Daftar `improvement` tampil untuk HR tanpa flag `tna.non_training_hr` maupun `module.ina`: HR sudah melihat temuan yang sama di antrean review. Tombol serah ke Improvement Needs di web memakai `inaEnabled`.
   - `delivery.label`: `EliteMentor` atau `lms.lmsName`. `delivery.assignAvailable`: lihat tabel keputusan.
   - Tidak pernah memuat giliran percakapan. Audit `readIndividual` `tna.review_solutions`.
4. `POST /api/tna/plan-items/:id/assign`. Menugaskan satu rencana ke EliteMentor.

   | Urutan cek | Kondisi | Respons |
   | --- | --- | --- |
   | 1 | Rencana tidak ada / tenant lain | `404` |
   | 2 | Status bukan `new`/`in_progress` | `409 INVALID_STATE` |
   | 3 | `catalog_item_ref` kosong | `409 NEEDS_MODULE` |
   | 4 | `assignment_status = 'sent'` | `200`, data yang ada, tidak mengirim ulang |
   | 5 | `lms.delivery = 'lms_export'` | `409 ASSIGN_VIA_EXPORT` |
   | 6 | Flag `em.gaps_autosend` mati, adapter tidak terpasang, atau `lms.elitementorOrganizationId` kosong | `409 ASSIGN_UNAVAILABLE` |
   | 7 | `catalog_source` rencana bukan `elitementor` | `409 COURSE_NOT_IN_TARGET` |
   | 8 | Klaim gagal (permintaan lain sedang mengirim) | `409 ASSIGN_IN_PROGRESS` |

   - `delivery.assignAvailable` di butir 3 = baris 5 dan 6 lolos.
   - Klaim: `UPDATE ... SET assignment_status = 'sending', assignment_target = 'elitementor', assignment_claimed_at = clock_timestamp() WHERE tenant_id = :tenantId AND id = :id AND status IN ('new','in_progress') AND catalog_item_ref IS NOT NULL AND catalog_source = 'elitementor' AND (assignment_status IS NULL OR assignment_status = 'failed' OR (assignment_status = 'sending' AND assignment_claimed_at < now() - interval '5 minutes')) RETURNING assignment_claimed_at`. Syarat diulang di klaim karena rencana bisa berubah sejak dibaca. Hanya pemenang klaim yang memanggil EliteMentor.
   - Panggilan keluar memakai batas waktu 10 detik (termasuk pengambilan token) dan `planItemId` sebagai kunci idempotensi (field `idempotencyKey` di body dan header `Idempotency-Key`). `[⚠️ BELUM TERVERIFIKASI]` dukungan kunci ini di EliteMentor.
   - Penutupan klaim (`finishPlanAssignment`) hanya berlaku untuk pemilik klaim (`assignment_claimed_at` sama). Sukses: `assignment_status = 'sent'`, `assignment_ref`, `assigned_at/by`; status rencana tidak berubah (progres datang dari sinkron B14). Gagal: `failed`, respons `502 EM_ASSIGN_FAILED`; boleh dicoba lagi. Bila klaimnya sudah diambil alih permintaan lain (macet > 5 menit), hasilnya tidak disimpan, baik EliteMentor sukses maupun gagal: respons `409 ASSIGN_IN_PROGRESS` dan audit `result: 'superseded'` (pada sukses, audit juga memuat `ref` yang tidak tersimpan). `assignment_ref` diambil dari `id` respons, atau `ref` bila `id` tidak ada.
   - Data pribadi yang keluar ke EliteMentor: `employeeId` dan email karyawan, serta kode dan judul course. Payload: `{ idempotencyKey, employeeId, email, courseRef, courseTitle }`; `assignment_ref` diambil dari `id` respons. Tercatat di audit `update` `tna.plan_assignment` `{ employeeIds, objectIds, target, result: 'sent' | 'failed' | 'superseded' }`.
5. `GET /api/tna/plan-items/export.csv` (`projectId` opsional). Ekspor gap untuk LMS klien (K4); tersedia apa pun nilai `lms.delivery`. Hanya membaca, tidak menandai apa pun (yang sudah diekspor ikut lagi di ekspor berikutnya; LMS klien yang menyaring) `[⏳ DITERIMA]`.
   - Baris: rencana berstatus `new`/`in_progress`, semua origin, termasuk yang belum punya course (kolom course kosong). Filter `projectId` lewat proyek temuan, jadi rencana tanpa temuan (permintaan karyawan) tidak ikut bila `projectId` diisi.
   - Kolom: `ID Karyawan, Nama, Email, Kompetensi, Kode Course, Judul Course, Program, Status Rencana`. Sel yang diawali `= + - @` (atau tab/CR) diberi awalan `'`.
   - Audit `export` `tna.plan_items` `{ employeeIds, count }` ditulis sebelum respons dikirim (audit gagal = ekspor gagal).
6. `POST /api/tna/review/improvement-handoff` body `{ findingIds: [uuid] }` (1–200 id).
   - Flag `module.ina` mati → `409 INA_DISABLED`.
   - Satu `UPDATE ... WHERE tenant_id = :tenantId AND id IN (:ids) AND category = 'non_training' AND review_status IN ('approved','edited') AND improvement_handoff_at IS NULL RETURNING id` → `handedOff`. Id yang memenuhi syarat tetapi sudah ditandai → `already`. Sisanya (draf, training, ditolak, tenant lain, tidak ada) → `skipped`.
   - Respons `{ handedOff, already, skipped }`. Audit `update` `tna.improvement_handoff` `{ employeeIds, objectIds, count }`, hanya bila ada yang diteruskan.
   - Teks di web: "N temuan diteruskan ke Improvement Needs" (bukan "tindakan dibuat"), karena tindakan dibuat oleh modul B9.

### Perubahan pada endpoint yang ada

- `POST /api/tna/findings/:id/plan`: temuan dikunci dan diperiksa ulang dalam satu transaksi (`UPDATE ... SET status = 'planned' WHERE ... category = 'training' AND status = 'open' AND review_status IN ('approved','edited')`). Gagal (klasifikasi berubah sejak dibaca, atau rencana sudah dibuat) → `409 ALREADY_ACTIONED`.
- `PATCH /api/tna/plan-items/:id`: mengganti course rencana yang `assignment_status`-nya `sending`/`sent` → `409 ALREADY_ASSIGNED`.

### Kontrak untuk B9 (Improvement Needs, thread T6)

B7 tidak membuat tabel tindakan perbaikan. B9 membaca temuan yang diteruskan lewat `stores.tna.listImprovementHandoffs(tenantId, { since? })` → `[{ findingId, projectId, title, metricName, handedOffAt, handedOffBy }]`, lalu membuat tindakan dengan kategori, pemilik, dan tenggat di modulnya sendiri.

- Kontrak sengaja **tidak** memuat `userId`, nama karyawan, maupun `detail` temuan: brief B9 menyatakan temuan yang menyangkut individu tidak ditampilkan, dan daftar Improvement Needs PM-6 memang ringkas. Bila B9 butuh data individu, itu mengubah batas privasi dan diputuskan user.
- `since` dibandingkan dengan `>=`; baris yang dicatat dalam transaksi yang commit belakangan bisa punya waktu lebih awal, jadi B9 menyaring duplikat per `findingId` dan membaca ulang dengan jeda.
- `[⚠️ BELUM TERVERIFIKASI]` T6 belum mengonfirmasi kontrak ini (sudah dikirim lewat koordinator). Bila T6 memilih bentuk lain, butir 6 disesuaikan.

### Port penugasan EliteMentor

`apps/api/src/integrations/elitementor/assignments.js`: `createAssignmentService({ client, timeoutMs = 10000 })` → `{ assign({ organizationId, employee: { employeeId, email }, course: { ref, title }, planItemId }) -> { ref } }`. Memanggil `client.request('POST', '/api/ewi/assignments', { organizationId, body, headers: { 'Idempotency-Key' }, signal })` dengan `body` seperti di butir 4.

- `[⚠️ BELUM TERVERIFIKASI]` kontrak FR-EM belum disepakati dengan tim EliteMentor (path, payload, dan dukungan `Idempotency-Key` sementara). Karena itu `createApp` hanya memasang adapter bila `config.elitementor.assignmentsEnabled` benar (env `ELITEMENTOR_ASSIGNMENTS_ENABLED=true`, default mati), sehingga produksi menjawab `ASSIGN_UNAVAILABLE` sampai kontrak final. Test memakai adapter tiruan lewat `createApp({ assignments })`.
- Kolom lama `elitementor_program_id` tidak dipakai: penugasan merujuk course katalog (`catalog_source` + `catalog_item_ref`), sama dengan rencana PR #13.
- Mockup menyebut "masuk lewat SSO"; SSO ke EliteMentor ada di balik flag `em.sso` dan di luar paket ini.

## Aturan bisnis yang dirujuk

- PD-14 default ★A (belum dijawab `[⚠️ BELUM TERVERIFIKASI]`) dan PM-5 A (dijawab): hasil AI draf sampai direview HR (PR #16).
- PM-3 A: HR klien me-review, target 2 hari kerja.
- PO-6 A (dijawab Pak Eji 18 Nov, Sheet Ronde 4): tanpa transkrip untuk HR. Respons paket ini tidak pernah memuat giliran percakapan.
- K4 (default brief): EliteMentor lewat API + webhook; bila klien tidak memakai EliteMentor, ekspor gap ke LMS.
- K-3 / PM-8 C: status rencana `requested | new | in_progress | completed | rejected`.
- RG-4 diganti "ya revisi" 19 Nov: INA masuk 2 Des, tetap di balik flag `module.ina`.

## Alternatif yang dipertimbangkan

| Alternatif | Keputusan | Alasan |
| --- | --- | --- |
| Status review baru `held` untuk "Perlu ditinjau HR" | Ditolak; kolom `review_hold_*` | Status `draft` sudah menjadi pengaman PR #16 (draf tidak tampil di luar antrean); status baru harus diajarkan ke semua query pembaca |
| Ekspor CSV menandai baris yang sudah diekspor | Ditolak untuk POC | Ekspor tetap hanya membaca, jadi aman diulang; LMS klien yang menyaring |
| Outbox + worker untuk penugasan EliteMentor | Ditolak untuk POC | Kontrak FR-EM belum final dan adapter mati di produksi; klaim bersyarat cukup mencegah kiriman ganda |
| Tabel tindakan perbaikan di B7 | Ditolak | Tindakan, pemilik, dan tenggat milik B9; B7 hanya menandai serah terima |
| Menegakkan "persetujuan ditarik" di tiap endpoint pembaca | Menunggu keputusan user | Lihat Risiko; bentuk penegakan bergantung pada jawaban kartu keputusan B8 |

## Risiko dan mitigasi

| Risiko | Mitigasi | Status |
| --- | --- | --- |
| Temuan yang sudah disetujui dari sesi yang persetujuannya ditarik tetap diproses (rencana, ekspor, penugasan, serah terima) | Dibekukan: rencana/penugasan `409 CONSENT_WITHDRAWN`, solusi dan ekspor disaring, serah ke INA `skipped` | Dibangun (keputusan user 19 Nov) |
| Rencana ganda karena klik ulang | `planFromFinding` mensyaratkan `status = 'open'` | Dibangun |
| Laporan "terkirim" palsu dari permintaan yang macet | Penutupan klaim per pemilik; `409` + audit `superseded` | Dibangun |
| Penugasan tergantung kontrak FR-EM yang belum final | Adapter hanya dipasang bila `ELITEMENTOR_ASSIGNMENTS_ENABLED=true`; tenant pilot memakai ekspor | `[⚠️ BELUM TERVERIFIKASI]` |
| Tanpa kalender libur nasional di target 2 hari kerja | Dicatat | `[⏳ DITERIMA]` |
| Audit klasifikasi ditulis setelah perubahan tersimpan (pola PR #16) | Dicatat | `[⏳ DITERIMA]` |
| `down` migrasi menghapus data tahan, serah terima, dan penugasan | Hanya untuk rollback dev/CI | `[⏳ DITERIMA]` |
| `lms.elitementorOrganizationId` belum punya penulis di UI | Diisi lewat skrip onboarding tenant (PK-13) atau Admin ETA | `[⚠️ BELUM TERVERIFIKASI]` layar Admin Tenant B11 |

## Test

`apps/api/tests/unit/review-sla.test.js`: `addWorkingDays` (lima contoh di butir 1), `suggestedClassification`, `csvCell` (awalan `'`), validasi setting, `deliveryFor`. `apps/api/tests/unit/elitementor.test.js`: payload, header idempotensi, dan `signal` adapter penugasan.

`apps/api/tests/integration/tinjauan-hr.test.js` (Postgres):

1. Klasifikasi: flag mati → 403; training tanpa ubah → `approved`; ubah ke improvement → `edited` + `original_category`; `needs_review` → tetap draf, `held`, tidak tampil di `/findings`, lalu bisa diklasifikasi; klasifikasi ulang sebelum ada rencana → berpindah kategori; setelah ada rencana atau handoff → `ALREADY_ACTIONED`; temuan ditolak → 409; dua HR bersamaan; atasan dan karyawan → 403; tenant lain → 404; audit tercatat.
2. Target 2 hari kerja: `reviewDueAt` dari `ended_at` sesi, `overdue`, `counts.overdue`, `counts.held`.
3. Solusi: rekomendasi dari katalog, `null` bila tanpa kompetensi; `planItem` terisi setelah rencana dibuat; respons tidak memuat transkrip.
4. Penugasan: tiap baris tabel keputusan; rencana kedua untuk temuan yang sama → `ALREADY_ACTIONED`; sukses dengan adapter tiruan; dua permintaan paralel → adapter dipanggil sekali; gagal → 502 + `failed`, coba lagi sukses; `sent` lalu `lms_export` tetap 200; PATCH course terkunci; `sending` basi bisa diklaim ulang; permintaan yang klaimnya diambil alih → 409 dan audit `superseded`, baik saat EliteMentor sukses maupun gagal.
5. Ekspor CSV: kolom, hanya tenant sendiri, awalan `'`, tanpa baris ganda, tidak mengubah data, audit `export`, `projectId` tidak valid → 400.
6. Serah ke Improvement Needs: `INA_DISABLED`; sukses; `already`; `skipped`; terkunci dari klasifikasi ulang; `listImprovementHandoffs` tanpa data individu.
7. Pembekuan setelah tarik persetujuan: klasifikasi ulang, rencana, penugasan → `409 CONSENT_WITHDRAWN`; solusi, ekspor, `listImprovementHandoffs` tanpa temuan itu; serah → `skipped`; data dan status rencana tetap.
8. Migrasi naik-turun-naik dijalankan CI (`.github/workflows/ci.yml`).

## Daftar perubahan file

- [x] `docs/designs/b7-tinjauan-hr.md`, laporan `docs/designs/egm/b7/`
- [x] `apps/api/migrations/20261119000700-tinjauan-hr.js`
- [x] `apps/api/src/core/flags/index.js` (flag `tna.review_workspace`)
- [x] `apps/api/src/core/settings/index.js` (default dan validasi `tna.reviewTargetDays`, `lms.delivery`, `lms.lmsName`, `lms.elitementorOrganizationId`)
- [x] `apps/api/src/modules/tna/review-sla.js` (baru: hari kerja, saran klasifikasi)
- [x] `apps/api/src/modules/tna/review-workspace.js` (baru: router butir 2–6)
- [x] `apps/api/src/modules/tna/index.js` (butir 1, pasang router, `409 ALREADY_ACTIONED` di plan, `409 ALREADY_ASSIGNED` di PATCH)
- [x] `apps/api/src/db/lna-stores.js` (`holdFinding`, `reclassifyFinding`, kolom review + `REVIEW_ENC`, `listReviewedForSolutions`, `getPlanForAssignment`, `claimPlanAssignment`, `finishPlanAssignment`, `listPlanExport`, `handoffImprovement`, `listImprovementHandoffs`, `planFromFinding` dalam transaksi, `updatePlanItem` dengan `lockCourse`, kolom penugasan di `PLAN_COLS`)
- [x] `apps/api/src/integrations/elitementor/assignments.js` (baru)
- [x] `apps/api/src/modules/tna/csv.js` (baru: sel CSV)
- [x] `apps/api/src/integrations/elitementor/client.js` (`headers` dan `signal` opsional)
- [x] `apps/api/src/app.js` (pasang `assignments`)
- [x] `.env.example`
- [x] `apps/api/src/config/env.js` (`ELITEMENTOR_ASSIGNMENTS_ENABLED`)
- [x] `apps/api/tests/unit/review-sla.test.js`, `apps/api/tests/unit/elitementor.test.js`, `apps/api/tests/integration/tinjauan-hr.test.js`
- [x] `apps/web/src/api/lna.ts` (tipe dan pemanggil baru)
- [ ] `apps/web/src/screens/b7-tinjauan/` (rute `review`), hapus `screens/legacy-review`, e2e

Catatan triase awal dipindahkan ke `docs/designs/egm/b7/triase-awal.md`; hasil egm-resolve di `docs/designs/egm/b7/goldfish_review_report.md`.
