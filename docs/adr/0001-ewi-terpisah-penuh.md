# ADR 0001 · EWI terpisah penuh dari EliteMentor

- Status: **Diterima** (11 Nov 2026, user memilih "Terpisah penuh"; merevisi lintas B15 10 Nov)
- Tanggal: 11 Nov 2026

## Konteks

B15 (10 Nov) menetapkan "produk terpisah, fondasi bersama": kode EWI sebagai modul di backend EliteMentor
dengan schema `ewi` di DB yang sama. Pada 11 Nov user meminta repo baru dan memilih pemisahan penuh.

## Keputusan

- **Repo sendiri**: monorepo `apps/api` + `apps/web`.
- **Database sendiri**: Postgres milik EWI. Tabel tetap di schema `ewi` agar konsisten dan aman bila kelak
  berbagi cluster, tetapi tidak ada koneksi ke database EliteMentor.
- **Deploy sendiri**: service, domain, dan kereta rilis EWI terpisah.
- **Auth sendiri**: login non-LTI, JWT dengan secret & audience `ewi` (B22). Tidak ada token bersama.
- **Integrasi ke EliteMentor** hanya lewat API berkontrak:
  - EWI → EliteMentor: OAuth2 client credentials (training plan → program/enrollment, deep link/SSO).
  - EliteMentor → EWI: webhook bertanda tangan HMAC-SHA256 (progres, kelulusan program, sync back).
  - `tenants.elitementor_organization_id` memetakan tenant EWI ke Organization EliteMentor.

## Konsekuensi (keputusan grilling yang berubah)

- **Q8, Q24, Q47 diganti**: tidak ada schema bersama, tidak ada event internal; semua lewat API/webhook.
- **B5 meluas** ke jalur EWI ↔ EliteMentor: kontrak API, keamanan, dan retry webhook perlu diuji E2E (B21).
- **SSO lintas platform** (B15 lama: token sesi bersama) kini butuh mekanisme antar-sistem, misalnya
  deep link bertanda tangan atau OIDC. Perlu keputusan teknis.
- Komponen yang FSD sebut "dipakai ulang dari codebase" (aiProvider, aiCredentialResolver,
  documentExtractor, adapter channel, AiUsageLog) **tidak bisa diimpor langsung**: pilih per komponen
  antara dibangun ulang di EWI, diekstrak jadi paket bersama, atau dipanggil lewat API EliteMentor.
- EliteMentor perlu endpoint OAuth2 + API program/enrollment + pengirim webhook: ada pekerjaan di repo
  lti-dashboard-backend yang bersaing dengan EliteMentor 2.0.
- Infra baru: database, secret, pipeline deploy, dan monitoring EWI.
