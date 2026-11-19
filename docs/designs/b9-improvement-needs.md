# B9 · Improvement Needs

Status: draf spek, ditulis sebelum kode (prinsip egm). Paket T6 pada brief bangun penuh 19 Nov 2026.

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
- **PM-6** sudah dibangun di PR #12 (`claude/project-thread-7o13op`): tabel `lna_non_training_grants` dan store `tna.hasNonTrainingGrant / grantNonTraining / revokeNonTraining / nonTrainingGrants`. Paket ini **memakai izin yang sama**, bukan tabel baru: satu izin atasan berlaku untuk temuan non-pelatihan (TNA) dan tindakan perbaikannya (INA). Karena itu branch paket ini menggabungkan branch PR #12.
- **BI-1**: empat kategori BRD + "Lainnya" dengan sub-label. Empat kategori memakai istilah mockup: SOP, Alat, Sistem, Budaya.
- **BI-4 + K-3**: pelacakan ringan (pemilik, tenggat, status). Status: Baru → Berjalan → Selesai / Ditolak. Status "Diminta" dari K-3 tidak dipakai di sini karena karyawan tidak mengajukan tindakan perbaikan (PM-8: permintaan dari karyawan ditahan).
- **K-2** (12 Nov): Pimpinan punya akses baca ke dashboard INA. `[⚠️ BELUM TERVERIFIKASI]` K2 di brief menyebut lima peran tanpa Pimpinan, tetapi tidak mencabut K-2. Paket ini mempertahankan akses baca Pimpinan; bila user memutuskan lain, satu baris di `access.js`.
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

| Peran | level | Yang terlihat |
| --- | --- | --- |
| `hr_admin`, `eta_admin` | `manage` | Semua tindakan tenant; boleh buat, ubah, tugaskan verifikasi, kelola akses atasan |
| `pimpinan` | `read` | Semua tindakan tenant, baca saja (K-2) |
| `supervisor` **dengan izin aktif** | `read` | Tindakan yang pemiliknya ada di `visibleEmployeeScope()` atasan itu (dirinya dan bawahan langsung). Tindakan tanpa pemilik tidak terlihat |
| `supervisor` tanpa izin | – | 403 `NO_INA_ACCESS` |
| peran lain | – | 403 `ROLE_FORBIDDEN` |

Pemilik tindakan (peran apa pun, termasuk `learner`) hanya menjangkau rute verifikasi miliknya (bagian 6.3). Ia tidak membuka dashboard.

Cakupan atasan memakai `scopeFor(req, stores.people)` → `visibleEmployeeScope()` (aturan 4), diterapkan di SQL pada `owner_user_id`.

### 4.3 Temuan yang menyangkut individu

Kolom `involves_individual` (boolean, default `false`). Tindakan bertanda `true` **tidak pernah** dikirim oleh `GET /ina/actions`, untuk peran apa pun, dan tidak ikut KPI. HR mendapat hitungan `meta.hiddenIndividual` supaya tahu ada yang disembunyikan; atasan dan pimpinan tidak mendapat hitungan itu. HR menandai saat membuat atau mengubah tindakan (`PATCH` bisa membuka tanda). Tindakan tersembunyi tetap bisa diambil HR satu per satu lewat `GET /ina/actions/:id` agar bisa dikoreksi.

`[⚠️ BELUM TERVERIFIKASI]` Siapa yang memutuskan sebuah temuan "menyangkut individu" belum pernah diputuskan. Paket ini memakai penilaian HR (tanda manual). Deteksi otomatis oleh AI bisa mengisi kolom yang sama nanti.

## 5. Data dan migrasi

Migrasi `20261119000900-ina-actions.js` (blok 09), raw SQL, punya `down` yang menghapus ketiga tabel.

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
| `GET /actions` | manage, read | query `status?`, `category?` | `{ data: [action], kpis, meta: { level, hiddenIndividual? } }` |
| `GET /actions/:id` | manage; read bila terlihat | – | `{ data: action }` (dengan `detail`) |
| `POST /actions` | manage | `{ title, category, subLabel?, detail?, ownerUserId?, findingId?, competencyId?, performanceRecordId?, sourceRef?, dueDate?, involvesIndividual? }` | 201 `{ data: action }` |
| `PATCH /actions/:id` | manage | subset body di atas + `status` | `{ data: action }` |

`action` = `{ id, title, category, subLabel, ownerUserId, ownerName, ownerJobRoleName, findingId, sourceRef, dueDate, status, overdue, involvesIndividual, lastVerification: { id, status, reportedStatus, endedAt } | null, createdAt, updatedAt }`. Daftar tidak membawa `detail`.

`kpis` = `{ total, done, process, culture, overdue }`; `process` = kategori `sop`, `alat`, `sistem`; `culture` = `budaya`; `lainnya` hanya masuk `total`. `overdue` = tenggat sudah lewat dan status `new`/`in_progress`. KPI dihitung dari himpunan yang sama dengan `data` sebelum filter query, jadi atasan hanya menghitung miliknya.

Aturan:

- `title` wajib, 3–255 karakter. `category` salah satu dari lima. `subLabel` hanya boleh bila `category = lainnya`.
- `ownerUserId`, `findingId`, `competencyId`, `performanceRecordId` dicari ulang dalam tenant; tidak ketemu → 400 dengan pesan field-nya.
- `findingId` harus temuan berkategori `non_training`. Bila temuan itu sudah punya tindakan → 409 `DUPLICATE` berisi id tindakan yang ada. Saat tindakan dibuat dari temuan, status temuan menjadi `planned`.
- `sourceRef` kosong + `competencyId`/`performanceRecordId` diisi → diisi otomatis dari nama kompetensi / nama metrik.
- `dueDate` format `YYYY-MM-DD`. Tenggat di masa lalu diterima (HR mencatat tindakan yang sudah berjalan).
- Transisi status: `new → in_progress | done | rejected`, `in_progress → done | rejected | new`, `done → in_progress`, `rejected → new`. Selain itu 409 `INVALID_STATE`. Masuk `done` mengisi `completed_at`; keluar dari `done` mengosongkannya.
- Audit: `create`/`update` resource `ina.action` dengan `objectIds: [id]`, kolom yang berubah (nama kolom saja untuk `title`/`detail`, tanpa isi), dan `employeeIds: [ownerUserId]` bila ada pemilik.
- `GET /actions` mencatat `audit.readIndividual(req, 'ina.actions', { employeeIds: pemilik… })` karena daftar memuat nama pemilik.

### 6.2 Akses atasan (flag `ina.dashboard`, hanya manage)

| Method + path | Jawaban |
| --- | --- |
| `GET /access` | `{ data: [{ supervisorId, name, email, granted, grantedAt, grantedByName }] }`: semua akun `supervisor` tenant dengan status izinnya |
| `PUT /access/:supervisorId` | `{ data: { supervisorId, granted: true, changed } }` |
| `DELETE /access/:supervisorId` | `{ data: { supervisorId, granted: false, changed } }` |
| `GET /access/me` (semua peran) | `{ data: { level: 'manage' \| 'read' \| null } }`, untuk menentukan menu di web |

Memakai store PM-6 dari PR #12. `:supervisorId` harus akun `supervisor` tenant (selain itu 404). Audit `create`/`delete` resource `ina.supervisor_access` hanya bila `changed`. Karena izinnya sama dengan `tna.non_training_access`, mengubah di satu layar mengubah keduanya; ini disengaja dan ditulis di teks panel: "Akses ini juga berlaku untuk daftar temuan di luar pelatihan."

### 6.3 Verifikasi AI (flag `ina.dashboard` + `ina.ai_verification`)

| Method + path | Siapa | Jawaban |
| --- | --- | --- |
| `POST /actions/:id/verifications` | manage | 201 `{ data: verification }`. Tindakan harus punya pemilik (400 `NO_OWNER`), berstatus `new`/`in_progress` (409 `INVALID_STATE`), dan belum punya verifikasi terbuka (409 `DUPLICATE`) |
| `GET /verifications` | manage | `{ data: [verification] }` semua, dengan `summary` dan `reportedStatus`, **tanpa** transkrip |
| `GET /verifications/mine` | siapa pun | Verifikasi yang `owner_user_id`-nya pemanggil, dengan judul tindakan dan tenggat |
| `GET /verifications/:id` | pemilik: dengan `turns`; manage: tanpa `turns` | Orang lain 404 |
| `POST /verifications/:id/consent` | pemilik | Body `{ consentVersion }` wajib. `assigned → in_progress`, kirim pertanyaan pertama |
| `POST /verifications/:id/turns` | pemilik | Body `{ text }` (1–4.000 karakter). Jawab `{ question, done }` |
| `POST /verifications/:id/complete` | pemilik | Butuh minimal satu jawaban. Menyimpan `summary` + `reportedStatus`, `in_progress → completed` |
| `POST /verifications/:id/cancel` | manage | `assigned`/`in_progress → cancelled` |

Alur percakapan (maksimal 3 pertanyaan): (1) status tindakan sekarang, (2) hambatan, (3) bantuan yang dibutuhkan dan perkiraan selesai. Setelah itu `done: true`.

Port AI: `src/modules/ina/verification-ai.js` mengekspor `createVerificationAi(ai)`. Bila provider AI punya method `nextVerificationQuestion` dan `summarizeVerification`, itu yang dipakai; bila tidak, dipakai implementasi deterministik bawaan (pertanyaan tetap; ringkasan = gabungan jawaban yang dipotong 600 karakter; `reportedStatus` dari kata kunci: "selesai/sudah beres" → `done`, "terhambat/terkendala/menunggu/belum bisa" → `blocked`, selain itu `in_progress`). `src/ai/index.js` **tidak diubah**, karena berkas itu sedang diganti PR #15 (Bedrock). `[⏳ DITERIMA]` Sampai provider Bedrock diberi dua method itu, ringkasan bukan buatan LLM; chip "Pilot" di layar tetap, dan jawaban API membawa `aiProvider` ("bawaan" atau nama provider). Test terjadwal: QA malam B18 setelah method ditambahkan.

Hasil verifikasi **tidak** mengubah status tindakan secara otomatis. HR membaca ringkasan lalu mengubah status sendiri (keputusan tetap di manusia, sejalan dengan tinjauan HR atas hasil AI di PK-14).

Privasi: `turns` hanya dikirim ke pemilik (PO-6). Ringkasan untuk HR dicatat `audit.readIndividual(req, 'ina.verification_summary', …)`. Pemilik yang membaca transkripnya sendiri juga dicatat (R2-2, `self: true`). Atasan dan pimpinan tidak punya rute ke verifikasi sama sekali; mereka hanya melihat `lastVerification.status` dan `reportedStatus` di daftar tindakan.

Persetujuan: tanpa `consentVersion` → 400. Nilainya disimpan apa adanya (versi teks persetujuan dikelola web, mengikuti pola PK-15).

## 7. Perubahan web

Menumpuk di atas PR B0. View `apps/web/src/views/ImprovementNeedsView.vue` (KPI, tabel, dialog tambah/ubah, panel akses atasan, daftar verifikasi) dan `apps/web/src/views/ActionVerificationView.vue` (persetujuan → percakapan → selesai) untuk pemilik. API `apps/web/src/api/ina.ts`. Menu "Improvement Needs" tampil bila `module.ina` + `ina.dashboard` menyala dan `GET /ina/access/me` mengembalikan level. E2E `apps/web/e2e/improvement-needs.spec.ts` dengan API mock.

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

- [ ] `docs/designs/b9-improvement-needs.md` (spek ini)
- [ ] gabung `origin/claude/project-thread-7o13op` (PR #12) ke branch
- [ ] `apps/api/migrations/20261119000900-ina-actions.js`
- [ ] `apps/api/src/core/flags/index.js`: flag `ina.ai_verification`
- [ ] `apps/api/src/db/ina-stores.js`, dipasang di `apps/api/src/db/stores.js`
- [ ] `apps/api/src/modules/ina/index.js` (router), `access.js`, `domain.js` (status, KPI), `verification-ai.js`
- [ ] `apps/api/tests/unit/ina-domain.test.js`
- [ ] `apps/api/tests/integration/ina.test.js`
- [ ] `apps/web/src/views/ImprovementNeedsView.vue`, `ActionVerificationView.vue`, `apps/web/src/api/ina.ts`, rute, `apps/web/e2e/improvement-needs.spec.ts` (setelah B0)

## 10. Asumsi dan risiko yang tersisa

| Tanda | Isi | Ditutup oleh |
| --- | --- | --- |
| ⚠️ | Pimpinan tetap punya akses baca (K-2) walau K2 brief tidak menyebut peran itu | Keputusan user / B2 |
| ⚠️ | "Menyangkut individu" ditandai manual oleh HR | Keputusan produk; B7 bisa mengisi otomatis |
| ⏳ | Ringkasan verifikasi belum buatan LLM sampai provider Bedrock diberi dua method | Setelah PR #15 masuk, QA malam B18 |
| ⏳ | Izin atasan dipakai bersama dengan daftar temuan non-pelatihan TNA | Disengaja (K1 = PM-6); pisah bila user minta |
| – | Laporan PDF agregat (BI-2) dan kanal whistleblowing (BI-6/16) tidak dibangun | Paket lanjutan |
