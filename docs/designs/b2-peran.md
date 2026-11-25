# B2 · Peran dan ganti tampilan

Status: spek untuk dibangun, sudah direview (lihat "Review spek" di akhir). Paket B2 dari `brief-bangun-penuh-19nov.md` (thread T2). Dibangun di atas B1 (`docs/designs/b1-login.md`). Reviewer wajib: Andrian (auth, kode bersama, migrasi).

## Tujuan

1. ELGOS punya lima tampilan peran sesuai mockup Pak Eji dan default K2: HR / L&D, Atasan, Karyawan, Admin Tenant, Super Admin.
2. Satu akun boleh memegang beberapa peran dan berpindah tampilan di bilah atas.
3. Peran yang sedang aktif menentukan menu dan cakupan data.
4. Super Admin mengelola konfigurasi dan tidak membuka transkrip atau percakapan wawancara.

## Layar mockup yang dicakup

- Bilah atas: tombol ganti tampilan (`roleSwitch`, baris 1710–1712). Label "Karyawan (saya)" untuk tampilan karyawan dari akun yang punya peran lain.
- Menu per peran (fungsi `N`, baris 1669–1699). B2 menyediakan datanya dari API; komponen menu milik B0.
- Tabel `ROLE` mockup (baris 1276–1282): halaman awal per peran.

## Model: peran dan tampilan

Dua konsep dipisah:

- **Peran** (`role`): kode untuk otorisasi. Kode yang ada tetap; satu kode baru `tenant_admin`.
- **Tampilan** (`view`): lima nilai untuk menu dan label. Diturunkan dari peran.

| Peran (kode) | Tampilan | Label | Halaman awal |
| --- | --- | --- | --- |
| `hr_admin` | `hr` | HR / L&D | `dash` |
| `supervisor`, `pimpinan`, `role_leader` | `atasan` | Atasan | `dash` |
| `tenant_admin` (**baru**) | `admin` | Admin Tenant | `users` |
| `eta_admin` | `super` | Super Admin | `tenants` |
| `learner`, `sme` | `karyawan` | Karyawan | `my` |

`pimpinan`, `role_leader`, `sme` tetap menjadi kode otorisasi (dipakai CCA/DNA) dan `req.user.role` tetap kode aslinya. Selaras shell B0 (`shell/views.ts`, keputusan T1 19 Nov), `pimpinan` dan `role_leader` memakai tampilan Atasan (menu saja; cakupan data tetap dari peran lewat `visibleEmployeeScope()`), `sme` memakai tampilan Karyawan. `[⏳ DITERIMA]` B3 (T1) menyesuaikan dashboard tim untuk `pimpinan`.

Peran yang dimiliki akun:

- Disimpan di tabel baru `user_roles`. `users.role` tetap ada sebagai **peran utama** (peran aktif saat masuk).
- **Peran yang bisa dipilih** (`switchableRoles`) = peran di `user_roles`, ditambah `learner` bila akun punya `hr_admin`, `supervisor`, atau `tenant_admin` dan belum punya peran bertampilan Karyawan ("HR, Atasan, dan Admin Tenant juga karyawan", K2). `learner` turunan ini tidak disimpan.
- `eta_admin` tidak bisa digabung dengan peran lain dan tidak punya tampilan lain.
- Admin Tenant menjadi HR hanya bila `hr_admin` juga diberikan ke akunnya.
- Contoh: akun utama `hr_admin` + `tenant_admin` → `switchableRoles = [hr_admin, tenant_admin, learner]`. Akun `pimpinan` → `[pimpinan, learner]`, tampilan Atasan.

Flag baru `auth.multi_role` (default mati, per tenant): bila mati, `switchableRoles` hanya berisi peran utama dan `switch-role` menolak (403 `FEATURE_DISABLED`). Pemeriksaan peran aktif di `requireAuth` tidak di balik flag karena itu jalur keamanan, bukan fitur; untuk akun satu peran hasilnya sama dengan sebelum B2.

## Peran aktif di sesi

- `auth_sessions` mendapat `active_role` (diisi peran utama saat sesi dibuat; NULL hanya untuk sesi sebelum migrasi = peran utama) dan `role_version int NOT NULL DEFAULT 0`.
- JWT: `role` = peran aktif, klaim baru `rv` = `role_version`. Contoh akun `pimpinan`: `{ sub, tid, role:'pimpinan', rv:0, sid, email }`.
- `authSessions.findActive(id)` kini mengembalikan `{ id, tenantId, userId, activeRole, roleVersion, expiresAt, primaryRole, roles }`; `roles` = isi `user_roles` akun (satu query dengan `array_agg`). Store memori menerima `accountOf(userId)` opsional; tanpa itu peran akun = peran saat sesi dibuat, jadi test lama tidak berubah.
- `requireAuth` menolak (401) bila: `claims.rv !== roleVersion` → kode `ROLE_VIEW_CHANGED`; peran aktif sesi tidak sama dengan `claims.role`; atau peran aktif tidak lagi ada di `switchableRoles`. Jadi peran yang dicabut langsung kehilangan akses tanpa perlu mencabut sesi.
- `req.user` ditambah `roles` (switchable) dan `view`. Karena `req.user.role` = peran aktif, `requireRole`, `visibleEmployeeScope`, dan pengecekan di modul otomatis mengikuti tampilan: HR dalam tampilan Karyawan hanya melihat datanya sendiri.
- Ganti tampilan: `POST /api/auth/switch-role {role}` → `UPDATE auth_sessions SET active_role = :role, role_version = role_version + 1 WHERE id = :sid AND role_version = :rv RETURNING ...`, lalu token baru ditandatangani dengan `exp` = `expires_at` sesi (masa sesi tidak bertambah). Token lama selalu tidak berlaku (`rv` naik, juga setelah A→B→A). Audit `update` `auth.role_view` `{from,to}`.
- Web: saat menerima 401 `ROLE_VIEW_CHANGED` (tab lain mengganti tampilan), web memuat ulang halaman ke `/login?alasan=tampilan-berubah` bila tidak punya token baru. `[⏳ DITERIMA]` Sinkron antar-tab tidak dibangun.

## Super Admin dan isi wawancara

> **Diganti 24 Nov 2026.** Kartu keputusan "Block Super Admin from reading employee content in every module?" → "Yes, one core rule": Super Admin tidak membaca isi data karyawan di modul mana pun. Aturan inti `denyEmployeeContent` (`core/rbac`) dipasang di `app.js` pada `/employees`, `/dashboard`, `/assistant`, dan setiap router submodul (403 `EMPLOYEE_CONTENT_PRIVATE`), dan `visibleEmployeeScope` memberi Super Admin cakupan kosong. Super Admin bekerja lewat konsol platform (ADR 0002). Spek: `docs/designs/review-24nov-perbaikan.md` bagian Super Admin. Teks di bawah ini riwayat.

~~Keputusan user 19 Nov 20.30 WIB (kartu keputusan, pilihan "Seperti sekarang"): Super Admin tetap melihat hasil karyawan, termasuk kutipan jawaban yang tersimpan di hasil analisis (`evidence`, `detail`); **hanya transkrip mentah yang ditutup**.~~

- ~~`visibleEmployeeScope` untuk `eta_admin` tidak berubah (`{ all: true }`).~~ Sejak 24 Nov: `{ userIds: [] }`.
- Transkrip: sudah ditutup oleh PR #11 (PK-15, kini di branch integrasi). `GET /:id/transcript` menjawab 403 `TRANSCRIPT_PRIVATE` untuk semua orang selain yang diwawancarai, termasuk Super Admin; `GET /:id` hanya memberi status sesi. B2 tidak mengubah kontrak itu.
- `requireRole(...)` tetap meloloskan `eta_admin`. Middleware baru `denyRoles(...)` dipasang di `POST /:id/turns` dan `POST /:id/complete` (`modules/interviews`, dipasang sebagai `/api/<submodul>/sessions`) → 403 `INTERVIEW_CONTENT_PRIVATE`: Super Admin tidak ikut percakapan dan tidak menutup sesi orang lain. Middleware ini bisa dipakai B6, B10, B17.

## Menu per peran

`GET /api/me/access` ditambah `role`, `view`, `home`, `roles: [{ role, view, label }]`, dan `menu` untuk peran aktif. `menu` adalah daftar berurutan; tiap butir:

```json
{ "key": "tna", "label": "Training Needs", "icon": "fact_check", "level": 1, "group": null, "enabled": true }
{ "key": null, "label": "Learning Needs Analysis", "icon": "query_stats", "level": 0, "group": "lna", "enabled": true }
```

`key` = kunci layar (null untuk judul grup), `group` = id grup (hanya pada judul grup), `level` 0/1. Didefinisikan di `core/rbac/menu.js`:

| Tampilan | Butir berurutan (`key` · label · ikon · flag) |
| --- | --- |
| `hr` | `dash` Dashboard utama `dashboard` · grup `lna` Learning Needs Analysis `query_stats` → [`cc` Core Competencies `flag` `module.cca`; `dna` Developmental Needs `account_tree` `module.dna`; `tna` Training Needs `fact_check` `module.tna`; `ina` Improvement Needs `build_circle` `module.ina`] · grup `li` Learning Intervention `extension` → [`lib` Library `local_library`; `prog` Program & Course `collections_bookmark`; `req` Permintaan & pengembangan `inventory_2`] (ketiganya `module.li`) · `ld` Learning Delivery `school` `module.ld` · `lim` Learning Impact Measurement `monitoring` `module.lim` · `cp` Career & Promotion `workspace_premium` `promotion.recommendation` |
| `atasan` | `dash` Dashboard tim · grup `lna` → [`aiv` Wawancara AI `record_voice_over` `module.cca`; `dna`; `tna`; `ina`] · `lim` · `cp` |
| `karyawan` | `my` Hasil saya `person` · `aiv` Wawancara visi & nilai `record_voice_over` `module.cca` · `iv` Wawancara akar masalah `forum` `module.tna` · `li` Rencana belajar `school` |
| `admin` | `users` Pengguna & peran `group` · `jobs` Jabatan & kamus kompetensi `badge` · `cfg` Impor data & integrasi `upload_file` |
| `super` | `tenants` Tenant `apartment` · `platform` Konfigurasi platform `tune` |

`enabled`: butir tanpa flag selalu true. Butir berflag: true bila flag terdaftar (`flags.isKnown`) dan menyala untuk tenant; flag yang belum terdaftar (dibuat paket lain: `module.li`, `module.ld`, `module.lim`) → false tanpa galat. Butir modul `cc`/`dna`/`tna`/`ina`, wawancara AI `aiv` (CCA), dan wawancara `iv` (TNA) juga mensyaratkan entitlement submodulnya (`entitlements.submodules`). Judul grup `enabled` bila ada anaknya yang enabled.

## Data dan migrasi (blok 02)

`20261119000200-user-roles.js`:

- `users`: constraint `users_role_check` diganti agar menerima `'tenant_admin'`; tambah `UNIQUE (id, tenant_id)` (`users_id_tenant_key`) untuk FK komposit.
- `user_roles (tenant_id, user_id, role varchar(32) CHECK daftar yang sama, granted_by uuid → users SET NULL, created_at, PRIMARY KEY (user_id, role), FOREIGN KEY (user_id, tenant_id) → users (id, tenant_id) ON DELETE CASCADE)` + indeks `(tenant_id, role)`. FK komposit menjamin baris peran tidak bisa lintas tenant.
- Isi awal: satu baris per akun dari `users.role`.
- Trigger `users_role_sync` (AFTER INSERT OR UPDATE OF role ON users): saat INSERT menambah baris peran utama; saat `role` berubah **mengganti** baris peran lama dengan yang baru (peran tambahan lain tidak disentuh). Dengan begitu impor karyawan, onboarding (PR #9), dan seed yang hanya menulis `users.role` tetap konsisten, dan menurunkan `supervisor` ke `learner` lewat impor benar-benar mencabut peran atasan (sesi yang aktif sebagai atasan langsung 401).
- `auth_sessions`: `active_role varchar(32) NULL`, `role_version int NOT NULL DEFAULT 0`.
- `down`: hapus trigger, tabel, kolom, `users_id_tenant_key`; akun `tenant_admin` diturunkan ke **`learner`** (bukan `hr_admin`, supaya rollback tidak menambah akses data) dan sesinya dihapus; lalu `users_role_check` lama dipasang kembali.

Penjaga akun istimewa yang ada hanya melihat `users.role IN ('hr_admin','eta_admin')`. Diperluas menjadi "akun punya peran istimewa apa pun di `user_roles`" (`hr_admin`, `tenant_admin`, `eta_admin`):

- impor karyawan (`lna-stores.js` upsert, `imports/kinds/employees.js`): akun istimewa tidak bisa diubah lewat impor;
- `users.listInvitees`: akun istimewa tidak diundang lewat jalur karyawan.

## Endpoint

| Endpoint | Auth | Perilaku |
| --- | --- | --- |
| `POST /api/auth/switch-role {role}` | sesi | Flag `auth.multi_role` mati → 403 `FEATURE_DISABLED`. Peran di luar `switchableRoles` → 403 `ROLE_NOT_ASSIGNED`. Jawab `{ token, user }`. Audit. |
| `GET /api/auth/me` | sesi | Ditambah `roles`, `view`, `primaryRole`. |
| `GET /api/me/access` | sesi | Ditambah `role`, `view`, `home`, `roles`, `menu`. |
| `GET /api/users/:id/roles` | `hr_admin`, `tenant_admin` | `{ roles, primary }` akun di tenant sendiri; akun tenant lain → 404. |
| `PUT /api/users/:id/roles` | `tenant_admin` (`eta_admin` lolos) | Body `{ roles: string[1..4], primary: string }`. Aturan di bawah. Audit `update` `user.roles` `{from,to,employeeIds}`. |
| `DELETE /api/sessions/users/:userId/mfa` (B1) | ditambah `tenant_admin` | |

Aturan `PUT roles` (dijalankan dalam satu transaksi yang mengunci baris tenant `SELECT ... FOR UPDATE`, supaya dua permintaan bersamaan tidak mencabut dua admin terakhir):

1. `roles` unik, tiap nilai salah satu dari `hr_admin`, `supervisor`, `tenant_admin`, `learner`, `pimpinan`, `role_leader`, `sme`; `primary ∈ roles`. Selain itu 400.
2. `eta_admin` tidak bisa diberikan atau dicabut lewat endpoint ini (400); akun `eta_admin` tidak bisa diubah (403 `ROLE_PROTECTED`).
3. Tidak bisa mengubah peran sendiri (403 `SELF_ROLE_CHANGE`); admin lain atau Super Admin yang melakukannya. Ini mencegah Admin Tenant memberi dirinya akses data HR tanpa orang kedua.
4. Tidak boleh mencabut `tenant_admin` terakhir di tenant (409 `LAST_TENANT_ADMIN`).
5. Menulis `users.role = primary` dan mengganti isi `user_roles` dalam transaksi yang sama. Sesi akun tidak perlu dicabut: `requireAuth` menolak sesi yang peran aktifnya sudah tidak dimiliki.

Admin Tenant pertama: tidak dibuat oleh migrasi. Dibuat oleh Super Admin (`eta_admin` lolos `PUT roles`), dan oleh "buat tenant + undang admin" di B12. `[⏳ DITERIMA]` Skrip onboarding PR #9 masih membuat `hr_admin`; penyesuaiannya ke `tenant_admin` dicatat untuk B12.

Rute peran dipasang di balik peran, bukan `requireSubmodule`, karena ini inti platform dan tidak boleh mati bersama modul.

## Di luar cakupan (dicatat untuk paket lain)

- `[⏳ DITERIMA]` Daftar peserta DNA/TNA masih disaring dari `users.role` (`modules/dna/index.js`), jadi akun berperan utama `hr_admin`/`tenant_admin` belum menjadi subjek asesmen dan tampilan Karyawan mereka bisa kosong. Konsep "karyawan sebagai subjek, terpisah dari peran" milik B4/B5/B8; dicatat di PR.
- Layar "Pengguna & peran" milik B11 (T6); B2 menyediakan kontrak API perannya.

## Aturan dan keputusan yang dirujuk

K2, RG-3 (`visibleEmployeeScope`), PO-6, aturan CLAUDE.md 2, 3, 4, 5, 6, 7.

## Test

- Unit `roles.test.js`: tampilan dan `switchableRoles` (HR → +Karyawan; `eta_admin` tunggal; `pimpinan`), label, `denyRoles`; menu tiap tampilan sama dengan mockup; `enabled` mengikuti flag, flag tak terdaftar, dan entitlement.
- Unit `switch-role.test.js` (store memori): pindah tampilan mengubah `req.user.role`, menu, dan hak rute; token lama 401 `ROLE_VIEW_CHANGED` termasuk setelah A→B→A; peran yang tidak dimiliki 403; flag mati 403; `exp` tidak bertambah; audit; peran dicabut → 401.
- Integrasi `user-roles.test.js` (Postgres): trigger sinkron, FK komposit, `PUT roles` (validasi, diri sendiri, admin terakhir termasuk dua permintaan bersamaan, isolasi tenant 404), penjaga impor/undangan untuk akun istimewa, sesi dengan peran aktif, `eta_admin` 403 pada rute percakapan wawancara.

## Daftar perubahan

- [x] `apps/api/migrations/20261119000200-user-roles.js`
- [x] `apps/api/src/core/flags/index.js` (`auth.multi_role`)
- [x] `apps/api/src/core/rbac/roles.js` (`TENANT_ADMIN`, tampilan, `switchableRoles`)
- [x] `apps/api/src/core/rbac/index.js` (`denyRoles`)
- [x] `apps/api/src/core/rbac/menu.js`
- [x] `apps/api/src/core/rbac/role-routes.js` (`/users/:id/roles`)
- [x] `apps/api/src/core/auth/tokens.js`, `sessions.js`, `middleware.js`, `routes.js`, `session-routes.js`
- [x] `apps/api/src/db/stores.js`, `lna-stores.js` (`userRoles`, sesi, penjaga akun istimewa)
- [x] `apps/api/src/modules/interviews/index.js`, `imports/kinds/employees.js`
- [x] `apps/api/src/app.js` (`/me/access`, rangkai)
- [x] test di atas
- [ ] (setelah B0) ganti tampilan di bilah atas + e2e

## Review spek (egm, 19 Nov)

Reviewer tanpa konteks memberi 11 temuan untuk B2. Triase:

| Temuan | Keputusan |
| --- | --- |
| Super Admin masih membaca kutipan jawaban lewat hasil analisis | **Diangkat ke user**. User memilih "Seperti sekarang": hasil analisis tetap terlihat, hanya transkrip mentah ditutup. |
| Impor/undangan hanya menjaga `users.role`; trigger tidak mencabut peran lama | **Perbaiki**: penjaga melihat `user_roles`; trigger mengganti peran utama. |
| "HR juga karyawan" tidak berlaku di data peserta | **Tunda** ke B4/B5/B8, dicatat di PR. Mengubah penyaring peserta di sini akan bertabrakan dengan tiga thread lain. |
| `requireAuth` berubah tanpa flag dan tanpa kontrak store | **Perbaiki** kontrak `findActive`; flag `auth.multi_role` untuk fitur pindah tampilan. Pemeriksaan di `requireAuth` **tidak** diberi flag (alasan di atas). |
| Celah `PUT roles` (bootstrap, eskalasi diri, balapan, validasi) | **Perbaiki**. |
| Klaim `role` untuk `pimpinan` dkk. tidak jelas | **Perbaiki**: peran dan tampilan dipisah. |
| `down` menaikkan akses (`tenant_admin` → `hr_admin`) | **Perbaiki**: turun ke `learner`. |
| Token lama cocok lagi setelah A→B→A; `exp` bertambah; tab lain | **Perbaiki**: `role_version`, `exp` sesi, kode `ROLE_VIEW_CHANGED`. |
| Kontrak menu kurang | **Perbaiki**: tabel menu dan bentuk JSON. |
| `user_roles.tenant_id` tidak terikat ke tenant user | **Perbaiki**: FK komposit. |
| Nama constraint dan `down` | **Perbaiki**. |

## Review diff (egm, 19 Nov)

Satu review diff untuk B1 + B2 (lihat juga `b1-login.md`). Tidak ada temuan berat.

| # | Temuan | Keputusan |
|---|---|---|
| D5 | `GET/PUT /api/users/:id/roles` aktif tanpa flag (aturan 3) | Diperbaiki: seluruh rute di balik `auth.multi_role` (403 `FEATURE_DISABLED` bila mati). Peran `tenant_admin` sendiri tetap ada di semua tenant karena dipakai onboarding B12 |
| D6 | `down` tidak menghapus sesi yang memakai peran tambahan | Diperbaiki: sesi dengan `active_role <> users.role` dihapus sebelum kolom dibuang; naik-turun-naik dijalankan lokal |
| D9 | Kalah balapan `switch-role` menjawab `ROLE_NOT_ASSIGNED` | Diperbaiki: `ROLE_VIEW_CHANGED` (409 dari penggantian atomik, atau 401 dari `requireAuth`). Audit gagal setelah ganti: ditunda, pengguna cukup masuk lagi. `active_role` selalu diisi saat sesi dibuat: spek disesuaikan, NULL hanya untuk sesi lama |
| D10 | Hak pemberi peran tidak dicek ulang di dalam kunci | Ditunda: jendela sangat sempit, butuh dua admin bertindak bersamaan; dicatat untuk B11 |
| D12 | Menu `admin` memuat "Impor data" tetapi impor masih `hr_admin` saja | Ditunda ke B11 (pemilik layar Admin Tenant): perlu keputusan apakah Admin Tenant boleh mengimpor data kinerja. Kode `accountOf` vs `rolesOf` di spek: diselaraskan |
| D13 | Celah test | Ditambah: batas MFA enable/disable, target terlindung, audit `rate` sekali per jendela, balapan ganti tampilan. Sisanya (perilaku `down` dengan data, penurunan atasan lewat impor) dicatat |

## Code review (mattpocock-skills:code-review, 19 Nov)

Dua sub-agen paralel pada `git diff origin/claude/project-thread-scbrmb...HEAD -- apps/api` (sumbu Standar terhadap CLAUDE.md + daftar smell Fowler; sumbu Spek terhadap `b1-login.md` dan `b2-peran.md`). Berlaku untuk B1 dan B2.

**Sumbu Spek**

| # | Temuan | Keputusan |
|---|---|---|
| S1 | Admin Tenant pertama di tenant klien tidak bisa dibuat lewat `PUT roles` (token Super Admin bertenant ETA) | [⏳ DITERIMA] Dibuat oleh skrip onboarding PR #9 sekarang, oleh layar Tenant B12 nanti |
| S2 | `GET/PUT roles` membungkus `{ data }` dan menambah `views` | Diterima: pola `{ data }` dipakai semua rute bersesi; `views` dipakai layar B11 |
| S3 | Menu mensyaratkan entitlement juga untuk `aiv` (CCA) dan `iv` (TNA) | Diterima, spek disesuaikan (lihat Menu per peran); peta `SUBMODULE` menampung keduanya |
| S4 | Penjaga flag `r.use` menutup semua `/api/users/*` | Diperbaiki: penjaga per rute |
| S5 | Super Admin ditolak saat mereset MFA Admin Tenant, padahal tabel endpoint B1 bilang `eta_admin` lolos | Diperbaiki: `canResetMfa` di `rbac/roles.js` (Admin Tenant oleh Admin Tenant atau Super Admin) |
| S6 | Ganti ke peran yang sedang aktif menjawab `ROLE_NOT_ASSIGNED` | Diperbaiki: 200 dengan token yang sama, tanpa audit |
| S7 | Audit login lewat MFA tidak membawa `purpose` link | Ditunda: challenge belum menyimpan `purpose`; dampak kecil |
| S8 | Reset MFA akun nonaktif menjawab 404 | Diterima: akun nonaktif sudah tidak bisa masuk; aktifkan dulu lalu reset |

**Sumbu Standar**

| # | Temuan | Keputusan |
|---|---|---|
| T1 | Aturan 2: subquery `user_roles` tanpa `tenant_id` | Diperbaiki di `findById` dan dua `EXISTS` di `lna-stores.js`. Rute akun MFA memakai `req.user.tenantId` (nilai sama dengan `req.tenantId`; dipasang sebelum `tenantContext`) [⏳ DITERIMA] |
| T2 | Aturan 3: `denyRoles` Super Admin pada `turns`/`complete` dan field baru `/me/access` tanpa flag | [⏳ DITERIMA] sebagai pengecualian: penolakan Super Admin adalah keputusan user (PO-6/"seperti sekarang"), field `/me/access` hanya tambahan baca. Sesi PK-16 dan batas laju: pengetatan keamanan, tanpa flag |
| T3 | Aturan 7: diff menyentuh auth, kode bersama, migrasi | Andrian sudah jadi assignee PR; tidak bisa diminta review karena penulis PR |
| T4 | Literal peran istimewa berulang; `attempts < 5` mengulang `MAX_ATTEMPTS`; peta `aiv`/`iv` | Diperbaiki (`PRIVILEGED_ROLES`, `MAX_ATTEMPTS`, peta `SUBMODULE`) |
| T5 | Logika hierarki reset MFA di rute (Feature Envy) | Diperbaiki: `canResetMfa` di `rbac/roles.js` |
| T6 | JSDoc yatim di `email-link.js`/`tokens.js`, `require('../errors')` ganda, nama `next` | Diperbaiki |
| T7 | `wrap` didefinisikan ulang per file, `pub` di `email-link.js`, data clump dependensi auth, `isActive` tak terpakai, guard opsional, middle man di `sessions.js` | Ditunda: pola `wrap` lokal sudah dipakai semua modul sebelum B1; perapian lintas modul bukan cakupan paket ini |

D12 (menu "Impor data" Admin Tenant) terjawab oleh B11: Admin Tenant mengimpor lewat `/api/tenant-admin/imports/{dna,tna}/...` (PR #17, kamus kompetensi dan KPI saja); rute impor HR tetap `hr_admin`.
