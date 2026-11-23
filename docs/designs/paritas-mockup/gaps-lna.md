# Gap kesetaraan UI: grup LNA (Core Competencies, Developmental Needs, Training Needs, Improvement Needs)

Acuan: `tools/mockup-render/Main.dc.html` (baris template disebut `M:<baris>`), mock-shots `hr--cc--*`, `atasan--aiv--list`, `*--dna--*`, `*--tna--*`, `*--gap`, `*--review`, `*--ina`.
Aplikasi: app-shots (catatan: di banyak folder `test-finished-1.png` adalah halaman kedua "Hasil saya"; layar yang benar ada di `test-finished-2.png`).
Path file relatif ke `apps/web/src/`. Mockup tidak membedakan HR dan atasan untuk DNA, TNA, review, INA (innerText identik kecuali shell).

Pola berulang (dihitung sekali per layar di bawah):
- **P1 Kartu "Agen AI · …" + chip Pilot + tombol tonal** (`card t`, M:308, 332, 392, 478, 708) tidak ada di CC-VM, CC-Values, DNA, TNA. INA punya kartu tapi isinya beda.
- **P2 Baris tabel klik-untuk-buka** (`row lk`, M:319, 377, 457, 501, 516): aplikasi memakai tautan nama / tombol "Lihat" / tidak bisa diklik.
- **P3 Breadcrumb**: mockup `.bc` 12px, separator `›` dengan jarak 6px (M:124). Aplikasi tiga gaya berbeda: `cc-crumb` 12px (b10/cc.css:2), `el-muted` 14px tanpa ukuran (b4-dna), `tna-bc` 13px (b5-tna/tna.css:1); INA dan Wawancara AI atasan tanpa breadcrumb.

## 1. Core Competencies, tab Corporate Vision & Mission (HR)

| ID | Layar/state | Jenis | Mockup | Aplikasi | File:baris | Bobot | Usulan perbaikan |
|---|---|---|---|---|---|---|---|
| CC-1 | VM | hilang | Kartu P1 "Agen AI · Wawancara pimpinan dan karyawan" + "Buka wawancara AI" (ke tab aiv) | Tidak ada | screens/b10-core-competencies/RequirementsTab.vue:80-83 | tinggi | Tambah komponen `UiAgentCard` bersama (judul, chip Pilot, teks, tombol tonal sm); di VM tombol ke `?tab=aiv`, tampil hanya bila flag `cca.interview` · **Ditutup** ([p3-komponen-bersama.md](p3-komponen-bersama.md)): `UiAgentCard`; tombol hanya bila flag `cca.interview` menyala |
| CC-2 | VM | copy | Subjudul diakhiri "Sumber: elitery.com/about-us." | Tanpa sumber di subjudul; "Sumber: …" per kartu (12px) | RequirementsTab.vue:81, 112 | rendah | Biarkan sumber per kartu (data per tenant) atau pindahkan ke subjudul; perlu keputusan kecil · **Diputuskan** ([p8-keputusan-r1-r22.md](p8-keputusan-r1-r22.md), R5): sumber tetap per kartu dari data tenant |
| CC-3 | VM tabel | komponen | 5 kolom: Persyaratan, Target, Aktual, Gap, Klasifikasi; baris klik → Detail gap | 7 kolom (+Validasi, +Tindakan Ubah/Validasi/Tolak); baris tidak bisa diklik; di 1280px tabel melebar dan kolom nama terpotong/terscroll | RequirementsTab.vue:27-35, 116-140 | tinggi | Kembalikan 5 kolom; pindahkan validasi/ubah ke panel detail baris (klik baris) atau menu ikon satu kolom sempit; status "Menunggu validasi" jadi chip kecil di sel nama · **Ditutup** ([p5-lna.md](p5-lna.md)): 5 kolom mockup; definisi, status validasi, Validasi/Tolak di panel ubah (klik baris, K-P5-1); muat di 1280. Baris tetap membuka panel ubah, bukan detail gap (TD-1 terbuka) |
| CC-4 | VM kartu sumber | komponen | "KESIAPAN KARYAWAN" + angka rata kanan tanpa bingkai (`.kpi` tanpa `.card`) | `UiKpiCard` berbingkai | RequirementsTab.vue:114 | sedang | Varian `UiKpiCard plain` (tanpa border, rata kanan) · **Ditutup** ([p5-lna.md](p5-lna.md)): markup lokal tanpa bingkai, `UiKpiCard` bersama tidak diubah |
| CC-5 | VM gap bar | token | Lebar bar = gap/35; merah (`hot`) hanya bila gap ≥ 20, selain itu primer | Lebar = gap/target; merah bila klasifikasi `perlu_ditinjau` | RequirementsTab.vue:36, 124 | sedang | Samakan skala dan aturan warna (≥20 merah) · **Ditutup** ([p5-lna.md](p5-lna.md)) |
| CC-6 | VM KPI | copy | Note "persyaratan kompetensi" | "persyaratan kompetensi yang sudah diukur" | RequirementsTab.vue:44 | rendah | Samakan teks atau setujui sebagai klarifikasi · **Ditutup** ([p5-lna.md](p5-lna.md)) |
| CC-7 | VM catatan bawah | copy | "Persyaratan kompetensi diturunkan AI dari dokumen visi dan misi, dan menunggu validasi HR. Nilai pada halaman ini ilustratif." | "N … menunggu validasi HR. Nilai aktual adalah isian HR sampai hasil wawancara AI tersedia." | RequirementsTab.vue:175-178 | rendah | Copy produksi sah (bukan ilustratif); catat sebagai penyimpangan sengaja |
| CC-8 | VM kelola | komponen | Tidak ada tombol tambah | "Tambah persyaratan kompetensi", "Tambah visi atau misi", form inline | RequirementsTab.vue:142-173 | rendah | Perlu keputusan: fitur kelola HR tidak ada di mockup; pertahankan tapi pakai pola tersembunyi (menu "Kelola") agar tata letak tetap 1:1 |

## 2. Core Competencies, tab Corporate Values (HR)

| ID | Layar/state | Jenis | Mockup | Aplikasi | File:baris | Bobot | Usulan perbaikan |
|---|---|---|---|---|---|---|---|
| CV-1 | Values | hilang | Subjudul "Hasil program 5C … Sumber: …" lalu kartu P1 "Agen AI · Wawancara nilai" | Langsung judul program | screens/b10-core-competencies/CoreCompetenciesView.vue:38-42 | tinggi | Tambah subjudul + `UiAgentCard` di atas `ProgramSection` · **Sebagian** ([p3-komponen-bersama.md](p3-komponen-bersama.md)): kartu Agen AI ada; subjudul program ditunda (teks khusus satu klien) |
| CV-2 | Program, skor per nilai | token | Bar hijau (`ok`) bila ≥ 92, merah bila < 92 | Bar primer semua | ProgramSection.vue:122 | sedang | Tone ok/critical sesuai ambang · **Ditutup** ([p7-sisa.md](p7-sisa.md)): ambang = band tertinggi program (K-P7-4) · triase ([egm/p7-code-review.md](egm/p7-code-review.md#review-independen-sesi-induk-23-nov)): skor kosong (null) memakai bar primer; skor nilai dan band sama-sama 0–100 di API (K-P7-4) |
| CV-3 | Program | copy | "Skor karakter 5C (peserta yang selesai)", KPI "RATA-RATA SKOR 5C", kolom "Skor 5C" | "Skor per nilai …", "Rata-rata skor nilai", "Skor nilai" | ProgramSection.vue:45, 72, 119 | rendah | Generik per tenant disengaja; boleh pakai nama program (mis. "Skor karakter {nama}") · **Diputuskan** ([p8-keputusan-r1-r22.md](p8-keputusan-r1-r22.md), R5): label netral tenant; teks "nilai 5C" sisa diganti "nilai korporasi" |
| CV-4 | Program, tabel komponen dan divisi | layout | `card` > h3 judul > tabel | Judul jadi caption di dalam bingkai tabel; bingkai tabel bersarang di kartu (dobel border) | ProgramSection.vue:127-133 | sedang | h3 di kartu, `UiDataTable caption-hidden` tanpa bingkai luar · **Ditutup** ([p7-sisa.md](p7-sisa.md)) |
| CV-5 | Program, rekomendasi | komponen | Tiap butir `.mod` berbingkai + tombol "Wawancarai karyawan yang belum selesai" | Teks polos, tanpa tombol | ProgramSection.vue:134-137 | sedang | Bungkus butir dengan gaya `.dn-mod`/`mod` bersama; tambah tombol (flag `cca.interview`) · **Ditutup** ([p7-sisa.md](p7-sisa.md)) · triase ([egm/p7-code-review.md](egm/p7-code-review.md#review-independen-sesi-induk-23-nov)): tombol menuju `/cc?tab=aiv` (tab Wawancara AI) |
| CV-6 | Program, aksi kelola | komponen | Tidak ada | 4 tombol: Impor, Isi angka agregat, Ubah program, Program baru | ProgramSection.vue:140-145 | rendah | Perlu keputusan (sama dengan CC-8) |
| CV-7 | Gap perilaku KPI | komponen | 3 KPI: Kesiapan, Nilai dengan gap terbesar, Di bawah target | 4 KPI (+Gap terbesar), grid 4 | RequirementsTab.vue:45-47, 89 | sedang | Hapus "Gap terbesar" untuk grup values, grid 3 · **Ditutup** ([p5-lna.md](p5-lna.md)) |
| CV-8 | Gap perilaku, kesiapan per nilai | token | Bar hijau ≥ 80, merah < 80 | Primer / merah | RequirementsTab.vue:97 | rendah | Tone `success` untuk ≥ 80 · **Ditutup** ([p5-lna.md](p5-lna.md)) |
| CV-9 | Gap perilaku, kartu nilai | copy | Label "KESIAPAN" | "Kesiapan karyawan" | RequirementsTab.vue:114 | rendah | Label "Kesiapan" untuk values · **Ditutup** ([p5-lna.md](p5-lna.md)) |
| CV-10 | Gap perilaku | copy | Tidak ada paragraf pengantar; note "Hasil Program DNA 5C bersumber dari laporan Elite Academy. Indikator perilaku diturunkan …" | Paragraf "Seberapa besar gap karyawan …"; note isian HR | RequirementsTab.vue:82, 175-178 | rendah | Hapus paragraf; sesuaikan note · **Sebagian** ([p5-lna.md](p5-lna.md)): paragraf pengantar dihapus; note bawah tetap (teks "Program DNA 5C" khusus klien, K-P5-6) |
| CV-11 | Angka | token | Desimal titik ("93.4") | Desimal koma ("93,4") | api/cca.ts `fmt` | rendah | Perlu keputusan (koma = locale id yang benar) · **Ditutup** ([p8-keputusan-r1-r22.md](p8-keputusan-r1-r22.md)): desimal koma lewat `formatNumber` (Intl id-ID) |

## 3. Core Competencies, tab Wawancara AI (HR)

| ID | Layar/state | Jenis | Mockup | Aplikasi | File:baris | Bobot | Usulan perbaikan |
|---|---|---|---|---|---|---|---|
| AH-1 | KPI | komponen | Pimpinan ditugaskan, Wawancara pimpinan selesai, Karyawan selesai ("contoh: tim …"), **Tema tersintesis** | Kartu ke-3 "Karyawan ditugaskan", ke-4 "Karyawan selesai"; tema ada di kartu sintesis | screens/b10-core-competencies/AssignmentsHr.vue:37-46 | sedang | Ganti "Karyawan ditugaskan" dengan "Tema tersintesis" (dari `cca.synthesis().kpis.themes`) · **Ditutup** ([p5-lna.md](p5-lna.md)): "Karyawan ditugaskan" jadi note kartu "Karyawan selesai" |
| AH-2 | Kartu penugasan | layout | "Tugaskan semua" di kanan header kartu | Toolbar tabel berisi field "Batas waktu penugasan baru" + tombol | AssignmentsHr.vue:72-79 | sedang | Tombol ke header; tanggal tenggat dipindah ke dialog/popover saat menekan Tugaskan (tenggat tetap wajib) · **Ditutup** ([p8-keputusan-r1-r22.md](p8-keputusan-r1-r22.md)): "Tugaskan semua" di kepala kartu; tenggat dipilih di dialog saat menekan Tugaskan |
| AH-3 | Tabel pimpinan | komponen | Kolom: Pimpinan, Divisi, Status, Tim selesai, Tindakan | +kolom "Batas waktu"; nama + jabatan dua baris | AssignmentsHr.vue:28-35, 80 | rendah | Tenggat jadi teks kecil di sel Status · **Ditutup** ([p8-keputusan-r1-r22.md](p8-keputusan-r1-r22.md)): kolom Batas waktu dihapus; "Batas {tanggal}" teks kecil di sel Status |
| AH-4 | Tindakan per baris | komponen | Tombol tonal: "Lihat hasil" (selesai), "Menunggu atasan" (dinonaktifkan), "Tugaskan" | Selesai = teks "Selesai"; ditugaskan = tombol teks "Batalkan" | AssignmentsHr.vue:85-89 | sedang | Selesai → tombol "Lihat hasil" (ke sintesis); ditugaskan → "Menunggu atasan" nonaktif, Batalkan pindah ke menu |
| AH-5 | Copy topik | copy | "Topik: visi, misi, dan nilai 5C." | "… nilai korporasi." | AssignmentsHr.vue:74 | rendah | Netral tenant disengaja · **Diputuskan** ([p8-keputusan-r1-r22.md](p8-keputusan-r1-r22.md), R5): teks netral tenant "nilai korporasi" |
| AH-6 | Sintesis | komponen | Daftar tema: nama + chip sumber, teks mono kanan "pimpinan sepakat X% · karyawan sejalan Y% · gap −Z", bar lebar = Y (merah bila gap ≥ 20); 3 tombol: Lihat Vision & Mission, Lihat Corporate Values, Pratinjau sesi pimpinan | `UiDataTable` 5 kolom + 3 KPI dalam grid 4 (sel kosong) + tombol "Isi dari sintesis" + segmented Pimpinan/Karyawan + daftar pratinjau | SynthesisCard.vue:52-90 | tinggi | Render daftar ala mockup; "Isi dari sintesis" jadi aksi sekunder per tema; hapus KPI ganda (pindah ke AH-1); tambah dua tombol navigasi tab · **Ditutup** ([p5-lna.md](p5-lna.md)): daftar tema + 3 tombol; "Isi dari sintesis" dan pratinjau karyawan di bagian lipat "Kelola nilai aktual dan pratinjau" (K-P5-3) |
| AH-7 | Sintesis subjudul | copy | "Tema dari wawancara pimpinan, dan seberapa jauh jawaban karyawan sejalan. Hasil ini menjadi dasar persyaratan kompetensi pada Corporate Vision & Mission dan Corporate Values." | "Seberapa sepakat pimpinan … Gap 20 poin atau lebih ditandai merah." | SynthesisCard.vue:53 | rendah | Pakai copy mockup · **Ditutup** ([p5-lna.md](p5-lna.md)) |
| AH-8 | Pratinjau sesi | state | Tombol membuka sesi chat simulasi pimpinan (langkah `aivChat` → `aivDone`, "Pratinjau sesi pimpinan; tidak disimpan.") | Daftar pertanyaan bernomor | SynthesisCard.vue:82-90 | sedang | Perlu keputusan: pratinjau chat penuh vs daftar · **Diputuskan** ([p8-keputusan-r1-r22.md](p8-keputusan-r1-r22.md), R7): daftar pertanyaan (tanpa LLM, tidak disimpan); sudah sesuai |
| AH-9 | Sintesis tidak tampil di e2e | state | - | Mock e2e mengembalikan `[]` untuk `/cca/synthesis`, kartu gagal dirender tanpa pesan galat | SynthesisCard.vue:111-112 | rendah | Tangani data tak lengkap dengan pesan galat/kosong; tambahkan mock sintesis di e2e · **Ditutup** ([p5-lna.md](p5-lna.md)): respons tanpa `themes` menampilkan pesan galat; mock e2e sintesis kosong diuji |

## 4. Wawancara AI (atasan, rute `/aiv`)

| ID | Layar/state | Jenis | Mockup | Aplikasi | File:baris | Bobot | Usulan perbaikan |
|---|---|---|---|---|---|---|---|
| AA-1 | Header | nav | Breadcrumb "Learning Needs Analysis › Wawancara AI" | Tidak ada | InterviewAssignmentView.vue:68-71 | sedang | Tambah breadcrumb (P3) · **Terbuka**: tidak masuk P3 (pindah ke P5) · **Ditutup** ([p5-lna.md](p5-lna.md)): atasan dan karyawan |
| AA-2 | Kartu wawancara pimpinan | layout | Teks kiri, tombol primer "Mulai wawancara" kanan satu baris; judul h3 | Tombol di bawah teks; judul h2 (20px) | InterviewAssignmentView.vue:85-94 | sedang | Flex `space-between`, judul `el-h3` · **Ditutup** ([p5-lna.md](p5-lna.md)) |
| AA-3 | Chip status pimpinan | copy | Status ditugaskan = "Perlu wawancara" | "Ditugaskan" | InterviewAssignmentView.vue:86 (STATUS_LABEL di api/cca.ts:157) | sedang | Label khusus kartu peserta: assigned → "Perlu wawancara" · **Ditutup** ([p5-lna.md](p5-lna.md)): label khusus kartu peserta, `STATUS_LABEL` bersama tetap (K-P5-8) |
| AA-4 | Tabel tim, toolbar | komponen | Tidak ada "Tugaskan semua" / tanggal | Field tanggal + "Tugaskan semua" | InterviewAssignmentView.vue:100-103 | rendah | Sama dengan AH-2 (dialog tenggat) · **Ditutup** ([p8-keputusan-r1-r22.md](p8-keputusan-r1-r22.md)): dialog tenggat; atasan tetap punya "Tugaskan semua" di kepala kartu (fitur B10, penyimpangan sadar) |
| AA-5 | Tindakan per baris | komponen | Semua tombol tonal (Selesai/Menunggu karyawan nonaktif) | Teks polos untuk selesai/menunggu; tombol "Tugaskan" tonal tampil putih | InterviewAssignmentView.vue:106-109 | rendah | Tombol tonal nonaktif untuk status non-tugaskan · **Sebagian** ([p5-lna.md](p5-lna.md)): triase memilih teks status, bukan tombol nonaktif (K-P5-11) |
| AA-6 | Copy topik | copy | "nilai 5C", "30 Nov 2026" | "nilai korporasi", "30 November 2026" | InterviewAssignmentView.vue:89 | rendah | Format tanggal singkat (`d MMM yyyy`) bila ingin 1:1 · **Sebagian** ([p5-lna.md](p5-lna.md)): tanggal singkat "30 Nov 2026"; "nilai korporasi" tetap (netral tenant, K-P5-6) |

## 5. Developmental Needs (HR dan atasan, 4 tab)

Catatan: file `screens/b4-dna/DevelopmentNeedsView.vue`.

| ID | Layar/state | Jenis | Mockup | Aplikasi | File:baris | Bobot | Usulan perbaikan |
|---|---|---|---|---|---|---|---|
| DN-1 | Semua tab | hilang | Kartu P1 "Agen AI · Validasi kamus kompetensi" + "Buka wawancara AI" | Tidak ada | DevelopmentNeedsView.vue:115 | tinggi | `UiAgentCard` (tombol ke `/aiv` atau flag baru, default mati) · **Sebagian** ([p3-komponen-bersama.md](p3-komponen-bersama.md), K-P3-2): kartu ada tanpa tombol, karena tujuan mockup (`aiv`) fitur lain |
| DN-2 | Header | token | Breadcrumb 12px | 14px `el-muted` | DevelopmentNeedsView.vue:113 | rendah | Komponen `UiBreadcrumb` bersama (P3) · **Ditutup** ([p3-komponen-bersama.md](p3-komponen-bersama.md)): `UiBreadcrumb` |
| DN-3 | Tab | copy | "Kurikulum Basic · Intermediate · Advanced", "Kebutuhan pengembangan pegawai" | "Kurikulum BIA", "Kebutuhan pegawai" | DevelopmentNeedsView.vue:13-16 | sedang | Pakai label mockup · **Ditutup** ([p5-lna.md](p5-lna.md)) |
| DN-4 | Pemilih jabatan | copy | Note "Jabatan lain akan muncul di pilihan di atas setelah kamusnya dibuat lewat DACUM." | "Jabatan lain bisa dipilih setelah kamusnya dibuat lewat DACUM." | DevelopmentNeedsView.vue:138-141 | rendah | Copy mockup · **Ditutup** ([p5-lna.md](p5-lna.md)) |
| DN-5 | Ringkasan KPI | copy | KPI ke-4 note "dua lainnya belum dibuat" | Tanpa note | DevelopmentNeedsView.vue:149 | rendah | Note dinamis "{n} lainnya belum dibuat" |
| DN-6 | Ringkasan, status kamus | copy | "Kamus disusun dari lokakarya DACUM dan menunggu pengesahan HR sebelum dipakai sebagai target di Training Needs." | Hitungan pengesahan + asesmen | DevelopmentNeedsView.vue:168-171 | rendah | Copy mockup bila belum disahkan; "Kamus sudah disahkan HR." bila sudah |
| DN-7 | Ringkasan | komponen | Tidak ada | Tautan "Impor data dan hasil asesmen per karyawan" ke POC | DevelopmentNeedsView.vue:175 | rendah | Sementara sampai B11 `cfg`; catat |
| DN-8 | Kamus, daftar JF | copy | Kartu JF: "JF3" + nama | Nama + " · N kompetensi" | DevelopmentNeedsView.vue:188 | rendah | Hapus hitungan atau setujui |
| DN-9 | Kamus, catatan atas tabel | copy | "{Jabatan} · JF3: {nama} (7 dari 48 modul sudah memiliki data asesmen)" | "N kompetensi untuk JF3 · {nama}" | DevelopmentNeedsView.vue:96-101 | sedang | Format mockup, pakai `assessedCompetencyCount` |
| DN-10 | Kamus, bawah tabel | copy/komponen | "Pemetaan job function ke kompetensi bersifat ilustratif; versi final mengikuti DACUM Tool 1 dan 2." | Hitungan pengesahan + "Target memakai skala 0-4." + tombol "Sahkan kamus" | DevelopmentNeedsView.vue:201-208 | rendah | Tombol pengesahan disengaja (spek B4); catat · **Diputuskan** ([p8-keputusan-r1-r22.md](p8-keputusan-r1-r22.md), R4): tombol pengesahan dan catatan skala tetap (spek B4) |
| DN-11 | Kurikulum | layout | Judul kartu "Basic · 27 modul" (h3 tunggal) | h3 + span mono 12px "N modul" | DevelopmentNeedsView.vue:219 | rendah | Satu teks "Basic · N modul" · **Ditutup** ([p5-lna.md](p5-lna.md)) |
| DN-12 | Kebutuhan pegawai | komponen | 4 kolom, baris klik (P2), baris terpilih berlatar `#ECEFF5`; subjudul "… Klik baris untuk melihat rencana lengkap." | +kolom "Rencana" dengan tombol "Lihat"; tanpa sorotan baris; subjudul tanpa kalimat klik | DevelopmentNeedsView.vue:93-95, 233-240 | sedang | `UiDataTable` dukung `row-click` + `selected-key`; hapus kolom Rencana |
| DN-13 | Kebutuhan pegawai, chip tahap | token | Basic = `c-rv` (kuning), Intermediate = `c-tr` (biru), Tuntas = `c-ok` | Basic dan Intermediate sama-sama `training` (biru) | DevelopmentNeedsView.vue:102 | sedang | Peta tone per tahap: basic→review, intermediate→training, advanced→improvement, done→success · **Ditutup** ([p5-lna.md](p5-lna.md)) |
| DN-14 | Kebutuhan pegawai, modul tercapai | layout | Rata kiri, "6 / 7" | Rata kanan + baris "dinilai x dari y" | DevelopmentNeedsView.vue:94, 237 | rendah | Rata kiri; info "dinilai" boleh tetap · **Ditutup** ([p5-lna.md](p5-lna.md)): rata kiri; info "dinilai x dari y" tetap |
| DN-15 | Rencana, tingkat kosong | state | Kartu kosong tanpa teks | "Belum ada modul." | DevelopmentNeedsView.vue:250 | rendah | Biarkan (lebih jelas) atau hapus |
| DN-16 | Atasan | state | Atasan melihat layar sama dengan HR | Sama, minus "Sahkan kamus" | - | - | Sesuai (bukan gap) |

## 6. Training Needs (HR dan atasan, 3 tab)

Catatan: file `screens/b5-tna/TnaScreen.vue`.

| ID | Layar/state | Jenis | Mockup | Aplikasi | File:baris | Bobot | Usulan perbaikan |
|---|---|---|---|---|---|---|---|
| TN-1 | Semua tab | hilang | Kartu P1 "Agen AI · Wawancara akar masalah" + "Contoh wawancara" (sebelum subjudul) | Tidak ada | TnaScreen.vue:90-93 | tinggi | `UiAgentCard`; tombol ke contoh sesi/IV · **Ditutup** ([p3-komponen-bersama.md](p3-komponen-bersama.md)): tombol ke `/iv` bila rute terbuka |
| TN-2 | Seluruh halaman | layout/token | Hanya papan gap (3 tab) | Di bawah papan ada "Pengelolaan TNA" POC lama: 4 kotak statistik, impor, form jadwal, daftar kebutuhan training, gaya Tailwind (`border`, `bg-slate-900`, `text-blue-700`) di luar token ELGOS | TnaScreen.vue:157; TnaPengelolaan.vue:125-180 | tinggi | Sembunyikan Pengelolaan saat `tna.gap_board` menyala (pindah ke B11 `cfg`/tab tersendiri), atau migrasikan ke komponen `Ui*` · **Ditutup** ([p5-lna.md](p5-lna.md)): papan menyala → pengelolaan di rute `tna-kelola` (`/tna/kelola`, tautan "Kelola TNA"); papan mati/karyawan tetap di `/tna`. Gaya `Ui*`/token; `ImportPanel` bersama belum dimigrasi (K-P5-4) |
| TN-3 | Ringkasan KPI | copy | Notes: "terhadap Job Competency Model", "key result di bawah target", nilai "2" + "dari 10 gap", "dari total gap kompetensi" | "di bawah target jabatan", "periode X", "2 / 10" + "gap dengan wawancara selesai", "dari total gap" | TnaScreen.vue:48-56 | sedang | Copy mockup; value "2" dan note "dari {total} gap" · **Ditutup** ([p5-lna.md](p5-lna.md)) |
| TN-4 | Ringkasan, klasifikasi | komponen | 3 baris: Training Needs, Improvement Needs, Perlu ditinjau HR | +baris ke-4 "Belum diwawancarai" | TnaScreen.vue:62 | rendah | Perlu keputusan; mockup menyembunyikan pending · **Diputuskan** ([p8-keputusan-r1-r22.md](p8-keputusan-r1-r22.md), R6): baris "Belum diwawancarai" dipertahankan |
| TN-5 | Ringkasan, alur | hilang | Tombol tonal "Lihat gap kompetensi" | Tidak ada | TnaScreen.vue:113-119 | sedang | Tambah tombol → tab kompetensi · **Ditutup** ([p5-lna.md](p5-lna.md)) |
| TN-6 | Ringkasan | komponen | Tidak ada | Note warning "N kompetensi menunggu pengesahan HR …" | TnaScreen.vue:101-103 | rendah | Tambahan sah; catat |
| TN-7 | Gap kompetensi, tabel | komponen | Kolom: Kode, Kompetensi, Target, Aktual, Gap, Klasifikasi; baris klik (P2) | Tanpa Kode; +Orang, +Status wawancara; nama sebagai tautan | TnaScreen.vue:66-74, 125-135 | tinggi | Tambah kolom Kode; Orang/Status pindah ke detail gap; baris klik · **Sebagian** ([p3-komponen-bersama.md](p3-komponen-bersama.md), K-P3-3): kolom Kode pertama dan baris bisa diklik; kolom Orang/Status tetap karena HR memindai keduanya · **Diputuskan** ([p8-keputusan-r1-r22.md](p8-keputusan-r1-r22.md), R6): kolom Orang/Status dipertahankan |
| TN-8 | Gap kompetensi, nilai | copy | Target/Aktual skor 0-100 tanpa "%" | "85%" | TnaScreen.vue:127-128 | rendah | Hilangkan "%" atau tetapkan satuan; perlu keputusan skala · **Ditutup** ([p8-keputusan-r1-r22.md](p8-keputusan-r1-r22.md)): skor 0–100 tanpa "%" (`formatScore`) |
| TN-9 | Gap kompetensi, bar | token | Merah hanya bila gap ≥ 20; lebar relatif gap terbesar | Selalu merah; lebar = gapPct | TnaScreen.vue:130 | sedang | Aturan `hot` dan skala mockup · **Ditutup** ([p5-lna.md](p5-lna.md)) |
| TN-10 | Gap kompetensi, note | copy | "… skor pegawai terhadap **Job Competency Model** jabatan {Jabatan} (DACUM Tool 1). Klik baris untuk membuka detail dan memulai wawancara akar masalah." | "… target kompetensi jabatan. Buka gap untuk melihat detail dan menugaskan wawancara …" | TnaScreen.vue:124 | rendah | Copy mockup (kata "menugaskan" boleh tetap, lihat TD-5) · **Ditutup** ([p5-lna.md](p5-lna.md)): tanpa nama jabatan (data lintas jabatan, K-P5-7) |
| TN-11 | Gap OKR | komponen | Kolom: Key result, Target, Aktual, Selisih (merah), Klasifikasi | +pemilih Periode, +Orang, +Status wawancara; selisih tidak merah | TnaScreen.vue:75-83, 140-153 | sedang | Selisih `color: var(--el-error)`; kolom tambahan ke detail; pemilih periode boleh tetap (perlu keputusan) · **Ditutup** ([p8-keputusan-r1-r22.md](p8-keputusan-r1-r22.md)): selisih merah (`.tna-diff`); kolom Orang/Status dan pemilih periode dipertahankan (R6) |
| TN-12 | Gap OKR, note | copy | "pencapaian **OKR** operasional" | "pencapaian OKR/KPI/SLA" | TnaScreen.vue:139 | rendah | Copy mockup atau setujui · **Ditutup** ([p5-lna.md](p5-lna.md)) |
| TN-13 | Atasan | state | Atasan melihat papan sama (tanpa beda) | Sama, tanpa tombol tinjauan HR | - | - | Lihat butir perlu keputusan (review atasan) · **Diputuskan** ([p8-keputusan-r1-r22.md](p8-keputusan-r1-r22.md), R1): atasan tanpa tombol tinjauan HR |

## 7. Detail gap (`/tna/gap`)

| ID | Layar/state | Jenis | Mockup | Aplikasi | File:baris | Bobot | Usulan perbaikan |
|---|---|---|---|---|---|---|---|
| TD-1 | Breadcrumb | nav | Tautan kembali dinamis: "Training Needs" atau "Core Competencies" (gap dari tabel CC) | Selalu "Training Needs" | screens/b5-tna/TnaGapView.vue:147 | sedang | Terima `back` di query (CC-3/CV baris klik membuka detail gap) |
| TD-2 | KPI | token | Nilai GAP merah | Warna biasa | TnaGapView.vue:158 | rendah | Prop `tone="critical"` di `UiKpiCard` |
| TD-3 | Bukti/hipotesis | komponen | Baris dengan ikon Material (`insights` primer / `help` kuning) dan garis pemisah | `ul` berpoin | TnaGapView.vue:162, 166 | sedang | Daftar ikon dengan `UiIcon` + border-bottom |
| TD-4 | Tabel Karyawan | komponen | Tidak ada | Judul "Karyawan" + tabel Nama/Jabatan/Nilai/Wawancara | TnaGapView.vue:170-178 | rendah | Tambahan disengaja (penugasan); catat |
| TD-5 | CTA "Cari akar masalah" | layout/komponen | Kartu `--pc` satu baris: teks kiri, tombol "Mulai wawancara akar masalah" (ikon forum) + "Langsung ke tinjauan HR" kanan | Kartu berisi form penugasan (proyek, siapa, karyawan, tenggat, durasi) + "Tugaskan wawancara" | TnaGapView.vue:183-226 | sedang | Perlu keputusan: penugasan menggantikan "mulai langsung". Usul: CTA tetap satu baris, form dibuka di dialog/sheet saat tombol diklik · **Ditutup** ([p8-keputusan-r1-r22.md](p8-keputusan-r1-r22.md)): CTA satu baris (Mulai wawancara akar masalah + Langsung ke tinjauan HR); formulir penugasan di dialog `UiDialog` |
| TD-6 | Atasan | state | "Langsung ke tinjauan HR" juga tampil (mockup sama untuk atasan) | Hanya HR | TnaGapView.vue:228, 232; b7-tinjauan/routes.ts:6-9 | - | Perlu keputusan · **Diputuskan** ([p8-keputusan-r1-r22.md](p8-keputusan-r1-r22.md), R1): tombol tinjauan hanya HR (spek B7, PM-5/PM-6) |

## 8. Tinjauan temuan AI oleh HR (`/m/tna/review`)

| ID | Layar/state | Jenis | Mockup | Aplikasi | File:baris | Bobot | Usulan perbaikan |
|---|---|---|---|---|---|---|---|
| RV-1 | Seluruh layar | komponen/layout | "Tinjauan temuan AI" per gap: breadcrumb "Training Needs › Tinjauan HR", subjudul "{gap}. HR memastikan klasifikasi …"; kiri kartu "Temuan dan klasifikasi" (radio-segmented Training/Improvement/Perlu ditinjau HR, "· AI 90%"); kanan kartu "Solusi pelatihan" (modul rekomendasi + "Tugaskan di EliteMentor") dan "Tindakan perbaikan" ("Buat tindakan di Improvement Needs") | Layar POC lama "Review hasil AI": tautan "← Kembali ke TNA", tab Draft/Riwayat, antrean lintas karyawan, tombol Ubah/Tolak/Setujui, gaya Tailwind | views/ReviewView.vue:59-125; screens/legacy-review/routes.ts:6 (kini b7-tinjauan/AntreanView.vue, routes.ts) | tinggi | Kerjakan paket B7 sesuai mockup (rute `review` per gap), pakai `UiCard`, `UiSegmented`, `UiChip`; antrean lama jadi tab "Riwayat" bila masih perlu. **Ditutup** ([b7-tinjauan-web.md](b7-tinjauan-web.md)): rute `review` `b7-tinjauan/TinjauanView.vue`, antrean lama `AntreanView.vue` |
| RV-2 | Judul | copy | "Tinjauan temuan AI" (h1 28px) | "Review hasil AI" (`text-lg`) | views/ReviewView.vue:60 (kini b7-tinjauan/TinjauanView.vue) | sedang | Termasuk RV-1. **Ditutup** ([b7-tinjauan-web.md](b7-tinjauan-web.md)) |
| RV-3 | Atasan | state/nav | Mockup `atasan--review` identik dengan HR | Rute hanya `hr_admin`, `eta_admin` | b7-tinjauan/routes.ts:6-9 | - | Perlu keputusan · **Diputuskan** ([p8-keputusan-r1-r22.md](p8-keputusan-r1-r22.md), R1): rute tinjauan tetap HR saja |

## 9. Improvement Needs (HR dan atasan)

Catatan: file `screens/b9-ina/ImprovementNeedsView.vue`.

| ID | Layar/state | Jenis | Mockup | Aplikasi | File:baris | Bobot | Usulan perbaikan |
|---|---|---|---|---|---|---|---|
| IN-1 | Header | nav | Breadcrumb "Learning Needs Analysis › Improvement Needs" | Tidak ada | ImprovementNeedsView.vue:186 | sedang | Tambah breadcrumb (P3) · **Ditutup** ([p3-komponen-bersama.md](p3-komponen-bersama.md)) |
| IN-2 | Urutan | layout | h1 → kartu Agen AI → subjudul → KPI | h1 → subjudul → kartu Agen AI → KPI | ImprovementNeedsView.vue:186-219 | rendah | Pindahkan kartu ke atas subjudul · **Ditutup** ([p3-komponen-bersama.md](p3-komponen-bersama.md)) |
| IN-3 | Kartu Agen AI | komponen/copy | Satu baris: judul + Pilot + teks "AI menanyai pemilik tindakan perbaikan (atasan atau karyawan pada jabatan terkait) …" + tombol "Buka wawancara AI" | Teks lain, tanpa tombol, berisi tabel verifikasi atau "Belum ada verifikasi …"; hanya tampil bila flag AI menyala | ImprovementNeedsView.vue:196-217 | sedang | Kartu ringkas sesuai mockup; tabel verifikasi pindah ke bagian sendiri di bawah daftar · **Ditutup** ([p3-komponen-bersama.md](p3-komponen-bersama.md)): tabel verifikasi pindah ke kartu "Verifikasi AI"; kartu disembunyikan saat data gagal dimuat |
| IN-4 | Subjudul | copy | "Masalah non-pelatihan (SOP, alat, sistem, budaya) yang berjalan bersamaan dengan Training Needs agar solusi tepat sasaran." | "Tindakan perbaikan untuk masalah di luar pelatihan: …" | ImprovementNeedsView.vue:187 | rendah | Copy mockup · **Ditutup** ([p5-lna.md](p5-lna.md)) |
| IN-5 | KPI | copy | Notes: "total tercatat", "klik status untuk ubah", "perbaikan proses", "perlu dukungan manajemen" | Hanya kartu 1 ber-note ("N lewat tenggat") | ImprovementNeedsView.vue:220-223 | rendah | Tambah note; "lewat tenggat" boleh tetap di kartu 1 · **Ditutup** ([p5-lna.md](p5-lna.md)) |
| IN-6 | Judul tabel | layout | h2 "Tindakan perbaikan" di luar tabel (margin-top 24) | Caption kecil di dalam bingkai, di bawah toolbar | ImprovementNeedsView.vue:272-276 | sedang | h2 di luar; tabel `caption-hidden`; tombol toolbar ke kanan h2 · **Ditutup** ([p5-lna.md](p5-lna.md)) |
| IN-7 | Tabel, lebar | layout | 7 kolom muat di 1440px, teks satu baris | +kolom Aksi (Ubah + "Verifikasi lewat AI"); di 1280px kolom teks terlipat 3-4 baris dan kolom Aksi terpotong ("Verifikasi le…") | ImprovementNeedsView.vue:66-73, 304-309 | tinggi | Aksi jadi menu ikon (`more_vert`) atau dipindah ke panel detail; `min-width` kolom Temuan · **Ditutup** ([p5-lna.md](p5-lna.md)): kolom Aksi dihapus; klik baris → `?ubah=<id>` membuka formulir ubah dengan "Verifikasi lewat AI" (K-P5-5); muat di 1440 dan 1280 |
| IN-8 | Status | komponen | Chip status yang bisa diklik (toggle) | `select` native | ImprovementNeedsView.vue:293-302 | sedang | Chip-tombol dengan menu status berikut (tetap aksesibel) |
| IN-9 | Catatan akses | copy | "**Akses:** HR dan atasan langsung dapat melihat tindakan; pemilik tindakan adalah pegawai pada jabatan …" (13px) | "Akses: HR melihat semua tindakan. Atasan langsung … hanya bila HR memberinya akses." | ImprovementNeedsView.vue:311-313 | rendah | Tebalkan "Akses:"; isi sesuai aturan PM-6 (disengaja) · **Sebagian** ([p5-lna.md](p5-lna.md)): "Akses:" tebal 13px; isi tetap PM-6 (disengaja) |
| IN-10 | Kelola | komponen | Tidak ada | "Tambah tindakan", "Lihat N tindakan yang menyangkut individu", kartu "Akses atasan" | ImprovementNeedsView.vue:277-282, 315-326 | rendah | Tambahan disengaja; catat |
| IN-11 | Atasan tanpa akses | state/token | Atasan melihat daftar penuh seperti HR | Note `critical` (merah) "HR belum memberi Anda akses …", tanpa KPI | ImprovementNeedsView.vue:189, 49 | sedang | Akses atasan lewat grant disengaja (PM-6); tapi tone harus `info`/`warning`, bukan galat · **Ditutup** ([p5-lna.md](p5-lna.md)): nada `warning` untuk tanpa akses; galat lain tetap `critical` |

## Layar mockup yang tidak ada sama sekali di aplikasi

- **Tinjauan temuan AI per gap** (`review`, M:672-702): aplikasi hanya punya antrean POC lama (RV-1).
- **Kartu "Agen AI · …"** sebagai komponen: tidak ada di CC-VM, CC-Values, DNA, TNA (P1).
- **Sesi pratinjau wawancara pimpinan untuk HR** (`aivChat`/`aivDone` dengan role HR, "Pratinjau sesi pimpinan; tidak disimpan.") (AH-8).
- **Detail gap dari tabel Core Competencies** (baris CC membuka `gap` dengan breadcrumb "Core Competencies") (CC-3, TD-1).

## Perlu keputusan

1. Fitur kelola HR yang tidak ada di mockup (tambah/ubah/validasi persyaratan, kelola program 5C, "Sahkan kamus", tambah tindakan INA, akses atasan): pertahankan di halaman, atau sembunyikan di balik "Kelola" agar tata letak 1:1? (CC-3, CC-8, CV-6, DN-10, IN-10)
2. Penugasan wawancara (form tenggat/proyek/durasi) menggantikan tombol "Mulai wawancara akar masalah" di detail gap dan menambah field tanggal di tabel Wawancara AI (TD-5, AH-2, AA-4). Usul: tetap penugasan, form di dialog.
3. Atasan: mockup memberi atasan akses ke Tinjauan HR, daftar INA penuh, dan "Langsung ke tinjauan HR". Aplikasi membatasi (review hanya HR; INA lewat grant PM-6). (RV-3, TD-6, IN-11)
4. Pengelolaan TNA POC di bawah papan gap: hapus dari `/tna` saat papan menyala? (TN-2)
5. Skala skor: TNA menampilkan "%" dan kamus skala 0-4, mockup 0-100 tanpa satuan (TN-8, DN-10). Desimal koma vs titik (CV-11).
6. Copy khusus Elitery ("nilai 5C", "Skor karakter 5C", "Sumber: elitery.com") vs teks netral tenant (CC-2, CV-3, AH-5).
7. Baris "Belum diwawancarai" di klasifikasi gap TNA (TN-4) dan kolom Orang/Status wawancara di tabel gap (TN-7, TN-11).
8. Pratinjau sesi HR: chat simulasi penuh atau daftar pertanyaan (AH-8).

## Hitungan

Tinggi 10 · Sedang 30 · Rendah 39 (total 79; tidak termasuk butir ber-bobot "-").
