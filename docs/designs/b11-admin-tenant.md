# B11 · Admin Tenant

Status (19 Nov 2026): backend dan web sudah dibangun di PR #17 dan sesuai spek ini. egm-review penuh (tahap 5–9), review diff, dan triasenya ada di bagian 14 dan `docs/designs/egm-review/`.

Istilah dan tanda:

| Istilah | Arti |
| --- | --- |
| Admin Tenant, pengelola | Orang yang lolos `isTenantAdmin` (4.2): saat ini `tenant_admin`, `eta_admin`, dan sementara `hr_admin` |
| `tenant_admin` | Kunci peran Admin Tenant yang ditambahkan B2 |
| Super Admin | `eta_admin` (Admin ETA) |
| K2, R2-x, R3-x, PK-xx | Kode keputusan di brief bangun penuh 19 Nov dan audit 17 Nov (`/mnt/project-files/elgos-eksekusi/`) |
| Aturan 3 | CLAUDE.md: endpoint submodul dipasang lewat `requireSubmodule()` (entitlement + flag) |
| Kill switch | Saklar darurat global per flag milik Admin ETA (`flags.setKillSwitch`); menang atas flag tenant |
| DNA / TNA | Developmental Needs Analysis / Training Needs Analysis, dua submodul Learning Needs Analysis |
| ⚠️ / ⏳ | Asumsi yang belum diputuskan / risiko yang diterima sementara; masing-masing punya baris di bagian 10 |

## 1. Tujuan

Admin sebuah perusahaan klien (tenant) menyiapkan sendiri organisasinya di ELGOS tanpa bantuan tim ETA dan tanpa SQL:

1. mengelola akun dan peran (undang, ubah peran, jabatan, status);
2. melihat daftar jabatan beserta status kamus kompetensinya;
3. mengimpor model kompetensi (hasil DACUM, per jabatan) dan data KPI/OKR (per periode), dan melihat status integrasi pembelajaran.

Paket ini adalah lanjutan PK-13 (PR #9, onboarding tenant lewat skrip): skrip membuat tenant dan akun pengelola pertama, lalu admin tenant meneruskan dari layar. B12 (Super Admin) menumpuk di atas paket ini.

Yang **bukan** tujuan: membuat tenant (B12), mengubah flag atau entitlement (hanya Admin ETA, R2-1), menghapus jabatan atau akun secara permanen, parser khusus berkas DACUM Tool 1–3.

## 2. Layar mockup yang dicakup

Mockup Pak Eji (final 19 Nov, artifact https://claude.ai/artifact/3pRkbt7pJexZqgnFsUGJud; berkas `project/Main.dc.html` di dalamnya), peran "Admin Tenant", tiga menu (blok `ADMIN TENANT: PENGGUNA`, `JABATAN`, `IMPOR`):

| Menu | Isi di mockup | Yang dibangun |
| --- | --- | --- |
| Pengguna & peran | chip jumlah pengguna, chip "SSO aktif", tombol "Undang pengguna", tabel Nama, Email, Peran, Jabatan, Status | Sama. Chip SSO berarti SSO perusahaan (flag `auth.sso`, paket B1); selama flag itu belum ada, chip disembunyikan (`meta.sso = false`). Peran diisi saat mengundang (mockup: "diatur setelah menerima undangan"; diisi di depan agar akun tidak pernah tanpa peran). Tambahan yang tidak ada di mockup tetapi perlu agar layar berguna: ubah peran, ubah jabatan, nonaktifkan/aktifkan, kirim ulang undangan |
| Jabatan & kamus kompetensi | tabel Jabatan, Kamus (Tersedia/Belum tersedia), Kompetensi (jumlah), Pegawai (jumlah), Sumber | Sama, dari data tenant. Tambah jabatan baru (nama, divisi; API juga menerima jenjang dengan tingkat program Basic/Intermediate/Advanced, isian layar menyusul) |
| Impor data & integrasi | kartu "1. Model kompetensi" (DACUM xlsx per jabatan, status Terimpor), kartu "2. KPI dan OKR" (per periode), kartu "Integrasi pembelajaran" (EliteMentor, LMS perusahaan) | Kartu impor memakai alur impor yang sudah ada (unggah, petakan kolom, pratinjau, simpan); tiap berkas menampilkan sumber dan waktu unggah. Kartu integrasi berbeda dari mockup: status ditulis "Terkonfigurasi" (belum ada uji panggil) dan tanpa tautan ke EliteMentor |

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

### 3.1 Alternatif yang ditolak

| Alternatif | Alasan ditolak |
| --- | --- |
| Menunggu B2 sebelum membangun layar ini | Pengelola tenant butuh layar sebelum 2 Des; `hr_admin` dipakai sementara (4.2) |
| Memperluas rute HR yang ada (`/api/invitations`, `/api/dna/imports`) | Rute HR membuka jenis impor `employees`/`dna_results` dan tidak punya aturan 4.3 |
| Membaca peran hanya dari token | Admin yang diturunkan tetap lolos sampai 8 jam (4.2) |
| Daftar izin sementara di `tenants.settings` atau pemeriksaan DB di middleware auth bersama | Mengubah kode bersama untuk masa peralihan sampai B2; ditolak di review egm tahap 8 |
| Aturan `LAST_ADMIN` | `SELF_CHANGE` + gerbang DB sudah menjamin pelaku tetap admin aktif, kecuali dua request bersamaan (bagian 10) |

## 4. Akses

### 4.1 Flag

Flag baru `admin.tenant` (konstanta `FLAGS.TENANT_ADMIN`), default mati. Semua endpoint paket ini mengembalikan 403 `FEATURE_DISABLED` bila flag mati. Endpoint ini bukan submodul berbayar, jadi tidak lewat `requireSubmodule()`; gerbangnya `requireFlag(flags, FLAGS.TENANT_ADMIN)`.

### 4.2 Peran

Satu fungsi `isTenantAdmin(user)` di `src/modules/tenant-admin/access.js` menjadi satu-satunya tempat aturan peran:

- `eta_admin` lolos (Super Admin, konsisten dengan `requireRole`);
- peran `tenant_admin` lolos (peran ini belum ada di `ROLES` dan belum diizinkan CHECK kolom `users.role`; B2 yang menambahkannya);
- `hr_admin` lolos **sementara** `[⏳ DITERIMA]`. Alasan: sampai B2 masuk, tidak ada akun yang bisa berperan `tenant_admin`, sedangkan PK-13 membuat pengelola tenant sebagai `hr_admin`, dan mockup menyebut Admin Tenant "juga HR". Akibatnya selama peralihan **setiap** `hr_admin` di tenant bisa mengundang akun, mengubah peran, dan menonaktifkan akun lain. **Audit 23 Nov:** `hr_admin` interim tidak bisa memberi peran `tenant_admin` dan tidak bisa mengubah akun yang memegang `tenant_admin` (utama atau lewat `user_roles`); lihat `docs/designs/audit-23nov-perbaikan-akses.md`. Setelah B2 masuk, `hr_admin` dicabut dari fungsi ini (satu baris), dengan **prasyarat**: pengelola hasil onboarding sudah diberi peran `tenant_admin` (migrasi data di PR B2), supaya tidak ada tenant yang terkunci. Keduanya tercatat di bagian 10. Test `tests/unit/tenant-admin.test.js › eta_admin dan tenant_admin lolos; hr_admin lolos sementara sampai B2; peran lain tidak` diubah menjadi menolak `hr_admin` pada PR itu.
- Kontrak B2 (dikonfirmasi thread B2 pada 19 Nov di `docs/designs/b2-peran.md`; berkas itu masuk basis integrasi bersama PR B2): nama peran `tenant_admin`; `req.user.role` adalah peran aktif bernilai tunggal dan satu-satunya dasar otorisasi; `req.user.roles` (peran yang boleh dipilih) tidak pernah meloloskan akses. Pemberian banyak peran per akun adalah rute B2 (`GET/PUT /api/users/:id/roles`, flag `auth.multi_role`); layar Pengguna & peran memanggilnya setelah B2 masuk, sedangkan `PATCH /users/:id` paket ini tetap mengatur peran utama.

Gerbang `requireTenantAdmin(store)` **membaca ulang peran dan status pelaku dari DB di setiap request** (`tenantAdmin.actor`), bukan hanya dari klaim token. Alasannya: token berlaku sampai 8 jam dan layar ini memberi peran, jadi admin yang diturunkan atau dinonaktifkan harus langsung kehilangan akses ke sini. Syaratnya: akun pelaku `active` di DB, peran aktif di token lolos `isTenantAdmin`, dan peran aktif itu masih termasuk peran yang diberikan kepadanya di DB (saat ini kolom `users.role`; setelah B2, daftar peran akun). Memeriksa peran aktif terhadap daftar peran, bukan hanya `users.role`, mencegah pengguna B2 yang `tenant_admin`-nya peran tambahan terkunci. `[⏳ DITERIMA]` Pemeriksaan DB ini hanya untuk `/api/tenant-admin`; di modul lain `hr_admin` yang diturunkan tetap memakai haknya sampai token habis (maks. 8 jam).

Cara menyalakan: flag `admin.tenant` dinyalakan per tenant lewat spesifikasi onboarding (PK-13, otomatis mengenal flag baru) atau oleh Admin ETA di `/api/admin/flags`; nanti lewat layar B12.

Paket ini **tidak** mengubah `core/rbac/roles.js` dan tidak mengubah CHECK `users.role`, supaya tidak bertabrakan dengan migrasi B2.

### 4.3 Batas dalam tenant

- Semua query memfilter `tenant_id = req.tenantId`. Id dari URL atau body (user, jabatan, atasan, batch) selalu dicari ulang dalam tenant itu. Id di URL yang tidak ketemu → 404; id di body (`jobRoleId`, `careerLevelId`, `supervisorId`) yang tidak ketemu → 400 dengan nama isiannya.
- Tidak seorang pun (termasuk `eta_admin`) bisa memberi peran `eta_admin` atau mengubah akun `eta_admin` lewat layar ini (403 `ROLE_FORBIDDEN`); itu urusan Super Admin (B12). Akun `eta_admin` tetap tampil di daftar, sehingga `meta.total` menghitung semua akun yang bisa masuk ke tenant. Keputusan user 23 Nov: akun ETA tampil di daftar dengan label "Dikelola ETA" dan emailnya, terkunci (admin klien tidak bisa mengubah atau menghapusnya).
- Admin tenant tidak bisa mengubah peran atau status akunnya sendiri (409 `SELF_CHANGE`). Karena pelaku harus admin aktif dan tidak bisa menurunkan dirinya, satu perubahan oleh admin tenant tidak pernah menghabiskan pengelola aktif. Pengecualian: dua admin yang saling menonaktifkan pada saat bersamaan, dan perubahan oleh `eta_admin` (bagian 10).
- Memberi peran `hr_admin` (yang melihat semua karyawan) adalah fungsi layar ini; setiap pemberian tercatat audit dengan `from`/`to`.
- Mengganti peran akun `supervisor` ke peran lain mencabut izin temuan di luar pelatihan (PM-6) miliknya, dicatat audit `delete` resource `tna.non_training_access` dengan `via: 'tenant-admin'`, `reason: 'role_changed'`. Dijadikan atasan lagi tidak memulihkan izin itu.
- Peran yang boleh diberikan: semua isi `ALL_ROLES` kecuali `eta_admin` (jadi `tenant_admin` ikut otomatis setelah B2). Audit 23 Nov: pengelola interim (`hr_admin`) tidak ditawari dan tidak bisa memberi `tenant_admin`.

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
| `GET /users` | query `q?`, `status?` | `{ data: [{ id, name, email, employeeId, role, roleLabel, jobRoleId, jobRoleName, careerLevelId, supervisorId, status, lastLoginAt, pendingLogin }], meta: { total, sso } }` | `total` = seluruh akun tenant (bukan hasil filter). Maksimal 2.000 baris, urut nama; tenant POC jauh di bawah itu, paginasi belum ada |
| `GET /roles` | – | `{ data: [{ key, label }] }` | Peran yang boleh diberikan + label Indonesia |
| `POST /users` | `{ email, name, role, employeeId?, jobRoleId?, careerLevelId?, supervisorId? }` | 201 `{ data: user, invited: true }` | Membuat akun `invited` lalu mengirim undangan (link 7 hari). Email dinormalkan huruf kecil. Email atau ID karyawan yang sudah ada → 409 `DUPLICATE` |
| `PATCH /users/:id` | subset `{ name, role, employeeId, jobRoleId, careerLevelId, supervisorId, status }` | `{ data: user }` | `status` hanya `active` atau `disabled`. Lihat aturan 4.3 |
| `POST /users/:id/invite` | – | 201 `{ data: { sent: true } }` | Kirim ulang undangan. Hanya untuk akun yang belum pernah masuk (`pendingLogin`), selain itu 409 `INVALID_STATE`. Maksimal 3 link per 15 menit per akun, dihitung bersama undangan awal dan link masuk → 429 `RATE_LIMITED`. Email gagal → 502 `MAIL_FAILED`. Akun `eta_admin` → 403 `ROLE_FORBIDDEN`. Link lama tidak dibatalkan (tetap sekali pakai, 7 hari) |

Arti status. `pendingLogin` ("belum pernah masuk") = akun tidak `disabled` dan `last_login_at` kosong. Ini mencakup akun `invited` dan akun hasil impor karyawan, yang dibuat langsung `active` oleh modul impor walau belum pernah masuk. Layar menampilkan keduanya sebagai "Diundang". Transisi lewat `PATCH`: `active → disabled`, `invited → disabled`, `disabled → active` (bila pernah masuk) atau `disabled → invited` (bila belum pernah masuk, supaya undangan bisa dikirim ulang). `invited → active` ditolak 400: akun menjadi aktif hanya lewat link undangan. Rute lama `POST /api/invitations` (HR, undangan massal karyawan) tidak diubah.

`PATCH`: `null` mengosongkan `employeeId`, `jobRoleId`, `careerLevelId`, `supervisorId`. Mengganti `jobRoleId` tanpa mengirim `careerLevelId` mengosongkan jenjang. Dua akun tidak boleh saling menjadi atasan (siklus langsung; siklus lebih panjang tidak diperiksa karena cakupan atasan hanya bawahan langsung). Body tanpa field yang dikenal → 400. Field yang nilainya sama dengan sekarang diabaikan (tanpa audit).

Urutan tulis: simpan dulu, lalu audit, tanpa transaksi bersama (pola yang sama dengan `core/flags/admin-routes.js`). Bila audit gagal request menjawab 500 walau data sudah tersimpan; percobaan ulang `POST` akan menjawab 409. Pelanggaran UNIQUE dari DB (balapan dua request) dipetakan ke 409 `DUPLICATE`.

Kode galat paket ini: 400 `BAD_REQUEST` (termasuk id di body yang tidak ketemu), 401 tanpa token, 403 `FEATURE_DISABLED` (flag mati atau kill switch) / `ROLE_FORBIDDEN` / `NOT_ENTITLED`, 404 `NOT_FOUND` (id di URL, termasuk yang bukan UUID), 409 `DUPLICATE` / `SELF_CHANGE` / `INVALID_STATE`, 429 `RATE_LIMITED`, 502 `MAIL_FAILED`.

Validasi: `role` harus peran yang boleh diberikan; `jobRoleId` harus jabatan tenant; `careerLevelId` harus jenjang jabatan itu; `supervisorId` harus akun tenant, bukan dirinya; email berformat valid, maksimal 320 karakter; nama maksimal 255; `employeeId` maksimal 64. Jabatan: nama dan divisi maksimal 255, deskripsi maksimal 2.000, maksimal 20 jenjang dengan nama maksimal 64. Kata kunci pencarian `q` dipotong 100 karakter.

Urutan `POST /users`: simpan akun dulu, lalu kirim undangan. Bila pengiriman email gagal, akun tetap ada (status `invited`), jawaban 201 dengan `invited: false` dan pesan agar admin memakai "kirim ulang". Alasannya: undangan bisa diulang, sedangkan akun ganda tidak boleh.

Menonaktifkan akun (`status: disabled`): akun tidak bisa masuk lagi (login dan tukar link sudah menolak `disabled`). `[⏳ DITERIMA]` Token JWT yang sudah terbit tetap berlaku sampai kedaluwarsa (maksimal 8 jam); pencabutan sesi adalah lingkup PK-16/B1. Dicatat di PR.

Audit: `create user` (meta `assignedRole`), `update user` (meta `changes: { kolom: { from, to } }` hanya untuk kolom yang berubah), `create invitation`. Resource `tenant_admin.user` dan `tenant_admin.invitation`, meta memuat `employeeIds: [id]`.

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
- Kolom "Sumber" di layar: label dari `sources` ditambah nama berkas `lastImport` bila ada (mis. "DACUM · DACUM_SD_v2.1.xlsx"); bila kamus kosong, "Belum ada kamus".
- Jalur lain membuat jabatan: `POST /api/dna/job-roles` (HR). Rute HR itu tidak memeriksa nama kembar tanpa beda huruf dan tidak membatasi panjang; validasi kedua jalur disatukan nanti (bagian 10).
- Jabatan adalah data organisasi inti, jadi rute jabatan tidak mensyaratkan entitlement submodul tertentu.
- Nama jabatan dibandingkan tanpa beda huruf besar/kecil pada `POST` dan `PATCH`.
- `POST /job-roles` menjawab jabatan beserta `levels`; `PATCH /job-roles/:id` menjawab `{ id, name, division, description }` saja. Layar memuat ulang daftar untuk hitungan.
- Menghapus jabatan tidak disediakan (menghapus akan ikut menghapus kamus lewat `ON DELETE CASCADE`).

Audit: `create`/`update` resource `tenant_admin.job_role`.

### 6.3 Impor data & integrasi

| Method + path | Jawaban |
| --- | --- |
| `GET /imports/summary` | `{ data: { competencyModel: [...], performance: [...], integrations: {...} } }` |
| `/imports/dna/...` dan `/imports/tna/...` | Router impor yang sudah ada (`importRouter`), dengan gerbang Admin Tenant dan **hanya** jenis `dna_competencies` (di `dna`) dan `tna_performance` (di `tna`) |

`competencyModel`: satu baris per jabatan, `{ jobRoleId, jobRoleName, competencyCount, status: 'terimpor' | 'belum', lastImport: { batchId, filename, source, uploadedAt, uploadedByName, imported } | null }`.

`performance`: satu baris per periode, `{ period, records, missed, lastImport: { batchId, filename, source, uploadedAt, uploadedByName } | null }`. `records` = jumlah catatan kinerja periode itu, `missed` = yang target-nya tidak tercapai (`is_met = false`); keduanya dihitung dari `lna_performance_records` (agregat, tanpa nama karyawan). `lastImport` = batch dari `import_batch_id` data kinerja terbaru di periode itu (bukan dari `options.period`, karena kolom Periode per baris bisa berbeda dari opsi). `uploadedAt` = waktu berkas diunggah (`import_batches.created_at`).

`integrations`:

```json
{
  "elitementor": { "status": "terkonfigurasi | belum_dikonfigurasi", "organizationMapped": true, "sso": false, "webhookSync": false },
  "lms": { "targets": ["elitementor"], "gapExport": true }
}
```

- `status = terkonfigurasi` bila konfigurasi server (env `ELITEMENTOR_*`) punya `baseUrl`, `tokenUrl`, `clientId`, `clientSecret` **dan** tenant punya `elitementor_organization_id`. Hanya boolean yang dikirim; nilai secret, URL, dan id organisasi tidak pernah dikirim.
- `sso` = flag `em.sso`, `webhookSync` = flag `em.webhook_sync`.
- `lms.targets` dari `settings.lms.targets` (bawaan `["elitementor", "moodle"]` dari `core/settings`). `gapExport` selalu `true` sebagai keterangan K4 ("LMS perusahaan: ekspor gap bila EliteMentor tidak dipakai"); fitur ekspornya milik B8/B13, tidak dibangun di sini.
- `[⚠️ BELUM TERVERIFIKASI]` "Terkonfigurasi" bukan hasil uji panggil ke EliteMentor. Uji sambungan sungguhan butuh kontrak FR-EM yang belum ada (`integrations/elitementor/client.js` belum punya endpoint).

Perubahan pada modul impor (kode bersama, perlu review Andrian):

1. `importRouter({ submodule, stores, audit, guard, only, ownDrafts })`: parameter baru `guard` (middleware; default tetap `requireRole(HR_ADMIN)`), `only` (daftar kunci jenis yang dibuka; default semua jenis submodul; riwayat batch difilter di SQL sebelum batas 100 baris) dan `ownDrafts` (lihat di bawah). Rute `/api/dna/imports` dan `/api/tna/imports` tidak berubah perilakunya, kecuali dua hal kecil: opsi teks kini di-trim, dan opsi `source` `tna_performance` (tidak bertanda `internal`) tampil sebagai isian di layar impor HR. Dengan `only`, jenis lain beserta riwayat batch-nya dijawab 404. Alasannya: mockup hanya punya dua kartu, dan jenis `employees` bisa mengubah peran lewat berkas tanpa aturan 4.3, sedangkan `dna_results` memuat hasil individu yang bukan urusan admin tenant.
2. Jenis `dna_competencies`: opsi baru `jobRoleId` dan `source`, dikirim di body `preview`/`commit` (`{ options }`) dan tersimpan di `import_batches.options`. Keduanya bertanda `internal`, jadi tidak tampil sebagai isian bebas di layar impor HR. Layar admin mengisi `jobRoleId` dari jabatan yang dipilih dan `source = dacum`. Aturan:

   | Kondisi | Hasil |
   | --- | --- |
   | Tanpa opsi | Perilaku lama: Job Role kosong = kompetensi inti; sumber kosong = `hr_rule` |
   | `jobRoleId` bukan jabatan tenant ini | 400 sebelum baris diproses |
   | `source` bukan `hr_rule/dacum/cca/both` (atau sinonimnya) | 400 sebelum baris diproses |
   | `jobRoleId` diisi, kolom Job Role kosong | Baris menjadi kompetensi jabatan itu |
   | `jobRoleId` diisi, kolom Job Role menyebut jabatan yang sama | Diterima |
   | `jobRoleId` diisi, kolom Job Role menyebut jabatan lain | Baris ditolak (satu berkas untuk satu jabatan) |
   | `jobRoleId` diisi, Jenis = inti dan Job Role kosong | Baris ditolak (kompetensi inti tidak lewat impor per jabatan) |
   | Kolom Sumber kosong | Memakai `options.source`, atau `hr_rule` bila tidak ada |
3. Jenis `tna_performance`: opsi baru `source` (teks bebas maksimal 64 karakter, mis. "HRIS", "HappyFive", "Berkas"). Hanya disimpan di `import_batches.options`; kolom `lna_performance_records.source` tidak diubah.
4. Store baru `imports.listCommitted(tenantId, kinds)` untuk ringkasan; `imports.list` menerima `kinds` opsional.
5. `requireSubmodule(submodule, deps, { tenantFlag: false })` di `core/entitlement/guard.js`: opsi baru untuk gerbang di bawah. Tanpa opsi perilakunya tidak berubah.

Gerbang tambahan untuk rute impor admin: `requireSubmodule(sm, deps, { tenantFlag: false })`. Jenis impor sebuah submodul (`dna`, `tna`) hanya terbuka bila tenant punya **entitlement** submodul itu (tanpa itu 403 `NOT_ENTITLED`) dan **kill switch global** modul itu tidak aktif (403 `FEATURE_DISABLED`). `[⏳ DITERIMA]` Flag tenant `module.dna`/`module.tna` sengaja tidak disyaratkan, karena admin menyiapkan data sebelum modul dinyalakan saat Go/No-Go. Ini penyimpangan sadar dari aturan arsitektur 3 untuk rute admin, sekarang di satu tempat (opsi `tenantFlag`), dan perlu persetujuan Andrian saat review.

Data individu: admin tenant tidak membaca hasil individu (`dna_results` tidak dibuka); satu-satunya data per karyawan yang ia lihat adalah pratinjau berkas KPI yang ia unggah sendiri (bagian 10). Admin yang mengunggah berkas KPI melihat pratinjau barisnya. Unggahan orang lain yang **belum disimpan** tidak terlihat dan tidak bisa dipratinjau atau disimpan olehnya (`importRouter` parameter `ownDrafts`, 404). Riwayat batch yang sudah disimpan terlihat tanpa baris, karena baris mentah dihapus setelah disimpan. Opsi teks dirapikan (trim) sebelum disimpan.

`[⚠️ BELUM TERVERIFIKASI]` Bentuk berkas DACUM Tool 1–3 yang asli belum pernah dilihat (data Mas Abdan masuk 26 Nov). Paket ini memakai template kamus kompetensi ELGOS yang ada; langkah "petakan kolom" menangani judul kolom yang berbeda. Parser khusus DACUM (bila bentuknya bukan tabel datar) menjadi lingkup B4 (thread T3).

## 7. Perubahan web

Dibangun di atas kontrak B0 (PR #18). Layar di `apps/web/src/screens/b11-admin/`: `UsersView.vue` (Pengguna & peran), `JobsView.vue` (Jabatan & kamus kompetensi), `ConfigView.vue` (Impor data & integrasi), `AdminNav.vue` (tab antar layar), dan `ImportFlow.vue` (alur unggah → petakan → periksa → simpan, khusus Admin Tenant; `ImportPanel.vue` HR tidak dipakai karena memanggil rute HR). Rute di `routes.ts`: nama `users`, `jobs`, `cfg` di `/admin/pengguna`, `/admin/jabatan`, `/admin/impor`, meta `flag: 'admin.tenant'`, `views: ['admin', 'hr', 'super']` (`hr` sementara sampai B2). Menu memakai `routeOpen()` dari B0, jadi butir hanya tampil bila rute bisa dibuka. Butir menu `users`/`jobs`/`cfg` hanya untuk tampilan `admin` (peran `tenant_admin`), jadi **sebelum B2 tidak ada akun yang melihat butir menunya**; HR dan Super Admin membuka layar lewat alamatnya. Disengaja agar menu HR tetap sama dengan mockup. API klien `apps/web/src/api/tenantAdmin.ts`.

Detail tampilan (hasil code review):

- kolom Sumber di Jabatan menampilkan label sumber dan nama berkas impor terakhir (`DACUM · DACUM_SD_v2.1.xlsx`);
- ringkasan impor menampilkan sumber per berkas; sumber data kinerja dipilih admin (Berkas, HRIS, Sistem OKR) dan dikirim sebagai opsi `source`;
- status EliteMentor ditulis "Terkonfigurasi" (nilai API `terkonfigurasi`), karena belum ada uji panggil (lihat 10).

E2E `apps/web/e2e/admin-tenant.spec.ts` (4 test) dengan API mock.

## 8. Test yang ditulis (test-first)

`apps/api/tests/unit/tenant-admin.test.js` (tanpa DB, store in-memory):

- `learner`, `supervisor`, `pimpinan` → 403; `hr_admin` lolos sementara; `eta_admin` lolos; `tenant_admin` lolos (token buatan); gerbang membaca peran dari DB (termasuk DC-1);
- opsi impor `jobRoleId`/`source` (tabel aturan 6.3) dan gerbang impor admin.

`apps/api/tests/unit/gating.test.js`: `requireSubmodule { tenantFlag: false }` (entitlement wajib, kill switch dihormati, flag tenant tidak disyaratkan, tanpa opsi perilaku lama).

`apps/api/tests/integration/tenant-admin.test.js` (Postgres):

- flag mati → 403 `FEATURE_DISABLED` untuk semua rute;
- validasi body `POST /users` dan `PATCH /users/:id`;
- tidak bisa memberi `eta_admin`; tidak bisa mengubah akun `eta_admin`; tidak bisa mengubah peran/status sendiri;
- undang pengguna: akun `invited` dibuat, email undangan terkirim (mailer memory), audit tercatat; email kembar → 409;
- kirim ulang undangan: hanya untuk akun `pendingLogin`; batas 3 per 15 menit; email gagal → `POST /users` 201 dengan `invited: false`, kirim ulang 502 `MAIL_FAILED`, tanpa audit undangan;
- ubah peran, jabatan, jenjang, atasan, status; nonaktif → tidak bisa login;
- isolasi tenant: admin tenant A tidak melihat dan tidak bisa mengubah user, jabatan, atau batch tenant B (404), dan `jobRoleId`/`supervisorId` milik tenant B ditolak;
- daftar jabatan: jumlah kompetensi, jumlah pegawai, status kamus, sumber;
- impor kamus per jabatan lewat `/tenant-admin/imports/dna/dna_competencies` dengan opsi `jobRoleId` + `source`, lalu ringkasan menampilkan berkas, sumber, waktu;
- impor KPI per periode dengan opsi `source`, ringkasan per periode;
- tanpa entitlement `tna` → rute impor tna 403 `NOT_ENTITLED`;
- status integrasi tidak membocorkan secret;
- rute lama `/api/dna/imports` tetap hanya untuk HR (regresi);
- triase review egm 19 Nov: izin atasan dicabut saat peran berganti; riwayat batch admin tidak tertutup oleh lebih dari 100 batch HR.

## 9. Checklist perubahan file

- [x] `docs/designs/b11-admin-tenant.md` (spek ini)
- [x] `apps/api/src/core/flags/index.js`: flag `admin.tenant`
- [x] `apps/api/src/modules/tenant-admin/access.js`: `isTenantAdmin`, `requireTenantAdmin`, peran yang boleh diberikan
- [x] `apps/api/src/modules/tenant-admin/index.js`: router (pengguna, jabatan, impor, integrasi)
- [x] `apps/api/src/db/tenant-admin-stores.js`: query pengguna, jabatan, ringkasan impor
- [x] `apps/api/src/db/stores.js`: pasang store `tenantAdmin`
- [x] `apps/api/src/db/lna-stores.js`: `imports.listCommitted`
- [x] `apps/api/src/app.js`: pasang `/api/tenant-admin`
- [x] `apps/api/src/modules/imports/index.js`: parameter `guard`, `only`, `ownDrafts`
- [x] `apps/api/src/core/entitlement/guard.js`: opsi `tenantFlag`
- [x] `apps/api/src/modules/imports/kinds/competencies.js`: opsi `jobRoleId`, `source`
- [x] `apps/api/src/modules/imports/kinds/performance.js`: opsi `source`
- [x] `apps/api/tests/unit/tenant-admin.test.js`
- [x] `apps/api/tests/integration/tenant-admin.test.js`
- [x] `apps/api/tests/unit/gating.test.js`
- [x] `apps/web/src/screens/b11-admin/*` (layar, `routes.ts`), `apps/web/src/api/tenantAdmin.ts`, `apps/web/e2e/admin-tenant.spec.ts`

## 10. Asumsi dan risiko yang tersisa

| Tanda | Isi | Ditutup oleh |
| --- | --- | --- |
| ⏳ | `hr_admin` berlaku sebagai admin tenant sampai B2 menambah peran `tenant_admin` | PR lanjutan setelah B2 |
| ⏳ | Token akun yang dinonaktifkan masih berlaku sampai kedaluwarsa | PK-16/B1 (sesi) |
| ⚠️ | Bentuk berkas DACUM asli belum dilihat | Data Mas Abdan 26 Nov, B4 |
| ⚠️ | "Terkonfigurasi" EliteMentor belum uji panggil | Kontrak FR-EM |
| ⏳ | Selama peralihan setiap `hr_admin` adalah admin tenant penuh (termasuk menonaktifkan pengelola hasil onboarding) | Diterima user 23 Nov, juga bila B2 lewat 2 Des; setiap perubahan tercatat di audit. Review Andrian tetap wajib (aturan 7) |
| ⏳ | Prasyarat B2: pengelola hasil onboarding dimigrasi ke `tenant_admin` sebelum `hr_admin` dicabut | PR B2 |
| ⏳ | `hr_admin` yang diturunkan tetap memakai hak HR di modul lain sampai token habis (8 jam) | PK-16/B1 |
| ⏳ | Dua admin saling menonaktifkan bersamaan bisa meninggalkan tenant tanpa pengelola | Pemulihan lewat Super Admin (B12); kunci baris bila B2 menambah aturan admin terakhir |
| ⏳ | Audit dicatat sesudah simpan: audit gagal → 500 padahal data tersimpan | Diterima (pola repo) |
| ⏳ | Pratinjau KPI menampilkan baris per karyawan dari berkas yang diunggah admin sendiri | Diterima; kelas visibilitas `tenant_admin` ditetapkan B2 (aturan 4) |
| ⏳ | Rute impor admin tidak mensyaratkan flag modul tenant (aturan 3) | Persetujuan Andrian |
| ⏳ | Ringkasan impor membaca maksimal 200 periode dan 1.000 batch tersimpan; di luar itu "impor terakhir" kosong | Diterima untuk POC |
| ⏳ | Batas kirim ulang undangan diperiksa lalu ditulis (bisa lolos satu lebih saat bersamaan) | Diterima |
| ⏳ | Nama jabatan kembar tanpa beda huruf hanya dicek aplikasi di rute Admin Tenant; UNIQUE DB peka huruf dan rute HR `POST /api/dna/job-roles` tidak memeriksanya | Indeks `lower(name)` bila diperlukan (review Andrian, migrasi) |

## 11. Review egm (spek)

Review oleh subagent baru tanpa riwayat percakapan, 19 Nov 2026. 15 temuan (3 berat, 8 sedang, 4 ringan).

| # | Temuan | Keputusan |
| --- | --- | --- |
| 1 | Peran dibaca dari token; admin yang dicabut masih lolos sampai 8 jam | **Perbaiki.** Gerbang membaca peran dan status dari DB per request (4.2), dengan test |
| 2 | `importRouter` utuh membuka jenis `employees`, `dna_results`, dll. dan riwayat batch-nya | **Perbaiki.** Parameter `only`; hanya kamus dan KPI (6.3), dengan test 404 |
| 3 | Aturan opsi `jobRoleId`/`source` belum terdefinisi | **Perbaiki.** Tabel aturan di 6.3, tiap baris punya test unit |
| 4 | Arti `invited` tidak cocok dengan akun hasil impor | **Perbaiki.** `pendingLogin` dan tabel transisi (6.1) |
| 5 | Impor admin melewati flag modul dan kill switch | **Perbaiki sebagian.** Kill switch dihormati; flag tenant sengaja tidak, ditandai ⏳ untuk Andrian |
| 6 | Bergantung pada bentuk B2 | **Perbaiki.** T2 mengonfirmasi kontrak (4.2): nama `tenant_admin`, otorisasi hanya dari peran aktif. Peran yang bisa diberikan tetap 7 persona yang ada di kode dikurangi `eta_admin`, karena membatasinya ke 5 peran mockup adalah keputusan B2 |
| 7 | Eskalasi lewat pemberian `hr_admin`; lockout | **Tolak sebagian.** Memberi `hr_admin` adalah fungsi layar (diaudit). `LAST_ADMIN` tidak perlu karena `SELF_CHANGE` + gerbang DB menjamin pelaku tetap admin aktif. Kasus `eta_admin` terhadap `eta_admin` ditulis di 4.3 |
| 8 | Chip SSO memakai `em.sso` | **Perbaiki.** Memakai `auth.sso` bila ada, selain itu `false` |
| 9 | Pencocokan batch lewat `options.period` tidak andal | **Perbaiki.** Lewat `import_batch_id` |
| 10 | Atomisitas tulis + audit, balapan duplikat | **Perbaiki sebagian.** UNIQUE → 409, nama jabatan tanpa beda huruf. Urutan tulis-lalu-audit dipertahankan (pola repo) dan ditulis di 6.1 |
| 11 | Kasus tepi `PATCH /users` | **Perbaiki.** Ditulis di 6.1 |
| 12 | Kuota undangan, link lama | **Perbaiki (dokumen).** Ditulis di 6.1 |
| 13 | Bentuk jawaban dan kode galat | **Perbaiki (dokumen).** Daftar kode galat di 6.1. `invited` tetap di luar `data` karena bukan bagian dari akun |
| 14 | Selisih teks dengan mockup ("Belum ada lokakarya DACUM", "—") | **Tunda** ke bagian web (teks layar mengikuti mockup) |
| 15 | Cara flag menyala, penamaan | **Perbaiki (dokumen).** Ditulis di 4.2 |

## 12. Review egm (diff)

Review diff backend oleh subagent baru, 19 Nov 2026. Tidak ada temuan berat; 2 sedang, 6 ringan.

| # | Temuan | Keputusan |
| --- | --- | --- |
| 1 | `PATCH {status:'active'}` pada akun aktif yang belum pernah masuk mengubahnya jadi `invited` | **Perbaiki.** Hanya `disabled` yang kembali ke `invited`; ada test |
| 2 | Unggahan HR yang belum disimpan (baris KPI per karyawan) terbuka bagi admin tenant | **Perbaiki.** `ownDrafts`; ada test |
| 3 | `only` terhadap riwayat batch tidak diuji | **Perbaiki.** Test ditambah |
| 4 | Dua admin yang saling menonaktifkan pada saat yang sama bisa meninggalkan tenant tanpa admin | **Tunda.** `[⚠️ BELUM TERVERIFIKASI]` Jaminan di 4.3 tidak berlaku untuk dua request bersamaan. Pemulihan lewat Super Admin (B12). Kunci baris dikerjakan bila B2 menambah aturan admin terakhir |
| 5 | Bentuk jawaban `POST` dan `PATCH` jabatan berbeda | **Perbaiki (dokumen).** Ditulis di 6.2 |
| 6 | `options.jobRoleId` disimpan tanpa dirapikan | **Perbaiki.** Opsi teks di-trim sebelum disimpan |
| 7 | Kirim ulang undangan ke akun `eta_admin` tidak ditolak | **Perbaiki.** 403, ada test |
| 8 | Gerbang dijalankan dua kali di rute impor; aturan atasan timbal balik tanpa test | **Perbaiki.** Gerbang sekali; test ditambah |

## 13. Code review (mattpocock-skills:code-review)

Satu putaran untuk B9 dan B11; tabel lengkap di `docs/designs/b9-improvement-needs.md` bagian 13. Khusus B11:

| Sumbu | Temuan | Tindak lanjut |
| --- | --- | --- |
| Spec | Jabatan tanpa nama berkas, sumber per berkas, label "tersambung", "deep link" tetap, sumber KPI tetap `berkas` | **Perbaiki** (commit `f8f06c8`), assertion e2e ditulis dulu |
| Spec | Formulir pengguna belum punya isian jenjang dan atasan | **Tunda.** API sudah menerima; layar menyusul bersama B2 |
| Standards | Pengecualian `requireSubmodule` untuk impor admin menduplikasi logika entitlement dan kill switch | **Tunda** (⏳ di 10), usul opsi pada `requireSubmodule`, perlu Andrian |
| Standards | `TENANT_ADMIN` dan label peran di luar `core/rbac/roles.js` | **Tunda** sampai B2 menetapkan peran `tenant_admin` |

## 14. egm-review penuh dan review diff (putaran 2, 19 Nov 2026)

Dijalankan dengan agen plugin egm (reviewer tanpa riwayat, dipanggil langsung dari konteks utama karena `egm-synthesizer` tidak bisa memanggil subagen di harness ini). Laporan lengkap di `docs/designs/egm-review/b11/` (tahap 5–9), review diff di `docs/designs/egm-review/diff/diff_review_report.md`, triase egm-resolve di `docs/designs/egm-review/b11/goldfish_review_report.md`, drift di `docs/designs/egm-review/2026-11-19_DRIFT_REPORT.md`.

Hasil utama:

- **Kode (test-first, test merah di `dbe26d3`, perbaikan `5f35f85` dan `d34f1b0`):** izin temuan di luar pelatihan dicabut saat peran atasan diganti; riwayat batch admin difilter di SQL; status integrasi `terkonfigurasi`; `requireSubmodule(…, { tenantFlag: false })` menggantikan salinan gerbang; gerbang Admin Tenant memeriksa peran aktif terhadap peran yang diberikan di DB (siap untuk B2); test kegagalan email.
- **Spek:** status, tabel istilah, alternatif yang ditolak (3.1), prasyarat keluar dari peralihan `hr_admin` saat B2, 400 vs 404 untuk id, batas validasi, data individu admin, menu sebelum B2, berkas test yang benar, baris baru di bagian 10.
- **Diteruskan ke user:** risiko `hr_admin` sebagai admin penuh bila B2 lewat 2 Des; akun ETA tampil dan tidak bisa dihapus admin klien.
- **Ditunda:** outbox audit, daftar izin sementara, cek DB di middleware auth bersama, indeks nama jabatan tanpa beda huruf. Usul: `/mattpocock-skills:to-tickets`.

## 15. Keputusan user 23 Nov 2026 (kartu opsi)

| # | Pertanyaan | Pilihan | Akibat |
| --- | --- | --- | --- |
| 4 | Jika B2 lewat 2 Des, apakah semua HR admin jadi admin tenant penuh? | Ya, sementara, dengan audit | Tidak ada perubahan kode; risiko di bagian 4.2 dan 10 diterima |
| 5 | Apakah admin klien melihat akun ETA di daftar pengguna? | Tampil, berlabel ETA, terkunci | Sesuai kode (`UsersView.vue` "Dikelola ETA", API 403 `ROLE_FORBIDDEN` untuk ubahan) |

Pertanyaan 1–3 (Improvement Needs) dicatat di `b9-improvement-needs.md` bagian 15.
