# Lingkungan AWS ELGOS: staging dan prod (Terraform)

Status: IaC siap, **belum di-deploy**. Target: **akun AWS khusus ELGOS** (anggota AWS Organizations ETA),
dibuat dari akun management lewat profil SSO `eta-andrian` (ada di etavm1).

Keputusan acuan (`ewi-grilling/teknis.md`; produk kini bernama ELGOS, G3-A):

| Kode | Keputusan | Wujud di IaC |
|---|---|---|
| T7 | ECS Fargate + ALB | `modules/environment/app.tf` |
| T8 | RDS Postgres sendiri, ap-southeast-1, Single-AZ saat pilot | `data.tf` (Multi-AZ = satu variabel) |
| R2-3 | Kunci KMS **per tenant** | kunci dibuat Terraform (`kms.tf`, `tenant_ids`); role task hanya GenerateDataKey/Decrypt; bucket data wajib SSE-KMS |
| R2-4 | Pilot ELGOS di **prod**, flag per tenant | prod harus hidup sebelum uji internal 25 Nov / POC 2 Des; data nyata hanya di prod |
| R2-8 | **Terraform** | seluruh `infra/` (HCL), state di S3 dengan lock native |
| R2-9 | AWS hanya staging + prod; dev di etavm1 | `live/staging`, `live/prod`; dev di `deploy/dev-public` |

## Arsitektur per lingkungan

```
Browser ──HTTPS──> CloudFront (*.cloudfront.net) ──┬── /*      ──> S3 web (privat, OAC)
                                                    └── /api/*  ──> ALB (hanya dari CloudFront)
                                                                     └──> ECS Fargate "api"
                                                                            ├──> RDS Postgres 16 (subnet terisolasi, TLS wajib)
                                                                            ├──> S3 data tenant (SSE-KMS wajib)
                                                                            └──> KMS: satu kunci per tenant
Secrets Manager: password master RDS (dikelola RDS), elgos-<env>/app (JWT), elgos-<env>/elitementor
```

| Folder | Isi |
|---|---|
| `infra/bootstrap` | Bucket state `elgos-tfstate-<akun>` (versioning, SSE-KMS, TLS wajib). State lokal, sekali per akun. |
| `infra/live/shared` | ECR `elgos-api` (tag immutable, scan), OIDC GitHub, role `elgos-github-deploy`. Di-apply admin. |
| `infra/live/staging` | VPC 10.41/16, Fargate 0,25 vCPU/0,5 GB, RDS db.t4g.micro, log 30 hari |
| `infra/live/prod` | VPC 10.42/16, Fargate 0,5 vCPU/1 GB, RDS db.t4g.small, log 90 hari |
| `infra/modules/environment` | Semua sumber daya per lingkungan |

Keduanya: PITR 7 hari, deletion protection RDS, snapshot akhir saat dihapus, Performance Insights.

### Kunci per tenant (R2-3)

- Satu customer managed key per tenant dibuat oleh Terraform saat tenant diaktifkan: tambahkan id tenant
  (`req.tenantId`) ke `tenant_ids` di `live/<env>/main.tf`, lalu apply. Tag `elgos:env` + `elgos:tenant`,
  rotasi tahunan, `prevent_destroy`.
- Alias mengikuti kontrak API (PR #2): `alias/elgos-<env>-tenant-<tenantId>`, dengan env
  `ENCRYPTION_PROVIDER=kms` dan `KMS_KEY_ALIAS_PREFIX=elgos-<env>-tenant`. API menolak boot di produksi
  tanpa `kms`.
- Role task hanya boleh `kms:GenerateDataKey` dan `kms:Decrypt` pada kunci bertag lingkungan ini, dan
  hanya dengan encryption context `tenant` (envelope encryption) atau lewat S3 (SSE-KMS bucket data).
  Tidak ada izin membuat, menghapus, menonaktifkan kunci, atau mengubah key policy.
- Biaya: US$1/kunci/bulan + US$0,03 per 10.000 permintaan. 10 tenant ≈ US$10/bulan.
- Dev (etavm1) memakai `ENCRYPTION_PROVIDER=local` dengan `EWI_LOCAL_MASTER_KEY` dari `.env`; hanya data sintetis.

### Email (SES)

- API memakai `MAIL_PROVIDER=ses` dengan `MAIL_FROM` (variabel `mail_from`) dan `APP_BASE_URL` = URL web.
  Role task hanya boleh `ses:SendEmail`/`ses:SendRawEmail` dari alamat `mail_from`.
- Domain email final menunggu R2-5r; sementara `noreply@eliteacademy.id`. Identitas SES harus
  diverifikasi dan akun keluar dari SES sandbox sebelum kirim ke penerima nyata. Dev memakai `MAIL_PROVIDER=log`.

## Estimasi biaya (on-demand ap-southeast-1, perkiraan, belum pajak)

| Komponen | staging / bulan | prod / bulan |
|---|---|---|
| ECS Fargate, 1 task 24×7 | ± US$11 | ± US$22 |
| Application Load Balancer | ± US$20 | ± US$20 |
| RDS Single-AZ + 20 GB gp3 | ± US$22 (t4g.micro) | ± US$41 (t4g.small) |
| IPv4 publik (ALB 2 + task 1) | ± US$11 | ± US$11 |
| KMS per tenant, Secrets, Logs, S3, CloudFront, ECR | ± US$5 | ± US$10 |
| **Total** | **± US$69** | **± US$104** |

Keduanya ± **US$173/bulan (± Rp 2,8 juta)**. Belum termasuk AI (Bedrock/Transcribe), SES, dan transfer
data besar. Periksa di AWS Pricing Calculator.

## Setup sekali (urutan)

1. **Akun ELGOS**: dari etavm1, `aws sso login --profile eta-andrian`, lalu
   `aws organizations create-account --email <email-root-unik> --account-name ELGOS`. Beri permission set
   AdministratorAccess di Identity Center ke user ETA yang men-deploy; buat profil `elgos-admin`.
2. **State**: `cd infra/bootstrap && AWS_PROFILE=elgos-admin terraform init && terraform apply`.
   Salin `live/backend.hcl.example` ke `live/backend.hcl` dan isi id akun.
3. **Shared**: `cd infra/live/shared && terraform init -backend-config=../backend.hcl && terraform apply`.
4. **GitHub**: variabel repo `AWS_ACCOUNT_ID` (akun ELGOS); Environments `staging` dan `prod`
   (`prod` dengan required reviewer).
5. **Staging**: merge ke `main` (atau Run workflow `staging`). Workflow build image di GitHub, `terraform
   apply`, unggah web, smoke test `/api/health`.
6. **Prod**: Run workflow `prod` dengan `image_tag` = SHA yang sudah sehat di staging. Target sebelum 25 Nov.
7. Isi `ELITEMENTOR_CLIENT_ID/SECRET` di secret `elgos-<env>/elitementor` setelah EM menerbitkannya (T2);
   secret webhook sudah dibangkitkan, serahkan ke tim EM (T6). URL EM: `-var elitementor_api_url=...`.

## Operasional

- Log API: CloudWatch `/elgos/<env>/api`. Log Postgres: `/aws/rds/instance/elgos-<env>/postgresql`.
- Shell ke container: `aws ecs execute-command --cluster elgos-<env> --task <id> --container api --interactive --command sh`.
- Role CI (`elgos-github-deploy`): PowerUserAccess + IAM terbatas pada `elgos-*`; tidak bisa mengubah dirinya.

## Belum termasuk (menunggu keputusan)

| Item | Menunggu |
|---|---|
| Domain (mis. elgos.eliteacademy.id) + sertifikat ACM, pengirim email SES | R2-5r |
| EventBridge Scheduler untuk job (rekonsiliasi T6, pengingat, retensi) | job belum ada di kode; L3 |
| Alarm CloudWatch + notifikasi, WAF, target backup final | R2-10r (selaras RG-11) |
| Multi-AZ prod | sebelum komersial (T8); RG-11 menyatakan bukan HA |
