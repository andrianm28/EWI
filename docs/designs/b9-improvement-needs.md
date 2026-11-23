# B9 · Improvement Needs

Status (19 Nov 2026): backend dan web sudah dibangun di PR #17 dan sesuai spek ini. egm-review penuh (tahap 5–9), review diff, dan triasenya ada di bagian 14 dan `docs/designs/egm-review/`. Yang tersisa: keputusan terbuka di bagian 10.

Istilah: "Improvement Needs" (INA) mengikuti `CONTEXT.md`; "temuan non-pelatihan" adalah temuan TNA berkategori `non_training` yang menjadi sumber tindakan. Tanda ⚠️ = asumsi yang belum diputuskan, ⏳ = risiko yang diterima sementara; keduanya punya baris di bagian 10.

## 1. Tujuan

HR mengelola **tindakan perbaikan** untuk masalah non-pelatihan (SOP, alat, sistem, budaya) yang ditemukan lewat Training Needs, supaya masalah itu tidak berakhir sebagai pelatihan yang tidak menyelesaikan apa pun. Tiap tindakan punya pemilik dan tenggat, dan statusnya bisa diperiksa lewat wawancara singkat AI ke pemiliknya, dengan ringkasan untuk HR.

Yang **bukan** tujuan paket ini:

- menghasilkan temuan non-pelatihan (itu wawancara akar masalah, B6) dan memilah temuan menjadi Training/Improvement (itu tinjauan HR, B7). B7 hanya menandai temuan (`improvement_handoff_at`); HR membuat tiap tindakan di layar ini lewat `POST /ina/actions` dengan `findingId`. Tombol massal "Buat tindakan di Improvement Needs" di mockup B7 berarti "buka layar INA", bukan membuat tindakan otomatis;
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
- **K-2** (keputusan grilling 12 Nov, berbeda dari **K2** di brief 19 Nov yang memetakan peran ke tampilan): Pimpinan punya akses baca ke dashboard INA. K1 (lebih baru) membatasi baris tindakan ke HR dan atasan yang diberi akses, jadi Pimpinan hanya menerima **angka ringkasan** (KPI), tanpa baris. `[⚠️ BELUM TERVERIFIKASI]` K2 menyebut lima tampilan tanpa Pimpinan; bila diputuskan Pimpinan tidak melihat apa pun, cukup satu baris di `access.js` (bagian 10).
- **PO-6**: transkrip hanya untuk orang yang diwawancarai. HR hanya melihat ringkasan.
- **R2-2**: baca data individu dan semua perubahan dicatat audit; gagal catat berarti request gagal (urutan tulis di 6.1).
- **R2-3**: teks yang berasal dari wawancara dienkripsi per tenant.
- **RG-4 / "ya revisi" 19 Nov**: INA masuk 2 Des, tetap di balik flag.

### 3.1 Alternatif yang ditolak

- **Tabel izin baru khusus INA.** Ditolak: K1 = PM-6 adalah satu keputusan untuk masalah non-pelatihan, jadi izin atasan memakai `lna_non_training_grants` (bagian 6.2).
- **Status temuan diturunkan dari `ina_actions` saat dibaca** (bukan ditulis ke `lna_findings`). Ditolak: layar TNA dan audit PK-15 sudah membaca `lna_findings.status`; INA menulisnya di transaksi yang sama dan mencatat `tna.finding` (6.1).
- **Memakai `lna_interview_sessions` untuk verifikasi.** Ditolak: sesi itu mewajibkan proyek dan sedang dirombak B6 (bagian 5).
- **Menunda verifikasi AI dan memakai formulir "perbarui status".** Ditolak: brief dan mockup meminta kartu "Agen AI"; risikonya ditahan flag `ina.ai_verification` dan ringkasan tanpa kutipan (6.3).

## 4. Akses

### 4.1 Gerbang

1. `requireSubmodule('ina')`: entitlement `ina` (atau `full_suite`) + flag `module.ina`. Sudah terpasang di `app.js` untuk semua rute `/api/ina`.
2. Flag `ina.dashboard` (sudah ada, default mati): semua rute tindakan dan akses atasan.
3. Flag baru `ina.ai_verification` (default mati): semua rute verifikasi AI. Butuh `ina.dashboard` juga.

### 4.2 Siapa melihat apa

Fungsi `inaAccess(req, stores)` di `src/modules/ina/access.js` mengembalikan `{ level, scope }`:

| Peran aktif | level | Yang terlihat |
| --- | --- | --- |
| `hr_admin`, `eta_admin` | `manage` | Semua tindakan tenant; boleh buat, ubah, tugaskan verifikasi, kelola akses atasan |
| `pimpinan` | `summary` | Hanya `kpis` seluruh tenant; `data` selalu kosong; tidak ada rute satuan |
| `supervisor` **dengan izin aktif** | `read` | Tindakan yang pemiliknya ada di `visibleEmployeeScope()` atasan itu (dirinya dan bawahan langsung). Tindakan tanpa pemilik tidak terlihat |
| `supervisor` tanpa izin | – | 403 `NO_INA_ACCESS` |
| peran lain (termasuk `tenant_admin`) | – | 403 `ROLE_FORBIDDEN` |

Level `read` tidak menerima `findingId`, `competencyId`, `performanceRecordId`, `involvesIndividual`, dan `lastVerification.reportedStatus` (apa yang dilaporkan pemilik ke HR bukan untuk atasan).

Pemilik tindakan (peran apa pun, termasuk `learner`) hanya menjangkau rute verifikasi miliknya (bagian 6.3) dan `GET /access/me`. Ia tidak membuka dashboard (keputusan terbuka di bagian 10).

Cakupan atasan memakai `scopeFor(req, stores.people)` → `visibleEmployeeScope()` (aturan 4), diterapkan di SQL pada `owner_user_id`. Catatan: daftar temuan non-pelatihan TNA (PR #12) hanya menampilkan bawahan, tidak dirinya; di sini atasan juga melihat tindakan yang ia miliki sendiri, karena ia yang harus mengerjakannya.

### 4.3 Temuan yang menyangkut individu

Kolom `involves_individual` (boolean, default `false`). Tindakan bertanda `true` tidak ikut daftar bawaan dan KPI siapa pun, dan tidak bisa diverifikasi lewat AI; menandainya membatalkan verifikasi yang masih terbuka. KPI selalu dihitung dari daftar utama, juga saat `hidden=1`.

| Peran | Daftar bawaan | Hitungan `meta.hiddenIndividual` | `?hidden=1` | `GET /actions/:id` tindakan bertanda |
| --- | --- | --- | --- | --- |
| manage | tanpa tindakan bertanda | ya | ya, untuk koreksi | ya |
| read (atasan) | tanpa tindakan bertanda | tidak | 403 `ROLE_FORBIDDEN` | 404 |
| summary (pimpinan) | `data` kosong | tidak | 403 `ROLE_FORBIDDEN` | 403 (tidak punya rute satuan) |

Saat tindakan dibuat **dari temuan** (`findingId`), `involvesIndividual` wajib dikirim eksplisit (`true`/`false`): temuan wawancara selalu berasal dari satu karyawan, jadi HR harus memutuskan dengan sadar. Judul tindakan selalu ditulis HR; judul temuan tidak diwarisi, supaya kalimat dari wawancara tidak ikut tampil ke atasan.

`[⚠️ BELUM TERVERIFIKASI]` Siapa yang memutuskan sebuah temuan "menyangkut individu" belum pernah diputuskan. Paket ini memakai penilaian HR (tanda manual). Deteksi otomatis oleh AI bisa mengisi kolom yang sama nanti.

## 5. Data dan migrasi

Migrasi `20261119000900-ina-actions.js` (blok 09), raw SQL, punya `down` yang menghapus ketiga tabel. DDL di bawah sama dengan migrasi final. `ina_verification_turns` tidak punya `tenant_id`. Setiap akses ke giliran diawali membaca (dan untuk tulis, mengunci) baris `ina_verifications` dengan filter `tenant_id`; query giliran sesudahnya memakai `verification_id` hasil baca itu. Baca transkrip memakai join ke `ina_verifications` dengan `tenant_id`. `ina_verifications.owner_user_id` memakai `ON DELETE CASCADE`: menghapus karyawan (PK-15) ikut menghapus percakapannya.

```sql
CREATE TABLE ina_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  finding_id uuid REFERENCES lna_findings(id) ON DELETE SET NULL,
  title text NOT NULL,                 -- terenkripsi (R2-3)
  detail text,                         -- terenkripsi
  category varchar(16) NOT NULL CHECK (category IN ('sop','alat','sistem','budaya','lainnya')),
  sub_label varchar(64) CHECK (sub_label IS NULL OR category = 'lainnya'),  -- BI-1
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
  status varchar(16) NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','in_progress','completed','cancelled','withdrawn')),
  due_date date,
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
| `GET /actions` | manage, read, summary | query `status?`, `category?` (nilai tak dikenal → 400), `hidden=1` (manage) | `{ data: [action], kpis, meta: { level, hiddenIndividual? } }`; untuk summary `data = []` |
| `GET /actions/:id` | manage; read bila terlihat | – | `{ data: action }` (dengan `detail`); tidak terlihat → 404 |
| `POST /actions` | manage | `{ title, category, subLabel?, detail?, ownerUserId?, findingId?, competencyId?, performanceRecordId?, sourceRef?, dueDate?, involvesIndividual? }` | 201 `{ data: action }` |
| `PATCH /actions/:id` | manage | subset body di atas (tanpa `findingId`) + `status` | `{ data: action }` |

`action` = `{ id, title, category, subLabel, ownerUserId, ownerName, ownerJobRoleName, sourceRef, dueDate, status, overdue, lastVerification: { id, status, endedAt, reportedStatus* } | null, createdAt, updatedAt, findingId*, competencyId*, performanceRecordId*, involvesIndividual* }` (bertanda * hanya untuk manage; tipe web `InaAction` hanya memuat field yang dipakai layar). Daftar tidak membawa `detail`. `lastVerification` mengabaikan verifikasi yang dibatalkan atau ditarik.

`kpis` = `{ total, done, process, culture, overdue }`; `process` = kategori `sop`, `alat`, `sistem` (kartu mockup "SOP / ALAT / SISTEM"); `culture` = `budaya`; `lainnya` (BI-1, tidak ada di mockup) hanya masuk `total`. `overdue` = tenggat sudah lewat (tanggal server, UTC) dan status `new`/`in_progress`. KPI dihitung dari himpunan yang boleh dilihat pemanggil sebelum filter query, jadi atasan hanya menghitung tindakan dalam cakupannya (dirinya dan bawahan langsung). `overdue` tidak punya kartu di mockup; layar menampilkannya sebagai keterangan di kartu TINDAKAN.

Aturan:

- `title` wajib, 3–255 karakter. `category` salah satu dari lima. `subLabel` hanya boleh bila `category = lainnya`; pindah kategori dari `lainnya` mengosongkannya.
- `ownerUserId` (akun tidak nonaktif), `findingId`, `competencyId`, `performanceRecordId` dicari ulang dalam tenant; tidak ketemu atau bukan UUID → 400 dengan label isian dalam bahasa Indonesia (mis. "Pemilik tidak ditemukan"). Pada `PATCH` rujukan hanya diperiksa bila nilainya berubah (UUID dibandingkan tanpa beda huruf besar), supaya tindakan yang pemiliknya sudah nonaktif tetap bisa diubah.
- `findingId` harus temuan `non_training` yang sudah ditinjau HR (`review_status` `approved`/`edited`, PK-14). Temuan yang sudah punya tindakan → 409 `DUPLICATE` (indeks unik menangkap balapan dua request). `competencyId`/`performanceRecordId` diwarisi dari temuan bila tidak dikirim. Status temuan: dibuat → `planned`; tindakan `done` → `resolved`; keluar dari `done` → `planned`. Status temuan ditulis di transaksi yang sama dengan tindakan dan dicatat audit `update` resource `tna.finding` (`status {from,to}`, `via: 'ina'`), sama dengan perubahan dari layar TNA.
- `sourceRef` kosong + `competencyId` ada → diisi dari nama kompetensi. Nama metrik dari `performanceRecordId` tidak dipakai, karena catatan kinerja milik satu karyawan dan `sourceRef` terlihat oleh atasan.
- `dueDate` format `YYYY-MM-DD`. Tenggat di masa lalu diterima (HR mencatat tindakan yang sudah berjalan).
- Transisi status: `new → in_progress | done | rejected`, `in_progress → done | rejected | new`, `done → in_progress`, `rejected → new`. Selain itu 409 `INVALID_TRANSITION` (kode yang sama dengan PR #12). Masuk `done` mengisi `completed_at`; keluar mengosongkannya.
- Mengganti pemilik, menutup tindakan (`done`/`rejected`), atau menandai individu membatalkan verifikasi yang masih terbuka. Tiap pembatalan dicatat audit `ina.verification` peristiwa `cancelled` dengan `reason` (`owner_changed`, `action_closed`, `involves_individual`).
- Field yang nilainya sama diabaikan (tanpa audit). Body tanpa field dikenal → 400.
- Audit: `create`/`update` resource `ina.action` dengan `objectIds: [id]`, nama kolom yang berubah (tanpa isi `title`/`detail`), `status {from,to}`, `owner {from,to}`, dan `employeeIds` pemilik.
- `GET /actions` (bukan summary) dan `GET /actions/:id` mencatat `audit.readIndividual` karena memuat nama pemilik.
- Urutan tulis: tindakan dan efek sampingnya (status temuan, pembatalan verifikasi) disimpan dalam **satu transaksi** di `ina-stores.js`; perubahan status memakai `UPDATE … WHERE status = <yang dibaca>`. Audit dicatat sesudah transaksi, seperti modul lain. `[⏳ DITERIMA]` Bila audit gagal, request menjawab 500 padahal data sudah tersimpan; memasukkan audit ke transaksi mengubah layanan audit bersama (bagian 10).

### 6.2 Akses atasan

| Method + path | Jawaban |
| --- | --- |
| `GET /access/me` (semua peran, **di luar** flag `ina.dashboard`; bersama `GET /` (info modul) satu-satunya rute di luar flag itu) | `{ data: { level: 'manage' \| 'read' \| 'summary' \| null, pendingVerifications } }`. Flag dashboard mati → `level: null`, bukan galat. `pendingVerifications` = verifikasi terbuka milik pemanggil (0 bila flag verifikasi mati) |
| `GET /owners` (manage) | `{ data: [{ id, name, jobRoleName }] }`: akun aktif tenant untuk pemilih pemilik |
| `GET /access` (manage) | `{ data: [{ supervisorId, name, email, granted, grantedAt, grantedByName }] }`: semua akun `supervisor` tenant dengan status izinnya |
| `PUT /access/:supervisorId` (manage) | `{ data: { supervisorId, granted: true, changed } }` |
| `DELETE /access/:supervisorId` (manage) | `{ data: { supervisorId, granted: false, changed } }` |

Memakai store PM-6 dari PR #12. Beda perilaku yang disengaja: daftar temuan TNA hanya membaca izin ini bila flag `tna.non_training_hr` menyala, sedangkan INA selalu membacanya di balik `ina.dashboard`. `:supervisorId` harus akun `supervisor` tenant (selain itu 404). Audit `create`/`delete` resource `tna.non_training_access` (nama yang sama dengan layar TNA, ditambah `via: 'ina'`) hanya bila `changed`. Karena izinnya sama dengan `tna.non_training_access`, mengubah di satu layar mengubah keduanya; ini disengaja dan ditulis di teks panel: "Akses ini juga berlaku untuk daftar temuan di luar pelatihan."

### 6.3 Verifikasi AI (flag `ina.dashboard` + `ina.ai_verification`)

| Method + path | Siapa | Jawaban |
| --- | --- | --- |
| `POST /actions/:id/verifications` | manage | Body `{ dueDate? }`. 201 `{ data: verification }`. Tindakan harus punya pemilik yang akunnya aktif (400 `NO_OWNER`), tidak bertanda individu dan berstatus `new`/`in_progress` (409 `INVALID_STATE`), dan belum punya verifikasi terbuka (409 `DUPLICATE`). Syarat pemilik, status, dan tanda individu diperiksa ulang di dalam `INSERT … SELECT`, jadi `PATCH` yang menyusul di antara baca dan tulis menghasilkan 409, bukan verifikasi untuk pemilik lama |
| `GET /verifications` | manage | `{ data: [verification] }` 500 terbaru, dengan `summary` dan `reportedStatus`, **tanpa** transkrip |
| `GET /verifications/mine` | siapa pun | Verifikasi milik pemanggil (yang dibatalkan HR tidak ditampilkan) |
| `GET /verifications/:id` | pemilik: dengan `turns`; manage: tanpa `turns` | Orang lain 404 |
| `POST /verifications/:id/consent` | pemilik | Body `{ consentVersion }` wajib. `assigned → in_progress`, jawab `{ ..., question, done: false }` |
| `POST /verifications/:id/turns` | pemilik | Body `{ text }` (1–4.000 karakter). Jawab `{ question, done: false }`; jawaban ketiga menutup percakapan otomatis dan menjawab verifikasi + `done: true` |
| `POST /verifications/:id/complete` | pemilik | Mengakhiri lebih awal; butuh minimal satu jawaban |
| `POST /verifications/:id/withdraw` | pemilik | Menarik diri: `assigned`/`in_progress → withdrawn`, semua giliran dihapus |
| `POST /verifications/:id/cancel` | manage | `assigned`/`in_progress → cancelled` |

`verification` = `{ id, actionId, actionTitle, actionDueDate, ownerUserId, ownerName, status, dueDate, assignedAt, startedAt, endedAt, reportedStatus, summary, aiProvider }`. Rute percakapan (`consent`, `turns`, `complete`, `withdraw`) pada status yang salah → 409 `INVALID_STATE` (termasuk giliran setelah selesai). HR dan orang lain mendapat 404 di rute percakapan. Pemilik lama (setelah pemilik tindakan diganti), atau pemilik tindakan yang kemudian ditandai menyangkut individu, tetap melihat verifikasinya sendiri, tetapi judul tindakan diganti teks tetap. Pembatalan manual oleh HR (`/cancel`) dicatat `cancelled` tanpa `reason`.

Alur percakapan (maksimal 3 pertanyaan): (1) status tindakan sekarang, (2) hambatan, (3) bantuan yang dibutuhkan dan perkiraan selesai.

Port AI: `src/modules/ina/verification-ai.js` mengekspor `createVerificationAi(ai)` dengan dua method async: `nextVerificationQuestion({ action, askedCount, turns }) -> string` dan `summarizeVerification({ action, turns }) -> { summary, reportedStatus }`. Provider yang tidak punya method itu, gagal, atau menjawab tidak sah diganti implementasi bawaan. **Ringkasan bawaan tidak memuat teks jawaban** (PO-6): hanya kalimat tetap menurut `reportedStatus`, yang ditebak dari kata kunci (aturannya di `verification-ai.js` dan `tests/unit/ina-domain.test.js`). `[⏳ DITERIMA]` Sampai provider LLM diberi dua method itu, ringkasan bukan buatan LLM; chip "Pilot" tetap dan API membawa `aiProvider`. Method LLM nanti masuk lewat kontrak provider bersama di `src/ai` (dengan catatan pemakaian), dan prompt ringkasannya dilarang mengutip jawaban (diuji QA malam B18). Pemantauan mutu AI (BI-21) di luar paket ini.

Hasil verifikasi **tidak** mengubah status tindakan secara otomatis. HR membaca ringkasan lalu mengubah status sendiri (keputusan tetap di manusia, sejalan dengan PK-14).

Privasi: `turns` hanya dikirim ke pemilik (PO-6). Ringkasan untuk HR dicatat `audit.readIndividual(req, 'ina.verification_summary', …)`. Pemilik yang membaca transkripnya sendiri dicatat `ina.verification_transcript` (`self: true`). Atasan dan pimpinan tidak punya rute ke verifikasi; atasan hanya melihat `lastVerification.status` di daftar tindakan. Audit `ina.verification` mencatat `create` dan peristiwa `consent`, `completed`, `withdrawn`, `cancelled`, tanpa isi percakapan.

Persetujuan: tanpa `consentVersion` → 400. Nilainya disimpan apa adanya (versi teks persetujuan dikelola web, mengikuti pola PK-15).

Kode galat paket ini: 400 `BAD_REQUEST` / `NO_OWNER`, 403 `NOT_ENTITLED` / `FEATURE_DISABLED` / `ROLE_FORBIDDEN` / `NO_INA_ACCESS`, 404 `NOT_FOUND`, 409 `DUPLICATE` / `INVALID_TRANSITION` / `INVALID_STATE`.

Hubungan dengan B7 (T5): B7 hanya menandai temuan (`improvement_handoff_at`). HR membuat tindakan satu per satu lewat `POST /ina/actions` dengan `findingId`, karena tiap tindakan butuh judul dari HR dan keputusan `involvesIndividual`. API sudah menerimanya; formulir web belum punya isian `findingId`/rujukan (tipe `ActionInput` di `ina.ts`), menyusul bersama daftar temuan B7. Daftar "temuan yang menunggu tindakan" (dari `stores.tna.listImprovementHandoffs`) ditambahkan di layar ini setelah B7 masuk.

## 7. Perubahan web

Dibangun di atas kontrak B0 (PR #18). Layar di `apps/web/src/screens/b9-ina/`:

- `ImprovementNeedsView.vue`: KPI, tabel tindakan, formulir tambah/ubah, panel akses atasan, daftar verifikasi. Detail tindakan dimuat terpisah; selama belum termuat, kolom detail dikunci dan tidak dikirim saat menyimpan, supaya detail lama tidak terhapus (hasil code review).
- `ActionVerificationView.vue`: persetujuan → percakapan → selesai, untuk pemilik tindakan.
- `ShellExtra.vue`: pengingat verifikasi yang menunggu, dipasang otomatis oleh shell B0.

Rute di `routes.ts`: `ina` di `/ina` (meta `submodule: 'ina'`, `flag: 'ina.dashboard'`, `views: ['hr', 'atasan', 'super']`; `super` = tampilan Super Admin; Pimpinan belum punya tampilan di shell, jadi level `summary` baru terpakai setelah B2), `ina-verifikasi` di `/ina/verifikasi/:id?` (flag `ina.ai_verification`), dan `ina-lama` yang mengarahkan alamat lama `/m/ina` ke `/ina`. Layar lama `screens/legacy-ina` dihapus. Pemilih pemilik memakai `GET /ina/owners`. Menu memakai `routeOpen()` dari B0. API klien `apps/web/src/api/ina.ts`. E2E `apps/web/e2e/improvement-needs.spec.ts` (5 test) dengan API mock.

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
- triase review egm 19 Nov: rujukan yang tidak berubah tidak diperiksa ulang (UUID huruf besar bukan perubahan), verifikasi tidak dibuat untuk pemilik lama setelah `PATCH` menyusul, pembatalan verifikasi tercatat dengan alasan, status temuan dan tindakan gagal bersama (transaksi), `tna.finding` tercatat, `sourceRef` tidak diisi dari catatan kinerja individu, satu nama audit izin;
- migrasi naik-turun-naik: dijalankan CI (`.github/workflows/ci.yml`), bukan di berkas test ini.

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
- [x] Baris alur "Akses atasan ke perbaikan" (B18 tabel 3.3): `apps/api/tests/integration/alur-ina.test.js` dengan langkah `ina.*` dan `adminTenant.*` di `apps/api/tests/alur/driver.js`. Alur mencakup daftar tindakan (dirinya, bawahan langsung, bukan tim lain, bukan tindakan tanpa pemilik); temuan non-pelatihan TNA dan audit izin tetap diuji di `tests/integration/ina.test.js`

## 10. Asumsi dan risiko yang tersisa

| Tanda | Isi | Ditutup oleh |
| --- | --- | --- |
| ⚠️ | Pimpinan hanya menerima angka ringkasan (K-2 dibatasi K1) | Keputusan user / B2 |
| ⚠️ | "Menyangkut individu" ditandai manual oleh HR | Keputusan produk; B7 bisa mengisi otomatis |
| ⏳ | Ringkasan verifikasi belum buatan LLM sampai provider Bedrock diberi dua method | Setelah PR #15 masuk, QA malam B18 |
| ⏳ | Izin atasan dipakai bersama dengan daftar temuan non-pelatihan TNA; dua set rute, satu nama audit | Disengaja (K1 = PM-6); pisah bila user minta |
| ⚠️ | Pemilik tindakan tidak punya tampilan daftar tindakannya sendiri; ia hanya menerima verifikasi | Keputusan produk (Pak Eji) |
| ⚠️ | `eta_admin` mendapat level `manage` seperti HR | Keputusan produk; B12 |
| ⏳ | Audit dicatat sesudah transaksi: audit gagal → 500 padahal data tersimpan | Diterima (pola repo); ubah layanan audit bersama bila perlu (review Andrian) |
| ⏳ | Peran INA dibaca dari token; HR yang diturunkan tetap `manage` sampai token habis (maks. 8 jam) | Diterima; sama dengan modul lain |
| ⏳ | KPI dan daftar dihitung dari maksimal 2.000 baris di JS | Agregasi SQL bila ada tenant mendekati batas |
| ⏳ | Verifikasi yang lewat tenggat tidak kedaluwarsa sendiri; HR membatalkannya | Diterima untuk POC |
| ⏳ | `GET /access` tidak menampilkan atasan nonaktif yang masih punya izin | Rapikan bersama B2 |
| ⏳ | Formulir web belum bisa membuat tindakan dari temuan (API sudah bisa) | Bersama daftar temuan B7 |
| ⏳ | Atasan dengan izin membaca `detail` (teks bebas HR) di `GET /actions/:id` | HR diingatkan di formulir; pisah kolom bila diminta |
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

## 14. egm-review penuh dan review diff (putaran 2, 19 Nov 2026)

Dijalankan dengan agen plugin egm (reviewer tanpa riwayat, dipanggil langsung dari konteks utama karena `egm-synthesizer` tidak bisa memanggil subagen di harness ini). Laporan lengkap di `docs/designs/egm-review/b9/` (tahap 5 zoom-out, 6 comprehension, 7 critic, 8 intermediate zoom-out, 9 implementation readiness), review diff di `docs/designs/egm-review/diff/diff_review_report.md`, triase egm-resolve di `docs/designs/egm-review/b9/goldfish_review_report.md`, drift di `docs/designs/egm-review/2026-11-19_DRIFT_REPORT.md`.

Hasil utama:

- **Kode (test-first, test merah di `d0c9f02`, perbaikan `7ae83c8`):** tulis tindakan dan efek sampingnya dalam satu transaksi; verifikasi dibuat dengan `INSERT … SELECT` bersyarat; rujukan yang tidak berubah tidak diperiksa ulang; pembatalan verifikasi dan status temuan dicatat audit; satu nama audit izin atasan; `sourceRef` tidak diisi dari catatan kinerja individu.
- **Spek:** status, istilah, alternatif yang ditolak (3.1), tabel peran × hasil (4.3), DDL final, `GET /owners`, alur B7, klaim tenant pada giliran (temuan Blocker CB9-1) dibetulkan, baris baru di bagian 10.
- **Diteruskan ke user:** `eta_admin` level `manage`, pemilik tanpa tampilan daftar, level Pimpinan.
- **Ditunda:** agregasi KPI di SQL, kedaluwarsa verifikasi, `/turns` saat `addTurn` gagal, rute izin digabung. Usul: `/mattpocock-skills:to-tickets` untuk butir ini.
