# Dev ELGOS publik (di luar AWS)

Keputusan user 11 Nov 2026: AWS hanya untuk staging + prod; dev jalan di **etavm1** lewat docker compose
dan dibuka ke publik dengan **Cloudflare Tunnel** (tanpa membuka port di VM).

```
Internet ──HTTPS──> Cloudflare Tunnel ──> web (nginx: Vue statis, /api diteruskan) ──> api ──> Postgres
```

## Menjalankan

```bash
git clone https://github.com/andrianm28/EWI.git && cd EWI/deploy/dev-public
cp .env.example .env
# isi POSTGRES_PASSWORD dan EWI_JWT_SECRET:  openssl rand -base64 48 | tr -d '/+='
docker compose up -d --build
docker compose logs tunnel | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com'   # URL publik
docker compose exec api docker-entrypoint.sh npm run seed:dev          # tenant demo + user HR/learner
```

Update ke commit terbaru: `git pull && docker compose up -d --build` (migrasi jalan otomatis saat API start).

## Catatan

- Quick tunnel memberi URL `*.trycloudflare.com` acak yang **berubah setiap tunnel restart**, tanpa akun
  Cloudflare. Untuk URL tetap: buat named tunnel di dashboard Cloudflare (public hostname → `http://web:80`),
  lalu di `.env` set `COMPOSE_PROFILES=named` dan `CLOUDFLARE_TUNNEL_TOKEN`.
- URL ini publik: siapa pun yang tahu URL bisa membuka halaman login. Pakai data dummy saja; data karyawan
  nyata hanya di prod. Ganti `DEV_SEED_PASSWORD` dari default acak bila dibagikan.
- Web hanya listen di `127.0.0.1:8080` di VM; tidak ada port yang dibuka ke internet.
