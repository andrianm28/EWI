## Standards (mattpocock-skills:code-review, fixed point origin/claude/project-thread-scbrmb 1b25810, 19 Nov)

**Pelanggaran standar terdokumentasi**
- Aturan 3: rute `/me/data-requests` dan `/data-requests*` tanpa flag (alasan hak subjek data tertulis di kode); perlu diterima eksplisit oleh Andrian atau ADR.
- Aturan 3 (penilaian): `/api/my` dan `/api/assistant` tanpa `requireSubmodule()`, cek per submodul lewat `submoduleActive`; penyimpangan tercatat; flag default mati.
- CONTEXT.md: "temuan non-pelatihan" masih di komentar (migrasi 20261119000700 baris 3, `review-workspace.js` di atas `/review/improvement-handoff`, docstring `handoffImprovement`/`improvementCounts`).
- CONTEXT.md (penilaian): "undangan" di teks asisten (`SUGGESTIONS`, stub).
- Aturan 1, 2, 4–6: tidak ada pelanggaran. Migrasi 20261119001700 mengubah tabel PR #15 dan `down`-nya menghapus baris: wajib review Andrian (aturan 7).

**Bau kode (penilaian)**
- Duplicated Code: builder `gapTim`/`gap`, `rencanaTim`/`rencana`; template stub; `OPEN` di `my/index.js` dan `facts.js`; `countBy` vs reduce; regex UUID keempat; `submoduleActive` mengulang logika `requireSubmodule`.
- Repeated Switches / Primitive Obsession: string view `karyawan/atasan/hr` di beberapa cascade.
- Speculative Generality: `registerView/FactBuilder/Page`; env `ELITEMENTOR_ASSIGNMENTS_ENABLED` di atas flag `em.gaps_autosend`.
- Shotgun Surgery: operasi `assistant_reply` menyentuh 4 tempat.
- Divergent Change: `lna-stores.js` +444 baris.
- Feature Envy: `assistant/facts.js` memakai `toReviewItem`, `competencyView`, `PLAN_VISIBLE`.
- Mysterious Name: `base` di `classify` hanya `reviewerId` terbaca; `my/view.js` vs `assistant/views.js`, `em`, `S`, `conf`.
