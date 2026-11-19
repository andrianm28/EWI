# B0 · Fondasi UI ELGOS

Status: spek setelah review egm dan implementasi, 19 Nov 2026. Paket B0 dari rencana bangun penuh mockup Pak Eji (5 modul, live 2 Des). Hanya menyentuh `apps/web`. Tidak ada perubahan API, migrasi, atau flag baru.

Sumber acuan:

- Mockup Pak Eji (final, 19 Nov): `Main.dc.html` dan `DesignSystem.dc.html` (salinan di folder proyek `mockup-pak-eji/`; aslinya https://claude.ai/artifact/3pRkbt7pJexZqgnFsUGJud). CSS ada di `<style>`, menu per peran di fungsi `N` dalam `<script type="text/x-dc">`.
- Brief bangun penuh 19 Nov, bagian T1 dan tabel default K1–K4.
- `CLAUDE.md` repo ini.

## 1. Tujuan

Semua paket layar (B1–B17) dikerjakan paralel oleh thread lain dan menumpuk di atas B0. B0 menyediakan tiga hal supaya layar-layar itu tampil seragam dan tidak saling bertabrakan:

1. **Token desain** mockup Pak Eji (Material 3, navy) sebagai variabel CSS, termasuk mode gelap.
2. **Komponen UI** bersama di `apps/web/src/ui/`.
3. **Shell aplikasi**: navigation drawer accordion, top app bar dengan ganti tampilan, dan router yang menyusun menu per peran.

Halaman yang sudah ada (Beranda, DNA, TNA, wawancara, submodul) pindah ke shell baru **tanpa perubahan perilaku**: e2e lama (`gating.spec.ts`, `poc-dna-tna.spec.ts`) harus lulus tanpa diubah.

Bukan cakupan B0: layar login (B1), definisi 5 peran di API (B2), dashboard (B3), dan isi layar modul lain.

## 2. Layar mockup yang dicakup

- Kerangka aplikasi: blok `<div class="app">` (drawer, `header.top`, `main.content`, tautan "Lewati ke konten utama").
- Papan `DesignSystem.dc.html`: token warna dan daftar pola.
- Pola komponen yang dipakai berulang di `Main.dc.html`: `.btn`, `.chip`, `.tabs`, `.row`/`.tblwrap`, `.state`, `.steps`, `.note`, `.meta`, `.kpi`, `.bar`, `.seg`, `.card`.

## 3. Token desain

Didefinisikan di `apps/web/src/style.css` sebagai variabel CSS pada `:root`, lalu dipetakan ke Tailwind v4 lewat `@theme inline` supaya bisa dipakai sebagai utilitas (`bg-primary`, `text-on-surface-variant`, dst.).

| Token | Terang (mockup) | Gelap (turunan B0) |
| --- | --- | --- |
| `--el-primary` | #0B3A6E | #A9C7FF |
| `--el-on-primary` | #FFFFFF | #00305F |
| `--el-primary-container` | #D6E3FF | #0B3A6E |
| `--el-on-primary-container` | #001B3E | #D6E3FF |
| `--el-secondary-container` | #DCE3F0 | #3A4352 |
| `--el-on-secondary-container` | #141C27 | #DCE3F0 |
| `--el-tertiary` | #00606E | #82D3E0 |
| `--el-tertiary-container` | #BDEBF5 | #004E5A |
| `--el-on-tertiary-container` | #001F26 | #BDEBF5 |
| `--el-surface` (latar) | #F8F9FC | #111418 |
| `--el-surface-1` | #F2F4F9 | #191C20 |
| `--el-surface-2` | #ECEFF5 | #1D2024 |
| `--el-surface-3` | #E3E7EF | #272A2F |
| `--el-surface-card` | #FFFFFF | #1D2024 |
| `--el-on-surface` | #191C20 | #E1E2E8 |
| `--el-on-surface-variant` | #43474E | #C3C6CF |
| `--el-outline` | #73777F | #8D9199 |
| `--el-outline-variant` | #C3C6CF | #43474E |
| `--el-success` / container | #1B6E3F / #C6F0D3 | #8BD8A5 / #0B5229 |
| `--el-warning` / container | #7A4F00 / #FFE2A8 | #F3BF5B / #5C3B00 |
| `--el-critical` / container | #B3261E / #F9DEDC | #FFB4AB / #8C1D18 |

- Mode gelap tidak ada di mockup. Nilainya diturunkan dengan pola peran warna Material 3. `[⚠️ BELUM TERVERIFIKASI]` belum dilihat Pak Eji atau Desty; bila ditolak, cukup ubah nilai di satu blok CSS.
- Pemilihan tema: atribut `data-theme="light|dark"` di `<html>`. Tanpa pilihan pengguna, mengikuti `prefers-color-scheme`. Pilihan pengguna (tombol di top bar) disimpan di `localStorage` kunci `elgos.theme`; akses storage dibungkus try/catch.
- Tipografi: Roboto 400/500/700 dan Roboto Mono 400/500, **di-host sendiri** lewat paket `@fontsource/*` (subset latin). Mockup memuat dari Google Fonts; B0 tidak, supaya aplikasi tidak memanggil pihak ketiga saat dibuka pengguna klien.
- Ikon: Material Symbols Outlined sebagai path SVG inline di `src/ui/icons.ts` (54 ikon yang dipakai mockup dan komponen). Tanpa font ikon.
- Ukuran dasar mengikuti mockup: teks 14px/20px, h1 28/36 weight 400, h2 20/28 weight 500, h3 16/24 weight 500, radius kartu 16px, tombol 20px, chip 8px.
- Halaman lama memakai utilitas Tailwind `slate-*`, `white`, `blue-700`, `red-600`, `emerald-*`. Supaya tetap terbaca di mode gelap tanpa menulis ulang halamannya, variabel warna Tailwind itu dipetakan ulang di blok `[data-theme=dark]`. `[⏳ DITERIMA]` kontras halaman lama di mode gelap tidak diuji per elemen; hanya dicek dengan satu snapshot visual. Halaman itu akan ditulis ulang oleh B4/B5.

## 4. Komponen UI (`apps/web/src/ui/`)

Semua komponen: Vue 3 `<script setup lang="ts">`, tanpa pustaka komponen pihak ketiga, hanya memakai token. Diekspor dari `src/ui/index.ts`. Kelas CSS berprefiks `el-`.

| Komponen | Pola asal | Props utama | Catatan aksesibilitas |
| --- | --- | --- | --- |
| `UiIcon` | Material Symbols | `name`, `size` (default 22) | `aria-hidden="true"`; ikon tidak pernah menjadi satu-satunya pembawa makna |
| `UiButton` | M3 filled/tonal | `variant` = `filled`\|`tonal`\|`outlined`\|`text`, `size` = `md`\|`sm`, `icon?`, `to?` (jadi `RouterLink`), `disabled`, `type` | `<button>` asli; fokus terlihat (outline 2px) |
| `UiChip` | M3 chip | `tone` = `training`\|`improvement`\|`review`\|`success`\|`critical`\|`neutral`, `icon?` | teks selalu ada |
| `UiStatus` | Carbon label status | `tone` = `success`\|`warning`\|`critical`\|`info`\|`neutral`, slot teks | ikon + teks, bukan warna saja; ikon default per tone |
| `UiTabs` | M3 tab | `tabs: {key,label}[]`, `v-model` | `role="tablist"`, panah kiri/kanan, Home/End; panel milik pemakai dengan `role="tabpanel"` |
| `UiSegmented` | M3 segmented | `options: {key,label}[]`, `v-model`, `label` | `role="group"` + `aria-pressed` |
| `UiDataTable` | Carbon data table | `columns: {key,label,sortable?,align?,mono?}[]`, `rows`, `rowKey`, `caption`, `emptyText`, `v-model:sort`; slot `toolbar`, slot sel `#cell-<key>` | `<table>` asli dengan `<caption>`; header sortable berupa tombol dengan `aria-sort`; pembungkus bisa digulir horizontal |
| `UiStepper` | Stepper mockup | `steps: {key,label}[]`, `current` | `<ol>`, langkah aktif `aria-current="step"`, langkah selesai diberi teks tersembunyi "selesai" |
| `UiErrorSummary` | GOV.UK error summary | `title` (default "Ada masalah"), `errors: {message, fieldId?}[]` | `role="alert"`, `tabindex="-1"`, menerima fokus saat muncul; tiap galat menjadi tautan ke `#fieldId` |
| `UiSkipLink` | GOV.UK skip link | `target` (default `#isi`) | tersembunyi sampai difokus |
| `UiAuditLine` | Carbon metadata | slot atau `items: string[]` digabung " · " | monospasi 11px |
| `UiKpiCard` | `.kpi` | `label`, `value`, `note?` | label huruf besar kecil, nilai 32px |
| `UiCard` | `.card` | `tonal?`, `as?` | |
| `UiNote` | `.note` | `tone` = `info`\|`warning`\|`critical`\|`success` | `role="note"`; untuk galat pakai `UiErrorSummary` |
| `UiProgressBar` | `.bar` | `value` 0–100, `tone?`, `label` | `role="progressbar"` + `aria-valuenow` |
| `UiField` | `.lbl` + `.inp` | `id`, `label`, `hint?`, `error?`; slot menerima `{ attrs }` untuk di-`v-bind` ke input | label tertaut `for`; petunjuk dan galat tertaut `aria-describedby`; `aria-invalid` saat galat |

Formulir: input, select, dan textarea memakai kelas `el-input`; kotak centang memakai `el-check`; label mandiri memakai `el-label`. Kelas bantu lain: `el-h1`–`el-h3`, `el-muted`, `el-mono`, `el-grid` + `el-grid-2/3/4`, `el-pill`, `el-sr-only`. Saklar (`.sw2` mockup) dan dialog belum disediakan; paket pertama yang membutuhkannya menambahkannya ke `src/ui/` (ditunda, lihat bagian 11).

`v-model:sort` bertipe `{ key, dir: 'asc' | 'desc' } | null`; klik header berputar naik → turun → tanpa urutan. Nilai kosong selalu di bawah. Pengurutan `UiDataTable` dilakukan di sisi klien atas `rows` yang diberikan (angka dibanding sebagai angka, lainnya dengan `localeCompare('id')`). Data berhalaman dari server bukan cakupan B0; pemakai yang butuh itu mematikan `sortable` dan mengurutkan sendiri.

**Halaman referensi komponen** `/ui-kit` menampilkan semua komponen dengan data contoh. Halaman ini hanya ada bila build dijalankan dengan `VITE_UI_KIT=1` (dipakai e2e dan pengembangan); build produksi tidak memuatnya. Mockup menyebut design system "bukan fitur atau menu aplikasi".

## 5. Shell dan router

### 5.1 Tampilan (peran di UI)

Mockup punya lima tampilan. Kuncinya dipakai di seluruh web app:

| Kunci tampilan | Label | Peran API saat ini yang dipetakan |
| --- | --- | --- |
| `hr` | HR / L&D | `hr_admin` |
| `atasan` | Atasan | `supervisor`, `pimpinan`, `role_leader` |
| `karyawan` | Karyawan | `learner`, `sme` |
| `admin` | Admin Tenant | `tenant_admin` (belum ada di API) |
| `super` | Super Admin | `eta_admin` |

- Aturan K2 (default brief): HR, Atasan, dan Admin Tenant juga karyawan; Admin Tenant juga HR. Jadi tampilan yang tersedia: `hr` → [hr, karyawan]; `atasan` → [atasan, karyawan]; `admin` → [admin, hr, karyawan]; `karyawan` → [karyawan]; `super` → [super]. Di pemilih tampilan, tampilan karyawan milik akun multi-peran berlabel "Karyawan (saya)" seperti di mockup.
- `[⚠️ BELUM TERVERIFIKASI]` Kontrak dengan B2: bila `/auth/login` atau `/auth/me` mengembalikan `user.roles: string[]`, tampilan dihitung dari gabungan semua peran itu. Bila hanya `user.role`, dipakai satu peran. Peran yang tidak dikenal dipetakan ke `karyawan` (hak paling sempit).
- **Ganti tampilan sebelum B2 dan B8 selesai.** Tampilan tambahan hanya ditawarkan bila rute berandanya sudah terdaftar (untuk `karyawan`: rute `my`, Hasil saya, B8). Alasannya: halaman lama menentukan isi dari `user.role` dan API memberi data sesuai peran asli, jadi "tampilan karyawan" di atas halaman lama akan tetap memperlihatkan data HR. Begitu B8 memasang `my`, tombol ganti tampilan muncul sendiri.
- Tampilan aktif disimpan di store sesi (`activeView`) dan `sessionStorage` kunci `ewi.view`. Saat nilainya tidak termasuk tampilan yang tersedia, dipakai tampilan pertama (pilihan tersimpan tidak ditimpa).
- Bila profil belum termuat (`/auth/me` gagal setelah muat ulang), tampilan jatuh ke `karyawan` (menu paling sempit) dan pil identitas tidak tampil. Ini sama dengan perilaku halaman lama yang memperlakukan peran kosong sebagai bukan HR.
- `eta_admin` dipetakan ke `super`. Di halaman lama ia setara HR, jadi sampai layar Tenant (B12) terpasang ia tetap mendapat butir peralihan Developmental Needs dan Training Needs.
- Ganti tampilan **hanya mengubah menu dan rute yang boleh dibuka di UI**. Otorisasi data tetap di API (`visibleEmployeeScope()`, peran di JWT). Shell tidak pernah menjadi satu-satunya penjaga data.

### 5.2 Daftar menu

`src/shell/menu.ts` berisi daftar menu statis hasil terjemahan fungsi `N` mockup. Tiap butir: `key` (kunci layar mockup, sekaligus **nama rute**), `label`, `icon`, `views`, `group?`, `flag?`, `submodule?`, `transitional?`.

| Tampilan | Butir (urutan mockup) | Kunci | Syarat tampil |
| --- | --- | --- | --- |
| hr, atasan | Dashboard utama (hr) / Dashboard tim (atasan) | `dash` | rute ada |
| hr, atasan | grup Learning Needs Analysis | grup `lna` | punya anak yang tampil |
| hr | Core Competencies | `cc` | submodul `cca` |
| atasan | Wawancara AI | `aiv` | submodul `cca` |
| hr, atasan | Developmental Needs | `dna` | submodul `dna` |
| hr, atasan | Training Needs | `tna` | submodul `tna` |
| hr, atasan | Improvement Needs | `ina` | submodul `ina` |
| hr | grup Learning Intervention: Library, Program & Course, Permintaan & pengembangan | `lib`, `prog`, `req` | flag `module.li` |
| hr | Learning Delivery | `ld` | flag `module.ld` |
| hr, atasan | Learning Impact Measurement | `lim` | flag `module.lim` |
| hr, atasan | Career & Promotion | `cp` | flag `promotion.recommendation` |
| karyawan | Hasil saya | `my` | rute ada |
| karyawan | Wawancara visi & nilai | `aiv` | submodul `cca` |
| karyawan | Wawancara akar masalah | `iv` | submodul `tna` |
| karyawan | Rencana belajar | `li` | rute ada |
| admin | Pengguna & peran, Jabatan & kamus kompetensi, Impor data & integrasi | `users`, `jobs`, `cfg` | rute ada |
| super | Tenant, Konfigurasi platform | `tenants`, `platform` | rute ada |

Butir peralihan (tidak ada di mockup, hilang sendiri begitu penggantinya terpasang):

| Tampilan | Butir | Rute | Hilang saat |
| --- | --- | --- | --- |
| semua | Beranda | `home` | rute beranda tampilan terdaftar: `dash` (hr, atasan), `my` (karyawan), `users` (admin), `tenants` (super) |
| karyawan, super | Developmental Needs, Training Needs | `dna`, `tna` | rute beranda tampilan terdaftar (`my`, `tenants`) |

"Syarat submodul" berarti `session.canOpen(key)`: tenant berhak atas submodul itu **dan** flag `module.<key>` menyala. Empat submodul LNA (`cca`, `dna`, `tna`, `ina`) memakai syarat ini. Modul 2–5 bukan submodul berlisensi, jadi hanya memakai flag.

Aturan tampil satu butir, dievaluasi berurutan:

1. tampilan aktif termasuk `views` butir;
2. **rute bernama `key` sudah terdaftar di router**. Layar yang belum dibangun tidak punya rute, jadi tidak muncul di menu. Tidak ada halaman kosong "segera hadir" di produksi;
3. bila ada `flag`, `access.flags[flag] === true`; bila ada `submodule`, `session.canOpen(submodule)`;
4. bila `transitional`, rute beranda tampilan aktif belum terdaftar.

Grup accordion (`lna`, `li`) tampil bila minimal satu anaknya tampil. Keadaan buka-tutup disimpan di state tingkat modul (`openGroups` di `menu.ts`, default terbuka) supaya bertahan saat pindah halaman; tidak di storage. Klik grup hanya membuka atau menutup. Di mockup, klik grup Learning Intervention juga pindah ke Library; itu **ditolak** karena tombol yang sekaligus membuka dan menavigasi membingungkan pembaca layar (`aria-expanded` pada tautan). Butir aktif: rute sekarang atau `meta.menuKey` rute sekarang (untuk layar anak seperti detail gap yang menyalakan butir `tna`).

Nama flag `module.li`, `module.ld`, `module.lim` belum ada di `src/core/flags`; dibuat oleh paket B13, B14, B15. Selama flag belum ada, `access.flags[...]` tidak `true` dan butirnya tidak tampil. Itu perilaku yang diinginkan.

### 5.3 Kontrak rute untuk paket lain

Supaya thread-thread paralel tidak mengedit berkas router yang sama:

- Tiap paket menambah berkas `apps/web/src/screens/<nama-paket>/routes.ts` yang `export default` berupa `RouteRecordRaw[]`. `<nama-paket>` = kode paket dan nama layar, huruf kecil, misalnya `b9-ina`, `b3-dashboard`.
- `src/router/index.ts` mengumpulkan semua berkas itu dengan `import.meta.glob('@/screens/*/routes.ts', { eager: true })`. Komponen layar tetap dimuat malas (`() => import(...)`).
- Nama rute layar utama = kunci menu di tabel 5.2 (misalnya `name: 'ina'`). Dengan itu butir menu muncul tanpa mengedit `menu.ts`.
- `meta` yang dikenali penjaga rute:
  - `public?: boolean` tanpa login;
  - `title?: string` judul di top bar (default: label butir menu);
  - `views?: ViewKey[]` tampilan yang boleh membuka. Bila tampilan aktif tidak termasuk tetapi pengguna punya tampilan lain yang termasuk, tampilan aktif diganti ke tampilan itu (tautan langsung tetap bekerja). Bila tidak punya, diarahkan ke beranda tampilannya;
  - `flag?: string` dan `submodule?: SubmoduleKey` sama seperti aturan menu; gagal → beranda;
  - `menuKey?: string` butir menu yang menyala.
- Halaman yang memakai kerangka membungkus isinya dengan `<AppShell>`, seperti halaman lama. Layar penuh (login) cukup tidak memakainya.
- Rute anak (detail, langkah) diberi nama `<kunci>-<anak>`, misalnya `tna-gap`, dengan `meta.menuKey`.
- Nama atau path rute ganda membuat aplikasi gagal dimuat (`assertUnique` di `router/index.ts`), sehingga e2e PR yang membawanya langsung merah.
- Elemen yang melayang di atas semua layar (Asisten ELGOS, B17): taruh `src/screens/<nama-paket>/ShellExtra.vue`; `AppShell` memasangnya setelah `<main>` tanpa perlu diedit.
- Beranda tampilan (`homeFor(view)`): `dash` (hr, atasan), `my` (karyawan), `users` (admin), `tenants` (super) bila rutenya terdaftar dan gerbangnya (`views`, `flag`, `submodule`) lolos; selain itu `home`. Rute `home` mengalihkan ke beranda tampilan, jadi kode yang melakukan `router.push({ name: 'home' })` (login, link email) tidak perlu diubah.
- `src/modules.ts` (`SubmoduleKey`) tidak perlu diedit untuk modul 2–5: pakai `meta.flag`.

**Rute lama dipecah per layar** supaya tiap paket cukup menghapus foldernya sendiri:

| Folder | Rute (nama, path) | Dihapus oleh |
| --- | --- | --- |
| `screens/legacy-dna/` | `dna`, `/m/dna` | B4, yang mendaftarkan `dna` baru |
| `screens/legacy-tna/` | `tna`, `/m/tna` | B5, yang mendaftarkan `tna` baru |
| `screens/legacy-interview/` | `interview`, `/m/:key(dna\|tna)/sessions/:id` | B6 |
| `screens/legacy-cca/` | `legacy-cca`, `/m/:key(cca)` | B10, yang mendaftarkan `cc` |
| `screens/legacy-ina/` | `legacy-ina`, `/m/:key(ina)` | B9, yang mendaftarkan `ina` |

Alamat rute lama tidak berubah. Rute inti tetap di `router/index.ts`: `login` (`/login`), `email-link` (`/masuk`), `home` (`/`).

**Pemilik nama rute** (kunci menu). Path bebas dipilih pemilik asal tidak ganda; disarankan `/<kunci>`:

| Nama rute | Paket | Nama rute | Paket |
| --- | --- | --- | --- |
| `dash` | B3 | `lib`, `prog`, `req` | B13 |
| `cc`, `aiv` | B10 | `ld` | B14 |
| `dna` | B4 | `lim` | B15 |
| `tna` | B5 | `cp` | B16 |
| `iv` | B6 | `my`, `li` (Rencana belajar karyawan) | B8 |
| `ina` | B9 | `users`, `jobs`, `cfg` | B11 |
| `review` (anak `tna`) | B7 | `tenants`, `platform` | B12 |

Perhatian: `li` adalah **rute** Rencana belajar milik B8, sedangkan `module.li` adalah **flag** Learning Intervention milik B13 dan `li` juga kunci grup accordion. Ketiganya tidak saling memakai nama rute. Nama yang sudah terpakai dan tidak boleh dipakai ulang: `home`, `login`, `email-link`, `interview`, `legacy-cca`, `legacy-ina`, `ui-kit`.

**Kewajiban paket beranda.** Begitu B3 mendaftarkan `dash` (atau B8 `my`, B11 `users`, B12 `tenants`), pengguna tampilan itu tidak lagi mendarat di Beranda setelah login. Helper login di e2e lama (`loginAs` di `poc-dna-tna.spec.ts`, `gating.spec.ts`) menunggu `card-dna` dan URL `/`; paket itu wajib memperbaruinya di PR yang sama.

### 5.4 Kerangka

`AppShell.vue` (nama dan cara pakai lama dipertahankan: membungkus isi halaman lewat slot) kini menyusun:

- `UiSkipLink` ke `#isi`;
- `AppDrawer`: merek "EG · ELGOS · Elite Learning & Growth OS", lalu menu. Lebar 280px. Di bawah 900px drawer tersembunyi dan dibuka lewat tombol menu di top bar (`aria-expanded`, tutup dengan Esc atau saat pindah rute);
- `AppTopBar`: judul layar + baris tenant; pil "Log audit aktif"; `UiSegmented` "Tampilan" bila tampilan tersedia lebih dari satu; pil "label tampilan · email"; tombol tema; tombol "Keluar";
- `<main id="isi" tabindex="-1">` dengan lebar maksimum 1280px;
- komponen `ShellExtra.vue` milik paket (bila ada).

Rincian:

- Judul layar di top bar berupa `<div>`, bukan heading, supaya `<h1>` tetap milik halaman. Shell tidak memakai `role="status"`, `role="alert"`, atau live region; e2e lama mencari peran itu tanpa cakupan.
- Judul tab peramban: "<judul layar> · ELGOS".
- Drawer layar sempit: saat dibuka fokus pindah ke butir pertama; Esc atau klik latar menutup dan mengembalikan fokus ke tombol menu.
- Baris tenant: untuk tampilan `super` "Konsol platform ELGOS · semua tenant" (mockup); selain itu `user.tenantName` bila API mengirimnya, selain itu kosong. Mockup menulis "Elitery · Periode Q4 2026"; periode belum punya sumber data. `[⚠️ BELUM TERVERIFIKASI]` field `tenantName` belum ada di `/auth/me`; diminta ke B2.
- Pil "Log audit aktif" boleh tampil tanpa syarat karena audit baca data individu wajib dan gagal-tertutup (R2-2, `src/core/audit`).
- Catatan kuning mockup "Mockup interaktif. Semua angka … data demo" **tidak** dibawa ke aplikasi.
- Setelah login dan setelah ganti tampilan, pengguna diarahkan ke `homeFor(view)`.
- Tombol tema: `aria-pressed` + nama "Mode gelap"; tombol menu: nama "Menu" + `aria-expanded`.

## 6. Data, migrasi, endpoint, flag

Tidak ada. B0 hanya membaca `/api/me/access` dan `/api/auth/me` yang sudah ada.

## 7. Aturan dan keputusan yang dirujuk

- Brief 19 Nov aturan 5: layar mengikuti mockup Pak Eji (struktur menu, istilah, teks Indonesia).
- K2: lima peran, akun multi-peran bisa ganti tampilan.
- CLAUDE.md aturan 3 dan 4: flag default mati; visibilitas data di API. Shell hanya menyembunyikan menu.
- Prinsip mockup untuk perbankan: status selalu ikon + teks; merah hanya untuk kritis dan galat.
- PO-6: tidak relevan di B0 (tidak ada data individu).

## 8. Test

E2E Playwright (`apps/web/e2e/`), API di-mock lewat `page.route`:

Rute uji: pada build `VITE_UI_KIT=1`, router membaca daftar rute dari `localStorage` kunci `elgos.test-routes` saat dimuat dan mendaftarkannya ke layar uji (`screens/ui-kit/test-routes.ts`). Test mengisinya lewat `page.addInitScript`. Dengan begitu aturan menu, flag, dan ganti tampilan teruji tanpa menunggu layar paket lain, dan test lain tidak terpengaruh.

`shell.spec.ts`

1. HR: menu Beranda + grup Learning Needs Analysis (Developmental Needs, Training Needs); rute uji `ina` dan `lim` terdaftar tetapi flag mati → tidak tampil; tanpa pemilih tampilan.
2. Butir muncul begitu rute terdaftar dan flag menyala; judul top bar dan judul tab mengikuti; rute dengan flag mati tidak bisa dibuka lewat alamat langsung.
3. Accordion menutup, tetap tertutup setelah pindah halaman, lalu membuka.
4. `meta.menuKey` menyalakan butir induk.
5. Karyawan: menu peralihan tanpa grup, tanpa pemilih tampilan.
6. Atasan dengan rute `dash`: mendarat di `dash`, label "Dashboard tim".
7. Admin ETA: tampilan Super Admin, baris "Konsol platform ELGOS · semua tenant", butir peralihan.
8. Ganti tampilan HR → "Karyawan (saya)": menu berganti, bertahan setelah muat ulang, tautan langsung ke layar HR memindahkan tampilan kembali.
9. Rute tampilan lain yang tidak dimiliki akun → beranda.
10. Lewati ke konten: fokus pada Tab pertama, Enter memindahkan fokus ke `#isi`.
11. Tema: tombol mengubah `data-theme`, bertahan setelah muat ulang; tanpa pilihan mengikuti `prefers-color-scheme`.
12. Layar 600px: drawer tersembunyi, tombol menu membuka dan memindahkan fokus, Esc menutup dan mengembalikan fokus, pindah rute menutup.
13. Keluar: kembali ke `/login`, token dan tampilan tersimpan terhapus.
14. Snapshot visual shell + Beranda, terang dan gelap.

`ui-kit.spec.ts`

1. Token: tombol filled `rgb(11, 58, 110)`, radius 20px, latar `rgb(248, 249, 252)`, Roboto dan Roboto Mono termuat, **tidak ada permintaan jaringan ke luar aplikasi**.
2. `UiDataTable`: urut naik → turun → semula, `aria-sort`, angka sebagai angka; toolbar menyaring; keadaan kosong.
3. `UiTabs`: panah kanan, End, putar balik ke awal.
4. `UiErrorSummary`: fokus saat muncul, tautan ke field, hilang setelah diperbaiki.
5. `UiField`: petunjuk tertaut `aria-describedby`.
6. `UiStepper`: `aria-current="step"`, teks "(selesai)".
7. `UiStatus`: ikon + teks di semua tone. `UiProgressBar`: `aria-valuenow`.
8. Snapshot visual `/ui-kit` terang dan gelap (`maxDiffPixelRatio` 0.02).

E2E lama `gating.spec.ts` dan `poc-dna-tna.spec.ts` lulus tanpa diubah.

Gerbang: `npm run lint`, `npm test` (API tidak berubah), `npm run build`, `npm run e2e`.

`[⏳ DITERIMA]` Snapshot visual dibuat di Linux lokal dengan Chromium Playwright 1.63.0, sama dengan CI. Bila CI berbeda render, toleransi dinaikkan atau snapshot diperbarui dari artefak CI; test fungsional tetap menjadi gerbang utama.

## 9. Perubahan berkas

- [x] `docs/designs/b0-fondasi-ui.md` (spek ini)
- [x] `apps/web/package.json`, `package-lock.json`: `@fontsource/roboto`, `@fontsource/roboto-mono`
- [x] `apps/web/src/style.css`: token, tema gelap, kelas dasar `el-*`
- [x] `apps/web/src/main.ts`: impor font, pasang tema awal
- [x] `apps/web/src/ui/icons.ts`, `UiIcon.vue`
- [x] `apps/web/src/ui/UiButton.vue`, `UiChip.vue`, `UiStatus.vue`, `UiCard.vue`, `UiNote.vue`, `UiKpiCard.vue`, `UiProgressBar.vue`, `UiAuditLine.vue`
- [x] `apps/web/src/ui/UiTabs.vue`, `UiSegmented.vue`, `UiStepper.vue`, `UiErrorSummary.vue`, `UiSkipLink.vue`, `UiDataTable.vue`, `UiField.vue`
- [x] `apps/web/src/ui/index.ts`
- [x] `apps/web/src/shell/views.ts` (tampilan dan pemetaan peran), `menu.ts` (daftar menu + aturan tampil), `theme.ts`
- [x] `apps/web/src/components/AppShell.vue` (ditulis ulang), `AppDrawer.vue`, `AppTopBar.vue`
- [x] `apps/web/src/stores/session.ts`: `roles`, `views`, `activeView`, `setView`, `bindRoutes`; `SessionUser.roles?`, `tenantName?`
- [x] `apps/web/src/router/index.ts`: glob `screens/*/routes.ts`, penjaga `views`/`flag`/`submodule`, `homeFor`, `assertUnique`, judul tab
- [x] `apps/web/src/screens/legacy-{dna,tna,interview,cca,ina}/routes.ts` (rute lama dipecah)
- [x] `apps/web/src/screens/ui-kit/routes.ts`, `UiKitView.vue`, `test-routes.ts`, `TestScreen.vue` (hanya `VITE_UI_KIT=1`)
- [x] `apps/web/env.d.ts`: `VITE_UI_KIT`
- [x] `apps/web/playwright.config.ts`: `VITE_UI_KIT=1` pada build e2e, opsi snapshot
- [x] `apps/web/e2e/shell.spec.ts`, `ui-kit.spec.ts`, `__snapshots__/`
- [x] `README.md` bagian web: menunjuk ke spek ini

Tidak diubah: `LoginView.vue`, `EmailLinkView.vue` (milik B1), halaman lama lain, dan seluruh `apps/api`.

## 10. Asumsi dan risiko yang tersisa

- `[⚠️ BELUM TERVERIFIKASI]` palet mode gelap (bagian 3).
- `[⚠️ BELUM TERVERIFIKASI]` `user.roles` dan `user.tenantName` dari B2 (bagian 5.1, 5.4).
- `[⏳ DITERIMA]` kontras halaman lama di mode gelap (bagian 3); test: snapshot visual.
- `[⏳ DITERIMA]` kestabilan snapshot visual di CI (bagian 8).
- Butir menu yang flag-nya mati **disembunyikan**, bukan ditampilkan redup. Dasarnya brief aturan 10 ("modul yang tidak lolos Go/No-Go flag-nya tetap mati"): pengguna klien tidak melihat modul yang belum dibuka. Status kelima modul tetap terlihat oleh HR di Dashboard utama (B3).

## 11. Review egm

### Review spek (subagent baru, 19 Nov)

19 temuan: 3 berat, 10 sedang, 6 ringan. Triase:

| # | Temuan | Keputusan |
| --- | --- | --- |
| 8 (berat) | Rute `my` palsu saat build merusak e2e lama dan test 4–5 | **Perbaiki**: rute uji didaftarkan saat runtime dari `localStorage`, per test |
| 15 (berat) | B0 mengedit berkas yang ditulis ulang T2 (login, sesi) | **Perbaiki**: `LoginView`/`EmailLinkView` tidak disentuh, rute `home` yang mengalihkan. `session.ts` tetap diubah (tambahan saja); bentuk `SessionUser.roles`/`tenantName` dikabarkan ke T2 |
| 16 (berat) | `/m/:key(cca\|ina)` diperebutkan T6 dan T7; `interview` tidak terdaftar sebagai rute lama | **Perbaiki**: rute lama dipecah per folder `screens/legacy-*` |
| 1 | Tidak ada titik sambung Asisten ELGOS (B17) | **Perbaiki**: `ShellExtra.vue` lewat glob |
| 2 | Pola formulir tidak dicakup | **Perbaiki sebagian**: `UiField` + kelas `el-input`/`el-check`. Saklar dan dialog **ditunda** ke paket pertama yang butuh |
| 3 | Token tersier, baris tenant Super Admin, label "Karyawan (saya)" | **Perbaiki** |
| 3 | Klik grup Learning Intervention pindah ke Library | **Tolak**, alasan di 5.2 |
| 4 | `meta.bare` bertentangan dengan `<AppShell>` per halaman | **Perbaiki**: `bare` dihapus |
| 5 | Kunci `li` bermakna tiga | **Perbaiki**: tabel pemilik nama rute dan catatan di 5.3 |
| 6 | Gerbang flag vs submodul tidak konsisten | **Perbaiki**: empat submodul LNA memakai `submodule`; modul 2–5 flag saja |
| 7 | "delapan thread", "tanpa dependensi baru" | **Perbaiki** |
| 9 | Test 1 tidak menguji gerbang flag | **Perbaiki**: test dengan rute uji, flag mati dan menyala |
| 10 | State accordion hilang tiap pindah halaman | **Perbaiki**: state tingkat modul + test |
| 11 | Locator e2e lama rawan strict-mode | **Perbaiki**: larangan `role=status/alert` di shell, judul bukan heading |
| 12 | `/auth/me` gagal menurunkan menu diam-diam | **Perbaiki**: perilaku ditetapkan (jatuh ke `karyawan`, pilihan tersimpan tidak ditimpa). Tampilan galat khusus **ditolak**: di luar cakupan B0, dan halaman lama sudah berperilaku sama |
| 13 | `eta_admin` kehilangan menu DNA/TNA | **Perbaiki**: butir peralihan untuk `super` |
| 14 | Fokus drawer, `document.title`, loop `homeFor` | **Perbaiki** |
| 14 | Kilas tema terang (skrip inline di `index.html`) | **Tolak**: tema dipasang di `main.ts` sebelum aplikasi dipasang, jadi tidak ada konten yang sempat tergambar; skrip inline juga menyulitkan CSP |
| 14 | `--color-white` dipetakan ulang memengaruhi `text-white` | **Tolak**: tombol `bg-slate-900 text-white` halaman lama ikut terbalik (terang, teks gelap) dan tetap terbaca; tercakup snapshot gelap |
| 17 | Kontrak belum mengatur path, pemilik, nama ganda | **Perbaiki**: tabel pemilik, konvensi nama anak, `assertUnique` |
| 18 | Dampak `dash`/`my` pada e2e lama | **Perbaiki**: kewajiban paket beranda ditulis di 5.3 |
| 19 | Tipe dan batas kecil | **Perbaiki** di bagian 4, 5.3, 5.4 |
