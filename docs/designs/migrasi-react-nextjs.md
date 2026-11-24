# Rencana migrasi frontend ELGOS: Vue 3 ke React (+ Next.js)

Status: **draf rencana v2, belum ada kode** (v1 direview tiga ikan mas egm, triase di `migrasi-react-nextjs-egm.md`).
Diminta user 24 Nov 2026: "plan refactor frontend vue ke react dan nextjs".
Cakupan: `apps/web` di repo ini (ELGOS). `elitery/lti-dashboard-vue` (EliteMentor) tidak termasuk.
Dasar kode yang diukur: `claude/project-thread-scbrmb` head `7df8dc4` (cabang integrasi ELGOS; sudah berisi PR #39 paritas mockup dan PR #47 data demo).

Tanda: `[⚠️ BELUM TERVERIFIKASI]` = asumsi yang harus dibuktikan di Fase 0 (spike). `[⏳ DITERIMA]` = risiko yang diterima beserta pengamannya.

---

## 1. Ringkasan

1. **Tidak ada pekerjaan frontend sebelum POC live 2 Des.** Demo 25 Nov, Go/No-Go 27 Nov, keputusan kesiapan modul Pak Eji 30 Nov dan live 2 Des memakai aplikasi Vue sekarang.
2. **Jawab dulu "kenapa migrasi" (D0).** Alasannya menentukan apakah Next.js memang perlu. Tanpa server rendering, Next.js di aplikasi ini hanya menjadi pembungkus SPA.
3. **Rekomendasi teknologi:** React + Vite + React Router (**N3**) bila tidak ada kewajiban Next.js. Bila Next.js wajib, pakai **N2: Next export statis dengan satu halaman catch-all** yang menjalankan router klien. Opsi Next "satu `page.tsx` per path" (N1) bertabrakan dengan rute uji e2e, path dinamis, redirect dan konfigurasi nginx (bagian 6).
4. **Rekomendasi pola: bangun paralel, potong sekali (Opsi C).** Aplikasi baru di `apps/web-react` dibangun berdampingan. Setiap paket layar dipindah 1:1 dan diuji dengan berkas e2e Playwright yang sama (401 test). Produksi tetap memakai image Vue sampai seluruh e2e hijau di build baru. Rollback = deploy ulang tag image web lama.
5. **Port 1:1, tanpa perbaikan yang diselipkan.** Perbaikan (fokus setelah navigasi, pemecahan bundle, dsb.) dicatat sebagai tiket sesudah potong-alih supaya beda e2e mudah didiagnosis.
6. **Perkiraan:** 25–35 hari kerja engineer. Waktu kalender sekitar 5 minggu (3 Des sampai minggu kedua Jan) karena libur akhir tahun, EliteMentor 2.0 (11 Des) dan kapasitas review Andrian. Selama itu ada perawatan ganda. Ada batas keras: bila F3 belum selesai 9 Jan, migrasi dibekukan dan dievaluasi ulang. `[⚠️ BELUM TERVERIFIKASI]` sampai F0 mengukur laju porting.

## 2. Kenapa migrasi? (D0, harus dijawab sebelum F0)

Permintaan user tidak menyebut alasannya.

| Kemungkinan alasan | Teknologi yang cocok |
| --- | --- |
| Ekosistem dan rekrutmen (React lebih umum, tim ProDev lebih paham React) | N3 cukup |
| Kode dari alat desain (Claude Design, v0) keluar sebagai React dan ingin dipakai langsung | N3 cukup |
| Standar teknologi Elitery mewajibkan Next.js | N2 |
| Butuh halaman publik atau SEO (landing, katalog) | Next dengan server Node (N4); saat ini tidak ada halaman publik selain login |
| Kinerja | Belum ada bukti masalah kinerja. Ukur dulu; migrasi bukan obat |

Argumen tandingan terkuat: aplikasi ini kecil, baru, sudah 1:1 dengan mockup dan punya 401 e2e. Migrasi memakan sekitar 5 minggu kalender kapasitas tepat ketika umpan balik pilot ELGOS paling banyak datang. Bila alasannya lemah, "tunda sampai pilot stabil" atau "tidak migrasi" layak dipilih.

## 3. Keadaan aplikasi sekarang (diukur 24 Nov)

| Aspek | Angka / fakta | Sumber |
| --- | --- | --- |
| Stack | Vue 3.5, vue-router 4, Pinia 3, Vite 7, Tailwind 4 (`@tailwindcss/vite`), TypeScript 5.9 | `apps/web/package.json` |
| Ukuran | 84 berkas `.vue` (9.759 baris), 58 berkas `.ts` (2.629 baris), 8 berkas CSS (454 baris) | `find src` |
| Kode tanpa Vue | sekitar 1.640 baris `.ts` sudah tidak mengimpor Vue/Pinia/vue-router (`src/api/*`, `ui/format.ts`, `ui/tones.ts`, `ui/icons.ts`, label). Bisa dipakai apa adanya oleh React | grep impor |
| Rute | 39 path dari 16 berkas `src/screens/<paket>/routes.ts` (dimuat `import.meta.glob`) + login, masuk, beranda | `src/router/index.ts` |
| Path berparameter (5) | `/iv/:id`, `/req/draf/:id`, `/m/tna/sessions/:id`, `/ina/verifikasi/:id?` (opsional), `/m/:key(dna)/sessions/:id` (batasan regex) | `screens/*/routes.ts` |
| Redirect (4) | `/m/cca`→`cc`, `/m/tna`→`tna`, `/m/ina`→`ina`, `/m/tna/sessions/:id`→`iv-session` (fungsi) | `b10/b5/b9/b6 routes.ts` |
| Kontrak rute | `meta` = `public`, `title`, `views`, `flag`, `flags`, `submodule`, `submoduleParam`, `entitlement`, `menuKey`, `roles`; nama rute = kunci menu; rute datar (dicek `assertUnique`) | `docs/designs/b0-fondasi-ui.md` §5.3 |
| Gerbang | `router.beforeEach` menunggu `loadAccess`/`setView` lalu `passesGates`, sehingga layar terlarang tidak pernah dirender | `router/index.ts:73` dst. |
| Rute uji e2e | build `VITE_UI_KIT=1` membaca `localStorage['elgos.test-routes']` saat runtime dan membuat rute `/uji/<nama>` yang bisa menggantikan rute asli bernama sama | `screens/ui-kit/test-routes.ts`, `router/index.ts:38-48` |
| Komponen bersama | 19 komponen `src/ui/Ui*.vue` + shell (`AppShell`, `AppDrawer`, `AppTopBar`) | `src/ui`, `src/components` |
| Sesi | store Pinia `stores/session.ts` (245 baris): token di `sessionStorage['ewi.token']`, timer kedaluwarsa (`setTimeout`), heartbeat 5 menit (`setInterval`), listener interaksi global, tukar token saat ganti peran; 401 diteruskan lewat `setUnauthorizedHandler` dengan kode seperti `SESSION_IDLE` | `stores/session.ts`, `api/client.ts` |
| Tema | terang/gelap via `localStorage` + `prefers-color-scheme`; token warna CSS di `style.css` | `shell/theme.ts` |
| E2E | 41 berkas (26 spec + `alur/` + `support/`), 8.782 baris, 401 test; API di-mock `page.route`; locator: `getByRole` 1.418, `getByTestId` 434, `getByText` 208, `getByLabel` 194, `locator()` 145; 5 snapshot visual (toleransi 0,02) | `apps/web/e2e` |
| Test unit web | tidak ada; CI job `web` hanya lint + build | `.github/workflows/ci.yml` |
| Deploy | Dockerfile: build Vite, lalu `nginx:1.27-alpine` dengan `deploy/dev-public/nginx.conf` (`try_files $uri $uri/ /index.html`, cache `/assets/` immutable, proxy `/api/` dan `/api/voice/` WebSocket); limit 1 CPU, 256 MB; publik lewat Caddy di etavm2 | `apps/web/Dockerfile`, `deploy/` |
| Tautan email | hanya `${APP_BASE_URL}/masuk#token=…` (fragmen, ditukar setelah pengguna menekan tombol) dan URL dasar | `apps/api/src/core/auth/email-link.js:44` |
| Paritas mockup | 1:1 dengan mockup Pak Eji, 8 penyimpangan sengaja tercatat; `tools/mockup-render` memotret 70 state | `docs/designs/paritas-mockup/` |

Pengamatan:

1. **E2E sebagian besar tidak bergantung pada Vue** (locator peran/label, mock di jaringan), asalkan `data-testid`, teks, peran ARIA dan path tetap sama. Ada pengecualian yang harus ditangani (bagian 7.3).
2. **Aplikasi ini SPA murni.** Semua data butuh token Bearer dari `sessionStorage`; server tidak bisa merender data pengguna.

## 4. Batasan

- Tidak ada perubahan di `apps/web` atau deploy sebelum live 2 Des, kecuali perbaikan bug POC.
- Server hanya etavm2 (dev/staging/prod). Tidak ada etavm1, Vercel atau hosting lain.
- Tidak ada yang masuk `dev` tanpa review Andrian. Thread agen tidak merge ke `dev`, `main`, `stg*`, `prod*`.
- Tampilan tetap 1:1 dengan mockup Pak Eji.
- Setiap PR mengikuti aturan 11–12 brief `brief-bangun-penuh-19nov.md` (alur egm + mattpocock-skills) dan modern-web-guidance, dengan bagian PR wajib.
- Hanya thread infra yang mengubah `deploy/`, `infra/` dan workflow deploy.
- Semua 39 path tetap, terutama `/masuk#token=…`.

## 5. Opsi pola migrasi

**Opsi A: tulis ulang sekaligus di cabang panjang.** Tanpa kode jembatan, tetapi cabang hidup berminggu-minggu sementara `scbrmb` terus menerima perbaikan pilot. Hasilnya konflik, porting ulang dan satu PR raksasa untuk Andrian.

**Opsi B: strangler per rute di nginx.** Dua aplikasi hidup di produksi, nginx membagi path. Minusnya: dua shell harus identik piksel selama transisi, konfigurasi nginx berubah tiap paket (wilayah thread infra), pengguna melihat muat ulang di batas modul, dan tautan yang dibuka di tab baru kehilangan sesi karena `sessionStorage` tidak disalin ke tab baru. Untuk aplikasi 10 ribu baris, ongkos jembatan ini mendekati ongkos porting.

**Opsi C (direkomendasikan): bangun paralel, potong sekali.** `apps/web-react` dibangun di repo yang sama. Paket dipindah lewat PR kecil. Produksi tidak berubah sampai potong-alih.
- Plus: risiko produksi nol selama pengerjaan, PR kecil, e2e menjadi kontrak, rollback cukup ganti tag image.
- Minus: perawatan ganda sekitar 5 minggu. Aturan: PR yang mengubah layar Vue yang sudah dipindah wajib membawa perubahan yang sama di `apps/web-react`; CI menjalankan e2e paket itu di kedua build. `[⏳ DITERIMA]` Pengaman: B5 (TNA, paling sering berubah selama pilot) dipindah terakhir, dan fitur layar dibekukan 3 hari kerja sebelum potong-alih.

## 6. Opsi teknologi dan hosting (etavm2 saja)

| Opsi | Cara jalan | Plus | Minus |
| --- | --- | --- | --- |
| **N3. React + Vite + React Router (rekomendasi bila Next tidak wajib)** | Sama dengan sekarang: `dist` disajikan nginx | Kontrak `routes.ts` + `import.meta.glob`, rute uji runtime, path dinamis, redirect dan `try_files … /index.html` tetap berlaku; Dockerfile dan nginx hampir tidak berubah | Bukan Next.js |
| **N2. Next export statis, satu catch-all `app/[[...slug]]/page.tsx` (rekomendasi bila Next wajib)** | `next build` dengan `output: 'export'` hanya menghasilkan `index.html`; halaman itu menjalankan React Router di klien | Memenuhi "pakai Next.js"; semua keuntungan N3 di atas tetap ada; tidak ada proses Node di produksi | Next hanya jadi pembungkus build; nginx butuh blok cache `/_next/static/` (konfigurasi baru oleh thread infra) |
| N1. Next App Router, satu `page.tsx` per path, export statis | HTML per path | Struktur "Next asli" | Rute uji e2e yang dibuat saat runtime tidak bisa ada (berkas rute statis); 5 path berparameter butuh placeholder `generateStaticParams` + rewrite nginx per prefiks, dan navigasi klien ke `/iv/abc` meminta payload RSC yang tidak ada lalu muat ulang penuh; regex `:key(dna)` dan redirect tidak didukung export; `try_files … /index.html` sekarang akan menghidrasi halaman yang salah; meta rute terbelah di `routes.ts` dan `page.tsx` |
| N4. Next dengan server Node (standalone) | Container Node baru di belakang Caddy | Semua fitur Next | Container baru dan perubahan deploy; SSR tetap tidak berguna selama token di `sessionStorage` |

N1 dan N4 hanya layak bila D0 menyebut kebutuhan server (halaman publik/SEO) atau sesi pindah ke cookie, dan itu proyek terpisah.

## 7. Arsitektur sasaran (N3; N2 sama di dalam halaman catch-all)

### 7.1 Gerbang dan menu sebagai fungsi murni (F1, di Vue)

Dengan istilah `codebase-design`: seam antara aturan akses dan framework. F1 hanya memindahkan **fungsi murni** ke `apps/web/src/core/` dengan test unit, tanpa mengubah perilaku:

- `passesGates(meta, params, access)`: dari `router/index.ts`; `access` = objek biasa `{ flags, products, roles, canOpen(submodule) }` diambil dari store.
- `menuFor(view, access, routes)`: dari `shell/menu.ts`.
- `homeFor(view, access)`: mengembalikan **nama rute**, seperti sekarang (`shell/views.ts`).
- Uji keunikan nama/path rute (`assertUnique`) sebagai fungsi yang dites.

Kode `src/api/*` dan `ui/format.ts` sudah bebas Vue; tidak dipindah. Store sesi **tidak** dipindah di F1, karena abstraksinya baru berguna saat adaptor React ada (F2).

Antarmuka persisnya ditulis di spek F1 `docs/designs/web-core.md` sebelum kode.

### 7.2 Store sesi di React (F2)

Port `stores/session.ts` menjadi modul biasa dengan `subscribe/getSnapshot`, dibaca lewat `useSyncExternalStore`. Syarat yang wajib dipenuhi dan dites:
- start/stop timer idempoten (React StrictMode memasang efek dua kali di dev);
- `getSnapshot` mengembalikan objek yang sama selama state tidak berubah;
- timer kedaluwarsa dan heartbeat dipindah dengan benar saat token ditukar (ganti peran);
- handler 401 (`setUnauthorizedHandler`) dan handler sesi habis didaftarkan sekali di akar aplikasi;
- gerbang menahan render layar sampai akses termuat (padanan `beforeEach` yang menunggu), sehingga layar terlarang tidak berkedip dan API-nya tidak terpanggil.

### 7.3 E2E sebagai kontrak

- `playwright.config.ts` mendapat `WEB_TARGET=vue|react` yang memilih perintah `webServer` (keduanya build statis + server statis di port 4174).
- Berkas spec tidak diubah. Pengecualian yang sudah diketahui dan harus dibuktikan di F0:
  - rute uji runtime (`shell.spec.ts:15`, `role-switch.spec.ts:16`): dipertahankan dengan membangun ulang `test-routes` untuk React Router (berjalan di N3/N2, tidak di N1);
  - `addInitScript` yang mengisi `elgos.view` sebelum store dibuat (`shell.spec.ts:215`, `dashboard.spec.ts:78`);
  - `page.clock` (`asisten.spec.ts:463`) terhadap timer React;
  - khusus N2: glob `page.route` tidak boleh tertangkap permintaan internal Next, dan live region `next-route-announcer` tidak boleh mengganggu `getByRole`.
- Bila sebuah test harus diubah, itu penyimpangan perilaku dan dicatat di PR beserta alasannya.
- 5 snapshot visual harus lulus dengan toleransi yang sama; `tools/mockup-render` membandingkan 70 state mockup sebelum potong-alih.

### 7.4 Pemetaan konsep

| Vue | React | Catatan |
| --- | --- | --- |
| `routes.ts` + `import.meta.glob` + `RouteMeta` | sama, `RouteObject` React Router dengan `handle` berisi meta yang sama | Satu sumber meta, kontrak B0 §5.3 tetap |
| `beforeEach` + `passesGates` | komponen gerbang di layout akar memakai `passesGates` dari F1 | Render ditahan sampai akses termuat |
| Pinia | modul store + `useSyncExternalStore` | Tanpa pustaka state baru |
| SFC `.vue`, `v-model` | `.tsx`, input terkendali | `data-testid`, `aria-*`, teks disalin persis |
| Tailwind 4 + token `style.css` + font Roboto | sama | Tidak diubah |
| `UiDialog` (`<dialog>` + `showModal` + `trapTab`) | `<dialog>` + `showModal` + `trapTab` | Dipertahankan apa adanya: `tna-gap.spec.ts:395-405` menguji fokus tetap di dialog |
| `VITE_UI_KIT=1` → `dist-e2e` | sama | Rute uji tidak boleh ada di build produksi |

## 8. Fase dan waktu

Patokan (WIB): demo 25 Nov, Go/No-Go 27 Nov, kesiapan modul 30 Nov, live 2 Des, EliteMentor 2.0 11 Des.

| Fase | Isi | Pelaksana | Kapan | Gerbang keluar |
| --- | --- | --- | --- | --- |
| **F-1 Bekukan** | Review rencana, keputusan D0–D5 | User | sampai 2 Des | Keputusan tercatat |
| **F0 Spike** (cabang buang, tidak masuk dev) | Bagian 8.1 | 1 thread agen | 3–5 Des | Semua cek 8.1 lulus atau cadangan dipilih; angka diisi di dokumen ini |
| **F1 Fungsi murni gerbang/menu** (di Vue) | Bagian 7.1, test unit dulu (`tdd`), Vitest + skrip `test` web + langkah `npm test -w apps/web` di job CI `web` | 1 thread agen, review Andrian | 8–9 Des (sebelum EliteMentor 2.0) | e2e Vue 401 hijau, test unit hijau, rollback = revert satu commit |
| **F2 Kerangka React** | `apps/web-react`: shell, 19 `Ui*`, tema, login, store sesi (7.2), gerbang, rute uji, UI kit, `WEB_TARGET`; Dockerfile kedua + konfigurasi nginx sendiri (thread infra) | 1–2 thread agen | 14–19 Des | `login`, `shell`, `gating`, `role-switch`, `ui-kit` spec hijau di React |
| **F3 Porting paket** | Satu PR per paket, 3–4 thread paralel, urutan: B12, B11, B3, B16, B15, B14, B13, B10, B9, B4, B6, B7, B8, B17, B5 | thread agen, review Andrian | 19 Des – 9 Jan | e2e paket hijau di kedua build; paritas `mockup-render` per paket |
| **Batas keras** | Bila F3 belum selesai 9 Jan: bekukan, laporkan, user memutuskan lanjut atau hentikan | User | 9 Jan | — |
| **F4 Potong-alih** | Bekukan fitur layar 3 hari kerja; 401 e2e + 5 snapshot hijau; uji manual 5 peran di dev etavm2; thread infra ganti image dev → staging → prod; image Vue terakhir disimpan | thread infra + Andrian | minggu kedua Jan | Andrian setuju |
| **F5 Bersih-bersih** | 2 minggu tanpa rollback: hapus Vue, `apps/web-react` jadi `apps/web`, perbarui `b0-fondasi-ui.md`, CLAUDE.md, CI; buka tiket perbaikan (bagian 9) | thread agen | akhir Jan | — |

### 8.1 F0 spike: cakupan dan cek lulus

Dijalankan dengan opsi hasil D2 (N3, atau N2 bila Next wajib), memakai salinan sementara `playwright.config.ts` di cabang spike dan server statis lokal (bukan konfigurasi `deploy/`).

Cakupan: shell, login + `/masuk#token`, B3 Dashboard, satu layar berparameter (`/iv/:id`), satu redirect (`/m/tna/sessions/:id`).

| Cek | Cara | Lulus bila |
| --- | --- | --- |
| E2E | `login.spec`, `shell.spec`, `dashboard.spec`, `iv.spec`, `role-switch.spec` tanpa diubah | semua hijau |
| Path berparameter dan redirect | Untuk kelima path + empat redirect: buka langsung, muat ulang, navigasi klien, back/forward, kembali dari login lewat `ke=` | id terbaca benar dan URL akhir sama dengan Vue di semua cara |
| `/masuk#token` | buka tautan, cek tidak ada penukaran token sebelum tombol ditekan | sama dengan perilaku Vue |
| Bundle | `vite build` / `next build`, ukur JS awal yang dimuat di `/login` dan `/dashboard`, gzip | tidak lebih dari 1,2× build Vue |
| Laju porting | jam kerja agen + jam review per 100 baris `.vue` untuk B3 dan B6 | dipakai memperbarui perkiraan 8.2 |
| Kinerja (tanpa ambang, data dasar) | Lighthouse desktop pada `/dashboard` dengan mock, Vue vs React | dicatat |

Bila cek path/redirect gagal di N2, pindah ke N3. Bila D0 mewajibkan Next dan N2 gagal, kembali ke user dengan temuan.

### 8.2 Perkiraan usaha `[⚠️ BELUM TERVERIFIKASI]`

| Bagian | Hari kerja engineer |
| --- | --- |
| F0 spike | 2–3 |
| F1 fungsi murni + test unit + CI | 1–2 |
| F2 kerangka, shell, 19 `Ui*`, sesi, rute uji | 5–7 |
| F3 16 paket (~8.000 baris `.vue`) | 15–20 |
| F4 potong-alih | 2–3 |
| **Total** | **25–35**, ditambah review Andrian sekitar 5–8 hari untuk ±12 ribu baris diff |

## 9. Modern web guidance

Diperiksa dengan `modern-web-guidance` (guide `dialog`, `accessibility`, `performance`, `forms`). Prinsip untuk migrasi: **port 1:1 dulu**, perbaikan setelah potong-alih.

Wajib dipertahankan saat porting: `<dialog>` bawaan dengan `showModal()`, landmark `header/nav/main` dan `UiSkipLink`, `<label for>` eksplisit dan `aria-invalid`/ringkasan galat seperti sekarang, `async/defer`-nya diurus bundler, tanpa ARIA tambahan.

Tiket perbaikan sesudah potong-alih (F5):
- Fokus setelah navigasi klien: aplikasi Vue sekarang tidak memindahkan fokus saat ganti rute. Tambahkan pemindahan fokus ke `<h1>`/`<main>` sebagai perubahan perilaku yang disengaja, dengan test baru.
- `UiDialog`: guide `dialog` menyarankan tidak memasang perangkap fokus manual ("DON'T add … a focus trap"). Evaluasi menghapus `trapTab` bersama perubahan test `tna-gap.spec.ts:395-405`.
- Pecah layar besar (B9, B14, `UiDataTable`) dengan lazy import bila ukur F0 menunjukkan bundle awal besar.

## 10. Risiko

| # | Risiko | Dampak | Pengaman |
| --- | --- | --- | --- |
| R1 | Migrasi mengganggu demo/live | Tinggi | Tidak ada pekerjaan sebelum 3 Des; F0 di cabang buang |
| R2 | Alasan migrasi lemah, kapasitas habis saat pilot | Sedang | D0 sebelum F0; batas keras 9 Jan |
| R3 | Beda piksel dari mockup | Sedang | 5 snapshot + `mockup-render` 70 state; Tailwind dan token CSS dipakai ulang |
| R4 | Perbaikan pilot lupa dipindah ke React | Sedang | Aturan PR + CI e2e paket di kedua build; B5 terakhir |
| R5 | Review Andrian jadi leher botol, bentrok EliteMentor 2.0 dan libur | Tinggi | F1 kecil sebelum 11 Des; F2 mulai 14 Des; PR per paket; batas keras |
| R6 | Perilaku sesi berubah (heartbeat, sesi diam, 401 → login dengan `ke=`) | Tinggi | Syarat 7.2 + `login.spec` dan e2e PK-16 (pengerasan login/sesi) wajib hijau |
| R7 | Rute uji, `addInitScript`, `page.clock` berperilaku beda di React | Sedang | Dibuktikan di F0 (8.1) |

## 11. Keputusan untuk user

| ID | Pertanyaan | Rekomendasi |
| --- | --- | --- |
| D0 | Alasan utama migrasi, dan apakah Next.js wajib | Konfirmasi dulu |
| D1 | Pola migrasi | C: bangun paralel, potong sekali |
| D2 | Teknologi | N3 React + Vite bila Next tidak wajib; N2 Next export catch-all bila wajib |
| D3 | Waktu | Spike 3–5 Des, F1 8–9 Des, F2–F3 14 Des – 9 Jan, potong-alih minggu kedua Jan |
| D4 | Perbaikan pilot selama migrasi dikerjakan di kedua aplikasi, dicek CI | Ya |
| D5 | Port 1:1, perbaikan a11y/kinerja setelah potong-alih | Ya |

## 12. Checklist (fase berikut, bukan PR ini)

- [ ] D0–D5 diputuskan user
- [ ] F0 spike sesuai 8.1; isi hasil dan perkiraan baru di dokumen ini
- [ ] F1: spek `docs/designs/web-core.md`, test unit dulu, skrip `test` web + langkah CI
- [ ] F2: `apps/web-react`, store sesi 7.2, `WEB_TARGET`, Dockerfile kedua + konfigurasi nginx (thread infra)
- [ ] F3: satu PR per paket sesuai urutan bagian 8
- [ ] F4: rencana potong-alih dan rollback bersama thread infra
- [ ] F5: hapus Vue, perbarui `b0-fondasi-ui.md`, CLAUDE.md, CI; buka tiket bagian 9

## Glosarium singkat

- **scbrmb**: cabang integrasi ELGOS `claude/project-thread-scbrmb`, basis semua PR paket; ke `dev` lewat PR #8.
- **B0–B17**: paket layar dari brief bangun penuh 19 Nov (mis. B3 Dashboard, B5 Training Needs, B12 Super Admin); spek masing-masing di `docs/designs/b*.md`.
- **Ikan mas (goldfish)**: reviewer subagent tanpa riwayat percakapan (alur egm).
- **Potong-alih**: mengganti image web produksi dari Vue ke React dalam satu deploy.
