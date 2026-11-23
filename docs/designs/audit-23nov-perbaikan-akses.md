# Audit 23 Nov: tiga perbaikan akses (PM-6, admin interim, persetujuan INA)

Status: diterapkan di PR audit (base `claude/project-thread-scbrmb`). Temuan berasal dari review ikan mas
dan `mattpocock-skills:code-review` atas PR #8 (laporan: `/mnt/project-files/elgos-eksekusi/audit-pr-23nov/`).

## 1. PM-6: daftar temuan TNA membocorkan temuan non-pelatihan (P1)

**Masalah.** `GET /api/tna/findings` memakai `visibleCategories(tenantId)`, yang mengembalikan
`['training','non_training']` begitu `module.ina` dan `ina.dashboard` menyala, tanpa melihat peran. Atasan
mendapat temuan non-pelatihan timnya lengkap dengan `detail` tanpa izin HR, dan karyawan melihat miliknya
sendiri. Keputusan PM-6: atasan melihat temuan non-pelatihan hanya lewat HR (`/findings/non-training` dengan
izin, flag `tna.non_training_hr`); karyawan tidak melihatnya di layar. Pengecualian yang disengaja: ekspor data milik sendiri
(`employees/index.js`, hak subjek data UU PDP) tetap memuat temuan non-pelatihan miliknya.

**Perubahan.**
- [x] `visibleCategories(tenantId, role)`: selain `hr_admin`/`eta_admin` selalu `['training']`.
- [x] Test: `tests/integration/business-rules-live.test.js` (blok "Audit 23 Nov (P1)").

## 2. Pengelola interim (hr_admin) bisa menaikkan akun menjadi Admin Tenant (P1, eskalasi)

**Masalah.** `INTERIM_ADMIN_ROLES = [hr_admin]` masih berlaku setelah B2. `hr_admin` lolos
`requireTenantAdmin`, lalu lewat `POST /tenant-admin/users` atau `PATCH /users/:id` bisa memberi peran
`tenant_admin` ke siapa pun, melewati aturan B2 bahwa hanya Admin Tenant yang memberi peran. Selain itu
`actor()` hanya membaca `users.role`, sehingga Admin Tenant yang perannya datang dari `user_roles` (bukan
peran utama) selalu ditolak.

**Perubahan (sempit, masa interim TIDAK dihapus).**
- [x] `assertCanGrant`: peran aktif interim tidak boleh memberi `tenant_admin` (403 `ROLE_FORBIDDEN`).
- [x] `assertCanManage`: peran aktif interim tidak boleh mengubah akun yang memegang `tenant_admin` (peran utama atau lewat `user_roles`), termasuk menonaktifkannya.
- [x] `GET /tenant-admin/roles` tidak menawarkan `tenant_admin` ke pengelola interim.
- [x] `actor()` mengembalikan `roles` = peran utama + `user_roles`.
- [x] Test: `tests/integration/tenant-admin.test.js` blok "audit 23 Nov".

**Risiko terkunci `[⏳ DITERIMA]`:** tenant yang di-onboard sebelum B2 dengan pengelola `hr_admin` saja (onboarding
masih mengizinkannya, `core/tenant/onboarding.js:74`) kini tidak bisa membuat Admin Tenant sendiri; Super Admin
(`eta_admin`) yang memberinya lewat `PUT /api/users/:id/roles`. Spek B11 4.2 mensyaratkan migrasi data yang memberi
`tenant_admin` ke pengelola hasil onboarding; migrasi itu belum ada.

**Butuh keputusan user/Andrian:** menghapus `INTERIM_ADMIN_ROLES` seluruhnya (spek B11 bagian 4.2). PR ini
tidak memutuskannya. HR tetap bisa memberi peran selain Admin Tenant selama masa interim.

## 3. Persetujuan verifikasi Improvement Needs menerima versi apa pun (P2, legal)

**Masalah.** `POST /ina/verifications/:id/consent` hanya memeriksa panjang `consentVersion`; TNA, CCA, dan
LIM memeriksanya ke registry `core/consent`. Web sudah mengirim `ina-verifikasi-v1.0`.

**Perubahan.**
- [x] Registry: `ina: ['ina-verifikasi-v1.0']` (draf, menunggu legal, sama statusnya dengan cca/lim).
- [x] Rute menolak versi lain dengan 400 `CONSENT_VERSION_INVALID`.
- [x] Test: `tests/integration/ina.test.js` (versi `v1.0` lama kini ditolak).

[⚠️ BELUM TERVERIFIKASI] Teks persetujuan `ina-verifikasi-v1.0` belum tercantum di draf legal PK-17;
thread legal perlu menambahkannya.

## Review ikan mas (egm-codebase-details) dan triase

| Temuan | Keputusan |
| --- | --- |
| P2 `assertCanManage` hanya cek peran utama; admin lewat `user_roles` bisa dinonaktifkan HR interim | Perbaiki + test |
| P2 tenant pra-B2 dengan `hr_admin` saja tidak bisa membuat Admin Tenant | Tunda, dicatat sebagai risiko diterima; masuk keputusan masa interim |
| P3 `GET /roles` masih menawarkan `tenant_admin` ke HR interim | Perbaiki + test |
| P3 ekspor milik sendiri memuat non-pelatihan | Tolak (hak subjek data); dicatat sebagai pengecualian di spek |
| P3 `visibleCategories` HR tidak cek `tna.non_training_hr` | Tunda (sudah ada sebelum diff; keputusan B5 R7) |
| P2 spek B11 4.2/4.3 dan B9 basi | Perbaiki |
| Nit flag test tanpa `finally` | Perbaiki |
| Nit `array_append(u.role)` redundan dengan trigger | Tolak: pengaman murah bila trigger berubah |
