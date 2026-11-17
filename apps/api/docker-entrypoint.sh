#!/bin/sh
# Entrypoint container API ELGOS.
# - Di AWS, kredensial DB datang terpisah dari Secrets Manager (DB_HOST, DB_USER, ...);
#   DATABASE_URL dirakit di sini dengan password ter-URL-encode dan TLS wajib.
# - RUN_MIGRATIONS=true menjalankan migrasi sebelum server start. Gagal migrasi = container
#   keluar = ECS circuit breaker mengembalikan versi sebelumnya.
set -e

# DB_PASSWORD boleh kosong bila POSTGRES_PASSWORD di-set (compose dev publik). DB_SSL=false hanya
# untuk Postgres lokal di jaringan compose; di AWS TLS selalu aktif.
if [ -z "$DATABASE_URL" ] && [ -n "$DB_HOST" ]; then
  DATABASE_URL=$(node -e '
    const e = process.env, enc = encodeURIComponent;
    const pass = e.DB_PASSWORD || e.POSTGRES_PASSWORD || "";
    const ssl = e.DB_SSL === "false" ? "" : "?ssl=true";
    process.stdout.write(`postgres://${enc(e.DB_USER)}:${enc(pass)}@${e.DB_HOST}:${e.DB_PORT || 5432}/${e.DB_NAME}${ssl}`);
  ')
  export DATABASE_URL
fi

cd /app/apps/api

# Perintah tambahan (mis. `docker-entrypoint.sh npm run seed:dev`) dijalankan dengan DATABASE_URL yang sama.
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "menjalankan migrasi..."
  npm run migrate --silent
fi

exec node src/server.js
