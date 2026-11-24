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

P9 (branch `paritas-p9` dari `ea7d1c4`, 24 Nov). Perbaikan perilaku dikerjakan test-first: commit test merah lebih dulu, lalu perbaikannya (pasangan merah → hijau di kolom terakhir). Smell Standards diberi nomor SM-1..SM-9 sesuai urutan di daftar di atas. Selisih spek dan kode setelah P9: [p9-drift.md](p9-drift.md).

| ID | Keputusan | Alasan / commit |
| --- | --- | --- |
| S-1 | Perbaiki | Rute `tna-review` memasang `views: ['hr','admin','super']` (sama dengan `review`); tautan dari tampilan Atasan memindahkan tampilan ke HR. e2e akun HR + atasan. `2873a3c` → `c5aabc3` |
| S-2 | Tunda | Butuh persetujuan Andrian (B0 5.3 aturan 1, kode bersama). `views` admin/hr/super tetap; alasan `hr` dan `super` serta penyimpangannya ditulis di komentar `b11-admin/routes.ts` (`d2d3a7c`). Masuk daftar reviewer di badan PR |
| S-3 | Tunda | Belum ada token bayangan untuk panel melayang. Usul ke B0: token `--el-shadow-float` (terang/gelap) untuk panel Asisten dan pengingat INA; setelah itu dua `box-shadow` mentah diganti |
| S-4 | Tunda | Belum ada komponen Ui untuk chip pilihan bebas. Usul ke B0: `UiChoiceChip` (tombol chip netral, `disabled`, fokus) untuk `b17-chip`, `iv-ac`, `cp-pick`, dan pemilih jabatan di `ProgramView.vue` |
| SM-1 | Perbaiki | `GAP_MATCH_COLUMNS` di `tna/gaps.js` menurunkan SELECT `GAP_MATCH_COLS` dan daftar field internal yang dibuang. `75a0384` |
| SM-2 | Perbaiki | `withoutGapFields` dan `withoutDetail` memakai satu `omit(fields)`. `b519b5e` |
| SM-3 | Perbaiki | Normalisasi nama SQL kini setara `metricKey` (CD-11); `parseGapQuery` hanya merapikan label, kunci tetap dari `metricKey`. `7f5dd1b` → `656bb1f` |
| SM-4 | Perbaiki | `hasGapFilter(req)` dipakai `gapFilterOf` dan gerbang flag `GET /review`. `75a0384` |
| SM-5 | Tunda | Data clump `focus*`: membungkusnya menjadi objek menyentuh baris store, `sessionGapKeys`, dan `linkSessions` di B5. Ditunda ke tipe `Gap` bersama (B5 §15, sudah ditunda ke S2); sumber kolom kini satu (SM-1) |
| SM-6 | Perbaiki | `ReviewGapQuery` menjadi union bertipe (bentuk `GapRef`), tanpa cast `unknown`. `656bb1f` |
| SM-7 | Perbaiki | `ChipTone`/`StatusTone` di `ui/tones.ts`, dipakai UiChip, UiStatus, B8, B13, B14, B15, B16. `75a0384` |
| SM-8 | Tunda | Nada mode online/offline: B8 menerima `mode` string bebas dari API, B14 enum; warnanya sudah sama (training/improvement). Menyatukan butuh modul lintas paket; nilai kecil, risiko impor lintas layar |
| SM-9 | Tolak | `gapFilterOf.keep` mengikat kunci gap; menghapusnya menyebar `findingsInGap(rows, key)` ke tiga pemanggil (antrean, solusi, ekspor). Bukan middle man murni |
| SP-1 | Perbaiki | AA-4, TN-10, IN-11, ADM-1 menjadi Diputuskan; hitungan README dikoreksi. `d2d3a7c` |
| SP-2 | Tunda | LI-14 kembali Terbuka: chip "Contoh (dummy)" menyebut data contoh yang tidak ada di aplikasi; perlu keputusan user (label jujur atau 1:1). `d2d3a7c`. 24 Nov: user memilih label jujur (hijau/netral); LI-14 Diputuskan, e2e penjaga ditambah |
| SP-3 | Tunda | LD-10 kembali Terbuka: placeholder tanggal tidak bisa tampil di `input type=date`; butuh input teks + parser (bukan kecil) atau keputusan. `d2d3a7c` |
| SP-4 | Perbaiki | `competencyId` baris Pareto ditulis di B3; perubahan `parseGapQuery` ditulis di B5. `AdminLinks.vue` sudah diterima user di triase P7 (dicatat di baris ADM-1). `d2d3a7c` |
| SP-5 | Perbaiki | B7 web Keputusan 2/3 mengikuti R1 dan audit 39-2; komentar `b7-tinjauan/routes.ts` diperbarui. `c5aabc3`, `d2d3a7c` |
| IR-1 | Perbaiki | `ShellExtra` asisten memetakan halaman API `review` ke rute antrean `tna-review` (sama dengan dashboard); API dan test-nya tidak berubah. e2e HR + `tna.review_workspace`. `b867ce0` → `faeb034` |
| IR-2 | Tunda | Gerbang reviewer Andrian (auth UI, kode bersama, `lna-stores.js`, `ci.yml`, kini juga `session.ts`, `AppShell.vue`, `ui/`) adalah butir badan PR, bukan kode |
| IR-3 | Perbaiki | Judul tab pindah ke `shell/title.ts` (dipasang `main.ts`); `router/index.ts` tidak mengimpor `shell/menu.ts`. `0c60047` |
| IR-4 | Perbaiki | Test `/tna/gaps/detail`: nama berspasi berantakan membuka gap yang sama; > 255 karakter 400. Perilaku ditulis di B5. `acc8b85`, `d2d3a7c` |
| IR-5 | Perbaiki | `GET /plan-items/export.csv` menerima filter gap (validasi dan 404 sama dengan `/review`); layar per gap mengirimnya, label tombol tetap jujur. Jest + e2e. `7f5dd1b` → `656bb1f` |
| IR-6 | Perbaiki | Baris README basi (ShellExtra, `ReviewView.vue`, RV-3) dan komentar `'super'` B11 (`d2d3a7c`); `waitForTimeout(1200)` diganti menunggu respons Pareto (`6ac19f3`). Ambang snapshot dan riwayat git: TL-1, TL-2 |
| CD-1 | Perbaiki | `onBeforeRouteLeave` draf LI tidak menyimpan bila sesi tidak ada atau tujuan rute publik, dan tidak menahan navigasi setelah 401. Dua e2e (Keluar, sesi habis). `af4f4f9` → `8ef75d4` |
| CD-2 | Perbaiki | `AppShell` menumpuk semua `ShellExtra` dalam satu kolom fixed kanan bawah; kontrak di B0 5.3. e2e kedua flag dengan `boundingBox`. `9a2397b` → `fb4b87e` |
| CD-3 | Perbaiki | Semua cabang `classify` memakai `withoutDetail` (endpoint hanya dipakai layar per gap; antrean memakai `/review`). Jest. `b474bc2` → `b519b5e` |
| CD-4 | Perbaiki | `session.hasAnyRole` di TnaScreen, TnaPengelolaan, TnaGapView, papan B5. e2e akun atasan utama + HR. `2873a3c` → `c5aabc3` |
| CD-5 | Perbaiki | Sama dengan S-1. `c5aabc3` |
| CD-6 | Perbaiki | Tautan ke antrean memakai `{ name: 'tna-review' }`. `c5aabc3` |
| CD-7 | Perbaiki | `EMPTY` dan `formatPercent` di `ui/format.ts`; Dashboard, Konfigurasi platform, label B15, `fmt` CCA, dan sel kosong lain memakainya. Biaya US$ tetap `toLocaleString` (empat desimal). `6adaeb0` |
| CD-8 | Perbaiki | `AI_NAME` ("ELGOS-AI") untuk gelembung IV, CCA, LIM; audit CCA memakai `AI_PRODUCT_LABEL`. Teks e2e diperbarui, snapshot tidak berubah. `6adaeb0` |
| CD-9 | Tunda | `?ubah=` CC dan INA berbeda perilaku (INA menunggu daftar dimuat dan membuang id tak dikenal); menyatukan berisiko regresi di dua paket milik thread lain. `.mod` dan pembungkus notice juga per paket; dikerjakan bersama komponen B0 (S-4) |
| CD-10 | Perbaiki | Sama dengan IR-3. `0c60047` |
| CD-11 | Perbaiki | Predikat SQL memakai kelas spasi lengkap (tab, NBSP, spasi Unicode) seperti `\s` JavaScript. Jest. `7f5dd1b` → `656bb1f` |
| CD-12 | Perbaiki | `loadSeq` di TinjauanView (pola `listSeq`) dan `askSeq` di store asisten (jawaban basi dibuang walau kunci tampilan kembali sama). Dua e2e. `a8af4cf` → `4db02a4` |
| CD-13 | Perbaiki | `waitForTimeout` diganti (`6ac19f3`); ambang snapshot di TL-1 |
| TL-1 | Tunda | Menurunkan ambang ke 0,02 butuh PNG dari runner CI (artifact `e2e-test-results`); di luar sesi ini |
| TL-2 | Tunda | Menulis ulang riwayat git repo publik adalah keputusan user/Andrian |

Jumlah: Perbaiki 27, Tolak 1, Tunda 11 (39 ID).

## Review 24 Nov

Review ulang head `fd7bda2` (empat reviewer: egm API, egm web, Spec, Standards; tanpa P0/P1). Perilaku dikerjakan test-first; kode yang sudah benar tetapi belum diuji mendapat test cakupan (langsung hijau).

| Temuan | Tingkat | Hasil | Catatan / commit |
| --- | --- | --- | --- |
| Cabang SQL gap OKR lewat fokus sesi tidak diuji (`lna-stores.js` reviewQueue) | P2 | Diperbaiki | Jest route + store reviewQueue dengan sesi `focus_kind='okr'` tanpa kompetensi/baris kinerja, termasuk temuan tertaut kompetensi yang tidak ikut (R6). `8430693` |
| `/review/solutions` dan `export.csv` memuat dan mendekripsi semua temuan lalu memfilter gap di JS | P2 | Diperbaiki | `gapSql` satu predikat untuk reviewQueue, listReviewedForSolutions, listPlanExport; `findingsInGap` tetap pemutus pasti. Jest store merah → hijau. `8430693` |
| DraftView: Kembali/Lanjut tanpa penjaga busy, klik ganda melompati langkah | P2 | Diperbaiki | `go()` kembali bila busy, tombol `:disabled="busy"`. e2e merah → hijau. `73d6c81` |
| DraftView: simpan otomatis gagal menahan navigasi tanpa jalan keluar | P2 | Diperbaiki | UiDialog "Tinggalkan tanpa menyimpan?" (Tetap di sini / Tinggalkan tanpa menyimpan). e2e merah → hijau. `73d6c81` |
| `asisten.spec.ts` uji jawaban basi memakai jeda 300 ms + asersi negatif | P2 | Diperbaiki | `waitForResponse` respons lambat lalu pertanyaan pembatas. `afdf173` |
| `asisten.spec.ts` cek "tanpa POST" sinkron | P3 | Diperbaiki | `expect.poll` dengan pembatas positif (POST pertama harus pertanyaan berikutnya). `afdf173` |
| `parseGapQuery` menerima periode berisi spasi saja | P3 | Diperbaiki | `!q.period.trim()`, sama dengan `parseGap`. Jest merah → hijau. `8430693` |
| Join `users` (u, r, hb) di REVIEW_FROM dan solusi tanpa `tenant_id` | P3 | Diperbaiki | `AND x.tenant_id = f.tenant_id`. Jest merah → hijau (nama pengguna tenant lain tidak bocor). `8430693` |
| Cabang reclassify di uji respons classify | P3 | Diperbaiki | Kasus approved → improvement ditambah ke "semua cabang". `8430693` |
| JSDoc yatim `gaps.js` dan `review-workspace.js` | P3 | Diperbaiki | Dipindah ke atas fungsinya. `8430693` |
| Dashboard: `aria-label` baris Pareto menimpa teks tautan | P3 | Diperbaiki | Dihapus; e2e memeriksa nama aksesibel dari teks yang terlihat. Membalik keputusan review P3 sebelumnya. `afdf173` |
| TinjauanView teks sukses "{n} temuan diteruskan…" berbeda dari mockup | Spec (b) 5 | Diperbaiki | Kini persis mockup `makeIna`: "{n} tindakan perbaikan dibuat dan muncul di Improvement Needs."; spek B7 HR butir 6 dan B7 web butir 9 diperbarui. `afdf173` |
| Spek B7: filter gap "Tanpa flag", solusi tanpa parameter gap | P3 | Diperbaiki | `b7-tinjauan-hr.md` butir 1 (403 tanpa flag) dan 3 (parameter gap, `gapSql`) |
| Spek B17 web: FAB fixed 24px, panel 380×560 basi setelah CD-2 | Spec (a) 2 | Diperbaiki | `b17-asisten-web.md` mengikuti `.el-app__extras` dan `flex: 0 1 560px` |
| DraftView `act` menimpa draf lokal dengan respons | P3 | Terbuka | Ketikan selama simpan bisa hilang; perlu readonly saat busy atau gabung metadata saja |
| Dialog AssignmentsHr, InterviewAssignmentView, TnaGapView bisa ditutup saat request berjalan | P3 | Terbuka | Di luar lingkup putaran ini |
| AntreanView tab tanpa penjaga urutan respons | P3 | Terbuka | Pola `loadSeq` seperti TinjauanView |
| Spec (a) 1 LD-10, (a) 3 LIM-6/LIM-8, (b) 4/6/7 | Spec | Terbuka | LD-10 sudah tercatat (SP-3); sisanya menunggu keputusan user |
| Standards: nama branch, gerbang reviewer Andrian, smell duplikasi/switch | Standards | Terbuka | Butir badan PR (IR-2) dan refactor terpisah |

### Review egm atas perbaikan 24 Nov

Review independen atas empat commit di atas (tanpa P0/P1).

| Temuan | Tingkat | Hasil | Catatan / commit |
| --- | --- | --- | --- |
| DraftView: penjaga keluar mengabaikan `busy`; PUT kedua bersamaan, `error` dibaca dari tindakan yang salah, `leaveTarget` basi | P2 | Diperbaiki | `act` mengembalikan true/false dan menyimpan promise berjalan; penjaga menunggunya, hanya navigasi terakhir yang membuka dialog. e2e "keluar saat simpan berjalan" merah (2 PUT) → hijau. `32b3e30` |
| `router.push(...).catch` tidak pernah jalan (NavigationFailure di-resolve) | P3 | Diperbaiki | `isNavigationFailure`. `32b3e30` |
| Setelah Back peramban, "Tinggalkan" mendorong `to.fullPath` (entri riwayat ganda) | P3 | Diperbaiki | `router.options.history.listen` mencatat `delta`; Tinggalkan memanggil `router.go(delta)`. e2e memeriksa `history.length` tetap, merah → hijau. `32b3e30` |
| Dialog tanpa pesan galat API; ringkasan galat diumumkan bersamaan | P3 | Diperbaiki | Pesan API di dialog (UiNote critical); UiErrorSummary disembunyikan selama penjaga bekerja atau dialog terbuka. `32b3e30` |
| `release()` tidak di `finally`; uji klik ganda tidak menguji penjaga `go()` sendiri | P3 | Diperbaiki | `release()` di `finally`; dua klik sinkron dalam satu tugas peramban (sebelum tombol dirender nonaktif). Diverifikasi dengan mutasi: tanpa `if (busy.value) return` test gagal. `32b3e30` |
| `dashboard.spec.ts` regex nama aksesibel tidak berjangkar | P3 | Diperbaiki | Regex penuh `^…$`. `32b3e30` |
| `metricKeySql`: `lower()` Postgres bergantung locale database | P2 | Diperbaiki | DB uji lokal `C.UTF-8` (libc) dan image deploy `en_US.utf8`; keduanya berbeda dari `toLowerCase` untuk İ. `lower(... COLLATE "und-x-icu")`, tanpa migrasi; syarat ICU dicatat di spek B7 butir 3. Jest non-ASCII merah → hijau. `f10dc32` |
| Temuan uji fokus sesi tidak dihapus | P3 | Diperbaiki | Dibuat dan dihapus di test itu sendiri (`finally`). `f10dc32` |
| Tidak ada test yang gagal bila `gap.keep` dihapus | P3 | Diperbaiki | Temuan disetujui tertaut kompetensi di sesi berfokus OKR: store memuatnya, solusi dan ekspor membuangnya. Diverifikasi dengan mutasi (tanpa `gap.keep` test gagal). `f10dc32` |
| Uji reclassify `409 ALREADY_ACTIONED` | P3 | Ditolak | Sudah diuji di "koreksi salah klik" (classify setelah rencana dibuat → `ALREADY_ACTIONED`) |
| Route `export.csv` dengan gap OKR lewat fokus sesi | P3 | Diperbaiki | Bagian dari test fokus sesi. `f10dc32` |
| Join `users` lain tanpa `tenant_id` (listFindings, listNonTrainingSummary, nonTrainingGrants, listPlanItems, getPlanItem) | P3 | Diperbaiki | Satu test store merah → hijau. `f10dc32` |
| Join `lna_competencies`, `lna_performance_records`, `lna_findings` di listFindings, listNonTrainingSummary, listPlanItems, listImprovementHandoffs tanpa `tenant_id` | P3 | Terbuka | Ditemukan saat mengerjakan butir di atas; pengerasan yang sama, di luar daftar review ini |
