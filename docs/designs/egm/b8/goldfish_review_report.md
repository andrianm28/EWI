Status: resolved (kecuali Issue 1 menunggu user)

# Goldfish Annotated Review Report

**Target:** `docs/designs/b8-karyawan.md` (full file) dan diff `origin/claude/project-thread-scbrmb...HEAD` bagian B8

Sumber: tahap 5–9 egm dan `mattpocock-skills:code-review` (laporan mentah di folder ini dan `../cr/`).

## Prioritized Findings & AI Suggestions

### [Issue 1] [`egm-design`, `egm-zoom-out`] - Severity: Blocker
*   **Affected Scope:** Aturan baca untuk persetujuan yang ditarik
*   **Discrepancy Description:** Pemrosesan temuan/rencana yang sudah disetujui berlanjut setelah persetujuan ditarik (risiko UU PDP).
*   ***AI Suggestion:*** ESCALATE
*   ***Justification:*** Keputusan user 19 Nov hanya menjawab soal hapus. Kartu keputusan baru dikirim (rekomendasi: bekukan, simpan data). Spek menandai `[⚠️]` dan Risiko.

### [Issue 2] [`egm-structural`, `egm-design`, `egm-zoom-out`] - Severity: Blocker
*   **Discrepancy Description:** Tidak ada Alternatif dan Risiko; atribusi tanpa tautan; legenda penanda.
*   ***AI Suggestion:*** PROPOSE FIX (diterapkan)

### [Issue 3] [codebase-details, Spec] - Severity: Blocker
*   **Discrepancy Description:** Butir 3(b) "semua sesi" bertentangan dengan kode (hanya TNA).
*   ***AI Suggestion:*** PROPOSE FIX (teks diterapkan; kode sudah benar)

### [Issue 4] [impl-readiness, `egm-zoom-out`] - Severity: Major
*   **Discrepancy Description:** Audit `beforeErase` tidak ikut transaksi (jejak palsu bila batal); audit penarikan dan penutupan setelah commit.
*   ***AI Suggestion:*** PROPOSE FIX (diterapkan)
*   ***Proposed Edit:*** `audit.record(..., { transaction })`; `withdrawConsent({ beforeCommit })`, `resolveWithdrawal({ beforeErase, beforeCommit })`. Test merah lalu hijau (audit gagal → tidak ada yang berubah).

### [Issue 5] [`egm-design`, `egm-zoom-out`, Standards] - Severity: Major
*   **Discrepancy Description:** Pintu hak subjek data di web bergantung `learner.home`; tidak ada `GET /me/data-requests`.
*   ***AI Suggestion:*** PROPOSE FIX (diterapkan)
*   ***Proposed Edit:*** `GET /api/employees/me/data-requests` tanpa flag, diaudit. Penghapusan `privacy.openRequests` dari `/my/results` DECLINE (beranda tetap butuh ringkasan tanpa panggilan kedua).

### [Issue 6] [`egm-design`, impl-readiness] - Severity: Major
*   **Discrepancy Description:** Isolasi lintas tenant permintaan data belum diuji; janji test lain hilang.
*   ***AI Suggestion:*** PROPOSE FIX (diterapkan sebagian)
*   ***Proposed Edit:*** Test `xhr` (daftar, fulfill 404). Rencana test di spek diselaraskan dengan test nyata; "hasil DNA tetap setelah erase" dan ekspor `consentWithdrawnAt` DECLINE (sudah dijamin query `submodule = 'tna'`).

### [Issue 7] [Standards] - Severity: Major
*   **Discrepancy Description:** Rute permintaan data tanpa flag (aturan 3).
*   ***AI Suggestion:*** ESCALATE ke reviewer Andrian
*   ***Justification:*** Disengaja (hak subjek data tidak boleh bergantung flag, pola PR #11); tercatat di "Penyimpangan" untuk persetujuan Andrian.

### [Issue 8] [`egm-design`] - Severity: Major
*   **Discrepancy Description:** Skor per kompetensi lawan Q45.
*   ***AI Suggestion:*** ESCALATE (sudah tercatat `[⚠️]`, menunggu Pak Eji lewat user)

### [Issue 9] [`egm-design`, `egm-zoom-out`] - Severity: Nit
*   **Discrepancy Description:** Mekanisme pemberitahuan HR; HR meminta datanya sendiri; sinkron EliteMentor saat hapus; undang ulang lewat B5.
*   ***AI Suggestion:*** PROPOSE FIX (teks: "melihat di daftar permintaan") dan DECLINE untuk sisanya, dicatat di Risiko.

### [Issue 10] [codebase-details, impl-readiness] - Severity: Nit
*   **Discrepancy Description:** Tanda tangan `submoduleActive`, `INSERT ... SELECT`, `409 INVALID_STATE`, indeks tenant, `transcriptPath`, lokasi test `deliveryFor`, daftar file.
*   ***AI Suggestion:*** PROPOSE FIX (teks diterapkan)

### [Issue 11] [`egm-zoom-out`] - Severity: Nit
*   **Discrepancy Description:** Istilah "Tarik persetujuan" dan "Permintaan data" belum di glosarium.
*   ***AI Suggestion:*** PROPOSE FIX (diterapkan di `CONTEXT.md` lewat `mattpocock-skills:domain-modeling`)

Ringkas: 7 diterapkan, 3 eskalasi (UU PDP ke user, flag ke Andrian, Q45 ke Pak Eji via user), sisanya ditunda dengan alasan.
