# Laporan Zoom Out (Tahap 5 egm-review) · B16

Reviewer dijalankan langsung dari konteks utama (synthesizer tidak punya tool Agent di sesi ini; docs/claude.md mengizinkan dispatch langsung).

| Reviewer | Status |
| --- | --- |
| egm-zoom-out | completed |
| egm-inventive-catalyst | completed |

# Stage 5 · egm-zoom-out · B16 (subagent egm:egm-zoom-out, dispatch langsung, standar zoom-out-standard.md)

Putusan: konteks cukup, masalah yang benar. 0 Blocker, 4 Major, 5 Nit.

1. Major — Dua definisi "kandidat promosi": `career.promotionCandidate` + `GET /dna/promotion-candidates` (program saja, tanpa OKR) tetap hidup; default `promotionVisibleTo` kini memuat supervisor sehingga atasan melihat badge lama. `canSeePromotion` di index.js membaca setelan mentah (bisa crash bila bukan array). Usul: satu sumber kebenaran, `canSeePromotion` pakai `promotionSettings()`.
2. Major — B0 §5.2/§5.3 menyatakan modul 2–5 hanya di balik flag; B16 dipasang di dalam `requireSubmodule('dna')` + `meta.submodule: 'dna'`. Keputusan ini tidak tercatat. Usul: catat di §7 + perbarui B0, atau gerbang flag saja.
3. Major — `blockedReason: waiting_hr` ada di enum tetapi tidak pernah dihasilkan `decisionView`; layar dan e2e memakainya. Usul: hapus atau definisikan; tulis tabel peran × status → nilai.
4. Major — C2 OKR terlalu rinci untuk format yang belum dilihat; `metricTypes` tanpa kebutuhan. Usul: hard-code `['okr']`, nyatakan C2 sementara.
5. Nit — SQL dan log proses di badan spek; ganti dengan invarian, pindahkan riwayat ke lampiran.
6. Nit — `okr_achievement` ditulis tetapi tidak dibaca endpoint mana pun.
7. Nit — indeks `lna_promotion_approved_uq` membuat "approved" permanen per (karyawan, jenjang tujuan).
8. Nit — sebut `core/crypto` untuk enkripsi catatan.
9. Nit — KPI mengikuti cakupan RG-3 (bawahan langsung), beda dari demo mockup per divisi; tulis satu baris.

# Stage 5 · egm-inventive-catalyst · B16 (subagent egm:egm-inventive-catalyst, dispatch langsung)

Putusan: fondasi sehat. 0 Blocker, 4 Major, 3 Nit.

1. Major — Identitas siklus = (user, to_level): ON CONFLICT menimpa `from_level_id` baris usang; indeks approved memblok promosi ulang seumur hidup. Usul: epoch posisi (`position_version`) atau trigger `superseded`.
2. Major — Approved dan perubahan posisi tidak terhubung; tidak ada rekonsiliasi (approved tanpa SK, promosi tanpa approval). Usul: status `approved_pending_sk` atau `effective_at`.
3. Major — HR memeriksa ulang eligibility dengan data hidup; impor OKR parsial bisa menjatuhkan kandidat di antara dua tahap. Snapshot `okr_achievement` tidak pernah ditampilkan. Usul: snapshot bukti + flag `drifted`.
4. Major — `promotionVisibleTo` mengatur baca, tahap alur, dan endpoint lama sekaligus; `['hr_admin']` mengunci alur di `waiting_supervisor` tanpa penjelasan. Usul: pisahkan pembaca dan tahap, validasi kombinasi.
5. Nit — Tanpa atasan sah tidak ada yang bisa merekomendasi; usul reviewer pengganti.
6. Nit — `target()` memuat seluruh cakupan dua kali per POST; eligibility dihitung di luar transaksi.
7. Nit — Riwayat siklus hanya di audit; usul tabel event append-only.
