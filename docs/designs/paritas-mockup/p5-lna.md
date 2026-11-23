# P5 · LNA: tabel CC/INA kembali ke kolom mockup, sintesis CCA berupa daftar tema, Pengelolaan TNA dipindah

Bagian dari [rencana paritas](README.md). Lingkup: gap grup LNA ([gaps-lna.md](gaps-lna.md)) untuk Core Competencies (CC, CV, AH), Wawancara AI atasan (AA), Developmental Needs (DN), Training Needs (TN), dan Improvement Needs (IN). Tinjauan HR (RV, B7) dan detail gap (TD) tidak disentuh. Butir yang ditandai "perlu keputusan" dilewati.

Acuan domain: [B10](../b10-core-competencies.md) (bagian 11 dan 13), [B5](../b5-training-needs.md) bagian 16, [B9](../b9-improvement-needs.md), [B4](../b4-developmental-needs.md), B0 bagian 4 dan 5.3. Keputusan user 23 Nov: tata letak, copy, dan komponen ikut mockup 1:1; fitur kelola tambahan dipindah ke pola tersembunyi, tidak dibuang.

## Tujuan

1. Tabel persyaratan CC (Vision & Mission dan Values) hanya punya lima kolom mockup dan muat di 1280 px. Status validasi, Validasi, Tolak, dan definisi pindah ke panel ubah yang dibuka dengan klik baris (`?ubah=<id>`, sudah ada sejak P3).
2. Kartu sintesis CCA menjadi daftar tema mockup; isi nilai aktual dari sintesis dan pratinjau karyawan tetap ada sebagai aksi sekunder.
3. `/tna` dengan papan gap menyala hanya berisi papan (3 tab). Pengelolaan TNA lama pindah ke rute `/tna/kelola` dan memakai token/komponen `Ui*`, tanpa kelas Tailwind.
4. Tabel INA tujuh kolom mockup muat di 1440 dan tetap terbaca di 1280; tombol Ubah dan "Verifikasi lewat AI" pindah ke panel ubah (klik baris), pola yang sama dengan CC.
5. Breadcrumb "Learning Needs Analysis › Wawancara AI" di `/aiv`.
6. Butir copy/urutan/komponen bobot sedang/rendah yang murni paritas di layar yang sama.

## Layar mockup

`tools/mockup-render/Main.dc.html`: CC VM 305–329 (`.r-cc` baris 109: `minmax(0,2.2fr) 70px 70px 1.6fr 140px`), CC Values 331–384, Wawancara AI HR 599–625 (sintesis 619–624), atasan 600–601 dan 627–637, DNA 386–465, TNA 474–520, INA 704–721 (`.r-ina` baris 91). Foto: `mock-shots/hr--cc--vm`, `hr--cc--val`, `hr--cc--aiv-list`, `atasan--aiv--list`, `karyawan--aiv--list`, `hr--tna--*`, `hr--ina`, `hr--dna--*`.

## Gap yang ditutup

| Gap | Layar | Perbaikan |
| --- | --- | --- |
| CC-3 | `/cc` VM dan Values | Kolom: nama, Target, Aktual, Gap, Klasifikasi. Definisi, status validasi, Validasi, Tolak pindah ke panel ubah (klik baris / `?ubah`). Tabel tanpa gulir horizontal di 1280 |
| CC-4 | kartu sumber | KPI kesiapan tanpa bingkai, rata kanan (markup lokal `cc-kpi-plain`, kelas `el-kpi__*`; `UiKpiCard` bersama tidak diubah) |
| CC-5 | sel Gap | Lebar bar = gap/35 (maks 100%); merah bila gap ≥ 20, selain itu primer |
| CC-6 | KPI VM | Note "persyaratan kompetensi" / "indikator perilaku" (tanpa "yang sudah diukur") |
| CV-7 | Values KPI | Tiga KPI (Kesiapan, Nilai dengan gap terbesar, Di bawah target), grid 3 |
| CV-8 | Kesiapan per nilai | Bar hijau (`success`) bila ≥ 80, merah bila < 80 |
| CV-9 | Values kartu nilai | Label "Kesiapan" |
| CV-10 | Values | Paragraf pengantar dihapus (note bawah tetap, lihat K-P5-6) → Sebagian |
| AH-1 | `/cc?tab=aiv` KPI | Kartu ke-3 "Karyawan selesai", ke-4 "Tema tersintesis" (dari sintesis); "Karyawan ditugaskan" jadi note kartu ke-3 |
| AH-6 | Sintesis | Daftar tema: nama + chip sumber (netral), teks mono kanan "pimpinan sepakat X% · karyawan sejalan Y% · gap −Z", bar lebar = Y, merah bila gap ≥ 20. Tombol: "Lihat Vision & Mission", "Lihat Corporate Values" (tonal), "Pratinjau sesi pimpinan" (outlined). KPI ganda dihapus. "Isi dari sintesis" dan pratinjau karyawan pindah ke bagian lipat "Kelola nilai aktual dan pratinjau" |
| AH-7 | Sintesis subjudul | Copy mockup |
| AH-9 | Sintesis data tak lengkap | Respons tanpa `themes` menampilkan pesan galat, bukan kartu rusak |
| AA-1 | `/aiv` | `UiBreadcrumb` "Learning Needs Analysis › Wawancara AI" (atasan dan karyawan, mockup `aivStandalone`) |
| AA-2 | kartu wawancara pimpinan | Satu baris: teks kiri, tombol primer kanan; judul `el-h3` |
| AA-3 | chip status pimpinan | Ditugaskan → "Perlu wawancara" (label khusus kartu peserta) |
| AA-5 | tabel tim | Tombol tonal untuk semua baris; selesai/menunggu = tombol tonal nonaktif "Selesai"/"Menunggu karyawan" |
| AA-6 | copy topik | Tanggal singkat "30 Nov 2026"; "nilai korporasi" tetap (netral tenant) → Sebagian |
| TN-2 | `/tna` | Papan menyala: Pengelolaan tidak dirender; tautan sekunder "Kelola TNA" ke `/tna/kelola`. Papan mati / karyawan: Pengelolaan tetap di `/tna` (satu-satunya isi). `TnaPengelolaan` memakai `UiCard`, `UiKpiCard`, `UiButton`, `UiField`, `UiNote`, `UiDataTable`, kelas `el-*`/`tna-*` |
| TN-3 | Ringkasan KPI | Notes "terhadap Job Competency Model", "key result di bawah target", nilai "1" + note "dari 3 gap", "dari total gap kompetensi" |
| TN-5 | Ringkasan | Tombol tonal "Lihat gap kompetensi" → tab kompetensi |
| TN-9 | Gap kompetensi bar | Merah hanya bila gap ≥ 20; lebar relatif gap terbesar |
| TN-10 | Gap kompetensi note | Copy mockup (tanpa nama jabatan, lihat K-P5-7) |
| TN-12 | Gap OKR note | "pencapaian **OKR** operasional" |
| IN-4 | `/ina` subjudul | Copy mockup |
| IN-5 | KPI | Notes "total tercatat" (atau "N lewat tenggat"), "klik status untuk ubah", "perbaikan proses", "perlu dukungan manajemen" |
| IN-6 | judul tabel | h2 "Tindakan perbaikan" di luar tabel, tombol kelola di kanan h2, tabel `caption-hidden` |
| IN-7 | tabel | Tujuh kolom; kolom Aksi dihapus; baris klik → `?ubah=<id>` membuka formulir ubah yang memuat tombol "Verifikasi lewat AI". Muat di 1440, terbaca di 1280 (tanpa kolom terpotong) |
| IN-9 | catatan akses | "Akses:" tebal, 13px (isi tetap PM-6) → Sebagian |
| IN-11 | atasan tanpa akses | Nada `warning`, bukan `critical` (galat lain tetap `critical`) |
| DN-3 | `/dna` tab | "Kurikulum Basic · Intermediate · Advanced", "Kebutuhan pengembangan pegawai" |
| DN-4 | pemilih jabatan | Copy mockup |
| DN-11 | Kurikulum | Satu judul "Basic · N modul" |
| DN-13 | chip tahap | basic→review, intermediate→training, advanced→improvement, done→success |
| DN-14 | Modul tercapai | Rata kiri |

## Keputusan

- **K-P5-1** CC: klik baris tetap membuka panel ubah (K-P3-4), sebab persyaratan B10 tidak punya layar detail gap (TD-1 tetap terbuka). Panel ubah sekarang juga menampilkan status validasi dan tombol Validasi/Tolak, sehingga tabel bisa 5 kolom tanpa kehilangan fitur. Panel hanya untuk HR (rute `/cc` memang `views: ['hr']`).
- **K-P5-2** Definisi persyaratan tidak lagi ditampilkan di sel nama (mockup hanya nama); masih terlihat dan bisa diubah di panel.
- **K-P5-3** Sintesis: "Isi dari sintesis" (D-9) dan pratinjau karyawan masuk `<details>` "Kelola nilai aktual dan pratinjau" di bawah daftar tema. Catatan privasi (minimal 5 responden, kelipatan 5) tetap tampil di bawah tombol sebagai teks kecil, menggantikan "Angka pada halaman ini ilustratif" mockup. Angka yang disembunyikan (< 5 responden) ditulis "-" di teks mono, bar 0.
- **K-P5-4** TN-2: rute anak baru `tna-kelola` (`/tna/kelola`) dengan gerbang yang sama dengan `tna` (B0 5.3 aturan 2: views lima tampilan, `submodule: 'tna'`, `menuKey: 'tna'`). Tidak ada flag baru: ini pemindahan tampilan, bukan fitur baru. Tautan "Kelola TNA" (tombol outlined kecil) di bawah tab papan. Rute `/m/tna` tetap mengalihkan ke `/tna`. Atasan dengan papan menyala menemukan sesi wawancaranya lewat menu Wawancara akar masalah (`iv`) seperti di mockup.
- **K-P5-5** INA: pola sama dengan CC. Formulir ubah dibuka lewat `?ubah=<id>` (bisa dibagikan, Kembali menutup); Batal/Simpan menghapus `?ubah`; id tak dikenal dihapus dari URL. Formulir digulir ke tampilan saat dibuka. Kolom Status tetap `select` (IN-8 di luar lingkup, butuh menu chip). `rowTo` hanya untuk level `manage`.
- **K-P5-6** Copy khusus klien (CC-2 sumber di subjudul, CV-1/CV-3 "5C", CV-10 note "Hasil Program DNA 5C", AH-5, AA-6 "nilai 5C") tidak dipakai: perlu keputusan 6 gaps-lna.
- **K-P5-7** TN-10: nama jabatan tidak tersedia di respons `/tna/gaps/competencies` (lintas jabatan), jadi kalimat memakai "jabatan" tanpa nama. Tidak ada perubahan API di P5.
- **K-P5-8** AA-3: label "Perlu wawancara" hanya di kartu peserta (atasan); `STATUS_LABEL` bersama tidak diubah (dipakai tabel HR).
- **K-P5-9** Snapshot visual tidak ditambah; ukuran lebar diuji dengan `scrollWidth <= clientWidth` pada `.el-table__scroll` di viewport 1280 (CC, INA) dan 1440 (INA).

## Tidak dikerjakan (dicatat)

- Perlu keputusan: CC-2, CC-7, CC-8, CV-3, CV-6, CV-11, AH-5, AH-8, TN-4, TN-6, TN-7 (kolom Orang/Status), TN-8, TN-11 (kolom tambahan), TN-13, DN-7, DN-10, DN-15, IN-10, semua TD, RV (B7).
- CV-2, CV-4, CV-5 (ProgramSection: bar ambang 92, h3 di kartu, `.mod` rekomendasi + tombol): layar program, ditunda ke P7 agar P5 tetap fokus tabel.
- AH-2, AH-3, AA-4 (tenggat ke dialog): bergantung pada keputusan 2 gaps-lna.
- AH-4 (Lihat hasil / Menunggu atasan / Batalkan ke menu): butuh pola menu baris; ditunda.
- IN-8 (chip status bisa diklik): butuh komponen menu; ditunda.
- DN-5, DN-6, DN-8, DN-9, DN-12 (kebutuhan pegawai baris klik + sorotan, butuh query pegawai): ditunda.
- `ImportPanel` bersama (dipakai Pengelolaan TNA dan DNA) masih bergaya lama: kode bersama, di luar P5.

## Test (e2e, API di-mock)

- [x] `core-competencies.spec.ts`: header tabel VM persis 5 kolom; baris tidak memuat "Menunggu validasi HR"/tombol Validasi; klik baris → panel memuat "Menunggu validasi HR" dan tombol Validasi/Tolak; Validasi mengirim PATCH; di 1280 tabel tanpa gulir horizontal; bar gap −20 merah (critical), −17 primer; Values 3 KPI, label "Kesiapan", bar kesiapan ≥80 success.
- [x] `cca-wawancara.spec.ts`: sintesis berupa daftar (tanpa tabel), teks "pimpinan sepakat 100% · karyawan sejalan 80% · gap −20", bar 80 dan merah; tema < 5 responden "karyawan sejalan -"; tombol Lihat Vision & Mission/Lihat Corporate Values berpindah tab; "Isi dari sintesis" di bagian lipat; pratinjau pimpinan dan karyawan; KPI ke-4 "Tema tersintesis"; sintesis tanpa `themes` → pesan galat.
- [x] `core-competencies.spec.ts` atasan: breadcrumb "Learning Needs Analysis › Wawancara AI"; chip "Perlu wawancara"; tombol tim nonaktif "Selesai"; tanggal "30 Nov 2026".
- [x] `tna-gap.spec.ts`: papan menyala → `tna-findings` tidak ada di `/tna`, tautan "Kelola TNA" → `/tna/kelola` memuat `tna-findings` dan breadcrumb; papan mati → `/tna` tetap berisi pengelolaan; pengelolaan tanpa kelas Tailwind (`slate-`, `bg-white`, `text-blue`); KPI note TN-3; tombol "Lihat gap kompetensi"; bar gap < 20 primer.
- [x] `poc-dna-tna.spec.ts` tetap hijau (label dan test id pengelolaan dipertahankan).
- [x] `improvement-needs.spec.ts`: 7 header kolom tanpa "Aksi"; h2 "Tindakan perbaikan"; klik baris → `?ubah=a-1` dan formulir ubah dengan tombol "Verifikasi lewat AI"; tabel muat di 1440 dan 1280; atasan tanpa akses → note warning; subjudul dan note KPI mockup.
- [x] `b4-dna.spec.ts`: label tab mockup, judul kurikulum "Basic · N modul", chip tahap basic bernada review.

## File

- [x] `apps/web/src/screens/b10-core-competencies/RequirementsTab.vue`, `SynthesisCard.vue`, `AssignmentsHr.vue`, `InterviewAssignmentView.vue`, `cc.css`, `apps/web/src/api/cca.ts` (`fmtDate(iso, 'short')`)
- [x] `apps/web/src/screens/b5-tna/TnaScreen.vue`, `TnaPengelolaan.vue`, `TnaKelolaView.vue` (baru), `routes.ts`, `tna.css`
- [x] `apps/web/src/screens/b9-ina/ImprovementNeedsView.vue`
- [x] `apps/web/src/screens/b4-dna/DevelopmentNeedsView.vue`
- [x] e2e di atas; `docs/designs/paritas-mockup/gaps-lna.md` (penanda Ditutup/Sebagian)

## Review spek

Subagent `egm:egm-design` / `egm:egm-implementation-readiness` tidak bisa dijalankan: sesi ini tidak punya tool Agent. Pengganti: tinjauan mandiri dengan daftar periksa kedua skill. Sesi induk akan menjalankan reviewer independen saat penggabungan.

| # | Temuan | Triase |
| --- | --- | --- |
| R-1 | Status validasi hilang dari tabel: HR tidak bisa memindai mana yang belum divalidasi | **Terima**: note bawah tetap menghitung "N … menunggu validasi HR"; keputusan user 1:1. Panel memuat status per baris |
| R-2 | Rute baru `tna-kelola` harus mengulang gerbang induk (B0 5.3 aturan 2) | **Perbaiki**: views/submodule/menuKey sama dengan `tna`, test akses |
| R-3 | `<details>` di kartu sintesis: kontrol di dalam `summary` | **Terima**: `summary` teks saja; tombol di dalam isi |
| R-4 | INA: klik baris di sel Status (`select`) tidak boleh membuka formulir | **Terima**: `UiDataTable` sudah mengabaikan klik dari `select` (P3) |
| R-5 | Uji lebar dengan `scrollWidth` bisa rapuh terhadap font | **Terima**: Roboto dimuat lokal di build uji; toleransi 1 px |
| R-6 | Pengelolaan TNA punya banyak `role="status"`/`alert`; test lama memakai `getByRole('status')` tunggal | **Perbaiki**: satu wilayah status dan satu alert, sama dengan sebelumnya |
