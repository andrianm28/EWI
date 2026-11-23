# P6 · Drift spek vs kode

Spek: [p6-li.md](../p6-li.md). Kode akhir: `apps/web/src/screens/b13-li/*`, `apps/web/src/ui/icons.ts`, test `apps/web/e2e/li.spec.ts`.

| Butir spek | Kode | Status |
| --- | --- | --- |
| LI-5 filter `UiSegmented variant="chips"`, kunci '' = Semua | LibraryView `filterRows`, kartu `data-testid="filter-modul"` | Sesuai |
| LI-7 grid `70px 1fr auto`, chip KSA/jabatan/Pareto/status, terpilih `--el-surface-2` | li.css `.li-item`; tambahan mode gelap `--el-surface-3` (review S1) | Sesuai + perbaikan |
| LI-9 kalimat non-prioritas | "Tidak termasuk modul prioritas Pareto." | Spek diselaraskan ke kode (review P1) |
| LI-11 copy | tanpa contoh topik tenant | Spek diselaraskan (review P2) |
| LI-27 grid `240px 1fr`, < 900px satu kolom | DraftView `.li-dev` | Sesuai |
| LI-28 chip meta, status draf tetap | chip status draf ikut di baris chip meta (bukan paragraf sendiri) | Sesuai (posisi detail) |
| LI-33 Simpan/Hapus di `<details>` "Kelola draf" | ada, hanya bila draf dapat disunting | Sesuai |
| K-P6-2 status jadi `UiChip` | Library, Program, Permintaan, Draf | Sesuai; Permintaan ditambahkan ke spek (review P3) |
| LI-17 catatan "dari {vendor}" | sesuai mockup; bisa kurang tepat bila modul tersedia lewat rancangan ELGOS | Catatan terbuka (review P4) |
| Tidak dikerjakan: LI-4, LI-13, LI-24, LI-28 copy, LI-29, LI-34 | tidak diubah | Sesuai |

Tidak ada drift yang tersisa tanpa catatan.
