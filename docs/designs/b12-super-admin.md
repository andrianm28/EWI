# B12 · Super Admin: tenant, modul, dan konfigurasi platform

- **Penulis:** Claude (thread T2), untuk review Andrian
- **Status:** Draft (spek v4, setelah egm-review tahap 5, 6, dan 7; tahap 8–9 menyusul)
- **Tanggal:** 2026-11-19
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
- Saklar 2FA (lihat Open Questions).
- Pemilihan model AI per tenant. Baris "Model AI wawancara" menampilkan penyedia dan model dari konfigurasi server.
- Penghapusan audit otomatis setelah 12 bulan. Data audit tertua dibuat Nov 2026, jadi job retensi baru dibutuhkan Nov 2027 `[⏳ DITERIMA]`.
- Layar untuk peran lain (Admin Tenant adalah B11, PR #17).

## Open Questions

- **2FA** (kartu keputusan di thread T2, 19 Nov; rekomendasi "Tanpa 2FA, cukup link email"). Spek ini memakai rekomendasi itu: tidak ada saklar 2FA. Baris "Verifikasi dua langkah" menghitung tenant yang flag `auth.mfa`-nya (flag B1, default mati) menyala; bila nol, tampil "Tidak dipakai (login lewat link email, PD-10)". Butir `[⏳ DITERIMA]` B1 §6 "pemaksaan MFA wajib ditentukan di konfigurasi platform B12" tetap terbuka dan pemiliknya thread T2: ditutup sebagai "tidak dipakai" bila pemilik produk memilih rekomendasi, atau dibangun di PR lanjutan T2 bila memilih lain.
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
- **Then**: log audit platform mencatat `update platform.setting` dengan `from: 30, to: 15`; dalam paling lama 60 detik semua proses API memakai nilai baru.

### CUJ 5: Sesi diam berakhir

- **Given**: tenant pengguna punya flag `auth.session_idle` menyala dan `sessionIdleMinutes = 30`.
- **When**: pengguna tidak mengetik, mengeklik, atau memanggil API selama lebih dari 30 menit, lalu memanggil API lagi.
- **Then**: API menjawab 401 `SESSION_IDLE`, sesi dicabut, web kembali ke layar login dengan pesan "Sesi berakhir karena tidak aktif 30 menit." Pengguna yang sedang mengetik jawaban panjang tidak terkena, karena web mengirim tanda aktivitas selama ada interaksi.

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

- Router baru `platformRouter` (`src/modules/platform/routes.js`) dipasang di **`/api/platform` sebelum router `/api` umum**, supaya request tidak melewati `auth` dan pemeriksaan sesi dua kali. Urutan gerbang: `auth` → `tenantContext()` → `onlyEtaAdmin` → `requireFlag(platform.console)`. Peran diperiksa sebelum flag, jadi pengguna selain Super Admin selalu mendapat `ROLE_FORBIDDEN` dan tidak mengetahui keadaan flag. `onlyEtaAdmin` dipindah dari `core/flags/admin-routes.js` ke `core/rbac/guards.js` agar dipakai bersama.
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

Registri tetap `src/modules/platform/modules.js`, urutan mengikuti mockup:

| Modul | Flag | Entitlement | Label "Akses awal" |
| --- | --- | --- | --- |
| Core Competencies | `module.cca` | `cca` | ya |
| Developmental Needs | `module.dna` | `dna` | |
| Training Needs | `module.tna` | `tna` | |
| Improvement Needs | `module.ina` | `ina` | |
| Learning Intervention | flag B13 | – | |
| Learning Delivery | flag B14 | – | |
| Learning Impact Measurement | flag B15 | – | |
| Career & Promotion | `promotion.recommendation` | – | |

Aturan panel modul:

- "Akses awal" hanya label mockup (modul dalam tahap akses awal); tidak memberi akses. Tenant baru dibuat tanpa modul (`products: []`).
- Modul tersedia bila flag-nya terdaftar di `FLAGS`. Pada base branch ini: `module.cca`, `module.dna`, `module.tna`, `module.ina`, `promotion.recommendation` (flag G2-A yang sudah ada, bukan pola `module.*`). Flag B13/B14/B15 ditulis ke registri saat paket itu digabung, satu baris per modul `[⚠️ BELUM TERVERIFIKASI]`. Kartu "Modul tersedia" menghitung modul yang tersedia; penyebut "x / 8" tetap delapan.
- Menyalakan modul yang belum tersedia menjawab 400 `MODULE_UNAVAILABLE`.
- Kolom panel: `entitled` dihitung lewat layanan entitlement yang sudah ada (jadi `full_suite` dihitung), `flagOn` = flag tenant, `killSwitch` = saklar darurat global, `effective` = keduanya sama seperti `requireSubmodule()`. Layar menampilkan "Akses", "Aktif", dan tanda kill switch, supaya layar menampilkan keadaan apa adanya.
- `setModule` menulis flag, entitlement (bila perlu), audit tenant sasaran, dan log audit platform dalam **satu transaksi**. Fungsi bersama `ensureEntitlement(db, tenantId, product, source)` (dari onboarding) tidak menambah baris bila produk itu atau `full_suite` sudah aktif.
- Pelaku di audit tenant sasaran: `user_id` kosong (akun Super Admin milik tenant lain), `meta.actor = 'Super Admin ELGOS'`, `meta.actorUserId`, `meta.via = 'api/platform'`.

### Membuat tenant

1. Slug diturunkan dari nama (aturan di rencana implementasi). `?dryRun=1` mengembalikan slug dan laporan onboarding tanpa menyimpan, untuk tombol "Periksa".
2. Rute memanggil `onboardTenant()` (PK-13) dengan spesifikasi `{ id, slug, name, products: [], users: [{ email, role: 'tenant_admin', name }] }`. Perubahan onboarding:
   - `tenant_admin` masuk `ADMIN_ROLES`; syarat "minimal satu `hr_admin`" menjadi "minimal satu `tenant_admin` atau `hr_admin`";
   - `products` boleh kosong;
   - parameter `actor` (`{ userId, label, via }`) menggantikan nilai tetap `user_id NULL` dan `via: 'scripts/onboard-tenant.js'` di baris audit;
   - kait `beforeCommit(db, result)` dijalankan di dalam transaksi sebelum COMMIT (rute menulis log audit platform di sini);
   - **mode `create`**: insert tenant memakai `ON CONFLICT DO NOTHING RETURNING`; bila tenant (slug atau id) sudah ada, onboarding melempar `TENANT_EXISTS` di dalam transaksi tanpa mengubah apa pun. Pelanggaran unik dari dua request bersamaan juga dipetakan ke `TENANT_EXISTS`. Skrip tetap memakai mode bawaan (boleh dijalankan ulang).
3. Onboarding memegang transaksinya sendiri di satu koneksi Postgres khusus (`withOnboardingClient`, diekstrak dari skrip).
4. Undangan dikirim lewat layanan link yang sudah ada setelah COMMIT. Gagal kirim tidak membatalkan tenant (`invitation: 'failed'`, pulihkan lewat CUJ 2).
5. Audit tenant (`tenant.onboarding`) dan log audit platform (`tenant` `create`) ikut ROLLBACK bila salah satu gagal (R2-2).

**Kirim ulang undangan** (`reinvite`): sasaran = akun `tenant_admin` (selain itu `hr_admin`) berstatus `invited` dan `last_login_at IS NULL`, yang dibuat paling awal. Logika menerbitkan link sama dengan rute `/api/invitations` yang ada. Batas 3 per tenant per 15 menit (limiter yang ada). Audit tenant `create invitation` dan log audit platform `create tenant.invitation` dalam satu transaksi dengan penerbitan link.

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
| Autentikasi | Verifikasi dua langkah | lihat Open Questions |
| Autentikasi | Batas waktu sesi | isian `sessionIdleMinutes` + jumlah tenant dengan `auth.session_idle` menyala |

Getter `platformSettings.get(key)` (`src/core/platform-settings/index.js`) dengan cache dalam proses 60 detik; paket lain membaca lewat getter ini. `PUT /settings` memvalidasi semua kunci sekaligus, menulis dalam satu transaksi, dan mencatat satu baris log audit platform per kunci yang berubah (`from`, `to`). Migrasi menulis dua baris bawaan. Nilai berlaku untuk semua tenant; layar menyatakan ini dan meminta konfirmasi saat batas sesi diturunkan.

### Sesi diam

- **Aktivitas** = request API yang dipicu pengguna, ditambah tanda aktivitas web: selama ada interaksi (ketik, klik, gulir), web memanggil `POST /api/sessions/heartbeat` paling sering sekali per 5 menit. Web tidak punya polling latar hari ini; request latar yang ditambah kemudian wajib mengirim header `X-Background: 1`, yang tidak dihitung sebagai aktivitas.
- Kolom baru `auth_sessions.last_seen_at`, diisi `now()` saat migrasi, supaya jam diam mulai dari deploy.
- `sessions.check(claims)`: bila flag `auth.session_idle` tenant sesi menyala dan diam melewati `sessionIdleMinutes`, sesi dicabut dan jawabannya `{ ok: false, code: 'SESSION_IDLE' }`; middleware menjawab 401 `SESSION_IDLE`. Selain itu `last_seen_at` diperbarui paling sering sekali per 60 detik per sesi.
- Web: `api/client.ts` mengenali `SESSION_IDLE` dan mengarahkan ke login dengan pesan di CUJ 5.

### Kesepakatan AI–HR (PM-2 bagian C)

Per tenant, jendela `days` hari pada `reviewed_at`, hanya temuan hasil analisis AI (`analysis_job_id IS NOT NULL`, semua submodul): `agreement = approved / (approved + edited + rejected)`, dengan `review_status` bukan `draft`. Syarat `analysis_job_id` juga mengecualikan temuan lama yang diisi `approved` oleh migrasi `20261117000400` dan hasil wawancara DNA manual. Memenuhi target bila `agreement >= aiHrAgreementTarget`. Tenant dengan kurang dari 10 temuan ditinjau tampil "Data belum cukup (n < 10)" tanpa tanda lulus/gagal; titik harian dengan n < 10 diberi tanda yang sama. Seri harian per tanggal Asia/Jakarta.

### Laporan biaya token mingguan (PO-10)

Dari `ai_usage_logs`, per tenant per minggu ISO (Senin, Asia/Jakarta): jumlah sesi berbeda, panggilan, token masuk, token keluar, `sum(cost_usd)`. Baris tanpa biaya dihitung 0 dan diberi tanda "biaya belum tercatat". CSV adalah format keluaran lain dari `aiCost` yang sama; sel yang diawali `=`, `+`, `-`, atau `@` diberi awalan `'` (cegah formula).

### Log audit platform dan hitungan percobaan

- **`platform_audit_logs`**: append-only seperti `audit_logs` (trigger yang sama menolak UPDATE/DELETE). Kolom: `actor_user_id`, `actor_tenant_id`, `action` (`create`, `update`), `resource` (`tenant`, `tenant.invitation`, `tenant.module`, `platform.setting`), `target_tenant_id` (boleh kosong), `meta` jsonb, `at`.
- **`platform_attempt_counters (hour, outcome, count)`**: outcome `unknown_org`, `unknown_account`, `invalid_link`; dinaikkan dengan satu UPSERT. Baris bisa di-UPDATE (tidak append-only); diterima karena tidak memuat identitas, email, atau IP `[⏳ DITERIMA]`. Pertumbuhan paling banyak 24 × 3 baris per hari. Penulisan best-effort dan tidak ditunggu jawaban login, seperti `attempts.js` hari ini, supaya serangan tidak membuat login antre di satu baris.

### Diagram

```text
web (tampilan Super Admin)
  screens/b12-super-admin/
    TenantsView  ── GET  /api/platform/tenants
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
     ├ platformSettings: platform_settings (cache 60 dtk)
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

### Alternative B: Konfigurasi platform di env/deploy saja

- **Pros**: tanpa tabel dan tanpa layar ubah.
- **Cons**: mockup menulis "Perubahan dicatat di log audit platform", jadi ada perubahan dari layar; mengubah env butuh deploy oleh infra.
- **Reason for Rejection**: Rejected by author: batas sesi perlu diubah tanpa deploy bila 30 menit terbukti terlalu ketat selama pilot. Hanya dua kunci dengan pemakai yang dibuat bisa diubah.

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

--------------------------------------------------------------------------------

## Risks & Mitigations

| Risiko | Mitigasi |
| --- | --- |
| Pengecualian aturan 2 dipakai untuk membaca data karyawan lintas tenant | Hanya di `src/modules/platform` (ADR 0002); test 403 untuk setiap rute platform dan peran selain `eta_admin`; test kunci terlarang (`answer`, `transcript`, `text`, `quote`, `summary`) di setiap jawaban |
| Dua request membuat tenant dengan slug sama dan saling menimpa | Mode `create` di onboarding + pemetaan pelanggaran unik ke 409 |
| Sesi diam mengeluarkan pengguna yang sedang menulis | Tanda aktivitas web; flag per tenant `auth.session_idle`; konfirmasi saat batas diturunkan |
| Sesi diam dinyalakan sebelum konsol bisa melonggarkannya | Enforcement di balik flag tenant (default mati); `platform.console` dinyalakan untuk tenant ETA sebelum `auth.session_idle` dinyalakan di tenant mana pun (urutan di runbook PR) |
| Nilai konfigurasi berbeda antar proses sampai 60 detik | `[⏳ DITERIMA]`; dinyatakan di CUJ 4 |
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

### Migrasi (blok `20261119001200–99`)

- [ ] `apps/api/migrations/20261119001200-platform.js`: tabel `platform_settings (key varchar(64) PK, value jsonb NOT NULL, updated_by uuid NULL REFERENCES users ON DELETE SET NULL, updated_at timestamptz NOT NULL DEFAULT now())` berisi dua baris bawaan; tabel `platform_audit_logs` (kolom di §Log audit platform, indeks `at DESC`) dengan trigger append-only memakai fungsi dari migrasi `20261113000005`; tabel `platform_attempt_counters (hour timestamptz, outcome varchar(32) CHECK IN (...), count integer NOT NULL, PRIMARY KEY (hour, outcome))`; kolom `auth_sessions.last_seen_at timestamptz NOT NULL DEFAULT now()`. `entitlements.source` tidak punya CHECK (`20261111000001`), jadi `'platform'` tidak butuh perubahan skema. Hak akses role aplikasi mengikuti `20261117000200-app-role-grants.js`. `down` membalik semuanya.

### API

- [ ] `apps/api/src/core/flags/index.js`: `PLATFORM_CONSOLE: 'platform.console'`, `AUTH_SESSION_IDLE: 'auth.session_idle'`.
- [ ] `apps/api/src/core/rbac/guards.js` (baru): `onlyEtaAdmin`; `core/flags/admin-routes.js` mengimpornya (perilaku sama).
- [ ] `apps/api/src/core/tenant/onboarding.js`: `tenant_admin` di `ADMIN_ROLES`; syarat pengelola; `products` boleh kosong; `actor`; `beforeCommit`; mode `create`; `ensureEntitlement` diekspor dan mengenali `full_suite`.
- [ ] `apps/api/src/core/tenant/client.js` (baru): `withOnboardingClient(config, fn)` dari `scripts/onboard-tenant.js` (pg.Client + `SET search_path`); skrip memakainya.
- [ ] `apps/api/src/core/platform-settings/index.js` (baru): dua kunci, validasi, `get/all/update`, cache 60 detik.
- [ ] `apps/api/src/core/platform-log/index.js` (baru): `record(actor, action, resource, { targetTenantId, meta }, { db })`, `countAttempt(outcome)` (best-effort), `recent(limit)`, `attemptsByDay(days)`.
- [ ] `apps/api/src/core/auth/sessions.js` + store di `apps/api/src/db/stores.js`: `last_seen_at`; pemeriksaan diam bila flag tenant menyala; sentuh paling sering 60 detik (`UPDATE auth_sessions SET last_seen_at = now() WHERE id = :id AND last_seen_at < now() - interval '60 seconds'`); request dengan `X-Background: 1` tidak menyentuh; memory store ikut.
- [ ] `apps/api/src/core/auth/session-routes.js`: `POST /sessions/heartbeat` (204).
- [ ] `apps/api/src/core/auth/middleware.js`: kode `SESSION_IDLE` diteruskan seperti `ROLE_VIEW_CHANGED`.
- [ ] `apps/api/src/core/auth/attempts.js`: bila `who.tenantId` kosong dan `platformLog` ada, panggil `countAttempt(meta.outcome)` tanpa `await` di jalur jawaban. Pemanggil baru: `core/auth/email-link.js` (slug tak dikenal → `unknown_org`, email tak dikenal → `unknown_account`, token tak valid → `invalid_link`) dan `core/auth/routes.js` (login sandi non-produksi dengan tenant/akun tak dikenal).
- [ ] `apps/api/src/modules/platform/modules.js` (baru): registri delapan modul.
- [ ] `apps/api/src/modules/platform/service.js` (baru): `createPlatformService`.
- [ ] `apps/api/src/modules/platform/store.js` (baru): query agregat Postgres.
- [ ] `apps/api/src/modules/platform/routes.js` (baru): kontrak endpoint; batas query; CSV. Slug: NFKD lalu buang tanda diakritik, huruf kecil, karakter selain `a-z0-9` menjadi `-`, `-` berulang dipadatkan, `-` di ujung dibuang, dipotong 64; hasil kosong → 400 "Nama perusahaan harus memuat huruf atau angka".
- [ ] `apps/api/src/app.js`: pasang `/api/platform` sebelum `/api`; `platformLog` ke `createAttemptLog`; `platformSettings` dan `flags` ke sesi.
- [ ] `apps/api/src/core/rbac/menu.js`: butir `tenants` dan `platform` untuk tampilan `super` di balik `platform.console`.

### Web

- [ ] `apps/web/src/api/platform.ts` (baru): klien bertipe.
- [ ] `apps/web/src/screens/b12-super-admin/routes.ts` (baru): rute `tenants` (beranda tampilan Super Admin) dan `platform`, gerbang `views: ['super']`, `flag: 'platform.console'` (tabel menu `b0-fondasi-ui.md`).
- [ ] `apps/web/src/screens/b12-super-admin/TenantsView.vue` (baru): tiga KPI, tabel tenant (status, kirim ulang undangan), panel modul (Akses, Aktif, kill switch), formulir "Buat tenant baru" (nama, email; kolom ID bila `encryptionProvider = 'kms'`; tombol Periksa → slug).
- [ ] `apps/web/src/screens/b12-super-admin/PlatformView.vue` (baru): empat kartu mockup sesuai tabel kartu, dua isian dengan konfirmasi saat batas sesi diturunkan, kartu Kesepakatan AI–HR, Biaya token mingguan (unduh CSV), Log audit platform, Percobaan masuk tanpa tenant.
- [ ] `apps/web/src/api/client.ts`: tangani `SESSION_IDLE`; tanda aktivitas (listener `keydown`, `pointerdown`, `scroll`, heartbeat paling sering 5 menit saat login).
- [ ] `apps/web/e2e/super-admin.spec.ts` (baru) dengan API mock; perbarui `loginAs` di `e2e/poc-dna-tna.spec.ts` dan `e2e/gating.spec.ts`: Super Admin dengan `platform.console` menyala mendarat di `tenants`, bukan `/`.

### Test yang ditulis lebih dulu (tdd)

- [ ] `tests/integration/platform.test.js` (Postgres): 403 `ROLE_FORBIDDEN` untuk `tenant_admin`, `hr_admin`, `learner` (flag menyala dan mati); 403 `FEATURE_DISABLED` untuk Super Admin saat flag mati; status turunan termasuk `suspended` dan `disabled`; buat tenant (akun `tenant_admin` invited, undangan, audit tenant berpelaku, log platform, 409 slug ganda tanpa mengubah tenant lama, dryRun tidak menyimpan, kegagalan log platform membatalkan tenant); kirim ulang (409 aktif, 429); modul (flag, entitlement `platform`, `full_suite` tidak digandakan, kill switch tampil, audit tenant sasaran, `MODULE_UNAVAILABLE`, satu transaksi); kunci terlarang tidak muncul.
- [ ] `tests/integration/platform-settings.test.js`: validasi rentang, kunci tak dikenal 400, log per kunci, getter memakai nilai baru setelah cache habis.
- [ ] `tests/integration/platform-ai.test.js`: kesepakatan 34/40 = 85% memenuhi; temuan tanpa `analysis_job_id` tidak dihitung; n < 10; biaya mingguan; CSV sama dengan JSON dan sel formula diberi awalan.
- [ ] `tests/unit/sessions-idle.test.js`: flag mati → tidak pernah diam; flag menyala dan lewat batas → `SESSION_IDLE` dan dicabut; sentuh paling sering 60 detik; `X-Background` tidak menyentuh; heartbeat menyentuh.
- [ ] `tests/unit/attempts.test.js`: percobaan tanpa tenant menaikkan hitungan, tidak menulis audit tenant, kegagalan hitungan tidak mengubah jawaban.
- [ ] `tests/unit/onboarding.test.js`: `tenant_admin` diterima; tanpa pengelola ditolak; `products` kosong; `actor` tercatat; `beforeCommit` gagal → ROLLBACK; mode `create` menolak tenant yang ada.

### Dokumen

- [ ] `docs/ewi/onboarding-tenant.md`: `tenant_admin`, layar Tenant sebagai jalur utama, langkah Terraform tetap.
- [ ] `docs/designs/b18-e2e-qa-malam.md` tabel 3.3: baris alur "Super Admin membuat tenant → Admin Tenant menerima undangan → modul dinyalakan → HR melihat menu".
- [ ] Spek ini: centang item; bagian Review spek, Review diff, Code review, Drift.
