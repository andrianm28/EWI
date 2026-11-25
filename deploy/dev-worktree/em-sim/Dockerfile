# EliteMentor (simulasi): Tool LTI 1.3 tiruan untuk dev/demo ELGOS. Bukan kode produk. Tanpa dependensi npm.
# --chmod: umask host (mis. 027) membuat berkas 640; tanpa ini USER node gagal membaca server.js (EACCES).
FROM node:24-alpine
WORKDIR /app
COPY --chmod=644 server.js content.js ./
USER node
ENV PORT=4300
EXPOSE 4300
HEALTHCHECK --interval=5s --timeout=3s --retries=10 CMD wget -qO- http://127.0.0.1:4300/health | grep -q ok
CMD ["node", "server.js"]
