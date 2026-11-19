# Goldfish Review Report

**Target:** `/home/user/EWI/docs/designs/b8-karyawan.md` (baris 1–225, seluruh file)
**Tahap:** 5, Initial Zoom Out Review (preset uninterrupted)
**Tanggal:** 19 Nov 2026

## Status reviewer

| Reviewer | Status |
| --- | --- |
| `egm-zoom-out` | not run (sebagai subagent terpisah) |
| `egm-inventive-catalyst` | not run (sebagai subagent terpisah) |

**Catatan penting tentang status.** Synthesizer tidak punya tool untuk membuat subagent di sesi ini (tool Agent tidak tersedia), jadi kedua reviewer tidak bisa dijalankan sebagai goldfish yang terpisah, dan percobaan ulang pun tidak mungkin. Karena itu, statusnya dicatat `not run` sesuai protokol. Supaya tahap ini tetap menghasilkan sesuatu, synthesizer membaca sendiri persona kedua lensa (`agents/zoom_out.md`, `agents/inventive_catalyst.md`), standar `resources/document_standards/zoom-out-standard.md`, semua file GoldfishContext, dan kode yang dirujuk, lalu menjalankan kedua lensa itu sendiri. Synthesizer tidak membawa riwayat percakapan, tetapi kedua lensa dikerjakan dalam satu konteks yang sama. Artinya, jaminan "dua pembaca independen" tidak terpenuhi. Temuan di bawah sebaiknya dianggap masukan awal, dan tahap ini layak diulang dengan subagent sungguhan bila harness mengizinkan.

Konteks yang tidak bisa dibaca: `/home/user/EWI/docs/designs/b0-fondasi-ui.md` tidak ada di repo. Spek B8 hanya menyebut B0 sebagai tempat layar web (baris 9), jadi ketiadaan file ini tidak memengaruhi temuan backend.

Ringkasan: 🔴 1 · 🟡 4 · 🟢 7

---

## 🔴 Blocker

### 1. Hapus manual oleh HR (`erase: true`) tidak menghapus ringkasan temuan B6 milik karyawan
* **Lensa:** `egm-zoom-out` (fokus pada akar masalah, konteks yang cukup)
* **Cakupan:** baris 9, 115, 121, 127–134. Kode: `apps/api/src/db/lna-stores.js` baris 1250–1273 (`resolveWithdrawal`), 354–394 (kolom ringkasan di `lna_interview_sessions`)
* **Masalah:** Spek disusun di atas PR #11–#16 dan sama sekali tidak menyebut langkah ringkasan temuan B6. Padahal langkah itu sudah ada di kode (`/sessions/:id/summary`, flag `tna.interview_summary`). Ringkasan menyimpan tiga hal di baris sesi itu sendiri: `summary_findings` (temuan AI dari transkrip, terenkripsi), `summary_note` (catatan karyawan untuk HR bila ringkasan tidak sesuai), dan `summary_disputed`. Butir 6 (baris 121) menyatakan bahwa "baris sesi tetap ada (status, tanggal, tanda penarikan)". Tetapi `resolveWithdrawal` hanya menghapus giliran percakapan, temuan, dan `result` job. Kolom ringkasan tetap tersimpan. Akibatnya, setelah HR "menghapus data wawancara", isi wawancara masih tersimpan dalam bentuk ringkasan dan catatan karyawan. Hal yang sama terjadi pada sesi `in_progress` yang ringkasannya belum dikonfirmasi lalu dihentikan oleh penarikan (baris 115 butir b).
* **Rekomendasi:** Tambahkan satu paragraf tentang interaksi dengan B6 di "Aturan baca untuk persetujuan yang ditarik". Masukkan `summary_findings`, `summary_note`, dan `summary_disputed` (dan `summary_at`/`summary_confirmed_at` bila dianggap metadata isi) ke daftar yang dikosongkan oleh `erase: true`. Sebutkan juga bahwa `summary/confirm` dan `restart` pada sesi yang ditarik sudah tertolak karena status `abandoned`. Tambahkan kasus ini ke test integrasi butir 6 (baris 165).

---

## 🟡 Major

### 2. `summary.gaps` memberi arti kedua untuk "gap", bertentangan dengan glosarium
* **Lensa:** `egm-zoom-out` (keselarasan dengan proyek)
* **Cakupan:** baris 76, 83. Kode: `apps/api/src/modules/my/view.js` baris 17–23
* **Masalah:** `CONTEXT.md` mendefinisikan **Gap kompetensi** sebagai skor asesmen di bawah target. Spek sengaja membuat `summary.gaps` hanya menghitung status `gap` (rasio < 0,75), sehingga "angkanya lebih kecil daripada angka HR". Akibatnya, kata "gap" punya dua arti dalam satu produk, padahal `docs/agents/domain.md` meminta istilah glosarium dipakai apa adanya. Karyawan dan HR bisa melihat jumlah gap yang berbeda untuk orang yang sama.
* **Rekomendasi:** Ganti nama field menurut label mockup, misalnya `met` / `partial` / `notMet` (Menguasai / Sebagian / Belum), dan jangan memakai kata `gaps`. Bila angka gap tetap perlu ada, isi dengan `partial + notMet` supaya sama dengan definisi glosarium dan angka HR.

### 3. Permintaan tarik persetujuan tidak terhubung ke sesi yang dihentikannya
* **Lensa:** `egm-inventive-catalyst` (sambungan yang terlalu ketat), `egm-zoom-out` (jalan buntu arsitektur)
* **Cakupan:** baris 42–57 (skema), 115, 121, 134, 224
* **Kompromi semu:** Spek menerima bahwa `erase: true` mengenai *semua* sesi TNA yang pernah ditarik karyawan itu, termasuk sesi dari permintaan lama yang sudah ditutup (catatan baris 224). Penyebabnya, `data_subject_requests` tidak menyimpan sesi mana yang dihentikan oleh permintaan tersebut. Satu-satunya penanda adalah timestamp `consent_withdrawn_at` di sesi. Karena butir 3 idempoten dan sesi baru bisa diundang ulang (baris 134), satu permintaan bisa menumpuk dampak dari beberapa penarikan, dan HR tidak bisa memilih cakupannya.
* **Usulan:** Pola *Segmentation*. Simpan hubungan permintaan dengan sesi, misalnya kolom `withdraw_request_id uuid REFERENCES data_subject_requests(id)` di `lna_interview_sessions` sebagai pengganti atau pendamping `consent_withdrawn_at`, atau kolom `session_ids uuid[]` di permintaan. `erase` lalu hanya mengenai sesi milik permintaan yang sedang dipenuhi, dan audit (`sessionIds`) otomatis cocok.
* **Biaya sampingan:** Migrasi berubah. Migrasinya masih di branch yang sama, jadi sekarang paling murah. Panggilan ulang yang idempoten (respons `200`) harus menambahkan sesi baru ke permintaan lama. Bila keputusan produk memang "hapus semua yang pernah ditarik", tulis itu sebagai keputusan eksplisit, bukan sebagai efek samping.

### 4. Hapus data wawancara selalu ikut menghapus rencana belajar yang sudah berjalan
* **Lensa:** `egm-inventive-catalyst` (kompromi yang belum diuji)
* **Cakupan:** baris 121, 131, 224
* **Kompromi semu:** Spek menganggap pilihan HR hanya dua: hapus data wawancara *dan* hilangkan rencana belajar beserta tugas EliteMentor-nya (cascade FK, tanpa pembatalan di EliteMentor), atau simpan semuanya. Padahal rencana belajar adalah hasil yang sudah disetujui HR (PM-5 A) dan sedang dipakai karyawan. Penghapusannya meninggalkan tugas yatim di EliteMentor (baris 224).
* **Usulan:** Pola *Extraction*. Pisahkan rencana dari temuan sumbernya saat penghapusan: simpan salinan judul atau alasan di butir rencana dan ubah FK menjadi `ON DELETE SET NULL`. Alternatifnya, berikan pilihan eksplisit di `fulfill` (`keepPlan`). Pilihan lain yang lebih kecil: catat butir rencana yang terhapus dan sumber katalognya di respons atau audit, supaya HR bisa membatalkannya di EliteMentor.
* **Biaya sampingan:** Salinan alasan masih berupa data turunan wawancara, jadi perlu keputusan produk bahwa salinan itu boleh tersisa. Ada kolom baru di tabel rencana, padahal spek baris 60 menjanjikan "tidak ada kolom baru". Asal-usul rencana di laporan HR juga hilang.

### 5. Skor per kompetensi dibangun di atas keputusan yang belum dikonfirmasi (Q45)
* **Lensa:** `egm-zoom-out` (fokus pada akar masalah, keselarasan dengan proyek)
* **Cakupan:** baris 29, 146, 201
* **Masalah:** Q45 yang berlaku memilih "Ringkasan + rekomendasi". Spek tetap mengirim `score` dan `required` per kompetensi karena mengikuti mockup, dengan tanda `[⚠️ BELUM TERVERIFIKASI]`. Ini keputusan produk tentang data apa yang boleh dilihat karyawan, dan kodenya sudah ditulis. Bila user ternyata mempertahankan Q45, kontrak `GET /api/my/results` berubah setelah web dibangun di atasnya.
* **Rekomendasi:** Tulis di spek rencana kembali yang murah. Semua bentuk data karyawan sudah lewat satu fungsi murni (`competencyView`), jadi cukup sebutkan bahwa membuang `score`/`required` hanya mengubah fungsi itu, dan bahwa web wajib tahan terhadap field yang `null`. Jadikan konfirmasi Q45 syarat sebelum flag `learner.home` dinyalakan di tenant mana pun, bukan hanya catatan di PR.

---

## 🟢 Nit

### 6. Alasan tidak menyusun beranda dari endpoint yang sudah ada belum ditulis
* **Lensa:** `egm-zoom-out` (memakai yang sudah ada)
* **Cakupan:** baris 33–35, 64–69, 206
* **Masalah:** Data yang dipakai beranda sudah tersedia lewat endpoint yang terbatas pada data milik karyawan dan sudah lewat `requireSubmodule`/`visibleEmployeeScope`: `GET /api/dna/employees/:userId` (gap), `GET /api/tna/plan-items`, dan `GET /api/tna/sessions`. Router `/api/my` baru menimbulkan dua penyimpangan dari aturan wajib (aturan 3 dan 4) dan menggandakan filter rencana. Temuan ini sudah ditolak di triase spek #15, dan synthesizer tidak memintanya dibuka ulang.
* **Rekomendasi:** Tambahkan satu kalimat alasan, misalnya beranda butuh satu panggilan, bentuk data mengikuti mockup, dan pembatasan per bagian. Dengan begitu, persetujuan Andrian berdiri di atas alasan tertulis. Pertahankan `/my` sebagai lapisan tipis yang memanggil store yang sama, seperti yang sudah dilakukan kodenya.

### 7. `submoduleActive` menyalin logika `requireSubmodule`, bukan dipakai bersama
* **Lensa:** `egm-zoom-out` (memakai ulang kode yang ada)
* **Cakupan:** baris 34, 68. Kode: `apps/api/src/core/entitlement/guard.js` baris 5–22
* **Masalah:** Spek menyebut "logika yang sama dengan `requireSubmodule`", tetapi di kode logikanya ditulis dua kali. Bila nanti ada syarat baru (misalnya kill switch terpisah), keduanya bisa berbeda tanpa ketahuan. Ini kode bersama (aturan 7).
* **Rekomendasi:** `requireSubmodule` memanggil `submoduleActive` untuk pemeriksaannya dan hanya memilih kode error (`NOT_ENTITLED`/`FEATURE_DISABLED`). Bisa juga cukup dicatat di spek sebagai pekerjaan rapi-rapi.

### 8. Tarik persetujuan tanpa tenggat dan tanpa pengingat bagi HR
* **Lensa:** `egm-inventive-catalyst` (kegagalan yang belum ditangani)
* **Cakupan:** baris 30–31, 118
* **Kompromi:** Keputusan user (tanpa tenggat, tanpa hapus otomatis) dihormati. Tetapi satu-satunya sinyal untuk HR adalah daftar pasif, sehingga permintaan bisa terbuka selamanya dan data dari persetujuan yang ditarik tersimpan tanpa batas tanpa ada yang menyadarinya.
* **Usulan:** Pola *Beforehand Cushioning*. Tampilkan umur permintaan (`ageDays`) atau hitungan "terbuka > N hari" di `openCounts` (B17), tanpa menjadikannya `overdue`. **Biaya sampingan:** ada satu ambang lagi yang perlu diputuskan, dan risiko notifikasi yang mengganggu. Cek juga apakah ini sesuai dengan kebijakan retensi data tenant.

### 9. Spek turun ke detail SQL dan bercampur dengan catatan implementasi
* **Lensa:** `egm-zoom-out` (menjaga ketinggian bahasan)
* **Cakupan:** baris 115, 129, 138–142, 169–184, 186–224
* **Masalah:** Bagian desain memuat detail tingkat kode (`INSERT ... SELECT ... WHERE EXISTS`, `lockOwned`, `FOR UPDATE`, klausa `WHERE`), daftar file yang sudah dicentang semua, dan dua tabel triase. Status di baris 3 masih "spek", padahal isinya sudah menjadi catatan apa yang terbangun. Pembaca baru sulit memisahkan kontrak yang mengikat dari jejak proses.
* **Rekomendasi:** Pertahankan kontrak (endpoint, aturan, transisi status, invarian balapan dalam bahasa perilaku). Pindahkan tabel triase dan daftar centang ke deskripsi PR atau lampiran `docs/designs/egm/b8/`. Perbarui baris status.

### 10. Istilah "undangan" / `invitations` tidak memakai istilah glosarium "Penugasan wawancara"
* **Lensa:** `egm-zoom-out` (keselarasan dengan proyek)
* **Cakupan:** baris 7, 15, 77, 84
* **Masalah:** `CONTEXT.md` menandai "undangan" sebagai istilah yang dihindari dan memakai **Penugasan wawancara**. Mockup sendiri menulis "Undangan wawancara" (Main.dc.html baris 284), dan kode lama memakai `invite_expires_at`. Jadi ada konflik antara mockup dan glosarium yang belum dicatat.
* **Rekomendasi:** Catat konflik ini untuk `/domain-modeling`: putuskan apakah teks UI boleh "undangan" sementara istilah domain tetap "penugasan", atau sebaliknya. Spek cukup menyebut putusannya. Nama field API tidak harus diganti.

### 11. Data `invitations` kurang untuk kalimat undangan di mockup
* **Lensa:** `egm-zoom-out` (konteks yang cukup)
* **Cakupan:** baris 15, 77, 84. Mockup baris 284
* **Masalah:** Mockup menampilkan "wawancara singkat (±10 menit) tentang kompetensi dengan gap terbesar". `stores.interviews.list` sudah mengembalikan `durationMinutes` dan `focusLabel`, tetapi `invitations` tidak meneruskannya. Akibatnya, web harus memanggil endpoint lain atau menulis teks statis.
* **Rekomendasi:** Tambahkan `durationMinutes` dan `focusLabel` ke setiap undangan. Biayanya kecil dan datanya sudah dimuat.

### 12. Beranda tidak menunjukkan sesi yang menunggu konfirmasi ringkasan (B6)
* **Lensa:** `egm-zoom-out` (konteks yang cukup, terkait temuan 1)
* **Cakupan:** baris 77, 84
* **Masalah:** Sesi `in_progress` yang ringkasannya sudah dibuat tidak bisa lagi menerima jawaban (`SUMMARY_PENDING`). Namun `canContinue` tetap `true` tanpa keterangan bahwa langkah berikutnya adalah memeriksa ringkasan, bukan melanjutkan percakapan.
* **Rekomendasi:** Tambahkan `summaryPending: boolean` (dari `summaryAt` tanpa `summaryConfirmedAt`) ke setiap undangan, atau tulis di spek bahwa web membaca `GET /sessions/:id` sebelum mengarahkan karyawan.

---

## Status per reviewer

### `egm-zoom-out`: not run (lensa dijalankan inline oleh synthesizer)
Diterapkan terhadap Zoom-Out Standard bagian 0–4. Konteksnya cukup: tujuan dan batas cakupan jelas (baris 5–18). Pencarian kode dilakukan untuk setiap helper baru. `submoduleActive` menggandakan `requireSubmodule` (temuan 7). Endpoint karyawan yang sudah ada tercatat di temuan 6. Tidak ada optimasi prematur. Temuan dari lensa ini: 1, 2, 3 (bersama), 5, 6, 7, 9, 10, 11, 12.

### `egm-inventive-catalyst`: not run (lensa dijalankan inline oleh synthesizer)
Pemeriksaan keberadaan kontradiksi: ada tiga kompromi semu yang nyata, jadi keluarannya bukan "No false compromise detected". Temuan dari lensa ini: 3 (Segmentation), 4 (Extraction), 8 (Beforehand Cushioning). Masing-masing disertai biaya sampingannya. Sesuai persona, tingkat keparahan dari lensa ini hanya Major atau Nit.
