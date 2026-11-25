# P5 · Review diff (paritas LNA)

Titik tetap: `c067491` (HEAD awal worktree). Diff: `c067491..06cd22f` (spek `fdb1e29`, test merah `314a87e`, kode hijau `06cd22f`).
Dua sumbu dikerjakan sendiri (sesi ini tanpa tool Agent); sesi induk menjalankan `egm:egm-codebase-details` independen.

## Sumbu Standards (CLAUDE.md + B0)

| # | Temuan | Triase |
| --- | --- | --- |
| S-1 | Rute baru `tna-kelola` mengulang `views`, `submodule`, `menuKey` induk dan punya `name` (B0 5.3 aturan 2 dan 4) | Sesuai |
| S-2 | `TnaPengelolaan` tidak lagi memakai kelas Tailwind; hanya `Ui*`, kelas `el-*`/`tna-*`, token `--el-*` (aturan 5). Pengecualian: `ImportPanel` bersama yang dipasang di dalamnya | **Terima**: kode bersama (4 layar), di luar P5; dicatat di spek "Tidak dikerjakan". Test mengecualikan elemen ber-`data-import-panel` |
| S-3 | Tidak ada perubahan API, migrasi, auth, atau flag; arsitektur 1-7 tidak tersentuh. `api/cca.ts` `fmtDate` diberi parameter opsional (kompatibel) | Sesuai |
| S-4 | Bahasa produk Indonesia; tidak ada teks "EWI" baru | Sesuai |
| S-5 | `UiStatus` global dan `UiKpiCard` bersama tidak diubah (K-3, kode bersama); KPI tanpa bingkai CC-4 dibuat lokal dengan kelas `el-kpi__*` | **Terima**: menghindari review kode bersama untuk satu layar. Bila layar lain butuh, jadikan varian `UiKpiCard plain` |
| S-6 | `.tna-stack p { margin: 0 }` menyentuh semua `p` turunan termasuk di dalam `ImportPanel` | **Terima**: preflight Tailwind sudah membuat margin `p` 0; tidak ada beda visual (diperiksa di foto) |
| S-7 | Gaya `:deep(td:nth-child(n))` INA bergantung urutan kolom | **Terima**: kolom tetap dan didefinisikan di file yang sama; komentar menjelaskan |

## Sumbu Spec (p5-lna.md)

| # | Temuan | Triase |
| --- | --- | --- |
| P-1 | CC-3: 5 kolom, panel memuat status + Validasi/Tolak, muat di 1280 (diuji `scrollWidth`) | Sesuai |
| P-2 | CC: setelah Validasi/Tolak dari panel, panel ditutup dan `?ubah` dihapus | Sesuai (test) |
| P-3 | AH-6: daftar tema, teks mono, bar = karyawan sejalan, merah ≥ 20, 3 tombol; kelola di `<details>` | Sesuai. Ambang merah dihitung di web (`gap >= 20`), bukan `hot` API, agar sama dengan aturan CC-5/TN-9; nilainya identik dengan aturan D-7 |
| P-4 | AH-1: KPI ke-4 dari `SynthesisCard` lewat event `loaded` (tanpa panggilan API kedua) | Sesuai |
| P-5 | TN-2: papan menyala → tanpa pengelolaan di `/tna`; papan mati → tetap; karyawan → tetap (papan tidak tampil untuk karyawan) | Sesuai |
| P-6 | IN-7: `?ubah` dibuka dari URL, id tak dikenal dihapus setelah data termuat (`level` terisi), Batal/Simpan/Verifikasi menghapus `?ubah` | Sesuai (test) |
| P-7 | IN-7: klik pada `select` status tidak membuka formulir | Sesuai (test) |
| P-8 | IN-7 di daftar "menyangkut individu": `?ubah` untuk tindakan yang tidak ada di daftar aktif dihapus | **Terima**: perilaku sama dengan id tak dikenal |
| P-9 | DN-12, AH-4, IN-8, CV-2/4/5 tidak dikerjakan | Dicatat di spek bagian "Tidak dikerjakan" |
| P-10 | Spek menyebut "Kelola TNA" tombol outlined kecil di bawah tab papan; kode menaruhnya setelah panel tab (di bawah isi tab) | Sesuai maksud (sekunder, tidak mengganggu tata letak) |

## Gate

- `npm run lint -w apps/web`: bersih.
- `npx vue-tsc --build`: bersih.
- e2e (`playwright test`, port 4185 lewat config sementara): **287 lulus**, 0 gagal.
- Foto diperiksa: CC VM 1280, INA 1280 setelah verifikasi, `/tna` papan mati (pengelolaan bergaya token).

## Review independen (sesi induk, 23 Nov)

Review egm independen atas P5 (sudah di-merge di `eb92274`). Diperbaiki di cabang `paritas-p5-triase`, test merah `9e0775c` lalu hijau `e6144e1`. S-7 dan P-8 di atas digantikan oleh baris 11 dan 7.

| # | Bobot | Temuan | Triase |
| --- | --- | --- | --- |
| 1 | M1 | Papan menyala: banner "temuan AI menunggu review" ikut pindah ke `/tna/kelola`, HR tidak melihatnya lagi di `/tna`; atasan kehilangan "Wawancara untuk Anda" | **Perbaiki**: `UiNote` ringkas `tna-review-ringkas` di atas tab untuk HR bila `reviewPending > 0` (`GET /tna/dashboard`), tombol "Review". Atasan: **Terima**, dicatat di K-P5-4 (menu `iv`). e2e |
| 2 | M2 | Akses `/tna/kelola` tidak diuji | **Perbaiki**: e2e karyawan dan atasan membuka langsung, submodul `tna` mati → beranda seperti `/tna` |
| 3 | M3 | Spek B5/B10/B4 tertinggal dari kode | **Perbaiki**: B5 baris rute `tna-kelola`, kalimat `TnaPengelolaan` §16, daftar test; B10 tiga KPI Values, tombol isi nilai di bagian lipat, panel `?ubah`; B4 label tab DN-3 |
| 4 | sedang | `/tna/kelola` dengan papan mati tetap menampilkan pengelolaan di URL kedua | **Perbaiki**: logika papan dipindah ke `board.ts` (`useShowBoard`), `TnaKelolaView` `router.replace` ke `tna` bila papan tidak tampil. e2e |
| 5 | sedang | Panel `?ubah` (CC, INA) terbuka tanpa memindah fokus | **Perbaiki**: judul panel `tabindex="-1"`, fokus di `nextTick`; CC juga digulir ke tampilan. e2e `toBeFocused` |
| 6 | sedang | Validasi/Tolak bisa diklik ganda (PATCH ganda); Tolak langsung tanpa konfirmasi | **Perbaiki**: penjaga `busy` (tombol nonaktif, satu permintaan), Tolak meminta konfirmasi di tempat ("Ya, tolak" / "Batal tolak", tanpa `window.confirm`). e2e |
| 7 | sedang | INA: `?ubah` tetap di URL untuk level non-manage; id di daftar "menyangkut individu" dibuang | **Perbaiki**: level non-manage membuang `?ubah`; id tak dikenal dicari dulu di `?hidden=1`, bila ada daftar itu dibuka lalu formulirnya. e2e |
| 8 | rendah | Copy verifikasi INA menyuruh memilih tombol yang ada di formulir, bukan di baris | **Perbaiki**: "Klik baris tindakan yang punya pemilik, lalu pilih "Verifikasi lewat AI"." Note IN-5 level non-manage ("tindakan selesai") dicatat sebagai keputusan K-P5-10 |
| 9 | rendah | TN-12: tebal hanya pada "OKR" | **Perbaiki**: `<b>pencapaian OKR</b>` seperti mockup. e2e |
| 10 | rendah | AA-5: tombol tonal nonaktif "Selesai"/"Menunggu karyawan" tampak bisa diklik | **Perbaiki**: teks status redup; AA-5 menjadi **Sebagian** (K-P5-11). e2e |
| 11 | rendah | Gaya kolom INA memakai `nth-child` | **Perbaiki**: kelas per kolom lewat slot sel (`ina__nowrap`, `ina__overdue`, `ina__title`) |
| 12 | rendah | Kalimat K-P5-4 tidak sesuai posisi tautan Kelola TNA | **Perbaiki**: "di bawah panel tab papan (sesudah isi tab)" |
| 13 | rendah | Ubahan yang belum disimpan tertimpa saat mengklik baris lain (CC, INA) | **Catat** `[⏳ DITERIMA]`: butuh pola "buang perubahan?" bersama; risiko rendah karena formulir pendek |
| 14 | rendah | Pratinjau karyawan (sintesis) tidak punya tombol tutup | **Catat**: tertutup lewat `<details>` "Kelola nilai aktual dan pratinjau"; tombol tutup menyusul bila pratinjau dipisah |
| 15 | rendah | Jalur belum diuji | **Sebagian**: ditambah test klik "Lihat Vision & Mission" dan karyawan `/tna` dengan papan menyala; jalur lain dicatat |

### Gate triase

- `npm run lint` (apps/web): bersih.
- `npx vue-tsc --noEmit -p tsconfig.app.json`: bersih.
- e2e penuh (port 4185, config sementara): **311 lulus**, 0 gagal.
