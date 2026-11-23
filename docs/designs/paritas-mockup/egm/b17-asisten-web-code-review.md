# B17 web · Review diff (mattpocock-skills:code-review)

Titik tetap: `57144a8` (head `claude/project-thread-lknsx4`). Commit: d3d6e14 (spek), e56b603 (triase spek), 28ec9e6 (test merah), b7fe713 (kode, hijau), lalu perbaikan triase.

Catatan proses: tool `Agent` tidak tersedia di sesi subagent ini, jadi kedua sumbu dan pemeriksaan gaya `egm:egm-codebase-details` dijalankan berurutan oleh agen yang sama, masing-masing hanya terhadap sumbernya (Standards: `CLAUDE.md` + `docs/designs/b0-fondasi-ui.md` + baseline smell; Spec: `b17-asisten-web.md`). Review independen oleh egm sebaiknya diulang sesi induk saat menggabungkan.

## Standards (CLAUDE.md, B0)

| # | Temuan | Jenis | Triase |
| --- | --- | --- | --- |
| S-1 | B0 5.3 aturan 5: layar baru memakai `Ui*` dan token. FAB, tombol Tutup, dan chip saran memakai `<button>` biasa | penilaian | **Tolak dengan alasan**: tidak ada komponen `Ui*` untuk tombol ikon bulat atau chip yang bisa diklik (`UiChip` adalah label status); warna tetap token `--el-*`. Tombol "Buka" dan "Kirim" memakai `UiButton` |
| S-2 | Bayangan panel `0 8px 24px rgb(0 0 0 / .25)` bukan token | penilaian | **Terima**: nilai mockup `.asst`; token `--el-shadow` hanya untuk bayangan kecil. Pola sama dengan scrim `AppShell` |
| S-3 | `store.ask` menulis `turns = [...].slice(-MAX_TURNS)` tiga kali (Duplicated Code) | penilaian | **Perbaiki**: fungsi `push(turn)` |
| S-4 | Aturan 3 (fitur baru di balik flag baru, default mati) | kepatuhan | Lolos: flag `assistant` sudah ada di API (default mati) dan diperiksa `session.hasFlag('assistant')` |
| S-5 | Bahasa produk dan pesan galat Indonesia | kepatuhan | Lolos |
| S-6 | `session.activeView as AssistantView` sebelum `includes` | nit | Terima: penyempitan tipe yang langsung diperiksa |

## Spec (b17-asisten-web.md)

| # | Temuan | Triase |
| --- | --- | --- |
| P-1 | Keputusan 7: kunci berubah karena keluar/akun lain membiarkan `open = true`, jadi pengguna berikutnya di tab yang sama langsung melihat panel terbuka tanpa mengklik | **Perbaiki**: `bind()` menutup panel bila bagian `user.id` kunci berubah; ganti tampilan tetap membiarkannya terbuka (mockup). Test e2e "keluar lalu masuk lagi" lewat formulir (tanpa muat ulang); terbukti merah tanpa perbaikan |
| P-2 | `bind()` juga mengosongkan draf, tidak disebut di spek | **Perbaiki spek**: keputusan 7 diperbarui |
| P-3 | Gulir otomatis ke gelembung terakhir tidak disebut di spek (lingkup tambahan kecil) | **Perbaiki spek**: dicatat sebagai keputusan 16 (panel tinggi tetap 560px; tanpa gulir, jawaban baru tersembunyi) |
| P-4 | Test 5 (fokus kembali ke input setelah "Buka") awalnya gagal karena `/li` tanpa mock menampilkan ringkasan galat yang mengambil fokus | **Perbaiki test**: mock `GET /my/learning-plan`; perilaku halaman (ringkasan galat mengambil fokus) dibiarkan |
| P-5 | Semua butir test 1–10 ada di `e2e/asisten.spec.ts` | Lolos (15 test) |

## Pemeriksaan gaya egm-codebase-details (mandiri)

| # | Bobot | Temuan | Triase |
| --- | --- | --- | --- |
| G-1 | rendah | `e2e/ui-kit.spec.ts` token test memeriksa host `localhost:4174` secara harfiah, jadi merah saat e2e dijalankan di port lain (config sementara worktree) | **Tunda**: bukan dari diff ini; di CI port 4174 lulus |
| G-2 | rendah | Snapshot `asisten-panel-karyawan.png` hanya mode terang | **Terima**: token sama dengan komponen lain yang sudah punya snapshot gelap |

## Review independen (sesi induk, 23 Nov)

Reviewer `egm:egm-codebase-details` (C) dan `egm:egm-implementation-readiness` (R) dijalankan terpisah atas diff B17 (titik tetap 54596dd). Test merah dibuat dulu (4 merah: C-1, R-1, R-3, C-6), lalu diperbaiki.

| # | Bobot | Temuan | Triase |
| --- | --- | --- | --- |
| C-1 | sedang | Tampilan klien (`activeView`, B2) bisa ditolak server (aturan tampilan dari `req.user.role`): salam gagal diam-diam dan tiap jawaban "Tampilan ini tidak tersedia" | **Perbaiki**: salam dimuat saat tampilan aktif; 403 `VIEW_FORBIDDEN` (salam atau tanya) → `unavailable`, tombol disembunyikan; test |
| C-2 | sedang | `:key="i"` + pemangkasan 40 giliran membuat `role="log"` membacakan ulang riwayat | **Perbaiki**: `Turn.id` stabil |
| C-3 / R-6 | rendah | `loadIntro` tanpa penjaga permintaan berjalan | **Perbaiki**: promise berjalan dipakai ulang |
| C-4 / R-4 | rendah | Pengosongan saat keluar bergantung pada watcher komponen | **Perbaiki**: `$onAction` aksi `clear` sesi |
| C-5 | rendah | Tenant tidak ada di kunci | **Perbaiki**: kunci `{tenant}|{user}|{tampilan}` |
| C-6 / R-5 | rendah | FAB/panel di atas scrim dan bisa difokus saat drawer melayang | **Perbaiki**: pembungkus `v-show` + `inert` di `AppShell`; test lebar 600 |
| C-7 | nit | Tombol Tutup bisa `UiButton` | **Tolak dengan alasan**: tombol ikon bulat 40px mockup tidak ada di varian `UiButton`; dicatat di keputusan spek |
| R-1 | besar | Tanpa batas waktu: `pending` bisa menggantung selamanya | **Perbaiki**: `AbortController` 30 detik; test `page.clock` |
| R-2 | besar | Jalur tanpa test: menunggu, 503, jaringan putus, salam gagal, isian kosong | **Perbaiki**: 6 test baru. Batas 40 giliran dan buang jawaban basi tetap tanpa test e2e (web tidak punya runner unit); jalur buang basi sudah diuji lewat ganti tampilan |
| R-3 | kecil | 5xx non-JSON memakai "Terjadi kesalahan", bukan pesan cadangan | **Perbaiki**: `errorText` (pesan API hanya bila kode bukan `ERROR`); test 502 HTML |
| R-7 | nit | Alasan tombol non-`Ui*` hanya di laporan review | **Perbaiki**: dicatat di keputusan spek |
| R-8 | nit | Review spek dikerjakan mandiri | **Ditutup**: review independen ini |

G-1 (port 4174): seluruh e2e dijalankan ulang di port 4174 setelah merge; `ui-kit.spec.ts` hijau.
