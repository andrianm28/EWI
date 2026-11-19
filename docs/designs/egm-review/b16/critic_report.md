# Critic Report (Tahap 7 egm-review) · B16

FeatureRange. Reviewer dijalankan langsung (egm:egm-design, egm:egm-structural, egm:egm-style), standar feature-spec-standard untuk design dan structural.

| Reviewer | Status |
| --- | --- |
| egm-design | completed |
| egm-structural | completed |
| egm-style | completed |

## egm-design · B16 (completed, standar feature-spec-standard) — 0 Blocker, 7 Major, 6 Nit
- M1 — Alternatif tidak ditimbang (event log vs baris mutable; hidup vs snapshot; flag; setelan tenant). Upsert menimpa catatan atasan dalam satu siklus (recommend → hold); catatan tidak masuk audit → hilang permanen.
- M2 — C10 bertentangan dengan §10a dan kode (`decisionView` memberi aksi HR untuk siklus terbuka).
- M3 — Pemisahan tugas (HR = perekomendasi → 403, career-routes l.189) tidak ada di C7/§6; `decisionView` tetap memberi `['approve','hold']` → tombol pasti gagal. Usul `blockedReason: self_recommended`, `actions: []`.
- M4 — Cek "sudah approved" di dalam transaksi hanya di §10a; dua indeks parsial tidak saling mengecualikan.
- M5 — OKR basi: periode terbesar per karyawan tanpa batas bawah; urutan teks salah untuk "2026-9" vs "2026-10" dan "2026-Q4" vs "2026-12".
- M6 — Perubahan default `promotionVisibleTo` berlaku di luar flag (endpoint lama di bawah `module.dna`); tidak bisa dimatikan kill switch. Default kunci hilang vs nilai rusak berbeda.
- M7 — §8 bukan register risiko; `load()` seluruh cakupan per POST (dua kali); `okrRecords` tanpa filter periode; test atomisitas/balapan ditunda.
- Nit — `waiting_hr` tidak pernah dikembalikan; Sasaran/Bukan sasaran tersebar; CASCADE level menghapus keputusan approved; erasure vs audit meta; `/paths` agregat tidak diaudit; enkripsi catatan (kunci, gagal dekripsi).

## egm-structural · B16 (completed, standar feature-spec-standard) — tidak lulus: 1 Blocker, 6 Major, 6 Nit
- B1 Blocker — Tidak ada "Alternatif yang dipertimbangkan" (tabel keputusan vs kolom status/event log; OKR dihitung saat baca vs disimpan; dua tahap vs HR saja; rata-rata sederhana vs berbobot; perluas `/promotion-candidates` vs router baru).
- M2 — Tidak ada Sasaran/Bukan sasaran; pengecualian tersebar.  M3 — §8 bukan register risiko (balapan, enkripsi, perluasan `promotionVisibleTo`, audit fail-closed, tanpa paginasi, tanpa test beban).  M4 — Tidak ada ikhtisar arsitektur/alur.  M5 — C7/C10 tidak sinkron dengan §10a (no_supervisor, 403 HR=perekomendasi, FOR UPDATE).  M6 — kode keputusan tak terdefinisi.  M7 — placeholder `<karyawan>`, `<jenjang berikutnya>`, `<ambang>` di luar backtick hilang saat dirender GFM (l.24, 98, 99, 101; juga B0 l.227).
- Nit — §8a/§10a di tengah, angka tak berurutan; judul "(backend)"; tidak ada baris Status; granularitas C9/C10; `blockedReason` mengoreksi diri; format rujukan (path lokal, `…/supervisor`).

## egm-style · B16 (completed) — 0 Blocker, 6 Major, 8 Nit
1. Major — C10 l.116 "HR tidak bisa memutuskan" bertentangan dengan l.219; persempit ke "bila belum ada siklus terbuka".
2. Major — C7 l.112 / C12 l.123 menyatakan aman balapan & atomik sebagai fakta padahal test ditunda (l.221); `FOR UPDATE` tidak disebut di §5; dua kode 409 tanpa cara memilih.
3. Major — `blockedReason` l.158 kontradiktif (`waiting_hr`, `held`); ganti tabel.
4. Major — C2 l.88 rumus ambigu ("Selain itu" ganda, aktual ≤ 0 vs negatif dilewati, kolom `biner` tak disebut); tulis daftar kasus berurutan.
5. Major — C11 l.119 mencampur visibilitas dan normalisasi `okrMin`/`metricTypes`; pindah ke §4.
6. Major — kode tak terdefinisi (G2-A, RG-1e, RG-3, R2-2, R2-3, PK-15, K2, T3, ikan mas); l.165 fragmen.
7–14. Nit — l.171 ⚠️ tanpa siapa yang mengonfirmasi; "selalu boleh" terlalu mutlak; "baru menghitung" ambigu; redundansi l.157, l.70/180; l.177 enam belas perbaikan dalam satu kalimat; "di sana" ambigu; "balapan"/"potret" beri padanan.
