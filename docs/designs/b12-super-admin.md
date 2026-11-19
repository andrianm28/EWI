# B12 · Super Admin: tenant, modul, dan konfigurasi platform

- **Author:** Claude (thread T2 "Lanjutkan login, peran, dan super admin dengan egm penuh"), untuk review Andrian
- **Status:** Draft (spek v1, sebelum review ikan mas)
- **Date:** 2026-11-19
- **Paket:** B12 brief bangun penuh 19 Nov (`/mnt/project-files/elgos-eksekusi/brief-bangun-penuh-19nov.md`, T2). Menumpuk di atas B1 (`b1-login.md`) dan B2 (`b2-peran.md`) di branch yang sama.
- **ADR:** [`docs/adr/0002-konsol-platform-lintas-tenant.md`](../adr/0002-konsol-platform-lintas-tenant.md) (diusulkan). Istilah: bagian "Platform" di [`CONTEXT.md`](../../CONTEXT.md).

--------------------------------------------------------------------------------

## Overview

Super Admin adalah orang tim ETA (peran `eta_admin`). Hari ini ia hanya bisa menyalakan flag untuk tenant tempat ia login (`/api/admin/flags`), dan tenant baru hanya bisa dibuat operator lewat skrip `scripts/onboard-tenant.js` di server. Paket ini membangun dua layar Super Admin dari mockup final Pak Eji, yaitu **Tenant** dan **Konfigurasi platform**, beserta API-nya, supaya tim ETA bisa menyiapkan tenant pilot (mis. Elitery, 2 Des) dari browser, menyalakan modul per tenant, memantau kesepakatan AI–HR, dan membaca biaya token mingguan, tanpa SQL dan tanpa membuka isi jawaban wawancara.

## The Problem

1. **Tenant dibuat lewat shell.** Menyiapkan tenant baru butuh akses SSH ke etavm2 dan berkas JSON. Akun pengelola pertama dibuat sebagai `hr_admin`, padahal B2 sudah punya peran `tenant_admin` untuk mengurus pengguna dan peran.
2. **Modul per tenant tidak terlihat dari satu tempat.** Flag hanya bisa diubah untuk tenant sendiri; Super Admin tidak bisa melihat tenant mana memakai modul apa.
3. **Kebijakan platform tersebar dan sebagian tidak ada.** Sesi berlaku 8 jam tanpa batas diam (mockup dan brief: "batas waktu sesi 30 menit"). Target kesepakatan AI–HR 85%, retensi audit 12 bulan, anonimisasi agregat, dan persetujuan wajib hanya ada di dokumen.
4. **Kualitas dan biaya AI tidak terpantau.** PM-2 (D) meminta persetujuan HR saat tinjauan dipantau harian. PO-10 (C) meminta laporan biaya AI mingguan tanpa plafon. Data mentahnya sudah ada (`lna_findings.review_status`, `ai_usage_logs`) tetapi tidak ada tampilan.
5. **Percobaan masuk tanpa tenant tidak tercatat di mana pun** (`b1-login.md` §6, ⏳ "log platform menyusul di B12").

## Goals

1. Super Admin melihat daftar semua tenant: nama, slug, status, email Admin Tenant, jumlah pengguna, jumlah modul aktif, dan tiga angka ringkas (tenant aktif, total pengguna, modul tersedia).
2. Super Admin membuat tenant dari nama perusahaan dan email Admin Tenant; akun `tenant_admin` dibuat berstatus `invited` dan undangan 7 hari terkirim. Skrip onboarding ikut menerima `tenant_admin`.
3. Super Admin menyalakan/mematikan delapan modul tenant per tenant. Perubahan tercatat di audit tenant sasaran dan di log platform.
4. Super Admin melihat dan mengubah konfigurasi platform. Batas waktu sesi diam ditegakkan di API (default 30 menit). Nilai lain disimpan dan dibaca paket lain lewat satu getter.
5. Super Admin melihat kesepakatan AI–HR per tenant (30 hari terakhir dan per hari) dibanding target, serta laporan biaya token per tenant per minggu (tampilan dan unduhan CSV).
6. Percobaan masuk ke organisasi atau email yang tidak dikenal tercatat sebagai hitungan per jam di log platform.
7. Tidak ada rute B12 yang mengembalikan isi data karyawan; peran selain `eta_admin` mendapat 403.

## Non-Goals

- Angka akurasi resmi 85% (PM-2 opsi A, transkrip berlabel dua pelabel): milik alat ukur QA malam (B18), bukan B12.
- Plafon biaya atau pemblokiran pemakaian AI (PO-10 = C, tanpa plafon).
- Status bisnis manual tenant seperti "Pilot disiapkan" di data demo mockup; status diturunkan dari data (lihat §Technical Plan).
- Menghapus tenant, mengganti slug, atau merotasi kunci enkripsi dari layar.
- Membuat ulang alur 2FA. Baris "Verifikasi dua langkah" mengikuti keputusan user (kartu 19 Nov, rekomendasi: tidak dipakai; lihat Open Questions).
- Pemilihan model AI per tenant. Baris "Model AI wawancara" menampilkan penyedia dan model dari konfigurasi server; mengganti model tetap lewat env/deploy.
- Penghapusan audit otomatis setelah 12 bulan. Data tertua baru berumur Nov 2026, jadi job retensi tidak dibutuhkan sebelum Nov 2027 `[⏳ DITERIMA]` (dicatat sebagai pekerjaan infra; nilai kebijakan disimpan sekarang).
- Layar untuk tenant mana pun selain dua layar Super Admin (Admin Tenant adalah B11, PR #17).

## Open Questions

- **2FA** (kartu keputusan di thread, 19 Nov): rekomendasi "Tanpa 2FA, cukup link email". Spek ini memakai rekomendasi itu: baris 2FA tampil "Tidak dipakai (login lewat link email, PD-10)" dan tidak bisa diubah. Bila user memilih lain, butir 2FA ditambah di PR lanjutan.
- `[⚠️ BELUM TERVERIFIKASI]` **Entitlement saat modul dinyalakan.** `requireSubmodule()` butuh entitlement aktif dan flag. Spek ini: menyalakan modul CCA/DNA/TNA/INA juga menambah entitlement `source='platform'` bila belum ada yang aktif; mematikan hanya mematikan flag (entitlement tidak diakhiri). Alasannya: Super Admin adalah tim ETA yang menjual akses, dan tanpa ini tenant baru dari layar tidak pernah bisa memakai modul. Perlu dikonfirmasi Andrian di review.
- `[⚠️ BELUM TERVERIFIKASI]` **Penyedia kunci di etavm2.** Bila produksi memakai KMS, onboarding mewajibkan UUID tenant yang sudah dibuat Terraform (`requireId`). Formulir layar menampilkan kolom "ID tenant (dari infra)" hanya bila API melaporkan penyedia `kms`.

## Critical User Journeys (CUJs)

### CUJ 1: Menyiapkan tenant pilot

- **Given**: Super Admin login (link email, `ETA_ADMIN_EMAILS` memuat emailnya), flag `platform.console` menyala di tenant tempat ia login.
- **When**: di layar Tenant ia mengisi "Nama perusahaan" = `PT Contoh` dan "Email admin tenant" = `admin@contoh.co.id`, lalu menekan "Buat tenant".
- **Then**: tenant `pt-contoh` muncul di tabel dengan status "Menunggu admin", akun `admin@contoh.co.id` berperan `tenant_admin` berstatus `invited`, email undangan terkirim (berlaku 7 hari), satu baris `create tenant` di audit tenant baru dan di log platform. Mengulang dengan slug yang sama menjawab 409 tanpa menggandakan apa pun.

### CUJ 2: Menyalakan modul Training Needs untuk satu tenant

- **Given**: tenant `pt-contoh` terdaftar, modul Training Needs mati.
- **When**: Super Admin memilih baris `PT Contoh`, lalu menyalakan "Training Needs".
- **Then**: flag `module.tna` tenant itu menyala, entitlement `tna` aktif (dibuat bila belum ada), kolom "Modul aktif" menjadi `1 / 8`, Admin Tenant `pt-contoh` melihat baris audit "update feature_flag module.tna" di audit tenantnya.

### CUJ 3: Sesi diam berakhir

- **Given**: konfigurasi platform `sessionIdleMinutes = 30`.
- **When**: pengguna mana pun tidak memanggil API selama lebih dari 30 menit, lalu memanggil API lagi.
- **Then**: API menjawab 401 `SESSION_IDLE`, sesi dicabut, web kembali ke layar login dengan pesan "Sesi berakhir karena tidak aktif 30 menit."

### CUJ 4: Memantau kualitas dan biaya AI

- **Given**: tenant Elitery punya 40 temuan TNA yang sudah ditinjau HR dalam 30 hari (34 disetujui tanpa diubah, 4 diubah, 2 ditolak), dan baris `ai_usage_logs` minggu ini.
- **When**: Super Admin membuka Konfigurasi platform.
- **Then**: kartu "Kesepakatan AI–HR" menampilkan Elitery 85% (34/40) bertanda "memenuhi target 85%", grafik per hari, dan tabel biaya per minggu (sesi, token masuk, token keluar, biaya US$). Tombol "Unduh CSV" memberi berkas yang sama. Tidak ada teks temuan atau transkrip di jawaban API.

### CUJ 5: Pengguna selain Super Admin mencoba konsol

- **Given**: akun `tenant_admin` atau `hr_admin` login.
- **When**: ia memanggil `GET /api/platform/tenants`.
- **Then**: 403 `ROLE_FORBIDDEN`. Menu Tenant/Konfigurasi platform tidak muncul.

## Technical Plan (Architecture)

### Akses dan flag

- Router baru `platformRouter` di `src/modules/platform/routes.js`, dipasang di **`/api/platform`** dengan `auth` dan `tenantContext()` (Super Admin tetap login ke satu tenant) lalu gerbang `onlyEtaAdmin` (pindah dari `core/flags/admin-routes.js` ke `core/rbac/guards.js` agar dipakai bersama). Peran yang diperiksa adalah **peran aktif** `req.user.role` (kontrak B2).
- Flag baru `platform.console` (`FLAGS.PLATFORM_CONSOLE`), default mati, diperiksa pada tenant tempat Super Admin login. Ini pengaman rilis; Super Admin menyalakannya untuk tenant ETA lewat `/api/admin/flags` atau spesifikasi onboarding.
- Pengecualian aturan 2: hanya router ini yang membaca `:tenantId` dari path (ADR 0002). Validasi: UUID, tenant ada; selain itu 404.

### Status tenant (diturunkan, tanpa kolom baru)

| Status | Aturan |
| --- | --- |
| Aktif | ada minimal satu akun `tenant_admin` atau `hr_admin` berstatus `active` |
| Menunggu admin | ada akun pengelola, semuanya `invited` |
| Draf | tidak ada akun pengelola |

Kolom "Admin tenant" = email akun `tenant_admin` pertama (urut dibuat), selain itu `hr_admin` pertama. "Pengguna" = jumlah akun berstatus selain `inactive`.

### Delapan modul tenant

Registri tetap `src/modules/platform/modules.js`, urutan mengikuti mockup:

| Modul | Flag | Entitlement | Akses awal |
| --- | --- | --- | --- |
| Core Competencies | `module.cca` | `cca` | ya |
| Developmental Needs | `module.dna` | `dna` | |
| Training Needs | `module.tna` | `tna` | |
| Improvement Needs | `module.ina` | `ina` | |
| Learning Intervention | `module.li` | – | |
| Learning Delivery | `module.ld` | – | |
| Learning Impact Measurement | `module.impact` | – | |
| Career & Promotion | `promotion.recommendation` | – | |

Flag yang belum terdaftar di `FLAGS` (karena paketnya belum masuk branch ini: B13/B14/B15) tampil "Belum tersedia" dan tidak bisa dinyalakan (`available: false`). Saat paket itu menambah flag-nya, registri cukup diubah satu baris; nama flag di tabel ini `[⚠️ BELUM TERVERIFIKASI]` terhadap PR #23 dan B15 dan disesuaikan saat penggabungan.

### Membuat tenant

`POST /api/platform/tenants { name, adminEmail, adminName?, id? }`:

1. Slug diturunkan dari nama (huruf kecil, non-alfanumerik jadi `-`, maks 64). Slug sudah dipakai → 409 `TENANT_EXISTS` (tidak menambah akhiran otomatis, supaya slug login dapat ditebak).
2. Memanggil `onboardTenant()` yang sudah ada (PK-13) dengan spesifikasi `{ id, slug, name, products: [], users: [{ email, role: 'tenant_admin', name }] }`. Onboarding diubah: `tenant_admin` masuk `ADMIN_ROLES`, syarat "minimal satu hr_admin" menjadi "minimal satu `tenant_admin` atau `hr_admin`", dan `products` boleh kosong (modul dinyalakan kemudian). Koneksi: klien pg mentah dari `sequelize.connectionManager` dengan `search_path` schema, karena onboarding memakai `BEGIN/COMMIT` sendiri.
3. Mengirim undangan lewat layanan link yang sudah ada (`links.issue(user, 'invite', { createdBy, tenantName })`). Gagal kirim email tidak membatalkan tenant; jawaban memuat `invitation: 'failed'` dan Super Admin bisa mengulang lewat `POST /api/platform/tenants/:tenantId/invite`.
4. Audit: onboarding sudah menulis `tenant.onboarding` di audit tenant baru; rute menambah satu baris log platform `tenant.create`.

### Konfigurasi platform

Tabel baru `platform_settings` satu baris per kunci. Kunci yang dikenal (nilai bawaan bila baris tidak ada):

| Kunci | Tipe | Bawaan | Ditegakkan di | Bisa diubah di layar |
| --- | --- | --- | --- | --- |
| `sessionIdleMinutes` | bilangan 5–480 | 30 | `sessions.check` (B12) | ya |
| `aiHrAgreementTarget` | persen 50–100 | 85 | kartu kualitas AI | ya |
| `auditRetentionMonths` | bilangan 12–84 | 12 | ⏳ job infra | ya |
| `anonymizeAggregates` | boolean | true | dibaca B3 lewat getter | ya |
| `consentRequired` | boolean, terkunci `true` | true | modul consent (sudah ada) | tidak |
| `tenantIsolation` | tampilan | "Isolasi per tenant" | arsitektur | tidak |
| `encryption` | tampilan | penyedia kunci (`local`/`kms`) dari `stores.cipher` | – | tidak |
| `aiModel` | tampilan | penyedia + model dari konfigurasi AI | – | tidak |
| `ssoTenants` | tampilan | jumlah tenant dengan `auth.sso` menyala | – | tidak (per tenant lewat modul flag) |
| `mfa` | tampilan | "Tidak dipakai (PD-10)" | – | tidak |

Getter `platformSettings.get(key)` di `src/core/platform-settings/index.js` dengan cache dalam proses 60 detik; paket lain membaca lewat getter ini, tidak membaca tabel langsung. `PUT /api/platform/settings { key: value, ... }` memvalidasi semua kunci sekaligus (kunci tak dikenal atau terkunci → 400), menulis dalam satu transaksi, dan mencatat satu baris log platform per kunci yang berubah (`from`, `to`).

### Sesi diam

- Kolom baru `auth_sessions.last_seen_at timestamptz` (diisi `created_at` untuk baris lama).
- `sessions.check(claims)` membaca `sessionIdleMinutes` lewat getter. Bila `now - last_seen_at` melewati batas: sesi dicabut (`revoked_at`), jawaban `{ ok: false, code: 'SESSION_IDLE' }`, middleware menjawab 401 kode `SESSION_IDLE`. Bila tidak, `last_seen_at` diperbarui paling sering sekali per 60 detik per sesi (`UPDATE ... WHERE last_seen_at < now() - interval '60 seconds'`), supaya tiap request tidak menulis.
- Web: `api/client.ts` mengenali `SESSION_IDLE` dan mengarahkan ke login dengan pesan di CUJ 3.

### Kesepakatan AI–HR (PM-2 opsi C)

Per tenant, jendela 30 hari pada `reviewed_at`: `agreement = approved / (approved + edited + rejected)` dari `lna_findings` (`review_status`, bukan `draft`). Hanya hitungan; tidak ada kolom teks. Tenant dengan kurang dari 10 temuan ditinjau tampil "Data belum cukup (n < 10)" dan tidak diberi tanda lulus/gagal. Seri harian = hitungan yang sama per tanggal (zona Asia/Jakarta).

### Laporan biaya token mingguan (PO-10 opsi C)

Dari `ai_usage_logs`, per tenant per minggu ISO (Senin, Asia/Jakarta), 8 minggu terakhir: jumlah sesi berbeda, panggilan, token masuk, token keluar, `sum(cost_usd)` (baris tanpa biaya dihitung 0 dan diberi tanda "biaya belum tercatat" bila ada). `GET /api/platform/ai-cost?weeks=8` (JSON) dan `?format=csv` (berkas `elgos-biaya-ai-<tanggal>.csv`).

### Log platform

Tabel baru `platform_audit_logs` (tanpa `tenant_id` wajib), append-only seperti `audit_logs` (trigger yang sama menolak UPDATE/DELETE):

- `actor_user_id`, `actor_tenant_id` (boleh kosong), `action` (`create`, `update`, `login`), `resource` (`tenant`, `tenant.module`, `platform.setting`, `auth.attempt.unknown`), `target_tenant_id` (boleh kosong), `meta` jsonb, `at`.
- Percobaan masuk tanpa tenant dikenal ditulis lewat `createAttemptLog` sebagai **hitungan per jam**: satu baris per `(jam, outcome)` dengan `meta.count` dinaikkan memakai tabel pendamping `platform_attempt_counters (hour, outcome, count)` yang boleh di-UPDATE; log append-only hanya menerima ringkasan saat jam berganti. `[⚠️ BELUM TERVERIFIKASI]` Disederhanakan menjadi tabel penghitung saja bila reviewer menilai baris ringkasan berlebihan. Tidak ada email atau IP mentah yang disimpan; IP hanya dihitung lewat limiter yang sudah ada.
- `GET /api/platform/log?limit=50` menampilkan baris terbaru di layar Konfigurasi platform.

### Diagram

```text
web (tampilan super)
  screens/b12-super-admin/
    TenantsView  ── GET  /api/platform/tenants
                 ── POST /api/platform/tenants
                 ── GET/PUT /api/platform/tenants/:tenantId/modules[/:moduleKey]
    PlatformView ── GET/PUT /api/platform/settings
                 ── GET /api/platform/ai-quality, /api/platform/ai-cost
                 ── GET /api/platform/log
api
  /api/platform  auth → tenantContext → requireFlag(platform.console) → onlyEtaAdmin
     └ createPlatformService({ store, flags, onboard, links, platformLog, settings })
          store (Postgres): tenants+users+entitlements+feature_flags+lna_findings+ai_usage_logs (agregat)
          onboard: core/tenant/onboarding.js (PK-13)
  sessions.check ── platformSettings.get('sessionIdleMinutes')
  attempts.record (tanpa tenant) ── platformLog.countAttempt(outcome)
```

### Antarmuka modul (codebase-design)

`createPlatformService` adalah modul dalam: rute hanya memetakan HTTP ke satu method dan tidak menyentuh SQL. Method: `listTenants()`, `createTenant(actor, input)`, `reinvite(actor, tenantId)`, `listModules(tenantId)`, `setModule(actor, tenantId, moduleKey, enabled)`, `aiQuality({ days })`, `aiCost({ weeks })`. Konfigurasi ada di modul terpisah `platformSettings` (`get`, `all`, `update(actor, patch)`) karena dibaca jalur login di setiap request. Hanya ada adapter Postgres; test integrasi memakai Postgres seperti test paket lain (satu adapter, tidak dibuat seam palsu).

## Alternatives Considered

### Alternative A: Simpan status tenant sebagai kolom `tenants.status`

- **Pros**: bisa memuat status bisnis "Pilot disiapkan".
- **Cons**: status manual cepat basi dan butuh layar ubah status; mockup hanya memakai tiga nilai yang bisa diturunkan dari akun pengelola.
- **Reason for Rejection**: Rejected by author: tidak ada keputusan bisnis yang meminta status manual; diturunkan dari data selalu benar.

### Alternative B: Konfigurasi platform di env/deploy saja

- **Pros**: tanpa tabel dan tanpa layar ubah.
- **Cons**: mockup meminta Super Admin mengatur kebijakan dari layar dan perubahan dicatat di log platform; perubahan env butuh deploy oleh infra.
- **Reason for Rejection**: Rejected by author: bertentangan dengan mockup final.

### Alternative C: Tenant dibuat langsung dengan SQL di rute, tanpa onboarding PK-13

- **Pros**: tidak perlu klien pg mentah.
- **Cons**: menggandakan aturan kunci enkripsi, entitlement, idempotensi, dan audit yang sudah dites di `onboarding.test.js`.
- **Reason for Rejection**: Rejected by author: satu sumber kebenaran untuk pembuatan tenant.

## Non-Functional Requirements

- **Keamanan dan privasi**: rute platform hanya mengembalikan metadata dan agregat; test memeriksa bahwa jawaban tidak memuat kunci `answer`, `transcript`, `text`, `quote`, atau `summary`. Super Admin tetap tidak bisa membaca transkrip (`TRANSCRIPT_PRIVATE`, PR #11).
- **Kinerja**: daftar tenant satu query agregat (jumlah tenant puluhan). Sesi diam menambah satu UPDATE per sesi per menit paling banyak.
- **Rollout**: flag `platform.console` mati = semua rute platform 403 `FEATURE_DISABLED`, menu tidak tampil. Sesi diam aktif begitu migrasi jalan (bawaan 30 menit) `[⏳ DITERIMA]`: ini perubahan perilaku untuk semua pengguna; dapat dilonggarkan lewat `PUT /api/platform/settings` tanpa deploy. Rollback: migrasi `down` menghapus dua tabel baru dan kolom `last_seen_at`.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

### Migrasi (blok `20261119001200–99`)

- [ ] `apps/api/migrations/20261119001200-platform.js`: tabel `platform_settings (key varchar(64) PK, value jsonb NOT NULL, updated_by uuid NULL REFERENCES users ON DELETE SET NULL, updated_at timestamptz)`; tabel `platform_audit_logs` (kolom di §Log platform, indeks `at DESC`) dengan trigger append-only memakai fungsi yang sudah ada dari migrasi `20261113000005`; tabel `platform_attempt_counters (hour timestamptz, outcome varchar(32), count integer, PRIMARY KEY (hour, outcome))`; kolom `auth_sessions.last_seen_at` (isi awal `created_at`, NOT NULL DEFAULT now()); CHECK `entitlements.source` ditambah `'platform'` bila kolom itu punya CHECK. `down` membalik semuanya. Hak akses role aplikasi mengikuti pola `20261117000200-app-role-grants.js`.

### API

- [ ] `apps/api/src/core/flags/index.js`: `PLATFORM_CONSOLE: 'platform.console'`.
- [ ] `apps/api/src/core/rbac/guards.js` (baru): `onlyEtaAdmin` dipindah dari `core/flags/admin-routes.js`; `admin-routes.js` mengimpornya (perilaku sama).
- [ ] `apps/api/src/core/tenant/onboarding.js`: `tenant_admin` di `ADMIN_ROLES`; syarat pengelola `tenant_admin` atau `hr_admin`; `products` boleh kosong. Test `tests/unit/onboarding.test.js` diperbarui; `docs/ewi/onboarding-tenant.md` disesuaikan.
- [ ] `apps/api/src/core/platform-settings/index.js` (baru): definisi kunci (tabel di atas), validasi, `get/all/update`, cache 60 detik, store Postgres.
- [ ] `apps/api/src/core/platform-log/index.js` (baru): `record(actor, action, resource, { targetTenantId, meta })`, `countAttempt(outcome)`, `recent(limit)`.
- [ ] `apps/api/src/core/auth/sessions.js` + store di `apps/api/src/db/stores.js`: `last_seen_at`, pemeriksaan diam, sentuh paling sering 60 detik; memory store ikut agar test lama tetap jalan.
- [ ] `apps/api/src/core/auth/middleware.js`: kode `SESSION_IDLE` diteruskan seperti `ROLE_VIEW_CHANGED`.
- [ ] `apps/api/src/core/auth/attempts.js`: bila `who.tenantId` kosong dan `platformLog` diberikan, panggil `countAttempt(meta.outcome)`; pemanggil untuk organisasi/email tak dikenal di `routes.js` dan `email-link.js` memanggil `attempts.record({ tenantId: null }, { outcome: 'unknown_org' | 'unknown_account' | 'invalid_link' })`.
- [ ] `apps/api/src/modules/platform/modules.js` (baru): registri delapan modul.
- [ ] `apps/api/src/modules/platform/service.js` (baru): `createPlatformService` (method di §Antarmuka).
- [ ] `apps/api/src/modules/platform/store.js` (baru): query Postgres agregat.
- [ ] `apps/api/src/modules/platform/routes.js` (baru): rute di diagram; validasi input; CSV.
- [ ] `apps/api/src/app.js`: pasang `/api/platform`; berikan `platformLog` ke `createAttemptLog`, `platformSettings` ke sesi.
- [ ] `apps/api/src/core/rbac/menu.js`: butir `tenants` dan `platform` untuk tampilan `super` di balik `platform.console`.

### Web

- [ ] `apps/web/src/api/platform.ts` (baru): klien tipe untuk rute platform.
- [ ] `apps/web/src/screens/b12-super-admin/routes.ts` (baru): rute `tenants` (beranda tampilan super) dan `platform`, gerbang `views: ['super']`, `flag: 'platform.console'` (kontrak B0).
- [ ] `apps/web/src/screens/b12-super-admin/TenantsView.vue` (baru): tiga KPI, tabel tenant, panel modul untuk tenant terpilih, formulir "Buat tenant baru" (nama, email; kolom ID bila penyedia `kms`), pesan sukses/galat.
- [ ] `apps/web/src/screens/b12-super-admin/PlatformView.vue` (baru): empat kartu mockup (Isolasi data, Model AI wawancara, Kebijakan bawaan, Autentikasi) + kartu Kesepakatan AI–HR, Biaya token mingguan (unduh CSV), Log platform.
- [ ] `apps/web/src/api/client.ts`: tangani `SESSION_IDLE`.
- [ ] `apps/web/e2e/super-admin.spec.ts` (baru) dengan API mock; perbarui `loginAs` di `e2e/poc-dna-tna.spec.ts` dan `e2e/gating.spec.ts` bila Super Admin kini mendarat di `tenants`.

### Test yang ditulis lebih dulu (tdd)

- [ ] `tests/integration/platform.test.js` (Postgres): 403 untuk `tenant_admin`, `hr_admin`, `learner`; 403 `FEATURE_DISABLED` saat flag mati; daftar tenant dengan status turunan dan jumlah; buat tenant (akun `tenant_admin` invited, undangan, log platform, 409 slug ganda); modul nyala/mati (flag, entitlement `platform`, audit tenant sasaran, modul belum tersedia 400); kunci isi data tidak pernah muncul di jawaban.
- [ ] `tests/integration/platform-settings.test.js`: validasi kunci, kunci terkunci 400, log per kunci, getter memakai nilai baru setelah cache habis.
- [ ] `tests/integration/platform-ai.test.js`: kesepakatan 30 hari (34/40 = 85%), n < 10, biaya mingguan dan CSV.
- [ ] `tests/unit/sessions-idle.test.js`: sesi lewat batas → `SESSION_IDLE` dan dicabut; sentuh paling sering 60 detik.
- [ ] `tests/unit/attempts.test.js`: percobaan tanpa tenant menaikkan penghitung, tidak menulis audit tenant.
- [ ] `tests/unit/onboarding.test.js`: `tenant_admin` diterima; tanpa pengelola ditolak; `products` kosong diterima.

### Dokumen

- [ ] `docs/designs/b18-e2e-qa-malam.md` tabel 3.3: baris alur "Super Admin membuat tenant → Admin Tenant menerima undangan → modul dinyalakan → HR melihat menu".
- [ ] Spek ini: centang item, tambah bagian Review spek, Review diff, Code review, Drift.
