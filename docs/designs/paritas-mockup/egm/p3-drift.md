## p3-komponen-bersama.md

Dicocokkan dengan kode di HEAD setelah triase review.

- Gap yang ditutup: semua baris ada di kode. `UiAgentCard` di `CoreCompetenciesView.vue` (VM lewat slot `RequirementsTab`, Values di atas `ProgramSection`), `DevelopmentNeedsView.vue`, `TnaScreen.vue` (di dalam `showBoard`, sebelum subjudul), `ImprovementNeedsView.vue` (sebelum subjudul, tabel verifikasi pindah ke kartu "Verifikasi AI" sebelum Akses atasan). `UiBreadcrumb` di CC, DNA, TNA, Detail gap, sesi IV, LI ×4, LD, CP, INA. `rowTo` di tabel gap kompetensi dan OKR, tabel persyaratan CC; Pareto memakai `RouterLink` per baris.
- Desain komponen: sesuai, kecuali prop `chip`/`headingLevel` yang dihapus saat review; spek sudah diperbarui (bukan drift).
- Keputusan K-P3-1..6: sesuai kode (kartu INA bergerbang `aiOn && !loadError`; DNA/INA tanpa `action`; kolom Orang/Status tetap; `?ubah=`; API aditif `code`, `competencyId`).
- Test dan File: daftar sesuai setelah P-1 diperbaiki.
- Drift kecil, diterima: spek menulis tabel verifikasi "di bawah daftar tindakan"; kode menaruhnya setelah catatan akses dan sebelum kartu Akses atasan, masih di bawah daftar.

## b0-fondasi-ui.md bagian 4, b5-training-needs.md bagian 6/16, b3-dashboard.md bagian 3

No drift detected: baris `UiDataTable`, `UiAgentCard`, `UiBreadcrumb` sesuai props di `src/ui`; contoh respons B5 memuat `code`, B3 memuat `competencyId`.
