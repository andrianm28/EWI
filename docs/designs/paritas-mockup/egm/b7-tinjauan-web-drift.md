# Drift · paritas B7 web

Spek `paritas-mockup/b7-tinjauan-web.md` dibandingkan dengan kode akhir branch `paritas-b7`.

| Butir spek | Kode | Status |
| --- | --- | --- |
| 1 Rute `review` `/tna/tinjauan`, meta views/roles/flag/title | `screens/b7-tinjauan/routes.ts` | sama |
| 2 Atasan tanpa akses | meta.roles HR/ETA; e2e atasan memantul; tombol detail gap hanya HR | sama |
| 3 Filter gap R6, `gap.label`, 400/404, counts per gap, kolom internal dibuang | `review-workspace.js` `gapFilterOf`, `index.js` `reviewForGap`, `gaps.js` `findingsInGap`, `lna-stores.js` `GAP_MATCH_COLS`; test API 4 kasus | sama |
| 4 Draf tanpa pilihan aktif, "saran AI: …" | `TinjauanView.vue` `current()` | sama |
| 5 `UiSegmented` `variant="chips"`, `disabled` per opsi | `UiSegmented.vue`, B0 §4 | sama |
| 6 Nama karyawan muted, tanpa `detail` | `TinjauanView.vue`; e2e `RINCIAN-RAHASIA` tidak tampil | sama |
| 7 Ditolak disembunyikan, tautan antrean | sama | sama |
| 8 Solusi: modul, tugaskan/plan+assign, `lms_export` + CSV | `runTraining`, `downloadCsv` | sama; meta modul tanpa "roadmap DACUM" `[⏳ DITERIMA]` |
| 9 Serah ke Improvement Needs, "n temuan diteruskan…" | `handoff` | sama |
| 10 Tujuan tombol detail gap | `TnaGapView.vue` `reviewTo` | sama |
| 11 Dashboard ke `tna-review` | `DashboardView.vue`, spek B3 | ditambahkan saat triase |
| 12 Temuan beku disembunyikan per gap | `reviewForGap` filter `consentWithdrawnAt`; `/review/solutions` sudah `notFrozen` | ditambahkan saat triase |
| 13 Antrean lama dipindah dan ditulis ulang | `AntreanView.vue`; `legacy-review` dan `views/ReviewView.vue` dihapus; B0 §5.3 | sama; h1 lama "Review hasil AI" dipertahankan (dirujuk test), crumb top bar "Tinjauan hasil AI" |

Tidak ada drift terbuka. Yang menunggu keputusan user: RV-3/TD-6 (akses atasan).
