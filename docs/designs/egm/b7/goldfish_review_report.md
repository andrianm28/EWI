Status: resolved

# Goldfish Annotated Review Report

**Target:** `docs/designs/b7-tinjauan-hr.md` (full file) dan diff `origin/claude/project-thread-scbrmb...HEAD` bagian B7

Sumber: tahap 5–9 egm dan `mattpocock-skills:code-review` (laporan mentah di folder ini dan `../cr/`).

## Prioritized Findings & AI Suggestions

### [Issue 1] [`egm-zoom-out` tahap 8] - Severity: Blocker
*   **Affected Scope:** Alur butir 3, `planFromFinding`
*   **Discrepancy Description:** "Tugaskan" di tenant `lms_export` menggandakan rencana (tanpa syarat `status = 'open'`), baris ganda di CSV.
*   ***AI Suggestion:*** PROPOSE FIX (diterapkan)
*   ***Proposed Edit:*** `planFromFinding` mensyaratkan `status = 'open'` → `409 ALREADY_ACTIONED`; web hanya memanggil plan bila `assignAvailable` salah. Test merah lalu hijau (rencana kedua, CSV tanpa ganda).

### [Issue 2] [`egm-structural`, `egm-design`, `egm-zoom-out`] - Severity: Blocker
*   **Discrepancy Description:** Tidak ada Alternatif dan Risiko; legenda penanda; status basi.
*   ***AI Suggestion:*** PROPOSE FIX (diterapkan)

### [Issue 3] [`egm-design`, `egm-zoom-out`] - Severity: Major
*   **Discrepancy Description:** Persetujuan ditarik setelah disetujui tidak dicek di solusi, klasifikasi ulang, serah terima, ekspor, penugasan.
*   ***AI Suggestion:*** ESCALATE
*   ***Justification:*** Apakah pemrosesan dibekukan adalah keputusan bisnis/legal. Kartu keputusan dikirim ke user 19 Nov (rekomendasi: bekukan, simpan data). Dicatat di Risiko sebagai `[⚠️]`; implementasi satu titik penegakan menyusul jawaban.

### [Issue 4] [impl-readiness, `egm-implementation-readiness`] - Severity: Major
*   **Discrepancy Description:** Klaim basi melaporkan `sent` palsu.
*   ***AI Suggestion:*** PROPOSE FIX (diterapkan)
*   ***Proposed Edit:*** `finishPlanAssignment` mengembalikan null bila tidak ada baris berubah → `409 ASSIGN_IN_PROGRESS`, audit `superseded`. Test baru.

### [Issue 5] [impl-readiness, codebase-details] - Severity: Major
*   **Discrepancy Description:** Perilaku hasil triase hanya di tabel triase (PATCH `ALREADY_ASSIGNED`, kunci plan, `status='open'` reclassify, SQL klaim, `CONSENT_WITHDRAWN`); payload EliteMentor tidak ditetapkan; daftar file kurang.
*   ***AI Suggestion:*** PROPOSE FIX (diterapkan)
*   ***Proposed Edit:*** Dipindah ke badan Endpoint + bagian "Perubahan pada endpoint yang ada"; payload ditulis; daftar file dilengkapi; tabel triase dipindah ke `triase-awal.md`.

### [Issue 6] [codebase-details, Spec] - Severity: Major
*   **Discrepancy Description:** `recommendation = null` juga untuk temuan tanpa kompetensi.
*   ***AI Suggestion:*** PROPOSE FIX (teks)
*   ***Justification:*** Katalog dicocokkan per kompetensi; spek kini menyatakannya.

### [Issue 7] [`egm-zoom-out` tahap 8 butir 5] - Severity: Major
*   **Discrepancy Description:** Daftar `improvement` melewati flag `module.ina`.
*   ***AI Suggestion:*** CONTEST
*   ***Justification:*** HR sudah melihat temuan yang sama di antrean review (spek, butir 3); tombol serah ke INA memakai `inaEnabled`.

### [Issue 8] [impl-readiness nit, Standards] - Severity: Nit
*   **Discrepancy Description:** Join tanpa `tenant_id`; urutan middleware `flag, hr`; istilah "non-pelatihan".
*   ***AI Suggestion:*** PROPOSE FIX (diterapkan)

### [Issue 9] [`egm-zoom-out` tahap 8 butir 6–8] - Severity: Nit
*   **Discrepancy Description:** Kursor `since` B9, pembatalan penugasan, paginasi solusi, sunting setelah disetujui, `title` di kontrak B9.
*   ***AI Suggestion:*** DECLINE (tunda)
*   ***Justification:*** Bergantung kontrak FR-EM dan konfirmasi T6; perilaku `since` (`>=`) dan saran dedupe ditulis di spek.

### [Issue 10] [`egm-design`, Standards] - Severity: Nit
*   **Discrepancy Description:** Kembali ke kategori AI tetap `edited`; `employeeIds` audit solutions tidak unik; balapan reclassify vs plan tanpa test; timeout adapter tanpa test pembatalan.
*   ***AI Suggestion:*** DECLINE
*   ***Justification:*** Tidak mengubah keputusan HR; balapan sudah dicegah oleh kunci `status = 'open'` di kedua sisi.

Ringkas: 6 diterapkan, 1 dibantah, 1 eskalasi (kartu keputusan UU PDP), 2 ditunda.
