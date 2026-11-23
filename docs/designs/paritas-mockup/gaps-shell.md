# Gap kesetaraan: grup "shell" (token, kerangka, menu, login, dashboard)

Acuan: `/mnt/project-files/mockup-pak-eji/Main.dc.html`, `DesignSystem.dc.html`, mock-shots `hr--dash`, `atasan--dash`, `login--cred`, `login--otp`, `admin--users`, `super--tenants`, `karyawan--my`. Aplikasi: `apps/web/src` + app-shots `dashboard-*`, `login-*`, `alur-menu-peran-*`.
Path relatif ke `apps/web/src/`.

Catatan screenshot: beberapa folder app-shots berisi layar test lain (mis. `dashboard-atasan-…/test-finished-1.png` dan `poc-dna-tna-link-masuk-tidak-valid…` menampilkan "Hasil saya"). Untuk layar itu yang dipakai kodenya dan `test-finished-2.png`.

## 1. Token design system

`:root` mockup vs `style.css:7-39`: **ke-27 warna sama persis** (p, onp, pc, onpc, sc, onsc, tc, ont, t, bg, s1–s3, w, tx, tx2, ol, ov, ok/okc, wn/wnc, er/erc, plus on-container catatan). Tipografi h1/h2/h3, card, grid 2/3/4 + breakpoint 1000/640, btn (4 varian + sm), tab, seg, bar, note, step, pill, input, label: nilai sama.

| ID | Layar/state | Jenis | Mockup | Aplikasi | File:baris | Bobot | Usulan perbaikan |
|---|---|---|---|---|---|---|---|
| T1 | Semua chip | token | `.c-rv` teks `--wn` #7A4F00, `.c-ok` teks `--ok` #1B6E3F, `.c-er` teks `--er` #B3261E | teks `on-*-container` (#2B1700, #00210F, #410002), jauh lebih gelap | `ui/UiChip.vue:23-25` | sedang | Pakai `--el-warning`, `--el-success`, `--el-critical` sebagai warna teks chip (cek kontras gelap tetap ≥4.5:1) · **Diputuskan** ([p8-keputusan-r1-r22.md](p8-keputusan-r1-r22.md), R3): warna teks chip `on-*-container` dipertahankan (kontras AA di dua tema) |
| T2 | Breadcrumb | komponen | `.bc` 12px, `--tx2`, tautan `--p` bergaris bawah, margin-bawah 8px | Tidak ada di `ui/`; tiap layar membuat sendiri: `tna-bc` 13px, `<p class="el-muted">` 14px tanpa `<nav>` (B13), inline style (B4) | `screens/b5-tna/tna.css:1`, `screens/b13-li/LibraryView.vue:70`, `screens/b4-dna/DevelopmentNeedsView.vue:113` | sedang | Tambah `UiBreadcrumb` (nav + `aria-label`, gaya `.bc`) dan pakai di semua layar anak · **Ditutup** ([p3-komponen-bersama.md](p3-komponen-bersama.md)): `UiBreadcrumb`, termasuk antrean dan tinjauan B7 |
| T3 | Komponen bersama | komponen | `.rad` (pilihan chip berbingkai), `.ac` (tombol pilihan/aksi berbingkai), `.msg.ai/.msg.me` (gelembung chat), `.dot` + `.state` | Tidak ada di `ui/`; layar membuat versi lokal (mis. `screens/b6-iv/iv.css`) | `ui/index.ts` | rendah | Angkat ke `UiChoiceGroup`, `UiChatBubble` bila dipakai ≥2 paket. (`.sw2` saklar sengaja ditunda, spek B0 §11) |
| T4 | Skip link | token | `.skip:focus` latar #fff, tanpa radius, warna teks bawaan | radius 8px, teks `--el-primary` | `ui/UiSkipLink.vue:19` | rendah | Samakan atau terima (perbedaan kecil) |

## 2. Shell aplikasi

Sudah sama: brand (logo EG 40px r12, "ELGOS" / "Elite Learning & Growth OS"), drawer 280px `--s1`, butir 48px r28, aktif `--sc`, l1 inden 12px/44px, chevron expand_less/more, urutan grup (Dashboard → LNA → LI → LD → LIM → CP), label & ikon semua butir, pill "Log audit aktif" + `verified_user`, "Tampilan:" + segmented, "Karyawan (saya)", pill `person` "Peran · email", tombol Keluar `outlined sm` + `logout`, skip link "Lewati ke konten utama" ke `#isi`, baris tenant Super Admin "Konsol platform ELGOS · semua tenant". Chip "Konsep" di drawer: mockup mendukung `n.soon` tetapi tidak ada butir yang memakainya, jadi bukan gap. Level `.nav.l2` juga tidak dipakai mockup.

| ID | Layar/state | Jenis | Mockup | Aplikasi | File:baris | Bobot | Usulan perbaikan |
|---|---|---|---|---|---|---|---|
| S1 | Semua layar, panel Asisten ELGOS | hilang | FAB `smart_toy` kanan bawah + panel `.asst` (judul "Asisten ELGOS", "Tanyakan urusan Anda · {peran}", saran, kaki "Hanya menjawab dari data…") di setiap layar | Tidak ada: `screens/asisten/ShellExtra.vue` (spek B17) belum ada di branch; backend & `api/assistant.ts` sudah | `components/AppShell.vue:32,47` | tinggi | **Ditutup** ([b17-asisten-web.md](b17-asisten-web.md)): `screens/b17-asisten/ShellExtra.vue`, flag `assistant`; Admin Tenant ditunda · Keputusan user 23 Nov ([egm/p8-code-review.md](egm/p8-code-review.md)): tidak di tampilan Super Admin; eta_admin memakainya dari tampilan HR |
| S2 | Top bar, akun multi-peran, lebar 1280 | layout | Satu baris tinggi 64px: crumb · pill audit · Tampilan · pill peran · Keluar | Tombol tema tambahan membuat bar membungkus: "Keluar" (HR, atasan) atau tema+Keluar (Admin) turun ke baris kedua, bar ~100px | `components/AppTopBar.vue:63,73` | sedang | Pindahkan tombol tema ke menu akun/drawer atau `flex-wrap:nowrap` + crumb `min-width:0` ellipsis; uji 1280 dan 1024 · **Ditutup** ([p2-bug-tampilan.md](p2-bug-tampilan.md)) |
| S3 | Pemilih Tampilan, Admin Tenant | nav | "Admin Tenant · HR / L&D · Karyawan (saya)" (K2: admin juga HR) | Akun `tenant_admin` tanpa `hr_admin` hanya mendapat "Admin Tenant · Karyawan (saya)": tampilan HR disaring karena rute `dash` hanya untuk `hr_admin/eta_admin/supervisor` | `screens/b3-dashboard/routes.ts:9`, `stores/session.ts:171` | sedang | Putuskan apakah `tenant_admin` = HR di API; bila ya tambah peran ke `roles` rute dan endpoint |
| S4 | Crumb top bar, Learning Intervention | copy | "Learning Intervention · Library", "… · Program & Course", "… · Permintaan & pengembangan" | "Library", "Program & Course", "Permintaan & pengembangan" | `screens/b13-li/routes.ts:7-9` | rendah | Ubah `meta.title` ke judul mockup (TITLES) |
| S5 | Crumb top bar, tinjauan | copy | "Tinjauan HR" | "Tinjauan hasil AI" | `screens/b7-tinjauan/routes.ts:8-9` (dulu `screens/legacy-review/routes.ts:7`) | rendah | **Ditutup** ([b7-tinjauan-web.md](b7-tinjauan-web.md)): rute `review` berjudul "Tinjauan HR"; antrean lama `tna-review` tetap "Tinjauan hasil AI" |
| S6 | Menu HR | nav | Tidak ada butir hak data | Butir tambahan "Permintaan data karyawan" (`policy`) di paling bawah | `shell/menu.ts:44` | rendah | Perlu keputusan (lihat K-S3); bila dipertahankan, pertimbangkan di bawah grup admin/HR, bukan butir tingkat atas |

Menu per peran (fungsi `N` vs `shell/menu.ts`), saat semua flag menyala:
- HR: sama (+ butir S6). Atasan: sama. Karyawan: sama (Hasil saya, Wawancara visi & nilai, Wawancara akar masalah, Rencana belajar). Admin Tenant: sama. Super Admin: sama.
- Perbedaan saat flag mati (LI, LD, LIM, CP, CCA, INA tersembunyi; butir peralihan "Beranda", DNA/TNA) adalah keputusan flag/B0, tidak dihitung.

## 3. Login

Sudah sama: dua panel (kiri navy 48px, kanan `--bg`), merek + tagline, kalimat utama 32/40, paragraf, tiga butir kepercayaan dengan ikon, "Masuk ke ELGOS", subjudul, "Email kerja" + placeholder, tombol utama penuh, tombol SSO outlined `badge`, baris meta "Sesi dienkripsi · percobaan masuk dicatat di log audit tenant".

| ID | Layar/state | Jenis | Mockup | Aplikasi | File:baris | Bobot | Usulan perbaikan |
|---|---|---|---|---|---|---|---|
| L1 | Halaman tujuan link `/masuk` (pengganti langkah 2) | token/layout | Langkah 2 tetap di tata letak login: panel kepercayaan kiri, h1 24/32, sub, tombol filled + "Kembali" text, meta mono | Kartu Tailwind lama: `bg-slate-50`, `bg-white shadow`, tombol `bg-slate-900`, `text-blue-700`; tanpa panel kiri, tanpa `UiButton`/token | `views/EmailLinkView.vue:36-47` | sedang | Tulis ulang dengan tata letak `LoginView` (ekstrak `LoginLayout`), `UiButton`, `UiErrorSummary` untuk galat token · **Ditutup** ([p4-login.md](p4-login.md)) |
| L2 | Setelah "Kirim link masuk" | state | Langkah 2 mengganti isi panel kanan (h1 baru, sub menyebut email, tombol "Kembali") | Tetap di formulir yang sama, hanya catatan hijau di bawah email | `views/LoginView.vue:157` | sedang | Jadikan langkah "Periksa email Anda" (h1, sub "Link dikirim ke {email}", "Kirim ulang", "Kembali") meniru struktur `lg.otp` · **Ditutup** ([p4-login.md](p4-login.md)) |
| L3 | Judul | token | h1 24/32 weight 400 (h1 global) | weight 500 | `views/LoginView.vue:188` | rendah | `font-weight:400` · **Ditutup** ([p4-login.md](p4-login.md)) |
| L4 | Logo panel kiri | token | r12px, weight 700, 15px, letter-spacing .5px; ikon kepercayaan 22px | r10px, weight 600, ukuran bawaan; ikon 20px | `views/LoginView.vue:128-131,178` | rendah | Samakan dengan `.logo` / pakai kelas logo drawer · **Ditutup** ([p4-login.md](p4-login.md)) |
| L5 | Baris meta bawah | token | `.meta`: Roboto Mono 11px | Roboto 12px | `views/LoginView.vue:168,195` | rendah | Pakai `UiAuditLine` · **Ditutup** ([p4-login.md](p4-login.md)) |
| L6 | Panel kanan | layout | `.lg-c` max 420px, sub margin `0 0 8px`, `.lg-r` padding 32px; dua panel `flex:1 1 420px / 1 1 460px` (membungkus) | max 400px, sub `4px 0 16px`, padding `48px 16px`, grid 1fr 1fr | `views/LoginView.vue:175,186-189` | rendah | Samakan ukuran; pakai flex-wrap mockup · **Ditutup** ([p4-login.md](p4-login.md)) |
| L7 | Layar sempit (<840px) | layout | Panel kiri turun ke atas, semua teks tetap | Kalimat utama, paragraf, tagline disembunyikan | `views/LoginView.vue:196-199` | rendah | Tampilkan sesuai mockup atau catat sebagai keputusan · **Ditutup** ([p4-login.md](p4-login.md)) |

Tidak dihitung (keputusan proyek, tercatat): PD-10 (tanpa kata sandi di produksi, tanpa langkah "Verifikasi dua langkah"/OTP, tombol "Kirim link masuk", teks "Link berlaku 15 menit…"); SSO hanya bila flag organisasi (stub); kolom **Organisasi** tambahan (spek B1: email unik per tenant); kartu "Masuk sebagai (khusus demo)" tidak dibangun (K4); butir 3 "Dirancang mengikuti UU PDP No. 27/2022" tanpa OJK (K3); galat memakai `UiErrorSummary` + pesan per field (sesuai DesignSystem: ringkasan galat GOV.UK untuk login); catatan "sesi berakhir" tambahan.

## 4. Dashboard utama HR dan Dashboard tim atasan

Sudah sama: h1 "Dashboard utama", subjudul kalimat pertama, grid 4 KPI (label uppercase, nilai 32/40, catatan 12px), "Status modul" grid 3 dengan chip + "Modul n" mono + h3 + deskripsi, judul "Pareto 20/80: gap yang perlu diprioritaskan", batang merah untuk prioritas, "Perlu tindakan" dengan tombol tonal sm, nama & deskripsi modul.

| ID | Layar/state | Jenis | Mockup | Aplikasi | File:baris | Bobot | Usulan perbaikan |
|---|---|---|---|---|---|---|---|
| D1 | Pareto, baris | nav | Seluruh baris bisa diklik → Detail gap kompetensi itu | Baris tidak bisa diklik | `screens/b3-dashboard/DashboardView.vue:143-150` | sedang | Jadikan baris tautan ke `tna-gap` (bila `routeOpen`), dengan fokus keyboard · **Ditutup** ([p3-komponen-bersama.md](p3-komponen-bersama.md)): baris Pareto kompetensi menaut ke Detail gap bila papan gap terbuka |
| D2 | Pareto, tata letak baris | layout | Satu baris: "KODE · nama" kiri, mono "−n poin · kum. x%" rata kanan; batang di bawah (margin 6px, jarak antarbaris 12px) | Label + chip "Prioritas" di baris 1, mono "n orang · kum. x%" di baris 2 kiri, batang baris 3 (jarak 14px) | `screens/b3-dashboard/DashboardView.vue:144-149,179` | rendah | Taruh angka mono di kanan baris label; chip Prioritas boleh tetap (prinsip ikon+teks) di sebelah label · **Ditutup** ([p7-sisa.md](p7-sisa.md)) |
| D3 | Status modul, tombol | komponen | "Buka" = tombol teks (`btn x sm`) | `UiButton variant="outlined"` | `screens/b3-dashboard/DashboardView.vue:131` | rendah | `variant="text"` · **Ditutup** ([p7-sisa.md](p7-sisa.md)) |
| D4 | Status modul, susunan kartu | layout | 3 baris tetap: chip/Modul n · judul+deskripsi · batang · metrik+Buka (tinggi kartu seragam) | Tanpa batang dan metrik; baris bawah kosong untuk modul belum aktif, tinggi kartu tidak seragam | `screens/b3-dashboard/DashboardView.vue:120-133` | rendah | Lihat K-D3; minimal sisakan baris bawah konsisten |

Tidak dihitung sebagai gap karena sengaja di spek B3, tetapi **berbeda dari mockup** (lihat "perlu keputusan").

## 5. Layar mockup yang tidak ada sama sekali di aplikasi (lingkup grup ini)

1. **Panel Asisten ELGOS** (FAB + panel chat, semua layar) – S1.
2. Langkah login 2 "Verifikasi dua langkah" – sengaja diganti PD-10; padanannya (halaman "periksa email" dan `/masuk`) belum mengikuti desain (L1, L2).
3. Kartu "Masuk sebagai (khusus demo)" – sengaja tidak dibangun (K4).
4. `DesignSystem.dc.html` – padanannya `/ui-kit` (hanya build `VITE_UI_KIT=1`), sesuai mockup "bukan fitur atau menu aplikasi".

## 6. Perlu keputusan

Penyimpangan yang tercatat di spek tetapi bertentangan dengan target "1:1":
- **K-S1 Mode gelap + tombol tema** (B0 §3, `[⚠️ BELUM TERVERIFIKASI]`): tidak ada di mockup dan menjadi penyebab S2. Pertahankan, pindahkan, atau hapus?
- **K-S2 Catatan kuning demo di bawah drawer** tidak dibawa (B0). Setuju (data demo)?
- **K-S3 Butir "Permintaan data karyawan"** (B8, hak subjek data UU PDP) tidak ada di mockup (S6).
- **K-S4 Baris tenant** tanpa "· Periode Q4 2026" (B0: periode belum punya sumber data) dan kosong bila `/auth/me` tidak mengirim `tenantName`.
- **K-S5 Klik grup Learning Intervention** di mockup juga membuka Library; B0 menolaknya (aksesibilitas).
- **K-S6 Admin Tenant = HR** (S3): perlu keputusan akses API, bukan sekadar UI.
- **K-D1 Dashboard atasan**: mockup memakai h1 & crumb "Dashboard utama", subjudul sama, **4 KPI** dan **5 modul** untuk atasan; aplikasi "Dashboard tim", subjudul "Ringkasan tim Anda…", 2 KPI, 3 modul (spek B3 §4, RG-3/PM-5). Label menu "Dashboard tim" memang dari mockup.
- **K-D2 Subjudul tanpa "Peran aktif: <b>…</b>"** (B3 §2) dan **catatan hijau "Kepatuhan: … OJK"** di kartu Perlu tindakan dihapus (K3). Opsi: bawa catatan tanpa klausa OJK.
- **K-D3 Status modul**: mockup chip Aktif/Baru/Konsep tanpa ikon + batang persen + metrik per modul; aplikasi Aktif/Belum aktif dengan ikon, rincian "DNA · TNA", tanpa batang (B3: data mockup tanpa sumber). Tombol "Buka" hanya bila layar bisa dibuka (mockup selalu).
- **K-D4 Teks KPI & Pareto**: catatan KPI ("dari n pegawai", "n target KPI/OKR meleset", "target pilot ≥ 85% · pemantauan tinjauan HR", "median n sesi · target ≤ 14 hari") dan catatan Pareto ("… kebutuhan … Mulai dari yang ditandai Prioritas" vs mockup "… kompetensi … terhadap Job Competency Model. Mulai dari yang merah"); batang = kumulatif, bukan besar gap; "n orang" bukan "−n poin"; label tanpa kode kompetensi. Semua dari definisi API B3.
- **K-D5 Perlu tindakan**: butir dan teks dari API (5 kunci) berbeda dari 4 butir mockup ("… lewat tenggat", "Kamus kompetensi menunggu pengesahan"); tombol "Lihat" selain "Tinjau" (mockup "Buka"); baris keterangan ditulis ulang.
- **K-L1 Galat login**: mockup kotak `note e` satu baris "Ada masalah: …"; aplikasi ringkasan galat + pesan per field (lebih sesuai DesignSystem). Setujui sebagai penyimpangan.

## Ringkasan hitungan

Gap (tidak termasuk keputusan): tinggi 1 (S1), sedang 7 (T1, T2, S2, S3, L1, L2, D1), rendah 13 (T3, T4, S4, S5, S6, L3–L7, D2–D4). Total 21. Perlu keputusan: 11.
