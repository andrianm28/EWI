# Lingkungan ELGOS: dev, staging, prod di VPS etavm2

Keputusan user 17 Nov 2026:

| Keputusan | Wujud |
|---|---|
| Staging dan prod di VPS **etavm2** (8 vCPU / 32 GB / 100 GB), bukan AWS | `deploy/vps/` (docker compose, Caddy TLS, backup ke S3, pemantauan), `.github/workflows/deploy.yml` |
| Kunci per tenant (R2-3) dan email **tetap di AWS** (KMS + SES), plus Bedrock, backup S3, pemantauan | `infra/` (Terraform, R2-8) |
| Dev per git worktree per thread, juga di etavm2 ("dev di sini") | `deploy/dev-worktree/dev.sh` sebagai user `elgos-dev` (Docker rootless) |
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
| dev | per worktree lewat `dev.sh` di etavm2 (user `elgos-dev`); `deploy-dev.yml` (PR #5) untuk dev-elgos di etavm1 sampai dipindah |

Alur lengkap, pengaman, dan aturan migrasi: [alur-rilis.md](alur-rilis.md).

`deploy/vps/deploy.sh` di runner etavm2:
cek `.env` + `db.env` → pull image → backup schema `ewi` dan verifikasi terbaca (`pg_restore --list`) →
migrasi sebagai pemilik `elgos` → pasang role aplikasi `elgos_app` (`ops/app-role.sql`) → ganti
container → `/api/ready` lokal + publik. Gagal sebelum siap lokal = rollback ke image sebelumnya. Di
staging schema direstore otomatis bila backupnya terverifikasi; di prod tidak pernah (audit 3-2: tulisan
pengguna selama migrasi bisa hilang), log menuliskan perintah `ops/restore.sh` untuk restore manual. `ROLLBACK_RESTORE_DB=1` memaksa
restore otomatis di prod; pakai hanya untuk deploy manual yang diawasi saat tidak ada tulisan pengguna.
Gagal cek publik sesudah siap lokal tidak memicu rollback, job hanya gagal dengan peringatan Caddy/DNS. Diuji lokal: deploy pertama, deploy ulang, v2 dengan migrasi baru + API
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
rollback v2 di staging memulihkan schema dan kepemilikannya (prod tidak merestore otomatis, audit 3-2). Sesuai `docs/ewi/database-role-dan-migrasi.md` (PR #14).

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
- Biaya (PO-10 C, 18 Nov: tanpa plafon): `elgos-cost-report.timer` tiap Senin 08.00 WIB mengirim biaya AWS
  7 hari per layanan + bulan berjalan ke email peringatan, untuk cadence. AWS Budgets mati
  (`monthly_budget_usd = 0`), bisa diaktifkan bila nanti ada plafon.
- Jadwal siaga: [runbook-insiden.md](runbook-insiden.md) (PO-9 B, jam kerja selama pilot).

## AWS yang tersisa (Terraform, R2-8)

| Folder | Isi |
|---|---|
| `infra/bootstrap` | bucket state `elgos-tfstate-<akun>` + provider OIDC GitHub + role `elgos-terraform-plan`/`-apply` (sekali per akun, state lokal, oleh admin) |
| `infra/live/shared` | identitas SES, bucket + kunci backup, user `elgos-ops-etavm2` (unggah backup, SNS, baca biaya) dan `elgos-restore`, SNS, health check + alarm, budget opsional |
| `infra/live/staging`, `infra/live/prod` | modul `app-crypto`: kunci KMS per tenant + alias, IAM user `elgos-<env>-app` |

- User aplikasi: `kms:GenerateDataKey`/`Decrypt` pada kunci bertag lingkungannya dengan encryption
  context `tenant`, `ses:SendEmail`/`SendRawEmail` dari `mail_from`, dan Bedrock `InvokeModel` model
  Anthropic di ap-southeast-1 (PD-1 A). Semua hanya dari IP etavm2 (`aws:SourceIp`, N-4).
- Kunci KMS dibuat Terraform saat tenant diaktifkan (tambah id ke `tenant_ids`, PR → plan → apply).
- Access key dibuat lewat CLI agar tidak masuk state; rotasi 90 hari: [rotasi-kunci.md](rotasi-kunci.md).
- Biaya: US$1 per kunci per bulan (tenant + backup) + permintaan KMS, SES US$0,10 per 1.000 email,
  S3 backup beberapa sen per GB, health check Route 53 ±US$1–2 per bulan, Bedrock sesuai pemakaian.

## Status etavm2 (19 Nov 2026)

`setup-etavm2.sh` sudah dijalankan (tanpa `ACME_EMAIL`/`RUNNER_TOKEN`): SSH kunci saja, root login
mati, ufw 22/80/443, fail2ban, Docker 29 + rotasi log, AWS CLI 2, user `elgos-deploy` dan `elgos-dev`
(Docker rootless, terisolasi dari daemon utama, `/srv/elgos-*`, dan `/etc/elgos`), 9 timer aktif.
Catatan server: `/tmp` di-mount noexec dan umask admin 0027 (skrip sudah menanganinya). Belum: Caddy
(DNS + `ACME_EMAIL`), runner (`RUNNER_TOKEN`), isi `.env`/`ops.env` (menunggu akun AWS ELGOS).

## Kunci GCP suara (B19)

Thread suara memasang `/etc/elgos/gcp-voice.json` (root 0600; project `elgos-dev`, SA `elgos-voice`,
hanya `roles/aiplatform.user`). `sudo ops/pasang-kunci-gcp.sh <env>` menyalinnya ke
`/srv/elgos-<env>/secrets/gcp-voice.json` milik uid 1000 (user `node` di image API), 0400; compose
memasangnya hanya-baca di `/run/secrets/gcp-voice.json`. Aktif bila `.env` berisi
`GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/gcp-voice.json`. Setup memasangnya untuk staging; prod
hanya dengan `GCP_KEY_PROD=1` sampai ada project GCP produksi. Dev per worktree tidak mendapat kunci
ini (elgos-dev tidak bisa membaca `/etc/elgos`).

Uji asap staging 24 Nov: `.env` staging `VOICE_PROVIDER=gemini-vertex` (bawaan `fake`), `VOICE_MODEL`,
`VOICE_LOCATION=asia-southeast1`. WebSocket `/api/voice/sessions/:id/stream` diteruskan Caddy apa
adanya dan nginx web (`location /api/voice/`, timeout 1 jam). Keluar ke
`asia-southeast1-aiplatform.googleapis.com:443` diizinkan (ufw hanya membatasi masuk).

## QA malam dengan AI sungguhan (B18)

Keputusan user 19 Nov: akun Bedrock siap 24 Nov, QA malam 24–26 Nov untuk Go/No-Go 27 Nov.
`infra/live/shared/qa-malam.tf` membuat role `elgos-qa-malam` (OIDC dari environment GitHub
`qa-malam` yang hanya boleh dari `main`, izin hanya `bedrock:InvokeModel` pada model QA, ditambah
inference profile bila memakai profil) dan budget `elgos-qa-malam` (★ US$100/bulan, peringatan
50%/80%/prakiraan 100%, seluruh akun). Role terpisah dari user aplikasi (KMS/SES) dan tidak dibuat
selama `qa_bedrock_model_id` kosong. Hasil cek 23 Nov di akun ELGOS: di Jakarta
`ap-southeast-3` Claude hanya tersedia lewat profil `global.anthropic.*` (pemrosesan lintas region dunia,
tanpa profil `apac.`); di Singapura `anthropic.claude-sonnet-5` tersedia ON_DEMAND, sedangkan
`anthropic.claude-sonnet-5-5` hanya lewat profil `global.anthropic.claude-sonnet-5-5`. Keputusan user 23 Nov
(menggantikan pilihan Sonnet 5 pagi itu): QA malam dan aplikasi memakai **Sonnet 5.5 lewat profil global dari
endpoint ap-southeast-1** (`BEDROCK_MODEL_ID=global.anthropic.claude-sonnet-5-5`). Prompt bisa diproses di region
AWS mana pun; DPIA/consent diperbarui thread legal. Harga Pricing API 23 Nov: global US$2/US$10 per juta token
input/output (Sonnet 5 in-region US$2,20/US$11). IAM: role QA dan user aplikasi mengizinkan model dasar di semua
region hanya bila dipanggil lewat inference profile di akun ini (`bedrock:InferenceProfileArn`).
Urutan rollout: pasang `BEDROCK_MODEL_ID=global.anthropic.claude-sonnet-5-5` di `/srv/elgos-*/.env` **setelah**
image yang memuat commit aplikasi 1d77cab (env.js menerima profil `global.`) terpasang; image lama menolak
profil itu saat boot.

Langkah tangan admin (akun, region, bootstrap, akses model, variabel repo, apply) dibungkus wizard
`bash infra/setup-akun-elgos.sh` (23 Nov dijalankan di etavm2 dengan `aws login --remote`). Variabel repo hasilnya: `QA_MALAM_ROLE_ARN`,
`QA_MALAM_BEDROCK_REGION`, `QA_MALAM_BEDROCK_MODEL_ID`, `QA_MALAM_AI_PRICE_INPUT_PER_MTOK`,
`QA_MALAM_AI_PRICE_OUTPUT_PER_MTOK`, opsional `QA_MALAM_MAX_TOKENS`. Cadangan bila akun terlambat: satu run manual
oleh Andrian 26 Nov.

Akses operator ke akun ELGOS sejak 24 Nov: IAM Identity Center (grup admin, permission set
AdministratorAccess). Di etavm2 pakai `aws sso login --sso-session elgos --use-device-code` lalu
`AWS_PROFILE=elgos-sso` (juga untuk `terraform` manual). Profil lama `elgos-admin`/`elgos-admin-sts` sudah
dihapus dari etavm2; wizard tahap 3 membuatnya ulang hanya bila dijalankan lagi.

## Setup sekali

1. AWS (dari laptop admin, profil SSO akun ELGOS, setelah akun ada): `infra/bootstrap` apply
   (`-var github_repo=andrianm28/EWI`) → salin `live/backend.hcl.example` ke `live/backend.hcl`.
2. GitHub: variabel repo `AWS_ACCOUNT_ID`, `ETAVM2_IP`, `ALERT_EMAILS` (JSON list); environment
   `staging`, `prod`, `infra` dan branch protection sesuai [alur-rilis.md](alur-rilis.md).
3. Actions > Terraform > Run workflow dari `main` (apply shared, staging, prod). Konfirmasi email
   langganan SNS. Tambahkan CNAME DKIM di Cloudflare, ajukan keluar dari SES sandbox, aktifkan akses
   model Bedrock Anthropic di ap-southeast-1. Aktifkan Cost Explorer (Billing > Cost Explorer) untuk
   laporan biaya mingguan.
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

## Dev per worktree (di etavm2)

```
sudo -iu elgos-dev                                       # bukan user admin/deploy
git clone https://github.com/andrianm28/EWI.git elgos && cd elgos
git worktree add ../elgos-fitur-x -b feat/ewi-ELITMEN-123
cd ../elgos-fitur-x && deploy/dev-worktree/dev.sh up     # build, migrasi, seed, URL publik
deploy/dev-worktree/dev.sh ls                            # semua dev worktree di host ini
deploy/dev-worktree/dev.sh down --purge                  # hapus stack + DB worktree ini
```

- **Isolasi dari produksi:** dev memakai daemon Docker rootless milik user `elgos-dev`, terpisah dari
  daemon staging/prod. `elgos-dev` tidak masuk grup `docker` dan tidak bisa membaca `/srv/elgos-*`.
  `dev.sh` menolak jalan di etavm2 bila tidak memakai Docker rootless.
- **Batas sumber daya:** per worktree DB dan API masing-masing 1 vCPU / 768 MB, web 128 MB; seluruh
  dev dibatasi slice systemd 4 vCPU / 10 GB. Staging dikecilkan (DB 2 GB, API 1 GB). Prod tetap
  DB 6 GB / API 4 GB. Total muat untuk 8 thread paralel (T1–T8) di 8 vCPU / 32 GB.
- Project compose `elgos-dev-<slug branch>`, port lokal bebas 8200–8399, secret acak di `.elgos-dev/.env`
  (diabaikan git), enkripsi `local`, email `log`, seed demo otomatis. Hanya data sintetis.
- URL publik lewat Cloudflare quick tunnel (`*.trycloudflare.com`, berubah bila tunnel di-restart);
  `--local` untuk tanpa URL publik. Diuji lokal: dua worktree berjalan bersamaan dengan port dan DB terpisah.
- Thread yang bekerja lewat Remote Control di etavm2 memakai user `elgos-dev`, bukan admin.
