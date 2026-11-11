# Web EWI statis di nginx; /api diteruskan ke service API (dipakai lingkungan dev publik).
#   docker build -f apps/web/Dockerfile -t ewi-web .
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace apps/web --include-workspace-root=false --no-audit --no-fund
COPY apps/web ./apps/web
ENV VITE_API_BASE_URL=/api
RUN npm run build -w apps/web

FROM nginx:1.27-alpine
COPY deploy/dev-public/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
