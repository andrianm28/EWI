# Rotasi kunci dan secret ELGOS

N-4 (PK-07). Kunci akses IAM jangka panjang hanya ada karena etavm2 berada di luar AWS. Pengaman:
semua izin hanya berlaku dari IP etavm2 (`aws:SourceIp`), izin minimal per user, dan rotasi 90 hari.

| Secret | Tempat | Rotasi | Cara |
|---|---|---|---|
| Access key `elgos-prod-app` / `elgos-staging-app` (KMS, SES, Bedrock) | `/srv/elgos-<env>/.env` | 90 hari | di bawah |
| Access key `elgos-ops-etavm2` (unggah backup, SNS) | `/etc/elgos/ops.env` | 90 hari | di bawah |
| Access key `elgos-restore` | tidak disimpan | dibuat saat dibutuhkan, dihapus sesudahnya | runbook |
| `EWI_JWT_SECRET` | `.env` | 180 hari atau bila bocor | semua sesi keluar |
| `DB_PASSWORD` (`elgos_app`), `POSTGRES_PASSWORD` (pemilik) | `.env`, `db.env` | 180 hari atau bila bocor | di bawah |
| Token runner GitHub | `/opt/actions-runner-elgos` | bila bocor | daftar ulang runner |

Jadwal: tanggal pembuatan tiap kunci dicatat di [akses-etavm2.md](akses-etavm2.md); pengingat
kalender untuk penyetuju produksi 14 hari sebelum jatuh tempo.

## Rotasi access key IAM (tanpa henti layanan)

Dari laptop admin dengan profil akun ELGOS (bukan dari etavm2):
```
U=elgos-prod-app
aws iam list-access-keys --user-name $U                  # maksimal 2 kunci per user
aws iam create-access-key --user-name $U                 # catat AccessKeyId + SecretAccessKey
```
Di etavm2 (`sudo -iu elgos-deploy`): ganti `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` di
`/srv/elgos-prod/.env`, lalu `. /srv/elgos-prod/ops/common.sh; env_compose prod up -d --wait api`.
Cek `/api/ready` 200 dan log tanpa AccessDenied, lalu dari laptop admin:
```
aws iam update-access-key --user-name $U --access-key-id <lama> --status Inactive
# tunggu 24 jam tanpa error, lalu
aws iam delete-access-key --user-name $U --access-key-id <lama>
```
Untuk `elgos-ops-etavm2` sama, berkasnya `/etc/elgos/ops.env` (tidak perlu restart container).

## Rotasi password database

```
# role aplikasi: ganti DB_PASSWORD di .env, lalu deploy ulang SHA yang sama (deploy.sh memperbarui
# password role elgos_app) atau jalankan app-role.sql manual, lalu restart api.
# pemilik: ALTER ROLE elgos PASSWORD '<baru>' (psql di container db), lalu perbarui db.env.
```
