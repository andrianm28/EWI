# Review egm: persiapan demo 25 Nov (demo-alur dan penutupan gap web), triase 24 Nov

Review egm atas cabang persiapan demo (e2e `apps/web/e2e/demo-alur.spec.ts`, penutupan gap Terbuka web-only,
tenggat +14 hari). Tidak ada temuan P0 atau P1. Semua temuan ditangani di putaran yang sama; perubahan perilaku
dikerjakan test-first (test merah dulu, lalu hijau).

| # | Prio | Temuan | Keputusan | Tindakan dan bukti |
| --- | --- | --- | --- | --- |
| 1 | P2 | `demo-alur.spec.ts`: cek "tanpa alert" lolos sebelum muatan async selesai karena h1 statis | **Diperbaiki** | `mendarat()` dan `bukaMenu()` kini wajib menerima penanda muatan khas layar dari data mock (baris pareto, baris tabel, progressbar, tab berhitungan, isi kartu); urutan cek: h1, penanda termuat, lalu tanpa alert. Untuk layar dengan h1 yang sama dengan layar sebelumnya (daftar Wawancara akar masalah setelah sesi) penandanya bagian Riwayat. |
| 2 | P2 | `afterEach` hanya menangkap 404 tidak di-mock; penangan yang melempar (500 MOCK_GALAT) tidak dicatat; tidak ada pendengar pageerror/console.error | **Diperbaiki** | `support/api.ts` mencatat galat penangan (`galatMock(page)`). `demo-alur` mengumpulkan `pageerror`, `console.error` (kecuali "Failed to load resource", yang sudah tercakup pencatatan respons), dan respons ≥ 500; `afterEach` menuntut ketiganya kosong. Uji merah: penangan `GET /ina/access/me` dibuat melempar, test gagal dengan pesan "penangan mock melempar galat". |
| 3 | P3 | `UiDataTable.vue`: `tr:hover td` mengalahkan `tr.is-selected td`, sorotan baris terpilih hilang saat hover; tema gelap | **Diperbaiki** | Token `--el-table-selected` (terang `--el-surface-2`, gelap `--el-surface-3`, karena di tema gelap `--el-surface-2` sama dengan latar kartu); aturan `tr.is-selected:hover td` ikut memakai token itu. `b4-dna.spec.ts` memeriksa warna latar baris terpilih saat hover di tema terang dan gelap (merah sebelum perbaikan). Kode bersama: perlu review Andrian. |
| 4 | P3 | `b4-dna.spec.ts` hanya memeriksa kelas CSS baris terpilih | **Diperbaiki** | Test memeriksa `aria-current="true"` pada tombol nama pegawai yang dipilih dan ketiadaannya pada yang lain. |
| 5 | P3 | `TnaGapView.vue`: angka GAP selalu merah, juga untuk gap 0 atau OKR yang tercapai | **Diperbaiki** | Kompetensi merah hanya bila `gapPct > 0`; OKR merah hanya bila ada orang yang meleset (`peopleMissed > 0`). Test baru di `tna-gap.spec.ts` ("review egm TD-2: GAP tidak merah bila tidak ada gap"). |
| 6 | P3 | `AssignmentsHr.vue`: `showSynthesis` diam bila kartu belum dimuat dan bergantung pada query DOM `data-testid` | **Diperbaiki** | `SynthesisCard` mengekspos `focusHeading()` (judul h3 selalu dirender, juga saat memuat, dengan `tabindex="-1"`); `AssignmentsHr` memanggilnya lewat ref komponen. Test AH-4 di `core-competencies.spec.ts` tetap hijau. |
| 7 | P3 | `DevelopmentNeedsView.vue`: `openPlan` tanpa penjaga respons basi | **Diperbaiki** | Penjaga urutan `planSeq`: hanya respons permintaan terakhir yang ditampilkan. Test baru di `b4-dna.spec.ts`: rencana Ani ditunda 1,2 detik, HR memilih Budi, rencana Budi tetap tampil setelah respons Ani datang (merah sebelum perbaikan). |
| 8 | P3 | `support/demo-modul.ts`: tanggal tetap 2026-11-30 | **Diperbaiki** | Memakai `tanggalWib(6)` dari `support/tanggal.ts` (helper yang sama dengan tna-gap dan jalur-utama). |

Ditolak: tidak ada.

## Kode bersama yang disentuh cabang ini (review Andrian)

- `apps/web/src/ui/UiDataTable.vue`: prop `selectedKey`, event `select`, sorotan baris terpilih (temuan 3).
- `apps/web/src/ui/UiKpiCard.vue`: prop `tone="critical"`.
- `apps/web/src/ui/icons.ts`: ikon `insights`.
- `apps/web/e2e/support/api.ts`: pencatatan galat penangan mock (`galatMock`).
