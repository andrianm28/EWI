# Lingkungan AWS EWI: staging dan prod

Status: IaC siap, **belum di-deploy**. Target: **akun AWS khusus EWI** (anggota AWS Organizations ETA),
dibuat lewat profil SSO `eta-andrian` di akun management. Deploy pertama menunggu akun itu jadi.

Acuan keputusan (`ewi-grilling/teknis.md`): T7 ECS Fargate + ALB, T8 RDS Postgres sendiri di
ap-southeast-1 Single-AZ untuk pilot (Multi-AZ sebelum komersial), R2-8 alat IaC = AWS CDK TypeScript
(rekomendasi, dipakai di sini), R2-9 = **staging + prod di AWS; dev di luar AWS** (ralat user
11 Nov 2026 07:19 UTC).

## Arsitektur per lingkungan

```
Browser ──HTTPS──> CloudFront (*.cloudfront.net) ──┬── /*      ──> S3 (web Vue, privat, OAC)
                                                    └── /api/*  ──> ALB (hanya dari CloudFront)
                                                                     └──> ECS Fargate "api"
                                                                            └──> RDS Postgres 16
                                                                                 (subnet terisolasi, terenkripsi)
Secrets Manager: ewi/<env>/db, ewi/<env>/app (EWI_JWT_SECRET), ewi/<env>/elitementor
```

| Stack | Isi |
|---|---|
| `Ewi-shared` | Repo ECR `ewi-api` (tag immutable, scan on push), OIDC GitHub + role `ewi-github-deploy` |
| `Ewi-staging` | VPC 10.41.0.0/16, Fargate 0,25 vCPU/0,5 GB, RDS db.t4g.micro, backup 7 hari |
| `Ewi-prod` | VPC 10.42.0.0/16, Fargate 0,5 vCPU/1 GB, RDS db.t4g.small, backup 7 hari (PITR), log 90 hari |

Keduanya: deletion protection RDS, snapshot saat stack dihapus, termination protection stack,
secret/bucket/log dipertahankan bila stack dihapus.

Pilihan yang disengaja:
- **Tanpa NAT Gateway.** Task Fargate di subnet publik dengan IP publik, security group hanya menerima
  dari ALB; ALB hanya menerima dari prefix list CloudFront. RDS di subnet tanpa internet.
  Saat komersial, pertimbangkan subnet privat + NAT untuk prod.
- **Tanpa domain dulu.** URL `https://<id>.cloudfront.net`. Domain + sertifikat ACM ditambahkan setelah
  R2-5 diputuskan.
- **Migrasi saat container start** (`RUN_MIGRATIONS=true`). Migrasi gagal = task tidak sehat =
  ECS circuit breaker rollback ke versi sebelumnya.
- DB dihubungkan dengan TLS terverifikasi (CA RDS dibundel di image, `ssl=true`).

## Estimasi biaya (on-demand ap-southeast-1, perkiraan, belum termasuk pajak)

| Komponen | staging / bulan | prod / bulan |
|---|---|---|
| ECS Fargate, 1 task 24×7 | ± US$11 | ± US$22 |
| Application Load Balancer | ± US$20 | ± US$20 |
| RDS Single-AZ + 20 GB gp3 | ± US$22 (t4g.micro) | ± US$41 (t4g.small) |
| IPv4 publik (ALB 2 + task 1) | ± US$11 | ± US$11 |
| Secrets Manager, CloudWatch Logs, S3, CloudFront, ECR | ± US$4 | ± US$5 |
| **Total** | **± US$68** | **± US$99** |

Keduanya ± **US$167/bulan (± Rp 2,7 juta)**. Perkiraan dari harga publik; periksa di AWS Pricing
Calculator. Belum termasuk AI (Bedrock/Transcribe), SES, transfer data besar, dan Multi-AZ prod
(± +US$41) saat komersial.

## Setup sekali

1. **Akun EWI**: dari akun management (profil `eta-andrian`), `aws organizations create-account
   --email <email-root-unik> --account-name EWI`, lalu beri akses Identity Center (permission set
   AdministratorAccess) ke user ETA yang men-deploy. Buat profil SSO baru, misalnya `ewi-admin`.
2. Bootstrap CDK di akun EWI:
   ```bash
   cd infra && npm ci
   npx cdk bootstrap aws://<EWI_ACCOUNT_ID>/ap-southeast-1 --profile ewi-admin
   ```
3. Stack bersama: `npx cdk deploy Ewi-shared --profile ewi-admin`
   (akun baru belum punya OIDC provider GitHub, jadi stack ini membuatnya).
4. GitHub repo: Settings > Secrets and variables > Actions > Variables, tambah `AWS_ACCOUNT_ID`
   (id akun EWI). Settings > Environments: buat `staging` dan `prod`; di `prod` pasang required reviewer.
5. Deploy pertama staging: Actions > Deploy > Run workflow (environment `staging`). Workflow mem-build
   image di GitHub (Docker lokal tidak diperlukan), `cdk deploy Ewi-staging`, mengunggah web, smoke test.
   Catatan: `workflow_dispatch` baru muncul setelah file workflow ada di `main`.
6. Setelah staging sehat: Run workflow environment `prod`, `image_tag` = SHA yang sama.
7. Isi kredensial EliteMentor di `ewi/<env>/elitementor` (ELITEMENTOR_CLIENT_ID/SECRET) setelah EM
   menerbitkannya (T2); `ELITEMENTOR_WEBHOOK_SECRET` sudah dibangkitkan, serahkan ke tim EM (T6).
   URL API/token EM lewat context: `-c staging:elitementorApiUrl=... -c staging:elitementorTokenUrl=...`
   (atau tambahkan ke `infra/cdk.json`). Restart service setelah mengubah secret.

## Alur deploy rutin

- Merge ke `main` → otomatis deploy ke **staging**.
- Promosi ke **prod**: Run workflow manual dengan SHA yang sudah lulus di staging (image yang sama),
  disetujui reviewer environment `prod`.
- Workflow tidak jalan sama sekali sampai `AWS_ACCOUNT_ID` diisi, jadi aman di-merge lebih dulu.

## Operasional

- Log API: CloudWatch `/ewi/<env>/api`. Log Postgres: `/aws/rds/instance/.../postgresql`.
- Shell ke container: `aws ecs execute-command --cluster ewi-<env> --task <id> --container api --interactive --command sh`.
- Data karyawan nyata hanya di prod (R2-4 rekomendasi, belum diputuskan).

## Belum termasuk (menunggu keputusan)

| Item | Menunggu |
|---|---|
| (selesai) Dev publik di luar AWS | etavm1 + Cloudflare Tunnel, lihat `deploy/dev-public/` |
| Domain + HTTPS ke ALB, alamat pengirim email SES | R2-5 |
| EventBridge Scheduler untuk job (rekonsiliasi T6, pengingat, retensi) | job belum ada di kode; L3 |
| Alarm CloudWatch + notifikasi, WAF | R2-10 (RPO/RTO, dukungan) |
| Kebijakan data nyata di staging | R2-4 |
| Enkripsi kolom/KMS per tenant | R2-3 (saat ini enkripsi storage bawaan) |
| Multi-AZ prod | sebelum komersial (T8) |
