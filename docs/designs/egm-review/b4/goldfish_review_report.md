# Goldfish Annotated Review Report · B4

**Target:** `docs/designs/b4-developmental-needs.md` (full file)
**Sumber temuan:** tahap 5–9 egm-review (`zoom_out_report.md`, `comprehension_report.md`, `critic_report.md`, `intermediate_zoom_out_report.md`, `implementation_readiness_report.md`).
**Kategori egm-resolve:** PROPOSE FIX, CONTEST, ESCALATE, DECLINE. Temuan yang sama dari beberapa reviewer digabung.

## Blocker

### R1 · Flag baru untuk layar dan endpoint B4 [zoom-out, inventive, design, style, comprehension, tahap 8] — Blocker
* **Scope:** header, §9a, §7, §11 Layar.
* **Temuan:** alasan menolak flag ("tidak ada perilaku tenant yang berubah sampai layar dipasang") dibantah PR ini sendiri, yang memasang `/dna`, mengubah arti alias `level`, dan membuat impor memperbarui baris lama. CLAUDE.md aturan 3.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** reviewer benar; premis spek salah. Flag default mati juga cocok dengan aturan Go/No-Go (modul yang tidak lolos flag-nya tetap mati).
* ***Proposed Edit:*** flag baru `dna.development` (default mati). Router B4 (`/api/dna/development/*`, `/job-roles/:id/*`, `/job-functions/*`, `PATCH /competencies/:id`) di balik `requireFlag`. Rute web `dna` memakai `beforeEnter`: flag mati, peran di luar `hr_admin`/`supervisor`/`eta_admin`, atau tampilan karyawan/admin → dialihkan ke `dna-poc` (`/m/dna`, halaman POC yang sudah ada), jadi tidak ada folder lama yang dihidupkan lagi. Alias `level` di impor: nilai B/I/A/Basic/Intermediate/Advanced → Level Program, nilai lain → Jenjang (file lama tetap terbaca).

### R2 · Menu peralihan karyawan hilang, e2e `shell.spec.ts` merah [codebase-details, readiness] — Blocker
* **Scope:** §11 Layar (l.211). Terverifikasi: `npm run e2e` di head d69d28b → 1 gagal (`shell.spec.ts:78`).
* ***AI Suggestion:*** PROPOSE FIX
* ***Proposed Edit:*** rute `dna` memakai `views: ['hr','atasan','karyawan','admin','super']` (kontrak B0 sampai B8/B11/B12 terpasang); pengalihan R1 membawa karyawan/admin ke halaman POC. Spek menyebut pemilik `dna-poc` (`screens/b4-dna/routes.ts`) dan pemicu penghapusannya (B8 `my` + B11 `cfg`).

### R3 · Tidak ada bagian "Alternatif yang dipertimbangkan" [design, structural] — Blocker
* ***AI Suggestion:*** PROPOSE FIX (ringkas, sesuai saran tahap 8)
* ***Proposed Edit:*** tabel 6 baris: rencana dihitung vs disimpan; tahap dari skor vs program completion; kolom tier di `lna_competencies` vs entitas modul terpisah; tabel JF + tabel pemetaan vs kolom teks; mastery selisih tingkat vs rasio mockup; flag baru vs `module.dna`; FK komposit vs cek aplikasi (A12).

## Major

| # | Temuan (reviewer) | Kategori | Keputusan |
| --- | --- | --- | --- |
| R4 | Peran tampilan `atasan` (B0: supervisor, pimpinan, role_leader) vs API hanya `hr_admin`+`supervisor` → 403 di semua tab (design, tahap 8) | PROPOSE FIX | Pengalihan R1: peran di luar `hr_admin`/`supervisor`/`eta_admin` ke halaman POC. Konstanta bersama `core/rbac` ditunda (menyentuh B5/B9 juga). |
| R5 | Job default memilih kamus POC tanpa tier → semua "Belum dinilai" (design, tahap 8) | PROPOSE FIX | Default memilih job yang punya kurikulum (`tool3`), baru yang punya kamus. Test dulu. |
| R6 | Teks saran A6 "semua modul tercapai" bertentangan dengan A4 (comprehension, tahap 8) | PROPOSE FIX | "semua modul <tingkat> yang dinilai tercapai". Test dulu. |
| R7 | Logika asesmen terbaru dan default target 3 terduplikasi (zoom-out, tahap 8) | PROPOSE FIX | `latestByCompetency` dan `DEFAULT_TARGET` diekspor dari `gap.js`, dipakai `development.js`. Default 3 ditulis di A3. |
| R8 | Struktur: judul "(backend)", l.9 e2e, dua §11, §9b setelah §11, log triase di tengah, DDL disalin (semua reviewer) | PROPOSE FIX | Judul dan header diperbaiki, penomoran ulang, DDL diganti ringkasan + tautan migrasi, log review ke lampiran "Riwayat review". |
| R9 | Status ganda ⏳/"Ditunda" dan test "dijadwalkan" vs sudah ada (structural, style) | PROPOSE FIX | Satu daftar asumsi dan risiko di §9; lampiran hanya merujuk. |
| R10 | "Impor ulang aman" melampaui bukti; 23505 di commit impor jadi 500 (inventive, style, design) | PROPOSE FIX | Kalimat dibetulkan. Commit tiap baris impor kompetensi dibungkus agar bentrok unik menolak baris itu saja. Transaksi per baris: DECLINE (tidak ada jenis impor lain yang bertransaksi). |
| R11 | Skala 0–100 DACUM vs CHECK 0–4 (design, inventive) | ESCALATE | Skala ditanyakan ke Pak Eji (Q12) dan menunggu file DACUM Mas Abdan 26 Nov. Tetap ⚠️ dengan pemicu dan pemilik. `MAX_SCALE` ditolak (tahap 8). |
| R12 | "Sahkan kamus" tanpa daftar id/versi (design) | DECLINE | ⏳ DITERIMA: satu admin HR per tenant pada POC; diturunkan tahap 8. |
| R13 | Penulisan kamus dan reset pengesahan tidak diaudit (design) | DECLINE | Pola modul DNA saat ini tidak mengaudit penulisan kamus (`POST /competencies`, impor). Keputusan tingkat modul, dicatat untuk Andrian. |
| R14 | Endpoint tulis JF/PATCH tanpa konsumen layar (zoom-out) | PROPOSE FIX | Diberi label "kontrak untuk B11 dan koreksi data"; tidak ditambah mekanisme. |
| R15 | Kode keputusan dan brief tanpa tautan (comprehension, style, structural) | PROPOSE FIX | Satu blok "Sumber acuan" seperti B0, B0 didefinisikan. |
| R16 | §10 tidak memuat semua test, e2e, celah yang tidak dites, fase (readiness) | PROPOSE FIX | §10 diperbarui: daftar test per file, kasus e2e, baris "Tidak dites". Fase: urutan commit dicatat di lampiran. |
| R17 | Daftar file tanpa C/M/D, entri bersyarat (codebase-details) | PROPOSE FIX | Ditandai (B)aru/(U)bah/(H)apus, kalimat bersyarat dihapus. |
| R18 | `dna-poc` tanpa pemilik (zoom-out, readiness) | PROPOSE FIX | Lihat R2. |

## Nit (DECLINE kecuali disebut)

Coverage/partialCount, `completedTiers`, `DISTINCT ON` (ditolak tahap 8, YAGNI); helper umum dari file rute ke core (ditunda, menyentuh modul lain); `mastery` milik B8 (dicatat di A3); pembulatan persen 99/101 (dicatat); PATCH no-op tetap mereset (dicatat); `approved` boolean vs jumlah (dicatat); label tab dan teks cakupan diseragamkan (PROPOSE FIX); `dictionary.status` ditulis di §6 (PROPOSE FIX); test lima baris nol diasersi (PROPOSE FIX); batas 999 hanya di aplikasi (dicatat); tombol "Sahkan kamus" untuk `eta_admin` (API hanya `hr_admin`; tetap).
