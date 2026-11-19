# B9 · Improvement Needs

Status: spek sesuai kode backend (review spek egm sudah ditriase, lihat bagian 11). Bagian web menunggu B0. Paket T6 pada brief bangun penuh 19 Nov 2026.

## 1. Tujuan

HR mengelola **tindakan perbaikan** untuk masalah non-pelatihan (SOP, alat, sistem, budaya) yang ditemukan lewat Training Needs, supaya masalah itu tidak berakhir sebagai pelatihan yang tidak menyelesaikan apa pun. Tiap tindakan punya pemilik dan tenggat, dan statusnya bisa diperiksa lewat wawancara singkat AI ke pemiliknya, dengan ringkasan untuk HR.

Yang **bukan** tujuan paket ini:

- menghasilkan temuan non-pelatihan (itu wawancara akar masalah, B6) dan memilah temuan menjadi Training/Improvement (itu tinjauan HR, B7). B7 memanggil endpoint "buat tindakan" paket ini;
- laporan PDF agregat untuk manajemen (BI-2) dan kanal whistleblowing (BI-6, BI-16): tidak ada di mockup final dan tidak ada di brief paket; dicatat sebagai lanjutan;
- wawancara suara.

## 2. Layar mockup yang dicakup

Mockup Pak Eji, menu Learning Needs Analysis › Improvement Needs (`project/Main.dc.html`, blok `INA`):

| Bagian di mockup | Yang dibangun |
| --- | --- |
| Kartu "Agen AI · Verifikasi tindakan perbaikan" (chip Pilot) + tombol "Buka wawancara AI" | Daftar verifikasi dan penugasannya; hanya tampil bila flag `ina.ai_verification` menyala |
| Empat kartu KPI: TINDAKAN (total), SELESAI, SOP / ALAT / SISTEM, BUDAYA | Sama, dihitung dari data yang boleh dilihat pemanggil |
| Tabel "Tindakan perbaikan": Temuan, Kategori, Pemilik, Jabatan pemilik, Asal gap, Tenggat, Status (chip yang bisa diklik) | Sama. Status diubah lewat pilihan, bukan toggle dua nilai |
| Catatan "Akses: HR dan atasan langsung dapat melihat tindakan… Temuan yang menyangkut individu tidak ditampilkan di sini; hanya masalah proses dan sistem." | Teks disesuaikan dengan K1: atasan hanya bila diberi akses HR. Panel "Akses atasan" untuk HR (tidak ada di mockup, diminta brief) |

Data demo ("Karyawan A", "Engineer Service Delivery", kode ST-A2) tidak dibawa.

## 3. Aturan dan keputusan yang dirujuk

- CLAUDE.md aturan arsitektur 1–7.
- **K1** (default brief, = PM-6): HR melihat secara bawaan; atasan langsung hanya bila HR memberi akses per atasan, bisa dicabut, tercatat audit.
- **PM-6** sudah dibangun di PR #12 (`claude/project-thread-7o13op`): tabel `lna_non_training_grants` dan store `tna.hasNonTrainingGrant / grantNonTraining / revokeNonTraining / nonTrainingGrants`. Paket ini **memakai izin yang sama**, bukan tabel baru: satu izin atasan berlaku untuk temuan non-pelatihan (TNA) dan tindakan perbaikannya (INA). PR #12 sudah ada di basis integrasi `claude/project-thread-scbrmb`.
- **BI-1**: empat kategori BRD + "Lainnya" dengan sub-label. Empat kategori memakai istilah mockup: SOP, Alat, Sistem, Budaya.
- **BI-4 + K-3**: pelacakan ringan (pemilik, tenggat, status). Status: Baru → Berjalan → Selesai / Ditolak. Status "Diminta" dari K-3 tidak dipakai di sini karena karyawan tidak mengajukan tindakan perbaikan (PM-8: permintaan dari karyawan ditahan).
- **K-2** (12 Nov): Pimpinan punya akses baca ke dashboard INA. K1 (lebih baru) membatasi baris tindakan ke HR dan atasan yang diberi akses, jadi Pimpinan hanya menerima **angka ringkasan** (KPI), tanpa baris. `[⚠️ BELUM TERVERIFIKASI]` K2 di brief menyebut lima peran tanpa Pimpinan; bila user memutuskan Pimpinan tidak melihat apa pun, satu baris di `access.js`.
- **PO-6**: transkrip hanya untuk orang yang diwawancarai. HR hanya melihat ringkasan.
- **R2-2**: baca data individu dan semua perubahan dicatat audit; gagal catat berarti request gagal.
- **R2-3**: teks yang berasal dari wawancara dienkripsi per tenant.
- **RG-4 / "ya revisi" 19 Nov**: INA masuk 2 Des, tetap di balik flag.

## 4. Akses

### 4.1 Gerbang

1. `requireSubmodule('ina')`: entitlement `ina` (atau `full_suite`) + flag `module.ina`. Sudah terpasang di `app.js` untuk semua rute `/api/ina`.
2. Flag `ina.dashboard` (sudah ada, default mati): semua rute tindakan dan akses atasan.
3. Flag baru `ina.ai_verification` (default mati): semua rute verifikasi AI. Butuh `ina.dashboard` juga.

### 4.2 Siapa melihat apa

Fungsi `inaAccess(req)` di `src/modules/ina/access.js` mengembalikan `{ level, scope }`:

| Peran aktif | level | Yang terlihat |
| --- | --- | --- |
| `hr_admin`, `eta_admin` | `manage` | Semua tindakan tenant; boleh buat, ubah, tugaskan verifikasi, kelola akses atasan |
| `pimpinan` | `summary` | Hanya `kpis` seluruh tenant; `data` selalu kosong; tidak ada rute satuan |
| `supervisor` **dengan izin aktif** | `read` | Tindakan yang pemiliknya ada di `visibleEmployeeScope()` atasan itu (dirinya dan bawahan langsung). Tindakan tanpa pemilik tidak terlihat |
| `supervisor` tanpa izin | – | 403 `NO_INA_ACCESS` |
| peran lain (termasuk `tenant_admin`) | – | 403 `ROLE_FORBIDDEN` |

Level `read` tidak menerima `findingId`, `competencyId`, `performanceRecordId`, `involvesIndividual`, dan `lastVerification.reportedStatus` (apa yang dilaporkan pemilik ke HR bukan untuk atasan).

Pemilik tindakan (peran apa pun, termasuk `learner`) hanya menjangkau rute verifikasi miliknya (bagian 6.3). Ia tidak membuka dashboard.

Cakupan atasan memakai `scopeFor(req, stores.people)` → `visibleEmployeeScope()` (aturan 4), diterapkan di SQL pada `owner_user_id`. Catatan: daftar temuan non-pelatihan TNA (PR #12) hanya menampilkan bawahan, tidak dirinya; di sini atasan juga melihat tindakan yang ia miliki sendiri, karena ia yang harus mengerjakannya.

### 4.3 Temuan yang menyangkut individu

Kolom `involves_individual` (boolean, default `false`). Tindakan bertanda `true` tidak dikirim oleh `GET /ina/actions` bawaan untuk peran apa pun, dan tidak ikut KPI. HR mendapat hitungan `meta.hiddenIndividual`, dan hanya HR yang bisa membukanya lewat `GET /ina/actions?hidden=1` atau `GET /ina/actions/:id` agar bisa dikoreksi. Atasan dan pimpinan tidak mendapat hitungan itu; untuk atasan rute satuan menjawab 404, untuk pimpinan 403 (ia tidak punya rute satuan sama sekali). KPI selalu dihitung dari daftar utama, juga saat `hidden=1`. Tindakan bertanda individu tidak bisa diverifikasi lewat AI, dan menandainya membatalkan verifikasi yang masih terbuka.

Saat tindakan dibuat **dari temuan** (`findingId`), `involvesIndividual` wajib dikirim eksplisit (`true`/`false`): temuan wawancara selalu berasal dari satu karyawan, jadi HR harus memutuskan dengan sadar. Judul tindakan selalu ditulis HR; judul temuan tidak diwarisi, supaya kalimat dari wawancara tidak ikut tampil ke atasan.

`[⚠️ BELUM TERVERIFIKASI]` Siapa yang memutuskan sebuah temuan "menyangkut individu" belum pernah diputuskan. Paket ini memakai penilaian HR (tanda manual). Deteksi otomatis oleh AI bisa mengisi kolom yang sama nanti.

## 5. Data dan migrasi

Migrasi `20261119000900-ina-actions.js` (blok 09), raw SQL, punya `down` yang menghapus ketiga tabel. Dibanding draf di bawah, migrasi final menambah: CHECK `sub_label IS NULL OR category = 'lainnya'`, kolom `ina_verifications.due_date`, dan status verifikasi `withdrawn`. `ina_verification_turns` tidak punya `tenant_id`; setiap query-nya di-join ke `ina_verifications` dengan `tenant_id`. `ina_verifications.owner_user_id` memakai `ON DELETE CASCADE`: menghapus karyawan (PK-15) ikut menghapus percakapannya.

```sql
CREATE TABLE ina_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  finding_id uuid REFERENCES lna_findings(id) ON DELETE SET NULL,
  title text NOT NULL,                 -- terenkripsi (R2-3)
  detail text,                         -- terenkripsi
  category varchar(16) NOT NULL CHECK (category IN ('sop','alat','sistem','budaya','lainnya')),
  sub_label varchar(64),               -- hanya untuk 'lainnya' (BI-1)
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  source_ref varchar(255),             -- "Asal gap", mis. kode kompetensi atau nama key result
  competency_id uuid REFERENCES lna_competencies(id) ON DELETE SET NULL,
  performance_record_id uuid REFERENCES lna_performance_records(id) ON DELETE SET NULL,
  due_date date,
  status varchar(16) NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','done','rejected')),
  involves_individual boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX ina_actions_tenant_idx ON ina_actions (tenant_id, status);
CREATE INDEX ina_actions_owner_idx ON ina_actions (tenant_id, owner_user_id);
-- satu tindakan per temuan, supaya "buat tindakan" dari tinjauan HR aman diulang
CREATE UNIQUE INDEX ina_actions_finding_idx ON ina_actions (tenant_id, finding_id) WHERE finding_id IS NOT NULL;

CREATE TABLE ina_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  action_id uuid NOT NULL REFERENCES ina_actions(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status varchar(16) NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','in_progress','completed','cancelled')),
  consent_at timestamptz,
  consent_version varchar(32),
  started_at timestamptz,
  ended_at timestamptz,
  reported_status varchar(16) CHECK (reported_status IN ('in_progress','done','blocked')),
  summary text,                        -- terenkripsi; ringkasan untuk HR
  ai_provider varchar(32),
  assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ina_verifications_tenant_idx ON ina_verifications (tenant_id, action_id);
CREATE INDEX ina_verifications_owner_idx ON ina_verifications (tenant_id, owner_user_id, status);
-- satu verifikasi terbuka per tindakan
CREATE UNIQUE INDEX ina_verifications_open_idx ON ina_verifications (action_id) WHERE status IN ('assigned','in_progress');

CREATE TABLE ina_verification_turns (
  id bigserial PRIMARY KEY,
  verification_id uuid NOT NULL REFERENCES ina_verifications(id) ON DELETE CASCADE,
  speaker varchar(8) NOT NULL CHECK (speaker IN ('ai','human')),
  text text NOT NULL,                  -- terenkripsi
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ina_verification_turns_idx ON ina_verification_turns (verification_id, id);
```

Mengapa tabel sendiri dan bukan `lna_interview_sessions` (yang CHECK-nya sudah mengizinkan `ina`): sesi wawancara itu mewajibkan `project_id`, analisisnya khusus DNA/TNA, dan sedang dirombak paket B6 (stepper, versi persetujuan). Verifikasi adalah percakapan pendek yang terikat ke satu tindakan, jadi dipisah agar tidak saling mengunci dengan B6.

"Jabatan pemilik" di tabel = `lna_job_roles.name` dari `users.job_role_id` pemilik (join), tidak disimpan ulang.

Kolom terenkripsi memakai `cipher` yang sama dengan `lna-stores.js`. Store baru di `src/db/ina-stores.js`, dipasang di `stores.js` sebagai `stores.ina`.

## 6. Endpoint

Semua di bawah `/api/ina` (sudah lewat `auth`, `tenantContext()`, `requireSubmodule('ina')`).

### 6.1 Tindakan perbaikan (flag `ina.dashboard`)

| Method + path | Siapa | Body | Jawaban |
| --- | --- | --- | --- |
| `GET /actions` | manage, read, summary | query `status?`, `category?`, `hidden=1` (manage) | `{ data: [action], kpis, meta: { level, hiddenIndividual? } }`; untuk summary `data = []` |
| `GET /actions/:id` | manage; read bila terlihat | – | `{ data: action }` (dengan `detail`); tidak terlihat → 404 |
| `POST /actions` | manage | `{ title, category, subLabel?, detail?, ownerUserId?, findingId?, competencyId?, performanceRecordId?, sourceRef?, dueDate?, involvesIndividual? }` | 201 `{ data: action }` |
| `PATCH /actions/:id` | manage | subset body di atas (tanpa `findingId`) + `status` | `{ data: action }` |

`action` = `{ id, title, category, subLabel, ownerUserId, ownerName, ownerJobRoleName, sourceRef, dueDate, status, overdue, lastVerification: { id, status, endedAt, reportedStatus* } | null, createdAt, updatedAt, findingId*, competencyId*, performanceRecordId*, involvesIndividual* }` (bertanda * hanya untuk manage). Daftar tidak membawa `detail`. `lastVerification` mengabaikan verifikasi yang dibatalkan atau ditarik.

`kpis` = `{ total, done, process, culture, overdue }`; `process` = kategori `sop`, `alat`, `sistem`; `culture` = `budaya`; `lainnya` hanya masuk `total`. `overdue` = tenggat sudah lewat (tanggal server, UTC) dan status `new`/`in_progress`. KPI dihitung dari himpunan yang boleh dilihat pemanggil sebelum filter query, jadi atasan hanya menghitung miliknya.

Aturan:

- `title` wajib, 3–255 karakter. `category` salah satu dari lima. `subLabel` hanya boleh bila `category = lainnya`; pindah kategori dari `lainnya` mengosongkannya.
- `ownerUserId` (akun tidak nonaktif), `findingId`, `competencyId`, `performanceRecordId` dicari ulang dalam tenant; tidak ketemu atau bukan UUID → 400 dengan nama field-nya.
- `findingId` harus temuan `non_training` yang sudah ditinjau HR (`review_status` `approved`/`edited`, PK-14). Temuan yang sudah punya tindakan → 409 `DUPLICATE` (indeks unik menangkap balapan dua request). `competencyId`/`performanceRecordId` diwarisi dari temuan bila tidak dikirim. Status temuan: dibuat → `planned`; tindakan `done` → `resolved`; keluar dari `done` → `planned`.
- `sourceRef` kosong + `competencyId`/`performanceRecordId` ada → diisi dari nama kompetensi / nama metrik.
- `dueDate` format `YYYY-MM-DD`. Tenggat di masa lalu diterima (HR mencatat tindakan yang sudah berjalan).
- Transisi status: `new → in_progress | done | rejected`, `in_progress → done | rejected | new`, `done → in_progress`, `rejected → new`. Selain itu 409 `INVALID_TRANSITION` (kode yang sama dengan PR #12). Masuk `done` mengisi `completed_at`; keluar mengosongkannya.
- Mengganti pemilik, menutup tindakan (`done`/`rejected`), atau menandai individu membatalkan verifikasi yang masih terbuka.
- Field yang nilainya sama diabaikan (tanpa audit). Body tanpa field dikenal → 400.
- Audit: `create`/`update` resource `ina.action` dengan `objectIds: [id]`, nama kolom yang berubah (tanpa isi `title`/`detail`), `status {from,to}`, `owner {from,to}`, dan `employeeIds` pemilik.
- `GET /actions` (bukan summary) dan `GET /actions/:id` mencatat `audit.readIndividual` karena memuat nama pemilik.
- Urutan tulis: simpan, lalu efek samping (temuan, verifikasi), lalu audit, tanpa transaksi bersama (pola repo).

### 6.2 Akses atasan

| Method + path | Jawaban |
| --- | --- |
| `GET /access/me` (semua peran, **di luar** flag `ina.dashboard`) | `{ data: { level: 'manage' \| 'read' \| 'summary' \| null, pendingVerifications } }`. Flag dashboard mati → `level: null`, bukan galat. `pendingVerifications` = verifikasi terbuka milik pemanggil (0 bila flag verifikasi mati) |
| `GET /access` (manage) | `{ data: [{ supervisorId, name, email, granted, grantedAt, grantedByName }] }`: semua akun `supervisor` tenant dengan status izinnya |
| `PUT /access/:supervisorId` (manage) | `{ data: { supervisorId, granted: true, changed } }` |
| `DELETE /access/:supervisorId` (manage) | `{ data: { supervisorId, granted: false, changed } }` |

Memakai store PM-6 dari PR #12. `:supervisorId` harus akun `supervisor` tenant (selain itu 404). Audit `create`/`delete` resource `ina.supervisor_access` hanya bila `changed`. Karena izinnya sama dengan `tna.non_training_access`, mengubah di satu layar mengubah keduanya; ini disengaja dan ditulis di teks panel: "Akses ini juga berlaku untuk daftar temuan di luar pelatihan."

### 6.3 Verifikasi AI (flag `ina.dashboard` + `ina.ai_verification`)

| Method + path | Siapa | Jawaban |
| --- | --- | --- |
| `POST /actions/:id/verifications` | manage | Body `{ dueDate? }`. 201 `{ data: verification }`. Tindakan harus punya pemilik yang akunnya aktif (400 `NO_OWNER`), tidak bertanda individu dan berstatus `new`/`in_progress` (409 `INVALID_STATE`), dan belum punya verifikasi terbuka (409 `DUPLICATE`) |
| `GET /verifications` | manage | `{ data: [verification] }` semua, dengan `summary` dan `reportedStatus`, **tanpa** transkrip |
| `GET /verifications/mine` | siapa pun | Verifikasi milik pemanggil (yang dibatalkan HR tidak ditampilkan) |
| `GET /verifications/:id` | pemilik: dengan `turns`; manage: tanpa `turns` | Orang lain 404 |
| `POST /verifications/:id/consent` | pemilik | Body `{ consentVersion }` wajib. `assigned → in_progress`, jawab `{ ..., question, done: false }` |
| `POST /verifications/:id/turns` | pemilik | Body `{ text }` (1–4.000 karakter). Jawab `{ question, done: false }`; jawaban ketiga menutup percakapan otomatis dan menjawab verifikasi + `done: true` |
| `POST /verifications/:id/complete` | pemilik | Mengakhiri lebih awal; butuh minimal satu jawaban |
| `POST /verifications/:id/withdraw` | pemilik | Menarik diri: `assigned`/`in_progress → withdrawn`, semua giliran dihapus |
| `POST /verifications/:id/cancel` | manage | `assigned`/`in_progress → cancelled` |

`verification` = `{ id, actionId, actionTitle, actionDueDate, ownerUserId, ownerName, status, dueDate, assignedAt, startedAt, endedAt, reportedStatus, summary, aiProvider }`. Rute percakapan pada status yang salah → 409 `INVALID_STATE` (termasuk giliran setelah selesai). HR dan orang lain mendapat 404 di rute percakapan.

Alur percakapan (maksimal 3 pertanyaan): (1) status tindakan sekarang, (2) hambatan, (3) bantuan yang dibutuhkan dan perkiraan selesai.

Port AI: `src/modules/ina/verification-ai.js` mengekspor `createVerificationAi(ai)`. Kontrak provider, keduanya async: `nextVerificationQuestion({ action: { title, category, dueDate }, askedCount, turns }) -> string` dan `summarizeVerification({ action, turns }) -> { summary, reportedStatus }`. Bila provider punya kedua method, itu yang dipakai; bila tidak ada, gagal, atau hasilnya tidak sah, dipakai implementasi deterministik bawaan. **Ringkasan bawaan tidak memuat teks jawaban** (PO-6): hanya kalimat tetap menurut `reportedStatus` dan jumlah pertanyaan yang dijawab. `reportedStatus` bawaan dari kata kunci: jawaban pertama "selesai/beres/rampung/tuntas" tanpa negasi → `done`; "terhambat/terkendala/tertunda/belum bisa/…" di jawaban mana pun → `blocked`; selain itu `in_progress`. `src/ai/index.js` **tidak diubah**. `[⏳ DITERIMA]` Sampai provider Bedrock diberi dua method itu, ringkasan bukan buatan LLM; chip "Pilot" di layar tetap, dan jawaban API membawa `aiProvider` ("bawaan" atau nama provider). Saat provider LLM dipasang, prompt ringkasannya wajib dilarang mengutip jawaban; itu diuji di QA malam (B18). Pemantauan mutu AI (BI-21) di luar paket ini (B12/B18).

Hasil verifikasi **tidak** mengubah status tindakan secara otomatis. HR membaca ringkasan lalu mengubah status sendiri (keputusan tetap di manusia, sejalan dengan PK-14).

Privasi: `turns` hanya dikirim ke pemilik (PO-6). Ringkasan untuk HR dicatat `audit.readIndividual(req, 'ina.verification_summary', …)`. Pemilik yang membaca transkripnya sendiri dicatat `ina.verification_transcript` (`self: true`). Atasan dan pimpinan tidak punya rute ke verifikasi; atasan hanya melihat `lastVerification.status` di daftar tindakan. Audit `ina.verification` mencatat `create` dan peristiwa `consent`, `completed`, `withdrawn`, `cancelled`, tanpa isi percakapan.

Persetujuan: tanpa `consentVersion` → 400. Nilainya disimpan apa adanya (versi teks persetujuan dikelola web, mengikuti pola PK-15).

Kode galat paket ini: 400 `BAD_REQUEST` / `NO_OWNER`, 403 `NOT_ENTITLED` / `FEATURE_DISABLED` / `ROLE_FORBIDDEN` / `NO_INA_ACCESS`, 404 `NOT_FOUND`, 409 `DUPLICATE` / `INVALID_TRANSITION` / `INVALID_STATE`.

Hubungan dengan B7 (T5): tinjauan HR menandai temuan untuk Improvement (`improvement_handoff_at`) dan menyediakan `stores.tna.listImprovementHandoffs`. Saat spek ini ditulis fungsi itu belum ada di basis integrasi, jadi paket ini tidak memanggilnya. Titik temunya `POST /ina/actions` dengan `findingId`; daftar "temuan yang menunggu tindakan" di layar ditambahkan setelah B7 masuk.

## 7. Perubahan web

Dibangun di atas kontrak B0 (PR #18). Layar di `apps/web/src/screens/b9-ina/`:

- `ImprovementNeedsView.vue`: KPI, tabel tindakan, formulir tambah/ubah, panel akses atasan, daftar verifikasi. Detail tindakan dimuat terpisah; selama belum termuat, kolom detail dikunci dan tidak dikirim saat menyimpan, supaya detail lama tidak terhapus (hasil code review).
- `ActionVerificationView.vue`: persetujuan → percakapan → selesai, untuk pemilik tindakan.
- `ShellExtra.vue`: pengingat verifikasi yang menunggu, dipasang otomatis oleh shell B0.

Rute di `routes.ts`: `ina` di `/ina` (meta `submodule: 'ina'`, `flag: 'ina.dashboard'`, `views: ['hr', 'atasan', 'super']`), `ina-verifikasi` di `/ina/verifikasi/:id?` (flag `ina.ai_verification`), dan `ina-lama` yang mengarahkan alamat lama `/m/ina` ke `/ina`. Layar lama `screens/legacy-ina` dihapus. Pemilih pemilik memakai `GET /ina/owners`. Menu memakai `routeOpen()` dari B0. API klien `apps/web/src/api/ina.ts`. E2E `apps/web/e2e/improvement-needs.spec.ts` (5 test) dengan API mock.

## 8. Test yang ditulis (test-first)

`apps/api/tests/unit/ina-domain.test.js`: transisi status; hitung KPI; `overdue`; kata kunci `reportedStatus`; batas tiga pertanyaan.

`apps/api/tests/integration/ina.test.js` (Postgres):

- gerbang: tanpa entitlement 403 `NOT_ENTITLED`; `module.ina` mati 403; `ina.dashboard` mati 403; `ina.ai_verification` mati → rute verifikasi 403, rute tindakan tetap jalan;
- HR membuat, mengubah, dan melihat tindakan; validasi kategori, sub-label, tenggat, transisi;
- membuat dari temuan: hanya `non_training`; temuan jadi `planned`; kedua kali 409;
- K1: atasan tanpa izin 403; setelah HR memberi izin hanya melihat tindakan milik dirinya dan bawahan langsung; setelah dicabut 403 lagi; grant dan revoke tercatat audit; izin yang sama terbaca oleh `stores.tna.hasNonTrainingGrant`;
- pimpinan baca saja (POST/PATCH 403); karyawan 403;
- `involves_individual`: tidak muncul di daftar dan KPI siapa pun; HR mendapat `hiddenIndividual`, atasan tidak;
- isolasi tenant: HR tenant B tidak melihat/mengubah tindakan tenant A; `ownerUserId`/`findingId` tenant lain ditolak;
- enkripsi: `title`, `detail`, `summary`, teks giliran tidak tersimpan sebagai teks polos di DB;
- verifikasi: tugaskan → pemilik setuju (wajib `consentVersion`) → tiga giliran → selesai → HR melihat ringkasan tanpa `turns`; orang lain 404; HR tidak bisa menjawab; verifikasi terbuka kedua 409; status tindakan tidak berubah otomatis;
- migrasi naik-turun-naik.

## 9. Checklist perubahan file

- [x] `docs/designs/b9-improvement-needs.md` (spek ini)
- [x] gabung basis integrasi (memuat PR #12)
- [x] `apps/api/migrations/20261119000900-ina-actions.js`
- [x] `apps/api/src/core/flags/index.js`: flag `ina.ai_verification`
- [x] `apps/api/src/db/ina-stores.js`, dipasang di `apps/api/src/db/stores.js`
- [x] `apps/api/src/modules/ina/index.js` (router), `access.js`, `domain.js` (status, KPI), `verification-ai.js`
- [x] `apps/api/tests/unit/ina-domain.test.js`
- [x] `apps/api/tests/integration/ina.test.js`
- [x] `apps/web/src/screens/b9-ina/*` (layar, `ShellExtra.vue`, `routes.ts`), `apps/web/src/api/ina.ts`, `apps/web/e2e/improvement-needs.spec.ts`; `screens/legacy-ina` dihapus
- [ ] Baris alur "Akses atasan ke perbaikan" (B18 tabel 3.3) dengan `apps/api/tests/alur/driver.js`: menunggu driver rilis 20 Nov. Sementara alur yang sama diuji di `tests/integration/ina.test.js` (test K1)

## 10. Asumsi dan risiko yang tersisa

| Tanda | Isi | Ditutup oleh |
| --- | --- | --- |
| ⚠️ | Pimpinan hanya menerima angka ringkasan (K-2 dibatasi K1) | Keputusan user / B2 |
| ⚠️ | "Menyangkut individu" ditandai manual oleh HR | Keputusan produk; B7 bisa mengisi otomatis |
| ⏳ | Ringkasan verifikasi belum buatan LLM sampai provider Bedrock diberi dua method | Setelah PR #15 masuk, QA malam B18 |
| ⏳ | Izin atasan dipakai bersama dengan daftar temuan non-pelatihan TNA | Disengaja (K1 = PM-6); pisah bila user minta |
| – | Laporan PDF agregat (BI-2) dan kanal whistleblowing (BI-6/16) tidak dibangun | Paket lanjutan |

## 11. Review egm (spek)

Review oleh subagent baru tanpa riwayat percakapan, 19 Nov 2026. 12 temuan.

| # | Temuan | Keputusan |
| --- | --- | --- |
| 1 | Ringkasan bawaan (potongan jawaban) membocorkan isi percakapan ke HR, melanggar PO-6 | **Perbaiki.** Ringkasan bawaan hanya kalimat tetap; ada test |
| 2 | Izin atasan dipakai bersama TNA; cakupan atasan berbeda dengan PR #12 | **Tolak, dengan alasan.** K1 = PM-6 adalah satu keputusan untuk masalah non-pelatihan. Cakupan mengikuti aturan arsitektur 4; bedanya ditulis di 4.2 |
| 3 | Tindakan bertanda individu tidak bisa ditemukan HR; tanda bisa terlewat saat dibuat dari temuan | **Perbaiki.** `hidden=1`, tanda wajib eksplisit dari temuan, tanpa verifikasi AI |
| 4 | Verifikasi tanpa tenggat dan tanpa jalan mundur bagi pemilik | **Perbaiki.** `dueDate` dan `withdraw` (giliran dihapus). Pemantauan mutu AI di luar paket |
| 5 | K-2 Pimpinan bertabrakan dengan K1; atasan menerima terlalu banyak kolom | **Perbaiki.** Pimpinan hanya KPI; level read tanpa rujukan temuan dan status yang dilaporkan |
| 6 | `/access/me` di balik flag membuat menu galat | **Perbaiki.** Di luar flag, ditambah `pendingVerifications` |
| 7 | Kasus tepi verifikasi (pemilik berganti, giliran lebih, provider gagal) | **Perbaiki.** Batal otomatis, 409, selesai otomatis setelah jawaban ketiga, jatuh ke bawaan |
| 8 | Dari temuan: judul wawancara ikut tampil, balapan duplikat, status temuan | **Perbaiki.** Judul ditulis HR, indeks unik → 409, status temuan mengikuti |
| 9 | Kode galat tidak seragam dengan PR #12 | **Perbaiki.** `INVALID_TRANSITION`, daftar kode di 6.3 |
| 10 | Laporan PDF (BI-2) dan whistleblowing (BI-6/16) tidak dibangun | **Tunda.** Tidak ada di mockup final dan brief; tercatat di bagian 10 |
| 11 | Kontrak AI sinkron/asinkron tidak jelas | **Perbaiki.** Kontrak async ditulis di 6.3 |
| 12 | Skema: sub-label tanpa CHECK, giliran tanpa tenant | **Perbaiki sebagian.** CHECK ditambah; giliran tetap tanpa `tenant_id` dengan join wajib (ditulis di 5) |

## 12. Review egm (diff)

Review diff backend oleh subagent baru, 19 Nov 2026. Tidak ada temuan berat; 4 sedang, 5 ringan. Tenancy, flag, privasi transkrip, audit, dan enkripsi dinyatakan bersih.

| # | Temuan | Keputusan |
| --- | --- | --- |
| 1 | Giliran bisa menyusul setelah pemilik menarik diri (balapan) | **Perbaiki.** `addTurn` mengunci baris verifikasi dan memeriksa status; tarik diri dan hapus percakapan dalam satu transaksi; ada test |
| 2 | Giliran bersamaan melewati batas tiga jawaban | **Perbaiki.** Batas diperiksa di dalam transaksi yang sama; ada test |
| 3 | Dua `PATCH` status bersamaan melewati aturan transisi | **Perbaiki.** `UPDATE … WHERE status = <yang dibaca>`, selain itu 409 `INVALID_TRANSITION`; ada test |
| 4 | `hidden=1` menghitung KPI dari tindakan tersembunyi | **Perbaiki.** KPI selalu dari daftar utama |
| 5 | KPI dihitung dari daftar berbatas 2.000 baris | **Tunda.** `[⚠️ BELUM TERVERIFIKASI]` Tenant POC jauh di bawah itu; agregasi SQL dikerjakan bila ada tenant mendekati batas |
| 6 | Pimpinan mendapat 403, spek menulis 404 | **Perbaiki (dokumen).** 4.3 disesuaikan |
| 7 | Pemilik lama masih melihat judul tindakan yang sekarang | **Perbaiki.** Judul diganti teks tetap untuk pemilik lama; ada test |
| 8 | "Hampir selesai" terbaca selesai | **Perbaiki.** Kata penjaga ditambah; ada test |
| 9 | Celah test: lintas tenant di rute verifikasi, atasan sebagai pemilik, pimpinan di rute verifikasi | **Perbaiki sebagian.** Test ditambah. Test dalam satu berkas tetap berurutan (pola repo); migrasi naik-turun-naik dijalankan CI |

## 13. Code review (mattpocock-skills:code-review)

Titik tetap `origin/claude/project-thread-scbrmb`, dua sumbu paralel, mencakup B9 dan B11.

| Sumbu | Temuan | Tindak lanjut |
| --- | --- | --- |
| Spec | Simpan ubah tindakan sebelum detail termuat menghapus detail | **Perbaiki**, test e2e merah lalu hijau (commit `6f6a903`) |
| Spec | Jabatan tidak menampilkan nama berkas; ringkasan impor tidak menampilkan sumber; sumber KPI ditetapkan `berkas`; "tersambung" dan "deep link" menyesatkan | **Perbaiki** (B11, commit `f8f06c8`) |
| Spec | Butir menu tampil walau flag rute mati | **Selesai di B0** (`routeOpen()`, head T1 `4823b8e`) |
| Spec | Teks 7 dan 9 basi; `/owners`, `ShellExtra`, pengalihan `/m/ina` tidak tercatat | **Perbaiki (dokumen)**, bagian 7 dan 9 |
| Standards | Duplikasi pembantu kecil (`wrap`, pemeriksa UUID, `conflict`) antarmodul; konstanta web meniru API | **Tunda.** Pola repo yang sudah ada; dirapikan bersama setelah 2 Des (usul `/mattpocock-skills:improve-codebase-architecture`) |
| Standards | `ina_verification_turns` tanpa `tenant_id` | **Tolak.** Selalu dibaca lewat join terkunci ke `ina_verifications` yang berfilter tenant; ada test lintas tenant |
