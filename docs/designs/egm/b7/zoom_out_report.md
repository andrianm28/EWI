# Laporan Goldfish Review: Zoom Out awal (Tahap 5)

**Target:** `/home/user/EWI/docs/designs/b7-tinjauan-hr.md` (baris 1–221, seluruh file)
**Preset:** uninterrupted · **Standar:** `resources/document_standards/zoom-out-standard.md`

## Status reviewer

| Reviewer | Status |
| --- | --- |
| `egm-zoom-out` | not run |
| `egm-inventive-catalyst` | not run |

**Penting, baca dulu:** sesi synthesizer ini tidak punya tool Agent, jadi kedua reviewer Goldfish tidak bisa dijalankan sebagai subagent terpisah. Mencoba ulang tidak mungkin karena tool-nya memang tidak ada. Sesuai protokol, keduanya berstatus `not run` dan **tidak** dihitung sebagai reviewer dengan nol temuan.

Supaya tahap ini tetap menghasilkan sesuatu yang bisa dipakai, synthesizer sendiri membaca spek dan konteks Goldfish dengan memakai persona dan standar kedua lensa: `agents/zoom_out.md` dengan `zoom-out-standard.md`, dan `agents/inventive_catalyst.md`. Synthesizer juga tidak membawa riwayat percakapan, tetapi **ini bukan review Goldfish yang independen**: tidak ada pasangan A/B dan semua temuan berasal dari satu pembaca. Kolom "Lensa" menunjukkan sudut pandang yang dipakai, bukan reviewer yang benar-benar dijalankan. Bila Tahap 5 butuh review independen, jalankan ulang dari sesi yang punya tool Agent.

Catatan konteks: `/home/user/EWI/docs/designs/b0-fondasi-ui.md` tidak ada di repo, jadi tidak ikut dibaca.

Ringkasan: 🔴 0 · 🟡 8 · 🟢 7

---

## 🟡 Major

### M1. API tidak bisa melayani layar tinjauan per gap seperti di mockup
* **Lensa:** zoom-out
* **Cakupan:** baris 13–17, 57–58, 68, 83
* **Masalah:** Di mockup, layar "Tinjauan temuan AI" dibuka untuk **satu gap** (subjudul `{{ g.title }}` dan breadcrumb kembali ke gap, Main.dc.html baris 673–675). B5 juga menyiapkan tautan "Langsung ke tinjauan HR" dari halaman gap (b5-training-needs.md baris 184). Namun `GET /review`, `GET /review/solutions`, dan ekspor CSV hanya bisa disaring dengan `projectId`. Tidak ada saringan per gap (kompetensi atau catatan kinerja), padahal kolomnya sudah ada di `lna_findings` (`competency_id`, `performance_record_id`).
* **Rekomendasi:** Tetapkan apa yang disebut "satu gap" di API, misalnya saringan opsional `gapId` atau `competencyId`/`performanceRecordId` di ketiga endpoint baca. Atau tulis tegas bahwa layar menyaring di sisi klien, lalu catat konsekuensinya untuk `counts` dan audit `readIndividual`, karena keduanya akan mencakup lebih banyak karyawan dari yang tampil di layar.

### M2. Serah-terima dari B6 ke B7 tidak dijawab
* **Lensa:** zoom-out
* **Cakupan:** baris 13–19 (layar yang dicakup), 68 (butir 1)
* **Masalah:** B6 menyerahkan dua hal ke B7 yang tidak disebut di spek ini:
  1. A9: `summaryState` dan `summaryNote` dari sesi. Menurut b6 baris 78, "B7 yang menampilkannya".
  2. Sesi tanpa temuan. Mockup menampilkan satu butir "Perlu ditinjau HR" (Main.dc.html baris 1923), sementara B6 baris 186 menyatakan hal ini "ditunda ke B7/layar".

  Akibatnya, gap yang wawancaranya selesai tanpa temuan tidak pernah muncul di antrean HR, dan target 2 hari kerja (PM-3) tidak berlaku untuknya.
* **Rekomendasi:** Tambahkan bagian "Serah-terima dari B6" yang memutuskan dua hal: field mana yang masuk butir antrean, dan apakah sesi tanpa temuan muncul sebagai butir antrean (dengan bentuk dan hitungan targetnya) atau secara sadar ditunda lagi ke layar dengan penanda `[⏳ DITERIMA]`.

### M3. Jalur penugasan EliteMentor dibangun lengkap untuk kontrak yang belum ada (YAGNI)
* **Lensa:** zoom-out (YAGNI); inventive-catalyst (kompromi yang tidak diperiksa)
* **Cakupan:** baris 44, 53, 98–115, 133–139
* **Masalah:** Kontrak FR-EM untuk path, payload, dan dukungan `Idempotency-Key` masih `[⚠️ BELUM TERVERIFIKASI]` (baris 137). Produksi pasti menjawab `ASSIGN_UNAVAILABLE`, dan tenant pilot memakai `lms_export` (baris 53). Meski begitu, spek tetap membangun semuanya:
  * enam kolom migrasi;
  * status `sending` dengan klaim basi 5 menit;
  * kunci idempotensi di body dan header;
  * batas waktu 10 detik yang menyentuh `client.js`;
  * tabel keputusan delapan baris.

  Fitur ini juga dijaga lima sakelar: `tna.review_workspace`, `em.gaps_autosend`, env `ELITEMENTOR_ASSIGNMENTS_ENABLED`, `lms.elitementorOrganizationId`, dan `lms.delivery`. Bila tim EliteMentor memilih bentuk lain, misalnya penugasan per batch, webhook balik, atau tanpa idempotensi, sebagian besar mesin ini harus dibongkar.
* **Rekomendasi:** Ada dua pilihan:
  * (a) Kecilkan B7 menjadi port `assign` saja plus `ASSIGN_UNAVAILABLE`. Kolom `assignment_*` dan logika klaim ditunda sampai FR-EM final.
  * (b) Bila tetap dipertahankan karena kodenya sudah jadi, beri penanda `[⏳ DITERIMA]` yang menyebut risiko bongkar ulang.

  Di kedua pilihan, kurangi sakelar yang tumpang tindih. Env dan `em.gaps_autosend` menjawab pertanyaan yang sama ("apakah adapter boleh dipakai"), jadi pilih satu dan jelaskan peran yang lain.
* **Beban tambahan:** Pilihan (a) membuat B7 butuh migrasi kedua saat kontrak final.

### M4. "Tugaskan" = dua panggilan dari web, dan course yang ditampilkan bisa berbeda dari yang disimpan
* **Lensa:** zoom-out (alur data minimal); inventive-catalyst
* **Cakupan:** baris 59, 79, 94
* **Masalah:** Tombol "Tugaskan" di web memanggil `POST /findings/:id/plan` lalu `POST /plan-items/:id/assign`.
  * Course yang dilihat HR di kartu solusi berasal dari `catalog.match` di `GET /review/solutions` (tanpa `programTier`). Endpoint plan menjalankan `catalog.match` lagi dengan `programTier` dari body (index.js baris 288). Bila katalog atau tier berbeda, course yang tersimpan dan dikirim tidak sama dengan yang dilihat HR.
  * Bila assign gagal (`502`, `ASSIGN_VIA_EXPORT`, `ASSIGN_UNAVAILABLE`), rencana sudah terlanjur dibuat. Rencana itu langsung mengunci klasifikasi ulang (baris 79) walaupun HR belum benar-benar "menjalankan solusi".
* **Rekomendasi:** Biarkan endpoint plan menerima course hasil rekomendasi (`source`/`ref`) yang dilihat HR, bukan menghitung ulang. Tulis juga apa yang dilakukan web bila langkah kedua gagal. Bila ingin satu langkah atomik, satu endpoint server "rencanakan dan tugaskan" lebih sederhana daripada orkestrasi di klien.
* **Beban tambahan:** Menerima course dari klien berarti server harus memvalidasi bahwa `ref` itu memang ada di katalog tenant.

### M5. Klasifikasi ulang terkunci permanen, termasuk bila rencananya ditolak
* **Lensa:** inventive-catalyst (kompromi palsu: kunci vs koreksi)
* **Cakupan:** baris 36, 79
* **Masalah:** Syarat klasifikasi ulang adalah "belum ada baris rencana untuk temuan itu". Di kode, `NOT EXISTS` mencakup rencana **apa pun** termasuk yang `rejected`, ditambah syarat `status = 'open'`, padahal `planFromFinding` mengubahnya menjadi `planned`. Sementara itu, `GET /review/solutions` mengabaikan rencana `rejected` (baris 94). Akibatnya, bila HR baru sadar sebuah temuan pelatihan sebenarnya masalah SOP setelah rencananya ditolak, tidak ada jalan untuk memperbaikinya:
  * klasifikasi ulang → `ALREADY_ACTIONED`;
  * review PR #16 → `ALREADY_REVIEWED`.

  Ini bertentangan dengan prinsip "AI tidak memutuskan sendiri, HR yang memastikan".
* **Rekomendasi:** Kunci hanya selama ada rencana yang **tidak ditolak**, dan kembalikan `status` temuan ke `open` saat semua rencananya ditolak. Kalau memang disengaja final, tulis alasannya di spek.
* **Beban tambahan:** Aturan transisi status temuan bertambah satu, dan perlu test.

### M6. `recommendation = null` memuat dua arti berbeda
* **Lensa:** zoom-out (fokus akar masalah)
* **Cakupan:** baris 94
* **Masalah:** Spek menyebut `null` sebagai "perlu modul baru". Di kode, `null` juga muncul bila temuan tidak punya `competencyId` (temuan dari Gap OKR, review-workspace.js baris 108). Akibatnya, semua temuan pelatihan dari Gap OKR akan tampil sebagai "perlu modul baru" walaupun katalog tidak pernah dicari. Mockup mengambil rekomendasi dari roadmap DACUM per gap kompetensi (Main.dc.html baris 1941) dan tidak menjelaskan kasus OKR.
* **Rekomendasi:** Bedakan "tidak ada course yang cocok" dari "tidak bisa dicocokkan (gap OKR)", misalnya dengan `recommendationReason` atau keterangan di spek. Putuskan juga bagaimana Gap OKR mendapat usulan modul, atau tandai sebagai keputusan untuk user.

### M7. Kontrak B9 tidak membawa rujukan gap
* **Lensa:** zoom-out (jalan buntu arsitektur)
* **Cakupan:** baris 126–131
* **Masalah:** Di mockup, setiap tindakan di Improvement Needs menampilkan gap asalnya, misalnya `src: 'ST-A2'` atau `'ST-A2 · O1'` (Main.dc.html baris 1943–1950). `listImprovementHandoffs` hanya memberi `projectId` dan `metricName`, dan `metricName` hanya ada untuk Gap OKR. Gap kompetensi (kode atau nama kompetensi) tidak bisa dirujuk tanpa membuka batas kontrak lagi.
* **Rekomendasi:** Tambahkan rujukan gap yang tidak menyangkut individu, misalnya `competencyCode`/`competencyName` atau `gapRef`, ke kontrak sebelum dikonfirmasi T6. Data ini tingkat jabatan, bukan individu, jadi tidak mengubah batas privasi di baris 130.

### M8. Istilah bertabrakan dengan `CONTEXT.md`
* **Lensa:** zoom-out (keselarasan dengan dokumen proyek)
* **Cakupan:** baris 8, 15, 31, 35, 77, 124
* **Masalah:**
  * Di `CONTEXT.md` dan B5 (b5 baris 57), **Perlu ditinjau HR** adalah *keadaan gap* (ada temuan yang belum disetujui, atau campuran). Di B7, istilah yang sama dipakai untuk *aksi menahan satu temuan*. Akibatnya, satu gap bisa berstatus "Perlu ditinjau HR" walaupun tidak ada temuan yang ditahan, dan sebaliknya.
  * Baris 8 memakai "temuan non-pelatihan", istilah yang menurut glosarium harus dihindari.
  * Konsep yang sama punya tiga nama: `improvement` (API), `non_training` (DB), dan "Improvement Needs" (produk).
* **Rekomendasi:** Beri nama sendiri untuk aksi tahan, misalnya "Ditahan HR" dengan label tombol tetap mengikuti mockup, lalu jelaskan hubungannya dengan keadaan gap "Perlu ditinjau HR". Ganti "temuan non-pelatihan" dengan "Improvement Needs". Tulis pemetaan `improvement` ↔ `non_training` satu kali di bagian Model.

---

## 🟢 Nit

### N1. Target 2 hari kerja hanya ditampilkan, tidak mendorong tindakan
* **Lensa:** inventive-catalyst (kegagalan yang ditangani pasif)
* **Cakupan:** baris 68–71
* **Masalah:** `overdue` dihitung saat dibaca dan hanya muncul di daftar. Tidak ada yang memberi tahu HR saat batasnya lewat.
* **Rekomendasi (saran):** Cukup catat bahwa pengingat atau eskalasi ada di luar B7 (misalnya lewat notifikasi atau asisten B17 yang sudah membaca `counts.overdue`), supaya tidak dikira sudah tertangani.

### N2. Ekspor CSV selalu mengulang semua baris
* **Lensa:** inventive-catalyst
* **Cakupan:** baris 116
* **Masalah:** Spek menganggap "GET tidak boleh menandai" dan "LMS tahu mana yang baru" sebagai kompromi yang tak terhindarkan, lalu menyerahkan penyaringan ke LMS klien.
* **Rekomendasi (saran):** Parameter baca `createdSince` atau `status` sudah menyelesaikan sebagian besar masalah tanpa menulis apa pun. Beban tambahannya satu parameter dan satu test.

### N3. Status `sending` yang macet hanya pulih bila HR mengklik lagi
* **Lensa:** inventive-catalyst (self-service/rekonsiliasi)
* **Cakupan:** baris 112–114
* **Masalah:** Bila proses mati di tengah, rencana tertahan `sending` sampai ada klik ulang setelah 5 menit. Di layar, HR melihat "sedang dikirim" tanpa batas.
* **Rekomendasi (saran):** Catat bahwa sinkron B14 nanti bisa merekonsiliasi rencana `sending` lewat kunci idempotensi, atau tampilkan `sending` basi sebagai "gagal, coba lagi". Ini terkait M3, jadi tidak perlu dibangun sekarang.

### N4. Aturan penarikan persetujuan (B8) ada di kode tetapi tidak di spek
* **Lensa:** zoom-out
* **Cakupan:** baris 77–80
* **Masalah:** `classify` menolak temuan draf dari wawancara yang persetujuannya ditarik (`409 CONSENT_WITHDRAWN`, review-workspace.js baris 71 dan 190). Butir 2 tidak menyebutnya, dan daftar test juga tidak.
* **Rekomendasi:** Tambahkan satu kalimat dan satu kasus test, atau rujuk ke spek B8.

### N5. Ketinggian spek bercampur
* **Lensa:** zoom-out (anti-weeds)
* **Cakupan:** baris 112, 122, 173, 183–221
* **Masalah:** SQL mentah untuk klaim dan handoff, daftar fungsi store, dan dua tabel riwayat triase berada di dokumen yang sama dengan keputusan produk. Pembaca baru sulit memisahkan keputusan dari catatan implementasi.
* **Rekomendasi:** Ganti SQL dengan aturannya dalam satu kalimat ("klaim bersyarat; hanya pemenang yang memanggil EliteMentor"). Pindahkan riwayat triase ke lampiran atau deskripsi PR.

### N6. Rujukan flag di butir 3 membingungkan
* **Lensa:** zoom-out
* **Cakupan:** baris 92, 95
* **Masalah:** Spek menyebut `tna.non_training_hr`, sementara visibilitas kategori `non_training` di kode lama ditentukan `module.ina` + `ina.dashboard` (index.js baris 42–43), dan `inaEnabled` hanya membaca `module.ina`. Tidak jelas flag mana yang menyembunyikan apa.
* **Rekomendasi:** Buat satu kalimat atau tabel kecil: flag → apa yang disembunyikan di B7.

### N7. Rujukan PR B0 tanpa dokumen
* **Lensa:** zoom-out (kecukupan konteks)
* **Cakupan:** baris 9, 181
* **Masalah:** Spek bergantung pada "PR B0" untuk layar web, tetapi `docs/designs/b0-fondasi-ui.md` tidak ada di repo dan spek tidak menautkan sumber lain.
* **Rekomendasi:** Tautkan PR atau spek B0, atau tulis bahwa B0 belum punya spek.

---

## Catatan lensa inventive-catalyst

Lensa ini menemukan kompromi palsu di M3, M4, dan M5, serta saran di N1–N3. Sisanya tidak bermasalah: penahanan temuan yang tetap `draft`, `UPDATE` bersyarat untuk dua HR yang bekerja bersamaan, dan handoff yang hanya menandai tanpa membuat tabel tindakan sudah seimbang. Untuk bagian itu: *No false compromise detected*.
