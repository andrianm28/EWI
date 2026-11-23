# P2 · Review diff (mattpocock-skills:code-review + goldfish egm-codebase-details)

Titik tetap: `origin/claude/project-thread-scbrmb` (524dead). Commit 9100215 (test merah), 6ed62c3 (perbaikan), lalu perbaikan triase.

## Standards (CLAUDE.md, spek B0)

| # | Temuan | Jenis | Triase |
| --- | --- | --- | --- |
| S-1 | B0 bagian 3 dan 5.4 masih menyebut tombol tema di top bar | pelanggaran kontrak | **Perbaiki**: B0 diperbarui |
| S-2 | Tombol tema memakai `.el-nav` di dalam landmark navigasi (Refused Bequest) | penilaian | **Tolak dengan alasan**: drawer satu-satunya tempat yang selalu ada di semua layar; tombol tetap `aria-pressed` dengan nama "Mode gelap". Penghitung grup dipersempit (S-4) |
| S-3 | `.b8-list.b8-sub` menduplikasi nilai 20px (Duplicated Code) | penilaian | **Perbaiki**: `.b8-sub` dipindah ke bawah `.b8-list` |
| S-4 | Selektor `button[aria-expanded]` ditulis di dua spec | penilaian | **Perbaiki**: helper `grupAkordion` di `e2e/support/sesi.ts`, dipersempit ke `.el-drawer__list` |
| S-5 | Impor `li.css` di empat view (Shotgun Surgery ringan) | penilaian | **Tolak**: pola sama dengan `b8.css` |
| S-6 | Letak aturan `.el-drawer__foot` di antara aturan `.el-nav` | nit | Tunda |

## Spec (p2-bug-tampilan.md)

| # | Temuan | Triase |
| --- | --- | --- |
| P-1 | S2 hanya diuji untuk HR; Admin (tiga tampilan) kasus terlebar | **Diuji**: Admin tetap membungkus, juga di mockup (lebar minimum bar mockup > ruang konten). Dicatat `[⏳ DITERIMA]` di spek; test ditambah untuk atasan + karyawan |
| P-2 | LI-26 `/req` dibuka langsung tanpa test | **Perbaiki**: test `.li-split` `display: grid` |
| P-3 | B0 basi | sama dengan S-1 |
| Lingkup tambahan | tidak ada | - |

## Goldfish (egm-codebase-details)

| # | Bobot | Temuan | Triase |
| --- | --- | --- | --- |
| G-1 | sedang | Baseline snapshot visual mungkin basi | **Perbaiki**: `shell-beranda-*`, `dashboard-hr-*` diperbarui (`--update-snapshots=all`), gambar gelap diperiksa |
| G-2 | sedang | Tidak ada test tombol tema di bawah 900px | **Perbaiki**: test lebar 600 buka drawer → Mode gelap → `data-theme=dark` |
| G-3 | ringan | Status tertekan hanya ikon | **Tolak**: perilaku sama dengan tombol lama (B0 5.4) |
| G-4 | ringan | Test 64px rapuh terhadap panjang email | Diterima; fixture tetap |
| G-5 | ringan | Penghitung grup longgar | sama dengan S-4 |
| G-6 | ringan | Spek tanpa prefiks `e2e/`, snapshot tidak disebut | **Perbaiki** |

Ringkasan: Standards 6 temuan (terberat S-1, diperbaiki), Spec 3 (terberat P-1, diterima dengan alasan), goldfish 6 (terberat G-1/G-2, diperbaiki).
