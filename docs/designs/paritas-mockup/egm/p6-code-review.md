# P6 · Code review (dua sumbu, mandiri)

Titik tetap: `c067491` (`git diff c067491...HEAD`). Commit: `e80dd78` spek, `8872750` test merah, `1b6a7b7` kode hijau. Skill: `mattpocock-skills:code-review`; sesi ini tanpa tool Agent, jadi kedua sumbu dikerjakan berurutan di sesi yang sama. Sesi induk menjalankan `egm:egm-codebase-details` independen.

Standards: `CLAUDE.md` (bahasa Indonesia, test-first, aturan arsitektur), `docs/designs/b0-fondasi-ui.md` (token `--el-*`, komponen `src/ui`, §5.3 rute), baseline smell Fowler. Spec: [p6-li.md](../p6-li.md).

## Standards

| # | Temuan | Jenis | Triase |
| --- | --- | --- | --- |
| S1 | `li.css`: baris terpilih `--el-surface-2`; di mode gelap `--el-surface-2` = `--el-surface-card` (#1D2024), jadi pilihan tidak terlihat di daftar berlatar kartu | pelanggaran B0 §3 (kontras dua tema) | **Diperbaiki**: `:root[data-theme='dark'] .li-item[aria-current='true']` memakai `--el-surface-3` |
| S2 | `ui/icons.ts`: `auto_awesome` bukan dari `@material-symbols/svg-400` seperti klaim kepala file | dokumentasi | Diterima, komentar sebaris menyebut sumber (Material Icons, Apache-2.0) dan skala; K-P6-4 di spek |
| S3 | Repeated Switches (penilaian): pemetaan tone chip status muncul di `statusLabel` (labels.ts), tone status permintaan di RequestsView, tone status draf di DraftView, tone tipe KSA di DraftView | smell, judgement | Diterima. Tiga domain status berbeda (modul, permintaan vendor, draf); satu peta bersama akan mencampur domain. Dicatat untuk P7 bila X-2 diputuskan global |
| S4 | `shortVendor` = kata pertama nama vendor (heuristik) | Primitive Obsession ringan | Diterima (K-P6-3); field `vendorShortName` di API bila tenant lain bernama satu kata panjang |
| S5 | Tidak ada hex baru, semua token `--el-*`; komponen dari `@/ui`; copy Indonesia; tidak ada perubahan API/tenant/RG-3 | - | OK |
| S6 | Tombol pemilih jabatan Program memakai `<button class="li-pick">` buatan layar, bukan komponen `src/ui` | judgement | Diterima: pola `.ac` mockup hanya dipakai di layar ini; komponen baru = Speculative Generality |

## Spec

| # | Temuan | Triase |
| --- | --- | --- |
| P1 | LI-9 spek: "Belum ada data gap untuk modul ini…" untuk modul non-prioritas. Kode: "Tidak termasuk modul prioritas Pareto." karena API tidak membedakan modul tanpa data gap dari modul bergap di luar 80% | Kode benar; spek diselaraskan (drift) |
| P2 | LI-11 spek: copy mockup lengkap. Kode membuang "(kontrak, SLA, EliNotes, alur layanan)" karena itu data tenant demo (Elitery), bukan copy produk | Diterima; dicatat di spek dan gaps-modul (Sebagian) |
| P3 | Scope: status permintaan di RequestsView dan chip Pareto kandidat ikut berubah ke `UiChip` (tidak tercantum di tabel spek) | Diterima, konsisten dengan K-P6-2; ditambahkan ke spek |
| P4 | LI-17 "Tersedia · dari {vendor}" mengikuti mockup, padahal modul tersedia juga bisa dari rancangan ELGOS yang ditautkan ke katalog | Diterima (copy 1:1); catatan di drift |
| P5 | LI-33: "Ke daftar permintaan" kini hanya di langkah 4 (mockup); langkah 1–3 tetap punya breadcrumb tautan | Sesuai mockup |
| P6 | Semua test spek 1–7 ada di `li.spec.ts` dan lulus | OK |

Ringkasan: Standards 6 temuan (terburuk S1, diperbaiki); Spec 6 temuan (terburuk P1, spek diselaraskan).
