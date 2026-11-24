# Selisih spek dan kode setelah P9 (24 Nov 2026)

Dasar: branch `paritas-p9` (dari `ea7d1c4`), setelah triase [pr39-full-code-review.md](pr39-full-code-review.md#triase). Yang dibandingkan: `CLAUDE.md`, B0 ([b0-fondasi-ui.md](../../b0-fondasi-ui.md)), spek paket B3, B5, B7, B17, dan [README paritas](../README.md) terhadap `apps/web` dan `apps/api`. Hanya selisih yang masih ada atau yang baru ditutup P9 yang dicatat.

## Sudah selaras (ditutup P9)

| Spek | Kode sekarang |
| --- | --- |
| B0 5.3 aturan 2: anak menu mengulang `views` | `tna-review` dan `review` memakai `views: ['hr','admin','super']` (`screens/b7-tinjauan/routes.ts`) |
| B0 5.1: izin dari `session.roles` | `session.hasAnyRole(list)` (`stores/session.ts`); B5 (`TnaScreen`, `TnaPengelolaan`, `TnaGapView`, `board.ts`) tidak lagi membaca `session.role` untuk izin. `TnaPengelolaan` membaca `isLearner` sebagai "hanya peran karyawan" |
| B0 5.3 kontrak `ShellExtra` | Kolom `.el-app__extras` di `AppShell.vue` menumpuk semua tambahan shell; `ShellExtra` tanpa `position: fixed` sendiri (ditulis di B0) |
| B0 bagian 6: judul tab | `shell/title.ts`, dipasang `main.ts`; tidak ada impor melingkar router ↔ menu (ditulis di B0) |
| B7 HR: classify | Respons tanpa `detail`, `originalDetail`, `summaryNote` (ditulis di spek B7 butir 2) |
| B7 HR: ekspor CSV | Filter gap opsional, validasi sama dengan `/review` (spek B7 butir 5); layar per gap mengirimnya (B7 web Keputusan 8) |
| B7 web Keputusan 2 dan 3 | R1 (HR saja) dan filter gap di balik `tna.review_workspace` (audit 39-2) |
| B5: `parseGapQuery` | Merapikan spasi dan menolak > 255 karakter untuk semua pemakai; SQL antrean menormalkan nama seperti `metricKey` (catatan P9 di tabel endpoint B5) |
| B3: baris Pareto | `competencyId` tercatat di tabel definisi angka |
| B17: tombol "Buka …" | Halaman API `review` dibuka sebagai antrean `tna-review` (`PAGE_ROUTE` di `b17-asisten/ShellExtra.vue`), sama dengan dashboard B3 3.5 |
| README paritas | Status gap dihitung ulang (SP-1..SP-3), baris basi ShellExtra, `ReviewView.vue`, RV-3 diperbarui |

## Masih berbeda

| # | Spek | Kode | Status |
| --- | --- | --- | --- |
| D1 | B0 5.3 aturan 1: `views` rute = `views` butir menu | Rute `users`, `jobs`, `cfg` memakai `['admin','hr','super']`, menu `['admin']` | Menunggu persetujuan Andrian (S-2); alasan di komentar `b11-admin/routes.ts` |
| D2 | B0: hanya token `--el-*` | `box-shadow` mentah di `b17-asisten/ShellExtra.vue` (panel) dan `b9-ina/ShellExtra.vue` | Usul token bayangan di B0 (S-3) |
| D3 | B0 bagian 4: komponen `Ui*` untuk kontrol | `<button>` bergaya sendiri: `b17-chip`, `iv-ac`, `cp-pick`, pemilih jabatan `ProgramView.vue` | Usul `UiChoiceChip` di B0 (S-4) |
| D4 | Mockup LI-14 | Chip netral "Belum tersedia" untuk jabatan tanpa kamus | Selesai: keputusan user 24 Nov memilih hijau bila kamus ada, netral bila belum (perilaku sekarang) |
| D5 | Mockup LD-10 | `input type=date` tanpa placeholder tanggal | Terbuka (SP-3) |
| D6 | B5 §15: tipe `Gap` bersama | Kolom `focus*` masih lima field datar (sumber kolom kini satu, `GAP_MATCH_COLUMNS`) | Ditunda ke S2 (SM-5) |
| D7 | `?ubah=` satu pola (K-P3-10) | Dua implementasi (CC, INA) dengan perilaku sedikit berbeda | Ditunda (CD-9) |
| D8 | Ambang snapshot bawaan 0,02 | `dashboard-hr-*` 0,04, `asisten-panel-karyawan` 0,06 | TL-1 |
| D9 | `ReviewGapQuery` (web) dan `GapRef` (B5) | Dua alias dengan bentuk sama di `api/lna.ts` dan `screens/b5-tna/api.ts` (kompatibel secara struktural) | Disatukan bersama D6 |
| D10 | Ekspor CSV per gap | Filter dijalankan di JS atas semua rencana aktif tenant (`gap.keep`), bukan predikat SQL seperti antrean | Cukup untuk volume pilot; pindah ke SQL bila ekspor membesar |

## Catatan gerbang

- Web: `npm run lint`, `vue-tsc --build`, `npm run build`, Playwright penuh (370 test) hijau. Tidak ada snapshot yang berubah.
- API: `npm run lint` dan jest penuh (1068 test, Postgres) hijau. Satu jalannya jest sempat mencatat satu kegagalan yang tidak muncul lagi di dua jalan berikutnya (database uji dipakai bersama sesi lain); tidak ada test yang gagal konsisten.
- Reviewer Andrian (CLAUDE.md aturan 7): `stores/session.ts`, `components/AppShell.vue`, `ui/format.ts`, `ui/tones.ts`, `ui/UiChip.vue`, `ui/UiStatus.vue`, `db/lna-stores.js`, `main.ts`. Tidak ada migrasi.
