# Daftar pemegang akses ELGOS

N-6 (PK-11). Diperbarui setiap ada akses yang diberikan atau dicabut. Tidak memuat secret: hanya
siapa, apa, sejak kapan, dan kapan ditinjau. Tinjau ulang tiap bulan dan saat orang keluar
(Nabilah selesai 4 Des 2026).

## Server etavm2 (staging + produksi)

| Orang | Akun | Jenis akses | Sejak | Alasan | Tinjau |
|---|---|---|---|---|---|
| Andrian | _diisi saat setup_ | SSH kunci, sudo | _tgl_ | admin, penyetuju produksi | bulanan |
| Pringgo | _belum_ | SSH kunci, sudo | – | cadangan siaga (bila disetujui) | bulanan |
| GitHub Actions runner | `elgos-deploy` (sistem) | grup docker, tanpa sudo, tanpa login | _tgl_ | deploy | – |
| Pengembang / thread dev | `elgos-dev` (kunci SSH per orang) | Docker rootless sendiri, tanpa grup docker, tanpa sudo, tanpa akses `/srv/elgos-*` | _tgl_ | dev per worktree | bulanan |

Login password dan login root dimatikan oleh `setup-etavm2.sh`. Kunci SSH baru ditambahkan ke
`~/.ssh/authorized_keys` user masing-masing, bukan dibagi.

## Akun AWS ELGOS

| Identitas | Jenis | Izin | Kunci dibuat | Rotasi berikutnya |
|---|---|---|---|---|
| Andrian (SSO) | permission set admin | admin akun ELGOS | – | – |
| `elgos-terraform-plan` | role OIDC GitHub (PR) | baca saja + lock state | – | – |
| `elgos-terraform-apply` | role OIDC GitHub (environment `infra`) | sumber daya elgos-* | – | – |
| `elgos-prod-app` | IAM user, IP etavm2 | KMS tenant prod, SES, Bedrock | _tgl_ | +90 hari |
| `elgos-staging-app` | IAM user, IP etavm2 | KMS tenant staging, SES, Bedrock | _tgl_ | +90 hari |
| `elgos-ops-etavm2` | IAM user, IP etavm2 | PutObject backup, SNS publish, baca biaya (Cost Explorer) | _tgl_ | +90 hari |
| `elgos-restore` | IAM user, tanpa kunci tetap | baca backup | dibuat per pemulihan | dihapus sesudahnya |

## GitHub

| Orang | Peran repo | Penyetuju environment |
|---|---|---|
| Andrian | admin | prod, infra |
| Zava | write (reviewer utama, PD-5) | – |
| Pringgo | write (reviewer inti) | prod (cadangan) |

## Lain-lain

| Sistem | Pemegang |
|---|---|
| Cloudflare DNS `eliteacademy.id` | _diisi_ |
| Brankas password tim (salinan `.env`, `db.env`) | _diisi_ |
| Lokasi pusat data dan penyedia etavm2 (N-7, untuk DPIA) | _diisi_ |
