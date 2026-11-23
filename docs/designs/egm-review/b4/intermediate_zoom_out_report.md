# Intermediate Zoom Out Report (Tahap 8 egm-review) · B4

Reviewer: `egm:egm-zoom-out` (subagent baru, standar zoom-out-standard, membaca laporan tahap 5–7). Status: completed. Putusan: belum siap (1 Blocker).

## A. Ditindaklanjuti
1. Blocker — Flag: pilih salah satu, (a) flag `dna.development` pada mount router baru dan `meta.flag` rute, atau (b) pengecualian tertulis Andrian dikutip di spek. Tolak varian "legacy sebagai cadangan" (bertentangan dengan B0 §5.3).
2. Major — `atasan` (B0: supervisor, pimpinan, role_leader) vs `requireRole(HR_ADMIN, SUPERVISOR)` di B4 dan B16 → satu konstanta bersama di `core/rbac`.
3. Major — Pilihan job default memilih kamus POC tanpa tier → semua `not_assessed`. Perbaikan terkecil: utamakan job dengan `tool3`.
4. Major — Teks saran A6 bertentangan dengan A4 → "yang dinilai".
5. Major — Logika "asesmen terbaru" dan default target 3 terduplikasi (gap.js, development.js, career.js, index.js) → ekspor `latestByCompetency` + `DEFAULT_TARGET` dari gap.js; tulis default di A3. Tolak `MAX_SCALE`.
6. Major — Struktur: judul, l.9, penomoran, lampiran "Riwayat review", satu tempat per status ⏳, ringkasan model data menggantikan DDL.

## B. Mitigasi tahap sebelumnya yang memperumit (tolak/turunkan)
7. Alternatif: turunkan ke Major; cukup tabel 5–6 baris.
8. Register risiko penuh → Nit; satukan ⚠️/⏳ di §9.
9. Approve dengan `competencyIds`/`asOf` → Nit, ⏳ DITERIMA.
10. Audit semua penulisan kamus → Nit (pola modul saat ini tidak mengaudit penulisan; keputusan tingkat modul).
11. Tolak: `coverage`/`partialCount`, `completedTiers`, `DISTINCT ON`, transaksi per baris impor. Pertahankan `orConflict` per baris impor.
12. DACUM 0–100 vs CHECK 0–4 → Nit; ⚠️ dengan pemilik dan pemicu 26 Nov.
13. Kode/brief: satu tautan glosarium bersama; definisikan B0 di tempat.

## C. Biaya berlipat
14. Endpoint tulis JF/kompetensi: pertahankan, beri label "kontrak untuk B11 / koreksi data", tanpa mekanisme tambahan.

## D. Nit
15. Helper umum diekspor dari file rute → pindah ke core.
16. `mastery` milik B8.
17. Checklist `[x]` dan kalimat helper `conflict` tidak konsisten.
