# Gap kesetaraan UI: peran lain (Karyawan, Admin Tenant, Super Admin)

Acuan: `tools/mockup-render/Main.dc.html` (template baris 281-293, 548-669, 885-935, 1165-1250; logika 1435-1443, 1669-1767, 1826-1835, 2095-2170).
Bukti aplikasi: screenshot e2e + screenshot tambahan di `parity/shots-peran/` (alur iv dan aiv lengkap) dan `parity/specs-peran/out-e2e/` (super admin; app-shots lama untuk super-admin dan iv ternyata berisi layar Hasil saya, jadi diambil ulang).
Path file relatif ke `apps/web/src/`. Shell (drawer/top bar, pemilih tampilan) tidak dinilai.

Bobot: tinggi = bagian/fitur yang terlihat di mockup tidak ada; sedang = beda komponen/state/copy yang jelas terlihat; rendah = beda kecil token/jarak/teks.

## Lintas layar

| ID | Layar/state | Jenis | Mockup | Aplikasi | File:baris | Bobot | Usulan perbaikan |
|---|---|---|---|---|---|---|---|
| X-1 | Semua layar kecuali EliteMentor | hilang | FAB `smart_toy` kanan bawah membuka panel "Asisten ELGOS" (header primer, chip saran per peran, input "Tanya apa saja", catatan "Hanya menjawab dari data yang boleh Anda lihat sebagai {peran}. Jawaban dicatat di log audit.") | Tidak ada. API (`api/assistant.ts`) dan flag `assistant` sudah ada, tetapi belum ada `screens/*/ShellExtra.vue` | `components/AppShell.vue:30-34`, `api/assistant.ts:1` | tinggi | Buat `screens/b17-asisten/ShellExtra.vue` (FAB + panel dialog) di balik flag `assistant`; sembunyikan di layar login |

## Karyawan: Hasil saya (`/my`)

| ID | Layar/state | Jenis | Mockup | Aplikasi | File:baris | Bobot | Usulan perbaikan |
|---|---|---|---|---|---|---|---|
| MY-1 | Dengan undangan | layout | Note undangan diberi jarak 20px ke tabel | Note menempel ke tabel (0px): `.b8-list { margin:0 }` didefinisikan setelah `.b8-sub` dan menimpanya | `screens/b8-karyawan/MyResultsView.vue:70`, `screens/b8-karyawan/b8.css:8` | sedang | Pakai kelas jarak terpisah (mis. `margin-bottom:20px`) atau taruh `.b8-sub` setelah `.b8-list` |
| MY-2 | Dengan undangan | copy | "ada 1 wawancara singkat (±10 menit) tentang kompetensi dengan gap terbesar. Hasilnya dipakai …" | "wawancara singkat tentang hambatan kerja dan kompetensi Anda. … Tenggat …" | `screens/b8-karyawan/MyResultsView.vue:72` | sedang | Ikuti kalimat mockup dengan jumlah undangan dan durasi dari API; tenggat tetap boleh ditambahkan (lihat keputusan K-7) |
| MY-3 | Tabel kompetensi | komponen | Status = titik berwarna + teks warna teks biasa | `UiStatus` (ikon + teks berwarna) | `screens/b8-karyawan/MyResultsView.vue:83` | rendah | Lihat K-3 |
| MY-4 | Rencana kosong | copy | "Modul dari EliteMentor akan muncul di sini setelah HR menyetujui hasil wawancara." | "Modul akan muncul di sini …" | `screens/b8-karyawan/MyResultsView.vue:88` | rendah | Sisipkan nama tujuan belajar (`delivery.label`) bila tersedia |
| MY-5 | Rencana kosong | komponen | Tombol outlined "Lihat contoh rekomendasi" | Tidak ada tombol saat kosong | `screens/b8-karyawan/MyResultsView.vue:86-93` | rendah | Lihat K-6 |
| MY-6 | Seluruh layar | catatan | Tidak ada kartu "Data saya" | Kartu "Data saya" (unduh, tarik persetujuan, hapus) | `screens/b8-karyawan/DataSaya.vue:78-112` | — | Keputusan user 23 Nov; bukan gap |

## Karyawan: Rencana belajar (`/li`)

| ID | Layar/state | Jenis | Mockup | Aplikasi | File:baris | Bobot | Usulan perbaikan |
|---|---|---|---|---|---|---|---|
| LI-1 | Kartu | token | Chip mode: Online = `c-tr` (biru training), Offline = `c-no` (teal) | Chip mode tanpa tone (netral abu) | `screens/b8-karyawan/LearningPlanView.vue:150` | sedang | `tone` dari mode: online → `training`, offline → tone teal (`improvement`/token setara `c-no`) |
| LI-2 | Kartu offline | copy | Tombol "Ujian di EliteMentor" untuk pelatihan offline | Selalu "Belajar dengan {label}" / "Buka {label}" | `screens/b8-karyawan/view.ts:48-50` | sedang | `launchLabel` membaca mode: offline belum selesai → "Ujian di {label}" |
| LI-3 | Kartu | komponen | Ikon `smart_toy` 18px di tombol | Tanpa ikon | `screens/b8-karyawan/LearningPlanView.vue:162-164` | rendah | Tambah `UiIcon` di tautan bila target EliteMentor |
| LI-4 | Terisi | hilang | Note di bawah grid: "Pelatihan online dipelajari bersama EliteMentor. Untuk pelatihan offline, ujian dikerjakan di EliteMentor saat Anda berada di lokasi; skor langsung masuk ke ELGOS." | Tidak ada | `screens/b8-karyawan/LearningPlanView.vue:169` | sedang | Tambah `UiNote` (hanya bila `delivery.target === 'elitementor'`) |
| LI-5 | Kartu | catatan | Tidak ada baris "Alasan", chip "Tidak lulus", "Modul sedang disiapkan" | Ada | `screens/b8-karyawan/LearningPlanView.vue:152-157` | — | Tambahan data nyata; bukan gap |

## Karyawan: Wawancara akar masalah (`/iv`, `/iv/:id`)

Catatan: mockup langsung membuka sesi; aplikasi punya halaman daftar `/iv` lebih dulu (banyak sesi). Teks persetujuan aplikasi = teks legal PM-9 v1.0 (sengaja lebih panjang). Keduanya bukan gap.

| ID | Layar/state | Jenis | Mockup | Aplikasi | File:baris | Bobot | Usulan perbaikan |
|---|---|---|---|---|---|---|---|
| IV-1 | Persetujuan | copy/token | Judul h2 20px "Persetujuan sebelum mulai" | h3 15px/600 "Sebelum mulai: tentang wawancara ini" | `screens/b6-iv/PersetujuanTna.vue:75`, `screens/b6-iv/iv.css:3` | rendah | Judul h2 `.iv-h2` "Persetujuan sebelum mulai"; isi legal tetap |
| IV-2 | Persetujuan tanpa centang | komponen | Note galat sebaris di bawah judul: "**Ada masalah:** centang persetujuan untuk melanjutkan." | `UiErrorSummary` berbingkai di atas judul, berisi tautan | `screens/b6-iv/PersetujuanTna.vue:74` | rendah | Lihat K-4 |
| IV-3 | Persetujuan, sebelum setuju | state | Baris audit "… log audit: persetujuan belum · 0 jawaban" | Selalu "persetujuan tercatat", juga sebelum persetujuan diberikan | `screens/b6-iv/IvSessionView.vue:117-121` | sedang | Teks bergantung `step === 'consent'` → "persetujuan belum"; tambahkan awalan "model" |
| IV-4 | Semua langkah | layout | Baris audit `.meta` (mono 11px) di dalam kartu kanan, di bawah konten | Di luar kartu, di bawah grid | `screens/b6-iv/IvSessionView.vue:203` | rendah | Pindahkan `UiAuditLine` ke dalam `UiCard` kanan |
| IV-5 | Semua langkah | layout | Subjudul punya jarak 20px ke grid langkah | Jarak ±10px (`<p>` tanpa margin bawah) | `screens/b6-iv/IvSessionView.vue:128` | rendah | Margin `0 0 20px` seperti `.b8-sub` |
| IV-6 | Semua langkah | nav | Breadcrumb "Training Needs › Wawancara akar masalah" | "Wawancara akar masalah › Sesi" | `screens/b6-iv/IvSessionView.vue:126` | rendah | Lihat K-5 |
| IV-7 | Wawancara | komponen | Tombol jawaban saran (`.ac`) + input satu baris "Atau ketik jawaban Anda sendiri" | Hanya textarea "Tulis jawaban Anda" | `screens/b6-iv/PercakapanWawancara.vue:145-150` | sedang | Lihat K-2; minimal samakan placeholder bila opsi tidak ada |
| IV-8 | Wawancara | copy | Pill "Pertanyaan 2 dari 4" | "Pertanyaan 1, paling banyak 5" | `screens/b6-iv/PercakapanWawancara.vue:138` | rendah | "Pertanyaan {n} dari {batas}" (batas = maksimum) |
| IV-9 | Wawancara, transkrip (juga aiv) | token | `.msg`: tanpa border, radius 16 (sudut 4 di sisi pengirim), AI = surface-2, Anda = primer + teks putih, maks 78%, padding 12/16, area chat min 280px; label "ELGOS AI" | Border outline, radius 12, AI hampir transparan, Anda = primary-container, maks 85%; label "ELGOS-AI" | `screens/b6-iv/iv.css:8-12`, `screens/b6-iv/PercakapanWawancara.vue:142` | sedang | Samakan token gelembung ke `.msg` mockup (dipakai juga `b10-core-competencies/InterviewSession.vue:101`) |
| IV-10 | Ringkasan | komponen | Baris temuan `.mod`: teks + "Keyakinan AI: 80%" di kiri, chip jenis di kanan | Judul, detail, lalu chip + "Keyakinan AI sementara: 80%" di bawah | `screens/b6-iv/IvSessionView.vue:168-175` | rendah | Tata ulang: konten kiri, chip kanan (flex space-between) |
| IV-11 | Selesai | state | Note sukses hijau: "**Terima kasih.** Ringkasan sudah dikirim ke HR untuk ditinjau. Anda akan menerima rencana belajar atau kabar tindak lanjut." | Paragraf polos "Ringkasan sudah dikirim ke HR untuk ditinjau." | `screens/b6-iv/IvSessionView.vue:192-194` | sedang | `UiNote tone="success"` dengan teks mockup (tombol "Lanjut sebagai HR"/"Ulangi simulasi" = demo, abaikan) |

## Karyawan: Wawancara visi & nilai (`/aiv`)

Catatan: aplikasi menambah langkah persetujuan sebelum chat (mockup langsung chat). Disengaja (persetujuan wajib), bukan gap.

| ID | Layar/state | Jenis | Mockup | Aplikasi | File:baris | Bobot | Usulan perbaikan |
|---|---|---|---|---|---|---|---|
| AIV-1 | Daftar | copy/nav | Breadcrumb "Learning Needs Analysis › Wawancara AI", h1 "Wawancara AI" | Tanpa breadcrumb, h1 "Wawancara visi, misi, dan nilai" | `screens/b10-core-competencies/InterviewAssignmentView.vue:68-69` | rendah | Lihat K-5 |
| AIV-2 | Daftar | layout | Subjudul langsung di bawah h1 | Jarak 16px ekstra dari `.cc-stack > * + *` | `screens/b10-core-competencies/cc.css:4`, `InterviewAssignmentView.vue:72` | rendah | Subjudul `margin-top:0` (kelas sub seperti layar lain) |
| AIV-3 | Daftar | copy | Chip "Ditugaskan atasan"; tanpa penugasan: "Belum ada penugasan" + tombol nonaktif "Menunggu penugasan atasan" | "Ditugaskan"; tanpa penugasan: "Belum ditugaskan", tanpa tombol | `api/cca.ts:157-162`, `InterviewAssignmentView.vue:116-118` | rendah | Label khusus tampilan karyawan |
| AIV-4 | Daftar | token | Daftar ber-bullet (disc), jarak 16px sebelum tombol | Bullet hilang (`list-style` tidak diset), tombol menempel ke daftar | `screens/b10-core-competencies/cc.css:14` | sedang | `.cc-list { list-style: disc; margin: 0 0 16px }` |
| AIV-5 | Daftar | copy | "Sekitar 10 menit, 4 pertanyaan singkat." | "Sekitar 10 menit. Batas waktu 30 November 2026." | `screens/b10-core-competencies/InterviewAssignmentView.vue:122` | rendah | Tambah jumlah pertanyaan (kirim `questionCount` di daftar); batas waktu boleh tetap |
| AIV-6 | Chat | layout | Kartu penugasan diganti kartu "Percakapan" mandiri | Sesi disisipkan di dalam kartu penugasan, di bawah teks dan bullet | `InterviewAssignmentView.vue:126-127`, `InterviewSession.vue:96` | sedang | Saat sesi terbuka, sembunyikan isi kartu penugasan dan tampilkan kartu sesi sendiri |
| AIV-7 | Chat | hilang | Baris audit "Agen ELGOS (POC) · log audit: …" | Tidak ada | `screens/b10-core-competencies/InterviewSession.vue:96-123` | rendah | Tambah `UiAuditLine` di kartu sesi |
| AIV-8 | Chat | token | Pilihan jawaban `.ac`: kotak radius 8, outline netral, teks warna teks | `UiButton` outlined berbentuk pil dan berwarna primer | `screens/b10-core-competencies/InterviewSession.vue:105-107` | rendah | Varian tombol "saran" di ui-kit sesuai `.ac` (dipakai juga IV-7) |
| AIV-9 | Ringkasan/Selesai | state | h2 "Ringkasan AI" + catatan + baris `.mod` (pertanyaan kecil abu, jawaban tebal) + note hijau "**Terkirim.** Hasil diringkas ke HR dan atasan hanya melihat status selesai." + tombol "Kembali ke penugasan" | h2 "Terkirim", `dl` dua kolom, tanpa note hijau dan tanpa tombol kembali | `screens/b10-core-competencies/InterviewSession.vue:125-146` | sedang | Ikuti susunan mockup; tombol kembali menutup sesi (`openId = null`) |

## Admin Tenant: Pengguna & peran (`/admin/pengguna`)

| ID | Layar/state | Jenis | Mockup | Aplikasi | File:baris | Bobot | Usulan perbaikan |
|---|---|---|---|---|---|---|---|
| ADM-1 | Semua layar Admin Tenant | nav | Navigasi hanya lewat drawer | Baris pil "Pengguna & peran · Jabatan … · Impor …" di atas h1 (dibuat saat peran tenant_admin belum ada; kini drawer sudah memuatnya) | `screens/b11-admin/AdminNav.vue:1-18`; dipakai di `UsersView.vue:116`, `JobsView.vue:85`, `ConfigView.vue:51` | sedang | Hapus `AdminNav` dari ketiga layar |
| ADM-2 | Setelah undang (juga tindakan lain) | komponen | Note sukses hijau (`note g`) di atas tabel | Teks hijau tebal polos `adm__notice` | `screens/b11-admin/UsersView.vue:123,192`; pola sama `b12-super-admin/TenantsView.vue:144,228`, `PlatformView.vue:108,281` | sedang | Ganti dengan `UiNote tone="success"` (pertahankan `role="status"`) |
| ADM-3 | Daftar | layout | "Undang pengguna" (ikon `person_add`) rata kanan di baris chip, di luar tabel | Di toolbar tabel setelah kotak cari, tanpa ikon | `screens/b11-admin/UsersView.vue:160-165` | rendah | Tambah `icon="person_add"`, dorong ke kanan |
| ADM-4 | Daftar | token | Email mono 12px | Mono ukuran teks biasa | `screens/b11-admin/UsersView.vue:46` | rendah | Kelas mono kecil untuk kolom email |
| ADM-5 | Daftar | layout | Nama satu baris | Nama terlipat ("Admin / Satu") karena kolom Aksi lebar | `screens/b11-admin/UsersView.vue:167` | rendah | `white-space:nowrap`/lebar minimum kolom nama |

## Admin Tenant: Jabatan & kamus kompetensi (`/admin/jabatan`)

| ID | Layar/state | Jenis | Mockup | Aplikasi | File:baris | Bobot | Usulan perbaikan |
|---|---|---|---|---|---|---|---|
| JOB-1 | Daftar | copy | Subjudul diakhiri "Saat ini baru Engineer Service Delivery yang tersedia." | Kalimat itu tidak ada | `screens/b11-admin/JobsView.vue:87` | rendah | Kalimat dinamis dari jabatan berkamus "tersedia" |
| JOB-2 | Daftar | token/copy | Angka mono rata kiri; jabatan tanpa kamus "—" | Rata kanan; "0" | `screens/b11-admin/JobsView.vue:28-29` | rendah | "—" bila `dictionary !== 'tersedia'`; perataan kiri seperti mockup |
| JOB-3 | Daftar | copy | Sumber abu "DACUM Service Delivery v2.1" / "Belum ada lokakarya DACUM" | "DACUM · DACUM_SD_v2.1.xlsx" / "Belum ada kamus" | `screens/b11-admin/JobsView.vue:34-37` | rendah | Teks kosong "Belum ada lokakarya DACUM"; warna muted |

## Admin Tenant: Impor data & integrasi (`/admin/impor`)

| ID | Layar/state | Jenis | Mockup | Aplikasi | File:baris | Bobot | Usulan perbaikan |
|---|---|---|---|---|---|---|---|
| CFG-1 | Kartu 1 & 2 | komponen | Berkas di kotak `.mod` berbingkai: ikon (`table_chart`/`upload_file`) + nama berkas + chip kanan | Daftar bergaris pemisah tanpa ikon | `screens/b11-admin/ConfigView.vue:63-65,83-85` | rendah | Bungkus tiap baris dengan kotak berbingkai radius 12 + ikon |
| CFG-2 | Integrasi | copy | "EliteMentor: tersambung (SSO · deep link · sync-back)" | "EliteMentor: Terkonfigurasi (SSO · sync-back)"; chip tambahan "Tujuan pembelajaran: …" | `screens/b11-admin/ConfigView.vue:45,104-105` | rendah | Pakai kata "tersambung" (huruf kecil) dan sebut deep link bila aktif |
| CFG-3 | Kartu 1 & 2 | layout | Kartu ringkas, tanpa formulir | Formulir impor (`ImportFlow`) selalu terbuka di dalam kartu | `screens/b11-admin/ConfigView.vue:75,97` | rendah | Lipat di balik tombol "Impor berkas" |
| CFG-4 | Kartu 2 | copy/token | Chip hijau "3 key result" | Chip kuning "3 target · 2 belum tercapai" | `screens/b11-admin/ConfigView.vue:85` | rendah | Chip sukses jumlah key result; info belum tercapai di teks |

## Super Admin: Tenant (`/tenants`)

| ID | Layar/state | Jenis | Mockup | Aplikasi | File:baris | Bobot | Usulan perbaikan |
|---|---|---|---|---|---|---|---|
| TEN-1 | Daftar | copy | "Super admin mengonfigurasi multi-tenant: satu tenant adalah satu perusahaan dengan datanya sendiri." | "Semua organisasi pengguna ELGOS. Super Admin melihat metadata dan angka; transkrip …" | `screens/b12-super-admin/TenantsView.vue:133` | rendah | Pakai teks mockup (+ kalimat transkrip boleh tetap) |
| TEN-2 | KPI | copy | Catatan "dari 3 tenant terdaftar", "seluruh tenant", "dapat diaktifkan per tenant" | "dari 3 tenant", (kosong), "dari 8 modul" | `screens/b12-super-admin/TenantsView.vue:139-141` | rendah | Samakan catatan KPI |
| TEN-3 | Daftar | layout | Di bawah tabel selalu ada dua kartu berdampingan: "Modul untuk {tenant terpilih}" dan "Buat tenant baru" | Formulir disembunyikan di balik tombol (muncul di atas tabel); panel modul hanya setelah klik "Modul" | `screens/b12-super-admin/TenantsView.vue:147-176,181,194` | sedang | Grid 2 kolom di bawah tabel; tenant pertama terpilih bawaan; baris bisa diklik untuk memilih |
| TEN-4 | Panel modul | komponen | Sakelar (`sw2`) per modul, satu baris nama + chip "Akses awal" | Tabel 4 kolom (Modul/Akses/Status/Nyalakan) dengan checkbox | `screens/b12-super-admin/TenantsView.vue:201-212` | sedang | Tambah `UiSwitch` di ui-kit (role="switch"), info Akses/Status dipindah ke teks kecil |
| TEN-5 | Daftar | copy | Modul aktif "5 / 8" | "3" | `screens/b12-super-admin/TenantsView.vue:38` | rendah | Format "{aktif} / {tersedia}" |
| TEN-6 | Buat tenant | hilang | Placeholder "PT Contoh Sejahtera"/"admin@contoh.co.id" dan catatan "Admin tenant menerima undangan dan menyiapkan pengguna, jabatan, dan data sendiri." | Tidak ada | `screens/b12-super-admin/TenantsView.vue:151-174` | rendah | Tambahkan |

## Super Admin: Konfigurasi platform (`/platform`)

| ID | Layar/state | Jenis | Mockup | Aplikasi | File:baris | Bobot | Usulan perbaikan |
|---|---|---|---|---|---|---|---|
| PLT-1 | Halaman | copy | "Pengaturan yang berlaku untuk seluruh tenant. Perubahan dicatat di log audit platform." | "Pengaturan di halaman ini berlaku untuk semua tenant ELGOS." | `screens/b12-super-admin/PlatformView.vue:103` | rendah | Teks mockup |
| PLT-2 | 4 kartu ringkasan | komponen/copy | Deskripsi abu + chip (Isolasi, Model) atau daftar bullet (Kebijakan, Autentikasi); model "ELGOS-AI (POC)" + chip "Kesepakatan AI–HR ≥ 85% (kriteria pilot)" | Daftar kunci-nilai (`dl`); model "bedrock · model-uji"; deskripsi model tidak ada | `screens/b12-super-admin/PlatformView.vue:111-141` | rendah | Susunan deskripsi + chip; label model lihat K-8. "Verifikasi dua langkah: tidak dipakai" = PD-10, bukan gap |

## Layar mockup yang tidak ada di aplikasi

1. **EliteMentor dalam ELGOS** (`em`, breadcrumb "Rencana belajar › EliteMentor"): online = stepper Materi → Tanya jawab → Mini quiz → Hasil dengan chat EliteMentor; offline = Check-in di lokasi (kode sesi, galat "Kode sesi tidak cocok…") → Ujian di tempat → Hasil; catatan "Progres dan skor disinkronkan ke ELGOS (Learning Delivery) secara otomatis." Aplikasi hanya membuka `launchUrl` di tab baru (`screens/b8-karyawan/LearningPlanView.vue:162`). Lihat K-1.
2. **Asisten ELGOS** (FAB + panel), lihat X-1.

## Perlu keputusan

- K-1: Layar EliteMentor (belajar online, check-in offline) dibuat di ELGOS atau tetap di produk EliteMentor lewat deep link? Aturan arsitektur 1 (integrasi hanya API/webhook) mengarah ke deep link; mockup menaruhnya di dalam shell ELGOS.
- K-2: Wawancara akar masalah (TNA): apakah AI mengirim pilihan jawaban seperti mockup dan seperti wawancara visi & nilai? Bila tidak, cukup samakan placeholder dan gaya input.
- K-3: Label status: mockup memakai titik (Hasil saya) dan chip (Pengguna, Tenant); aplikasi memakai `UiStatus` ikon + teks di semua layar (uji ui-kit "setiap label punya ikon dan teks"). Ikuti mockup atau pertahankan demi aksesibilitas?
- K-4: Galat persetujuan: note sebaris mockup vs `UiErrorSummary` standar ui-kit.
- K-5: Breadcrumb/judul karyawan: mockup memakai "Training Needs ›" (iv) dan "Learning Needs Analysis › Wawancara AI" (aiv), padahal karyawan tidak punya menu itu. Kemungkinan artefak mockup.
- K-6: Tombol "Lihat contoh rekomendasi" di Rencana belajar kosong: perlu halaman contoh, atau dihilangkan karena demo?
- K-7: Teks undangan di Hasil saya: mockup "kompetensi dengan gap terbesar", wawancara aplikasi berfokus pada KPI yang belum tercapai.
- K-8: Konfigurasi platform menampilkan ID penyedia model ("bedrock · model-uji") atau label produk "ELGOS-AI (POC)"?
- K-9: Mockup Pengguna & peran: "Peran dapat diatur setelah mereka menerima undangan"; aplikasi mengatur peran saat mengundang. Pertahankan perilaku aplikasi (disarankan).

## Ringkasan jumlah

tinggi 1 · sedang 16 · rendah 33 (total 50), ditambah 2 layar hilang (satu tumpang tindih dengan X-1) dan 9 butir perlu keputusan.
