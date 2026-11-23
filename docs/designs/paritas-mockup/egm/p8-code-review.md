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
