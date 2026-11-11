# Panduan agen untuk repo EWI

- Bahasa produk dan pesan error: Indonesia.
- Setiap tiket punya spec di `docs/ewi/tickets/ELITMEN-xxx.md` (status tetap di Asana). Baca spec sebelum mulai.
- Branch: `feat/ewi-ELITMEN-xxx`. Agen tidak pernah push ke `main`, `dev*`, `stg*`, `prod*` dan tidak merge.
- Kerjakan test-first. Gate PR: `npm run lint`, `npm test`, `npm run build`, `npm run e2e`.
- E2E memakai API mock (`page.route`); LLM sungguhan hanya di QA malam.

## Aturan arsitektur (wajib)

1. EWI punya database sendiri (tabel di schema `ewi`). Tidak ada akses ke database EliteMentor;
   integrasi hanya lewat `src/integrations/elitementor` (API OAuth2 + webhook HMAC).
2. Setiap query data bisnis memfilter `tenant_id` dari `req.tenantId`, tidak pernah dari body/query.
3. Endpoint submodul dipasang lewat `requireSubmodule()` (entitlement + flag). Fitur baru di balik flag
   baru di `src/core/flags`, default mati.
4. Visibilitas data karyawan lewat `visibleEmployeeScope()` (RG-3): learner dirinya, atasan timnya, HR semua.
5. JWT EWI memakai `EWI_JWT_SECRET` dan audience `ewi`. Tidak ada fallback secret.
6. Migrasi baru: raw SQL di `apps/api/migrations`, wajib punya `down`, CI menjalankan naik-turun-naik.
7. Reviewer wajib Andrian untuk auth, kode bersama, dan migrasi.
