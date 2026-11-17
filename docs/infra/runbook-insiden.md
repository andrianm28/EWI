# Runbook insiden dan jadwal siaga ELGOS

PK-21, menutup P1-13 dan N-3. Asumsi: PO-9 opsi B (layanan jam kerja selama pilot) sampai dijawab.

## Jadwal siaga selama pilot (2 Des s.d. evaluasi 21 Des)

| Waktu | Siaga utama | Cadangan | Target respons |
|---|---|---|---|
| Senin–Jumat 08.00–18.00 WIB | Andrian | Pringgo | 30 menit |
| Di luar jam kerja, akhir pekan, libur | tidak ada siaga | – | hari kerja berikutnya 09.00 WIB |

Kebocoran data atau dugaan akses tidak sah ditangani kapan pun begitu diketahui (lihat bagian
"Keamanan"). Bila PO-9 dijawab 24/7, tabel ini harus diganti dengan rotasi siaga dan kompensasinya.

## Sumber peringatan

| Peringatan | Dari | Ke |
|---|---|---|
| `elgos-prod-down` / `elgos-staging-down` | Route 53 health check `/api/ready` dari luar, 3 kali gagal berturut (±90 detik) | SNS `elgos-alerts-uptime` → email |
| disk ≥ 80% (peringatan), ≥ 90% (kritis) | `elgos-monitor.timer` tiap 5 menit | SNS `elgos-alerts` → email, journal |
| container db/api/web tidak sehat, Caddy mati, aplikasi tidak siap | `elgos-monitor.timer` | sama |
| backup gagal, atau backup prod > 2 jam (jam kerja) / > 26 jam | `backup.sh`, `elgos-monitor.timer`, `OnFailure` unit | sama |
| job terjadwal gagal | `run-job.sh` | sama |
| biaya AWS ≥ 80% / 100% dari US$150 (aktual) atau 100% (prakiraan) | AWS Budgets | email |

Semua peringatan di etavm2 juga tercatat: `journalctl -t elgos-alert --since today`.

## Langkah pertama untuk setiap insiden

1. Akui di grup tim: "Saya pegang insiden <apa>, mulai <jam>".
2. Masuk etavm2: `ssh <admin>@etavm2`, lalu `sudo -iu elgos-deploy`.
3. Gambaran cepat:
   ```
   docker ps --format 'table {{.Names}}\t{{.Status}}'
   df -h / /var/lib/docker
   tail -50 /srv/elgos-prod/deploy.log
   journalctl -t elgos-alert --since -2h
   curl -s localhost:8180/api/ready
   ```
4. Catat linimasa (jam, temuan, tindakan) di catatan insiden.

## Skenario

### Aplikasi produksi mati / tidak siap
- `cd /srv/elgos-prod && docker compose -f docker-compose.yml --env-file .env logs --tail 200 api`
  (setel `ELGOS_ENV=prod ELGOS_ENV_FILE=/srv/elgos-prod/.env ELGOS_DB_ENV_FILE=/srv/elgos-prod/db.env`
  dan `. current.env` dulu, atau pakai `. ops/common.sh; env_compose prod logs --tail 200 api`).
- Baru saja deploy? Rollback: Actions > Deploy > Run workflow `prod` dengan SHA di `previous.env`.
- Container berhenti tanpa deploy: `env_compose prod up -d --wait`. Cek OOM: `dmesg | grep -i oom`.
- KMS/SES gagal (log menyebut AccessDenied): cek kunci IAM aplikasi (kedaluwarsa, salah IP sumber
  setelah IP etavm2 berubah) dan [rotasi-kunci.md](rotasi-kunci.md).

### Disk penuh
- `docker system df`, `du -sh /srv/elgos-*/backups/*`, `journalctl --disk-usage`.
- Aman dihapus: image lama (`docker image prune -a --filter until=168h`), backup lokal lebih tua
  dari retensi (salinan ada di S3), log journal (`journalctl --vacuum-size=500M`).
- Jangan hapus volume `elgos-prod_db-data`.

### Backup gagal
- `journalctl -u 'elgos-backup@prod-*' --since today`.
- Penyebab umum: kredensial `/etc/elgos/ops.env` salah/kedaluwarsa, IP berubah, disk penuh.
- Jalankan ulang manual: `ELGOS_ENV=prod /srv/elgos-prod/ops/backup.sh manual`.

### Server etavm2 hilang/rusak (pemulihan bencana)
1. Siapkan VPS baru, jalankan `setup-etavm2.sh`, pulihkan `.env`/`db.env` dari brankas password tim.
2. Deploy SHA terakhir (`ELGOS_SHA`) ke prod lewat workflow (DB kosong).
3. Buat access key sementara `elgos-restore` (lihat bawah), lalu:
   `KONFIRMASI=prod /srv/elgos-prod/ops/restore.sh pulihkan prod s3://<bucket>/prod/hourly/<terbaru>.dump`
4. Arahkan DNS ke IP baru, perbarui `ETAVM2_IP` di variabel repo dan apply Terraform (IP sumber IAM).
5. Hapus access key `elgos-restore`. Target: pulih ≤ 4 jam (RTO), kehilangan data ≤ 1 jam (PD-20 A).

### Keamanan (dugaan kebocoran, akses tidak sah)
- Segera: nonaktifkan kunci yang dicurigai (`aws iam update-access-key --status Inactive`), aktifkan
  kill switch flag tenant (R2-1) bila perlu, simpan log (`deploy.log`, journal, log container).
- Kabari Andrian dan penanggung jawab DPA/DPIA (PO-7). Kewajiban pemberitahuan UU PDP: 3×24 jam.

## Kredensial pemulihan sementara

```
aws iam create-access-key --user-name elgos-restore     # dari laptop admin, profil akun ELGOS
# pakai sebagai AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY saat menjalankan restore.sh, lalu:
aws iam delete-access-key --user-name elgos-restore --access-key-id <id>
```

## Uji pemulihan berkala

Sebelum data nyata diimpor (24 Nov) dan setiap bulan selama pilot:
```
ELGOS_ENV=prod /srv/elgos-prod/ops/backup.sh manual
AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=… /srv/elgos-prod/ops/restore.sh uji s3://<bucket>/prod/manual/<berkas>.dump
```
Hasil (lama, jumlah baris per tabel) tercatat di `/srv/elgos-restore-uji.log`. Pemulihan uji
memakai DB sementara tanpa jaringan dan langsung dihapus, sehingga data produksi tidak masuk staging.
