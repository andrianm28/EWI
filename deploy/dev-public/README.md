# Dev EWI publik (di luar AWS)

Keputusan user 11 Nov 2026: AWS hanya untuk staging + prod; dev jalan di **etavm1** lewat docker compose,
publik di **https://dev-elgos.eliteacademy.id** (`dev-ewi.eliteacademy.id` redirect ke sini; Cloudflare DNS
proxied → nginx host + Let's Encrypt → `127.0.0.1:8080`). Tanpa Cloudflare Tunnel.

```
Internet ─HTTPS─> Cloudflare ─> nginx host etavm1 ─┬─ /mockup/ → /var/www/ewi-mockup (statis)
                                                   └─ /        → web (nginx: Vue, /api diteruskan) → api → Postgres
```

## Pipeline CI/CD (otomatis)

Alur branch:

| Branch | Lingkungan | Cara |
|---|---|---|
| `feat/*`, `claude/*` | – | PR → CI (`ci.yml`): lint, migrasi naik-turun-naik, jest, build, e2e, cdk synth |
| `dev` | dev (etavm1) | merge PR ke `dev` → `deploy-dev.yml` |
| `main` | staging AWS | merge `dev` → `main` → `deploy.yml` (aktif setelah `AWS_ACCOUNT_ID` diisi) |

`deploy-dev.yml` pada setiap push ke `dev`:

1. **Gate CI penuh** (memanggil `ci.yml`). Gagal = tidak ada deploy.
2. **Build image** api + web di runner GitHub, push ke GHCR `ghcr.io/andrianm28/ewi-{api,web}:<sha>`.
3. **Deploy** di runner self-hosted etavm1 (`deploy.sh`), user `ewi-deploy`:
   1. pull image baru (gagal di sini = belum ada yang berubah)
   2. backup schema `ewi` dengan `pg_dump` ke `/srv/ewi-dev/backups` (10 terakhir disimpan)
   3. migrasi dengan image baru (`npm run migrate`) sebelum container lama diganti
   4. ganti container api + web, tunggu healthcheck compose, cek `/api/health` lokal dan publik
      (URL publik = `PUBLIC_URL` di `/srv/ewi-dev/.env`; ganti domain cukup ubah nilai itu)
   5. seed data demo hanya bila tenant `demo` belum ada (atau input `seed` saat run manual)
   6. sinkron `mockups/poc-elgos/` ke `/var/www/ewi-mockup` bila commit membawa folder itu
   7. catat versi di `/srv/ewi-dev/current.env` (versi sebelumnya di `previous.env`)

   Gagal di langkah 3–5 = **rollback otomatis**: image sebelumnya dipasang lagi; bila migrasi sempat
   jalan, schema `ewi` direstore dari backup langkah 2. Job tetap merah agar kelihatan.

Rollback manual ke versi tertentu: Actions → **Deploy dev** → Run workflow (branch `dev`) → isi
`rollback_to` dengan SHA yang image-nya ada di GHCR (lihat `previous.env` atau riwayat run). CI dan build
dilewati. Catatan: rollback manual tidak menurunkan migrasi; bila perlu, restore backup dari
`/srv/ewi-dev/backups` (lihat di bawah).

Runner self-hosted hanya membuat koneksi keluar ke GitHub, jadi tidak ada port yang dibuka di VM. Repo
privat; job deploy hanya jalan dari push ke `dev` atau run manual, tidak dari PR.

## Setup sekali di etavm1

```bash
cd ~/ewi && git fetch && git checkout <branch berisi file ini>
RUNNER_TOKEN=<token> deploy/dev-public/setup-etavm1.sh
```

Token registrasi dari GitHub → repo → Settings → Actions → Runners → New self-hosted runner (berlaku 1 jam),
atau kosongkan bila `gh` di VM sudah login dengan akses admin repo. Script ini membuat user `ewi-deploy`
(grup docker), `/srv/ewi-dev` (menyalin `.env` dari deploy manual lama), membuat `/var/www/ewi-mockup`
bisa ditulis pipeline, dan memasang runner `etavm1-ewi-dev` (label `etavm1,ewi-dev`) sebagai service.

`/srv/ewi-dev/.env` wajib berisi `DEV_SEED_PASSWORD` (tanpa itu seed dilewati agar password demo tidak
berubah acak) dan, sejak enkripsi lokal (PR #2), `EWI_LOCAL_MASTER_KEY` (`openssl rand -hex 32`, unik untuk
dev, simpan cadangannya: hilang = data terenkripsi tidak terbaca), `APP_BASE_URL`, `MAIL_PROVIDER=log`.
Jangan set `NODE_ENV=production` di dev. Image yang butuh kunci itu ditolak sebelum migrasi bila kuncinya
belum ada, dan `scripts/encrypt-existing.js` (idempoten) dijalankan otomatis setelah seed.

## Operasi

```bash
sudo -u ewi-deploy -i
cd /opt/actions-runner-ewi/_work/EWI/EWI           # checkout terakhir pipeline
export EWI_ENV_FILE=/srv/ewi-dev/.env; set -a; . /srv/ewi-dev/current.env; set +a
DC="docker compose -f deploy/dev-public/docker-compose.yml --env-file $EWI_ENV_FILE"
$DC ps; $DC logs -f api
tail -50 /srv/ewi-dev/deploy.log

# restore backup manual
$DC stop api web
$DC exec -T db psql -U ewi -d ewi_dev -c 'DROP SCHEMA ewi CASCADE'
$DC exec -T db pg_restore -U ewi -d ewi_dev --no-owner < /srv/ewi-dev/backups/<file>.dump
$DC up -d --no-build api web
```

Jangan lagi menjalankan `docker compose up --build` dari `~/ewi` untuk dev: project compose-nya sama
(`ewi-dev`), sehingga akan menimpa versi pipeline. Untuk mencoba branch lain di dev, merge ke `dev` lewat PR.

## Jalan manual tanpa pipeline (mesin lain)

```bash
cd deploy/dev-public && cp .env.example .env   # isi POSTGRES_PASSWORD, EWI_JWT_SECRET, DEV_SEED_PASSWORD
docker compose up -d --build
docker compose exec api docker-entrypoint.sh npm run seed:dev
```

## Catatan

- URL ini publik: siapa pun yang tahu URL bisa membuka halaman login. Pakai data dummy saja; data karyawan
  nyata hanya di prod.
- `ewi-deploy` ada di grup docker (setara root di VM). Diterima untuk VM dev; prod tetap di AWS dengan
  OIDC (`deploy.yml`).
