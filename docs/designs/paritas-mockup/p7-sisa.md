# P7 · Sisa gap sedang/rendah (paritas mockup)

Bagian dari [rencana paritas](README.md). Lingkup: gap yang tersisa setelah P2–P6 untuk Learning Delivery (`screens/b14-ld`), Career & Promotion (`screens/b16-cp`), layar peran lain (Karyawan, Admin Tenant, Super Admin), `ProgramSection` Core Competencies (CV-2/4/5 yang ditunda dari P5), dan baris shell/dashboard rendah. Tidak menyentuh `b15-lim` (LIM-*, thread lain), `b7-tinjauan`, dan `b13-li`.

Keputusan user 23 Nov: tata letak, copy, dan komponen ikut mockup 1:1. Fitur kelola tambahan tidak dibuang tetapi dipindah ke pola sekunder (`<details>` "Kelola …"). `UiStatus` global tidak diubah (K-3); status di layar yang mockup-nya memakai chip memakai `UiChip` lokal (pola K-P6-2). API tidak diubah.

Acuan domain: [b14-learning-delivery.md](../b14-learning-delivery.md), [b16-career-promotion.md](../b16-career-promotion.md), B0 (`docs/designs/b0-fondasi-ui.md`). Mockup: `tools/mockup-render/Main.dc.html` (LD 936–1006 + data 1453–1510; CP 1119–1162 + data 1595–1645; aiv 636–668; iv 560–600; admin 1165–1250).

## Gap yang ditutup

### Learning Delivery ([gaps-modul.md](gaps-modul.md) §2)

| Gap | Perbaikan |
| --- | --- |
| LD-1 | Intro "…diambil otomatis dari ELGOS, EliteMentor, atau LMS…" |
| LD-2 | Catatan KPI "{x} online, {y} offline", "belum selesai", "rata-rata antar program", "terlambat atau di bawah jadwal" |
| LD-3 (sebagian) | Tiap insight kartu outlined (`.ld-mod`): judul tebal + chip sumber netral rata kanan + detail 13px. Judul "Insight" dan catatan "bukan oleh AI" tetap (PK-5) |
| LD-5 | Kolom 1 subjudul "{kode} · {tier} · {vendor}" (yang ada); Sumber = chip mode (Online `training`, Offline `improvement`) + sumber ("Input manual di ELGOS"); batang `critical` bila terlambat; status `UiChip` (ok→success, watch→review, late→critical); Batas mono "30 Nov" |
| LD-6 | Catatan bawah jadi `UiNote` info |
| LD-7 | Form tanggal online pindah ke `<details>` "Kelola tanggal pelatihan online" (fitur dipertahankan, PK-2 diselesaikan keputusan 23 Nov) |
| LD-8 | Akan datang: tanggal mono; subjudul "vendor · tempat"; Jenis chip mode; kesiapan chip (success/review) tanpa akhiran "belum siap"; baris saran ("Siap dilaksanakan" / "Saran: siapkan {cek pertama yang kurang} sebelum hari-H"); tombol tiap baris: offline "Kelola" (buka tab offline), online "Lihat saran" (tab Ringkasan) |
| LD-9 | Daftar offline = kartu outlined (`.ld-mod`, terpilih garis `--el-primary`); chip "Akan datang" `review`, "Selesai" `success`, "Berjalan" `training` |
| LD-10 | Placeholder input tambah ("Judul pelatihan", "Vendor atau penyedia", "Tempat"); label tetap (aksesibilitas) |
| LD-11 | "Tandai materi siap" pindah ke baris kelengkapan Materi; form ubah jadwal dibuka tombol "Ubah" di baris Jadwal; "Tandai selesai" dan "Batalkan pelatihan" pindah ke `<details>` "Kelola pelatihan" di bawah kartu |
| LD-12 | Kelengkapan data: tiap baris chip "Lengkap"/"Kurang"/"Menunggu"/"Opsional" + judul + detail dari data detail (jadwal "8 Des 2026 · tempat", peserta "{n} peserta", kehadiran "{x} dari {n} sudah dicatat, hadir {h}", asesmen = label status, dokumentasi "{n} foto atau video", materi "Materi siap"/"Materi belum ditandai siap") + tombol kanan (Ubah, Tandai siap, Tambah, Tandai semua hadir, Atur di bawah, Unggah) |
| LD-13 | Peserta memakai `UiDataTable` (Peserta / Kehadiran / Skor bila asesmen / Tindakan); status `UiChip`; satu tombol tonal "Tandai hadir" (atau "Tandai tidak hadir" bila sudah hadir). Tambah per jabatan/karyawan dan hapus peserta pindah ke `<details>` "Ubah daftar peserta" |
| LD-14 | Asesmen kartu outlined: chip status + teks "Pilih cara menjalankan asesmen. Disarankan lewat EliteMentor atau LMS agar skor langsung masuk ke ELGOS tanpa input ulang." (status none) + tombol kanan "Jalankan lewat EliteMentor", "Input skor dari vendor"; field kode asesmen muncul setelah memilih EliteMentor |
| LD-15 (sebagian) | "{n} berkas foto atau video terunggah" + tombol tonal "Unggah foto atau video" (input file tersembunyi, jenis dari MIME: image→photo, video→video, lain→material); catatan PDP mono 11px. Kalimat "hanya bisa dibuka oleh HR" tetap (PK-6, sesuai perilaku) |
| X-2 (LD) | Semua status di LD memakai `UiChip` |
| X-4 (LD) | `<label class="el-label">` + select di LD diganti `UiField` |

### Career & Promotion ([gaps-modul.md](gaps-modul.md) §4)

| Gap | Perbaikan |
| --- | --- |
| CP-1 (sebagian) | HR: "Seluruh divisi dan departemen." Atasan tetap "bawahan langsung" (PK-8, RG-3) |
| CP-2 | KPI "Memenuhi syarat jenjang berikutnya" ("program dan OKR ≥ 80%; belum keputusan"), "Belum memenuhi kompetensi jabatan" ("perlu lulus program tingkat jabatannya") |
| CP-3 | Label terlihat "Divisi:" sebelum segmented |
| CP-4 (sebagian) | Kolom "Bukti" dihapus; nama karyawan jadi tombol pemilih (`aria-pressed`) dan baris terpilih disorot (`--el-surface-2`); kolom "Divisi · departemen" menunggu field departemen di API |
| CP-5 (sebagian) | Ikon centang di chip program dihapus (status tetap terbaca lewat teks sr-only). Label "Advanced" tetap (PK-9) |
| CP-6 | `on_track` → chip `review`; sub per status: "Perlu lulus {tier}", "Program dan OKR terpenuhi; menunggu keputusan", "OKR saat ini {n}%", nama jenjang (tertinggi) |
| CP-7 (sebagian) | Label "Pencapaian OKR (syarat ≥ {min}%)", nilai "{n}% · terpenuhi/belum"; footer "Promosi memerlukan dua syarat: lulus program jenjang berikutnya dan OKR ≥ {min}%. AI hanya menyusun ringkasan dan tidak merekomendasikan keputusan." Wawancara ulang tetap "Belum tersedia" (LIM-8) |
| CP-8 | Catatan keputusan copy mockup (HR / atasan) |
| CP-9 (sebagian) | Syarat "Program dan OKR terpenuhi" / "OKR {n}% < {min}%" / "OKR belum ada". Sub departemen menunggu API |
| CP-10 | Input catatan pindah ke `<details>` "Tambah catatan" di sel tindakan; tombol tonal tetap terlihat |

### Core Competencies, Values ([gaps-lna.md](gaps-lna.md))

| Gap | Perbaikan |
| --- | --- |
| CV-2 | Bar skor per nilai `success` bila ≥ ambang, `critical` bila di bawah; ambang = band tertinggi program atau nilai lulus, mana yang lebih besar (K-P7-4) |
| CV-4 | Tabel komponen dan divisi: h3 di kartu, `UiDataTable caption-hidden`, bingkai tabel dalam kartu dihapus (`.cc-flat`) |
| CV-5 | Butir rekomendasi kotak `.mod` (`cc-mod`); tombol "Wawancarai karyawan yang belum selesai" (ke rute `cc-wawancara`, hanya bila flag `cca.interview`/rute terbuka) |

### Peran ([gaps-peran.md](gaps-peran.md))

| Gap | Perbaikan |
| --- | --- |
| MY-1 | Sudah ditutup P2 ([p2-bug-tampilan.md](p2-bug-tampilan.md)); hanya ditandai |
| LI-1 | Chip mode: online `training`, offline `improvement` |
| LI-2 | `launchLabel`: offline belum selesai → "Ujian di {label}" |
| LI-3 | Ikon `smart_toy` di tombol bila target EliteMentor |
| LI-4 | `UiNote` di bawah grid bila target EliteMentor, copy mockup |
| IV-1 | Judul h2 `.iv-h2` "Persetujuan sebelum mulai"; isi legal tetap |
| IV-3 | Audit "log audit: persetujuan belum · 0 jawaban" saat langkah persetujuan |
| IV-4 | `UiAuditLine` di dalam kartu kanan |
| IV-5 | Subjudul margin `0 0 20px` |
| IV-8 | "Pertanyaan {n} dari {batas}" |
| IV-9 | Gelembung `.iv-msg` = `.msg` mockup (tanpa border, radius 16 dengan sudut 4, AI `--el-surface-2`, Anda `--el-primary` teks `--el-on-primary`, maks 78%, padding 12/16, area chat min 280px); label "ELGOS AI" (juga aiv) |
| IV-10 | Temuan: konten + "Keyakinan AI: n%" kiri, chip kanan |
| IV-11 | `UiNote` success "**Terima kasih.** Ringkasan sudah dikirim ke HR untuk ditinjau. Anda akan menerima rencana belajar atau kabar tindak lanjut." |
| AIV-2 | Subjudul tanpa jarak ekstra (`.cc-sub`) |
| AIV-4 | `.cc-list` disc + margin bawah 16px |
| AIV-6 | Saat sesi karyawan terbuka, kartu penugasan diganti kartu sesi mandiri |
| AIV-7 | `UiAuditLine` "Agen ELGOS (POC) · log audit: {n} jawaban" di sesi chat |
| AIV-9 | Ringkasan/terkirim: h2 "Ringkasan AI", catatan muted, baris `.mod` (tema kecil abu, jawaban tebal), note success "**Terkirim.** Hasil diringkas ke HR dan atasan hanya melihat status selesai." + tombol "Kembali ke penugasan" (menutup sesi) |
| ADM-1 | `AdminNav` dihapus dari tiga layar (file dihapus) |
| ADM-2 | Pemberitahuan sukses = `UiNote tone="success"` dalam pembungkus `role="status"` (Users, Jobs, Tenants, Platform) |
| ADM-3 | "Undang pengguna" ikon `person_add`, rata kanan toolbar |
| ADM-4 | Email mono 12px |
| ADM-5 | Nama `white-space: nowrap` |
| JOB-2 | Jumlah "—" bila kamus belum tersedia; rata kiri |
| JOB-3 (sebagian) | Sumber kosong "Belum ada lokakarya DACUM", muted; sumber terisi tetap "DACUM · berkas" |
| CFG-2 (sebagian) | "EliteMentor: tersambung (…)" huruf kecil; "deep link" tidak disebut karena API tidak mengirim statusnya |
| TEN-1 | Subjudul mockup + kalimat transkrip |
| TEN-2 | Catatan KPI "dari {n} tenant terdaftar", "seluruh tenant", "dapat diaktifkan per tenant" |
| TEN-5 | Modul aktif "{aktif} / {tersedia}" |
| TEN-6 | Placeholder "PT Contoh Sejahtera" / "admin@contoh.co.id" + catatan admin tenant |
| PLT-1 | Subjudul mockup |

### Shell/dashboard ([gaps-shell.md](gaps-shell.md))

| Gap | Perbaikan |
| --- | --- |
| S2 | Sudah ditutup P2; hanya ditandai |
| L1–L7 | Sudah ditutup P4 ([p4-login.md](p4-login.md)); hanya ditandai |
| D2 | Baris Pareto: angka mono rata kanan di baris label, batang di bawah |
| D3 | Tombol "Buka" status modul `variant="text"` |

## Tidak dikerjakan

| Gap | Alasan |
| --- | --- |
| LD-4 | API hanya punya dua jenis aksi (`remind`, `open_training`); label sudah dipetakan. Label lain butuh jenis aksi baru di API |
| LD-3 judul, LD-15 copy PDP, CP-1 atasan, CP-5 label | PK-5, PK-6, PK-8, PK-9 (perlu keputusan) |
| CP-4/CP-9 departemen | Butuh field departemen di API karier (bukan perubahan aditif sepele: tabel karyawan belum punya kolom departemen) |
| MY-2, MY-3, MY-5, IV-2, IV-6, IV-7, AIV-1, AIV-8, K-1… | Butir K-x (perlu keputusan) di gaps-peran; AIV-1 sudah ditutup P3 sebagian (breadcrumb) |
| MY-4, AIV-3, AIV-5 | Butuh data tambahan (`delivery.label` di Hasil saya, `questionCount` di daftar) |
| TEN-3, TEN-4 | Tata letak dua kartu + sakelar per modul: `UiSwitch` sengaja ditunda di B0 §11; TEN-3 bergantung padanya |
| JOB-1, CFG-1, CFG-3, CFG-4, PLT-2 | Rendah, butuh data (jabatan "tersedia", jumlah key result) atau K-8; ditunda |
| T1, T3, T4, D4, S3, S4, S6 | T1 mengubah warna semua chip (perlu cek kontras gelap tersendiri), T3/T4 komponen bersama, D4 = K-D3, S3/S6 perlu keputusan, S4 milik `b13-li` (di luar lingkup) |

## Keputusan

- K-P7-1: Chip mode offline memakai tone `improvement` (teal tersier) sebagai padanan `c-no` mockup, sama di LD dan Rencana belajar.
- K-P7-2: Fitur kelola LD (tanggal online, selesai/batal, tambah/hapus peserta) dipertahankan di `<details>` sekunder; tidak ada fungsi yang dibuang.
- K-P7-4: Mockup memakai ambang 92 tetap untuk bar skor nilai; API tidak punya "target skor nilai". Ambang diambil dari konfigurasi program: `max(passScore, min band)` (band tertinggi, mis. Strong Culture Alignment).
- K-P7-3: Baris CP dipilih lewat tombol nama (bukan `<tr>` klik) agar tetap bisa dijangkau keyboard; sorotan baris memakai `:has()` pada tombol `aria-pressed`.

## Test (e2e, API mock)

1. `ld.spec.ts`: LD-1/2 copy; insight `.ld-mod` dengan chip; tabel berjalan chip "Online"/"Terlambat", "LMS klien", batang critical, Batas "10 Nov"; catatan UiNote; form tanggal di "Kelola tanggal pelatihan online"; akan datang chip "Asesmen" tanpa "belum siap", baris saran, tombol "Kelola"; offline: kelengkapan berdetail + tombol, "Tandai semua hadir", peserta `UiDataTable` + "Tandai hadir", asesmen "Jalankan lewat EliteMentor" memunculkan field kode, unggah lewat tombol tersembunyi (jenis photo dari MIME), "Kelola pelatihan" berisi Tandai selesai/Batalkan.
2. `b16-cp.spec.ts`: copy KPI, label "Divisi:", tanpa kolom Bukti, klik nama memilih baris + bukti, chip "Menuju" review + sub "Perlu lulus …", label OKR, catatan keputusan, syarat "Program dan OKR terpenuhi", catatan di details.
3. `core-competencies.spec.ts`: bar skor success/critical, h3 tabel di kartu tanpa bingkai ganda, rekomendasi `.cc-mod` + tombol wawancara.
4. `b8-karyawan.spec.ts`: chip mode, "Ujian di EliteMentor", note EliteMentor.
5. `iv.spec.ts`: judul persetujuan, audit "persetujuan belum", audit di dalam kartu, "Pertanyaan 1 dari 5", gelembung tanpa border/latar primer, note sukses selesai.
6. `cca-wawancara.spec.ts`: daftar disc, sesi mandiri, audit, ringkasan "Ringkasan AI" + note "Terkirim." + "Kembali ke penugasan".
7. `admin-tenant.spec.ts`, `super-admin.spec.ts`: tanpa AdminNav, note sukses, copy.
8. `dashboard.spec.ts`: tombol Buka bervarian teks, angka Pareto di kanan.

## Checklist file

- `apps/web/src/screens/b14-ld/{LearningDeliveryView,OfflinePanel}.vue`, `labels.ts`
- `apps/web/src/screens/b16-cp/CareerPromotionView.vue`
- `apps/web/src/screens/b10-core-competencies/{ProgramSection,InterviewAssignmentView,InterviewSession}.vue`, `cc.css`
- `apps/web/src/screens/b8-karyawan/{LearningPlanView.vue,view.ts}`
- `apps/web/src/screens/b6-iv/{IvSessionView,PercakapanWawancara,PersetujuanTna}.vue`, `iv.css`
- `apps/web/src/screens/b11-admin/{UsersView,JobsView,ConfigView}.vue`, `AdminNav.vue` (hapus)
- `apps/web/src/screens/b12-super-admin/{TenantsView,PlatformView}.vue`
- `apps/web/src/screens/b3-dashboard/DashboardView.vue` (+ snapshot `dashboard-hr-terang/gelap.png`)
- `apps/web/e2e/*.spec.ts` terkait
- `docs/designs/paritas-mockup/gaps-{modul,peran,lna,shell}.md` (tanda Ditutup/Sebagian)

## Review spek (mandiri; sesi induk menjalankan reviewer independen)

Lensa egm-design:
- Kesetiaan mockup: tiap perubahan dipetakan ke gap ID; PK/K dibiarkan dan dicatat. OK.
- Aksesibilitas: chip status tetap berteks; tombol pilih baris CP punya `aria-pressed` dan nama; input file tersembunyi tetap punya label sr-only dan dipicu tombol nyata; `<details>` memakai `summary` berteks. Pemberitahuan sukses tetap `role="status"` (pembungkus). OK.
- Token: hanya `--el-*`. Gelembung "Anda" memakai `--el-primary`/`--el-on-primary` (kontras ≥ 4.5:1 di kedua tema).

Lensa egm-implementation-readiness:
- Data: detail LD sudah memuat participantList, documents, readiness, materialsReady, assessmentStatus, venue → detail kelengkapan bisa dihitung di klien. CP: status + nextLevel + programs + okr cukup untuk sub status. OK.
- Risiko: test lama LD bergantung pada teks "belum siap", "Lengkapi", "Catat semua hadir", "Ambil skor dari EliteMentor", label "Unggah foto, video, atau materi" → disesuaikan. `AdminNav` dihapus → cek test yang mencarinya.
- Triase: tidak ada blocker. Minor: placeholder tanggal mockup ("mis. 20 Jan 2027") tidak dipakai karena input `type=date`.
