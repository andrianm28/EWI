# B7 · Tahap 6 Comprehension Test (egm-comprehension, subagent baru, hanya membaca spek)

## Apa yang diusulkan
Paket B7 membangun backend layar "Tinjauan temuan AI": HR mengklasifikasi tiap temuan dengan tiga tombol (Training Needs, Improvement Needs, Perlu ditinjau HR = ditahan, tetap draf), boleh memindah klasifikasi selama belum ditindaklanjuti, dengan target 2 hari kerja dan penanda terlambat. Setelah itu HR melihat solusi: temuan pelatihan dibuatkan rencana lalu ditugaskan ke EliteMentor atau diekspor CSV untuk LMS klien; temuan non-pelatihan diteruskan ke Improvement Needs (B9) lewat penanda yang dibaca B9 tanpa data individu. Semua di balik flag `tna.review_workspace`; penugasan EliteMentor dimatikan lewat env sampai kontrak FR-EM final; tenant pilot memakai ekspor CSV.

## Cara kerja sistem yang ada, menurut dokumen ini
PR #16 menyediakan `lna_findings` dengan `review_status` (draft → approved/edited/rejected) dan `category`; draf hanya terlihat di antrean review (`GET /api/tna/review`, `POST /findings/:id/review`). PR #12/#13 menyediakan rencana pelatihan dan pencocokan katalog; rencana dibuat lewat `POST /findings/:id/plan`. Sudah ada klien EliteMentor (OAuth2) dan `requireSubmodule`.

## Temuan
- 🔴 1. Putusan "Perbaiki" di triase diff belum masuk ke badan spek: syarat `status = 'open'` pada reklasifikasi dan plan (`409 ALREADY_ACTIONED`), PATCH course dan `409 ALREADY_ASSIGNED`, `projectId` tidak valid → 400, `finishPlanAssignment` terikat klaim, audit handoff memuat `employeeIds`, field `consentWithdrawnAt`/`handedOffAt`, `delivery.target`.
- 🟡 2. Penanda `[⏳ DITERIMA]` dan `[⚠️ BELUM TERVERIFIKASI]` tidak didefinisikan.
- 🟡 3. Kode keputusan tanpa definisi (PK-14, PM-6, FR-EM, ★A, RG-4 "ya revisi", Sheet Ronde 4, Pak Eji).
- 🟡 4. "Admin ETA" tidak didefinisikan, padahal lolos semua `requireRole`.
- 🟡 5. Flag/modul lain tanpa penjelasan (`module.ina`, `tna.non_training_hr`, `em.gaps_autosend`, `em.sso`; INA = B9?).
- 🟡 6. Tombol "Tugaskan" ambigu untuk tenant `lms_export`.
- 🟡 7. Nomenklatur B/T/PR bercampur tanpa penjelasan.
- 🟢 8–11. Istilah teknis tanpa definisi (`scoringAgreement`, `confidence` 0–1 lawan %, `programTier`, origin, `requested`), endpoint `/findings` tidak didefinisikan, "pihak lain" tidak jelas, rujukan triase tidak lengkap.
