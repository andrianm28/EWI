# Paritas UI ELGOS dengan mockup Pak Eji (audit 23 Nov 2026)

Acuan: mockup final Pak Eji (keputusan user 19 Nov), berkas `/mnt/project-files/mockup-pak-eji/Main.dc.html` di folder proyek (tidak disimpan di repo publik sejak audit PR 39 butir 39-5; lihat `tools/mockup-render/README.md`). Yang dibandingkan: `apps/web` di `claude/project-thread-scbrmb` head `524dead` (sudah termasuk PR #38).

## Cara membandingkan

1. **Mockup.** Runtime artifact (`support.js`) tidak ikut tersalin, jadi `tools/mockup-render/support.js` mengimplementasikan ulang format `.dc.html` seminimal mungkin: `{{ }}`, `sc-if`, `sc-for`, `onX`, dan `DCLogic.setState`. `node tools/mockup-render/catalog.cjs [--mockup <path>] <folder>` (mockup bawaan dari folder proyek) memotret 70 state (5 peran, semua tab dan langkah utama) beserta teks `innerText`-nya.
2. **Aplikasi.** Semua e2e dijalankan dengan `screenshot: { mode: 'on', fullPage: true }`, sehingga ada satu PNG akhir untuk setiap test (API di-mock). Untuk state yang tidak tercakup, dibuat spec sementara di luar repo.
3. Satu reviewer untuk tiap grup layar membandingkan screenshot berdampingan, lalu membaca kode layar supaya setiap gap menunjuk `file:baris`.

Data demo boleh berbeda. Yang dinilai: struktur, urutan bagian, teks statis, komponen, token, ikon, menu, dan state. Keputusan proyek yang sudah tercatat (PD-10 login lewat tautan email, flag, RG-3, privasi transkrip, aturan arsitektur 1) tidak dihitung sebagai gap.

## Hasil

| Grup | File | Tinggi | Sedang | Rendah | Total |
| --- | --- | --- | --- | --- | --- |
| Shell, token, login, dashboard | [gaps-shell.md](gaps-shell.md) | 1 | 7 | 13 | 21 |
| LNA: Core Competencies, DNA, TNA, tinjauan, INA | [gaps-lna.md](gaps-lna.md) | 10 | 30 | 39 | 79 |
| Modul 2–5: LI, LD, LIM, CP | [gaps-modul.md](gaps-modul.md) | 8 | 28 | 37 | 73 |
| Karyawan, Admin Tenant, Super Admin | [gaps-peran.md](gaps-peran.md) | 1 | 16 | 33 | 50 |
| **Jumlah** | | **20** | **81** | **122** | **223** |

Asisten ELGOS tercatat di dua grup (S1 dan X-1 peran), jadi butir tinggi yang unik ada 19.

Yang sudah sama: 27 token warna `:root`, menu kelima peran (fungsi `N`) kecuali butir HR tambahan "Permintaan data karyawan", struktur dua panel login, dan kerangka dashboard.

### Layar mockup yang belum ada di aplikasi

| Layar | Pemilik paket | Catatan |
| --- | --- | --- |
| Panel Asisten ELGOS (FAB + chat di semua layar) | B17 (T5) | Dibangun di PR #39: `screens/b17-asisten/ShellExtra.vue` di balik flag `assistant` ([b17-asisten-web.md](b17-asisten-web.md)) |
| Tinjauan temuan AI per gap (HR) | B7 (T5) | Dibangun di [b7-tinjauan-web.md](b7-tinjauan-web.md) (rute `review`); akses atasan RV-3 diputuskan R1: tetap HR saja |
| Alur wawancara ulang LIM (chat → benchmark → hasil bisnis → ringkasan) | B15 tahap 3 (T7) | Antrean saja yang ada |
| EliteMentor di dalam shell (belajar online, check-in offline) | perlu keputusan | Aturan arsitektur 1 mengarah ke deep link |

### Bug tampilan yang pasti (bukan soal selera)

- LI: kelas `li-*` hanya didefinisikan di `<style>` milik `LibraryView.vue`. Bila Program, Permintaan, atau Draf dibuka langsung, tata letaknya rusak (gaps-modul X-1).
- Top bar pecah dua baris di lebar 1280 px saat pemilih Tampilan muncul (gaps-shell S2).
- Hasil saya: `.b8-list` menimpa margin `.b8-sub`, sehingga catatan undangan menempel ke tabel (gaps-peran).
- Sisa gaya Tailwind POC di luar token: `/masuk` (`EmailLinkView.vue`), bagian "Pengelolaan TNA" di `/tna`, dan `ReviewView.vue`. (Keadaan audit 23 Nov. `ReviewView.vue` sudah dihapus di B7 web; antrean kini `screens/b7-tinjauan/AntreanView.vue` bergaya token.)

## Rencana PR (semua berbasis scbrmb, kecil, satu tema per PR)

| PR | Isi | Gap |
| --- | --- | --- |
| P1 | Audit ini + alat render mockup (dokumen saja) | - |
| P2 | Bug tampilan pasti: CSS LI bersama, top bar 1280, margin Hasil saya | X-1, LI-26, S2, b8 |
| P3 | Komponen bersama: `UiAgentCard`, `UiBreadcrumb`, varian chip terisi untuk status, baris tabel bisa diklik | CC-1, CV-1, DN-1, TN-1, X-2, X-3, D1, TN-7 |
| P4 | Login langkah 2 dan `/masuk` mengikuti tata letak login | L1–L7 |
| P5 | LNA: tabel CC/INA kembali ke kolom mockup, sintesis CCA berupa daftar tema, Pengelolaan TNA dipindah | CC-3, AH-6, TN-2, IN-7 |
| P6 | LI: filter chip, baris modul, wizard dua kolom | LI-5, LI-7, LI-27 |
| P7 | LD, LIM, CP, karyawan, admin, super: copy dan komponen bobot sedang/rendah | sisanya |
| P8 | Menerapkan keputusan R1–R22 ([p8-keputusan-r1-r22.md](p8-keputusan-r1-r22.md)) | lihat tabel R |

Layar yang belum ada (Asisten, Tinjauan per gap, wawancara ulang LIM) dikerjakan pemilik paketnya. Thread paritas memeriksa hasilnya dengan katalog yang sama.

## Status 23 Nov 2026 (akhir P8)

Semua tahap P1–P7 plus layar B17 (Asisten) dan B7 (Tinjauan per gap) ada di PR #39, masing-masing dengan review egm independen dan triase. P8 ([p8-keputusan-r1-r22.md](p8-keputusan-r1-r22.md), branch `paritas-p8`) menerapkan keputusan R1–R22, lalu triase dua review independen, dua keputusan user 23 Nov (Wawancara untuk Anda di `/tna`, Asisten tanpa tampilan Super Admin), dan temuan audit PR 39 (39-1, 39-2, 39-3, 39-5), digabung dengan `claude/project-thread-scbrmb` `10c91a6` ([egm/p8-code-review.md](egm/p8-code-review.md)). Hitungan baris tidak berubah oleh triase (catatan ditambahkan di baris terkait). Hitungan baris gap (termasuk baris "bukan gap"); "Diputuskan" = gap ditutup oleh keputusan produk (perilaku aplikasi dipertahankan), tanpa ubah tampilan:

| File | Baris | Ditutup | Diputuskan | Sebagian | Terbuka |
| --- | --- | --- | --- | --- | --- |
| gaps-shell.md | 21 | 14 | 1 | 0 | 6 |
| gaps-lna.md | 83 | 45 | 13 | 6 | 19 |
| gaps-modul.md | 73 | 45 | 9 | 8 | 11 (7 di antaranya LIM, milik thread B15) |
| gaps-peran.md | 52 | 35 | 3 | 2 | 12 (1 tidak dikerjakan, 2 bukan gap) |

Hitungan dikoreksi 24 Nov oleh P9 ([egm/pr39-full-code-review.md](egm/pr39-full-code-review.md), SP-1 sampai SP-3): AA-4, TN-10, IN-11, dan ADM-1 berpindah dari Ditutup ke Diputuskan (perilaku aplikasi dipertahankan); LI-14 dan LD-10 kembali Terbuka (chip "Contoh (dummy)" dan placeholder tanggal belum sama dengan mockup, alasannya di baris masing-masing). Selisih spek dan kode setelah P9: [egm/p9-drift.md](egm/p9-drift.md). 24 Nov: LI-14 menjadi Diputuskan (keputusan user: hijau bila kamus ada, netral bila belum).

Yang tersisa menunggu data API baru, paket lain (B6 untuk pilihan jawaban AI wawancara akar masalah), atau milik thread lain (LIM, termasuk dua gap tinggi LIM-6 dan LIM-8). Keputusan user 23 Nov: tampilan 1:1, keputusan spek paket tetap.

### Keputusan R1–R22

User memilih "Terapkan semua rekomendasi" (23 Nov 2026). Semua butir **Diterapkan** di P8; kolom terakhir menyebut hasilnya.

| # | Topik | Gap | Rekomendasi | Status 23 Nov |
| --- | --- | --- | --- | --- |
| R1 | Akses atasan ke Tinjauan HR dan tombol "Langsung ke tinjauan HR" | RV-3, TD-6, TN-13 | Tetap HR saja (spek B7, PM-5/PM-6) | Diterapkan (keputusan saja; sudah sesuai) |
| R2 | Penugasan wawancara menggantikan "Mulai wawancara akar masalah" | TD-5, AH-2, AH-3, AA-4 | CTA satu baris seperti mockup; form penugasan dibuka di dialog | Diterapkan: CTA satu baris, `UiDialog` penugasan TNA, dialog tenggat B10 |
| R3 | Label status: chip terisi mockup vs ikon + teks `UiStatus` | K-3, PK-10, X-2, T1 | Chip terisi lewat `UiChip` per layar (sudah di LI, LD); `UiStatus` global tetap untuk aksesibilitas | Diterapkan: `UiChip` di Pengguna dan Tenant, titik di Hasil saya |
| R4 | Skala skor dan format angka | TN-8, DN-10, CV-11 | Skor 0–100 tanpa "%"; desimal koma (locale id) | Diterapkan: `formatNumber`/`formatScore` (id-ID), selisih OKR merah |
| R5 | Copy khusus Elitery ("nilai 5C", "Sumber: elitery.com", Scheer IMC) | CC-2, CV-3, AH-5, LIM-1 | Teks netral tenant; sumber dari data tenant | Diterapkan: "nilai 5C" sisa diganti; LIM-1 ke B15 |
| R6 | Baris "Belum diwawancarai" dan kolom Orang/Status di tabel gap | TN-4, TN-7, TN-11 | Pertahankan (HR memindai status wawancara) | Diterapkan (keputusan saja) |
| R7 | Pratinjau sesi HR: chat simulasi vs daftar pertanyaan | AH-8 | Daftar pertanyaan (tanpa biaya LLM, tidak disimpan) | Diterapkan (sudah sesuai) |
| R8 | "Insight AI" dan "Agen ELGOS" untuk hasil berbasis aturan/templat | PK-3, PK-5 | Label jujur: "Insight", "templat ELGOS" | Diterapkan: "templat ELGOS" di Draf dan Permintaan; LIM-3 ke B15 |
| R9 | Catatan UU PDP dokumentasi | PK-6 | Pertahankan "hanya bisa dibuka oleh HR" (sesuai perilaku) | Diterapkan (keputusan saja) |
| R10 | Cakupan atasan CP | PK-8 | Bawahan langsung (RG-3) | Diterapkan (keputusan saja) |
| R11 | Label tier | PK-9 | "Advanced" di semua layar | Diterapkan (sudah sesuai) |
| R12 | EliteMentor di dalam shell | K-1 | Deep link (aturan arsitektur 1) | Diterapkan (sudah sesuai) |
| R13 | Pilihan jawaban di wawancara akar masalah | K-2 | Samakan gaya input saja; pilihan jawaban AI menunggu paket B6 | Diterapkan: input satu baris di IV; pilihan jawaban AIV bergaya `.ac` |
| R14 | Galat persetujuan | K-4 | `UiErrorSummary` standar | Diterapkan (sudah sesuai) |
| R15 | Breadcrumb karyawan "Training Needs ›" | K-5 | Ikuti mockup tanpa tautan bila menu tidak ada (sudah di sesi IV) | Diterapkan: breadcrumb daftar IV; tautan mengikuti menu |
| R16 | "Lihat contoh rekomendasi" | K-6 | Hilangkan sampai ada halaman contoh | Diterapkan (sudah sesuai) |
| R17 | Teks undangan Hasil saya | K-7 | Ikuti fokus wawancara (KPI belum tercapai) | Diterapkan: undangan berfokus KPI |
| R18 | ID model di konfigurasi platform | K-8 | Label produk "ELGOS-AI (POC)" untuk tenant; ID penyedia hanya untuk Super Admin | Diterapkan: kartu model Konfigurasi platform |
| R19 | Peran saat mengundang | K-9 | Pertahankan perilaku aplikasi | Diterapkan (keputusan saja) |
| R20 | Kalimat "ELGOS tidak mengirim apa pun ke vendor" | PK-1 | Pindah ke petunjuk kecil di bawah tombol | Diterapkan: petunjuk di bawah tombol "Minta ke" dan daftar permintaan |
| R21 | Wizard: baca saja vs sunting | PK-4 | Sunting tetap, dengan simpan otomatis (K-P6-5) | Diterapkan (keputusan saja) |
| R22 | Atasan di tab Pengukuran AI (LIM) | PK-7 | Diputuskan thread B15 | Diterapkan (keputusan diserahkan ke B15) |

## Tindak lanjut

| # | Butir | Rencana | Status |
| --- | --- | --- | --- |
| TL-1 | Ambang snapshot longgar tanpa pelacak (audit PR 39 butir 39-1): `dashboard-hr-terang/gelap` 0,04 (`e2e/dashboard.spec.ts`), `asisten-panel-karyawan` 0,06 (`e2e/asisten.spec.ts`); bawaan 0,02 | CI kini mengunggah `apps/web/test-results` (actual/diff PNG) saat job e2e gagal (`.github/workflows/ci.yml`, artifact `e2e-test-results`). Langkah: turunkan kedua ambang ke 0,02 di satu PR, biarkan CI gagal, ambil PNG actual dari artifact, tinjau, jadikan baseline baru, lalu CI harus hijau di 0,02 | Terbuka (23 Nov) |
| TL-2 | Salinan mockup klien sudah dihapus dari tree (39-5), tetapi masih ada di riwayat git repo publik | Keputusan user/Andrian: biarkan atau tulis ulang riwayat | Terbuka |
