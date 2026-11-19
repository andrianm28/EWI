# B7 · Tahap 5 Initial Zoom Out (egm-review, mode uninterrupted)

Target: `docs/designs/b7-tinjauan-hr.md`. Reviewer: `egm:egm-zoom-out` dan `egm:egm-inventive-catalyst`, masing-masing subagent baru, dikirim langsung dari sesi utama (synthesizer di sesi ini tidak bisa membuat subagent; laporan synthesizer lama diganti). Konteks: CLAUDE.md, CONTEXT.md, docs/agents/domain.md, spek B0 (PR #18), mockup Pak Eji, kode `review-workspace`, `tna/index`, `lna-stores`.

| Reviewer | Status | 🔴 | 🟡 | 🟢 |
| --- | --- | --- | --- | --- |
| egm-zoom-out | selesai | 0 | 4 | 5 |
| egm-inventive-catalyst | selesai | 0 | 3 | 3 |

## Temuan (sudah dideduplikasi)

### 🟡
- **I1. "Tugaskan" (plan lalu assign) tidak idempoten di tingkat temuan**: `planFromFinding` tidak mensyaratkan temuan `open` dan tidak memeriksa rencana aktif; klik ulang setelah assign gagal membuat rencana kedua dengan kunci idempotensi baru.
- **I2. Jalur pilot (ekspor CSV) tidak punya status penyaluran**; `assignmentStatus` selalu null untuk tenant pilot.
- **I3. Kursor `since` kontrak B9** memakai `now()` (awal transaksi): handoff yang commit belakangan bisa terlewat; `>=` menghasilkan duplikat.
- **Z1. Penugasan langsung ke EliteMentor dibangun untuk kontrak FR-EM yang belum ada** (YAGNI); lima gerbang untuk satu kemampuan (I6 serupa).
- **Z2. Serah ke Improvement Needs**: B7 menentukan batas B9 sebelum T6 merancang; kolom handoff bisa menjadi duplikat relasi di tabel B9.
- **Z3. Istilah "Perlu ditinjau HR" bentrok dengan glosarium** (CONTEXT.md mendefinisikannya di level gap); manfaat tanda tahan dipertanyakan.
- **Z4. Daftar `improvement` di `/review/solutions` melewati `nonTrainingEnabled()`** (flag PM-6 / RG-4).

### 🟢
- I4. Panggilan katalog per temuan bisa dimemoisasi per kompetensi.
- I5. Course yang ditampilkan bisa berbeda dari yang masuk rencana (rekomendasi dihitung dua kali).
- Z5. Dua pintu (`review` dan `classify`) ke state machine review yang sama.
- Z6. Helper CSV duplikat dan salah lapisan; regex UUID duplikat.
- Z7. SQL lengkap di spek sudah menyimpang dari kode (`clock_timestamp()`).
- Z8. Status dokumen dan tabel triase.
- Z9. Istilah "temuan non-pelatihan" ditandai _Avoid_ di CONTEXT.md; migrasi perlu Andrian sebagai reviewer.

Seimbang menurut reviewer: panggilan sinkron 10 detik + klaim 5 menit; lease `finishPlanAssignment`; `held` tanpa status baru; pemakaian ulang `catalog.match`, `deliveryFor`, `planFromFinding`.

Triase: lihat `goldfish_review_report.md` setelah tahap 9.
