# Lingkungan ELGOS: staging + prod di VPS etavm2, dev per worktree

Keputusan user 17 Nov 2026:

| Keputusan | Wujud |
|---|---|
| Staging dan prod di VPS **etavm2** (8 vCPU / 32 GB / 100 GB), bukan AWS | `deploy/vps/` (docker compose, Caddy TLS, backup harian), `.github/workflows/deploy.yml` |
| Kunci per tenant (R2-3) dan email **tetap di AWS** (KMS + SES) | `infra/` (Terraform, R2-8): KMS per tenant, identitas SES, IAM user per lingkungan |
| Dev per git worktree per thread | `deploy/dev-worktree/dev.sh` |
| R2-4: pilot ELGOS di prod, data nyata hanya di prod | prod tidak pernah di-seed; staging hanya data uji |

Menggantikan rencana AWS penuh (ECS Fargate + RDS + CloudFront) dari 11–13 Nov.

## Arsitektur etavm2

```
Internet ──443──> Caddy (network host, Let's Encrypt)
                   ├─ elgos.eliteacademy.id      -> 127.0.0.1:8180  project elgos-prod
                   └─ stg-elgos.eliteacademy.id  -> 127.0.0.1:8181  project elgos-staging
project elgos-<env>: web (nginx, SPA + /api proxy) -> api (Node) -> db (Postgres 16, volume sendiri)
api ──HTTPS──> AWS ap-southeast-1: KMS (GenerateDataKey/Decrypt, kunci per tenant), SES (kirim email)
```

- Dua project compose terpisah dari satu file (`deploy/vps/docker-compose.yml`, `ELGOS_ENV=staging|prod`):
  jaringan, volume DB, secret, dan IAM user berbeda. Postgres tidak terekspos ke host.
- Batas sumber daya default per lingkungan: DB 2 vCPU / 6 GB, API 2 vCPU / 4 GB, web 1 vCPU / 256 MB.
  Kedua lingkungan muat di 8 vCPU / 32 GB dengan sisa untuk OS dan cache; staging boleh dikecilkan lewat `.env`.
- Firewall: hanya 22, 80, 443. Runner GitHub Actions hanya koneksi keluar.

## CI/CD

| Pemicu | Hasil |
|---|---|
| PR | `ci.yml`: lint, migrasi naik-turun-naik, jest, build, e2e, terraform validate, cek skrip deploy |
| push ke `main` | CI → build image `ghcr.io/andrianm28/ewi-{api,web}:<sha>` → deploy **staging** |
| Actions > Deploy staging/prod > Run workflow | `prod` + `image_tag` (SHA yang sudah lolos di staging) → deploy **prod** lewat environment `prod` |
| dev | `deploy-dev.yml` (PR #5) untuk etavm1; dev per worktree lewat `dev.sh` |

`deploy/vps/deploy.sh` di runner etavm2: cek `.env` → pull image → backup schema `ewi` → migrasi →
ganti container → health lokal + publik. Gagal setelah backup = rollback otomatis ke image sebelumnya,
dan schema direstore bila migrasi sempat jalan. Diuji lokal: deploy pertama, deploy ulang, dan v2 dengan
migrasi baru + API crash (rollback ke v1, tabel migrasi v2 hilang, data user tetap, health OK).

## Backup

- Sebelum setiap deploy (20 terakhir) dan harian 02:15 WIB prod / 02:45 WIB staging (14 terakhir),
  di `/srv/elgos-<env>/backups`. Timer systemd `elgos-backup@<env>.timer`.
- Salinan di luar etavm2 belum ada: menunggu R2-10r (selaras RG-11). `backup.sh` sudah punya kait `OFFSITE_CMD`.

## AWS yang tersisa (Terraform)

| Folder | Isi |
|---|---|
| `infra/bootstrap` | bucket state `elgos-tfstate-<akun>` (sekali per akun, state lokal) |
| `infra/live/shared` | identitas domain SES (`mail_domain`, sementara `eliteacademy.id`, R2-5r) + output 3 CNAME DKIM |
| `infra/live/staging`, `infra/live/prod` | modul `app-crypto`: kunci KMS per tenant (`tenant_ids`) + alias `alias/elgos-<env>-tenant-<tenantId>`, IAM user `elgos-<env>-app` |

- User aplikasi hanya boleh `kms:GenerateDataKey` dan `kms:Decrypt` pada kunci bertag lingkungannya
  dengan encryption context `tenant`, dan `ses:SendEmail`/`SendRawEmail` dari `mail_from`.
- Kunci dibuat Terraform saat tenant diaktifkan (tambah id ke `tenant_ids`, apply), bukan oleh API.
- Access key IAM user dibuat lewat CLI agar tidak masuk state Terraform:
  `aws iam create-access-key --user-name elgos-prod-app`, isi ke `/srv/elgos-prod/.env`, rotasi berkala.
- Biaya AWS: US$1 per kunci tenant per bulan + US$0,03 per 10.000 permintaan KMS + SES US$0,10 per 1.000 email.

## Setup sekali

1. AWS (dari etavm1, profile `eta-andrian`, setelah akun ELGOS ada): `infra/bootstrap` → salin
   `live/backend.hcl.example` ke `live/backend.hcl` → apply `live/shared`, `live/staging`, `live/prod`.
   Tambahkan CNAME DKIM di Cloudflare, ajukan keluar dari SES sandbox.
2. DNS Cloudflare: A record `elgos` dan `stg-elgos` ke IP publik etavm2 (DNS only saat pertama agar
   Let's Encrypt HTTP-01 jalan; boleh di-proxy setelahnya dengan SSL mode Full (strict)).
3. etavm2: clone repo, lalu `RUNNER_TOKEN=<token> ACME_EMAIL=<email> deploy/vps/setup-etavm2.sh`.
   Isi `AWS_ACCESS_KEY_ID/SECRET` dan `ELITEMENTOR_*` di `/srv/elgos-staging/.env` dan `/srv/elgos-prod/.env`
   (secret DB/JWT sudah dibuat acak oleh skrip). Staging: tambah `DEV_SEED_PASSWORD` bila ingin data demo.
4. GitHub: Settings > Environments: buat `staging` dan `prod` (prod: required reviewer).
5. Deploy pertama staging: Actions > Deploy staging/prod > Run workflow (staging, `image_tag` kosong).
   Prod: Run workflow dengan `prod` + SHA yang sama, sebelum uji internal 25 Nov (R2-4).

## Dev per worktree

```
git worktree add ../elgos-fitur-x -b feat/ewi-ELITMEN-123
cd ../elgos-fitur-x && deploy/dev-worktree/dev.sh up     # build, migrasi, seed, URL publik
deploy/dev-worktree/dev.sh ls                            # semua dev worktree di host ini
deploy/dev-worktree/dev.sh down --purge                  # hapus stack + DB worktree ini
```

- Project compose `elgos-dev-<slug branch>`, port lokal bebas 8200–8399, secret acak di `.elgos-dev/.env`
  (diabaikan git), enkripsi `local`, email `log`, seed demo otomatis.
- URL publik lewat Cloudflare quick tunnel (`*.trycloudflare.com`, berubah bila tunnel di-restart);
  `--local` untuk tanpa URL publik. Diuji lokal: dua worktree berjalan bersamaan dengan port dan DB terpisah.
- Butuh host dengan Docker dan akses keluar ke Cloudflare: etavm1 atau mesin dev mana pun.
