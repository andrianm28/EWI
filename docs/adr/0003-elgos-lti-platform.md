# ADR 0003 · ELGOS menjadi LTI 1.3 Platform untuk EliteMentor

- Status: **Diusulkan** (25 Nov 2026, keputusan user "elitementor pake lti"; menunggu review Andrian)
- Tanggal: 25 Nov 2026

ADR 0001 dan aturan arsitektur 1 menetapkan integrasi EliteMentor lewat API OAuth2 + webhook HMAC. Kontrak REST itu (FR-EM) belum pernah disepakati, sedangkan EliteMentor yang berjalan hari ini adalah **LTI 1.3 Tool** (login OIDC, launch id_token RS256, JWKS). Kami memutuskan ELGOS menjadi **LTI 1.3 Platform** bagi EliteMentor: ELGOS menerbitkan id_token untuk karyawan, dan menerima nilai balik lewat **LTI AGS** (token client_credentials dengan JWT assertion, lineitem, score). Kode tetap di bawah `src/integrations/elitementor/lti` (kunci, JWKS) dan `src/modules/lti` (alur), sehingga batas "integrasi hanya lewat `src/integrations/elitementor`" tetap berlaku; tidak ada akses ke database EliteMentor. Jalur OAuth2/webhook tetap ada di balik flag lamanya.

## Pilihan yang ditimbang

- **Menunggu kontrak REST FR-EM**: tidak bisa untuk demo 25 Nov dan butuh kerja di tim EliteMentor. Ditolak untuk sekarang.
- **ELGOS sebagai Tool di dalam EliteMentor**: arah terbalik, karyawan masuk lewat EliteMentor; tidak sesuai mockup (karyawan mulai dari Rencana belajar ELGOS). Ditolak.
- **ELGOS sebagai Platform LTI 1.3** (dipilih): EliteMentor cukup mendaftarkan ELGOS di `lti_platforms`-nya; standar, dan kode launch EliteMentor sudah ada.

## Konsekuensi

- Aturan arsitektur 1 di `CLAUDE.md` diubah: integrasi EliteMentor lewat API OAuth2 + webhook HMAC **atau LTI 1.3 Platform** (`src/integrations/elitementor/lti`, `src/modules/lti`).
- Pengecualian aturan 2: rute LTI publik (authorize, token, AGS) tidak punya `req.tenantId` dari sesi; tenant diambil hanya dari tiket peluncuran atau token AGS di sisi server, tidak pernah dari parameter atau body.
- AGS hanya dipakai simulator demo sampai EliteMentor membuat klien AGS.

- Kunci RSA platform ELGOS wajib di produksi (`ELGOS_LTI_PRIVATE_KEY`). Token AGS memakai kunci ini dengan audience `elgos-lti-ags`, terpisah dari JWT sesi (`EWI_JWT_SECRET`, audience `ewi`), jadi aturan 5 tidak berubah.
- Endpoint publik baru tanpa sesi Bearer (`/api/lti/authorize`, `/api/lti/token`, AGS). Keamanannya bergantung pada tiket peluncuran sekali pakai dan JWT assertion tool; wajib dites.
- EliteMentor belum punya klien AGS. Sampai ada, skor dari EliteMentor asli tetap lewat webhook (B14); simulator demo memakai AGS.
- Spek: `docs/designs/em-lti-platform.md`.
