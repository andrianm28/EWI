# P8 · Menerapkan keputusan R1–R22 (paritas mockup)

Bagian dari [rencana paritas](README.md). Keputusan user 23 Nov 2026: **"Terapkan semua rekomendasi"** untuk daftar R1–R22 di README (bagian "Status 23 Nov 2026 (akhir P7)"). Aturan tetap: tampilan 1:1 mockup, keputusan yang sudah tercatat di spek paket (`docs/designs/b*.md`) tidak berubah.

Lingkup: `apps/web` saja. API tidak diubah, tidak ada migrasi, flag tetap seperti sekarang. Layar LIM (`screens/b15-lim`, thread B15) tidak disentuh; butir R yang menyebut gap LIM dicatat sebagai keputusan untuk thread itu. Mockup: `tools/mockup-render/Main.dc.html` (baris disebut `M:<baris>`).

## Ringkasan

| Jenis | Butir |
| --- | --- |
| Diputuskan saja (pertahankan) | R1, R6, R9, R10, R19, R21, R22 |
| Sudah sesuai, tanpa ubah kode | R7, R11, R12, R14, R16 |
| Mengubah kode | R2, R3, R4, R5, R8, R13, R15 (sisa karyawan), R17, R18, R20 |

## Keputusan per butir

### R1 · Akses atasan ke Tinjauan HR (RV-3, TD-6, TN-13)
Keputusan: tetap HR saja (spek B7, PM-5/PM-6). Rute `review` tetap `hr_admin`/`eta_admin`; tombol "Langsung ke tinjauan HR" hanya untuk HR. Tanpa kode. Test yang ada (`tna-gap.spec.ts` "atasan: … tombol tinjauan HR tidak ada") tetap menjadi penjaga.

### R2 · Penugasan wawancara lewat dialog (TD-5, AH-2, AH-3, AA-4)
Keputusan: CTA satu baris seperti mockup; formulir penugasan dibuka di dialog. Perilaku penugasan B5/B10 (body permintaan, validasi, pesan) tidak berubah.

Komponen bersama baru `UiDialog` (`src/ui/UiDialog.vue`): `<dialog>` bawaan dengan `showModal()` (fokus terkurung, latar inert, Esc menutup), judul `h2` sebagai `aria-labelledby`, tombol "Tutup" berikon. Isi dirender hanya saat terbuka. Kode bersama: reviewer Andrian.

| Gap | Layar/berkas | Perubahan |
| --- | --- | --- |
| TD-5 | `screens/b5-tna/TnaGapView.vue` | Kartu "Cari akar masalah" = kartu `--el-primary-container` satu baris (M:540-543): teks kiri; kanan tombol "Mulai wawancara akar masalah" (ikon `forum`) + "Langsung ke tinjauan HR" (outlined, HR saja, R1). Tombol pertama membuka `UiDialog` "Tugaskan wawancara akar masalah" berisi formulir lama (proyek, siapa, karyawan, tenggat, durasi, "Tugaskan wawancara"). Galat formulir tampil di `UiErrorSummary` di dalam dialog; sukses menutup dialog dan pemberitahuan tampil di halaman |
| AH-2 | `screens/b10-core-competencies/AssignmentsHr.vue` | "Tugaskan semua" pindah ke kanan header kartu; field "Batas waktu penugasan baru" hilang dari toolbar. Tombol "Tugaskan" (baris atau semua) membuka `UiDialog` "Tugaskan wawancara pimpinan" dengan field "Batas waktu" (bawaan 14 hari, WIB) dan tombol "Tugaskan" |
| AH-3 | `AssignmentsHr.vue` | Kolom "Batas waktu" dihapus; tenggat jadi teks kecil "Batas {tanggal singkat}" di sel Status |
| AA-4 | `InterviewAssignmentView.vue` (atasan) | Toolbar tanggal hilang; "Tugaskan" per baris dan "Tugaskan semua" (header kartu, dipertahankan agar fitur tidak hilang) membuka dialog yang sama dengan judul "Tugaskan wawancara tim" |

e2e: (1) detail gap: formulir `Tugaskan wawancara` tidak terlihat sebelum tombol ditekan; tombol "Mulai wawancara akar masalah" membuka `dialog` bernama "Tugaskan wawancara akar masalah"; kirim → body sama seperti sebelumnya, dialog tertutup, status "1 wawancara ditugaskan"; galat tenggat tampil di dalam dialog. (2) HR Wawancara AI: tidak ada field "Batas waktu penugasan baru" maupun kolom "Batas waktu"; sel Status Budi memuat tenggat bila ada; "Tugaskan semua" ada di header kartu; dialog → body `{ assigneeIds, dueDate, durationMinutes }`. (3) Atasan: tidak ada field tanggal di toolbar; "Tugaskan Karyawan B" membuka dialog.

### R3 · Chip terisi per layar, `UiStatus` global tetap (K-3, PK-10, X-2, T1)
Keputusan: status di layar yang mockup-nya memakai chip memakai `UiChip` lokal; `UiStatus` (ikon + teks) tetap untuk pesan/status lain dan uji ui-kit.

| Gap | Layar | Perubahan |
| --- | --- | --- |
| K-3 (Pengguna) | `screens/b11-admin/UsersView.vue` | Status = `UiChip` (Aktif `success`, Diundang `training`, Nonaktif `neutral`), M:1173 `chip c-ok` |
| K-3 (Tenant) | `screens/b12-super-admin/TenantsView.vue` | Status tenant = `UiChip` (success/training/neutral/review dari `TENANT_STATUS`), M:1203 |
| K-3, MY-3 (Hasil saya) | `screens/b8-karyawan/MyResultsView.vue` | Mockup memakai titik + teks (`.state`/`.dot`, M:289), bukan chip: titik 10px berwarna token + teks warna teks biasa 12px/500. Teks tetap ada, jadi status tidak bergantung warna |
| X-2/PK-10 | LI, LD sudah (P6/P7); LIM milik B15 | Dicatat untuk thread B15 |
| T1 | `ui/UiChip.vue` | Tidak diubah: warna teks chip tetap `--el-on-*-container` (kontras AA di tema terang dan gelap, kontrak B0). Diputuskan (R3) |

e2e: sel Status Pengguna dan Tenant berisi `.el-chip` "Aktif" tanpa ikon `UiStatus`; tabel Hasil saya berisi titik `.b8-dot` dan tidak berisi `.el-status`.

### R4 · Skor 0–100 tanpa "%", desimal koma (TN-8, DN-10, CV-11)
Keputusan: skor (target/aktual/gap) 0–100 tanpa "%", desimal koma `id-ID`, satu formatter bersama. Persentase sungguhan (kesiapan, kontribusi, progres) tetap ber-"%".

- Formatter baru `src/ui/format.ts`: `formatNumber(n)` (`Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })`) dan `formatScore(n, kosong = '–')`. Akibat locale: titik pemisah ribuan (1250 → "1.250") dan pembulatan ke paling banyak dua angka di belakang koma (93,456 → "93,46"). Triase review independen: NaN/Infinity menjadi "–", `-0` menjadi "0", tanda negatif selalu `−` (U+2212); gap ditampilkan lewat `gapScore` (tanda dari nilai, bukan awalan tetap). Dipakai `api/cca.ts` `fmt`, `screens/b5-tna/labels.ts` `num`, `screens/b8-karyawan/view.ts` `formatNumber`.
- TN-8: `TnaScreen.vue` kolom Target/Aktual "75", bukan "75%"; `TnaGapView.vue` KPI TARGET/AKTUAL/GAP tanpa "%" ("75", "56", "−19"), nilai karyawan memakai formatter.
- OKR: `num` memakai koma ("22,5 menit", bukan "22.50 menit").
- CV-11: `fmt` sudah koma; kini lewat formatter bersama. DN-10: kamus DNA memakai level 0–4 (spek B4, bukan skor) dan tombol "Sahkan kamus" disengaja; Diputuskan (R4).

e2e: tabel gap kompetensi sel Target "75" (bukan "75%"); detail gap KPI TARGET "75"; tabel OKR "22,5 menit".

### R5 · Copy netral tenant (CC-2, CV-3, AH-5, LIM-1)
Keputusan: teks netral tenant, sumber dari data tenant. CC-2 (sumber per kartu dari `sourceRef` tenant), CV-3 ("Skor nilai"), AH-5 ("nilai korporasi") sudah netral. Sisa teks khusus Elitery:
- `CoreCompetenciesView.vue` kartu agen tab nilai: "…tiap nilai 5C…" → "…tiap nilai korporasi…".
- `ProgramForm.vue` petunjuk key "Mis. dna-5c" → "Mis. program-nilai".
- LIM-1 (Scheer IMC) tidak ada di aplikasi; tetap tanpa rujukan pihak ketiga (thread B15).

e2e: kartu agen tab Corporate Values memuat "nilai korporasi" dan tidak memuat "5C".

### R6 · Baris "Belum diwawancarai" dan kolom Orang/Status (TN-4, TN-7, TN-11)
Keputusan: pertahankan. Tanpa ubah kolom. Bagian TN-11 yang bukan keputusan (selisih berwarna merah, mockup `--er`) ikut dirapikan: sel Selisih OKR `color: var(--el-critical)`. Pemilih periode tetap.
e2e: sel Selisih OKR berwarna `--el-critical`.

### R7 · Pratinjau sesi HR (AH-8)
Keputusan: daftar pertanyaan, tanpa LLM, tidak disimpan. Sudah sesuai (`SynthesisCard.vue`: "Pratinjau tidak disimpan", daftar bernomor dari `cca.preview`). Tanpa kode.

### R8 · Label jujur untuk hasil aturan/templat (PK-3, PK-5)
Keputusan: "Insight" dan "templat ELGOS", bukan "Insight AI"/"Agen ELGOS" untuk keluaran aturan/templat.
- PK-3/LI-28: `b13-li/DraftView.vue` intro mengikuti kalimat mockup M:840 dengan subjek jujur: "Templat ELGOS menyusun draf dari tujuan pembelajaran di DACUM Tool 1 (job function) dan Tool 2 (KSA), dengan prinsip instructional design. Anda meninjau tiap tahap sebelum lanjut."
- PK-3/LI-34: baris audit mengikuti susunan M:879: "Templat ELGOS · sumber: DACUM Tool 1 dan Tool 2 · draf perlu persetujuan SME sebelum dipakai".
- PK-3 (intro Permintaan, M:811): "…dengan bantuan agen ELGOS…" → "…dengan bantuan templat ELGOS…" (`b13-li/RequestsView.vue`).
- PK-5/LD-3: LD sudah "Insight" + "bukan oleh AI". LIM-3 milik B15.
- "Agen ELGOS (POC)" di sesi wawancara visi & nilai tetap (LLM sungguhan).

e2e: rancangan modul memuat "Templat ELGOS menyusun draf" dan baris audit "Templat ELGOS"; tidak memuat "Agen ELGOS".

### R9 · Catatan UU PDP (PK-6)
Pertahankan "hanya bisa dibuka oleh HR" (sesuai perilaku). Tanpa kode.

### R10 · Cakupan atasan CP (PK-8)
Bawahan langsung (RG-3). Tanpa kode.

### R11 · Label tier (PK-9)
UI hanya "Advanced"; impor menormalkan alias "Advance" (`apps/api/src/modules/imports/kinds/common.js`). Sudah sesuai. Tanpa kode.

### R12 · EliteMentor di dalam shell (K-1)
Deep link (aturan arsitektur 1). Sudah sesuai: Rencana belajar membuka `launchUrl` di tab baru. Layar EliteMentor mockup tidak dibangun. Tanpa kode.

### R13 · Masukan wawancara (K-2, IV-7, AIV-8)
Keputusan: samakan gaya input saja; pilihan jawaban AI untuk wawancara akar masalah menunggu paket B6.
- `b6-iv/PercakapanWawancara.vue` dan `b10-core-competencies/InterviewSession.vue`: kotak jawaban jadi input satu baris `.el-input` seperti `.inp` mockup (M:575, 655). Placeholder: "Atau ketik jawaban Anda sendiri" bila ada pilihan jawaban, selain itu "Ketik jawaban Anda". Label tersembunyi "Jawaban" tetap.
- AIV-8: tombol pilihan jawaban memakai gaya `.ac` mockup (kotak radius 8, garis `--el-outline`, teks warna teks, latar kartu) lewat kelas lokal `iv-ac` di `iv.css`, bukan `UiButton` outlined pil.

e2e: kotak jawaban IV adalah `input` dengan placeholder "Ketik jawaban Anda"; wawancara visi & nilai: input dengan placeholder "Atau ketik jawaban Anda sendiri" dan pilihan jawaban berkelas `iv-ac` berradius 8px.

### R14 · Galat persetujuan (K-4, IV-2)
`UiErrorSummary` standar. Sudah sesuai (`PersetujuanTna.vue`). Tanpa kode.

### R15 · Breadcrumb karyawan (K-5, IV-6, AIV-1)
Keputusan: ikuti mockup, tanpa tautan bila menu tidak ada. Sesi IV sudah (P3). Sisa di layar karyawan:
- AIV-1: h1 `/aiv` untuk karyawan = "Wawancara AI" (M:602), sama dengan atasan. Judul kartu "Wawancara visi, misi, dan nilai" tetap (M:604).
- `/iv` (daftar sesi, tidak ada di mockup): breadcrumb yang sama dengan sesi, "Training Needs › Wawancara akar masalah" (induk tautan hanya bila `/tna` terbuka).

e2e: karyawan `/aiv` h1 "Wawancara AI" dan breadcrumb tanpa tautan; `/iv` breadcrumb "Training Needs › Wawancara akar masalah" tanpa tautan.

### R16 · "Lihat contoh rekomendasi" (K-6, MY-5)
Hilangkan sampai ada halaman contoh. Sudah sesuai (tombol tidak pernah dibuat). Tanpa kode; e2e penjaga: kartu Rencana belajar kosong tanpa tombol itu.

### R17 · Teks undangan Hasil saya (K-7, MY-2)
Keputusan: ikuti fokus wawancara (KPI belum tercapai). `MyResultsView.vue`: "**Undangan wawancara:** ada 1 wawancara singkat tentang target kerja (KPI) Anda yang belum tercapai. Hasilnya dipakai untuk menyusun rencana belajar, bukan untuk penilaian kinerja." + tenggat bila ada. Satu catatan per undangan (data per sesi), jadi "ada 1". Durasi tidak dikirim API untuk undangan, jadi "(±10 menit)" tidak ditulis.
e2e: catatan undangan memuat "target kerja (KPI) Anda yang belum tercapai" dan tidak memuat "hambatan kerja".

### R18 · Label model AI (K-8, PLT-2 bagian model)
Keputusan: tenant melihat label produk "ELGOS-AI (POC)"; ID penyedia hanya untuk Super Admin.
- Konstanta `AI_PRODUCT_LABEL = 'ELGOS-AI (POC)'` di `src/api/ai.ts` (satu sumber label produk, lihat triase T1).
- `b6-iv/IvSessionView.vue` baris audit: "model ELGOS-AI (POC)" seperti M:592 (API tetap mengirim `aiLabel` tanpa ID model, A11).
- `b12-super-admin/PlatformView.vue` kartu "Model AI wawancara": deskripsi muted mockup "Versi model dan skrip wawancara yang tersedia untuk tenant.", chip netral "ELGOS-AI (POC)", chip `review` "Kesepakatan AI–HR ≥ {target}% (kriteria pilot)"; ID penyedia sebagai teks kecil mono "ID penyedia (hanya Super Admin): {provider} · {model}".

e2e: sesi IV memuat audit "model ELGOS-AI (POC)"; Konfigurasi platform memuat chip "ELGOS-AI (POC)", chip kesepakatan, dan baris ID penyedia.

### R19 · Peran saat mengundang (K-9)
Pertahankan perilaku aplikasi. Tanpa kode.

### R20 · Kalimat vendor (PK-1, LI-4, LI-24)
Keputusan: pindah ke petunjuk kecil di bawah tombol.
- `b13-li/LibraryView.vue`: paragraf di bawah catatan Pareto dihapus. Di panel detail modul, di bawah baris "Minta ke {vendor}" / "Kembangkan dengan ELGOS" tampil petunjuk 12px `li-hint` (id, dirujuk `aria-describedby` tombol Minta): "Tombol Minta hanya mencatat permintaan di ELGOS; ELGOS tidak mengirim apa pun ke {vendor}."
- `b13-li/RequestsView.vue`: catatan alur kembali ke kalimat mockup "Alur: diminta → dikonfirmasi {vendor} → modul dikirim → dipasang di EliteMentor."; kalimat "HR mencatat tiap langkah; ELGOS tidak mengirim apa pun ke {vendor}." menjadi satu petunjuk 12px `li-hint` di bawah daftar permintaan (tepat di bawah tombol langkah terakhir), hanya bila ada permintaan aktif (triase T2).

e2e: Library tidak lagi memuat paragraf "Tombol \"Minta\" hanya mencatat" di bawah Pareto; detail modul memuat petunjuk di bawah tombol, tombol Minta `aria-describedby` menunjuk petunjuk itu; Permintaan: catatan alur sama dengan mockup.

### R21 · Wizard baca/sunting (PK-4)
Sunting tetap, dengan simpan otomatis (K-P6-5). Tanpa kode.

### R22 · Atasan di tab Pengukuran AI (PK-7)
Diputuskan thread B15. Layar LIM tidak disentuh.

## Checklist file

- `apps/web/src/ui/UiDialog.vue` (baru), `ui/format.ts` (baru), `ui/index.ts`
- `apps/web/src/api/ai.ts` (baru), `api/cca.ts`
- `apps/web/src/screens/b5-tna/{TnaGapView,TnaScreen}.vue`, `labels.ts`, `tna.css`
- `apps/web/src/screens/b10-core-competencies/{AssignmentsHr,InterviewAssignmentView,InterviewSession,CoreCompetenciesView,ProgramForm,ProgramSection}.vue`, `AssignDueDialog.vue` (baru), `cc.css`
- `apps/web/src/screens/b6-iv/{PercakapanWawancara,IvSessionView,IvListView}.vue`, `crumbs.ts` (baru), `iv.css`
- `apps/web/src/screens/b8-karyawan/{MyResultsView.vue,view.ts,b8.css}`
- `apps/web/src/screens/b11-admin/UsersView.vue`, `b12-super-admin/{TenantsView,PlatformView}.vue`
- `apps/web/src/screens/b13-li/{DraftView,LibraryView,RequestsView}.vue`, `li.css`
- Di luar butir R, ikut tersentuh: `e2e/core-competencies.spec.ts` assert POST tidak stabil diganti `expect.poll` (bukan perubahan perilaku); warna kartu CTA `.tna-cta` memakai `--el-primary-container`/`--el-on-primary-container` (gaya kartu `--pc` mockup)
- Triase review independen: `shell/menu.ts` (`menuContext`, `menuShows`), `components/AppDrawer.vue`, `b10-core-competencies/focus.ts` (baru), `ui/UiDialog.vue` (fokus awal, Tab berputar, `--el-scrim`), `style.css` (`--el-scrim`), `components/AppShell.vue`, `b5-tna/TnaMySessions.vue` (baru, keputusan user 23 Nov), `b17-asisten/ShellExtra.vue` (keputusan user 23 Nov), `b6-iv/api.ts`
- Test e2e berawalan "P8" di `apps/web/e2e/{tna-gap,core-competencies,cca-wawancara,iv,b8-karyawan,admin-tenant,super-admin,li}.spec.ts`, plus test lama yang bergantung pada formulir/teks lama

## Review spek (mandiri) dan triase

Lensa egm-design:
- Kesetiaan mockup: tiap perubahan menunjuk gap dan baris mockup. Dua penyimpangan sadar: (a) atasan tetap punya "Tugaskan semua" (mockup tidak), agar fitur B10 tidak hilang; (b) Hasil saya memakai titik, bukan chip, karena mockup memang titik.
- Aksesibilitas: `<dialog>` modal bawaan memberi perangkap fokus dan Esc; judul terhubung `aria-labelledby`; fokus kembali ke tombol pembuka saat ditutup (perilaku bawaan `showModal`). Ringkasan galat di dalam dialog (galat halaman tertutup latar modal tidak terbaca). Titik status disertai teks. Petunjuk vendor dirujuk `aria-describedby`.
- Token: hanya `--el-*`; kartu CTA `--el-primary-container`/`--el-on-primary-container` (kontras AA di dua tema).

Lensa egm-implementation-readiness:
- Data: semua perubahan memakai data yang sudah ada (tenggat pimpinan `dueDate`, `display.aiModel`, `aiHrAgreementTarget`). Tidak ada perubahan API.
- Risiko: test lama mencari formulir penugasan langsung di halaman, field "Batas waktu penugasan baru", textarea jawaban, teks "hambatan kerja", "Draf awal disusun", "22.50". Semua disesuaikan di komit implementasi.
- Snapshot: tidak ada layar bersnapshot yang berubah (dashboard, shell, ui-kit, tinjauan, asisten) kecuali bila formatter mengubah angka dashboard; dashboard memakai formatnya sendiri dan tidak disentuh.

Triase temuan review spek:

| # | Temuan | Keputusan |
| --- | --- | --- |
| T1 | Draf R18 sempat menaruh konstanta label di `ui/format.ts`; label produk bukan urusan format | Diperbaiki: `src/api/ai.ts` |
| T2 | Draf R20 ragu antara petunjuk per permintaan dan satu petunjuk | Diputuskan: satu petunjuk di bawah daftar permintaan aktif (tidak berulang per baris), tepat di bawah tombol langkah terakhir |
| T3 | Input satu baris untuk jawaban panjang | Diterima: mockup memakai input; panjang jawaban tidak dibatasi tampilan (input menggulir). Batas 2000 karakter AIV tetap |
| T4 | `UiDialog` belum tampil di halaman ui-kit | Diterima untuk P8 (menambah ke ui-kit mengubah snapshot ui-kit); dicatat di code review |
