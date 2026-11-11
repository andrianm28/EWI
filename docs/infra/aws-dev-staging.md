# Lingkungan AWS EWI: dev dan staging

Status: IaC siap, **belum di-deploy**. Deploy pertama menunggu konfirmasi akun AWS, cara kredensial,
dan anggaran dari pemilik produk.

Acuan keputusan (`ewi-grilling/teknis.md`): T7 ECS Fargate + ALB, T8 RDS Postgres sendiri di
ap-southeast-1 Single-AZ untuk pilot, R2-8 alat IaC = AWS CDK TypeScript (rekomendasi, dipakai di sini),
R2-9 lingkungan = **dev + staging** (permintaan user 11 Nov 2026). Production menyusul dengan stack yang sama.

## Arsitektur per lingkungan

```
Browser ──HTTPS──> CloudFront (*.cloudfront.net) ──┬── /*      ──> S3 (web Vue, privat, OAC)
                                                    └── /api/*  ──> ALB (hanya dari CloudFront)
                                                                     └──> ECS Fargate "api" (0,25 vCPU / 0,5 GB)
                                                                            └──> RDS Postgres 16 db.t4g.micro
                                                                                 (subnet terisolasi, terenkripsi)
Secrets Manager: ewi/<env>/db, ewi/<env>/app (EWI_JWT_SECRET), ewi/<env>/elitementor
```

| Stack | Isi |
|---|---|
| `Ewi-shared` | Repo ECR `ewi-api` (tag immutable, scan on push), OIDC GitHub + role `ewi-github-deploy` |
| `Ewi-dev` | VPC 10.40.0.0/16, RDS (backup 1 hari, boleh dihapus), ECS, ALB, S3, CloudFront |
| `Ewi-staging` | VPC 10.41.0.0/16, RDS (backup 7 hari, deletion protection, snapshot saat dihapus), termination protection |

Pilihan hemat yang disengaja untuk dev/staging:
- **Tanpa NAT Gateway.** Task Fargate di subnet publik dengan IP publik, security group hanya menerima
  dari ALB; ALB hanya menerima dari prefix list CloudFront. RDS di subnet tanpa internet.
  Production: pindahkan task ke subnet privat + NAT.
- **Tanpa domain dulu.** URL `https://<id>.cloudfront.net`. Domain + sertifikat ACM ditambahkan setelah
  R2-5 (domain email/brand) diputuskan.
- **Migrasi saat container start** (`RUN_MIGRATIONS=true`). Migrasi gagal = task tidak sehat =
  ECS circuit breaker rollback ke versi sebelumnya.
- DB dihubungkan dengan TLS terverifikasi (CA RDS dibundel di image, `ssl=true`).

## Estimasi biaya (on-demand ap-southeast-1, perkiraan, belum termasuk pajak)

| Komponen | Per lingkungan / bulan |
|---|---|
| ECS Fargate 0,25 vCPU + 0,5 GB, 1 task 24×7 | ± US$11 |
| Application Load Balancer | ± US$20 |
| RDS db.t4g.micro Single-AZ + 20 GB gp3 | ± US$22 |
| IPv4 publik (ALB 2 + task 1) | ± US$11 |
| Secrets Manager (3), CloudWatch Logs, S3, CloudFront, ECR | ± US$4 |
| **Total** | **± US$68 (± Rp 1,1 juta)** |

Dua lingkungan ± **US$135/bulan (± Rp 2,2 juta)**. Angka ini perkiraan dari harga publik; periksa
di AWS Pricing Calculator sebelum deploy. Belum termasuk pemakaian AI (Bedrock/Transcribe), SES,
dan transfer data besar. Penghematan opsional: matikan service dev di luar jam kerja (−± US$5) atau
hapus `Ewi-dev` saat tidak dipakai (data dev ikut terhapus).

## Setup sekali (butuh admin akun AWS)

1. Kredensial admin lokal (`aws sso login` atau profil), region `ap-southeast-1`.
2. Bootstrap CDK (sekali per akun/region):
   ```bash
   cd infra && npm ci
   npx cdk bootstrap aws://<ACCOUNT_ID>/ap-southeast-1
   ```
3. Stack bersama. Bila akun sudah punya OIDC provider GitHub (`token.actions.githubusercontent.com`),
   berikan ARN-nya agar tidak dibuat dua kali:
   ```bash
   npx cdk deploy Ewi-shared [-c githubOidcProviderArn=arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com]
   ```
4. Di GitHub repo: Settings > Secrets and variables > Actions > Variables, tambah `AWS_ACCOUNT_ID`.
   Settings > Environments: buat `dev` dan `staging`; di `staging` pasang required reviewer.
5. Deploy pertama dev: Actions > Deploy > Run workflow (environment `dev`). Workflow mem-build image,
   `cdk deploy Ewi-dev`, mengunggah web, lalu smoke test `/api/health`.
6. Setelah dev sehat: Run workflow environment `staging`, `image_tag` = SHA yang sama.
7. Isi kredensial EliteMentor di `ewi/<env>/elitementor` (ELITEMENTOR_CLIENT_ID/SECRET) setelah EM
   menerbitkannya (T2); `ELITEMENTOR_WEBHOOK_SECRET` sudah dibangkitkan, serahkan ke tim EM (T6).
   URL API/token EM diberikan lewat context: `-c dev:elitementorApiUrl=... -c dev:elitementorTokenUrl=...`
   (atau tambahkan ke `infra/cdk.json`). Restart service setelah mengubah secret.

## Alur deploy rutin

- Merge ke `main` → otomatis deploy ke **dev**.
- Promosi ke **staging**: Run workflow manual dengan SHA yang sudah lulus di dev (image yang sama).
- Workflow tidak jalan sama sekali sampai `AWS_ACCOUNT_ID` diisi, jadi aman di-merge lebih dulu.

## Operasional

- Log API: CloudWatch `/ewi/<env>/api`. Log Postgres: `/aws/rds/instance/.../postgresql`.
- Shell ke container: `aws ecs execute-command --cluster ewi-<env> --task <id> --container api --interactive --command sh`.
- Seed data dev: jalankan `npm run seed:dev` lewat execute-command (jangan di staging dengan data nyata).

## Belum termasuk (menunggu keputusan)

| Item | Menunggu |
|---|---|
| Domain + HTTPS ke ALB, alamat pengirim email SES | R2-5 |
| EventBridge Scheduler untuk job (rekonsiliasi T6, pengingat, retensi) | job belum ada di kode; L3 |
| Alarm CloudWatch + notifikasi, WAF | R2-10 (RPO/RTO, dukungan) |
| Kebijakan data nyata di staging | R2-4 (rekomendasi: data nyata hanya di production) |
| Enkripsi kolom/KMS per tenant | R2-3 (saat ini enkripsi storage bawaan) |
| Stack production (Multi-AZ, subnet privat + NAT) | sebelum komersial (T8) |
