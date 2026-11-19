# B11 · Admin Tenant

Status: draf spek, ditulis sebelum kode (prinsip egm). Paket T6 pada brief bangun penuh 19 Nov 2026.

## 1. Tujuan

Admin sebuah perusahaan klien (tenant) menyiapkan sendiri organisasinya di ELGOS tanpa bantuan tim ETA dan tanpa SQL:

1. mengelola akun dan peran (undang, ubah peran, jabatan, status);
2. melihat daftar jabatan beserta status kamus kompetensinya;
3. mengimpor model kompetensi (hasil DACUM, per jabatan) dan data KPI/OKR (per periode), dan melihat status integrasi pembelajaran.

Paket ini adalah lanjutan PK-13 (PR #9, onboarding tenant lewat skrip): skrip membuat tenant dan akun pengelola pertama, lalu admin tenant meneruskan dari layar. B12 (Super Admin, thread T2) menumpuk di atas paket ini.

Yang **bukan** tujuan: membuat tenant (B12), mengubah flag atau entitlement (hanya Admin ETA, R2-1), menghapus jabatan atau akun secara permanen, parser khusus berkas DACUM Tool 1–3.

## 2. Layar mockup yang dicakup

Mockup Pak Eji, peran "Admin Tenant", tiga menu (`project/Main.dc.html`, blok `ADMIN TENANT: PENGGUNA`, `JABATAN`, `IMPOR`):

| Menu | Isi di mockup | Yang dibangun |
| --- | --- | --- |
| Pengguna & peran | chip jumlah pengguna, chip "SSO aktif", tombol "Undang pengguna", tabel Nama, Email, Peran, Jabatan, Status | Sama. Chip SSO hanya tampil bila flag `em.sso` menyala. Tambahan yang tidak ada di mockup tetapi perlu agar layar berguna: ubah peran, ubah jabatan, nonaktifkan/aktifkan, kirim ulang undangan |
| Jabatan & kamus kompetensi | tabel Jabatan, Kamus (Tersedia/Belum tersedia), Kompetensi (jumlah), Pegawai (jumlah), Sumber | Sama, dari data tenant. Tambah jabatan baru (nama, divisi) |
| Impor data & integrasi | kartu "1. Model kompetensi" (DACUM xlsx per jabatan, status Terimpor), kartu "2. KPI dan OKR" (per periode), kartu "Integrasi pembelajaran" (EliteMentor, LMS perusahaan) | Sama. Kartu impor memakai alur impor yang sudah ada (unggah, petakan kolom, pratinjau, simpan). Tiap berkas menampilkan sumber dan waktu unggah |

Data demo mockup ("Karyawan A", "Elitery", nama jabatan ilustratif, catatan "contoh ilustratif") tidak dibawa; layar memakai data tenant.

## 3. Aturan dan keputusan yang dirujuk

- CLAUDE.md aturan arsitektur 1–7.
- K2 (default brief): lima peran mengikuti mockup, yaitu HR/L&D, Atasan, Karyawan, Admin Tenant, Super Admin (= Admin ETA). Peran dan multi-peran dibangun paket B2 (thread T2), bukan di sini.
- R2-1: flag hanya diubah Admin ETA. Paket ini tidak menyentuh flag tenant.
- R3-2: akun tanpa kata sandi, masuk lewat link email; undangan berlaku 7 hari.
- R3-3: alur impor berkas (unggah → petakan → pratinjau → simpan), baris mentah dihapus setelah disimpan.
- R2-2: perubahan dicatat di audit log; pencatatan gagal berarti request gagal.
- K4: EliteMentor lewat API OAuth2 + webhook HMAC; bila klien tidak memakai EliteMentor, ekspor gap ke LMS.
- PK-13: akun pengelola pertama dibuat skrip onboarding dengan peran `hr_admin`.

## 4. Akses

### 4.1 Flag

Flag baru `admin.tenant` (konstanta `FLAGS.TENANT_ADMIN`), default mati. Semua endpoint paket ini mengembalikan 403 `FEATURE_DISABLED` bila flag mati. Endpoint ini bukan submodul berbayar, jadi tidak lewat `requireSubmodule()`; gerbangnya `requireFlag(flags, FLAGS.TENANT_ADMIN)`.

### 4.2 Peran

Satu fungsi `isTenantAdmin(user)` di `src/modules/tenant-admin/access.js` menjadi satu-satunya tempat aturan peran:

- `eta_admin` lolos (Super Admin, konsisten dengan `requireRole`);
- peran `tenant_admin` lolos (peran ini belum ada di `ROLES` dan belum diizinkan CHECK kolom `users.role`; B2 yang menambahkannya);
- `hr_admin` lolos **sementara**. `[⏳ DITERIMA]` Alasan: sampai B2 masuk, tidak ada akun yang bisa berperan `tenant_admin`, sedangkan PK-13 membuat pengelola tenant sebagai `hr_admin`, dan mockup menyebut Admin Tenant "juga HR". Setelah B2 masuk, `hr_admin` dicabut dari fungsi ini (satu baris) kecuali user memutuskan lain. Test yang dijadwalkan: `tenant-admin.test.js › hr_admin lolos sementara` diubah menjadi menolak pada PR lanjutan B2.
- bila B2 memakai daftar `user.roles`, fungsi ini juga membaca daftar itu.

Paket ini **tidak** mengubah `core/rbac/roles.js` dan tidak mengubah CHECK `users.role`, supaya tidak bertabrakan dengan migrasi B2.

### 4.3 Batas dalam tenant

- Semua query memfilter `tenant_id = req.tenantId`. Id dari URL atau body (user, jabatan, atasan, batch) selalu dicari ulang dalam tenant itu; yang tidak ketemu dijawab 404.
- Admin tenant tidak bisa memberi atau mencabut peran `eta_admin`, dan tidak bisa mengubah akun yang berperan `eta_admin` (403 `ROLE_FORBIDDEN`). Akun `eta_admin` tetap tampil di daftar agar jumlah pengguna jujur.
- Admin tenant tidak bisa mengubah peran atau status akunnya sendiri (409 `SELF_CHANGE`), supaya tenant tidak kehilangan pengelola karena salah klik.
- Peran yang boleh diberikan: semua isi `ALL_ROLES` kecuali `eta_admin` (jadi `tenant_admin` ikut otomatis setelah B2).

## 5. Data dan migrasi

**Tidak ada migrasi.** Blok 11 (`20261119001100`–`99`) tidak terpakai. Semua kebutuhan sudah ada:

- `users` (role, status `invited|active|disabled`, `job_role_id`, `career_level_id`, `supervisor_id`, `last_login_at`);
- `lna_job_roles`, `lna_career_levels`, `lna_competencies` (kolom `source`);
- `import_batches` (kolom `options` jsonb, `filename`, `created_at`, `created_by`, `result`);
- `login_links` untuk undangan;
- `tenants.elitementor_organization_id`, `tenants.settings`.

"Sumber" dan jabatan sebuah impor disimpan di `import_batches.options` (`source`, `jobRoleId`), jadi tidak butuh kolom baru.

## 6. Endpoint

Semua di bawah `/api/tenant-admin`, setelah `auth` + `tenantContext()`, lalu `requireFlag(admin.tenant)`, lalu `requireTenantAdmin`. Bentuk jawaban mengikuti konvensi repo: `{ data }`, galat `{ error: { code, message } }`, pesan bahasa Indonesia.

### 6.1 Pengguna & peran

| Method + path | Body | Jawaban | Catatan |
| --- | --- | --- | --- |
| `GET /users` | query `q?`, `status?` | `{ data: [{ id, name, email, employeeId, role, jobRoleId, jobRoleName, careerLevelId, supervisorId, status, lastLoginAt }], meta: { total, sso } }` | `sso` = flag `em.sso`. Maksimal 2.000 baris, urut nama |
| `GET /roles` | – | `{ data: [{ key, label }] }` | Peran yang boleh diberikan + label Indonesia |
| `POST /users` | `{ email, name, role, employeeId?, jobRoleId?, careerLevelId?, supervisorId? }` | 201 `{ data: user, invited: true }` | Membuat akun `invited` lalu mengirim undangan (link 7 hari). Email dinormalkan huruf kecil. Email atau ID karyawan yang sudah ada → 409 `DUPLICATE` |
| `PATCH /users/:id` | subset `{ name, role, employeeId, jobRoleId, careerLevelId, supervisorId, status }` | `{ data: user }` | `status` hanya `active` atau `disabled`. Lihat aturan 4.3 |
| `POST /users/:id/invite` | – | 201 `{ data: { sent: true } }` | Kirim ulang undangan. Hanya untuk akun `invited` (selain itu 409 `INVALID_STATE`). Maksimal 3 link per 15 menit per akun (batas yang sama dengan link masuk) → 429 `RATE_LIMITED` |

Validasi: `role` harus peran yang boleh diberikan; `jobRoleId` harus jabatan tenant; `careerLevelId` harus jenjang jabatan itu; `supervisorId` harus akun tenant, bukan dirinya; email berformat valid, maksimal 320 karakter; nama maksimal 255.

Urutan `POST /users`: simpan akun dulu, lalu kirim undangan. Bila pengiriman email gagal, akun tetap ada (status `invited`), jawaban 201 dengan `invited: false` dan pesan agar admin memakai "kirim ulang". Alasannya: undangan bisa diulang, sedangkan akun ganda tidak boleh.

Menonaktifkan akun (`status: disabled`): akun tidak bisa masuk lagi (login dan tukar link sudah menolak `disabled`). `[⏳ DITERIMA]` Token JWT yang sudah terbit tetap berlaku sampai kedaluwarsa (maksimal 8 jam); pencabutan sesi adalah lingkup PK-16/B1. Dicatat di PR.

Audit: `create user`, `update user` (dengan `from`/`to` hanya untuk kolom yang berubah), `create invitation`. Resource `tenant_admin.user` dan `tenant_admin.invitation`, meta memuat `employeeIds: [id]`.

### 6.2 Jabatan & kamus kompetensi

| Method + path | Body | Jawaban |
| --- | --- | --- |
| `GET /job-roles` | – | `{ data: [{ id, name, division, description, levels: [...], competencyCount, employeeCount, dictionary: 'tersedia' \| 'belum_tersedia', sources: ['dacum', ...], lastImport: { filename, at } \| null }] }` |
| `POST /job-roles` | `{ name, division?, description?, levels?: [{ name, programTier? }] }` | 201 `{ data: jobRole }`; nama kembar (tanpa beda huruf besar/kecil) → 409 `DUPLICATE` |
| `PATCH /job-roles/:id` | subset `{ name, division, description }` | `{ data: jobRole }` |
| `GET /job-roles/:id/competencies` | – | `{ data: [kompetensi] }` (bentuk sama dengan `GET /dna/competencies`) |

- `dictionary` = `tersedia` bila jabatan punya minimal satu kompetensi.
- `employeeCount` = akun tenant yang tidak `disabled` dengan `job_role_id` itu.
- `sources` = nilai `source` berbeda dari kompetensi jabatan itu. `lastImport` = batch `dna_competencies` terakhir berstatus `committed` yang `options.jobRoleId`-nya jabatan itu.
- Kolom "Sumber" di layar: nama berkas `lastImport` bila ada; bila tidak, label dari `sources` (mis. "DACUM"); bila kamus kosong, "Belum ada kamus".
- Menghapus jabatan tidak disediakan (menghapus akan ikut menghapus kamus lewat `ON DELETE CASCADE`).

Audit: `create`/`update` resource `tenant_admin.job_role`.

### 6.3 Impor data & integrasi

| Method + path | Jawaban |
| --- | --- |
| `GET /imports/summary` | `{ data: { competencyModel: [...], performance: [...], integrations: {...} } }` |
| `/imports/dna/...` dan `/imports/tna/...` | Router impor yang sudah ada (`importRouter`), dengan gerbang peran diganti `requireTenantAdmin` |

`competencyModel`: satu baris per jabatan, `{ jobRoleId, jobRoleName, competencyCount, status: 'terimpor' | 'belum', lastImport: { batchId, filename, source, uploadedAt, uploadedByName, imported } | null }`.

`performance`: satu baris per periode, `{ period, records, missed, lastImport: { batchId, filename, source, uploadedAt, uploadedByName } | null }`. `records` dan `missed` dihitung dari `lna_performance_records` (agregat, tanpa nama karyawan). Batch dicocokkan lewat `options.period`.

`integrations`:

```json
{
  "elitementor": { "status": "tersambung | belum_dikonfigurasi", "organizationMapped": true, "sso": false, "webhookSync": false },
  "lms": { "targets": ["elitementor"], "gapExport": true }
}
```

- `status = tersambung` bila konfigurasi server punya `baseUrl`, `tokenUrl`, `clientId`, `clientSecret` **dan** tenant punya `elitementor_organization_id`. Hanya boolean yang dikirim; nilai secret, URL, dan id organisasi tidak pernah dikirim.
- `sso` = flag `em.sso`, `webhookSync` = flag `em.webhook_sync`.
- `lms.targets` dari `settings.lms.targets`. `gapExport` selalu `true` sebagai keterangan K4 ("LMS perusahaan: ekspor gap bila EliteMentor tidak dipakai"); fitur ekspornya milik B8/B13, tidak dibangun di sini.
- `[⚠️ BELUM TERVERIFIKASI]` "Tersambung" berarti terkonfigurasi, bukan hasil uji panggil ke EliteMentor. Uji sambungan sungguhan butuh kontrak FR-EM yang belum ada (`integrations/elitementor/client.js` belum punya endpoint). Label di layar: "Terkonfigurasi".

Perubahan pada modul impor (kode bersama, perlu review Andrian):

1. `importRouter({ submodule, stores, audit, guard })`: parameter baru `guard` (middleware). Default tetap `requireRole(HR_ADMIN)`, jadi rute `/api/dna/imports` dan `/api/tna/imports` tidak berubah perilakunya.
2. Jenis `dna_competencies`: opsi baru `jobRoleId` (jabatan untuk baris yang kolom Job Role-nya kosong) dan `source` (sumber untuk baris yang kolom Sumber-nya kosong; default tetap `hr_rule`). Layar admin mengisi `jobRoleId` dari jabatan yang dipilih dan `source = dacum`. Ini yang membuat impor "per jabatan".
3. Jenis `tna_performance`: opsi baru `source` (teks bebas maksimal 64 karakter, mis. "HRIS", "HappyFive", "Berkas"). Hanya disimpan di `import_batches.options`; kolom `lna_performance_records.source` tidak diubah.
4. Store baru `imports.listCommitted(tenantId, kinds)` untuk ringkasan.

Gerbang tambahan untuk rute impor admin: jenis impor sebuah submodul (`dna`, `tna`) hanya terbuka bila tenant punya **entitlement** submodul itu. Flag `module.dna`/`module.tna` tidak disyaratkan, karena admin menyiapkan data sebelum modul dinyalakan saat Go/No-Go. Tanpa entitlement → 403 `NOT_ENTITLED`.

`[⚠️ BELUM TERVERIFIKASI]` Bentuk berkas DACUM Tool 1–3 yang asli belum pernah dilihat (data Mas Abdan masuk 26 Nov). Paket ini memakai template kamus kompetensi ELGOS yang ada; langkah "petakan kolom" menangani judul kolom yang berbeda. Parser khusus DACUM (bila bentuknya bukan tabel datar) menjadi lingkup B4 (thread T3).

## 7. Perubahan web

Menumpuk di atas PR B0 (fondasi UI, thread T1) setelah terbuka; sebelum itu hanya backend. Tiga view baru di `apps/web/src/views/admin/`: `UsersView.vue`, `JobRolesView.vue`, `ImportIntegrationView.vue`, memakai komponen B0 (tabel data, chip, tombol, ringkasan galat) dan `ImportPanel.vue` yang ada. Rute `/admin/pengguna`, `/admin/jabatan`, `/admin/impor`, tampil di menu hanya bila `flags['admin.tenant']` dan peran lolos 4.2. E2E `apps/web/e2e/admin-tenant.spec.ts` dengan API mock.

## 8. Test yang ditulis (test-first)

`apps/api/tests/unit/tenant-admin.test.js` (tanpa DB, store in-memory):

- flag mati → 403 `FEATURE_DISABLED` untuk semua rute;
- `learner`, `supervisor`, `pimpinan` → 403; `hr_admin` lolos sementara; `eta_admin` lolos; `tenant_admin` lolos (token buatan);
- validasi body `POST /users` dan `PATCH /users/:id`;
- tidak bisa memberi `eta_admin`; tidak bisa mengubah akun `eta_admin`; tidak bisa mengubah peran/status sendiri.

`apps/api/tests/integration/tenant-admin.test.js` (Postgres):

- undang pengguna: akun `invited` dibuat, email undangan terkirim (mailer memory), audit tercatat; email kembar → 409;
- kirim ulang undangan: hanya untuk `invited`; batas 3 per 15 menit;
- ubah peran, jabatan, jenjang, atasan, status; nonaktif → tidak bisa login;
- isolasi tenant: admin tenant A tidak melihat dan tidak bisa mengubah user, jabatan, atau batch tenant B (404), dan `jobRoleId`/`supervisorId` milik tenant B ditolak;
- daftar jabatan: jumlah kompetensi, jumlah pegawai, status kamus, sumber;
- impor kamus per jabatan lewat `/tenant-admin/imports/dna/dna_competencies` dengan opsi `jobRoleId` + `source`, lalu ringkasan menampilkan berkas, sumber, waktu;
- impor KPI per periode dengan opsi `source`, ringkasan per periode;
- tanpa entitlement `tna` → rute impor tna 403 `NOT_ENTITLED`;
- status integrasi tidak membocorkan secret;
- rute lama `/api/dna/imports` tetap hanya untuk HR (regresi).

`apps/api/tests/unit/imports.test.js`: opsi baru `jobRoleId`/`source` pada kedua jenis.

## 9. Checklist perubahan file

- [ ] `docs/designs/b11-admin-tenant.md` (spek ini)
- [ ] `apps/api/src/core/flags/index.js`: flag `admin.tenant`
- [ ] `apps/api/src/modules/tenant-admin/access.js`: `isTenantAdmin`, `requireTenantAdmin`, peran yang boleh diberikan
- [ ] `apps/api/src/modules/tenant-admin/index.js`: router (pengguna, jabatan, impor, integrasi)
- [ ] `apps/api/src/db/tenant-admin-stores.js`: query pengguna, jabatan, ringkasan impor
- [ ] `apps/api/src/db/stores.js`: pasang store `tenantAdmin`
- [ ] `apps/api/src/db/lna-stores.js`: `imports.listCommitted`
- [ ] `apps/api/src/app.js`: pasang `/api/tenant-admin`
- [ ] `apps/api/src/modules/imports/index.js`: parameter `guard`
- [ ] `apps/api/src/modules/imports/kinds/competencies.js`: opsi `jobRoleId`, `source`
- [ ] `apps/api/src/modules/imports/kinds/performance.js`: opsi `source`
- [ ] `apps/api/tests/unit/tenant-admin.test.js`
- [ ] `apps/api/tests/integration/tenant-admin.test.js`
- [ ] `apps/api/tests/unit/imports.test.js`
- [ ] `apps/web/src/views/admin/*.vue`, `apps/web/src/api/tenantAdmin.ts`, rute, `apps/web/e2e/admin-tenant.spec.ts` (setelah B0)

## 10. Asumsi dan risiko yang tersisa

| Tanda | Isi | Ditutup oleh |
| --- | --- | --- |
| ⏳ | `hr_admin` berlaku sebagai admin tenant sampai B2 menambah peran `tenant_admin` | PR lanjutan setelah B2 |
| ⏳ | Token akun yang dinonaktifkan masih berlaku sampai kedaluwarsa | PK-16/B1 (sesi) |
| ⚠️ | Bentuk berkas DACUM asli belum dilihat | Data Mas Abdan 26 Nov, B4 |
| ⚠️ | "Tersambung" EliteMentor = terkonfigurasi, belum uji panggil | Kontrak FR-EM |
