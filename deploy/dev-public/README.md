# Dev ELGOS publik lama — DIHENTIKAN

> **23 Nov 2026:** dev publik lama tidak dipakai lagi. Aturan project: dev, staging, dan prod hanya di VPS
> etavm2 (spek `docs/designs/audit-23nov-etavm1.md`). Job deploy di `deploy-dev.yml` beserta skrip setup dan
> deploy-nya sudah dihapus. Langkah setup dan operasi untuk server lama dihapus dari berkas ini (review 24 Nov),
> supaya tidak ada yang menjalankannya lagi.

Yang masih dipakai dari folder ini:

| Berkas | Dipakai oleh |
| --- | --- |
| `nginx.conf` | `apps/web/Dockerfile` (konfigurasi nginx di image web) |
| `docker-compose.yml` | jalan lokal di mesin pengembang (lihat di bawah) |

Dev sekarang: satu lingkungan per git worktree di etavm2 (`deploy/dev-worktree/`). Staging dan prod:
`deploy/vps/` dan `docs/infra/vps-etavm2.md`.

## Jalan lokal (mesin pengembang)

```bash
cd deploy/dev-public && cp .env.example .env   # isi POSTGRES_PASSWORD, EWI_JWT_SECRET, DEV_SEED_PASSWORD
docker compose up -d --build
docker compose exec api docker-entrypoint.sh npm run seed:dev
```

Pakai data dummy saja. Data karyawan nyata hanya di prod.
