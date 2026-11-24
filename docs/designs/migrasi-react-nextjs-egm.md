# Review egm: rencana migrasi React/Next.js

Target: `docs/designs/migrasi-react-nextjs.md` v1 (24 Nov 2026). Tiga ikan mas (subagent tanpa riwayat percakapan) menerima hanya path dokumen dan path kode: `egm-zoom-out`, `egm-design`, `egm-implementation-readiness` (lensa pemahaman ikut di dalamnya). Triase mengikuti `egm-resolve`: perbaiki, tolak dengan alasan, atau tunda. Hasilnya v2.

## Temuan dan triase

| # | Reviewer | Berat | Temuan | Keputusan |
| --- | --- | --- | --- | --- |
| Z1 | zoom-out | Tinggi | Rencana dibangun sebelum alasannya (D0) diketahui | **Perbaiki**: D0 jadi gerbang sebelum F0; rencana tetap ditulis lengkap karena user meminta rencana, tapi teknologi bercabang pada D0 (§1, §2, §6) |
| Z2 | zoom-out | Tinggi | Next export = SPA berkostum Next; N3 React+Vite lebih sederhana | **Perbaiki**: rekomendasi diganti N3 bila Next tidak wajib, N2 (catch-all) bila wajib (§6) |
| Z3 | zoom-out | Sedang | "Bentuk deploy tidak berubah" salah untuk N1 (nginx per prefiks, wilayah infra) | **Perbaiki** (§6, F2 di §8) |
| Z4 | zoom-out | Sedang | App Router membelah kontrak rute B0 dan mematikan override rute uji | **Perbaiki**: N1 tidak direkomendasikan; N3/N2 mempertahankan `routes.ts` (§6, §7.4) |
| Z5 | zoom-out | Sedang | F1 terlalu besar (store sesi abstrak untuk adaptor spekulatif) | **Perbaiki**: F1 hanya fungsi murni gerbang/menu; store sesi pindah ke F2 (§7.1, §7.2) |
| Z6 | zoom-out | Sedang | Perbaikan diselipkan ke port yang seharusnya menjaga perilaku | **Perbaiki**: port 1:1, perbaikan jadi tiket F5 (§9, D5) |
| Z7 | zoom-out | Sedang | Perawatan ganda diremehkan | **Perbaiki**: ditulis ±5 minggu, batas keras 9 Jan (§1, §5, §8) |
| Z8 | zoom-out | Rendah | Angka usaha saling bertentangan | **Perbaiki**: satu angka 25–35 hari, kalender ±5 minggu (§1, §8.2) |
| Z9 | zoom-out | Rendah | Reuse spekulatif dengan EliteMentor | **Perbaiki**: dihapus |
| Z10 | zoom-out | Rendah | Detail implementasi terlalu rinci untuk dokumen keputusan | **Tolak sebagian**: tabel pemetaan dipertahankan ringkas karena reviewer manusia (Andrian) perlu melihat dampak ke kontrak B0; kutipan guide dipindah ke tiket |
| D1 | design | Tinggi | `nginx.conf` `try_files … /index.html` dan cache `/assets/` salah untuk Next export | **Perbaiki**: N2 butuh konfigurasi nginx sendiri oleh thread infra (§6, F2) |
| D2 | design | Tinggi | Navigasi klien ke path dinamis di N1 meminta payload RSC yang tidak ada | **Perbaiki**: N1 tidak direkomendasikan; F0 menguji navigasi klien, back/forward, `ke=` (§8.1) |
| D3 | design | Tinggi | Rute uji runtime (`shell.spec`, `role-switch.spec`) tidak mungkin di N1 | **Perbaiki**: dicatat di §3, §7.3; N3/N2 mempertahankannya |
| D4 | design | Tinggi | Menghapus `trapTab` mematahkan `tna-gap.spec.ts:395-405` | **Perbaiki**: `trapTab` dipertahankan; evaluasi jadi tiket F5 |
| D5 | design | Sedang | Klaim "fokus setelah navigasi seperti diuji shell.spec" salah | **Perbaiki**: ditulis sebagai perubahan perilaku baru, tiket F5 |
| D6 | design | Sedang | Jumlah path dinamis salah (5, bukan 7), plus redirect dan regex | **Perbaiki**: daftar lengkap 5 path + 4 redirect (§3, §8.1) |
| D7 | design | Sedang | Store sesi: StrictMode, snapshot stabil, timer saat tukar token, handler 401 | **Perbaiki**: syarat eksplisit §7.2 |
| D8 | design | Sedang | Opsi B: `sessionStorage` tidak ikut ke tab baru | **Perbaiki** (§5) |
| D9 | design | Sedang | Kebocoran spesifik framework di e2e (RSC, route announcer, `page.clock`, `addInitScript`) | **Perbaiki**: daftar cek di §7.3 dan F0 |
| D10 | design | Sedang | `/masuk#token` belum dites di framework baru | **Perbaiki**: cek F0 (§8.1) |
| D11 | design | Rendah | Gerbang di layout merender layar sebelum redirect | **Perbaiki**: syarat tahan render (§7.2) |
| D12 | design | Rendah | `useSearchParams` butuh Suspense di export | **Tunda**: hanya relevan bila D2 = N1/N2; dicek di F0 |
| I1 | readiness | Tinggi | F0 tidak bisa membuktikan path dinamis karena tidak terdaftar | **Perbaiki** (§3, §8.1) |
| I2 | readiness | Tinggi | Ukuran F0 tanpa metode/satuan/ambang | **Perbaiki**: tabel cek dengan cara dan ambang (§8.1) |
| I3 | readiness | Tinggi | F0 bergantung pada `WEB_TARGET` yang baru ada di F2 | **Perbaiki**: F0 memakai salinan config sementara dan server statis lokal |
| I4 | readiness | Sedang | "e2e paket itu" tidak didefinisikan | **Perbaiki**: daftar spec F0 dan F2 disebut nama |
| I5 | readiness | Tinggi | Antarmuka F1 terlalu longgar | **Perbaiki sebagian**: F1 diperkecil ke fungsi murni dengan bentuk `access` dan keluaran `homeFor`; antarmuka persis tetap di spek F1 `web-core.md` (aturan 11 langkah 1) |
| I6 | readiness | Sedang | Cakupan F1 tidak konsisten (1.640 vs 1.000 baris, `api/*`) | **Perbaiki**: `api/*` tidak dipindah |
| I7 | readiness | Sedang | Perubahan CI F1 tidak ada | **Perbaiki**: Vitest, skrip `test` web, langkah CI job `web` |
| I8 | readiness | Sedang | Pelaksana dan rollback tidak disebut | **Perbaiki**: kolom pelaksana di §8; rollback F1 = revert, F4 = tag image. Nama branch mengikuti kontrak thread (`claude/project-thread-*`), bukan `feat/ewi-ELITMEN-xxx`, sesuai praktik semua paket ELGOS |
| I9 | readiness | Sedang | Jadwal bertabrakan (F1/F2 vs EliteMentor 2.0) dan F0 tidak bercabang pada D0 | **Perbaiki**: F1 8–9 Des, F2 mulai 14 Des; F0 dijalankan pada opsi hasil D2 |
| I10 | readiness | Rendah | Istilah internal tanpa penjelasan | **Perbaiki**: glosarium singkat |

Tidak ada temuan yang mengubah tujuan bisnis tanpa user: pilihan Next vs React diangkat ke user sebagai D0/D2.

## Cek drift

Dokumen ini hanya rencana; tidak ada kode yang bisa menyimpang. Angka di §3 diambil dari `7df8dc4` dan diverifikasi ulang terhadap temuan reviewer (jumlah path berparameter, redirect, job CI).
