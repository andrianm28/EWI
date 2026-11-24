# Review ulang penuh PR #39 (24 Nov 2026)

Diminta user 24 Nov 09.32 WIB ("ya", setelah pertanyaan apakah sudah direview dengan skill egm dan Matt Pocock).
Titik tetap: `origin/claude/project-thread-scbrmb` (10c91a6), head `e9b34f3`, 80 commit, 125 file di `apps/`, `tools/`, `.github/` (dokumen sebagai konteks, PNG dikecualikan).

Dijalankan dari sesi induk, empat reviewer paralel yang terpisah:
- `mattpocock-skills:code-review` sumbu **Standards** (CLAUDE.md + B0 + baseline smell Fowler)
- `mattpocock-skills:code-review` sumbu **Spec** (README paritas, spek P2–P8, B7, B17, gaps-*.md)
- `egm:egm-codebase-details`
- `egm:egm-implementation-readiness`

Temuan dicatat apa adanya; triase dan perbaikan ada di bagian "Triase" di bawah.

## Standards
Tidak ada pelanggaran keras CLAUDE.md aturan 1, 2, 4, 5, 6, 7. Filter gap di `GET /tna/review` di balik `tna.review_workspace`.
- S-1 (keras, kecil) `b7-tinjauan/routes.ts`: rute `/m/tna/review` tanpa `views` (B0 §5.3 aturan 2).
- S-2 (keras menurut teks, terdokumentasi) `b11-admin/routes.ts`: `views` admin/hr/super vs menu `['admin']` (B0 §5.3 aturan 1). Perlu persetujuan Andrian.
- S-3 (penilaian) `b17-asisten/ShellExtra.vue` box-shadow warna mentah; belum ada token bayangan.
- S-4 (penilaian) `<button>` mentah bergaya sendiri: `b17-chip`, `iv-ac`, `cp-pick`, `ProgramView.vue`.
- Smell: duplikasi `GAP_MATCH_COLS`/`GAP_MATCH_FIELDS`, `withoutGapFields`/`withoutDetail`; normalisasi nama tiga kali (SQL, `metricKey`, `parseGapQuery`); cek `req.query.kind` dua kali; data clump lima kolom `focus*`; `ReviewGapQuery = Record<string,string>`; `Tone` dan pemetaan mode online/offline terduplikasi (b13/b14/b8); `gapFilterOf.keep` middle man.

## Spec
52 baris Ditutup diperiksa dan punya kode nyata. Dua keputusan user 23 Nov ada.
- SP-1 Label salah: AA-4, IN-11, TN-10, ADM-1 bertanda Ditutup padahal perilaku aplikasi dipertahankan → seharusnya Diputuskan; hitungan README terlalu tinggi.
- SP-2 LI-14: chip kuning "Contoh (dummy)"/hijau "Kamus tersedia" diganti "Belum tersedia" netral tanpa keputusan.
- SP-3 LD-10: placeholder "Tanggal, mis. 20 Jan 2027" tidak ada (input `type=date`).
- SP-4 Scope: `parseGapQuery` kini merapikan spasi dan membatasi 255 karakter juga untuk `/tna/gaps/detail`; `AdminLinks.vue` tanpa padanan mockup; `competencyId` di baris Pareto belum ditulis di spek B3.
- SP-5 Spek B7 Keputusan 3 (baris ~41) masih "tetap tanpa flag", bertentangan dengan triase audit 39-2; komentar `b7-tinjauan/routes.ts` masih "RV-3 menunggu keputusan" padahal R1 diterapkan.

## egm-implementation-readiness
- IR-1 **tinggi** `b17-asisten/ShellExtra.vue` `go()` + `assistant/facts.js:91` `page:'review'`: nama rute `review` kini layar per gap `/tna/tinjauan`; tombol "Buka Tinjauan HR" asisten membawa HR ke "Alamat gap tidak lengkap". Dashboard sudah dipetakan ke `tna-review`, asisten belum.
- IR-2 sedang: gerbang reviewer Andrian (auth UI, kode bersama, `lna-stores.js`, `ci.yml`).
- IR-3 sedang: impor melingkar `shell/menu.ts` ↔ `router/index.ts`.
- IR-4 sedang: perubahan `parseGapQuery` untuk `/tna/gaps/detail` tanpa test.
- IR-5 sedang: tombol CSV di layar per gap mengekspor semua gap tenant.
- IR-6 rendah: ambang snapshot 0,04/0,06 (TL-1); README baris ~31/41 basi (ShellExtra "belum", `ReviewView.vue` sudah dihapus); TL-2 riwayat git; `waitForTimeout(1200)` di li.spec; komentar `b11-admin/routes.ts` soal `'super'`.

## egm-codebase-details
- CD-1 sedang `b13-li/DraftView.vue:34` + `AppTopBar.vue:42`: keluar menghapus token lalu `onBeforeRouteLeave` menyimpan draf, gagal, navigasi dibatalkan; pengguna tertahan di layar draf.
- CD-2 sedang: FAB asisten (z 50) menutupi tombol "Buka" pengingat INA (`b9-ina/ShellExtra.vue`, posisi fixed sama).
- CD-3 sedang `review-workspace.js:127` + `TinjauanView.vue:79`: respons `classify` mengembalikan `detail`/`originalDetail`/`summaryNote` ke layar per gap (PO-6); tidak teruji.
- CD-4 rendah: `TnaScreen.vue`/`TnaPengelolaan.vue` memakai `session.role` bukan `session.roles` (B0 5.1).
- CD-5 rendah: `tna-review` tanpa `meta.views` (sama dengan S-1).
- CD-6 rendah: path `/m/tna/review` ditulis langsung.
- CD-7 rendah: format angka melewati `ui/format.ts` (DashboardView, PlatformView, b15 labels, cca.ts); glyph kosong tidak seragam.
- CD-8 rendah: label AI tidak seragam ("ELGOS AI", "ELGOS-AI", "Agen ELGOS (POC)").
- CD-9 rendah: duplikasi `?ubah=` (RequirementsTab/ImprovementNeedsView), `.mod`, notice `role=status`.
- CD-10 rendah: impor melingkar (sama dengan IR-3).
- CD-11 rendah: normalisasi SQL vs `metricKey` JS berbeda untuk tab/NBSP.
- CD-12 rendah: tanpa penjaga urutan respons di `TinjauanView` (watch fullPath) dan `b17-asisten/store.ts` ask.
- CD-13 rendah: `waitForTimeout(1200)`; ambang snapshot (sama dengan IR-6).

Ringkas: Standards 4 temuan + 7 smell (terburuk S-1/S-2, `views` rute). Spec 5 temuan (terburuk SP-1 label Ditutup yang seharusnya Diputuskan). egm 1 tinggi (IR-1), 7 sedang.

## Triase
(diisi saat perbaikan)
