# Review diff B4/B16 (agen egm `egm-codebase-details` dan `egm-implementation-readiness`, 19 Nov)

Langkah 5 aturan 11: review diff `origin/claude/project-thread-scbrmb...HEAD` oleh agen plugin egm. Triase gabungan dengan code review mattpocock ada di `diff-review-triage.md`.

## egm-codebase-details (ringkas)

1. Major: perubahan impor B4 (alias Level, perbarui baris lama, jenis `dna_job_functions`) tidak di balik `dna.development`.
2. Major: impor ulang nilai yang sama mereset pengesahan.
3. Major: `settings.dna = null` → `promotionSettings` TypeError → 500 di semua `/dna/career/*`, `/dna/employees`, `/promotion-candidates`.
4. Major: HR bisa menyetujui siklus usang dalam balapan dengan `PUT position` (posisi tidak dicek ulang di bawah kunci).
5. Nit: UUID huruf besar di query/body B4 → 400 (pencocokan string persis).
6. Nit: `decisionView` tidak memeriksa `employee.supervisorRole`, rute memeriksa (tombol yang pasti 403).
7. Nit: pembulatan OKR layar vs spek (sudah diselaraskan di drift report).
8–11. Nit reuse: `isUuid` dari file rute dan duplikat di tna; `conflictCode` vs `conflict()`; `TIERS` dan daftar peran karyawan ganda; dua loop insert pemetaan.
12. Nit: sinonim `TIER_CHOICES` ikut berlaku untuk jenis impor lain; tidak disebut spek.

## egm-implementation-readiness (ringkas)

Verdict: hampir siap; daftar test di B4 §12 dan B16 §10 cocok dengan nama test.

1. Major: impor B4 tidak di balik flag (sama dengan codebase-details 1).
2. Major: impor ulang tanpa perubahan mereset pengesahan (sama dengan codebase-details 2).
3. Major: A2 "waktu sama = baris terakhir menang" bergantung urutan array; `assessmentsFor` tanpa `ORDER BY`.
4. Nit: UUID huruf besar di `pickJobRole` dan `jobFunctionId`.
5. Nit: 23503 di `PUT /job-functions/:id/competencies` → 409 tidak disebut §6.
6. Nit: komentar "A14" padahal aturan berhenti di A13.
7. Nit: pembulatan OKR (sudah diselaraskan).
8. Nit: B16 §8 "balapan nol baris tidak dites" terlalu luas; dua persetujuan paralel sudah dites, yang belum hanya cabang `SUPERVISOR_NOT_RECOMMEND` tengah permintaan.
9. Nit: "pemetaan job function saja tidak mereset" tanpa test.
