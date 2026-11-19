# Catatan triase awal b7 (19 Nov 2026)

Dipindahkan dari `docs/designs/b7-tinjauan-hr.md` saat egm-resolve (tahap 5–9). Keputusan yang masih berlaku sudah dimasukkan ke badan spek.

## Catatan triase review spek (19 Nov)

Review oleh subagent baru tanpa konteks percakapan; 15 temuan (4 berat).

| # | Temuan | Putusan |
| --- | --- | --- |
| 1 | Penugasan ganda saat klik bersamaan atau timeout | **Perbaiki**: status `sending`, klaim bersyarat, kunci idempotensi, batas waktu, test paralel |
| 2 | Course Moodle terkirim ke EliteMentor; `lms.delivery` vs `lms.targets` | **Perbaiki**: `COURSE_NOT_IN_TARGET`, penjelasan dua setting, setelan tenant pilot |
| 3 | Alur pembuatan rencana tidak tertulis; `requested` dan course kosong lolos | **Perbaiki**: bagian Alur, cek `catalog_item_ref`, hanya `new`/`in_progress` |
| 4 | Kontrak B9 membawa data individu | **Perbaiki**: kontrak tanpa `userId` dan `detail` |
| 5 | "Perlu ditinjau HR" sebagai saran AI | **Perbaiki**: `suggestedClassification = needs_review` untuk keyakinan rendah |
| 6 | Klasifikasi langsung final | **Perbaiki**: klasifikasi ulang selama belum ditindaklanjuti |
| 7 | `GET` ekspor menulis data | **Perbaiki**: ekspor hanya membaca |
| 8 | Empat gerbang penugasan tanpa tabel | **Perbaiki**: tabel keputusan, fallback setting |
| 9 | `organizationIdFor` tanpa sumber | **Perbaiki**: `lms.elitementorOrganizationId`; data keluar dicatat |
| 10 | Awal hitungan dan akhir pekan ambigu | **Perbaiki**: dari `ended_at` sesi, contoh eksplisit |
| 11 | Klasifikasi tanpa flag melanggar aturan 3 | **Perbaiki**: semua aksi baru di balik `tna.review_workspace`; hanya field baca yang tanpa flag |
| 12 | Definisi field kurang | **Perbaiki**; N panggilan katalog diterima `[⏳]` |
| 13 | Sukses handoff tanpa tindakan nyata | **Perbaiki** teks dan `UPDATE` bersyarat; konfirmasi T6 dikirim |
| 14 | Status PO-6 dan PD-14 | **Perbaiki**: PO-6 sudah dijawab 18 Nov (Sheet Ronde 4), PD-14 ditandai default |
| 15 | Admin ETA, enkripsi, urutan audit | Admin ETA dan urutan audit **diterima** `[⏳]` dengan alasan di spek; `REVIEW_ENC` **diperbaiki** |

## Catatan triase review diff (19 Nov)

Review oleh subagent baru (diff + spek saja); 11 temuan, tidak ada yang berat.

| # | Temuan | Putusan |
| --- | --- | --- |
| 1 | Klasifikasi ulang balapan dengan pembuatan rencana | **Perbaiki**: `planFromFinding` mengunci dan memeriksa ulang temuan dalam satu transaksi (`409 ALREADY_ACTIONED`); `reclassifyFinding` juga mensyaratkan `status = 'open'` |
| 2 | Course rencana bisa diganti lewat PATCH setelah ditugaskan; klaim tidak memeriksa ulang | **Perbaiki**: PATCH course ditolak bila `sending`/`sent` (`409 ALREADY_ASSIGNED`); klaim mensyaratkan status aktif, course ada, sumber `elitementor` |
| 3 | Batas waktu tidak mencakup pengambilan token; galat tidak dicatat | **Perbaiki**: `signal` diteruskan ke fetch token; nama galat dicatat di log |
| 4 | Setting salah bentuk (`"lms": null`) melempar 500 | **Perbaiki**: bagian yang bukan objek memakai default; test unit |
| 5 | Celah test | **Perbaiki** sebagian: flag mati untuk assign, `sent` lalu `lms_export` tetap 200, PATCH terkunci, `projectId` tidak valid, normalisasi org id. Balapan dua HR dibiarkan longgar (urutan tidak deterministik) `[⏳ DITERIMA]` |
| 6 | `already` pada handoff bisa salah | **Perbaiki**: dibaca setelah `UPDATE` |
| 7 | Audit handoff tanpa `employeeIds` | **Perbaiki** |
| 8 | `projectId` tidak divalidasi | **Perbaiki** di endpoint baru (400) |
| 9 | Penutupan klaim tanpa pemilik | **Perbaiki**: `finishPlanAssignment` mensyaratkan `assignment_claimed_at` milik klaim itu |
| 10 | Field tambahan di respons review, `delivery.target = 'lms'` | **Diterima**: `consentWithdrawnAt`/`handedOffAt` hanya untuk HR; `target` bernilai `elitementor` atau `lms` (sama dengan B8 `where.target`); `note` pada klasifikasi ulang diabaikan |
| 11 | `counts.draft` dan `held`/`overdue` dari dua query | **Diterima** (kosmetik) |
