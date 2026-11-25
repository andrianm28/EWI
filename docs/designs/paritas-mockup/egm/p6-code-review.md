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

## Review independen (sesi induk, 23 Nov)

Temuan reviewer egm independen dari sesi induk, diperbaiki test-first: test merah `38ec46e`, perbaikan di commit berikutnya.

| # | Bobot | Temuan | Triase |
| --- | --- | --- | --- |
| M1 | sedang | "Simpan perubahan" tersembunyi di "Kelola draf" yang tertutup, jadi suntingan bisa hilang saat pindah langkah atau keluar | **Diperbaiki** (K-P6-5): penanda `dirty`, simpan otomatis saat pindah langkah dan di `onBeforeRouteLeave` (tanpa dialog; simpan gagal = tidak pindah), `beforeunload` saat menutup tab. E2e: tanpa perubahan tidak ada PUT; dengan perubahan ada PUT saat pindah langkah dan saat keluar lewat breadcrumb |
| M1b | sedang | "Hapus draf" tanpa konfirmasi | **Diperbaiki**: konfirmasi sebaris "Yakin hapus draf ini?" + "Ya, hapus"/"Batal". E2e: Batal tidak mengirim DELETE; Ya mengirim `DELETE /drafts/d-1` lalu pindah ke `/req` |
| M2 | sedang | Tidak ada e2e untuk "Simpan perubahan" | **Diperbaiki**: e2e memeriksa isi PUT dan "Perubahan disimpan." Tombol nonaktif bila tidak ada perubahan |
| M-a | sedang | Respons filter basi (`watch(filter, load)`) dan `pick()` bisa menimpa pilihan terbaru | **Diperbaiki** (K-P6-6): penjaga urutan terpisah untuk daftar dan detail. E2e dengan respons Pareto yang sengaja lambat |
| M-b | sedang | Hasil filter kosong tanpa pesan | **Diperbaiki**: "Tidak ada modul yang cocok dengan filter." + "Hapus semua filter"; e2e |
| M3 | sedang | Celah test: kandidat, course prioritas Program, LI-23, LI-18 dengan kode, kalimat LI-3, chip detail LI-9/10/12 | **Diperbaiki**: mock kandidat ST-B9 dan course prioritas ST-A2; e2e untuk chip `jumlah-permintaan`, kalimat LI-18 ber-kode, kalimat LI-3 (dan tidak muncul saat difilter), chip detail, path ikon `auto_awesome`, dua tombol sebaris, "Kembangkan" pada kandidat (POST `/modules/m-3/draft`) |
| N1 | rendah | Chip asesmen "{n} tujuan tercakup" bisa ditulis "{n} dari {m}" | **Diperbaiki**: m = jumlah tujuan bertipe sama; e2e "1 dari 1 tujuan tercakup" |
| N2 | rendah | `gapOf` tidak menyebut jabatan di tenant yang punya satu jabatan | **Diperbaiki**: dipakai satu-satunya jabatan; e2e |
| N3 | rendah | "Course prioritas tampil paling atas…" tampil walau tidak ada prioritas | **Diperbaiki**: hanya bila ada course prioritas |
| D1 | rendah | B0: baris `UiSegmented` belum menyebut opsi `pending?` (B7) | **Diperbaiki**: `docs/designs/b0-fondasi-ui.md` menyebut `pending?` dan perilaku `aria-disabled` |
| K1 | rendah | Filter tidak disinkronkan ke URL | **Diterima** `[⏳ DITERIMA]` (K-P6-7) |
| K2 | rendah | Baris modul memakai `aria-current` (spek baris 84) | **Diterima**: perilaku lama dipertahankan, bukan listbox (K-P6-7) |
| N5 | rendah | Keadaan memuat dan e2e jalur galat | **Diterima**: kekurangan lama, tidak diubah di P6 (K-P6-7) |
| N6 | rendah | Jalur B13 belum diuji e2e | **Tindak lanjut** (K-P6-7): permintaan delivered→installed dengan course katalog, draf `returned` + catatan SME, lepas tautan course, galat API per aksi |
