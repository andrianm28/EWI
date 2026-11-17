# Lingkungan ELGOS: staging + prod di VPS etavm2, dev per worktree

Keputusan user 17 Nov 2026:

| Keputusan | Wujud |
|---|---|
| Staging dan prod di VPS **etavm2** (8 vCPU / 32 GB / 100 GB), bukan AWS | `deploy/vps/` (docker compose, Caddy TLS, backup ke S3, pemantauan), `.github/workflows/deploy.yml` |
| Kunci per tenant (R2-3) dan email **tetap di AWS** (KMS + SES), plus Bedrock, backup S3, pemantauan | `infra/` (Terraform, R2-8) |
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
| PR | `ci.yml`: lint, migrasi naik-turun-naik, jest, build, e2e, terraform validate, `bash -n` + shellcheck skrip deploy |
| PR yang mengubah `infra/` | `terraform.yml`: plan shared/staging/prod dengan role OIDC baca-saja |
| push ke `main` | CI → image `ghcr.io/andrianm28/ewi-{api,web}:<sha>` → deploy **staging** |
| Actions > Deploy > Run workflow (dari `main`) | `prod` + `image_tag` SHA 40 karakter yang ada di `main` → environment `prod` berpenyetuju |
| Actions > Terraform > Run workflow (dari `main`) | apply lewat environment `infra` berpenyetuju |
| dev | `deploy-dev.yml` (PR #5) untuk etavm1; dev per worktree lewat `dev.sh` |

Alur lengkap, pengaman, dan aturan migrasi: [alur-rilis.md](alur-rilis.md).

`deploy/vps/deploy.sh` di runner etavm2:
cek `.env` + `db.env` → pull image → backup schema `ewi` dan verifikasi terbaca (`pg_restore --list`) →
migrasi sebagai pemilik `elgos` → pasang role aplikasi `elgos_app` (`ops/app-role.sql`) → ganti
container → `/api/ready` lokal + publik. Gagal = rollback ke image sebelumnya; schema direstore hanya
bila backupnya terverifikasi. Diuji lokal: deploy pertama, deploy ulang, v2 dengan migrasi baru + API
crash (rollback, data tetap, role dipasang ulang).

### Pemisahan kredensial DB (PD-8 A)

| Role | Hak | Password di | Dipakai oleh |
|---|---|---|---|
| `elgos` (superuser bawaan container) | semua | `db.env` `POSTGRES_PASSWORD` | bootstrap role, backup, restore |
| `elgos_owner` (bukan superuser) | pemilik database, schema `ewi`, semua objeknya | `db.env` `DB_MIGRATION_PASSWORD` | migrasi (`DB_MIGRATION_USER`), container sekali jalan |
| `elgos_app` | DML di `ewi`, tanpa DDL; `audit_logs` hanya INSERT/SELECT; `sequelize_meta` SELECT | `.env` `DB_PASSWORD` | container api (`DB_USER`, `DB_REQUIRE_NON_SUPERUSER=true`) |

`ops/app-role.sql` (dijalankan deploy.sh sebelum dan sesudah migrasi, dan setelah restore) membuat
kedua role, memindahkan kepemilikan objek `ewi` ke `elgos_owner` (tanpa REASSIGN OWNED), memasang
hak dan default privileges, lalu memeriksa tidak ada hak berbahaya. Password `elgos_owner` sengaja di
`db.env`, bukan `.env`, supaya tidak masuk container API; deploy.sh memberikannya hanya ke container
migrasi. Diuji lokal: tabel milik `elgos_owner`, `elgos_app` ditolak CREATE dan DELETE `audit_logs`,
rollback v2 memulihkan schema dan kepemilikannya. Sesuai `docs/ewi/database-role-dan-migrasi.md` (PR #14).

### Job terjadwal (PD-15 A)

`sudo deploy/vps/ops/install-job.sh <env> <nama-job> "<OnCalendar>"` membuat timer systemd
`elgos-job-<env>-<nama>` yang menjalankan `ops/run-job.sh`: container API sekali jalan
`node scripts/run-job.js <nama-job>` dengan env API yang sama, flock, peringatan bila gagal (exit 1)
atau nama job tidak dikenal image (exit 2). Dilewati bila lingkungan belum pernah dideploy.
`setup-etavm2.sh` memasang untuk staging dan prod:

| Job | Jadwal | Sumber |
|---|---|---|
| `interview-reminders` | harian 08.00 WIB | PK-23, PR #12 |
| `import-batches-cleanup` | harian 03.30 WIB (setelah backup malam), `IMPORT_BATCH_TTL_DAYS` bawaan 7 | PK-15, PR #11 |

## Backup dan pemulihan (PD-20 A)

| Jenis | Jadwal | Lokal | S3 `elgos-backup-<akun>` |
|---|---|---|---|
| hourly (prod) | Sen–Jum tiap jam 08.05–18.05 WIB | 7 hari | 7 hari |
| nightly | prod 02.15 WIB, staging 02.45 WIB | 30 hari | 30 hari |
| pre-deploy | setiap deploy | 30 hari | – |
| manual | `ops/backup.sh manual` | 30 hari | 30 hari |

- `ops/backup.sh`: `pg_dump -Fc` → verifikasi `pg_restore --list` → unggah SSE-KMS (kunci khusus
  `alias/elgos-backup`) + checksum SHA-256. Prod gagal keras bila `BACKUP_BUCKET` kosong.
- Bucket: versioning, blokir akses publik, wajib TLS dan kunci backup, versi lama dihapus setelah 7 hari.
  User `elgos-ops-etavm2` hanya boleh unggah (tidak bisa baca atau hapus), dan hanya dari IP etavm2.
  Baca hanya lewat `elgos-restore` yang kuncinya dibuat saat dibutuhkan.
- `ops/restore.sh uji <s3://… | berkas>`: pulihkan ke Postgres sementara tanpa jaringan, hitung baris
  per tabel, catat lama pemulihan di `/srv/elgos-restore-uji.log`, lalu hapus. Data prod tidak pernah
  masuk staging. Diuji lokal: 16 tabel, 4 detik.
- `ops/restore.sh pulihkan <env> <src>`: pemulihan sungguhan (prod butuh `KONFIRMASI=prod`), didahului
  backup pengaman. Langkah insiden: [runbook-insiden.md](runbook-insiden.md).

## Pemantauan (PK-21)

- Dari luar: Route 53 health check HTTPS `/api/ready` tiap 30 detik untuk prod dan staging, alarm
  CloudWatch `elgos-<env>-down` → SNS `elgos-alerts-uptime` (us-east-1) → email.
- Di etavm2: `elgos-monitor.timer` tiap 5 menit (disk, container, Caddy, kesiapan, umur backup);
  backup dan job gagal → `elgos-alert` → SNS `elgos-alerts` → email. Peringatan yang sama tidak diulang
  dalam 60 menit. Semua tercatat di journal (`journalctl -t elgos-alert`).
- Log container dirotasi 20 MB × 5 per container (compose dan `daemon.json`).
- Biaya: AWS Budget `elgos-bulanan` US$150 (PO-10 A), email di 80% dan 100% aktual serta 100% prakiraan.
- Jadwal siaga: [runbook-insiden.md](runbook-insiden.md) (PO-9 B, jam kerja selama pilot).

## AWS yang tersisa (Terraform, R2-8)

| Folder | Isi |
|---|---|
| `infra/bootstrap` | bucket state `elgos-tfstate-<akun>` + provider OIDC GitHub + role `elgos-terraform-plan`/`-apply` (sekali per akun, state lokal, oleh admin) |
| `infra/live/shared` | identitas SES, bucket + kunci backup, user `elgos-ops-etavm2` dan `elgos-restore`, SNS, health check + alarm, budget |
| `infra/live/staging`, `infra/live/prod` | modul `app-crypto`: kunci KMS per tenant + alias, IAM user `elgos-<env>-app` |

- User aplikasi: `kms:GenerateDataKey`/`Decrypt` pada kunci bertag lingkungannya dengan encryption
  context `tenant`, `ses:SendEmail`/`SendRawEmail` dari `mail_from`, dan Bedrock `InvokeModel` model
  Anthropic di ap-southeast-1 (PD-1 A). Semua hanya dari IP etavm2 (`aws:SourceIp`, N-4).
- Kunci KMS dibuat Terraform saat tenant diaktifkan (tambah id ke `tenant_ids`, PR → plan → apply).
- Access key dibuat lewat CLI agar tidak masuk state; rotasi 90 hari: [rotasi-kunci.md](rotasi-kunci.md).
- Biaya: US$1 per kunci per bulan (tenant + backup) + permintaan KMS, SES US$0,10 per 1.000 email,
  S3 backup beberapa sen per GB, health check Route 53 ±US$1–2 per bulan, Bedrock sesuai pemakaian.

## Setup sekali

1. AWS (dari laptop admin, profil SSO akun ELGOS, setelah akun ada): `infra/bootstrap` apply
   (`-var github_repo=andrianm28/EWI`) → salin `live/backend.hcl.example` ke `live/backend.hcl`.
2. GitHub: variabel repo `AWS_ACCOUNT_ID`, `ETAVM2_IP`, `ALERT_EMAILS` (JSON list); environment
   `staging`, `prod`, `infra` dan branch protection sesuai [alur-rilis.md](alur-rilis.md).
3. Actions > Terraform > Run workflow dari `main` (apply shared, staging, prod). Konfirmasi email
   langganan SNS. Tambahkan CNAME DKIM di Cloudflare, ajukan keluar dari SES sandbox, aktifkan akses
   model Bedrock Anthropic di ap-southeast-1.
4. DNS Cloudflare: A record `elgos` dan `stg-elgos` ke IP publik etavm2 (DNS only saat pertama agar
   Let's Encrypt HTTP-01 jalan; boleh di-proxy setelahnya dengan SSL mode Full (strict)).
5. etavm2 (admin dengan kunci SSH sudah terpasang): clone repo, lalu
   `RUNNER_TOKEN=<token> ACME_EMAIL=<email> deploy/vps/setup-etavm2.sh`. Skrip mengeraskan SSH
   (kunci saja, tanpa root), ufw, fail2ban, unattended-upgrades, rotasi log Docker, membuat secret DB/JWT
   acak, timer backup dan pemantauan.
6. Isi access key `elgos-<env>-app`, `ELITEMENTOR_*`, dan `ETA_ADMIN_EMAILS` (wajib di prod; tanpa ini
   tidak ada Admin ETA yang bisa masuk) di `/srv/elgos-<env>/.env`. `TRUST_PROXY=2` (Caddy + nginx)
   sudah terisi; staging boleh `AUTH_PASSWORD_LOGIN=false`. Lalu isi access key
   `elgos-ops-etavm2`, `BACKUP_BUCKET`, dan `ALERT_TOPIC_ARN` di `/etc/elgos/ops.env`. Catat di
   [akses-etavm2.md](akses-etavm2.md).
7. Deploy pertama staging (Run workflow staging), lalu prod dengan SHA yang sama sebelum 25 Nov (R2-4).
8. `ops/backup.sh manual` + `ops/restore.sh uji` di prod sebelum data nyata diimpor (24 Nov); catat
   lama pemulihan.
9. Setelah semua jalan dari GitHub OIDC: hapus profil SSO `eta-andrian` dari etavm1 (P1-6).

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
