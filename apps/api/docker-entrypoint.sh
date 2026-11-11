#!/bin/sh
# Entrypoint container API EWI.
# - Di AWS, kredensial DB datang terpisah dari Secrets Manager (DB_HOST, DB_USER, ...);
#   DATABASE_URL dirakit di sini dengan password ter-URL-encode dan TLS wajib.
# - RUN_MIGRATIONS=true menjalankan migrasi sebelum server start. Gagal migrasi = container
#   keluar = ECS circuit breaker mengembalikan versi sebelumnya.
set -e

if [ -z "$DATABASE_URL" ] && [ -n "$DB_HOST" ]; then
  DATABASE_URL=$(node -e '
    const e = process.env, enc = encodeURIComponent;
    process.stdout.write(`postgres://${enc(e.DB_USER)}:${enc(e.DB_PASSWORD)}@${e.DB_HOST}:${e.DB_PORT || 5432}/${e.DB_NAME}?ssl=true`);
  ')
  export DATABASE_URL
fi

cd /app/apps/api

if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "menjalankan migrasi..."
  npm run migrate --silent
fi

exec node src/server.js
