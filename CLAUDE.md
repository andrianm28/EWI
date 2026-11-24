# Panduan agen untuk repo ELGOS

Nama produk: **ELGOS** (Elite Learning & Growth Operating System). EWI adalah nama lama; pakai "ELGOS" di semua teks baru (UI, docs, komentar). Identifier teknis yang masih `ewi`/`EWI_*` jangan diganti tanpa keputusan user (lihat README).

- Bahasa produk dan pesan error: Indonesia.
- Setiap tiket punya spec di `docs/ewi/tickets/ELITMEN-xxx.md` (status tetap di Asana). Baca spec sebelum mulai.
- Branch: `feat/ewi-ELITMEN-xxx`. Agen tidak pernah push ke `main`, `dev*`, `stg*`, `prod*` dan tidak merge.
- Kerjakan test-first. Gate PR: `npm run lint`, `npm test`, `npm run build`, `npm run e2e`.
- E2E memakai API mock (`page.route`); LLM sungguhan hanya di QA malam.

## Aturan arsitektur (wajib)

1. ELGOS punya database sendiri (tabel di schema `ewi`). Tidak ada akses ke database EliteMentor;
   integrasi hanya lewat `src/integrations/elitementor` (API OAuth2 + webhook HMAC) atau LTI 1.3 Platform
   (`src/integrations/elitementor/lti` + `src/modules/lti`, ADR 0003).
2. Setiap query data bisnis memfilter `tenant_id` dari `req.tenantId`, tidak pernah dari body/query. Pengecualian:
   rute LTI publik mengambil tenant dari tiket peluncuran/token AGS di server (ADR 0003); konsol platform (ADR 0002).
3. Endpoint submodul dipasang lewat `requireSubmodule()` (entitlement + flag). Fitur baru di balik flag
   baru di `src/core/flags`, default mati.
4. Visibilitas data karyawan lewat `visibleEmployeeScope()` (RG-3): learner dirinya, atasan timnya, HR semua.
5. JWT ELGOS memakai `EWI_JWT_SECRET` dan audience `ewi`. Tidak ada fallback secret.
6. Migrasi baru: raw SQL di `apps/api/migrations`, wajib punya `down`, CI menjalankan naik-turun-naik.
7. Reviewer wajib Andrian untuk auth, kode bersama, dan migrasi.

## Agent skills

Konfigurasi untuk skill engineering Matt Pocock (`mattpocock-skills`). Skill ini melengkapi alur spek di `docs/designs/` dan Prinsip egm, tidak menggantikannya.

### Issue tracker

GitHub Issues di `andrianm28/EWI` untuk isu skill agen; status tiket `ELITMEN-xxx` tetap di Asana. See `docs/agents/issue-tracker.md`.

### Triage labels

Lima label bawaan: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` di root dan ADR di `docs/adr/`; spek paket di `docs/designs/`. See `docs/agents/domain.md`.
