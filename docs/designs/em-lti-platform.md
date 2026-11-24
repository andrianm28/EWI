# EM-LTI: ELGOS sebagai LTI 1.3 Platform untuk EliteMentor (demo 25 Nov)

Status: draf 25 Nov 2026. Sumber: brief `demo-25nov/brief-elitementor-lti.md` (keputusan user 25 Nov 01.19 WIB "EliteMentor simulasi di stack demo" dan "elitementor pake lti"), ADR 0003, kontrak tool EliteMentor di repo `lti-dashboard-backend` (`src/lti/oidc.js`, `src/lti/jwt.js`), mockup Pak Eji layar "Rencana belajar" (liCards) dan "EliteMentor" (langkah belajar, tanya jawab, check-in, kuis, hasil).

## 1. Tujuan

Karyawan membuka modul EliteMentor langsung dari ELGOS (online: "Belajar dengan EliteMentor"; offline: "Ujian di EliteMentor" dengan check-in kode sesi), lalu progres, kehadiran, dan skor kembali ke ELGOS (Learning Delivery, Rencana belajar). "Tugaskan di EliteMentor" di tinjauan HR bekerja tanpa API REST EliteMentor: penugasan = membuat resource link LTI.

EliteMentor adalah LTI 1.3 Tool. ELGOS menjadi LTI 1.3 Platform. Di stack demo, tool diperankan `em-sim` (berlabel "EliteMentor (simulasi)") yang meniru kontrak tool asli.

Di luar cakupan: layar Admin Tenant untuk mendaftarkan tool (demo memakai seed; isian lewat SQL/skrip), Deep Linking, NRPS, AGS `results` GET, perubahan di repo EliteMentor (AGS belum ada di sana; ELGOS harus didaftarkan di `lti_platforms` EliteMentor).

## 2. Istilah

Lihat `CONTEXT.md`: **Tool LTI**, **Resource link**, **Tiket peluncuran**, **AGS**.

## 3. Alur

### 3.1 Peluncuran (OIDC third-party initiated login, LTI 1.3 Core §5.1)

1. Web: karyawan menekan tombol di kartu Rencana belajar. `POST /api/my/elitementor/launch { linkId }` (Bearer sesi ELGOS).
2. API memeriksa: flag `em.lti`, link milik tenant dan milik karyawan ini (online: `user_id` link; offline: karyawan peserta pelatihan), tool aktif. Membuat **tiket peluncuran** (acak 32 byte, yang disimpan hanya SHA-256-nya, berlaku 5 menit, sekali pakai) lalu menjawab `{ url }` = `login_url` tool + query `iss`, `login_hint` (= `sub` karyawan), `target_link_uri` (= `launch_url` tool), `client_id`, `lti_deployment_id`, `lti_message_hint` (= tiket).
3. Web berpindah ke `url` (tab yang sama; tombol "Kembali ke ELGOS" di halaman tool).
4. Tool membuat state + nonce, lalu mengarahkan browser ke `GET|POST /api/lti/authorize` dengan `scope=openid`, `response_type=id_token`, `response_mode=form_post`, `prompt=none`, `client_id`, `redirect_uri`, `login_hint`, `lti_message_hint`, `state`, `nonce`.
5. ELGOS authorize (tanpa Bearer, karena navigasi browser): parameter wajib lengkap dan bernilai sesuai spek; tiket ditemukan lewat hash, belum dipakai, belum kedaluwarsa; `client_id` = tool tiket; `login_hint` = `sub` tiket; `redirect_uri` ada di daftar `redirect_uris` tool. Tiket ditandai terpakai secara atomik (`UPDATE ... WHERE used_at IS NULL RETURNING`). Flag `em.lti` dicek ulang.
6. ELGOS menjawab halaman HTML yang mem-POST `id_token` + `state` ke `redirect_uri` (form auto-submit dengan skrip ber-nonce CSP, plus tombol "Lanjutkan ke EliteMentor" untuk browser tanpa JS). CSP halaman ini: `default-src 'none'; script-src 'nonce-…'; form-action <origin redirect_uri>; style-src 'unsafe-inline'`.
7. Gagal di langkah 5: halaman galat HTML 400 berbahasa Indonesia ("Tautan EliteMentor sudah tidak berlaku. Kembali ke ELGOS dan tekan tombolnya lagi."), tanpa redirect ke tool (tidak ada `redirect_uri` yang tervalidasi).

### 3.2 id_token (RS256, kid = thumbprint JWK, umur 5 menit)

| Klaim | Isi |
| --- | --- |
| `iss` | `LTI_ISSUER` (default `APP_BASE_URL`) |
| `aud` | `client_id` tool |
| `sub` | id pengguna LTI: `HMAC-SHA256(EWI_JWT_SECRET, "lti-sub:" + tenantId + ":" + userId)` hex 32 karakter. Stabil per karyawan, tidak membuka id internal |
| `nonce`, `iat`, `exp` | dari permintaan tool; `exp = iat + 300` |
| `name`, `email` | nama dan email karyawan (EliteMentor membutuhkan identitas; data pribadi yang keluar dicatat di §8) |
| `…/claim/message_type` | `LtiResourceLinkRequest` |
| `…/claim/version` | `1.3.0` |
| `…/claim/deployment_id` | `deployment_id` tool |
| `…/claim/target_link_uri` | `launch_url` tool |
| `…/claim/roles` | `http://purl.imsglobal.org/vocab/lis/v2/membership#Learner` |
| `…/claim/resource_link` | `{ id: linkId, title }` |
| `…/claim/context` | `{ id: "<tenantId>:<courseRef>", label: courseRef, title }` |
| `…/claim/custom` | `{ course_code, mode: "online"/"offline", session_code? (offline), training_title? }` |
| `…/claim/launch_presentation` | `{ document_target: "window", return_url: APP_BASE_URL + "/k/rencana" }` |
| `lti-ags/claim/endpoint` | `{ scope: [lineitem, score], lineitems: <base>/api/lti/ags/links/:id/lineitems, lineitem: <base>/api/lti/ags/links/:id/lineitem }` |

### 3.3 Nilai balik (AGS 2.0)

- `POST /api/lti/token`: `grant_type=client_credentials`, `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`, `client_assertion` (JWT RS256 dari tool: `iss = sub = client_id`, `aud` ∈ {`<base>/api/lti/token`, `LTI_ISSUER`}, `exp` ≤ 5 menit ke depan, `jti` sekali pakai), `scope` (subset dari scope AGS lineitem.readonly, lineitem, score). Kunci tool diambil dari `jwks_url` tool (cache 5 menit, timeout 5 detik, maksimal 64 KB). Jawaban `{ access_token, token_type: "Bearer", expires_in: 3600, scope }`. Token = JWT RS256 kunci platform dengan `aud = "elgos-lti-ags"` (berbeda dari audience sesi `ewi`, jadi tidak pernah diterima sebagai sesi), `sub = toolId`, `tid = tenantId`, `scope`.
- `GET …/links/:id/lineitems` dan `GET …/links/:id/lineitem`: satu lineitem per resource link (`id` = URL lineitem, `scoreMaximum: 100`, `label`, `resourceLinkId`). Tidak ada pembuatan lineitem oleh tool (`POST lineitems` 403); cukup untuk alur tool.
- `POST …/links/:id/lineitem/scores` (`application/vnd.ims.lis.v1.score+json` atau JSON): `userId` (= `sub`), `scoreGiven`, `scoreMaximum`, `activityProgress`, `gradingProgress`, `timestamp`, opsional `comment`, dan ekstensi ELGOS `https://purl.imsglobal.org/spec/lti/claim/custom` tidak dipakai; ekstensi non-standar `progressPct` (0–100) untuk progres belajar. Jawaban 204.

Pemetaan skor ke ELGOS (`toSyncEvent`, fungsi murni):

| Link | activityProgress / gradingProgress | Efek |
| --- | --- | --- |
| online | Initialized, Started, InProgress | `learning.progress` status `in_progress`, `progressPct` dari ekstensi bila ada; rencana belajar `new` → `in_progress` |
| online | Completed + FullyGraded | `learning.progress` status `completed` (lulus) atau `failed` (skor < 70), `score` = scoreGiven/scoreMaximum×100; rencana `completed` bila lulus; `lna_catalog_completions` passed/failed bila item katalog ada |
| offline | Started (check-in) | kehadiran peserta = hadir (`attendance=true`), tanpa skor |
| offline | Completed + FullyGraded | `assessment.result` skor ke peserta (logika `applyAssessment` B14, dicocokkan `assessment_ref`) dan kehadiran = hadir |
| lainnya | — | 204, dicatat `ignored` |

Idempotensi: `event_id = "lti:" + linkId + ":" + sub + ":" + timestamp + ":" + activityProgress` lewat `ld_sync_events` (B14). Skor lebih lama dari event terakhir diabaikan (aturan `last_event_at` B14). Ambang lulus 70 `[⚠️ BELUM TERVERIFIKASI]` (EliteMentor menghitung `passing_score` per kuis, tidak dikirim AGS); jadi konstanta `PASSING_SCORE` di `modules/lti/domain.js`.

Gerbang AGS: token valid untuk tool aktif, link milik tenant tool itu, `userId` = sub karyawan yang berhak atas link (online: pemilik; offline: peserta), flag `em.lti`, entitlement + flag `module.ld` untuk efek Learning Delivery (tanpa itu rencana belajar tetap diperbarui).

### 3.4 Penugasan HR ("Tugaskan di EliteMentor")

`POST /api/tna/plan-items/:id/assign` tetap satu jalur. `assignGate` lulus bila **salah satu**: (a) mode LTI: flag `em.lti` + tool aktif untuk tenant, atau (b) jalur lama (adapter REST + `elitementorOrganizationId` + `em.gaps_autosend`). Mode LTI didahulukan. Di mode LTI `assign()` membuat resource link `kind=plan_item` (idempoten per rencana) dan mengembalikan `ref = linkId`; status rencana `sent`, target `elitementor` (kolom yang sudah ada). Tidak ada panggilan jaringan, jadi tidak ada galat 502.

### 3.5 Rencana belajar karyawan

`GET /api/my/learning-plan` menambah per kartu: `lti: { linkId, label }` bila link ada dan flag `em.lti` menyala; plus kartu pelatihan offline (`ld_trainings.mode='offline'`, `assessment_mode='elitementor'`, karyawan peserta, status bukan cancelled/done) dengan `mode: 'Offline'`, `code: assessment_ref`, dan `lti` (link `kind=offline_training` dibuat saat seed atau saat HR memilih asesmen EliteMentor; untuk demo: seed). Kartu dengan `lti` menampilkan tombol "Belajar dengan EliteMentor" (online) atau "Ujian di EliteMentor" (offline) yang memanggil §3.1. Tanpa `lti`, perilaku lama (tautan katalog atau "Tautan belum tersedia").

## 4. Data dan migrasi (`20261125000100-lti-platform.js`, dengan `down`)

- `lti_tools`: id, tenant_id, name, client_id (unik global), deployment_id, login_url, launch_url, redirect_uris text[], jwks_url, status (`active`/`disabled`), timestamps. Unik (tenant_id, name). URL yang diawali `/` diselesaikan terhadap `APP_BASE_URL` (simulator di origin yang sama); `jwks_url` boleh URL internal (hanya dipanggil server).
- `lti_resource_links`: id, tenant_id, tool_id, kind (`plan_item`/`offline_training`), plan_item_id (FK, unik per tenant), training_id (FK, unik per tenant), user_id (untuk plan_item), course_ref, title, created_by, created_at. CHECK kind ↔ kolom.
- `lti_launch_tickets`: id, tenant_id, user_id, link_id, ticket_hash (unik), expires_at, used_at, created_at. Baris kedaluwarsa dihapus saat tiket baru dibuat (lebih tua dari 1 hari).
- `lti_used_jti`: tool_id, jti, expires_at; PK (tool_id, jti). Dibersihkan saat insert.
- Tidak ada kunci privat di DB: kunci platform dari env `ELGOS_LTI_PRIVATE_KEY` (PEM). Bila kosong dan bukan produksi, API membuat kunci sementara saat start (log peringatan; peluncuran yang sedang berjalan gagal setelah restart). Produksi tanpa kunci: rute LTI menjawab 503 `LTI_NOT_CONFIGURED`.

## 5. Endpoint dan flag

Flag baru `em.lti` (default mati; dinyalakan seed demo). Publik (dipasang sebelum router `/api` berotentikasi): `GET /api/lti/jwks`, `GET|POST /api/lti/authorize`, `POST /api/lti/token`, `GET /api/lti/ags/links/:id/lineitems`, `GET …/lineitem`, `POST …/lineitem/scores`. Berotentikasi: `POST /api/my/elitementor/launch`.

## 6. Simulator `em-sim` (deploy/dev-worktree, bukan kode produk)

Node 24 tanpa dependensi, `deploy/dev-worktree/em-sim/`. Dilayani lewat nginx web di path `/em-sim/` (resolver Docker, jadi stack tanpa em-sim tetap jalan). Kontrak sama dengan tool asli: `GET|POST /lti/login` → redirect ke `auth_login_url` platform; `POST /lti/launch` memverifikasi id_token (RS256 via JWKS platform internal, `iss`, `aud`, `nonce`, `deployment_id`, `message_type`, `version`); `GET /lti/keys`. Halaman belajar meniru layar "EliteMentor" mockup: langkah (Materi, Tanya jawab, Mini quiz, Hasil; offline: Check-in, Ujian, Hasil), video/bacaan (teks), tanya jawab berbasis kata kunci, kuis 3 soal, check-in kode sesi. Label "EliteMentor (simulasi)" di judul dan header. Mengirim skor lewat AGS (Started/InProgress saat mulai, Completed saat kuis selesai). Konten modul untuk kode course seed (SD-B1, SD-I1, kode offline) plus konten umum untuk kode lain.

## 7. Seed demo (`scripts/seed-lti-demo.js`, idempoten, dev saja)

Tenant `demo`: tool "EliteMentor (simulasi)" (`client_id` tetap, login/launch relatif `/em-sim/lti/...`, `jwks_url` internal `http://em-sim:4300/lti/keys`), flag `em.lti` menyala, resource link untuk rencana SD-B1 karyawan demo (status penugasan `sent`), pelatihan offline "Workshop Automation & IaC" (assessment EliteMentor, kode `IAC-1512`, karyawan demo + tim sebagai peserta) dengan resource link. Dijalankan `dev.sh up` setiap kali (bukan hanya saat seed pertama).

## 8. Keamanan dan privasi

- Data pribadi ke tool: nama, email, `sub`, kode course. Sama dengan kontrak tool EliteMentor yang ada (membaca nama/email dari klaim).
- Tiket: hanya hash di DB, 5 menit, sekali pakai, terikat karyawan + link + tool. Kebocoran URL login setelah dipakai tidak bisa diulang.
- authorize tidak pernah mem-POST ke URL yang tidak terdaftar. Galat tidak membocorkan apakah tiket ada.
- Token AGS punya audience sendiri; scope dicek per endpoint. `userId` asing → 403. Isolasi tenant dari tool di token, bukan dari body.
- Audit: peluncuran (`lti.launch`, karyawan sendiri), penugasan (jalur lama sudah), skor masuk (`lti.score`, tanpa isi komentar).

## 9. Test (ditulis dulu)

- Unit `lti-domain.test.js`: `toSyncEvent` (tabel §3.3), `subOf` stabil dan beda per tenant, validasi parameter authorize, pembentukan klaim id_token.
- Unit `lti-keys.test.js`: JWKS dari PEM, tanda tangan id_token terverifikasi dengan JWK publik, kunci sementara di non-produksi, galat di produksi.
- Integrasi `lti.test.js` (Postgres): alur penuh dengan tool palsu di test (kunci RSA test, JWKS lewat `fetchImpl` palsu): launch → authorize → verifikasi id_token → token AGS → skor online (rencana + LD) → skor offline (kehadiran + skor) ; tiket dipakai ulang 400; tiket kedaluwarsa 400; redirect_uri asing 400; flag mati 403/400; tenant lain ditolak; userId asing 403; jti ulang 401; token sesi ELGOS ditolak di AGS; penugasan HR mode LTI membuat link dan idempoten.
- Web: unit `view.ts` label tombol; e2e mock rute untuk kartu dengan `lti` (tombol memanggil launch dan berpindah).

## 10. Daftar perubahan

- [ ] `docs/adr/0003-elgos-lti-platform.md`, `CONTEXT.md` istilah
- [ ] migrasi `20261125000100-lti-platform.js`
- [ ] `src/core/flags`: `em.lti`
- [ ] `src/integrations/elitementor/lti/keys.js` (kunci, JWKS, sign/verify RS256), `jwks-client.js`
- [ ] `src/modules/lti/domain.js` (murni), `routes.js` (publik), `assignments.js` (adapter mode LTI)
- [ ] `src/db/lti-stores.js`, sambungkan di `stores.js`
- [ ] `src/app.js` pasang rute; `config/env.js` `LTI_ISSUER`, `ELGOS_LTI_PRIVATE_KEY`
- [ ] `modules/tna/review-workspace.js` gate + adapter LTI
- [ ] `modules/my/index.js` kartu `lti`, kartu offline, `POST /elitementor/launch`
- [ ] web: `api/lna.ts` tipe, `LearningPlanView.vue` tombol
- [ ] `deploy/dev-worktree/em-sim/*`, compose, `dev.sh`, `deploy/dev-public/nginx.conf` lokasi `/em-sim/`
- [ ] `scripts/seed-lti-demo.js`, `package.json` skrip
- [ ] test di atas
