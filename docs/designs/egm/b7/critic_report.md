# B7 · Tahap 7 Critic Review (egm-review-loop ronde 1; egm-design, egm-structural, egm-style; dispatch langsung)

## egm-style (seluruh dokumen) — 0 🔴, 5 🟡, 10 🟢
- 🟡 M1. "non-pelatihan" ditandai _Avoid_ di glosarium (baris 7, 130) → "Improvement Needs".
- 🟡 M2. "Perlu ditinjau HR" dipakai untuk tombol per temuan, padahal glosarium = keadaan gap (baris 15, 31, 35, 36).
- 🟡 M3. Padanan istilah berganti-ganti: review/tinjauan, handoff/serah/diteruskan, training/pelatihan/Training Needs.
- 🟡 M4. Klaim idempotensi baris 113 melampaui bukti (dukungan `Idempotency-Key` EliteMentor belum terverifikasi).
- 🟡 M5. Status dan kala dokumen tidak konsisten ("spek" lawan daftar file `[x]` dan review diff selesai).
- 🟢 N1–N10: brief tanpa path, "menumpuk di PR B0", "memastikan" → "menetapkan", "(jejak)", "tidak ada" → "ditolak", "baru hidup", subjek "dianggap", "puluhan baris", "baris 5 dan 6 lolos", filler/★A/"4 berat"/"kosmetik".

## egm-structural (baris 1–149, feature-spec-standard) — 1 🔴, 5 🟡, 5 🟢
- 🔴 1. Tidak ada bagian "Alternatif yang dipertimbangkan" (Alternatives Rule). Kandidat: `classify` terpisah lawan memperluas `review`; kolom tahan lawan status baru; ekspor tanpa penanda lawan menandai; klaim bersyarat lawan outbox; handoff penanda lawan tabel tindakan B7.
- 🟡 2. Tidak ada bagian "Risiko dan mitigasi" terkonsolidasi (risiko tersebar sebagai penanda inline).
- 🟡 3. Penanda status tanpa legenda.
- 🟡 4. Kode keputusan dan rujukan tanpa definisi/tautan; "Aturan bisnis yang dirujuk" letaknya di akhir.
- 🟡 5. Istilah menyimpang dari CONTEXT.md (sama dengan style M1/M2).
- 🟡 6. "Kontrak untuk B9" dan "Port penugasan EliteMentor" bukan endpoint tetapi di bawah H2 Endpoint; tidak ada ringkasan arsitektur.
- 🟢 7–11: Masalah/Tujuan/Bukan tujuan digabung; blok `json` tidak valid; penomoran endpoint melintasi H3; tabel di dalam daftar; metadata status sebagai prosa.

## egm-design (baris 1–149, feature-spec-standard) — 1 🔴, 10 🟡, 7 🟢
- 🔴 B1. Tidak ada evaluasi alternatif (status `held` lawan kolom tahan; outbox B9; penugasan per gap/batch; ekspor yang menandai; plan+assign atomik).
- 🟡 M1. Tidak ada bagian Risiko & Batas.
- 🟡 M2. Penarikan persetujuan setelah temuan disetujui tidak diatur: solusi, reklasifikasi, handoff, ekspor, dan assign tidak memeriksa `consent_withdrawn_at`; email karyawan tetap terkirim. `409 CONSENT_WITHDRAWN` tidak ada di spek.
- 🟡 M3. "Tugaskan" (plan lalu assign) tidak atomik; di tenant `lms_export` selalu membuat rencana lalu gagal 409, dan klasifikasi ulang terkunci.
- 🟡 M4. `lms.elitementorOrganizationId`: siapa yang boleh menulis tidak disebut (risiko lintas tenant).
- 🟡 M5. Kontrak B9 membawa `title` temuan yang bisa mengidentifikasi individu; mockup INA menampilkan pemilik.
- 🟡 M6. Kursor `since` bisa melewatkan baris (sama dengan zoom-out I3).
- 🟡 M7. Kembali ke kategori asli AI tetap `edited` (metrik PM-2 tercemar).
- 🟡 M8. Temuan yang sudah disetujui tidak bisa disunting/ditolak.
- 🟡 M9. Tidak ada pembatalan penugasan; klaim basi bisa melapor `sent` palsu karena `finishPlanAssignment` tidak memberi tahu baris yang berubah.
- 🟡 M10. `GET /review/solutions` tanpa batas/paginasi, katalog dipanggil berurutan, tidak ada filter per gap seperti mockup.
- 🟢 N1–N7: istilah glosarium; `COALESCE` catatan tahan; rencana `rejected` tetap mengunci; ambang `confidence < 0.5`; hari kerja WIB untuk semua tenant; `down` migrasi menghapus data; asal `req.tenantId` Admin ETA, ekspor tanpa batas, join tanpa tenant.

---
# Tahap 9 — egm-implementation-readiness (baris 150–akhir): lolos dengan catatan, 0 🔴, 5 🟡, 7 🟢
- 🟡 Daftar file tidak lengkap: `tests/unit/elitementor.test.js`, `deploy/vps/.env.example:50`, fungsi `updatePlanItem`/`planFromFinding`/`PLAN_COLS`, rute plan/PATCH di `tna/index.js`.
- 🟡 Perilaku hasil triase hanya di tabel triase (PATCH `ALREADY_ASSIGNED`, kunci `planFromFinding`, `status='open'` di reclassify, klaim periksa ulang, `CONSENT_WITHDRAWN` di classify): pindahkan ke badan Endpoint.
- 🟡 Payload EliteMentor tidak ditetapkan (field `idempotencyKey, employeeId, email, courseRef, courseTitle`, `ref` dari `id`).
- 🟡 Celah test: balapan reclassify vs plan; timeout adapter benar-benar membatalkan.
- 🟡 Klaim basi melaporkan `sent` palsu (`finishPlanAssignment` tidak memeriksa baris berubah).
- 🟢 Daftar test belum memuat test triase; `counts.held` dengan `projectId`; join `users`/`lna_findings` tanpa tenant di `getPlanForAssignment`/`listPlanExport`; urutan middleware `flag, hr` membocorkan status flag; `employeeIds` audit solutions tidak unik; `down` migrasi menghapus data (`[⏳ DITERIMA]`); catat bahwa `visibleEmployeeScope` tidak dipakai karena rute hanya HR.

# Tahap 9 — egm-codebase-details (B7)
- 🟡 b7:112 SQL klaim basi di kode punya syarat tambahan (`status IN ('new','in_progress')`, `catalog_source='elitementor'`, `assignment_target`, `clock_timestamp()`, `claimedAt`) yang hanya di triase.
- 🟡 b7:79 `reclassifyFinding` mensyaratkan `f.status='open'` (hanya di triase).
- 🟡 b7:94 `recommendation=null` juga bila tanpa `competencyId` (katalog tidak dicari).
- 🟢 idempotensi dikirim sebagai `idempotencyKey`; audit handoff hanya bila ada yang diserahkan; indeks `lna_findings_handoff_idx`; filter `projectId` ekspor; daftar file kurang `.env.example`, `ALREADY_ACTIONED`, `ALREADY_ASSIGNED`, `updatePlanItem`.
- Reuse: hitungan held/overdue diduplikasi di `tna/index.js` dan `assistant/facts.js`; regex UUID di empat file.
