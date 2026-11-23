# Code review · paritas B7 web (tinjauan temuan AI per gap)

Titik tetap `57144a8` (HEAD awal worktree) ... `HEAD` branch `paritas-b7`. Skill `mattpocock-skills:code-review` (dua sumbu: Standards = `CLAUDE.md` + `docs/designs/b0-fondasi-ui.md` + baseline smell Fowler; Spec = `paritas-mockup/b7-tinjauan-web.md`).

Catatan proses: skill meminta dua subagent paralel, dan brief meminta tambahan `egm:egm-codebase-details`. Tool Agent tidak tersedia di sesi subagent ini, jadi kedua sumbu dijalankan berurutan oleh agen yang sama, terpisah per sumbu. Review independen sudah dijalankan sesi induk; lihat bagian terakhir.

## Standards

| # | File | Temuan | Jenis | Triase |
| --- | --- | --- | --- | --- |
| S1 | `modules/tna/index.js` `GET /review` | Filter gap = perilaku baru tanpa flag baru (CLAUDE.md aturan 3) | judgement | **Tolak dengan alasan**: hanya mempersempit bacaan HR yang sudah ada; endpoint tulis dan rute web tetap di balik `tna.review_workspace`. Dicatat di spek tahap |
| S2 | API | Aturan 2 (`req.tenantId`), `requireSubmodule('tna')` (router tna), kompetensi tenant lain 404 | lulus | - |
| S3 | API | Aturan 4 `visibleEmployeeScope`: tidak dipanggil karena HR saja (sama dengan spek B7) | lulus | - |
| S4 | `TinjauanView.vue` | Duplicated Code: muat ulang temuan + solusi di `load()` dan `handoff()` | smell | **Perbaiki**: `refresh()` |
| S5 | `TinjauanView.vue` | Speculative/duplikat: `handedIds` mengulang `handedOffAt` yang sudah ada di butir temuan | smell | **Perbaiki**: dihapus |
| S6 | `index.js` `reviewForGap` | Duplicated Code ringan: hitung per status mirip `byReviewStatus` di store | smell | **Tunda**: `byReviewStatus` bekerja di baris agregat SQL, bentuk masukan berbeda |
| S7 | `UiSegmented.vue` | Kode bersama berubah (B0 §4) | aturan 7 | Dokumen B0 diperbarui; reviewer Andrian ditandai di commit |
| S8 | `AntreanView.vue` | Tanpa kelas Tailwind, token `--el-*` dan komponen `src/ui` (B0) | lulus | dijaga e2e |
| S9 | Migrasi | Tidak ada migrasi baru | - | - |

## Spec

| # | Butir spek | Temuan | Triase |
| --- | --- | --- | --- |
| P1 | Keputusan 3 "data dan counts dari temuan gap itu saja" | Temuan beku juga dikeluarkan dari `data` per gap (tidak tertulis) | **Perbaiki spek**: keputusan 12 |
| P2 | (tidak diminta) | Tombol "Tinjau" dashboard B3 diubah ke `tna-review` | **Terima**, dicatat keputusan 11 dan spek B3; tanpa ini dashboard membuka layar tanpa gap |
| P3 | Keputusan 5 "galat API ... pilihan kembali ke nilai server" | Terpenuhi karena `model-value` diikat ke data server | - |
| P4 | Keputusan 8 "Galat per temuan dikumpulkan" | Terpenuhi (`failed[]`); belum ada e2e jalur galat | **Tunda**: jalur galat diuji API (409/502); e2e galat ditambah bila review independen memintanya |
| P5 | Test "snapshot visual 1440" | Ada, gambar dibandingkan manual dengan `hr--review.png`: struktur, urutan, copy sama; beda yang disengaja: saran AI, nama karyawan, tautan antrean | - |
| P6 | RV-3/TD-6 | Tidak dibangun (perlu keputusan), test atasan memantul | sesuai spek |

Ringkasan: Standards 9 butir (2 diperbaiki, 1 ditunda, 1 ditolak beralasan), terberat S1 (judgement). Spec 6 butir (1 perbaikan spek, 1 ditunda), terberat P4 (cakupan test galat).

## Review independen (sesi induk, 23 Nov)

Reviewer independen (subagent baru) atas integrasi `477844e`. Diperbaiki test-first di branch `paritas-b7-triase`.

| # | Bobot | Temuan | Triase |
| --- | --- | --- | --- |
| A1 | sedang | `GET /tna/review` per gap masih mengirim `detail`, `originalDetail`, `summaryNote` (melanggar PO-6 A / keputusan 6) | **Perbaiki**: dibuang di `reviewForGap` (`withoutDetail`); test memastikan JSON tanpa `RINCIAN-RAHASIA`. Antrean lama dan respons `classify` tetap memuat rincian (fitur ubah teks) |
| A2 | rendah | `projectId` bukan UUID di `/review` menjadi galat cast 500 | **Perbaiki**: `projectIdOf` dipakai bersama → 400 |
| A3 | rendah | Nama gap OKR dari query tanpa batas panjang dan tanpa perapian spasi (beda dengan `parseGap`) | **Perbaiki**: maksimal 255, spasi dirapikan |
| A4 | rendah | Join `lna_competencies` / `lna_performance_records` tanpa predikat tenant (FK tidak mencegah rujukan silang) | **Perbaiki**: `AND c.tenant_id = f.tenant_id`, `AND pr.tenant_id = f.tenant_id` di `REVIEW_FROM` dan `listReviewedForSolutions`; test rujukan silang |
| A5 | rendah | Cakupan test: persetujuan ditarik per gap, solusi kompetensi tenant lain, atasan di solusi | **Perbaiki**: tiga kasus ditambah (perilaku sudah benar, kini dijaga test) |
| W1 | sedang | `savingId` tunggal: klasifikasi kedua menimpa status simpan pertama; `disabled` membuang fokus dari tombol yang diklik; chip tetap aktif saat solusi dijalankan | **Perbaiki**: `pendingIds` (Set), opsi `pending` di `UiSegmented` (`aria-disabled` + penjaga klik), chip terkunci saat `busy` |
| W2 | rendah | `409` saat klasifikasi tidak memuat ulang, nilai server tidak tampil | **Perbaiki**: `refresh()` pada 409 |
| W3 | rendah | Tulis berhasil tetapi muat ulang gagal dilaporkan sebagai gagal menyimpan | **Perbaiki**: "… tersimpan, tetapi data tidak bisa dimuat ulang." (klasifikasi, rencana/penugasan, serah) |
| W4 | rendah | Tanpa status memuat (layar kosong sampai data datang) | **Perbaiki**: muted "Memuat…" + `aria-busy` |
| W5 | rendah | E2E tanpa jalur galat (menutup P4) | **Perbaiki**: opsi `galat`/`tundaSolusiMs` di `support/tinjauan.ts`; test alamat gap salah, 409 penugasan, 409 klasifikasi, memuat, simpan-tanpa-muat-ulang |
| D1 | rendah | `gaps-lna.md` RV-1/RV-2 dan `gaps-shell.md` S5 belum ditandai ditutup; penunjuk file RV-3/TD-6 basi | **Perbaiki**: tanda **Ditutup**, penunjuk ke `b7-tinjauan/routes.ts` |
| D2 | rendah | Spek menyebut `b7-tinjauan/api.ts` yang tidak ada; CSV tenant-wide tidak dicatat; baris "review independen belum terverifikasi" basi | **Perbaiki**: checklist dibetulkan, CSV `[⏳ DITERIMA]` dengan catatan, penunjuk ke bagian ini |
