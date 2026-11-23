# P4 · Review diff (mattpocock-skills:code-review)

Titik tetap: `57144a8` (HEAD awal worktree, "Paritas P2: triase review"). Commit: 207958f (spek), 5a2e758 (test merah), 0224c43 (kode, hijau), lalu commit triase.

Kode auth: **reviewer wajib Andrian** (CLAUDE.md aturan 7).

Catatan proses: skill meminta dua sub-agent paralel (Standards, Spec) dan brief meminta subagent `egm:egm-codebase-details`. Tool Agent tidak tersedia di sesi subagent ini, jadi ketiga lensa dijalankan berurutan oleh agen yang sama dengan konteks terpisah per bagian. `[⚠️ BELUM TERVERIFIKASI]` oleh reviewer independen.

## Standards (CLAUDE.md, spek B0)

| # | Temuan | Jenis | Triase |
| --- | --- | --- | --- |
| S-1 | B0 aturan 5: layar baru hanya `Ui*` dan token `--el-*`. `EmailLinkView` lama memakai `slate-*`, `bg-white`, `blue-700` | pelanggaran kontrak (sebelum diff) | **Ditutup** oleh diff; test memastikan tidak ada kelas `slate`/`bg-white`/`blue-700` di `/masuk` |
| S-2 | `LoginLayout` mendefinisikan `.lg-h1`/`.lg-sub`/`.lg-row` lewat `:slotted`, view bergantung pada nama kelas milik layout (kopling implisit) | penilaian | **Tolak dengan alasan**: dua pemakai, gaya judul/sub harus identik di semua langkah; satu tempat lebih baik daripada duplikasi di dua view. Komentar di layout menjelaskan |
| S-3 | Duplicated Code: `<UiErrorSummary>` muncul di dua cabang `LoginView` | penilaian | **Tolak**: tiap langkah punya galatnya sendiri dan fokus ringkasan harus di dalam langkah yang tampil |
| S-4 | Fokus hilang setelah "Kembali" (tombol yang ditekan dilepas dari DOM) | aksesibilitas (B0 bagian aksesibilitas) | **Perbaiki**: fokus ke kolom email; test `toBeFocused` |
| S-5 | `:slotted(.lg-h1:focus) { outline: none }` | penilaian | **Diterima**: h1 hanya menerima fokus terprogram (`tabindex=-1`), bukan kontrol interaktif; pola sama dengan judul langkah lain |
| S-6 | Aturan 3 (fitur baru di balik flag) | cek | Tidak berlaku: paritas tampilan layar yang sudah ada, tanpa endpoint atau perilaku auth baru |
| S-7 | Bahasa dan nama produk | cek | Lulus: semua teks baru bahasa Indonesia, "ELGOS" |

## Spec (p4-login.md)

| # | Temuan | Triase |
| --- | --- | --- |
| P-1 | L1–L7 semua ada di kode dan diuji (`e2e/login.spec.ts`, 7 test P4) | - |
| P-2 | Spek "Fokus pindah ke h1 langkah baru" diuji; "Kembali" tidak menyebut fokus | **Perbaiki**: spek ditambah (keputusan + test) |
| P-3 | "Kirim ulang" saat sudah di langkah 2 tidak memindahkan fokus lagi (hanya catatan status diperbarui) | Sesuai maksud; pembaca layar mendapat `role=status` |
| P-4 | Lingkup tambahan | Tidak ada: API, sesi, token, `e2e/support/sesi.ts` tidak berubah |

## Goldfish (lensa egm-codebase-details)

| # | Bobot | Temuan | Triase |
| --- | --- | --- | --- |
| G-1 | sedang | Test `ui-kit` "token … font Roboto" gagal di config port sementara (4179) karena memeriksa URL `http://localhost:4174` secara harfiah | **Bukan regresi**: artefak config port sementara (brief: port override). Semua URL yang dilaporkan adalah aset aplikasi sendiri di `localhost:4179`, bukan pihak ketiga. Tidak diubah (di luar lingkup) |
| G-2 | ringan | `api` lama di `sendLink` mengosongkan `linkNotice` dulu, sehingga `role=status` dilepas lalu dipasang lagi saat kirim ulang | Diterima: memicu pengumuman ulang pembaca layar, yang diinginkan |
| G-3 | ringan | Tidak ada snapshot visual login | Tunda: test token CSS (L3–L6) dan tata letak (L7) cukup; foto manual dibandingkan dengan `login--cred`/`login--otp` mockup |
| G-4 | ringan | Mode gelap: panel kiri memakai `--el-primary`/`--el-on-primary` seperti sebelumnya | Tidak berubah dari B1 |

Ringkasan: Standards 7 butir (terberat S-4 aksesibilitas fokus, diperbaiki), Spec 4 (terberat P-2, spek diperbarui), goldfish 4 (G-1 bukan regresi).
