# B1 · Login ELGOS

Status: spek untuk dibangun, sudah direview (lihat "Review spek" di akhir). Paket B1 dari `brief-bangun-penuh-19nov.md` (thread T2). Reviewer wajib: Andrian (auth, kode bersama, migrasi; aturan 7 CLAUDE.md). Backend dibangun dulu; layar dibangun setelah PR B0 (fondasi UI) terbuka.

## Tujuan

Karyawan, HR, atasan, admin tenant, dan super admin masuk ke ELGOS dengan cara yang aman dan tercatat:

1. Cara masuk utama adalah **link sekali pakai lewat email** (keputusan user 19 Nov 20.22 WIB: "login pake otp link"). Ini memakai mesin link email yang sudah ada (R3-2, PK-16).
2. SSO perusahaan tersedia sebagai kerangka di balik flag `auth.sso` (IdP belum ada). `auth.sso` adalah SSO ke IdP perusahaan klien untuk masuk ELGOS; berbeda dari `em.sso` yang sudah ada (lompat dari ELGOS ke EliteMentor).
3. Verifikasi dua langkah dengan kode autentikator (TOTP) tersedia di balik flag `auth.mfa`.
4. Percobaan masuk dicatat di log audit tenant.

`[⚠️ BELUM TERVERIFIKASI]` "otp link" dibaca sebagai link sekali pakai di email (magic link), bukan kode 6 digit yang diketik. Bila user bermaksud kode, yang berubah hanya isi email dan satu kolom isian di layar.

## Titik awal

Isi PR #10 (PK-16) ada di branch ini sebagai dua commit bersih: sesi yang bisa dicabut (`auth_sessions`, klaim `sid`), batas laju, kebijakan Admin ETA, login sandi mati secara default dan tidak bisa dinyalakan di produksi. CI PR #10 merah hanya karena pemindai secret menandai commit antara (positif palsu pada nama `passwordLogin`); isi akhirnya bersih. PR #10 digantikan oleh PR paket ini.

## Layar mockup yang dicakup

`Main.dc.html` bagian LOGIN (baris 160–205):

- Panel kiri (kepercayaan): merek ELGOS, tagline, tiga butir. Butir ketiga memakai default K3: **"Dirancang mengikuti UU PDP No. 27/2022"**, tanpa klaim OJK.
- Panel kanan langkah 1 "Masuk ke ELGOS": organisasi, email kerja, tombol "Kirim link masuk". Kolom kata sandi hanya muncul bila API mengizinkan (`AUTH_PASSWORD_LOGIN=true`, non-produksi). Tombol "Masuk dengan SSO perusahaan" hanya muncul bila `auth.sso` menyala untuk organisasi yang diisi.
- Langkah 2 "Verifikasi dua langkah": kode 6 digit, "Verifikasi dan masuk", "Kembali". Muncul bila akun sudah mengaktifkan kode autentikator.
- Catatan kaki: "Sesi dienkripsi · percobaan masuk dicatat di log audit tenant".
- Kartu "Masuk sebagai (khusus demo)" **tidak dibangun** (data demo, aturan 5 brief).

Penyimpangan dari mockup dan brief:

- Mockup dan brief menulis email + kata sandi sebagai cara utama. Keputusan user (link) dan PD-10 ★B (sandi mati di produksi) menggantinya.
- Kolom **organisasi** tidak ada di mockup. Tetap diperlukan karena email hanya unik per tenant (`UNIQUE (tenant_id, email)`). Sumber nilainya: parameter `?org=<slug>` pada alamat login yang dibagikan admin dan di email undangan (web mengisi otomatis dan menyembunyikan kolom), atau diketik. Daftar pilihan organisasi hanya ada di dev/staging (`LOGIN_TENANT_PICKER`).

## Alur

```
minta link  POST /api/auth/email-link {tenant,email}      -> 202 (jawaban selalu sama)
buka link   web /masuk#token=...  -> tombol "Masuk"
tukar       POST /api/auth/email-link/verify {token}
              akun tanpa MFA aktif -> 200 {token,user}
              akun dengan MFA aktif -> 200 {mfaRequired:true, challenge}
verifikasi  POST /api/auth/mfa/verify {challenge, code}    -> 200 {token,user}
```

Login sandi (non-produksi) mengikuti percabangan MFA yang sama.

## Data dan migrasi (blok 01)

`20261119000100-auth-mfa.js`:

- `user_mfa (user_id uuid PK → users ON DELETE CASCADE, tenant_id → tenants CASCADE, secret_enc text NOT NULL, enabled_at timestamptz NULL, last_step bigint NULL, created_at)`. `secret_enc` dienkripsi dengan cipher tenant (R2-3). `enabled_at NULL` = pendaftaran belum dikonfirmasi. `last_step` mencegah satu kode dipakai dua kali.
- `auth_mfa_challenges (id uuid PK, tenant_id, user_id → users CASCADE, method varchar(16), token_hash char(64) UNIQUE, attempts int NOT NULL DEFAULT 0, expires_at, used_at NULL, created_at)`.
- `auth_sessions`: kolom `mfa boolean NOT NULL DEFAULT false`; constraint `auth_sessions_method_check` diganti agar menerima `'sso'`.
- `down`: hapus kedua tabel dan kolom `mfa`; sesi `method='sso'` dihapus dulu, lalu `auth_sessions_method_check` lama dipasang kembali.

## Endpoint dan flag

Flag baru di `src/core/flags` (default mati, per tenant): `auth.sso`, `auth.mfa`.

Arti `auth.mfa`: mengizinkan **pendaftaran** kode autentikator. Akun yang sudah aktif (`enabled_at` terisi) **selalu** ditantang saat masuk, walau flag atau kill switch mati, supaya mematikan flag tidak diam-diam menghapus faktor kedua. Mematikan MFA sendiri dan reset oleh admin selalu tersedia.

| Endpoint | Auth | Permintaan → jawaban |
| --- | --- | --- |
| `GET /api/auth/methods?tenant=<slug>` | publik | `{ password, emailLink: true, sso }`. `sso` true hanya bila tenant aktif dan `auth.sso` menyala; selain itu false. |
| `POST /api/auth/email-link/verify` | publik | Sudah ada; ditambah cabang MFA. |
| `POST /api/auth/login` | publik, non-produksi | Sudah ada; ditambah cabang MFA dan audit kegagalan. |
| `POST /api/auth/mfa/verify` | publik | `{challenge, code}` → `{token, user}`. Galat: 401 `MFA_CODE_INVALID` ("Kode verifikasi salah"), 401 `MFA_CHALLENGE_INVALID` ("Verifikasi kedaluwarsa. Masuk ulang.") untuk challenge tak dikenal, kedaluwarsa, terpakai, atau habis percobaan. |
| `POST /api/auth/sso/start` | publik | `{tenant}`. Flag mati / tenant tak dikenal → 404 `SSO_UNAVAILABLE`. Flag menyala → 501 `SSO_NOT_CONFIGURED` (kerangka; IdP belum ada), dicatat audit. |
| `GET /api/auth/mfa` | sesi | `{ available, enabled, pending }`. `available` = flag `auth.mfa`. |
| `POST /api/auth/mfa/setup` | sesi | Flag mati → 403 `FEATURE_DISABLED`. Sudah aktif → 409 `MFA_ALREADY_ENABLED`. Selain itu membuat (atau mengganti pendaftaran tertunda dengan) secret baru → `{ secret, otpauthUrl }`. |
| `POST /api/auth/mfa/enable` | sesi | `{code}`. Flag mati → 403. Tanpa pendaftaran tertunda → 409 `MFA_NOT_PENDING`. Kode salah → 401 `MFA_CODE_INVALID`. Benar → `enabled_at = now()`; audit `update` `auth.mfa` `{enabled:true}`. |
| `DELETE /api/auth/mfa` | sesi | `{code}` benar → hapus baris; audit `{enabled:false}`. Tidak bergantung flag. |
| `DELETE /api/sessions/users/:userId/mfa` | `hr_admin` (B2 menambah `tenant_admin`; `eta_admin` lolos) | **Pemulihan**: reset MFA akun di tenant sendiri (autentikator hilang). Menghapus baris, mencabut semua sesi akun itu, audit `delete` `auth.mfa` `{reason:'admin_reset', employeeIds}`. Tidak bisa untuk akun sendiri. Akun tak ada di tenant → 404. |

`tenant_id` endpoint bersesi selalu dari token. Endpoint publik memakai slug organisasi hanya untuk mencari akun, seperti login yang sudah ada.

**Challenge.** String acak 32 byte (base64url); hanya hash SHA-256 yang disimpan. Berlaku 5 menit, maksimum 5 percobaan, sekali pakai. Penukaran atomik:

```sql
UPDATE auth_mfa_challenges SET attempts = attempts + 1
 WHERE token_hash = :h AND used_at IS NULL AND expires_at > now() AND attempts < 5
 RETURNING id, tenant_id, user_id, method;            -- tidak ada baris = MFA_CHALLENGE_INVALID
-- kode benar:
UPDATE user_mfa SET last_step = :s WHERE user_id = :u AND (last_step IS NULL OR last_step < :s) RETURNING user_id;
UPDATE auth_mfa_challenges SET used_at = now() WHERE id = :id AND used_at IS NULL RETURNING id;
```

Sesi hanya terbit bila kedua `UPDATE` terakhir mengembalikan baris. Sebelum sesi terbit, akun dimuat ulang dan dicek lagi: user tidak `disabled`, tenant `active`, `policy.allows(user)`. Sesi mencatat `method` faktor pertama (`email_link`/`password`) dan `mfa=true`.

**Batas laju** (per proses, jendela 15 menit, pola `createRateLimiter` yang ada): `mfaIp` 20 permintaan per IP; `mfaAccount` 10 kegagalan per akun (tidak direset oleh faktor pertama yang benar).

**TOTP.** RFC 6238, SHA-1, 6 digit, langkah 30 detik, toleransi ±1 langkah, ditulis dengan `crypto` bawaan (tanpa dependensi baru). Penerbit "ELGOS".

**Dependensi rute.** `authRoutes` dan `emailLinkRoutes` menerima `mfa` (layanan) dan `attempts`; `authRoutes` juga menerima `flags` dan `users.findTenantBySlug`.

## Audit percobaan masuk

Aksi `login` (daftar aksi `audit_logs` tidak berubah). Hanya kejadian yang terikat **akun yang dikenal** masuk audit tenant, supaya orang tanpa akun tidak bisa menambah baris permanen ke audit tenant mana pun (tabel ini append-only).

| Kejadian | resource | meta |
| --- | --- | --- |
| Berhasil | `auth.password` / `auth.email_link` (sudah ada) | `mfa: true/false` |
| Link dikirim | `auth.attempt` | `method:'email_link', outcome:'link_sent'` |
| Link tidak dikirim: batas 3 link atau ditolak kebijakan | `auth.attempt` | `method:'email_link', outcome:'blocked', reason:'rate'/'policy'` |
| Sandi salah (akun dikenal) | `auth.attempt` | `method:'password', outcome:'failed'` |
| Faktor pertama lolos, MFA menunggu | `auth.attempt` | `method, outcome:'mfa_required'` |
| Kode MFA salah | `auth.attempt` | `method:'mfa', outcome:'failed'` |
| SSO dicoba saat flag menyala | `auth.attempt` (tanpa `user_id`) | `method:'sso', outcome:'not_configured'` |

- Email tak dikenal, organisasi tak dikenal, dan token link tak valid **tidak** masuk audit tenant; hanya dibatasi limiter per IP. `[⏳ DITERIMA]` Log platform untuk kejadian tanpa tenant menyusul di B12.
- Baris kegagalan per akun terbatas oleh limiter yang ada (5 sandi gagal, 3 link, 10 MFA gagal per 15 menit).
- Pencatatan kegagalan best-effort: bila audit gagal ditulis, jawaban tetap 401/202. Pencatatan keberhasilan tetap fail-closed seperti sekarang.

## Risiko yang diterima

- `[⏳ DITERIMA]` MFA sukarela per akun selama `auth.mfa` menyala; pemaksaan "wajib" untuk seluruh tenant ditentukan di konfigurasi platform B12.
- `[⏳ DITERIMA]` `loginLinks.consume` menandai akun aktif dan mengisi `last_login_at` saat link ditukar, sebelum MFA lolos. Dampaknya hanya pada penyaring undangan "belum pernah masuk"; baris audit `mfa_required` mencatat keadaan sebenarnya.
- `[⏳ DITERIMA]` `GET /methods?tenant=` membuka fakta "organisasi ini memakai SSO". Ini lazim (penemuan realm) dan tidak membuka daftar klien.
- `[⏳ DITERIMA]` Limiter di memori proses (satu proses API per lingkungan), sama seperti PK-16.

## Aturan dan keputusan yang dirujuk

R3-2, PK-16/PD-10 ★B, K3, aturan CLAUDE.md 2, 3, 5, 6, 7.

## Layar (setelah B0)

`LoginView.vue` ditulis ulang sesuai mockup dengan komponen B0; `MfaSetupView.vue` baru di menu akun. E2E dengan API mock: minta link, tukar link, langkah MFA, galat, tombol SSO hanya saat flag menyala, teks K3, `?org=`.

## Test

- Unit `totp.test.js`: vektor RFC 6238, toleransi, kode lama ditolak.
- Unit `login-mfa.test.js` (store memori): cabang MFA pada login sandi; challenge sekali pakai, kedaluwarsa, 5 percobaan; akun aktif tetap ditantang saat flag mati; setup/enable/disable; reset admin; `/methods`; SSO 404/501; audit percobaan; batas laju.
- Integrasi `login-mfa.test.js` (Postgres): link email + MFA ujung ke ujung; secret tersimpan terenkripsi; kode yang sama ditolak kedua kali; isolasi tenant pada reset admin.

## Daftar perubahan

- [x] `apps/api/migrations/20261119000100-auth-mfa.js`
- [x] `apps/api/src/core/flags/index.js` (flag `auth.sso`, `auth.mfa`)
- [x] `apps/api/src/core/auth/totp.js`
- [x] `apps/api/src/core/auth/mfa.js` (layanan, rute, store memori)
- [x] `apps/api/src/core/auth/attempts.js` (audit percobaan)
- [x] `apps/api/src/core/auth/routes.js`, `email-link.js`, `session-routes.js`
- [x] `apps/api/src/core/auth/sessions.js` (kolom `mfa`)
- [x] `apps/api/src/db/stores.js` (`mfa`, `findTenantBySlug`, `findById`)
- [x] `apps/api/src/app.js` (rangkai, limiter)
- [x] test di atas
- [ ] (setelah B0) `apps/web` layar login + e2e

## Review spek (egm, 19 Nov)

Reviewer tanpa konteks memberi 9 temuan untuk B1. Triase:

| Temuan | Keputusan |
| --- | --- |
| Tidak ada pemulihan MFA | **Perbaiki**: reset oleh admin + cabut sesi. |
| Mematikan flag menghapus faktor kedua | **Perbaiki**: flag hanya mengatur pendaftaran. |
| Atomisitas `/mfa/verify`, cek ulang kebijakan | **Perbaiki**: SQL atomik dan cek ulang ditulis di atas. |
| `last_login_at` terisi sebelum MFA | **Terima tertulis** + audit `mfa_required`. Memindahkannya berarti mengubah `consume` milik R3-2 untuk dampak kecil. |
| Batas laju MFA tak terdefinisi | **Perbaiki**: `mfaIp`, `mfaAccount`. |
| Audit ambigu, bisa dibanjiri, `emailHash` lemah | **Perbaiki**: hanya akun dikenal yang dicatat; `emailHash` dibuang. |
| Kontrak endpoint kurang | **Perbaiki**: kode galat, challenge, dependensi rute ditulis. |
| Kolom organisasi tidak dicatat sebagai penyimpangan | **Perbaiki**: dicatat beserta sumber slug. |
| Nama constraint `down`, aturan 7, `auth.sso` vs `em.sso` | **Perbaiki**. |

## Review diff (egm, 19 Nov)

Reviewer segar membaca `git diff origin/claude/project-thread-scbrmb...HEAD` + spek ini (commit 52b47ae, sebelum gabung B0). Tidak ada temuan berat. Test baru ditulis merah dulu (5 gagal di kode lama), lalu hijau (skill `mattpocock-skills:tdd`; seam = HTTP API lewat supertest, sama dengan bagian Test di atas).

| # | Temuan | Keputusan |
|---|---|---|
| D1 | `DELETE /api/auth/mfa` dan `POST /enable` memeriksa kode tanpa batas per akun | Diperbaiki: limiter `mfaAccount` (kunci sama dengan `/verify`), kegagalan dicatat `mfa_disable`/`mfa_enable` |
| D2 | Baris audit `blocked/rate` bisa dibanjiri per akun | Diperbaiki: limiter `auditOnce`, satu baris per akun per alasan per 15 menit. Audit `/sso/start` per IP tetap seperti spek [⏳ DITERIMA]: flag SSO mati di semua tenant sampai SSO sungguhan ada |
| D3 | Web belum mengenal jawaban `{ mfaRequired, challenge }` | Dikerjakan di layar login (langkah 2) pada PR yang sama. Sampai layar terbit, `auth.mfa` jangan dinyalakan [⏳ DITERIMA] |
| D4 | HR bisa mereset MFA Admin Tenant / Admin ETA | Diperbaiki: target `eta_admin` selalu ditolak, target `tenant_admin` hanya oleh `tenant_admin` (`ROLE_PROTECTED`); peran tambahan di `user_roles` ikut dicek |
| D7 | `check` dan `record` limiter MFA tidak atomik | Ditunda: limiter memori satu proses; dibatasi juga 5 percobaan per challenge dan 3 link per 15 menit. Dicatat untuk limiter bersama (PK-16 ⏳) |
| D8 | Mengaktifkan MFA tidak mencabut sesi lain | Diperbaiki: sesi lain dicabut (`reason = mfa_enabled`), sesi yang dipakai tetap. Challenge menggantung saat cabut semua sesi: ditunda, umurnya 5 menit |
| D11 | `mfaStore.get/enable/advanceStep` tanpa `tenant_id` | Diperbaiki: semua query memfilter `tenant_id` |
| D12 | Selisih kecil spek dan kode | Diterima sebagai kode: rute akun MFA membungkus `{ data }`; `DELETE` tanpa baris = 404; login sandi mencatat `blocked/policy`. Tabel `auth_mfa_challenges` tanpa purge: masuk job pembersihan PK-15 [⏳ DITERIMA] |
