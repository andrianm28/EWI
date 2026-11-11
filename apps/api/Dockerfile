# Image API EWI untuk ECS Fargate. Build dari root repo (butuh package-lock workspace):
#   docker build -f apps/api/Dockerfile -t ewi-api .
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
# Dependensi workspace api saja (termasuk sequelize-cli untuk migrasi saat start).
RUN npm ci --workspace apps/api --include-workspace-root=false --no-audit --no-fund

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    NODE_EXTRA_CA_CERTS=/app/certs/rds-global-bundle.pem
# CA RDS agar koneksi TLS ke Postgres terverifikasi (ssl=true di DATABASE_URL).
ADD https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /app/certs/rds-global-bundle.pem
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY apps/api ./apps/api
COPY --chmod=755 apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN rm -rf apps/api/tests apps/api/Dockerfile \
 && chmod 755 /app/certs && chmod 644 /app/certs/rds-global-bundle.pem \
 && chown -R node:node /app
USER node
EXPOSE 4100
ENTRYPOINT ["docker-entrypoint.sh"]
