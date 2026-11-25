# mockup-render

Alat internal audit paritas ELGOS: merender mockup Pak Eji (`*.dc.html`) dengan `support.js` dan memotret tiap layar dan state ke `<outdir>` (PNG + teks halaman). Dipakai katalog gap di `docs/designs/paritas-mockup/`.

## Letak mockup

Mockup adalah berkas klien dan **tidak disimpan di repo** (repo publik; audit PR 39 butir 39-5). Salinan acuan final ada di folder proyek:

- `/mnt/project-files/mockup-pak-eji/Main.dc.html` (bawaan alat ini)
- `/mnt/project-files/mockup-pak-eji/DesignSystem.dc.html`

Path lain bisa diberikan lewat argumen atau variabel lingkungan:

```
node catalog.cjs --mockup /path/ke/Main.dc.html <outdir>
MOCKUP_FILE=/path/ke/Main.dc.html node catalog.cjs <outdir>
```

Alat menyalin mockup dan `support.js` ke folder sementara (mockup memuat `./support.js` relatif terhadap dirinya), lalu menghapusnya setelah selesai.

## Ketergantungan

Butuh `playwright` (versi sama dengan `apps/web`). Di checkout repo, paket dan browser Chromium yang sudah terpasang untuk e2e web ikut terpakai (Node mencari `node_modules` di root repo). Di luar itu: `npm install` di folder ini, lalu `npx playwright install chromium`. Folder ini bukan workspace npm dan tidak ikut CI.
