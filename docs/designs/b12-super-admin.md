# B12 · Super Admin: tenant, modul, dan konfigurasi platform

- **Penulis:** Claude (thread T2), untuk review Andrian
- **Status:** Draft (spek v6, setelah egm-review tahap 5–9; 2FA diputuskan tidak dipakai)
- **Tanggal:** 2026-11-19, revisi 2026-11-23
- **Paket:** B12 dalam brief bangun penuh 19 Nov (bagian T2). Menumpuk di atas B1 ([`b1-login.md`](b1-login.md)) dan B2 ([`b2-peran.md`](b2-peran.md)) di branch yang sama.
- **ADR:** [`docs/adr/0002-konsol-platform-lintas-tenant.md`](../adr/0002-konsol-platform-lintas-tenant.md) (diusulkan). Istilah: bagian "Platform" di [`CONTEXT.md`](../../CONTEXT.md).

## Rujukan dan istilah

- **Aturan arsitektur** = daftar bernomor di `CLAUDE.md`. Paket ini melonggarkan **aturan 2** ("Setiap query data bisnis memfilter `tenant_id` dari `req.tenantId`, tidak pernah dari body/query") untuk satu router saja (ADR 0002), dan mematuhi **aturan 3** (fitur baru di balik flag baru, default mati).
- **Mockup final** = `Main.dc.html` di folder proyek `mockup-pak-eji/` ([artifact](https://claude.ai/artifact/3pRkbt7pJexZqgnFsUGJud)). Layar Super Admin "Tenant" dan "Konfigurasi platform" sekitar baris 1198–1232, data demo sekitar baris 1983–1995.
- **Kode keputusan** (log grilling `ewi-grilling/gap-audit-17nov.md` di folder proyek): **PM-2 = D**, yaitu akurasi resmi per temuan dari transkrip berlabel dua pelabel (opsi A) ditambah kesepakatan AI–HR saat tinjauan dipantau harian (opsi C); paket ini membangun bagian C saja. **PO-10 = C**: tanpa plafon biaya, laporan biaya mingguan. **PD-10 = B**: login hanya lewat link email sekali pakai. **PK-13**: onboarding tenant lewat skrip (PR #9, `core/tenant/onboarding.js`). **PK-16**: sesi yang bisa dicabut dan daftar `ETA_ADMIN_EMAILS`. **R2-1**: flag hanya diubah Super Admin. **R2-2**: audit gagal ditulis berarti request gagal.
- **Paket lain**: B0 fondasi UI ([`b0-fondasi-ui.md`](b0-fondasi-ui.md), kontrak rute per tampilan), B1 login, B2 peran, B3 dashboard HR, B11 Admin Tenant (PR #17), B13/B14 Learning Intervention/Delivery, B15 Impact Measurement, B16 Career & Promotion, B18 e2e dan QA malam.
- **Kontrak B2**: satu akun boleh punya beberapa peran; `req.user.role` adalah **peran aktif** sesi (tampilan yang sedang dipakai) dan satu-satunya dasar otorisasi. `ROLE_VIEW_CHANGED` adalah jawaban 401 B2 saat peran aktif diganti di tab lain; web memuat ulang, bukan menganggap sesi habis.
- **Super Admin** = akun berperan `eta_admin`. Akun ini milik satu tenant (tenant internal ETA) dan hanya bisa login bila emailnya ada di env `ETA_ADMIN_EMAILS` (PK-16). Peran `eta_admin` selalu tunggal. Flag `platform.console` di tenant ETA dinyalakan pertama kali lewat spesifikasi onboarding atau `PUT /api/admin/flags/platform.console` (rute R2-1 yang sudah ada, hanya Super Admin).
- **Akun pengelola** = akun berperan `tenant_admin` (Admin Tenant) atau `hr_admin` di satu tenant.
- **Log audit platform** = tabel `platform_audit_logs` (tindakan pelaku yang login). **Hitungan percobaan** = tabel `platform_attempt_counters` (telemetri percobaan masuk tanpa tenant). Keduanya berbeda dari **audit tenant** (`audit_logs`).
- **Penanda**: `[⚠️ BELUM TERVERIFIKASI]` = asumsi yang belum dibuktikan; `[⏳ DITERIMA]` = risiko yang diterima secara sadar, dengan pekerjaan lanjutan.

--------------------------------------------------------------------------------

## Overview

Super Admin adalah orang tim ETA. Hari ini ia hanya bisa menyalakan flag untuk tenant tempat ia login (`/api/admin/flags`), dan tenant baru hanya bisa dibuat operator lewat skrip `scripts/onboard-tenant.js` di server.

Paket ini membangun dua layar Super Admin dari mockup final, yaitu **Tenant** dan **Konfigurasi platform**, beserta API-nya. Tim ETA bisa menyiapkan tenant pilot (mis. Elitery, 2 Des), menyalakan modul per tenant, memantau kesepakatan AI–HR, dan membaca biaya token mingguan dari browser. Layar menggantikan SSH dan berkas JSON; di produksi langkah Terraform untuk kunci enkripsi tetap terjadi lebih dulu (lihat Non-Goals). Super Admin tidak pernah melihat isi jawaban wawancara.

## The Problem

1. **Tenant dibuat lewat shell.** Menyiapkan tenant baru butuh akses SSH ke etavm2 dan berkas JSON. Akun pengelola pertama dibuat sebagai `hr_admin`, padahal B2 sudah punya peran `tenant_admin` untuk mengurus pengguna dan peran.
2. **Modul per tenant tidak terlihat dari satu tempat.** Flag hanya bisa diubah untuk tenant sendiri; Super Admin tidak bisa melihat tenant mana memakai modul apa.
3. **Kebijakan platform hanya ada di dokumen.** Sesi berlaku 8 jam tanpa batas diam, padahal mockup dan brief menulis "batas waktu sesi 30 menit". Target kesepakatan AI–HR 85%, retensi audit 12 bulan, anonimisasi agregat, dan persetujuan karyawan wajib hanya ada di brief dan mockup.
4. **Kualitas dan biaya AI tidak terpantau.** PM-2 (bagian C) meminta kesepakatan AI–HR dipantau harian. PO-10 meminta laporan biaya AI mingguan. Data mentahnya sudah ada (`lna_findings.review_status`, `ai_usage_logs`) tetapi tidak ada tampilan.
5. **Percobaan masuk tanpa tenant tidak tercatat di mana pun** (`b1-login.md` §6, `[⏳ DITERIMA]` "log platform menyusul di B12").

## Goals

1. Super Admin melihat daftar semua tenant: nama, slug, status, email Admin Tenant, jumlah pengguna, jumlah modul aktif, dan tiga angka ringkas (tenant aktif, total pengguna, modul tersedia).
2. Super Admin membuat tenant dari nama perusahaan dan email Admin Tenant (di produksi juga UUID dari Terraform); akun `tenant_admin` dibuat berstatus `invited` dan undangan 7 hari terkirim. Skrip onboarding ikut menerima `tenant_admin`.
3. Super Admin menyalakan/mematikan delapan modul tenant per tenant. Perubahan tercatat di audit tenant sasaran dan di log audit platform.
4. Super Admin melihat konfigurasi platform dan mengubah dua nilai yang sudah punya pemakai: batas waktu sesi diam (bawaan 30 menit, ditegakkan di tenant yang flag `auth.session_idle`-nya menyala) dan target kesepakatan AI–HR (bawaan 85%). Kebijakan lain tampil sebagai teks tetap seperti di mockup.
5. Super Admin melihat kesepakatan AI–HR per tenant (30 hari terakhir dan per hari) dibanding target, serta laporan biaya token per tenant per minggu (tabel dan unduhan CSV).
6. Percobaan masuk ke tenant atau email yang tidak dikenal, dan link masuk yang tidak valid, tercatat sebagai hitungan per jam tanpa email atau IP (menutup B1 §6).
7. Rute B12 tidak mengembalikan isi jawaban, transkrip, atau teks temuan. Satu-satunya data pribadi di jawabannya adalah email Admin Tenant. Pengguna selain Super Admin mendapat 403.

## Non-Goals

- Angka akurasi resmi 85% (PM-2 opsi A, transkrip berlabel dua pelabel): milik alat ukur QA malam (B18).
- Plafon biaya atau pemblokiran pemakaian AI (PO-10 = C).
- Membuat kunci KMS dari API. Produksi memakai KMS (`deploy/vps/docker-compose.yml`: `ENCRYPTION_PROVIDER: kms`), dan onboarding mewajibkan UUID tenant yang aliasnya sudah dibuat Terraform (`tenant_ids` di `infra/live/<env>`). Langkah Terraform tetap dilakukan thread infra sebelum tenant dibuat di layar.
- Status bisnis manual tenant seperti "Pilot disiapkan" di data demo mockup, serta menangguhkan/mengaktifkan tenant dari layar (kolom `tenants.status` hanya dibaca).
- Menghapus tenant, mengganti slug, atau merotasi kunci enkripsi dari layar.
- Saklar 2FA: user memutuskan 19 Nov 22.08 WIB "Tanpa 2FA, cukup link email"; kode 2FA sudah dilepas dari B1.
- Pemilihan model AI per tenant. Baris "Model AI wawancara" menampilkan penyedia dan model dari konfigurasi server.
- Penghapusan audit otomatis setelah 12 bulan. Data audit tertua dibuat Nov 2026, jadi job retensi baru dibutuhkan Nov 2027 `[⏳ DITERIMA]`.
- Layar untuk peran lain (Admin Tenant adalah B11, PR #17).

## Open Questions

Tidak ada. Satu-satunya pertanyaan terbuka (2FA) sudah diputuskan user 19 Nov: tanpa 2FA. Baris "Verifikasi dua langkah" di Konfigurasi platform berisi teks tetap "Tidak dipakai (login lewat link email, PD-10)".
- `[⚠️ BELUM TERVERIFIKASI]` **Entitlement saat modul dinyalakan.** Spek ini: menyalakan modul CCA/DNA/TNA/INA juga menambah entitlement `source='platform'` bila tenant belum punya entitlement aktif untuk produk itu atau `full_suite`; mematikan hanya mematikan flag. Perlu dikonfirmasi Andrian (alternatif di §Alternatives Considered E).

## Critical User Journeys (CUJs)

### CUJ 1: Menyiapkan tenant pilot

- **Given**: Super Admin login dan flag `platform.console` menyala di tenant ETA. Di produksi, thread infra sudah menambah UUID tenant ke `tenant_ids` dan menjalankan `terraform apply`.
- **When**: di layar Tenant ia mengisi "Nama perusahaan" = `PT Contoh`, "Email admin tenant" = `admin@contoh.co.id`, dan (produksi) "ID tenant (dari infra)", menekan "Periksa", melihat slug `pt-contoh`, lalu menekan "Buat tenant".
- **Then**: tenant `pt-contoh` muncul berstatus "Menunggu admin"; akun `admin@contoh.co.id` berperan `tenant_admin` berstatus `invited`; undangan 7 hari terkirim; satu baris `create tenant.onboarding` di audit tenant baru (pelaku "Super Admin ELGOS") dan satu baris `create tenant` di log audit platform, keduanya dalam transaksi pembuatan tenant. Mengirim ulang nama yang menghasilkan slug yang sama menjawab 409 `TENANT_EXISTS` tanpa menyentuh tenant itu.

### CUJ 2: Undangan gagal terkirim

- **Given**: tenant `pt-contoh` dibuat, tetapi pengiriman email gagal (jawaban `invitation: 'failed'`).
- **When**: Super Admin menekan "Kirim ulang undangan" di baris tenant.
- **Then**: link baru terkirim ke Admin Tenant yang masih `invited` dan belum pernah login; baris audit tenant `create invitation` dan log audit platform `create tenant.invitation`. Bila Admin Tenant sudah `active`, jawaban 409 `ADMIN_ALREADY_ACTIVE`. Lebih dari 3 kiriman per tenant per 15 menit menjawab 429.

### CUJ 3: Menyalakan modul Training Needs untuk satu tenant

- **Given**: tenant `pt-contoh` terdaftar, modul Training Needs mati, tidak ada kill switch untuk `module.tna`.
- **When**: Super Admin memilih baris `PT Contoh`, lalu menyalakan "Training Needs".
- **Then**: flag `module.tna` tenant itu menyala, entitlement `tna` aktif (dibuat bila belum ada), panel menampilkan "Akses: ya · Aktif: ya", kolom "Modul aktif" menjadi `1 / 8`, Admin Tenant melihat baris audit "update feature_flag module.tna" (pelaku "Super Admin ELGOS"), dan log audit platform mencatat `update tenant.module`.

### CUJ 4: Mengubah batas sesi diam

- **Given**: `sessionIdleMinutes = 30`.
- **When**: Super Admin mengubahnya menjadi 15 di layar Konfigurasi platform dan mengonfirmasi peringatan "Sesi yang sudah diam lebih dari 15 menit akan berakhir".
- **Then**: log audit platform mencatat `update platform.setting` dengan `from: 30, to: 15`; API langsung memakai nilai baru (cache dikosongkan saat update; API berjalan satu proses per lingkungan di etavm2).

### CUJ 5: Sesi diam berakhir

- **Given**: tenant pengguna punya flag `auth.session_idle` menyala dan `sessionIdleMinutes = 30`.
- **When**: pengguna tidak mengetik, mengeklik, atau memanggil API selama lebih dari 30 menit, lalu memanggil API lagi.
- **Then**: API menjawab 401 `SESSION_IDLE`, sesi dicabut, web kembali ke layar login dengan pesan "Sesi berakhir karena tidak aktif. Silakan masuk lagi." Pengguna yang sedang mengetik jawaban panjang tidak terkena, karena web mengirim tanda aktivitas selama ada interaksi.

### CUJ 6: Memantau kualitas dan biaya AI

- **Given**: tenant Elitery punya 40 temuan hasil analisis AI yang ditinjau HR dalam 30 hari (34 disetujui tanpa diubah, 4 diubah, 2 ditolak), dan baris `ai_usage_logs` minggu ini.
- **When**: Super Admin membuka Konfigurasi platform.
- **Then**: kartu "Kesepakatan AI–HR" menampilkan Elitery 85% (34/40) bertanda "memenuhi target 85%", grafik per hari, dan tabel biaya per minggu (sesi, token masuk, token keluar, biaya US$). "Unduh CSV" memberi data yang sama dengan tabel. Jawaban API tidak memuat teks temuan atau transkrip.

### CUJ 7: Melihat percobaan masuk tanpa tenant

- **Given**: dalam 7 hari terakhir ada 12 permintaan link masuk ke slug tenant yang tidak ada.
- **When**: Super Admin membuka Konfigurasi platform.
- **Then**: kartu "Percobaan masuk tanpa tenant" menampilkan hitungan per hari per jenis (`unknown_org` = 12), tanpa email atau IP.

### CUJ 8: Pengguna selain Super Admin mencoba konsol

- **Given**: akun `tenant_admin` atau `hr_admin` login.
- **When**: ia memanggil `GET /api/platform/tenants`.
- **Then**: 403 `ROLE_FORBIDDEN`, baik flag `platform.console` menyala maupun mati. Menu Tenant/Konfigurasi platform tidak muncul.

## Technical Plan (Architecture)

### Akses dan flag

- Router baru `platformRouter` (`src/modules/platform/routes.js`) dipasang di **`/api/platform` sebelum router `/api` umum**, supaya request tidak melewati `auth` dan pemeriksaan sesi dua kali. Urutan gerbang: `auth` → `tenantContext()` → `requireRole()` → `requireFlag(platform.console)`. `requireRole()` tanpa argumen di `core/rbac/index.js` sudah hanya meloloskan `eta_admin` dengan `ROLE_FORBIDDEN`, jadi tidak perlu guard baru (review tahap 9 CD-N1). Peran diperiksa sebelum flag, jadi pengguna selain Super Admin selalu mendapat `ROLE_FORBIDDEN` dan tidak mengetahui keadaan flag. Router diakhiri 404 sendiri supaya path platform yang tidak dikenal tidak jatuh ke router `/api` dan menjalankan `auth` dua kali.
- Flag baru (default mati, aturan 3):
  - `platform.console`, diperiksa pada tenant tempat Super Admin login;
  - `auth.session_idle`, per tenant: menyalakan penegakan sesi diam untuk tenant itu.
- Pengecualian aturan 2: hanya router ini yang membaca `:tenantId` dari path (ADR 0002). Validasi: UUID dan tenant ada; selain itu 404.

### Kontrak endpoint

Semua di bawah `/api/platform`, jawaban sukses `{ data }`. Galat umum: 403 `ROLE_FORBIDDEN` (bukan Super Admin), 403 `FEATURE_DISABLED` (flag mati), 404 (tenant tidak ada), 400 (validasi).

| Method dan path | Body / query | Jawaban | Galat khusus | Modul.method |
| --- | --- | --- | --- | --- |
| `GET /tenants` | – | `{ kpis, tenants[] }` | – | `platform.listTenants` |
| `POST /tenants` | `{ name, adminEmail, adminName?, id? }`, `?dryRun=1` | `{ tenant, slug, invitation: 'sent'\|'failed' }`; dengan `dryRun` hanya `{ slug, report }` | 409 `TENANT_EXISTS`, 400 (UUID belum dibuat Terraform, pesan onboarding) | `platform.createTenant` |
| `POST /tenants/:tenantId/invite` | – | `{ invitation: 'sent' }` | 409 `ADMIN_ALREADY_ACTIVE`, 404 `NO_PENDING_ADMIN`, 429 | `platform.reinvite` |
| `GET /tenants/:tenantId/modules` | – | `[{ key, name, available, earlyAccess, entitled, flagOn, killSwitch, effective }]` | – | `platform.listModules` |
| `PUT /tenants/:tenantId/modules/:moduleKey` | `{ enabled: boolean }` | baris modul | 400 `MODULE_UNAVAILABLE` | `platform.setModule` |
| `GET /settings` | – | `{ editable: { sessionIdleMinutes, aiHrAgreementTarget }, display: {...}, encryptionProvider }` | – | `platformSettings.all` |
| `PUT /settings` | `{ sessionIdleMinutes?, aiHrAgreementTarget? }` | sama dengan GET | 400 kunci tak dikenal / di luar rentang | `platformSettings.update` |
| `GET /ai-quality` | `?days=1..90` (bawaan 30) | `[{ tenantId, name, reviewed, approved, agreement, meetsTarget, daily[] }]` | – | `platform.aiQuality` |
| `GET /ai-cost` | `?weeks=1..26` (bawaan 8), `?format=csv` | baris per tenant per minggu, atau berkas CSV | – | `platform.aiCost` |
| `GET /log` | `?limit=1..200` (bawaan 50) | baris log audit platform terbaru | – | `platformLog.recent` |
| `GET /attempts` | `?days=1..31` (bawaan 7) | `[{ day, outcome, count }]` | – | `platformLog.attemptsByDay` |

### Bentuk jawaban

Ditambahkan dari review tahap 9 (IR-B1), supaya API dan klien web memakai bentuk yang sama. Tanggal ISO 8601, angka sebagai number, status sebagai kode (label di web).

```ts
type TenantStatus = 'suspended' | 'active' | 'pending_admin' | 'draft'
// GET /tenants
{ kpis: { tenants: number, activeTenants: number /* status 'active' */, users: number, modulesAvailable: number /* dari 8 */ },
  tenants: Array<{ id: string, slug: string, name: string, status: TenantStatus,
    adminEmail: string | null, users: number, activeModules: number, createdAt: string }> }
// POST /tenants
{ tenant: { id: string, slug: string, name: string, status: TenantStatus }, slug: string, invitation: 'sent' | 'failed' }
// POST /tenants?dryRun=1
{ slug: string, exists: boolean, report: Array<{ step: string, status: string, detail: string }> }
// GET /tenants/:id/modules dan PUT .../modules/:key (satu baris)
{ key: string, name: string, available: boolean, earlyAccess: boolean, entitled: boolean | null,
  flagOn: boolean, killSwitch: boolean, effective: boolean }
// GET/PUT /settings
{ editable: { sessionIdleMinutes: number, aiHrAgreementTarget: number },
  display: { encryption: 'local' | 'kms', aiModel: { provider: string, model: string },
    ssoTenants: number, idleEnforcedTenants: number, idleEnforcement: 'not_yet' | 'per_tenant' },
  encryptionProvider: 'local' | 'kms' }
// GET /ai-quality
Array<{ tenantId: string, name: string, reviewed: number, approved: number, agreement: number | null,
  meetsTarget: boolean | null /* null bila reviewed < 10 */, enoughData: boolean,
  daily: Array<{ day: string /* YYYY-MM-DD Asia/Jakarta */, reviewed: number, approved: number, agreement: number | null, enoughData: boolean }> }>
// GET /ai-cost
Array<{ tenantId: string, name: string, week: string /* Senin, YYYY-MM-DD */, sessions: number, calls: number,
  tokensIn: number, tokensOut: number, costUsd: number, costMissing: boolean }>
// GET /log
Array<{ id: string, at: string, actorEmail: string | null, action: 'create' | 'update', resource: string,
  targetTenantName: string | null, meta: object }>
// GET /attempts
Array<{ day: string, outcome: 'unknown_org' | 'unknown_account' | 'invalid_link', count: number }>
```

CSV `GET /ai-cost?format=csv`: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="biaya-ai-mingguan.csv"`, header `minggu,tenant,sesi,panggilan,token_masuk,token_keluar,biaya_usd,biaya_belum_tercatat`. Hanya minggu dan tenant yang punya pemakaian yang muncul (tanpa baris nol). Kutipan memakai `csvCell` dari `modules/imports/template.js` (diekspor) ditambah awalan `'` untuk sel formula.

`adminEmail` dan kunci peran dibaca dari `user_roles` (B2), bukan `users.role`.

### Transaksi

Ditambahkan dari review tahap 9 (IR-B2, CD-B2). Setiap tulisan platform jadi atau batal bersama audit tenant dan log audit platform:

- **Buat tenant**: transaksi milik onboarding di satu `pg.Client` (`withOnboardingClient`). Log audit platform ditulis di kait `beforeCommit` dengan `platformLog.insertSql(entry)` yang mengembalikan `{ text, values }` berparameter `$n`.
- **Kirim ulang, saklar modul, ubah konfigurasi**: `db.transaction(async (transaction) => …)` Sequelize. `audit.record(..., { transaction })` sudah ada; `platformLog.record(entry, { transaction })`, `loginLinks.create(row, { transaction })`, `flags.setTenantFlag(..., { transaction })`, dan `ensureEntitlement` lewat adapter `txQuery(transaction)` (`$n` → replacements) ikut transaksi itu.
- **Email dikirim setelah COMMIT.** Layanan link mendapat `prepare(user, purpose, { transaction })` yang menyimpan baris link dan mengembalikan `send()`; `issue()` yang ada menjadi `prepare` lalu `send`. Gagal kirim setelah COMMIT tidak membatalkan apa pun: buat tenant menjawab `invitation: 'failed'`, kirim ulang menjawab 502 `MAIL_FAILED` dan linknya tetap tersimpan (tidak terpakai, kedaluwarsa sendiri).

### Status tenant (diturunkan dari kolom yang ada)

Dicek berurutan; setiap tenant mendapat tepat satu status:

| Status | Aturan |
| --- | --- |
| Ditangguhkan | `tenants.status = 'suspended'` (kolom yang sudah ada; login tenant itu sudah ditolak) |
| Aktif | ada akun pengelola berstatus `active` |
| Menunggu admin | tidak ada yang `active`, tetapi ada yang `invited` |
| Draf | selain itu: tidak ada akun pengelola, atau semuanya `disabled` |

"Admin tenant" = email akun `tenant_admin` pertama (urut dibuat), selain itu `hr_admin` pertama. "Pengguna" = jumlah akun berstatus selain `disabled`.

### Delapan modul tenant

Registri tetap `src/modules/platform/modules.js`, urutan mengikuti mockup. Kunci di path (`:moduleKey`) adalah kolom Kunci; nama flag diambil dari `FLAGS` (bukan string baru):


| Kunci | Modul | Flag | Entitlement | Label "Akses awal" |
| --- | --- | --- | --- | --- |
| `cca` | Core Competencies | `module.cca` | `cca` | ya |
| `dna` | Developmental Needs | `module.dna` | `dna` | |
| `tna` | Training Needs | `module.tna` | `tna` | |
| `ina` | Improvement Needs | `module.ina` | `ina` | |
| `li` | Learning Intervention | `module.li` | – | |
| `ld` | Learning Delivery | `module.ld` | – | |
| `lim` | Learning Impact Measurement | `module.lim` | – | |
| `promotion` | Career & Promotion | `promotion.recommendation` | – | |

Aturan panel modul:

- "Akses awal" hanya label mockup (modul dalam tahap akses awal); tidak memberi akses. Tenant baru dibuat tanpa modul (`products: []`).
- Modul tersedia bila flag-nya terdaftar di `FLAGS`. Sejak integrasi 8907053 kedelapan flag sudah terdaftar (`module.li/ld/lim` dari B13–B15, `promotion.recommendation` dari G2-A), jadi pemeriksaan ini hanya pengaman bila flag dihapus. Kartu "Modul tersedia" menghitung modul yang tersedia; penyebut "x / 8" tetap delapan.
- Menyalakan modul yang belum tersedia menjawab 400 `MODULE_UNAVAILABLE`; kunci yang tidak ada di registri menjawab 404.
- Rumus kolom (review tahap 9 IR-M4): `entitled` = `true`/`false` untuk modul berentitlement, `null` untuk modul tanpa entitlement; `effective` = `flagOn && !killSwitch && entitled !== false`; "Modul aktif" di daftar tenant = jumlah modul dengan `effective`.
- Kolom panel dibaca dari layanan yang sudah ada, tanpa SQL baru: `entitled` dari `entitlements.submodules(tenantId)` (jadi `full_suite` dihitung), `flagOn`/`killSwitch`/`effective` dari `flags.detail(tenantId)`. Layar menampilkan "Akses", "Aktif", dan tanda kill switch, supaya layar menampilkan keadaan apa adanya.
- `setModule` memakai jalur tulis yang sama dengan `core/flags/admin-routes.js` (sesuai brief "memakai `flags/admin-routes`"): `ensureEntitlement` (bila menyala), `flags.setTenantFlag`, `audit.record` untuk tenant sasaran, lalu log audit platform, berurutan. Keempat tulisan berjalan dalam satu transaksi (§Transaksi), jadi audit atau log yang gagal membatalkan saklar. Fungsi `ensureEntitlement(query, tenantId, product, source)` diekstrak dari langkah 4 onboarding; `query(sql, params)` memakai parameter posisi `$n`, jadi bisa dipakai pg.Client onboarding maupun adapter transaksi Sequelize (lihat §Transaksi). Tidak menambah baris bila produk itu atau `full_suite` sudah aktif.
- Pelaku di audit tenant sasaran: `user_id` kosong (akun Super Admin milik tenant lain), `meta.actor = 'Super Admin ELGOS'`, `meta.actorUserId`, `meta.via = 'api/platform'`.

### Membuat tenant

1. Slug diturunkan dari nama (aturan di rencana implementasi). `?dryRun=1` mengembalikan slug dan laporan onboarding tanpa menyimpan, untuk tombol "Periksa".
2. Rute memanggil `onboardTenant()` (PK-13) dengan spesifikasi `{ id, slug, name, products: [], users: [{ email, role: 'tenant_admin', name }] }`. Perubahan onboarding:
   - `tenant_admin` masuk `ADMIN_ROLES`; syarat "minimal satu `hr_admin`" menjadi "minimal satu `tenant_admin` atau `hr_admin`";
   - `products` boleh kosong;
   - parameter `actor` (`{ userId, label, via }`) menggantikan nilai tetap `user_id NULL` dan `via: 'scripts/onboard-tenant.js'` di baris audit;
   - kait `beforeCommit(db, result)` dijalankan di dalam transaksi sebelum COMMIT (rute menulis log audit platform di sini);
   - **mode `create`**: pemeriksaan slug/id yang sudah ada (sebelum `BEGIN`, sebelum panggilan KMS) melempar `TENANT_EXISTS` (409) untuk slug **atau** id yang sudah dipakai, menggantikan `OnboardingError` 400 "Slug sudah dipakai" khusus di mode ini. Insert tenant memakai `ON CONFLICT DO NOTHING RETURNING`; balapan dua request (insert kosong atau `23505`) juga `TENANT_EXISTS`. `dryRun` di mode `create` tidak melempar: jawabannya `exists: true`, supaya tombol Periksa bisa memberi tahu. `beforeCommit` tidak dijalankan saat `dryRun`. Skrip tetap memakai mode bawaan (boleh dijalankan ulang).
   - pemetaan galat di rute: `OnboardingError` → 400 dengan pesannya (kelas itu diberi `status = 400`, sehingga skrip tidak berubah), `TENANT_EXISTS` → `conflict()` 409.
3. Onboarding memegang transaksinya sendiri di satu koneksi Postgres khusus (`withOnboardingClient`, diekstrak dari skrip).
4. Undangan: setelah COMMIT, rute mencari akun yang baru dibuat (`users` per tenant dan email) lalu `links.prepare(...)` + `send()`. `sendInvites` di skrip diganti fungsi bersama `inviteAdmins` di `core/tenant/invite.js` yang dipakai skrip dan rute. Gagal kirim tidak membatalkan tenant (`invitation: 'failed'`, pulihkan lewat CUJ 2).
5. Audit tenant (`tenant.onboarding`) dan log audit platform (`tenant` `create`) ikut ROLLBACK bila salah satu gagal (R2-2).

**Kirim ulang undangan** (`reinvite`): sasaran dicari dengan query baru `platform/store.pendingAdmin(tenantId)`: akun dengan peran `tenant_admin` (selain itu `hr_admin`) di `user_roles`, `status = 'invited'`, `last_login_at IS NULL`, dibuat paling awal. (`users.listInvitees` tidak bisa dipakai karena mengecualikan peran istimewa.) Tidak ada sasaran: 409 `ADMIN_ALREADY_ACTIVE` bila ada pengelola aktif, selain itu 404 `NO_PENDING_ADMIN`. Batas: limiter baru `platformReinvite` di `defaultRateLimits` (memori, 3 per 15 menit, kunci `platform:reinvite:<tenantId>`), terpisah dari batas link per akun; undangan saat tenant dibuat tidak dihitung. Link, audit tenant `create invitation`, dan log audit platform `create tenant.invitation` dalam satu transaksi; email setelah COMMIT (§Transaksi).

### Konfigurasi platform

Tabel baru `platform_settings` satu baris per kunci. Hanya dua kunci yang bisa diubah, karena hanya dua yang punya pemakai; kunci lain ditambah saat pemakainya ada (mis. job retensi, B3):

| Kunci | Tipe | Bawaan | Dipakai di |
| --- | --- | --- | --- |
| `sessionIdleMinutes` | bilangan 5–480 | 30 | pemeriksaan sesi (tenant dengan `auth.session_idle`) |
| `aiHrAgreementTarget` | persen 50–100 | 85 | kartu kesepakatan AI–HR |

Baris lain adalah teks tetap atau hitungan, tidak disimpan di tabel ini:

| Kartu mockup | Baris | Isi |
| --- | --- | --- |
| Isolasi data | Isolasi per tenant | teks tetap (arsitektur) |
| Isolasi data | Enkripsi data | penyedia kunci dari `stores.cipher` (`local` atau `kms`) |
| Model AI wawancara | Model | penyedia + model dari konfigurasi AI server |
| Model AI wawancara | Kesepakatan AI–HR | isian `aiHrAgreementTarget` |
| Kebijakan bawaan | Retensi log audit | "12 bulan" (job penghapusan `[⏳ DITERIMA]`, lihat Non-Goals) |
| Kebijakan bawaan | Anonimisasi dashboard agregat | "Aktif" (ditegakkan B3) |
| Kebijakan bawaan | Persetujuan karyawan wajib | "Aktif" (modul consent yang sudah ada) |
| Autentikasi | SSO perusahaan per tenant | jumlah tenant dengan flag `auth.sso` menyala |
| Autentikasi | Verifikasi dua langkah | teks tetap "Tidak dipakai (login lewat link email, PD-10)" |
| Autentikasi | Batas waktu sesi | isian `sessionIdleMinutes` + jumlah tenant dengan `auth.session_idle` menyala |

Getter `platformSettings.get(key)` (`src/core/platform-settings/index.js`) dengan cache dalam proses tanpa TTL yang dikosongkan saat `update` (satu proses API per lingkungan di etavm2, jadi tidak perlu sinkron antarproses `[⏳ DITERIMA]`); nilai disimpan sebagai number jsonb, bilangan bulat saja; paket lain membaca lewat getter ini. `PUT /settings` memvalidasi semua kunci sekaligus, menulis dalam satu transaksi, dan mencatat satu baris log audit platform per kunci yang berubah (`from`, `to`). Migrasi menulis dua baris bawaan. Nilai berlaku untuk semua tenant; layar menyatakan ini dan meminta konfirmasi saat batas sesi diturunkan.

### Sesi diam (tahap 2, commit terpisah)

Tahap ini menyentuh jalur auth yang dilalui setiap request, jadi dibangun dan direview sebagai irisan sendiri setelah konsol (tahap 1) selesai, dengan commit terpisah supaya Andrian bisa mereviewnya terpisah. Tahap 1 sudah menyimpan `sessionIdleMinutes` dan menampilkannya; sampai tahap 2 masuk, baris "Batas waktu sesi" menampilkan "Belum ditegakkan (sesi berlaku 8 jam)".


- **Aktivitas** = request API apa pun, ditambah tanda aktivitas web selama ada interaksi (paling sering sekali per 5 menit). Web tidak punya polling latar hari ini; request latar yang ditambah kemudian harus membawa penanda supaya tidak dihitung (dibuat bersama request latar pertama).
- Kolom baru `auth_sessions.last_seen_at`, diisi `now()` saat migrasi, supaya jam diam mulai dari deploy.
- `sessions.check(claims)`: bila `last_seen_at` (dari baris sesi yang sudah dimuat) lebih lama dari `platformSettings.get('sessionIdleMinutes')` menit **dan** flag `auth.session_idle` tenant sesi menyala (flag hanya dibaca saat batas terlewati), sesi dicabut (`revoke_reason = 'idle'`) dan jawabannya `{ ok: false, code: 'SESSION_IDLE' }`; middleware menjawab 401 `{ error: { code: 'SESSION_IDLE', message: 'Sesi berakhir karena tidak aktif. Silakan masuk lagi.' } }` (pesan per kode, bukan pesan `ROLE_VIEW_CHANGED`). Sentuh dan cabut hanya di `sessions.check` dari middleware, tidak di `switchRole`/`isActive`. Selain itu `last_seen_at` diperbarui paling sering sekali per 60 detik per sesi.
- Web: `api/client.ts` meneruskan kode galat ke `onUnauthorized(code)`; `main.ts` mengarahkan `SESSION_IDLE` ke `/login?alasan=sesi-diam`, dan `LoginView.vue` menampilkan "Sesi Anda berakhir karena tidak aktif. Silakan masuk lagi." (tanpa angka menit, karena pengguna biasa tidak bisa membaca konfigurasi platform). Tanda aktivitas dipasang di `stores/session.ts` (memegang token): listener `keydown`, `pointerdown`, `scroll` menandai ada interaksi, dan timer 5 menit mengirim heartbeat hanya bila ada interaksi sejak heartbeat terakhir.

### Kesepakatan AI–HR (PM-2 bagian C)

Per tenant, jendela `days` hari pada `reviewed_at`, hanya temuan hasil analisis AI (`analysis_job_id IS NOT NULL`, semua submodul): `agreement = approved / (approved + edited + rejected)`, dengan `review_status` bukan `draft`. Syarat `analysis_job_id` juga mengecualikan temuan lama yang diisi `approved` oleh migrasi `20261117000400` dan hasil wawancara DNA manual. Memenuhi target bila `agreement >= aiHrAgreementTarget`. Tenant dengan kurang dari 10 temuan ditinjau tampil "Data belum cukup (n < 10)" tanpa tanda lulus/gagal; titik harian dengan n < 10 diberi tanda yang sama. Seri harian per tanggal Asia/Jakarta.

### Laporan biaya token mingguan (PO-10)

Dari `ai_usage_logs`, per tenant per minggu ISO (Senin, Asia/Jakarta): jumlah sesi berbeda, panggilan, token masuk, token keluar, `sum(cost_usd)`. Baris tanpa biaya dihitung 0 dan diberi tanda "biaya belum tercatat". CSV adalah format keluaran lain dari `aiCost` yang sama; sel yang diawali `=`, `+`, `-`, atau `@` diberi awalan `'` (cegah formula).

### Log audit platform dan hitungan percobaan

- **`platform_audit_logs`**: append-only. DDL lengkap di rencana implementasi. Fungsi trigger sendiri `platform_audit_logs_immutable()` (bukan fungsi `audit_logs`, yang memakai kolom `user_id`): menolak UPDATE/DELETE kecuali di mode pemeliharaan `ewi.audit_maintenance`, dan mengizinkan satu-satunya UPDATE yang mengubah `actor_user_id`/`actor_tenant_id`/`target_tenant_id` menjadi NULL (FK `ON DELETE SET NULL`), supaya menghapus akun atau tenant tidak terhalang (pelajaran migrasi `20261117000502`). Tabel masuk `AUDIT_TABLES` di `src/db/app-role.js`, jadi role aplikasi tidak punya UPDATE/DELETE/TRUNCATE.
- **`platform_attempt_counters (hour, outcome, count)`**: outcome `unknown_org` (slug tidak ada, lewat `users.findTenantBySlug`), `unknown_account` (tenant ada tetapi tidak ada akun aktif dengan email itu, termasuk akun `invited`), `invalid_link`. Pemanggil mengirim `who` tanpa `tenantId` untuk ketiganya, jadi tidak ada baris di audit tenant; dinaikkan dengan satu UPSERT. Baris bisa di-UPDATE (tidak append-only); diterima karena tidak memuat identitas, email, atau IP `[⏳ DITERIMA]`. Pertumbuhan paling banyak 24 × 3 baris per hari. Penulisan best-effort dan tidak ditunggu jawaban login, seperti `attempts.js` hari ini, supaya serangan tidak membuat login antre di satu baris.

### Diagram

```text
web (tampilan Super Admin)
  screens/b12-super-admin/
    TenantsView  ── GET  /api/platform/tenants, GET /api/platform/settings (encryptionProvider)
                 ── POST /api/platform/tenants[?dryRun=1]
                 ── POST /api/platform/tenants/:tenantId/invite
                 ── GET/PUT /api/platform/tenants/:tenantId/modules[/:moduleKey]
    PlatformView ── GET/PUT /api/platform/settings
                 ── GET /api/platform/ai-quality, /ai-cost
                 ── GET /api/platform/log, /attempts
  api/client.ts  ── POST /api/sessions/heartbeat (saat ada interaksi)
api
  /api/platform  auth → tenantContext → onlyEtaAdmin → requireFlag(platform.console)
     ├ platform service: tenants, users, entitlements, feature_flags, lna_findings, ai_usage_logs (agregat)
     │    onboard: core/tenant/onboarding.js (mode create + beforeCommit)
     ├ platformSettings: platform_settings (cache dalam proses, dikosongkan saat update)
     └ platformLog: platform_audit_logs, platform_attempt_counters
  sessions.check ── auth_sessions.last_seen_at, flag auth.session_idle, platformSettings.get('sessionIdleMinutes')
  attempts.record (tanpa tenant) ── platformLog.countAttempt(outcome)
```

### Antarmuka modul

`createPlatformService` menampung logika di balik antarmuka kecil: rute hanya memetakan HTTP ke satu method dan tidak menyentuh SQL. Method: `listTenants()`, `createTenant(actor, input, { dryRun })`, `reinvite(actor, tenantId)`, `listModules(tenantId)`, `setModule(actor, tenantId, moduleKey, enabled)`, `aiQuality({ days })`, `aiCost({ weeks })`. `platformSettings` (`get`, `all`, `update(actor, patch)`) dan `platformLog` (`record`, `countAttempt`, `recent`, `attemptsByDay`) terpisah karena dipakai jalur login di setiap request. Hanya ada adapter Postgres; test integrasi memakai Postgres seperti paket lain.

## Alternatives Considered

### Alternative A: Kolom status bisnis baru di `tenants`

- **Pros**: bisa memuat "Pilot disiapkan".
- **Cons**: harus diubah manual setiap akun berubah dan butuh layar ubah status.
- **Reason for Rejection**: Rejected by author: tidak ada keputusan bisnis yang meminta status manual; status turunan selalu sesuai data akun, dan kolom `tenants.status` yang ada sudah menutup penangguhan.

### Alternative B: Konfigurasi platform di env/deploy, atau di `tenants.settings` tenant ETA

- **Pros**: tanpa tabel baru (`core/settings` sudah menyimpan jsonb di `tenants.settings`), atau tanpa layar ubah sama sekali (env).
- **Cons**: mockup menulis "Perubahan dicatat di log audit platform", jadi ada perubahan dari layar; mengubah env butuh deploy oleh infra.
- **Reason for Rejection**: Rejected by author: batas sesi perlu diubah tanpa deploy bila 30 menit terbukti terlalu ketat selama pilot. Menyimpan di `tenants.settings` tenant ETA ditolak dengan alasan yang sama dengan G2: mencampur nilai seluruh platform dengan pengaturan ETA sendiri. Hanya dua kunci dengan pemakai yang dibuat bisa diubah.

### Alternative C: Tenant dibuat dengan SQL langsung di rute

- **Pros**: tidak perlu koneksi khusus.
- **Cons**: menggandakan aturan kunci enkripsi, entitlement, dan audit yang sudah dites di `onboarding.test.js`.
- **Reason for Rejection**: Rejected by author: aturan itu cukup ditulis dan dites di satu tempat.

### Alternative D: Cara Super Admin menjangkau tenant lain

Ringkasan ADR 0002: login ulang ke tiap tenant (ditolak: akun `eta_admin` harus ada di semua tenant, konsol "semua tenant" mustahil); header `X-Tenant-Id` di seluruh API (ditolak: membuka rute data karyawan); jalur `/api/platform` khusus dengan `tenantId` di path (dipilih).

### Alternative E: Hubungan entitlement dan saklar modul

- **E1 (dipilih, ⚠️)**: menyalakan modul juga menambah entitlement `source='platform'` bila belum ada. Tenant baru dari layar langsung bisa memakai modul.
- **E2**: saklar hanya flag; entitlement diatur terpisah. Lebih bersih secara komersial, tetapi tenant baru dari layar tidak pernah bisa memakai modul sampai ada layar entitlement (di luar B12).
- **E3**: mematikan modul juga mengakhiri entitlement `source='platform'`. Simetris, tetapi menghapus jejak hak komersial saat yang dimaksud hanya menahan rilis.

### Alternative F: Mekanisme sesi diam

- **F1 (dipilih)**: `last_seen_at` di server + tanda aktivitas web. Bisa dicabut di server dan berlaku untuk semua klien.
- **F2**: JWT umur pendek + refresh token. Mengubah kontrak token B1/PK-16 yang baru dibangun.
- **F3**: timer di web saja. Tidak menegakkan apa pun di server; tab yang ditinggal dengan token tetap berlaku 8 jam.

### Alternative G: Tempat log audit platform

- **G1 (dipilih)**: tabel `platform_audit_logs` sendiri.
- **G2**: `audit_logs` di tenant ETA. Tidak butuh tabel baru, tetapi mencampur tindakan lintas tenant dengan audit internal ETA dan butuh `target_tenant_id` di tabel bersama.

### Alternative H: Telemetri percobaan tanpa tenant

- **H1 (dipilih)**: tabel hitungan per jam.
- **H2**: log proses/metrik. Tanpa skema, tetapi etavm2 belum punya pengumpul metrik dan Super Admin tidak bisa melihatnya di layar.

### Tambahan di luar mockup (disadari)

- Tombol "Periksa" (dryRun) di formulir tenant: slug tidak bisa diganti setelah dibuat, jadi Super Admin melihatnya dulu. Murah karena onboarding sudah punya `dryRun`.
- Kartu log audit platform dan hitungan percobaan di layar Konfigurasi platform: mockup hanya menyebut "Perubahan dicatat di log audit platform"; tanpa kartu, log tidak bisa dibaca tanpa SQL.

--------------------------------------------------------------------------------

## Risks & Mitigations

| Risiko | Mitigasi |
| --- | --- |
| Pengecualian aturan 2 dipakai untuk membaca data karyawan lintas tenant | Hanya di `src/modules/platform` (ADR 0002); test 403 untuk setiap rute platform dan peran selain `eta_admin`; test kunci terlarang (`answer`, `transcript`, `text`, `quote`, `summary`) di setiap jawaban |
| Dua request membuat tenant dengan slug sama dan saling menimpa | Mode `create` di onboarding + pemetaan pelanggaran unik ke 409 |
| Sesi diam mengeluarkan pengguna yang sedang menulis | Tanda aktivitas web; flag per tenant `auth.session_idle`; konfirmasi saat batas diturunkan |
| Sesi diam dinyalakan sebelum konsol bisa melonggarkannya (tahap 2) | Enforcement di balik flag tenant (default mati); `platform.console` dinyalakan untuk tenant ETA sebelum `auth.session_idle` dinyalakan di tenant mana pun (urutan di runbook PR) |
| Produksi butuh Terraform sebelum tenant dibuat | Non-Goal tertulis; pesan galat onboarding menyebut langkah infra |
| Undangan gagal terkirim | `invitation: 'failed'` + kirim ulang (CUJ 2) |
| Angka kesepakatan AI–HR menggelembung | Hanya temuan AI; n < 10 tidak diberi tanda |
| Hitungan percobaan bisa diubah, baris panas saat serangan | Tanpa identitas; best-effort tanpa menunggu |
| Nama flag B13/B14/B15 berbeda saat digabung | `[⚠️ BELUM TERVERIFIKASI]`; modul tampil "Belum tersedia" sampai registri diubah |
| Formula di CSV | Sel diberi awalan `'` |

## Non-Functional Requirements

- **Kinerja**: daftar tenant satu query agregat; jumlah tenant puluhan per rencana pilot `[⚠️ BELUM TERVERIFIKASI]`. Sesi diam menambah paling banyak satu UPDATE per sesi per menit dan satu pembacaan flag per request (flag service yang ada).
- **Rollout**: `platform.console` mati = semua rute platform 403 `FEATURE_DISABLED` untuk Super Admin, menu tidak tampil. `auth.session_idle` mati = perilaku sesi sama dengan hari ini. Rollback: migrasi `down` menghapus tiga tabel baru dan kolom `last_seen_at`.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

Semua path relatif ke root repo. (B) = berkas baru, (U) = ubah berkas yang ada. Revisi v6 setelah review egm tahap 9.

### Migrasi

- [x] (B) `apps/api/migrations/20261119001200-platform.js`, `up`:

  ```sql
  CREATE TABLE platform_settings (
    key varchar(64) PRIMARY KEY,
    value jsonb NOT NULL,
    updated_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  INSERT INTO platform_settings (key, value) VALUES ('sessionIdleMinutes', '30'), ('aiHrAgreementTarget', '85');

  CREATE TABLE platform_audit_logs (
    id bigserial PRIMARY KEY,
    actor_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
    actor_tenant_id uuid NULL REFERENCES tenants(id) ON DELETE SET NULL,
    action varchar(16) NOT NULL CHECK (action IN ('create', 'update')),
    resource varchar(32) NOT NULL CHECK (resource IN ('tenant', 'tenant.invitation', 'tenant.module', 'platform.setting')),
    target_tenant_id uuid NULL REFERENCES tenants(id) ON DELETE SET NULL,
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX platform_audit_logs_at_idx ON platform_audit_logs (at DESC);
  -- platform_audit_logs_immutable(): tolak DELETE; tolak UPDATE kecuali (a) mode ewi.audit_maintenance,
  -- atau (b) hanya kolom actor_user_id/actor_tenant_id/target_tenant_id yang berubah menjadi NULL.
  CREATE TRIGGER platform_audit_logs_append_only BEFORE UPDATE OR DELETE ON platform_audit_logs
    FOR EACH ROW EXECUTE FUNCTION platform_audit_logs_immutable();

  CREATE TABLE platform_attempt_counters (
    hour timestamptz NOT NULL,
    outcome varchar(32) NOT NULL CHECK (outcome IN ('unknown_org', 'unknown_account', 'invalid_link')),
    count integer NOT NULL DEFAULT 0,
    PRIMARY KEY (hour, outcome)
  );
  ```

  Lalu panggil ulang `applyAppRoleGrants` (pola `20261117000200`). `down` menghapus trigger, fungsi, dan ketiga tabel. `entitlements.source` tidak punya CHECK, jadi `'platform'` tidak butuh perubahan skema.
- [x] (B) **Tahap 2** `apps/api/migrations/20261119001210-session-last-seen.js`: `ALTER TABLE auth_sessions ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now()`; `down` menghapusnya.
- [x] (U) `apps/api/src/db/app-role.js`: `AUDIT_TABLES = ['audit_logs', 'platform_audit_logs']`.

### API

- [x] (U) `apps/api/src/core/flags/index.js`: `PLATFORM_CONSOLE: 'platform.console'`; **tahap 2** `AUTH_SESSION_IDLE: 'auth.session_idle'`.
- [x] (U) `apps/api/src/core/flags/index.js` dan store flag di `apps/api/src/db/stores.js`: `setTenantFlag(tenantId, key, enabled, userId, { transaction })`.
- [x] (U) `apps/api/src/core/tenant/onboarding.js`:
  - `tenant_admin` masuk `ADMIN_ROLES`; syarat minimal satu `tenant_admin` atau `hr_admin`; `products` boleh kosong;
  - parameter `actor { userId, label, via }`, `beforeCommit(db, result)`, `mode: 'create'` (§Membuat tenant);
  - `OnboardingError` mendapat `status = 400`; galat baru `TenantExistsError` (`code = 'TENANT_EXISTS'`, `status = 409`);
  - ekspor `ensureEntitlement(query, tenantId, product, source)`.
- [x] (B) `apps/api/src/core/tenant/client.js`: `withOnboardingClient({ databaseUrl, dbSchema }, fn)` (pg.Client, `SET search_path`, selalu `end()`), diekstrak dari `apps/api/scripts/onboard-tenant.js`.
- [x] (B) `apps/api/src/core/tenant/invite.js`: `inviteAdmins({ query, links, tenantId, tenantName, emails, actor })` menggantikan `sendInvites` di skrip.
- [x] (U) `apps/api/scripts/onboard-tenant.js`: memakai `client.js` dan `invite.js`.
- [x] (U) `apps/api/src/core/auth/email-link.js`: `prepare(user, purpose, { createdBy, tenantName, transaction })` mengembalikan `{ send }`; `issue` = `prepare` lalu `send`.
- [x] (U) `apps/api/src/db/stores.js`: `loginLinks.create(row, { transaction })`; store Postgres `platformSettings`, `platformLog` (insert, recent, attemptsByDay, upsert counter) di kunci `stores.platformSettings`, `stores.platformLog`, `stores.platform` (agregat); **tahap 2** `authSessions.findActive` mengembalikan `lastSeenAt`, `authSessions.touch(id)` (`UPDATE … SET last_seen_at = now() WHERE id = :id AND last_seen_at < now() - interval '60 seconds'`).
- [x] (U) `apps/api/tests/helpers.js`: `makeStores` tanpa store platform tetap jalan (rute platform hanya dipasang bila `stores.platform` ada, pola `if (stores.loginLinks)`).
- [x] (B) `apps/api/src/core/platform-settings/index.js`: `createPlatformSettings({ store, platformLog })` dengan `get(key)`, `all()`, `update(actor, patch)`; validasi bilangan bulat dalam rentang; satu transaksi; satu log per kunci yang berubah.
- [x] (B) `apps/api/src/core/platform-log/index.js`: `createPlatformLog({ store })` dengan `record(entry, { transaction })`, `insertSql(entry)` → `{ text, values }`, `countAttempt(outcome)` (tidak dilempar, tidak ditunggu), `recent(limit)`, `attemptsByDay(days)`. `entry = { actor: { userId, tenantId }, action, resource, targetTenantId, meta }`.
- [x] (U) `apps/api/src/core/auth/attempts.js`: `createAttemptLog(audit, { platformLog })`; bila `who.tenantId` kosong, panggil `platformLog.countAttempt(meta.outcome)` tanpa `await`.
- [x] (U) `apps/api/src/core/auth/email-link.js` rute `POST /`: bila `findByEmail` kosong, `users.findTenantBySlug(slug)` membedakan `unknown_org` dan `unknown_account`; rute `/verify` dengan token tak valid → `invalid_link`. (U) `apps/api/src/core/auth/routes.js` login sandi non-produksi: aturan yang sama.
- [x] (U) `apps/api/src/modules/imports/template.js`: ekspor `csvCell`.
- [x] (B) `apps/api/src/modules/platform/modules.js`: registri delapan modul (`key`, `name`, `flag` dari `FLAGS`, `product`, `earlyAccess`); `rowFor(module, detail, entitled)` menerapkan rumus kolom.
- [x] (B) `apps/api/src/modules/platform/store.js`: `listTenants()` (satu query agregat; status turunan; peran dari `user_roles`), `pendingAdmin(tenantId)`, `hasActiveAdmin(tenantId)`, `aiQuality({ days })`, `aiCost({ weeks })`.
- [x] (B) `apps/api/src/modules/platform/service.js`: `createPlatformService({ db, store, flags, entitlements, audit, platformLog, platformSettings, links, users, provider, production, onboardingClient })`, method di §Antarmuka modul. `onboardingClient` = `(fn) => withOnboardingClient(config, fn)`; test integrasi memberi versi yang sama dengan `DATABASE_URL` test.
- [x] (B) `apps/api/src/modules/platform/routes.js`: `platformRouter({ service, platformSettings, platformLog, limits })`, kontrak endpoint, validasi query (`days` 1..90, `weeks` 1..26, `limit` 1..200, `days` attempts 1..31, selain itu 400), `:tenantId` bukan UUID atau tidak ada → 404, slug (aturan di bawah), CSV, 404 di akhir router.
  - Slug: NFKD lalu buang diakritik, huruf kecil, karakter selain `a-z0-9` menjadi `-`, `-` berulang dipadatkan, potong 64, **lalu** buang `-` di ujung; kosong → 400 "Nama perusahaan harus memuat huruf atau angka".
- [x] (U) `apps/api/src/app.js`: buat `platformLog`, `platformSettings` (bila store ada), `provider = createProvider(config.encryption)`; `createAttemptLog(audit, { platformLog })`; pasang `/api/platform` sebelum `/api` dengan `auth`, `tenantContext()`, `requireRole()`, `requireFlag(FLAGS.PLATFORM_CONSOLE)`; limiter `platformReinvite`; **tahap 2** `platformSettings` dan `flags` ke `createSessionService`.
- [x] (U) **Tahap 2** `apps/api/src/core/auth/sessions.js`: `createSessionService({ …, idle: { minutes: () => platformSettings.get('sessionIdleMinutes'), enabled: (tenantId) => flags.isEnabled(tenantId, FLAGS.AUTH_SESSION_IDLE) } })`; pemeriksaan diam di `check`; memory store ikut.
- [x] (U) **Tahap 2** `apps/api/src/core/auth/session-routes.js`: `POST /sessions/heartbeat` → 204.
- [x] (U) **Tahap 2** `apps/api/src/core/auth/middleware.js`: pesan per kode (`SESSION_IDLE`, `ROLE_VIEW_CHANGED`).
- [x] (U) `apps/api/src/core/rbac/menu.js`: butir `tenants` dan `platform` di `MENUS.super` sudah ada; hanya tambah elemen flag `FLAGS.PLATFORM_CONSOLE` (API mengembalikan `enabled: false` saat mati; web menyembunyikan lewat gerbang rute).

### Web

- [x] (B) `apps/web/src/api/platform.ts`: klien bertipe sesuai §Bentuk jawaban.
- [x] (B) `apps/web/src/screens/b12-super-admin/routes.ts`: `/tenants` (nama `tenants`, beranda tampilan Super Admin) dan `/platform` (nama `platform`), `views: ['super']`, `flag: 'platform.console'`.
- [x] (B) `apps/web/src/screens/b12-super-admin/TenantsView.vue`: tiga KPI, tabel tenant (label status, kirim ulang undangan), panel modul (Akses, Aktif, tanda kill switch), formulir "Buat tenant baru" (nama, email; kolom ID bila `encryptionProvider = 'kms'`; Periksa → slug dan `exists`).
- [x] (B) `apps/web/src/screens/b12-super-admin/PlatformView.vue`: empat kartu mockup sesuai tabel kartu, dua isian (konfirmasi saat batas sesi diturunkan), Kesepakatan AI–HR, Biaya token mingguan (unduh CSV), Log audit platform, Percobaan masuk tanpa tenant.
- [x] (U) **Tahap 2** `apps/web/src/api/client.ts` (kode galat ke handler), `apps/web/src/main.ts` (`alasan=sesi-diam`), `apps/web/src/views/LoginView.vue` (pesan), `apps/web/src/stores/session.ts` (tanda aktivitas dan heartbeat).
- [x] (B) `apps/web/e2e/super-admin.spec.ts` (API mock, `loginSebagai(page, 'super', { flags: { 'platform.console': true } })`):
  1. Super Admin mendarat di Tenant; KPI dan status tenant tampil sebagai teks.
  2. Buat tenant: Periksa menampilkan slug; slug yang sudah ada memberi peringatan; simpan → baris baru "Menunggu admin"; `invitation: 'failed'` menampilkan pesan dan tombol kirim ulang.
  3. Panel modul: nyalakan Training Needs; kill switch tampil sebagai teks; modul tanpa akses ditandai.
  4. Konfigurasi platform: ubah batas sesi (menurunkan meminta konfirmasi), galat rentang tampil di ringkasan galat; baris 2FA "Tidak dipakai".
  5. Kartu AI: "Data belum cukup" untuk n < 10; unduh CSV.
  6. Flag mati: menu Tenant/Konfigurasi tidak tampil dan `/tenants` tidak bisa dibuka.
- [x] (U) `apps/web/e2e/shell.spec.ts` (Super Admin di baris 95–100): dengan `platform.console` menyala mendarat di `/tenants`.
- [x] (U) **Tahap 2** `apps/web/e2e/gating.spec.ts`: 401 `SESSION_IDLE` → `/login?alasan=sesi-diam` dengan pesan.

### Test yang ditulis lebih dulu (tdd)

- [x] (B) `apps/api/tests/integration/platform.test.js` (Postgres):
  - gerbang: 403 `ROLE_FORBIDDEN` untuk `tenant_admin`, `hr_admin`, `learner` (flag menyala dan mati); 403 `FEATURE_DISABLED` untuk Super Admin saat flag mati; `:tenantId` bukan UUID → 404; path tak dikenal → 404;
  - daftar: status turunan (termasuk `suspended`, semua `disabled`), `adminEmail` dari `user_roles`, `activeModules` = modul `effective`;
  - buat tenant: akun `tenant_admin` invited, undangan terkirim, audit tenant berpelaku, log platform; slug ganda dan id ganda → 409 tanpa mengubah tenant lama dan tanpa panggilan KMS; `dryRun` tidak menyimpan dan memberi `exists`; kegagalan log platform membatalkan tenant; mailer melempar → `invitation: 'failed'` dan tenant tetap ada; slug yang dipotong tidak berakhir `-`;
  - kirim ulang: 409 `ADMIN_ALREADY_ACTIVE`, 404 `NO_PENDING_ADMIN`, 429 setelah 3 kali; link + dua audit dalam satu transaksi (audit gagal → tidak ada link);
  - modul: flag, entitlement `source = 'platform'`, `full_suite` tidak digandakan, kill switch tampil, audit tenant sasaran, log platform; audit gagal → flag tidak berubah; kunci tak dikenal → 404;
  - kunci terlarang (`answer`, `transcript`, `text`, `quote`, `summary`) tidak muncul di jawaban mana pun.
- [x] (B) `apps/api/tests/integration/platform-settings.test.js`: rentang dan bilangan bulat, kunci tak dikenal 400, satu log per kunci yang berubah, getter langsung memakai nilai baru.
- [x] (B) `apps/api/tests/integration/platform-ai.test.js`: 34/40 = 85% memenuhi; temuan tanpa `analysis_job_id` tidak dihitung; n < 10 → `meetsTarget: null`; biaya mingguan dengan `costMissing`; CSV sama dengan JSON, header tetap, sel formula diberi awalan; `days`/`weeks` di luar rentang → 400.
- [x] (B) `apps/api/tests/integration/platform-log.test.js`: UPDATE/DELETE ditolak trigger; menghapus tenant atau akun pelaku mengosongkan kolom FK tanpa galat; role aplikasi tidak punya UPDATE/DELETE (perluas `apps/api/tests/integration/db-app-role.test.js`).
- [x] (U) `apps/api/tests/integration/onboarding.test.js`: mode `create` menolak tenant yang ada (slug dan id) sebelum KMS, balapan `23505` → `TENANT_EXISTS`, `beforeCommit` gagal → ROLLBACK, `tenant_admin` diterima, `products` kosong, `actor` tercatat.
- [x] (U) `apps/api/tests/unit/onboarding.test.js`: validasi `normalizeSpec` (`tenant_admin`, tanpa pengelola ditolak, `products` kosong).
- [x] (B) `apps/api/tests/unit/attempts.test.js`: tanpa tenant menaikkan hitungan, tidak menulis audit tenant, kegagalan hitungan tidak mengubah jawaban; rute link membedakan `unknown_org`, `unknown_account`, `invalid_link`.
- [x] (U) `apps/api/tests/unit/roles.test.js` (test `buildMenu`): butir `tenants`/`platform` nonaktif saat `platform.console` mati.
- [x] (U) **Tahap 2** `apps/api/tests/unit/session-auth.test.js`: flag mati → tidak pernah diam; menyala dan lewat batas → 401 `SESSION_IDLE` lewat middleware dan sesi dicabut (`idle`); sentuh paling sering 60 detik; heartbeat menyentuh; `switchRole` tidak menyentuh.

### Dokumen

- [x] (U) `docs/ewi/onboarding-tenant.md`: `tenant_admin`, layar Tenant sebagai jalur utama, langkah Terraform tetap.
- [x] (U) `docs/designs/b18-e2e-qa-malam.md` tabel 3.3: baris alur "Super Admin membuat tenant → Admin Tenant menerima undangan → modul dinyalakan → HR melihat menu" (driver `tests/alur/driver.js`).
- [x] (U) Spek ini: centang item; bagian Review spek, Review diff, Code review, Drift.

## Review spek (egm)

| Tahap | Persona | Hasil | Triase |
| --- | --- | --- | --- |
| 5 | zoom-out, inventive-catalyst | ruang lingkup dipersempit (dua isian, status turunan, tanpa kolom baru di `tenants`) | diterima di v3–v4 |
| 6 | comprehension | istilah Platform di `CONTEXT.md`, ADR 0002 | diterima |
| 7 | design, structural, style | antarmuka modul kecil, sesi diam tahap 2 terpisah | diterima di v5 |
| 8 | zoom-out menengah | tidak ada temuan baru yang menghalangi | – |
| 9 | implementation-readiness | 2 Blocker, 7 Major, 9 Nit: bentuk jawaban, transaksi, DDL log platform, kunci modul, DI, limiter kirim ulang, sesi diam di web, mode create vs dryRun, celah test | semua diterima di v6 (§Bentuk jawaban, §Transaksi, rencana implementasi) |
| 9 | codebase-details | 2 Blocker, 14 Major, 9 Nit: fungsi trigger tidak bisa dipakai ulang, atomisitas kirim ulang, grant role aplikasi, kontrak galat onboarding, berkas tahap 1 kurang, e2e salah berkas, `findTenantBySlug`, `ensureEntitlement`, `listInvitees`, `sendInvites`, sesi diam, menu/registri, path test | semua diterima di v6; N1 (`requireRole()` alih-alih guard baru), N4 (potong lalu buang `-`), N5 (`csvCell`), N6 (`conflict()` sudah ada di integrasi), N8 (404 di akhir router) |

Gerbang interaktif egm dijalankan sebagai "terima otomatis" karena brief aturan 11 langkah 3 menyerahkan triase ke thread.

## Review diff

Diff `origin/claude/project-thread-scbrmb...HEAD` dibaca ulang per lapisan (migrasi, core, modul platform, web, test) sebelum code review. Temuan yang langsung diperbaiki: pesan sesi diam tanpa angka menit (batas bisa diubah), `kpis.users` dipakai layar, nama alasan login `sesi-diam` seragam di API, router, dan layar login.

## Code review (mattpocock-skills `code-review`, dua sumbu)

Titik tetap: `origin/claude/project-thread-scbrmb`. Standar: `CLAUDE.md` + baseline smell. Spek: dokumen ini, `b1-login.md`, `b2-peran.md`.

| Sumbu | Temuan | Keputusan |
| --- | --- | --- |
| Standar | Rute platform memfilter tenant dari path, bukan `req.tenantId` (aturan 2) | Diterima sebagai pengecualian konsol lintas tenant; dicatat di ADR 0002, ✅ Diterima user 24 Nov (review PR #8) |
| Standar | Endpoint baru di balik flag baru default mati (aturan 3) | Sesuai: `platform.console`, `auth.session_idle` |
| Standar | Migrasi punya `down`, naik-turun-naik bersih (aturan 6) | Sesuai, diuji lokal dan di CI |
| Standar | Duplicated Code: pembungkus `wrap` async di rute platform dan rute lain | Dibiarkan; perapihan lintas modul di luar thread ini |
| Standar | Shotgun Surgery: daftar modul tersebar di 4 tempat (registri platform, flag, menu, web) | Dibiarkan; registri `modules.js` jadi sumber API, sisanya dicatat di Drift |
| Standar | Primitive Obsession: CSV biaya memakai string mentah | Diperbaiki: `csvCell` dipakai ulang + `safeCell` menetralkan formula |
| Spek | `kpis.users` belum ada di bentuk jawaban | Diperbaiki (spek dan klien) |
| Spek | Pesan CUJ 5 menyebut "30 menit" padahal batas bisa diubah | Diperbaiki: "Sesi berakhir karena tidak aktif. Silakan masuk lagi." |
| Spek | Kirim ulang undangan tanpa limiter | Diperbaiki: limiter `platformReinvite` |
| Spek | Super Admin melihat hasil termasuk kutipan; hanya transkrip mentah tertutup | Sesuai: layar kualitas AI hanya angka agregat, tanpa transkrip |

## Drift

Penyimpangan yang disengaja dari rencana implementasi, untuk review Andrian:

- Nama migrasi tahap 2 `20261119001210-auth-session-idle.js` (rencana: `…-session-last-seen.js`); isinya sama (`last_seen_at`).
- Daftar tenant: jumlah pengguna dan modul per tenant memakai query per tenant (N+1), bukan satu query agregat. Diterima karena tenant puluhan; ganti bila lewat ratusan.
- `createTenant` membaca seluruh daftar tenant untuk cek slug sebelum transaksi; keunikan tetap dijaga constraint (`23505` → `TENANT_EXISTS`).
- SSO masih memakai limiter `passwordIp`; limiter khusus SSO belum dibuat.
- `adminEmail` di daftar tenant melewati akun `disabled` (didokumentasikan di store).
- Trigger append-only `platform_audit_logs` menolak TRUNCATE di level statement; test integrasi membersihkan lewat role pemilik.
- Endpoint cabut sesi HR tanpa flag berasal dari PK-16, bukan thread ini.
- Test integrasi mode `create` onboarding dan test log platform ditulis setelah implementasi (bukan test-first); slice lain test-first.
- Tampilan kill switch di panel modul diuji di `tests/unit/platform-modules.test.js`, bukan di test integrasi: kill switch berlaku global dan mengganggu suite lain yang berjalan paralel di database uji yang sama (ditemukan sebagai test DNA/impor yang kadang gagal). Constraint uji "audit gagal" juga dipersempit ke tenant uji.
