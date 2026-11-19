# B4 · Developmental Needs

- Submodul: DNA
- Paket: B4 (brief bangun penuh 19 Nov, thread T3)
- Flag: `module.dna` (sudah ada, lewat `requireSubmodule('dna')`) **dan flag baru `dna.development`** (default mati). Semua endpoint B4 di §6 (termasuk `PATCH /competencies/:id` yang dipasang di `dna/index.js`) memakai `requireFlag(flags, FLAGS.DNA_DEVELOPMENT)` lewat `b4Flag()`; impor kamus juga mengikuti flag (§7). Kolom opsional baru di `POST /competencies` dan `/competencies/bulk` tidak di balik flag karena aditif: klien lama tidak mengirimnya dan perilakunya tidak berubah; flag mati → 403 `FEATURE_DISABLED`, endpoint POC DNA tetap jalan. Layar `/dna` mengalihkan ke halaman POC `/m/dna` bila flag mati (§11).
- Migrasi: blok 04 → `20261119000400-dna-developmental-needs.js`
- Cakupan: API, domain, store, impor, test, dan layar Vue di atas B0 (`apps/web/src/screens/b4-dna`, rute `dna` di `/dna`). Sesi thread ini hanya boleh push ke satu branch, jadi B4, B16, dan layarnya berada di satu PR (#22) dengan commit terpisah.
- Reviewer wajib: Andrian (migrasi, `core/errors`, `core/flags`, kode impor bersama).
- Gerbang: `npm run lint`, `npm test`, `npm run build`, `npm run e2e`.

Sumber acuan:

- Mockup Pak Eji (final, 19 Nov): layar "Developmental Needs" (`s.dna`) di `Main.dc.html` (salinan di folder proyek `mockup-pak-eji/`; aslinya https://claude.ai/artifact/3pRkbt7pJexZqgnFsUGJud).
- Brief bangun penuh 19 Nov (`/mnt/project-files/elgos-eksekusi/brief-bangun-penuh-19nov.md`), bagian T3 dan default K1–K4.
- **B0** = `docs/designs/b0-fondasi-ui.md` (cangkang layar, menu, kontrak rute).
- Kode keputusan: **Q12** skala skor 0–4 (grilling BRD), **RG-3** visibilitas data karyawan, **R2-2** audit baca data individu, **F6-A** DNA = impor/bangun kamus + asesmen proaktif (formulir komersial Pak Eji 13 Nov). Log keputusan di `/mnt/project-files/ewi-grilling/`.
- `CLAUDE.md` repo ini (aturan arsitektur 1–7).

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

`20261119000400-dna-developmental-needs.js` (raw SQL, schema `ewi`, punya `down`).

(Ringkasan; DDL lengkap ada di file migrasi.)

- `lna_competencies` + kolom `code varchar(32)`, `stream varchar(64)`, `program_tier` (CHECK `basic|intermediate|advanced`). Kode hanya boleh pada kompetensi yang punya job role (CHECK) dan unik per `(tenant_id, job_role_id, lower(code))`.
- Tabel baru `lna_job_functions` (`tenant_id`, `job_role_id`, `fn_order` ≥ 1 unik per jabatan, `name` unik tanpa beda huruf per jabatan).
- Tabel baru `lna_job_function_competencies` (`tenant_id`, `job_function_id`, `competency_id`; PK pasangan, keduanya `ON DELETE CASCADE`).

Migrasi diawali `SET search_path TO "${S}"` seperti migrasi lain. `tenant_id` di tabel penghubung dijaga aplikasi (A12): job function dan kompetensi divalidasi satu tenant dan satu job role sebelum disisipkan.

`down` (semua `IF EXISTS`): tabel penghubung → `lna_job_functions` → indeks dan constraint kode → tiga kolom. Tidak ada migrasi lama yang diubah. Kolom baru nullable, jadi kamus POC yang sudah ada tetap valid; kompetensi tanpa `program_tier` tidak ikut kurikulum dan tahap (lihat aturan A4).

Tidak ada tabel untuk rencana pengembangan: rencana dihitung dari kamus dan asesmen terbaru setiap kali diminta, sama seperti gap di `dna/gap.js`.

## 5. Aturan bisnis

- **A1 Skala skor.** Skor dan target tetap skala 0–4 (keputusan Q12, kolom `score`/`required_score` yang ada). Mockup memakai angka 0–100 sebagai ilustrasi. Pak Eji belum menyatakan mengganti skala (status di §10); API mengembalikan `score` dan `target` apa adanya sehingga layar tidak bergantung pada skalanya.
- **A2 Asesmen terbaru.** Per karyawan × kompetensi dipakai asesmen terbaru (`assessedAt`, bila kosong `createdAt`). Tanggal sama (mis. impor koreksi bertanggal sama): yang dibuat paling akhir (`createdAt`) menang; store mengurutkan `created_at, id`. Fungsinya satu: `latestByCompetency` di `dna/gap.js`, dipakai `computeGap` dan B4.
- **A3 Status modul per pegawai.** Target = `requiredScore`; bila kosong dipakai `DEFAULT_TARGET` = 3 dari `dna/gap.js` (sama dengan gap individu).
  - `met` (Tercapai): skor ≥ target.
  - `develop` (Perlu dikembangkan): skor < target dan tingkat modul sama dengan atau di bawah tahap pegawai.
  - `locked` (Belum dibuka): skor < target dan tingkat modul di atas tahap pegawai.
  - `not_assessed` (Belum dinilai): belum ada asesmen.
  - `mastery` (Menguasai/Sebagian/Belum di brief). Konsumennya "Hasil saya" (B8); B4 hanya menyediakan nilainya: skor ≥ target → `mastered`; kurang tepat satu tingkat (target − skor = 1) → `partial`; kurang dua tingkat atau lebih → `not_yet`; `null` bila belum dinilai. Mockup memakai rasio ≥ 75% pada skala 0–100; pada skala 0–4 rasio itu hampir tidak pernah menghasilkan "Sebagian", jadi dipakai selisih tingkat. Target 0 selalu `mastered`.
  - Modul yang belum dinilai selalu `not_assessed`, juga bila tingkatnya di atas tahap pegawai (bukan `locked`).
- **A4 Tahap pengembangan** (mockup: "Tahap ditentukan oleh modul pada level terendah yang belum mencapai target"). **Himpunan modul pegawai** = kompetensi `kind = 'job'` milik job role pegawai yang punya `programTier`, dari **semua jenjang karier** (roadmap BIA mencakup seluruh jalur jabatan, seperti kolom Basic/Intermediate/Advanced di mockup). Kompetensi `core` dan kompetensi tanpa `programTier` tidak ikut; jumlah yang tanpa tingkat dilaporkan sebagai `untiered`. `met`, `assessed`, `total` hanya menghitung himpunan ini, jadi bisa berbeda dari `gap.summary` di `GET /dna/employees/:userId` (yang memakai kompetensi posisi + inti).
  - Tahap = tingkat terendah (basic → intermediate → advanced) yang punya minimal satu modul **sudah dinilai** dengan skor < target.
  - Bila tidak ada modul dinilai yang di bawah target dan minimal satu modul sudah dinilai → `done` (Tuntas).
  - Bila belum ada modul yang dinilai sama sekali → `not_assessed` (Belum dinilai). Mockup tidak punya kategori ini karena semua pegawai demo sudah dinilai; ditambahkan agar pegawai tanpa data tidak tampil sebagai "Tuntas".
  - Mengikuti mockup, modul yang belum dinilai tidak menahan tahap, jadi pegawai bisa `done` padahal baru sebagian kamus dinilai. Respons selalu menyertakan `assessed` dan `total` agar layar menampilkan "x / y modul dinilai" (risiko di §10).
- **A5 Fokus pengembangan** = kode modul pada tahap pegawai yang statusnya `develop` (kode kosong → nama).
- **A6 Saran rencana** (teks Indonesia, mengikuti mockup): tahap `done` → "Semua modul yang dinilai tercapai. Pertimbangkan peran mentor dan pemetaan ke jenjang karier."; `not_assessed` → "Belum ada hasil asesmen untuk pegawai ini."; selain itu "Fokus pada modul <Tingkat> yang belum tercapai: <kode>. Modul level berikutnya dibuka setelah semua modul <Tingkat> yang dinilai tercapai." ("yang dinilai" karena modul belum dinilai tidak menahan tahap, A4)
- **A7 Status kamus per jabatan.** `available` bila jabatan punya ≥ 1 kompetensi jabatan, selain itu `none`. Tool 1 = ada ≥ 1 job function; Tool 2 = ada ≥ 1 kompetensi jabatan; Tool 3 = ada ≥ 1 kompetensi dengan `programTier`. `approved` = jabatan punya ≥ 1 kompetensi dan semuanya sudah disahkan (`approved_at`); jabatan tanpa kompetensi → `false`. Kompetensi baru atau yang diubah (PATCH/impor) belum disahkan, sehingga `approved` kembali `false`; itu disengaja. `assessedCompetencyCount` = jumlah kompetensi jabatan yang sudah punya minimal satu asesmen (mockup: "7 dari 48 modul sudah memiliki data asesmen"); hitungan ini se-tenant, bukan per scope pemanggil, karena hanya agregat jumlah modul. Kamus yang belum disahkan tetap tampil dengan tanda "menunggu pengesahan HR", dan tahap serta rencana B4 tetap memakainya.
- **A8 Pengesahan kamus.** HR mengesahkan seluruh kamus satu jabatan sekaligus; hanya baris yang belum disahkan yang diubah (`approved_at`, `approved_by`). Tercatat di audit: aksi `update` pada `dna.dictionary` dengan meta `{ event: 'approve', jobRoleId, approved }` (kolom `audit_logs.action` dibatasi CHECK ke read/create/update/delete/export/login, jadi tidak ada aksi `approve`). Apakah Training Needs (B5) hanya memakai kompetensi yang sudah disahkan diputuskan di B5; B4 hanya menyediakan `approvedAt`.
- **A9 Visibilitas (RG-3).** Semua data per pegawai lewat `scopeFor()` → `visibleEmployeeScope()`: HR semua, atasan timnya, karyawan dirinya. Hitungan pegawai dan distribusi tahap di overview dihitung dari pegawai dalam scope pemanggil. Pegawai di luar scope → 404 (bukan 403), sama dengan `GET /dna/employees/:userId`.
- **A10 Peran.** Semua endpoint B4 butuh flag `dna.development`. Overview, kamus, kurikulum, dan daftar pegawai: `hr_admin` dan `supervisor` (menu mockup hanya untuk HR dan Atasan; `eta_admin` selalu lolos `requireRole`). Rencana pengembangan satu pegawai: semua peran, dibatasi scope (karyawan boleh melihat miliknya, dipakai B8). Menulis (job function, pemetaan, pengesahan): `hr_admin`.
- **A11 Audit baca (R2-2).** Daftar pegawai dan rencana per pegawai memanggil `audit.readIndividual` (`dna.development_needs`, `dna.development_plan`; `objectType: 'dna_development'`). Overview adalah agregat dan tidak dicatat untuk HR; untuk pemanggil yang scope-nya bukan `all` (atasan) distribusi tahap bisa setara data individu, jadi dicatat dengan `dna.development_overview` dan daftar pegawai yang dihitung.
- **A12 Tenant.** Semua query memfilter `tenant_id` dari `req.tenantId`. `:id` job role, job function, dan `competencyIds` di body divalidasi milik tenant (dan milik job role yang sama, `kind = 'job'`) sebelum dipakai: resource di path → 404, id di body atau query → 400. `jobRoleId`/`careerLevelId` di `POST /competencies` dan `/competencies/bulk` sudah dicek oleh `checkPositionIds` dari basis integrasi (e2d3707): 404 untuk `POST /competencies`, 400 per baris untuk bulk; B4 memakainya apa adanya. Id yang bukan UUID → 404 (path) atau 400 (body/query), bukan 500.
- **A13 Pegawai yang dihitung** = user peran `learner`, `supervisor`, `role_leader`, `sme` dengan `job_role_id` = jabatan terpilih, status bukan `disabled` (sama dengan `GET /dna/employees`).

## 6. Endpoint

Semua di bawah `/api/dna` (auth + tenant + `requireSubmodule('dna')` + `requireFlag('dna.development')`). Endpoint tulis job function dan `PATCH /competencies/:id` belum punya tombol di layar B4: itu **kontrak untuk B11** (Admin Tenant "Jabatan & kamus kompetensi") dan untuk koreksi data lewat API selama POC.

`dictionary` (status kamus A7) di respons = `{ status: 'available'|'none', tool1, tool2, tool3, competencyCount, approvedCount, approved, assessedCompetencyCount }`.

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

- `overview` tanpa `jobRoleId` memilih jabatan pertama (urut nama) yang punya kurikulum (≥ 1 kompetensi jabatan dengan `programTier`, Tool 3); bila tidak ada, jabatan pertama yang kamusnya `available` (kamus POC tanpa tingkat). Tujuannya: tenant yang punya kamus POC lama dan kamus DACUM baru langsung melihat kamus DACUM, bukan semua pegawai "Belum dinilai". Bila tidak ada jabatan berkamus, bila tidak ada, `selectedJobRoleId: null`, KPI nol, `stageDistribution` lima baris bernilai nol.
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
- Id di query dan body dibandingkan dalam huruf kecil, jadi UUID huruf besar diterima.
- `PUT /job-functions/:id/competencies` yang bentrok dengan penghapusan paralel (pelanggaran FK `23503`) → 409 `CONFLICT`.
- Kode ganda dalam satu jabatan, nomor atau nama job function ganda → 409 `CONFLICT`. Dicek sebelum menulis (termasuk di dalam satu batch `/competencies/bulk`), dan pelanggaran indeks unik Postgres (`23505`) yang lolos karena balapan juga dipetakan ke 409. `code` pada kompetensi tanpa `jobRoleId` → 400.
- Pesan galat berbahasa Indonesia lewat `core/errors` (ditambah helper `conflict`).

## 7. Impor

- **Flag.** Semua perubahan impor di bagian ini hanya berlaku bila `dna.development` menyala: jenis `dna_job_functions` dan kolom Kode/Rumpun/Level Program/Job Function memakai `flag`, sehingga dengan flag mati tidak tampil di template dan tidak bisa dipetakan; judul "Level" kembali ke Jenjang (`flagOffAliases`), dan baris yang sudah ada selalu ditolak seperti sebelum B4. Mekanismenya di `imports/index.js` (`kindView`).
- Jenis `dna_competencies` mendapat kolom opsional: **Kode** (`code`), **Rumpun** (`stream`), **Level Program** (`programTier`, memakai `TIER_CHOICES`), **Job Function** (`jobFunctions`, nomor JF dipisah titik koma, mis. `1; 3`; nomor harus sudah ada di jabatan itu, bila tidak seluruh baris ditolak). Kode ganda di file, atau kode yang sudah dipakai kompetensi lain di jabatan itu, ditolak per baris.
- **Melengkapi kamus yang sudah ada.** Baris yang kompetensinya sudah ada di kamus (kunci lama: job role + jenjang + nama) sebelumnya selalu ditolak. Sekarang: bila baris itu mengisi minimal satu kolom baru (Kode, Rumpun, Level Program, Job Function), kompetensi yang ada **diperbarui** hanya pada kolom baru yang terisi **dan nilainya berbeda** dari yang tersimpan (pemetaan job function diganti bila kolomnya terisi) dan pengesahannya direset bila ada kolom kompetensi yang berubah (pemetaan job function saja tidak mereset: pemetaan adalah Tool 1, bukan isi kompetensi yang disahkan; sama dengan `PUT /job-functions/:id/competencies`); bila tidak ada kolom baru yang terisi, atau semuanya sama dengan yang tersimpan tanpa kolom Job Function, ditolak "sudah ada di kamus (tidak ada perubahan)". Jadi mengimpor ulang file DACUM yang sama tidak mereset pengesahan. Hasil commit melaporkan `competencies` (baru) dan `updated`.
- Judul kolom `Level` dipetakan ke Level Program, karena di data DACUM dan mockup "Level" berarti Basic/Intermediate/Advanced. `TIER_CHOICES` (bersama, `imports/kinds/common.js`) mendapat sinonim `b`, `i`, `a`, dan `advance`; sinonim ini juga berlaku untuk jenis impor lain yang memakai tingkat program (status lulus program, jenjang, katalog). **File lama** yang memakai "Level" untuk jenjang karier tetap terbaca: nilai yang bukan tingkat B/I/A tetapi sama dengan nama jenjang job role itu, dan kolom Jenjang kosong, dibaca sebagai Jenjang. Nilai lain ditolak "Level Program harus basic, intermediate, atau advanced".
- Commit impor kompetensi menulis kompetensi lalu pemetaan job function baris demi baris tanpa satu transaksi (pola `commit` jenis impor lain yang sudah ada). Gagal di tengah meninggalkan sebagian baris. Mengimpor ulang file yang sama **tidak menggandakan** baris yang sudah masuk (kunci job role + jenjang + nama), tetapi baris itu ditolak "sudah ada di kamus" kecuali membawa kolom baru, jadi HR perlu membaca hasil validasi. Risiko di §10.
- Jenis baru `dna_job_functions` (label "Job function"): kolom **Job Role** (wajib, harus sudah ada), **No** (opsional, bilangan bulat ≥ 1; kosong = lanjut dari nomor terakhir), **Job Function** (wajib). Nomor atau nama ganda per jabatan ditolak. Diimpor sebelum kamus kompetensi, tetapi diletakkan di akhir `KINDS` agar nomor template yang sudah dibagikan ke HR tidak bergeser (aturan PK-18).
- Template XLSX klien di `/mnt/project-files/elgos-import-templates/` perlu dibuat ulang setelah PR ini masuk (bukan bagian PR; dicatat di deskripsi PR).

## 8. Keputusan default yang dipakai

- K2 (peran): peran teknis yang ada dipakai apa adanya (`hr_admin` = HR/L&D, `supervisor` = Atasan, `learner` = Karyawan). Penambahan peran dan ganti tampilan adalah milik B2.
- K1, K3, K4 tidak menyentuh paket ini.
- Q12 (skala 0–4), RG-3 (scope), R2-2 (audit baca), F6-A (DNA = impor/bangun kamus + asesmen proaktif).

## 9. Alternatif yang dipertimbangkan

| Keputusan | Dipilih | Ditolak | Alasan |
| --- | --- | --- | --- |
| Rencana pengembangan | dihitung saat diminta dari kamus + asesmen | tabel rencana yang disimpan | tidak ada data yang hanya hidup di rencana; sama dengan gap di `dna/gap.js`; tidak ada sinkronisasi ulang saat kamus berubah |
| Sumber tahap | skor asesmen | `lna_program_completions` (lulus program) | mockup menurunkan tahap dari modul di bawah target; lulus program adalah bukti B16 (§3) |
| Tempat tingkat BIA | kolom `program_tier` di `lna_competencies` | entitas "modul" terpisah | mockup menyamakan modul dengan kompetensi; gap, asesmen, dan impor yang ada tetap dipakai |
| Job function | tabel `lna_job_functions` + tabel pemetaan | kolom teks di kompetensi | satu kompetensi bisa di beberapa JF; nomor JF unik per jabatan butuh constraint |
| `mastery` | selisih tingkat (skala 0–4) | rasio ≥ 75% seperti mockup | pada skala 0–4 rasio hampir tidak pernah menghasilkan "Sebagian" (A3) |
| Flag | flag baru `dna.development` | hanya `module.dna` | B4 mengubah perilaku tenant yang sudah memakai DNA (layar `/dna`, arti kolom impor "Level", impor memperbarui baris lama); aturan arsitektur 3 |
| Tenant di tabel pemetaan | cek aplikasi (A12) | FK komposit `(tenant_id, id)` | tabel lama belum punya kunci unik komposit; menambahkannya menyentuh migrasi lama |

## 10. Asumsi dan risiko

Satu-satunya daftar status terbuka spek ini.

- `[⚠️ BELUM TERVERIFIKASI]` **A1 skala.** Skala 0–4 (Q12) vs angka 0–100 di mockup. Pemicu: file DACUM Mas Abdan (26 Nov) dan jawaban Pak Eji. Pemilik: Andrian (keputusan skema), Pak Eji (keputusan produk). Bila skala berubah, CHECK `score`/`required_score` dan A3 ikut berubah.
- `[⚠️ BELUM TERVERIFIKASI]` Data DACUM Mas Abdan punya kode modul, rumpun, tingkat BIA, dan pemetaan job function seperti di mockup, dan seluruh modul kurikulum (48 di mockup) hadir sebagai baris kompetensi. Semua kolom itu opsional sehingga data tanpa kolom tersebut tetap bisa diimpor.
- `[⏳ DITERIMA]` **A4 cakupan sebagian.** Pegawai bisa `done` padahal baru sebagian modul dinilai; layar menampilkan "Baru x dari y modul yang dinilai". Pertanyaan terbuka untuk Pak Eji. Test: unit "done dengan cakupan sebagian".
- `[⏳ DITERIMA]` Rencana dihitung saat diminta (N pegawai × M modul di memori). POC satu jabatan ±50 × ±50 kecil; tidak ada test beban.
- `[⏳ DITERIMA]` **Impor tanpa transaksi.** Commit impor kompetensi tidak bertransaksi dan pelanggaran indeks unik yang lolos karena balapan (dua impor bersamaan) menjadi 500 untuk seluruh commit, bukan penolakan satu baris. HR tunggal per tenant pada POC; pola sama dengan jenis impor lain. Pemicu peninjauan: impor paralel atau lebih dari satu admin HR.
- `[⏳ DITERIMA]` **Pengesahan tanpa versi.** "Sahkan kamus" mengesahkan semua baris yang belum disahkan saat itu, tanpa daftar id atau versi dari layar. Satu admin HR per tenant pada POC.
- `[⏳ DITERIMA]` **Penulisan kamus tidak diaudit.** Modul DNA saat ini tidak mengaudit penulisan kamus (`POST /competencies`, impor); B4 mengikuti, hanya pengesahan yang diaudit (A8). Keputusan tingkat modul untuk Andrian.
- `[⏳ DITERIMA]` Dua `POST job-functions` tanpa nomor bersamaan: satu mendapat 409 (cukup ulangi).
- `[⏳ DITERIMA]` Tidak dites otomatis: jalur 23505 balapan, `careerLevelId` lintas jabatan di impor, pengguna nonaktif di daftar pegawai.
- `[⏳ DITERIMA]` Peran tampilan `atasan` di B0 mencakup `role_leader` dan pimpinan, sedangkan API B4 hanya `hr_admin` dan `supervisor`. Layar mengalihkan peran lain ke halaman POC (§11). Konstanta peran bersama di `core/rbac` ditunda karena menyentuh B5/B9.

## 11. Layar (di atas B0)

- Rute `dna` (`/dna`) memakai `meta.views` kelima tampilan (`hr`, `atasan`, `karyawan`, `admin`, `super`) sesuai aturan B0 nomor 6, sehingga butir menu peralihan karyawan tetap ada. `beforeEnter` memanggil `b4Open()`: layar B4 hanya dibuka bila flag `dna.development` menyala, akun punya peran `hr_admin`/`supervisor`/`eta_admin`, dan tampilan aktif `hr`/`atasan`/`super`. Selain itu diarahkan ke `dna-poc`.
- `dna-poc` (`/m/dna`, `views/DnaView.vue`, `menuKey: 'dna'`) adalah halaman POC lama (impor, gap per karyawan, mulai wawancara). Pemiliknya `screens/b4-dna/routes.ts`; dihapus saat B8 (`my`, hasil karyawan) dan B11 (`cfg`, impor) terpasang. Tautan "Buka" di Beranda tetap ke `/m/dna`.
- Empat tab mockup: Ringkasan, Kamus kompetensi (job function sebagai tombol filter, segmen level), Kurikulum BIA, Kebutuhan pegawai (tabel + rencana). Label status modul: Tercapai, Perlu dikembangkan, Belum dibuka, Belum dinilai. Chip jabatan: Kamus tersedia / Belum tersedia.
- Tambahan di luar mockup: tombol "Sahkan kamus" untuk HR (A8) dan catatan cakupan (A4): "Baru x dari y modul yang dinilai" di kartu rencana, dan "dinilai x dari y" di tabel pegawai bila belum semua modul dinilai.
- Kartu "Agen AI · Validasi kamus kompetensi" tidak dibangun (§2, milik B6/B10).

## 12. Test

- `apps/api/tests/unit/dna-development.test.js`: tahap terendah, `not_assessed`, cakupan sebagian, status modul (`met`/`develop`/`locked`/`not_assessed`), modul basic belum dinilai tidak menahan, asesmen terbaru, `mastery`, `untiered`, fokus dan saran, fokus memakai nama, distribusi lima baris, status kamus (A7).
- `apps/api/tests/unit/dna-domain.test.js`: `latestByCompetency` (A2) tanggal sama.
- `apps/api/tests/unit/imports.test.js`: judul "Level" → Level Program; file lama "Level" = jenjang; kolom baru dan alasan penolakan; kompetensi yang ada diperbarui/ditolak; impor ulang nilai sama ditolak tanpa reset, hanya JF → patch kosong; jenis `dna_job_functions`.
- `apps/api/tests/integration/dna-development.test.js` (Postgres): flag `dna.development` mati → 403 dan POC tetap jalan; alur HR (jabatan, kamus berkode, job function); 409/400; tenant lain; ubah pemetaan dan PATCH, peran lain tidak boleh menulis; kamus berfilter dan kurikulum (termasuk UUID huruf besar); pengesahan + audit; tahap/daftar/rencana; visibilitas; ringkasan; jabatan default berkurikulum; audit baca; PATCH mereset pengesahan; `module.dna` mati.
- `apps/api/tests/integration/imports.test.js`: alur impor job function lalu kamus berkode; flag mati → impor seperti sebelum B4.
- `apps/web/e2e/b4-dna.spec.ts`: HR (ringkasan, kamus + filter + pengesahan, kurikulum, cakupan di tabel, rencana); atasan tanpa tombol pengesahan dan petunjuk tanpa kamus; flag mati → `/m/dna`; karyawan → `/m/dna`. `e2e/shell.spec.ts` (milik B0) memeriksa menu karyawan.
- Tidak dites: lihat §10.
- CI menjalankan migrasi naik-turun-naik.

## 13. Perubahan file

(B) baru, (U) ubah, (H) hapus.

- (B) `apps/api/migrations/20261119000400-dna-developmental-needs.js`
- (B) `apps/api/src/modules/dna/development.js` (domain murni)
- (B) `apps/api/src/modules/dna/development-routes.js` (endpoint §6, di balik flag)
- (U) `apps/api/src/modules/dna/gap.js` (ekspor `latestByCompetency`, `DEFAULT_TARGET`)
- (U) `apps/api/src/modules/dna/index.js` (pasang router, field baru kompetensi)
- (U) `apps/api/src/db/lna-stores.js` (kolom baru, job function, pengesahan, `tieredCount`)
- (U) `apps/api/src/core/errors/index.js` (helper `conflict`)
- (U) `apps/api/src/core/flags/index.js` (`DNA_DEVELOPMENT`)
- (U) `apps/api/src/modules/imports/kinds/competencies.js`, `common.js` (sinonim tingkat), `index.js`
- (B) `apps/api/src/modules/imports/kinds/job-functions.js`
- (B) `apps/api/tests/unit/dna-development.test.js`, `apps/api/tests/integration/dna-development.test.js`
- (U) `apps/api/tests/unit/imports.test.js`, `apps/api/tests/integration/imports.test.js`
- (B) `apps/web/src/screens/b4-dna/routes.ts`, `api.ts`, `DevelopmentNeedsView.vue`
- (H) `apps/web/src/screens/legacy-dna/routes.ts`
- (B) `apps/web/e2e/b4-dna.spec.ts`
- (U) `apps/api/src/modules/imports/index.js` (jenis/kolom impor mengikuti flag)
- (U) `docs/ewi/poc-dna-tna.md` (tautan ke spek ini), `docs/designs/b0-fondasi-ui.md` (catatan rute `dna`), `docs/designs/b18-e2e-qa-malam.md` (baris alur QA B4/B16)

## Lampiran A. Riwayat review

Status terbuka hanya di §10; lampiran ini catatan sejarah.

**Review spek ikan mas (19 Nov, sebelum plugin egm terpasang).** 20 temuan; diperbaiki: jalan melengkapi/koreksi kamus, `mastery` skala 0–4, himpunan modul pegawai, input kosong/tidak valid, bentrok unik → 409, alias "Level", sinonim B/I/A, kode tanpa job role, tiga "tier", audit overview atasan, kasus tepi pengesahan, bentuk respons, validasi tenant `POST /competencies`, nama JF unik, `assessedCompetencyCount`, detail migrasi, reviewer dan gerbang. Ditolak: spek di `docs/ewi/tickets/` (brief aturan 11 menetapkan `docs/designs/`), tabel contoh A3/A5/A6 (ada sebagai test unit). Penolakan flag baru dibatalkan oleh review egm (R1).

**Review diff ikan mas (19 Nov).** 14 temuan; diperbaiki: impor kompetensi non-jabatan dan sel JF tanpa nomor, `PATCH /competencies` 500, nomor JF 1–999, JF terhapus paralel, `Object.hasOwn`, subquery pemetaan memfilter tenant, UUID huruf besar, overview lima baris nol, test tambahan. Sisa yang ditunda pindah ke §10.

**Review egm (19 Nov, plugin `egm`, tahap 5–9).** Laporan: `docs/designs/egm-review/b4/` (zoom-out, comprehension, critic, intermediate zoom-out, implementation readiness) dan triase egm-resolve di `goldfish_review_report.md`. Diterapkan: flag `dna.development` dan pengalihan layar (R1, R2, R4), alternatif (R3), jabatan default berkurikulum (R5), teks saran (R6), satu fungsi asesmen terbaru (R7), struktur spek (R8, R9), kalimat impor ulang (R10), label kontrak B11 (R14), sumber acuan (R15), daftar test (R16), tanda B/U/H (R17), pemilik `dna-poc` (R18). Eskalasi: skala 0–4 (R11). Ditolak dengan catatan di §10: pengesahan berversi (R12), audit penulisan kamus (R13).

**Review diff (19 Nov, agen egm + `mattpocock-skills:code-review`).** Triase di `docs/designs/egm-review/diff-review-triage.md`: impor di balik flag, impor ulang tanpa reset, UUID huruf besar, seri A2, cakupan di tabel, catatan §6.

**Cek drift.** 19 Nov manual (sebelum plugin terpasang); setelah review egm dijalankan ulang dengan skill `egm-drift-report`, laporan di `docs/designs/egm-review/`.
