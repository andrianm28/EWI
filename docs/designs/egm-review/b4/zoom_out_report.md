# Laporan Zoom Out (Tahap 5 egm-review) · B4

Reviewer dijalankan langsung dari konteks utama (synthesizer tidak punya tool Agent di sesi ini; docs/claude.md mengizinkan dispatch langsung).

| Reviewer | Status |
| --- | --- |
| egm-zoom-out | completed |
| egm-inventive-catalyst | completed |

# Stage 5 · egm-zoom-out · B4 (subagent egm:egm-zoom-out, dispatch langsung, standar zoom-out-standard.md)

Putusan: konteks cukup, desain menjawab masalah akar. 1 Blocker, 4 Major, 5 Nit.

1. Blocker — Flag (header, §9a, §9b, §7, §11 Layar): alasan menolak flag baru salah; PR memasang `/dna`, menghapus legacy-dna, mengubah arti alias `level`, dan POST/impor kini mengubah baris lama. Usul: flag `dna.development` default mati, atau pengecualian tertulis Andrian dan perbaiki alasannya.
2. Major — YAGNI: 5 endpoint tulis JF/PATCH kompetensi tanpa konsumen di B4 (layar menyuruh impor). Usul: kirim satu jalur koreksi, atau tandai "kontrak untuk B11".
3. Major — Logika "asesmen terbaru" disalin dari gap.js ke development.js (dan varian ketiga di career.js). Usul: satu helper bersama.
4. Major — Peralihan layar tidak konsisten: `/m/dna` (`dna-poc`) dipertahankan tapi folder legacy-dna dihapus; tidak jelas siapa pemiliknya dan kapan dihapus; tabel B0 §5.3 belum diperbarui.
5. Major — Struktur: DDL disalin utuh dari migrasi, kode galat Postgres di badan desain, log triase/drift bercampur, dua §11. Usul: ringkasan model data + tautan migrasi, tabel "Kontrak galat", lampiran "Riwayat review".
6. Nit — `mastery` hanya untuk B8 dan aturannya beda dari mockup.
7. Nit — Pengesahan kamus: konsekuensinya bergantung keputusan B5; tandai ⚠️.
8. Nit — helper umum (`isUuid`, `orConflict`) di file rute; pindah ke core, pakai `UUID_RE` onboarding.
9. Nit — istilah domain (tiga "tier") untuk `/domain-modeling`/CONTEXT.md nanti.
10. Nit — `jobRoleId` path vs query + default tersembunyi; jadikan aturan bernama.

# Stage 5 · egm-inventive-catalyst · B4 (subagent egm:egm-inventive-catalyst, dispatch langsung)

1. Major — A4/§6 stageDistribution: "Tuntas" menghitung pegawai dengan asesmen sebagian. Usul: field `coverage` (full/partial) + `partialCount` per baris stageDistribution; stage tetap.
2. Major — A1/A3: `mastery` (gap 1 = partial) dan default `requiredScore ?? 3` terkunci skala 0-4; default 3 tidak tertulis di spek. Usul: konstanta skala maks, partial = gap ≤ max/4, default target dari konstanta yang sama, tulis di A3/A4.
3. Major — §7 impor: tanpa transaksi, jalur update baru bisa menulis kompetensi tanpa pemetaan JF; commit tanpa `orConflict` → 23505 jadi 500 untuk sisa file. Usul: transaksi per baris + `orConflict` per baris.
4. Major — Flag: alasan menolak flag baru bertentangan dengan PR yang memasang `/dna` dan mengubah arti kolom Level. Usul: flag `dna.development` default mati atau persetujuan eksplisit Andrian.
5. Nit — `assessmentsFor` memuat seluruh riwayat; pilih asesmen terbaru di SQL (DISTINCT ON).
6. Nit — tahap B4 (skor) bisa beda dengan `lna_program_completions` (bukti B16); tambah `completedTiers` read-only.
7. Nit — struktur: dua §11, §9b setelah §11; urutkan ulang.
