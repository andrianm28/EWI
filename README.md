# Elite Learning & Growth Operating System (ELGOS)

Repo produk ELGOS, Modul 01 Learning Needs Analysis: **CCA, DNA, TNA, INA**.
ELGOS adalah produk yang **terpisah penuh** dari EliteMentor: repo, database, deploy, dan login sendiri.
Integrasi ke EliteMentor hanya lewat API OAuth2 dan webhook bertanda tangan
(lihat [ADR 0001](docs/adr/0001-ewi-terpisah-penuh.md)).

> **Nama produk.** Sejak 13 Nov 2026 (keputusan komersial G3-A) nama produk adalah **ELGOS**; **EWI (Elite Workforce Intelligence)** adalah nama lama. Proyek HR Elitery adalah implementasi pertama ELGOS. Learning Needs Analysis (CCA, DNA, TNA, INA) adalah satu dari 4 module ELGOS; rekomendasi promosi berbasis kompetensi adalah module terpisah (G2-A). Identifier teknis (nama repo, schema `ewi`, env `EWI_*`, audience JWT `ewi`, image/paket `ewi-*`, stack CDK `Ewi*`, path di server dev) sengaja belum diganti sampai ada keputusan terpisah.

## Struktur

```
apps/api   Node 24 + Express + Sequelize + Postgres (schema `ewi`)
apps/web   Vue 3 + Vite + TypeScript + Pinia + Tailwind, e2e Playwright
docs/      ADR, arsitektur, spec tiket (docs/ewi/tickets/ELITMEN-xxx.md)
infra/     Terraform: hanya KMS per tenant + SES di AWS (docs/infra/vps-etavm2.md)
deploy/    vps/ = staging + prod di etavm2; dev-worktree/ = dev per worktree; dev-public/ = dev etavm1
```

Di dalam API:

| Path | Isi |
|---|---|
| `src/core/auth` | Login non-LTI, JWT dengan secret & audience `ewi` sendiri (B22) |
| `src/core/tenant` | Konteks tenant per request; semua query wajib memfilter `tenant_id` |
| `src/core/rbac` | 7 persona (BRD + B2 + RG-3) dan cakupan lihat data karyawan |
| `src/core/entitlement` | Entitlement Gating hybrid: `full_suite` atau per submodul (B14) |
| `src/core/flags` | Feature flag per tenant, default mati (scope penuh di balik flag, Q1) |
| `src/modules/{cca,dna,tna,ina}` | Router per submodul, dijaga entitlement + flag |
| `src/modules/projects` | FR-PRJ proyek analisis |
| `src/integrations/elitementor` | Klien OAuth2 ke EliteMentor dan verifikasi webhook HMAC |
| `migrations/` | Skema inti di schema `ewi` |

Submodul hanya terbuka bila tenant punya **entitlement** (hak komersial) **dan** flag `module.<x>`
menyala (kesiapan fitur). POC ELGOS Desember = DNA + TNA (RG-4); INA tetap di balik flag.

## Menjalankan lokal

```bash
cp .env.example apps/api/.env      # isi EWI_JWT_SECRET (>= 32 karakter)
docker compose up -d db
npm install
npm run migrate -w apps/api
npm run seed:dev -w apps/api       # tenant "demo", hr@demo.test; password dicetak di terminal
npm run dev:api                    # :4100
npm run dev:web                    # :5174
```

## Cek sebelum push

```bash
npm run lint
npm test                           # unit; integrasi DB ikut jalan bila DATABASE_URL di-set
npm run build
npm run e2e
```
