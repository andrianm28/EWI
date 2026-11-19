# B4 · Developmental Needs (backend)

- Submodul: DNA
- Paket: B4 (brief bangun penuh 19 Nov, thread T3)
- Flag: `module.dna` (sudah ada). Tidak ada flag baru: seluruh endpoint baru berada di router `dna` yang sudah dipasang lewat `requireSubmodule('dna')`.
- Migrasi: blok 04 → `20261119000400-dna-developmental-needs.js`
- Cakupan: API, domain, store, impor, test, dan layar Vue di atas B0 (`apps/web/src/screens/b4-dna`, rute `dna` di `/dna`). Sesi thread ini hanya boleh push ke satu branch, jadi B4, B16, dan layarnya berada di satu PR dengan commit terpisah.
- Reviewer wajib: Andrian (migrasi, `core/errors`, kode impor bersama).
- Gerbang: `npm run lint`, `npm test`, `npm run build`, `npm run e2e` (e2e tidak berubah di tahap backend).

## 1. Tujuan

HR dan atasan perlu melihat, per jabatan, apa yang harus dikembangkan secara proaktif: kamus kompetensi jabatan (hasil DACUM), kurikulum Basic · Intermediate · Advanced (BIA), posisi tiap pegawai pada tahap BIA, dan rencana pengembangan per pegawai. Kode POC (PR #2) sudah punya job role, jenjang, kompetensi, asesmen, dan gap per posisi, tetapi belum punya job function, kode/rumpun/tingkat program per kompetensi, tahap pengembangan, dan rencana pengembangan.

## 2. Layar mockup yang dicakup

Mockup Pak Eji, layar "Developmental Needs" (`s.dna` di `project/Main.dc.html`):

| Bagian mockup | Data yang dibutuhkan | Endpoint |
| --- | --- | --- |
| Pilihan jabatan (chip "Kamus tersedia" / "Belum tersedia") | daftar job role + status kamus | `GET /dna/development/overview` |
| Tab Ringkasan: KPI pegawai, job function, modul kompetensi, jabatan dengan kamus | hitungan | `GET /dna/development/overview` |
| Tab Ringkasan: pegawai per tahap pengembangan | distribusi tahap | `GET /dna/development/overview` |
| Tab Ringkasan: status kamus (Tool 1, Tool 2, Tool 3, menunggu pengesahan HR) | status kamus | `GET /dna/development/overview` |
| Tab Kamus kompetensi: job function, tabel Kode · Kompetensi · Rumpun · Level · Target, filter level | kamus per job function | `GET /dna/job-roles/:id/dictionary` |
| Tab Kurikulum BIA | modul per tingkat | `GET /dna/job-roles/:id/curriculum` |
| Tab Kebutuhan pengembangan pegawai: tabel pegawai (tahap, modul tercapai, fokus) | daftar pegawai | `GET /dna/development/employees` |
| Kartu "Rencana pengembangan: <pegawai>" (3 kolom BIA, status per modul, saran) | rencana per pegawai | `GET /dna/employees/:userId/development-plan` |

Di luar cakupan B4: kartu "Agen AI · Validasi kamus kompetensi" (wawancara AI, milik B6/B10; stub `POST /dna/dacum/sessions` 501 tetap), butir KSA dan tujuan modul (Library, B13), layar Admin Tenant "Jabatan & kamus kompetensi" (B11; boleh memakai endpoint overview ini).

## 3. Istilah

- **Job role** = "jabatan" di mockup (tabel `lna_job_roles`).
- **Job function** = fungsi kerja hasil DACUM Tool 1, bernomor urut per jabatan (JF1, JF2, ...).
- **Kompetensi** = "modul kompetensi" di mockup (tabel `lna_competencies`). Satu kompetensi bisa terpetakan ke beberapa job function.
- **Tingkat program** (`programTier`) = `basic` | `intermediate` | `advanced` (DACUM Tool 3). Ini beda dari **jenjang karier** (`careerLevelId`, mis. Junior/Senior) yang dipakai gap per posisi dan Career & Promotion (B16).
- **Rumpun** (`stream`) = pengelompokan modul, teks bebas (mis. "Specific Technical").
- **Target** = `requiredScore` kompetensi.
- Ada tiga tempat yang memakai kata "tier": `programTier` kompetensi (baru, B4), `required_program_tier` jenjang karier, dan `lna_program_completions.program_tier` (status lulus program). **Tahap pengembangan B4 dihitung dari skor asesmen saja dan tidak membaca `lna_program_completions`**; status lulus program adalah bukti Career & Promotion (B16). Keduanya bisa berbeda untuk orang yang sama.

## 4. Data dan migrasi

`20261119000400-dna-developmental-needs.js` (raw SQL, schema `ewi`, punya `down`):

```sql
ALTER TABLE lna_competencies
  ADD COLUMN code varchar(32),
  ADD COLUMN stream varchar(64),
  ADD COLUMN program_tier varchar(16) CHECK (program_tier IN ('basic','intermediate','advanced'));
-- kode unik per jabatan, tanpa beda huruf besar/kecil; kode hanya boleh pada kompetensi yang punya job role
ALTER TABLE lna_competencies ADD CONSTRAINT lna_competencies_code_role_ck CHECK (code IS NULL OR job_role_id IS NOT NULL);
CREATE UNIQUE INDEX lna_competencies_code_uq ON lna_competencies (tenant_id, job_role_id, lower(code)) WHERE code IS NOT NULL;

CREATE TABLE lna_job_functions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_role_id uuid NOT NULL REFERENCES lna_job_roles(id) ON DELETE CASCADE,
  fn_order smallint NOT NULL CHECK (fn_order >= 1),  -- nomor JF
  name varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_role_id, fn_order)
);
CREATE UNIQUE INDEX lna_job_functions_name_uq ON lna_job_functions (job_role_id, lower(name));
CREATE INDEX lna_job_functions_tenant_idx ON lna_job_functions (tenant_id, job_role_id);

CREATE TABLE lna_job_function_competencies (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_function_id uuid NOT NULL REFERENCES lna_job_functions(id) ON DELETE CASCADE,
  competency_id uuid NOT NULL REFERENCES lna_competencies(id) ON DELETE CASCADE,
  PRIMARY KEY (job_function_id, competency_id)
);
CREATE INDEX lna_jf_competencies_comp_idx ON lna_job_function_competencies (tenant_id, competency_id);
```

Migrasi diawali `SET search_path TO "${S}"` seperti migrasi lain. `tenant_id` di tabel penghubung dijaga aplikasi (A12): job function dan kompetensi divalidasi satu tenant dan satu job role sebelum disisipkan.

`down` (semua `IF EXISTS`): tabel penghubung → `lna_job_functions` → indeks dan constraint kode → tiga kolom. Tidak ada migrasi lama yang diubah. Kolom baru nullable, jadi kamus POC yang sudah ada tetap valid; kompetensi tanpa `program_tier` tidak ikut kurikulum dan tahap (lihat aturan A4).

Tidak ada tabel untuk rencana pengembangan: rencana dihitung dari kamus dan asesmen terbaru setiap kali diminta, sama seperti gap di `dna/gap.js`.

## 5. Aturan bisnis

- **A1 Skala skor.** Skor dan target tetap skala 0–4 (keputusan Q12, kolom `score`/`required_score` yang ada). Mockup memakai angka 0–100 sebagai ilustrasi. `[⚠️ BELUM TERVERIFIKASI]` Pak Eji belum menyatakan mengganti skala; API mengembalikan `score` dan `target` apa adanya sehingga layar tidak bergantung pada skalanya.
- **A2 Asesmen terbaru.** Per karyawan × kompetensi dipakai asesmen terbaru (`assessedAt`, bila kosong `createdAt`), sama dengan `computeGap`.
- **A3 Status modul per pegawai.**
  - `met` (Tercapai): skor ≥ target.
  - `develop` (Perlu dikembangkan): skor < target dan tingkat modul sama dengan atau di bawah tahap pegawai.
  - `locked` (Belum dibuka): skor < target dan tingkat modul di atas tahap pegawai.
  - `not_assessed` (Belum dinilai): belum ada asesmen.
  - `mastery` (Menguasai/Sebagian/Belum di brief; dipakai "Hasil saya", B8): skor ≥ target → `mastered`; kurang tepat satu tingkat (target − skor = 1) → `partial`; kurang dua tingkat atau lebih → `not_yet`; `null` bila belum dinilai. Mockup memakai rasio ≥ 75% pada skala 0–100; pada skala 0–4 rasio itu hampir tidak pernah menghasilkan "Sebagian", jadi dipakai selisih tingkat. Target 0 selalu `mastered`.
  - Modul yang belum dinilai selalu `not_assessed`, juga bila tingkatnya di atas tahap pegawai (bukan `locked`).
- **A4 Tahap pengembangan** (mockup: "Tahap ditentukan oleh modul pada level terendah yang belum mencapai target"). **Himpunan modul pegawai** = kompetensi `kind = 'job'` milik job role pegawai yang punya `programTier`, dari **semua jenjang karier** (roadmap BIA mencakup seluruh jalur jabatan, seperti kolom Basic/Intermediate/Advanced di mockup). Kompetensi `core` dan kompetensi tanpa `programTier` tidak ikut; jumlah yang tanpa tingkat dilaporkan sebagai `untiered`. `met`, `assessed`, `total` hanya menghitung himpunan ini, jadi bisa berbeda dari `gap.summary` di `GET /dna/employees/:userId` (yang memakai kompetensi posisi + inti).
  - Tahap = tingkat terendah (basic → intermediate → advanced) yang punya minimal satu modul **sudah dinilai** dengan skor < target.
  - Bila tidak ada modul dinilai yang di bawah target dan minimal satu modul sudah dinilai → `done` (Tuntas).
  - Bila belum ada modul yang dinilai sama sekali → `not_assessed` (Belum dinilai). Mockup tidak punya kategori ini karena semua pegawai demo sudah dinilai; ditambahkan agar pegawai tanpa data tidak tampil sebagai "Tuntas".
  - `[⏳ DITERIMA]` Mengikuti mockup, modul yang belum dinilai tidak menahan tahap, jadi pegawai bisa `done` padahal baru sebagian kamus dinilai. Respons selalu menyertakan `assessed` dan `total` agar layar menampilkan "x / y modul dinilai". Test: `dna-development.test.js` kasus "done dengan cakupan sebagian". Dicatat di PR sebagai pertanyaan terbuka untuk Pak Eji.
- **A5 Fokus pengembangan** = kode modul pada tahap pegawai yang statusnya `develop` (kode kosong → nama).
- **A6 Saran rencana** (teks Indonesia, mengikuti mockup): tahap `done` → "Semua modul yang dinilai tercapai. Pertimbangkan peran mentor dan pemetaan ke jenjang karier."; `not_assessed` → "Belum ada hasil asesmen untuk pegawai ini."; selain itu "Fokus pada modul <Tingkat> yang belum tercapai: <kode>. Modul level berikutnya dibuka setelah semua modul <Tingkat> tercapai."
- **A7 Status kamus per jabatan.** `available` bila jabatan punya ≥ 1 kompetensi jabatan, selain itu `none`. Tool 1 = ada ≥ 1 job function; Tool 2 = ada ≥ 1 kompetensi jabatan; Tool 3 = ada ≥ 1 kompetensi dengan `programTier`. `approved` = jabatan punya ≥ 1 kompetensi dan semuanya sudah disahkan (`approved_at`); jabatan tanpa kompetensi → `false`. Kompetensi baru atau yang diubah (PATCH/impor) belum disahkan, sehingga `approved` kembali `false`; itu disengaja. `assessedCompetencyCount` = jumlah kompetensi jabatan yang sudah punya minimal satu asesmen (mockup: "7 dari 48 modul sudah memiliki data asesmen"); hitungan ini se-tenant, bukan per scope pemanggil, karena hanya agregat jumlah modul. Kamus yang belum disahkan tetap tampil dengan tanda "menunggu pengesahan HR", dan tahap serta rencana B4 tetap memakainya.
- **A8 Pengesahan kamus.** HR mengesahkan seluruh kamus satu jabatan sekaligus; hanya baris yang belum disahkan yang diubah (`approved_at`, `approved_by`). Tercatat di audit: aksi `update` pada `dna.dictionary` dengan meta `{ event: 'approve', jobRoleId, approved }` (kolom `audit_logs.action` dibatasi CHECK ke read/create/update/delete/export/login, jadi tidak ada aksi `approve`). Apakah Training Needs (B5) hanya memakai kompetensi yang sudah disahkan diputuskan di B5; B4 hanya menyediakan `approvedAt`.
- **A9 Visibilitas (RG-3).** Semua data per pegawai lewat `scopeFor()` → `visibleEmployeeScope()`: HR semua, atasan timnya, karyawan dirinya. Hitungan pegawai dan distribusi tahap di overview dihitung dari pegawai dalam scope pemanggil. Pegawai di luar scope → 404 (bukan 403), sama dengan `GET /dna/employees/:userId`.
- **A10 Peran.** Overview, kamus, kurikulum, dan daftar pegawai: `hr_admin` dan `supervisor` (menu mockup hanya untuk HR dan Atasan; `eta_admin` selalu lolos `requireRole`). Rencana pengembangan satu pegawai: semua peran, dibatasi scope (karyawan boleh melihat miliknya, dipakai B8). Menulis (job function, pemetaan, pengesahan): `hr_admin`.
- **A11 Audit baca (R2-2).** Daftar pegawai dan rencana per pegawai memanggil `audit.readIndividual` (`dna.development_needs`, `dna.development_plan`; `objectType: 'dna_development'`). Overview adalah agregat dan tidak dicatat untuk HR; untuk pemanggil yang scope-nya bukan `all` (atasan) distribusi tahap bisa setara data individu, jadi dicatat dengan `dna.development_overview` dan daftar pegawai yang dihitung.
- **A12 Tenant.** Semua query memfilter `tenant_id` dari `req.tenantId`. `:id` job role, job function, dan `competencyIds` di body divalidasi milik tenant (dan milik job role yang sama, `kind = 'job'`) sebelum dipakai: resource di path → 404, id di body atau query → 400. `jobRoleId`/`careerLevelId` di `POST /competencies` dan `/competencies/bulk` sudah dicek oleh `checkPositionIds` dari basis integrasi (e2d3707): 404 untuk `POST /competencies`, 400 per baris untuk bulk; B4 memakainya apa adanya. Id yang bukan UUID → 404 (path) atau 400 (body/query), bukan 500.
- **A13 Pegawai yang dihitung** = user peran `learner`, `supervisor`, `role_leader`, `sme` dengan `job_role_id` = jabatan terpilih, status bukan `disabled` (sama dengan `GET /dna/employees`).

## 6. Endpoint

Semua di bawah `/api/dna` (auth + tenant + `requireSubmodule('dna')`).

| Metode | Path | Peran | Respons `data` |
| --- | --- | --- | --- |
| GET | `/development/overview?jobRoleId=` | HR, atasan | `{ jobs: [{ id, name, division, dictionary: 'available'\|'none', competencyCount }], selectedJobRoleId, kpi: { employees, jobFunctions, competencies, jobsWithDictionary, jobsTotal }, stageDistribution: [{ stage, count, percent }], dictionary: { tool1, tool2, tool3, competencyCount, approvedCount, approved, assessedCompetencyCount } }` |
| GET | `/job-roles/:id/dictionary?jobFunctionId=&tier=` | HR, atasan | `{ jobRole: { id, name }, jobFunctions: [{ id, order, name, competencyCount }], competencies: [{ id, code, name, stream, programTier, requiredScore, approvedAt, jobFunctionIds }], dictionary: {…A7} }` |
| POST | `/job-roles/:id/job-functions` | HR | body `{ name, order?, competencyIds? }` → 201 `{ id, jobRoleId, order, name, competencyIds }` |
| PATCH | `/job-functions/:id` | HR | body `{ name?, order? }` → job function |
| DELETE | `/job-functions/:id` | HR | 204; pemetaannya ikut terhapus |
| PUT | `/job-functions/:id/competencies` | HR | body `{ competencyIds: [] }` mengganti seluruh pemetaan dalam satu transaksi → job function |
| PATCH | `/competencies/:id` | HR | body sebagian dari `{ name, definition, code, stream, programTier, requiredScore, importance }` → kompetensi; pengesahan direset (`approvedAt: null`) |
| POST | `/job-roles/:id/dictionary/approve` | HR | `{ approved: <jumlah baris yang baru disahkan> }` |
| GET | `/job-roles/:id/curriculum` | HR, atasan | `{ jobRole, tiers: [{ tier, count, modules: [{ id, code, name, stream }] }], untiered: <jumlah> }` |
| GET | `/development/employees?jobRoleId=` | HR, atasan | `[{ id, name, stage, met, assessed, total, focus: [] }]` |
| GET | `/employees/:userId/development-plan` | semua (scope) | `{ person: { id, name, jobRoleId, jobRoleName }, stage, met, assessed, total, untiered, focus, advice, tiers: [{ tier, modules: [{ competencyId, code, name, stream, score, target, status, mastery }] }] }` |

Catatan:

- `overview` tanpa `jobRoleId` memilih jabatan pertama (urut nama) yang kamusnya `available`; bila tidak ada, `selectedJobRoleId: null`, KPI nol, `stageDistribution` lima baris bernilai nol.
- `stageDistribution` selalu berisi lima baris berurutan: `basic`, `intermediate`, `advanced`, `done`, `not_assessed`. `percent` dibulatkan dari jumlah pegawai dalam scope; 0 bila tidak ada pegawai.
- `dictionary` dan `curriculum` hanya memuat kompetensi `kind = 'job'` milik job role itu (semua jenjang karier). `tier` di query: `basic|intermediate|advanced`; nilai lain → 400.
- `order` job function kosong → nomor terakhir + 1. Nomor bentrok → 409 `CONFLICT`.
- `POST /competencies` dan `/competencies/bulk` yang ada menerima field opsional baru `code`, `stream`, `programTier`. `GET /competencies` ikut mengembalikannya.
- `stage` ∈ `basic | intermediate | advanced | done | not_assessed`.
- Urutan: `jobs` menurut nama; job function menurut `order`; kompetensi dan modul menurut kode lalu nama; pegawai menurut nama.
- `kpi.jobFunctions` dan `kpi.competencies` milik jabatan terpilih; `kpi.jobsWithDictionary` dan `kpi.jobsTotal` seluruh tenant.
- Di `dictionary`, filter `jobFunctionId`/`tier` hanya menyaring array `competencies`. `jobFunctions[].competencyCount` dan blok `dictionary` selalu untuk seluruh kamus jabatan. Tanpa `jobFunctionId`, semua kompetensi tampil, termasuk yang belum dipetakan (`jobFunctionIds: []`). `jobFunctionId` yang bukan milik job role itu → 400.
- `GET /development/employees` tanpa `jobRoleId` → jabatan default yang sama dengan overview; bila tidak ada jabatan berkamus → `[]`. `jobRoleId` di query yang bukan milik tenant → 400.
- `GET /employees/:userId/development-plan`: di luar scope atau tidak ada → 404. Pegawai tanpa job role → 200 dengan `stage: 'not_assessed'`, `total: 0`, `tiers` berisi tiga tingkat kosong. Peran dan status pegawai tidak disaring di sini (scope yang membatasi).
- Kode ganda dalam satu jabatan, nomor atau nama job function ganda → 409 `CONFLICT`. Dicek sebelum menulis (termasuk di dalam satu batch `/competencies/bulk`), dan pelanggaran indeks unik Postgres (`23505`) yang lolos karena balapan juga dipetakan ke 409. `code` pada kompetensi tanpa `jobRoleId` → 400.
- Pesan galat berbahasa Indonesia lewat `core/errors` (ditambah helper `conflict`).

## 7. Impor

- Jenis `dna_competencies` mendapat kolom opsional: **Kode** (`code`), **Rumpun** (`stream`), **Level Program** (`programTier`, memakai `TIER_CHOICES`), **Job Function** (`jobFunctions`, nomor JF dipisah titik koma, mis. `1; 3`; nomor harus sudah ada di jabatan itu, bila tidak seluruh baris ditolak). Kode ganda di file, atau kode yang sudah dipakai kompetensi lain di jabatan itu, ditolak per baris.
- **Melengkapi kamus yang sudah ada.** Baris yang kompetensinya sudah ada di kamus (kunci lama: job role + jenjang + nama) sebelumnya selalu ditolak. Sekarang: bila baris itu mengisi minimal satu kolom baru (Kode, Rumpun, Level Program, Job Function), kompetensi yang ada **diperbarui** hanya pada kolom baru yang terisi (pemetaan job function diganti bila kolomnya terisi) dan pengesahannya direset bila ada kolom kompetensi yang berubah (pemetaan job function saja tidak mereset: pemetaan adalah Tool 1, bukan isi kompetensi yang disahkan; sama dengan `PUT /job-functions/:id/competencies`); bila tidak ada kolom baru yang terisi, tetap ditolak "sudah ada di kamus". Hasil commit melaporkan `competencies` (baru) dan `updated`.
- Alias judul kolom `level` dipindah dari Jenjang (karier) ke Level Program, karena di data DACUM dan mockup "Level" berarti Basic/Intermediate/Advanced. `TIER_CHOICES` mendapat sinonim `b`, `i`, `a`, dan `advance`.
- `[⏳ DITERIMA]` Commit impor kompetensi menulis kompetensi lalu pemetaan job function baris demi baris tanpa satu transaksi (pola `commit` jenis impor lain yang sudah ada). Gagal di tengah meninggalkan sebagian baris; impor ulang aman karena baris yang sudah masuk diperlakukan sebagai "sudah ada". Tidak ada test khusus.
- Jenis baru `dna_job_functions` (label "Job function"): kolom **Job Role** (wajib, harus sudah ada), **No** (opsional, bilangan bulat ≥ 1; kosong = lanjut dari nomor terakhir), **Job Function** (wajib). Nomor atau nama ganda per jabatan ditolak. Diimpor sebelum kamus kompetensi, tetapi diletakkan di akhir `KINDS` agar nomor template yang sudah dibagikan ke HR tidak bergeser (aturan PK-18).
- Template XLSX klien di `/mnt/project-files/elgos-import-templates/` perlu dibuat ulang setelah PR ini masuk (bukan bagian PR; dicatat di deskripsi PR).

## 8. Keputusan default yang dipakai

- K2 (peran): peran teknis yang ada dipakai apa adanya (`hr_admin` = HR/L&D, `supervisor` = Atasan, `learner` = Karyawan). Penambahan peran dan ganti tampilan adalah milik B2.
- K1, K3, K4 tidak menyentuh paket ini.
- Q12 (skala 0–4), RG-3 (scope), R2-2 (audit baca), F6-A (DNA = impor/bangun kamus + asesmen proaktif).

## 9. Asumsi dan risiko

- `[⚠️ BELUM TERVERIFIKASI]` A1 skala.
- `[⚠️ BELUM TERVERIFIKASI]` Data DACUM Mas Abdan (masuk 26 Nov) punya kode modul, rumpun, tingkat BIA, dan pemetaan job function seperti di mockup, dan seluruh modul kurikulum (48 di mockup) hadir sebagai baris kompetensi. Semua kolom itu opsional sehingga data tanpa kolom tersebut tetap bisa diimpor.
- `[⏳ DITERIMA]` A4 modul belum dinilai tidak menahan tahap (test dijadwalkan di PR ini).
- `[⏳ DITERIMA]` Rencana dihitung saat diminta (N pegawai × M modul di memori). Untuk POC satu jabatan ±50 pegawai × ±50 modul ini kecil; tidak ada test beban di PR ini.

## 9a. Triase review spek (ikan mas, 19 Nov)

20 temuan. **Diperbaiki di spek ini:** tidak ada jalan melengkapi/koreksi kamus (PATCH kompetensi, PATCH/DELETE job function, impor memperbarui); `mastery` tidak cocok skala 0–4; himpunan modul pegawai tidak terdefinisi; perilaku input kosong/tidak valid; bentrok unik menjadi 500; alias "Level"; sinonim B/I/A; kode pada kompetensi tanpa job role; hubungan tiga "tier"; audit overview untuk atasan; kasus tepi pengesahan; bentuk respons; validasi tenant di `POST /competencies`; nama job function unik; `assessedCompetencyCount`; detail migrasi; reviewer dan gerbang.

**Ditolak dengan alasan:**
- *Flag baru (CLAUDE.md aturan 3).* Brief B4 menetapkan flag `module.dna`, dan endpoint baru hanya tampilan lain atas data modul yang sama; tidak ada perilaku tenant yang berubah sampai layar baru dipasang. Dicatat di PR agar Andrian bisa meminta flag terpisah.
- *Spek di `docs/ewi/tickets/ELITMEN-xxx.md`.* Aturan bersama nomor 11 di brief menetapkan `docs/designs/<paket>.md`; paket ini belum punya nomor ELITMEN.
- *Tabel contoh A3/A5/A6.* Contohnya ada sebagai kasus di `tests/unit/dna-development.test.js`.

**Ditunda (dicatat di PR):** chip "Tuntas" saat baru sebagian modul dinilai (pertanyaan untuk Pak Eji; respons sudah membawa `assessed`/`total`); transaksi untuk commit impor.

## 10. Test yang ditulis lebih dulu

- `tests/unit/dna-development.test.js`: tahap (basic/intermediate/advanced/done/not_assessed), status modul termasuk `locked`, `mastery`, fokus, saran, asesmen terbaru menang, done dengan cakupan sebagian, distribusi tahap dan persen, status kamus (A7).
- `tests/unit/imports.test.js` (tambahan): validasi kolom baru `dna_competencies` dan jenis `dna_job_functions`.
- `tests/integration/dna-development.test.js` (Postgres): alur HR membuat job function + kamus berkode, pengesahan + audit, overview, kamus dengan filter, kurikulum, daftar pegawai, rencana; atasan hanya timnya; karyawan 403 untuk daftar dan 404 untuk rencana orang lain; tenant lain tidak bisa membaca atau memetakan (404/400); kode ganda 409; flag `module.dna` mati → 403.
- CI yang ada menjalankan migrasi naik-turun-naik.

## 11. Perubahan file

- [x] `apps/api/migrations/20261119000400-dna-developmental-needs.js`
- [x] `apps/api/src/modules/dna/development.js` (domain murni)
- [x] `apps/api/src/modules/dna/development-routes.js` (router endpoint bagian 6)
- [x] `apps/api/src/modules/dna/index.js` (pasang router, field baru kompetensi)
- [x] `apps/api/src/db/lna-stores.js` (kolom baru, job function, pengesahan kamus)
- [x] `apps/api/src/core/errors/index.js` (helper `conflict` bila belum ada)
- [x] `apps/api/src/modules/imports/kinds/competencies.js`
- [x] `apps/api/src/modules/imports/kinds/job-functions.js`
- [x] `apps/api/src/modules/imports/kinds/index.js`
- [x] `apps/api/src/modules/imports/kinds/common.js` (sinonim tingkat)
- [x] `apps/api/tests/unit/dna-development.test.js`
- [x] `apps/api/tests/unit/imports.test.js`
- [x] `apps/api/tests/integration/dna-development.test.js`
- [x] `docs/ewi/poc-dna-tna.md` (tautan ke spek ini bila ada daftar endpoint DNA)

## 9b. Triase review diff (ikan mas, 19 Nov)

14 temuan, tidak ada yang berat. **Diperbaiki:** impor memetakan kompetensi non-jabatan dan sel Job Function tanpa nomor menghapus pemetaan (1); `PATCH /competencies` 500 untuk `definition` bukan teks dan `name` > 255 (2); nomor job function dibatasi 1–999 (5); job function terhapus paralel → 404/409, bukan 500 (6); `updateCompetency` memakai `Object.hasOwn` (8); subquery pemetaan memfilter `tenant_id` dan berurutan (9); UUID huruf besar pada rencana pegawai (11); overview tanpa jabatan mengembalikan lima baris nol (12); test tambahan untuk kasus 1, 2, 5 (14, sebagian).

**Diperjelas di spek:** pemetaan job function tidak mereset pengesahan, di impor maupun PUT (4); `assessedCompetencyCount` se-tenant (10).

**Ditolak dengan alasan:** flag baru (3), sama dengan §9a; diminta persetujuan eksplisit Andrian di PR.

**Ditunda:** dua `POST job-functions` tanpa nomor bersamaan, satu mendapat 409 (7; HR tunggal, cukup ulangi); commit impor tanpa `orConflict` (6, bagian impor; ikut penundaan transaksi impor §9a); alias "Level" di file kamus lama (13; dicatat di PR dan template); sisa klaim tanpa test: jalur 23505, `careerLevelId` lintas jabatan, pengguna nonaktif (14).

## 11. Layar (di atas B0)

- Rute `dna` (`/dna`, `meta.views` hr/atasan/super, `submodule: 'dna'`) menggantikan `screens/legacy-dna`. Halaman POC lama tetap di `/m/dna` dengan nama rute `dna-poc` (`menuKey: 'dna'`) sampai impor (B11) dan hasil karyawan (B8) punya layar pengganti; tautan "Buka" di Beranda tetap ke `/m/dna`.
- Empat tab mockup: Ringkasan, Kamus kompetensi (job function sebagai tombol filter, segmen level), Kurikulum BIA, Kebutuhan pegawai (tabel + rencana). Label status modul: Tercapai, Perlu dikembangkan, Belum dibuka, Belum dinilai. Chip jabatan: Kamus tersedia / Belum tersedia.
- Tambahan di luar mockup: tombol "Sahkan kamus" untuk HR (A8) dan catatan cakupan "Baru x dari y modul yang dinilai" (A4).
- Kartu "Agen AI · Validasi kamus kompetensi" tidak dibangun (§2, milik B6/B10).

- [x] `apps/web/src/screens/b4-dna/routes.ts`, `api.ts`, `DevelopmentNeedsView.vue`
- [x] hapus `apps/web/src/screens/legacy-dna/`
- [x] `apps/web/e2e/b4-dna.spec.ts`

## 12. Cek drift (19 Nov)

Dilakukan manual (plugin egm tidak terpasang di sesi). Dibandingkan: aturan A1–A13 dan §6 dengan `dna/development.js`, `dna/development-routes.js`, store, impor, dan migrasi 0400; §11 dengan layar. Yang diselaraskan di spek: pemetaan job function tidak mereset pengesahan (§7), `stageDistribution` lima baris nol tanpa jabatan (§6), `assessedCompetencyCount` se-tenant (A7), batas nomor job function 1–999 (§9b), cakupan layar. Tidak ada perbedaan lain yang ditemukan.
