# Critic Report (Tahap 7 egm-review) · B4

FeatureRange. Reviewer dijalankan langsung (egm:egm-design, egm:egm-structural, egm:egm-style), standar feature-spec-standard untuk design dan structural.

| Reviewer | Status |
| --- | --- |
| egm-design | completed |
| egm-structural | completed |
| egm-style | completed |

## egm-design · B4 (completed, standar feature-spec-standard) — 2 Blocker, 5 Major, 7 Nit
- B1 Blocker — Tidak ada "Alternatif yang dipertimbangkan" (kolom di `lna_competencies` vs entitas modul kurikulum terpisah seperti LIB mockup; dihitung vs disimpan; FK komposit vs cek aplikasi; tahap dari skor vs completions; mastery selisih vs rasio).
- B2 Blocker — Alasan tanpa flag dibantah spek sendiri; perilaku lama berubah (alias `level`, PATCH reset approval, impor update). Usul flag `dna.development` default mati + legacy sebagai cadangan, atau pengecualian tertulis Andrian.
- M1 — B0 memetakan tampilan `atasan` ke supervisor/pimpinan/role_leader; B4 hanya `hr_admin`+`supervisor` → role_leader/pimpinan lihat menu lalu 403 di semua tab.
- M2 — Skala: CHECK 0-4 di DB; data DACUM 0-100 akan gagal impor. Usul pemicu, cadangan (konversi), pemilik, tenggat.
- M3 — Kamus POC tanpa `programTier` dianggap `available` dan dipilih default → semua pegawai "Belum dinilai" walau punya asesmen. Usul status `no_curriculum` atau pilih default yang `tool3`.
- M4 — "Sahkan kamus" menyetujui baris yang belum dilihat HR (tanpa daftar id/versi). Usul kirim `competencyIds`/`asOf`, 409 bila berubah, atau ⏳ DITERIMA.
- M5 — Penulisan kamus dan reset pengesahan tidak diaudit.
- Nit — alasan impor non-transaksional usang; judul "(backend)"; penomoran; FK komposit; pembulatan persen 99/101; default `requiredScore ?? 3` tidak di A3; reset pada PATCH no-op dan hubungan dengan `POST /competencies/:id/approve` lama.

## egm-structural · B4 (completed, standar feature-spec-standard) — FAIL: 1 Blocker, 4 Major, 8 Nit
- B1 Blocker — Tidak ada bagian "Alternatif yang dipertimbangkan" (wajib di standar). Cakup: rencana disimpan vs dihitung; tahap dari skor vs program completions; kolom tier vs tabel kurikulum; tabel JF vs kolom teks; mastery selisih tingkat vs rasio; `module.dna` vs flag baru.
- M1 — §9 bukan register risiko lengkap (impor non-transaksional, deviasi flag, privasi A11/A7, tenant_id join di aplikasi, tahap vs completion). Usul tabel Risiko|Dampak|Mitigasi|Status/Test.
- M2 — Tidak ada ikhtisar arsitektur / alur data (router → requireSubmodule → scopeFor → store → development.js → audit; hubungan gap.js).
- M3 — Judul "(backend)" dan "e2e tidak berubah" bertentangan dengan cakupan layar.
- M4 — Status ganda: "Tuntas sebagian" dan impor non-transaksional ⏳ DITERIMA di satu tempat, "Ditunda" di §9a; test "dijadwalkan" vs sudah ada.
- Nit — non-goal terkubur di §2; referensi tanpa tautan (PR #2, e2d3707, brief, kode keputusan); path mockup beda dengan B0; tidak ada baris Status; posisi tanda ⚠️/⏳ tidak seragam; hitungan §9a tidak cocok; log triase di tengah spek; A12 dirujuk sebelum didefinisikan. Di luar rentang: dua §11, §9b setelah §11.

## egm-style · B4 (completed) — 1 Blocker, 8 Major, 9 Nit
- B1 Blocker — l.169/l.5 alasan tanpa flag dibantah dokumen sendiri (layar `/dna` menggantikan legacy-dna); "hanya" meremehkan.
- M1 — judul "(backend)", l.9 e2e vs layar.  M2 — catatan proses sesi di header (pindah ke PR).  M3 — A1 "tidak bergantung skala" tidak benar untuk `mastery`.  M4 — status test tidak konsisten (l.97/161/171).  M5 — "impor ulang aman" melampaui bukti (baris diupdate ulang tanpa transaksi).  M6 — `approved` boolean vs jumlah.  M7 — kode/orang tak terjelaskan; "ikan mas".  M8 — l.145 kalimat ±100 kata, tiga tingkat kurung, gaya riwayat.
- Nit — A7 "itu disengaja"; A12 padat (tabel galat); "rasio hampir tidak pernah" tanpa angka; redundansi l.90/92; l.95 urutan klausa; l.104 kasus konkret; "balapan" dan helper `conflict` (l.140 vs 189); "ini kecil" → angka; pegawai/karyawan, emoji tanda, sel tabel terlalu panjang, konsekuensi l.160, pengulangan A4/impor.
