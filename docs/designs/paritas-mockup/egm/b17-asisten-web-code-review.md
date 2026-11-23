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
