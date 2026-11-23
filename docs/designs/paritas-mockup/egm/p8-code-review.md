# P8 · Code review (dua sumbu, mandiri)

Titik tetap: `3cf564f` (awal worktree). Commit: `2265284` spek, `e434df2` test merah, `c790efd` implementasi, `b5364e4` test merah review, `ee5a550` perbaikan review. Skill: `mattpocock-skills:code-review` (dua sumbu dikerjakan sendiri karena sesi tanpa tool Agent).

## Standards (CLAUDE.md + B0)

- Bahasa dan nama produk: teks UI dan komentar baru berbahasa Indonesia; "ELGOS", "templat ELGOS", "ELGOS-AI (POC)". Tidak ada ID model di kode atau komentar; ID penyedia hanya dibaca dari `display.aiModel` di Konfigurasi platform (Super Admin). OK.
- Arsitektur 1–7: tidak ada perubahan API, migrasi, auth, flag, atau query. Penugasan tetap mengirim body yang sama (tenggat wajib, WIB). OK.
- Aturan 7 (reviewer Andrian untuk kode bersama): `src/ui/UiDialog.vue` dan `src/ui/format.ts` baru, `ui/index.ts` berubah. PR wajib direview Andrian. `[⏳ DITERIMA]` (dicatat untuk PR)
- B0 token: hanya `--el-*`, kecuali latar `::backdrop` `rgb(0 0 0 / 0.4)`. Nilai ini sama dengan scrim laci di `AppShell.vue` (belum ada token scrim). `[⏳ DITERIMA]` Kandidat token `--el-scrim` di luar lingkup P8.
- B0 aksesibilitas: `<dialog>` modal bawaan (`showModal`) memberi perangkap fokus, latar inert, Esc, dan fokus kembali ke tombol pembuka; judul tertaut `aria-labelledby`; tombol tutup bernama "Tutup". Titik status Hasil saya disertai teks; petunjuk vendor LI tertaut `aria-describedby`; pilihan jawaban di grup `role="group"` berlabel. OK.
- B0 kontrak komponen: `UiDialog` belum tampil di halaman `/ui-kit` (triase T4; menambahkannya mengubah snapshot ui-kit). `[⏳ DITERIMA]`
- Temuan diperbaiki: di dialog penugasan TNA, galat umum ("Penugasan gagal" bila jaringan putus) tampil di ringkasan galat halaman yang tertutup latar modal. Kini galat umum tampil di dialog selama dialog terbuka (`dialogErrors`), dan di halaman saat dialog tertutup. `[✅ DIPERBAIKI]`
- Judgement call: dialog tenggat B10 (`AssignDueDialog`) menutup saat "Tugaskan" ditekan, sebelum permintaan selesai; galat tampil di ringkasan galat halaman yang sudah terlihat lagi. Perilaku galat sama dengan sebelum P8. `[⏳ DITERIMA]`
- Judgement call: formatter angka sebelumnya terduplikasi di `api/cca.ts`, `b5-tna/labels.ts`, `b8-karyawan/view.ts`; kini satu `formatNumber` di `ui/format.ts`. Dashboard tetap memakai formatnya sendiri (snapshot). OK.

## Spec (p8-keputusan-r1-r22.md)

- R2: CTA satu baris dan formulir di dialog (TD-5); "Tugaskan semua" di kepala kartu, tenggat di dialog, tenggat sebagai teks kecil di sel Status (AH-2, AH-3, AA-4). Sesuai.
- R2 penyimpangan sadar: atasan tetap punya "Tugaskan semua" di Wawancara AI (mockup tidak), agar fitur B10 tidak hilang. Tercatat di spek. `[⏳ DITERIMA]`
- R4: skor tanpa "%", desimal koma, selisih OKR merah. Sesuai.
- R8/R20: "templat ELGOS" di Draf dan intro Permintaan; petunjuk vendor kecil di bawah tombol "Minta ke". Intro Permintaan tidak ada di draf pertama spek; ditambahkan ke spek (lihat drift). `[✅ DIPERBAIKI]`
- R15: breadcrumb "Training Needs ›" bertaut hanya bila menu Training Needs tampil (`ivCrumbs`, berbasis `isVisible` menu). Spek menyebut "tanpa tautan untuk karyawan"; implementasi memakai aturan menu agar atasan/HR tetap bertaut. Sesuai maksud. Tercatat di drift.
- R17: undangan menyebut "ada 1 wawancara singkat …" per undangan (satu kalimat per sesi). Durasi tidak ditampilkan karena tidak ada di data undangan. `[⏳ DITERIMA]`
- R18: label tenant "ELGOS-AI (POC)" (konstanta `api/ai.ts`), ID penyedia di baris mono "hanya Super Admin". Sesuai.
- Checklist file: `AssignDueDialog.vue` dan `b6-iv/crumbs.ts` belum tercantum. Checklist diperbarui. `[✅ DIPERBAIKI]`
- Lingkup: layar LIM tidak tersentuh; tidak ada perilaku di luar spek.

Ringkasan: Standards 1 diperbaiki + 4 diterima; Spec 2 diperbaiki + 2 diterima. Terburuk per sumbu: Standards = galat umum tertutup modal (sudah diperbaiki); Spec = checklist file tidak lengkap (sudah diperbaiki).

## Review independen (sesi induk, 23 Nov)

Dua reviewer independen atas P8 dari sesi induk. Triase test-first di `paritas-p8`: merah `788a318`, hijau `32565ff`.

| # | Bobot | Temuan | Triase |
| --- | --- | --- | --- |
| 1 | sedang | `ivCrumbs` hanya memeriksa butir `tna` hr/atasan; butir peralihan karyawan/admin/super terabaikan, karyawan kehilangan tautan | `[✅ DIPERBAIKI]` `menuContext(session)` dan `menuShows(key, ctx)` di `shell/menu.ts` (semua entri MENU berkunci sama); dipakai `AppDrawer.vue` dan `crumbs.ts`. e2e: karyawan dengan menu peralihan dan HR bertaut; karyawan dengan Hasil saya tidak |
| 2 | sedang | Dialog B10 tertutup sebelum permintaan selesai: `busy` tidak berlaku, galat API di balik dialog | `[✅ DIPERBAIKI]` Pola TnaGapView: dialog tetap terbuka sampai berhasil, galat API di `UiErrorSummary` dalam dialog (`errors` prop `AssignDueDialog`), tutup hanya saat berhasil. e2e HR dan atasan |
| 3 | sedang | `novalidate` meloloskan tanggal lewat; tenggat tidak di-reset saat dibuka ulang | `[✅ DIPERBAIKI]` Validasi `due < todayIso()` ("Batas waktu paling cepat hari ini"), reset ke +14 hari dan hapus galat tiap dibuka, galat field hilang saat input berubah. e2e: kosong dan lewat tanpa POST, bawaan +14 hari, buka ulang kembali ke bawaan |
| 4 | sedang | Fokus setelah tutup hilang bila tombol pembuka dihapus `v-if` setelah `load()` | `[✅ DIPERBAIKI]` `focusIfLost` (`b10/focus.ts`): bila fokus jatuh ke `<body>`, pindah ke pemberitahuan `role=status` (`tabindex=-1`). e2e: fokus kembali ke CTA TNA setelah Tutup/Esc, Tab tetap di dialog, fokus ke pemberitahuan saat baris hilang |
| 5 | rendah | `format.ts` tanpa penjaga NaN/Infinity, `-0`, tanda minus campur; `−${formatScore(gap)}` memberi "−-5"/"−0" | `[✅ DIPERBAIKI]` `Number.isFinite` → "–", `-0` → "0", minus selalu U+2212; `gapScore` di `b5-tna/labels.ts` memberi tanda dari nilai (TnaGapView, TnaScreen). e2e nilai 1.250 dan gap 0/−5. Spek R4 mencatat pemisah ribuan dan pembulatan 2 desimal |
| 6 | rendah | `openAssign` menghapus galat muat di ref `error` yang sama | `[✅ DIPERBAIKI]` `loadError` terpisah (detail, data penugasan), selalu di halaman. e2e |
| 7 | rendah | `UiDialog` fokus awal di "Tutup"; latar `rgb` keras | `[✅ DIPERBAIKI]` Fokus awal di field pertama; Tab berputar di dalam dialog (Tab dari elemen terakhir sebelumnya keluar ke UI peramban); token baru `--el-scrim` di `style.css`, dipakai `UiDialog` dan scrim `AppShell` |
| 8 | rendah | B0 §4 masih "dialog belum disediakan" | `[✅ DIPERBAIKI]` Baris `UiDialog` (props, a11y), catatan format angka, token `--el-scrim` di tabel token |
| 9 | rendah | `aiLabel` dari API mati di klien | `[✅ DIPERBAIKI]` Dihapus dari tipe `b6-iv/api.ts`; spek B6 mencatat label ditetapkan di klien. Mock e2e `aiLabel` berisi ID penyedia; e2e memastikan tidak tampil |
| 10 | rendah | "Batas {tanggal}" tampil juga untuk selesai/batal | `[✅ DIPERBAIKI]` Hanya `assigned`/`in_progress`. e2e empat status |
| 11 | rendah | Belum ada e2e atasan "Tugaskan semua"; uji R16 tidak memastikan kartu `my-plan` tampil | `[✅ DIPERBAIKI]` e2e atasan "Tugaskan semua" (dua anggota belum ditugaskan); R16 memastikan kartu kosong tampil lebih dulu. Petunjuk ProgramForm (opsional) tidak ditambah |
| 12 | rendah | Kata spek R11; perubahan di luar lingkup tidak tercatat | `[✅ DIPERBAIKI]` R11 "UI hanya Advanced; impor menormalkan alias Advance" (`imports/kinds/common.js`); checklist mencatat `expect.poll` dan warna `.tna-cta`, plus berkas triase |

Keputusan user 23 Nov (kartu keputusan): "Wawancara untuk Anda" kembali di `/tna` untuk atasan saat papan menyala, di bawah papan (`TnaMySessions.vue`; K-P5-4 dicabut, spek B5 diperbarui); Asisten ELGOS tidak tampil di tampilan `super` (spek B17 web diperbarui). Keduanya dengan e2e.

Audit PR 39 (thread lain): 39-2 filter gap `GET /tna/review` di balik `tna.review_workspace` (403 `FEATURE_DISABLED`, pola `requireFlag`), 39-3 predikat gap di `stores.tna.reviewQueue` (merah `35fff62`, hijau `f27eff5`), 39-5 salinan mockup dihapus dari tree, 39-1 artefak e2e CI saat gagal + pelacak TL-1 (`7295d3c`).
