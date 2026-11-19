# Goldfish Review Report

**Target:** `/home/user/EWI/docs/designs/b17-asisten-elgos.md` (baris 1–224, seluruh file)
**Tahap:** 5, Initial Zoom Out Review (preset uninterrupted)
**Tanggal:** 19 Nov 2026

## Status Reviewer

| Reviewer | Status |
| --- | --- |
| `egm-zoom-out` | completed (inline oleh synthesizer, bukan subagent terpisah; lihat catatan) |
| `egm-inventive-catalyst` | completed (inline oleh synthesizer, bukan subagent terpisah; lihat catatan) |

**Catatan cara menjalankan (penting):** sesi synthesizer ini tidak punya alat untuk membuat subagent (tidak ada Agent tool). Jadi kedua lensa tidak dijalankan sebagai goldfish terpisah. Synthesizer menerapkan persona `agents/zoom_out.md` dan `agents/inventive_catalyst.md`, ditambah `resources/document_standards/zoom-out-standard.md`, langsung dari konteks baru. Synthesizer hanya membaca file GoldfishContext dan kode yang disebut, tanpa riwayat percakapan. Kedua lensa tidak terisolasi satu sama lain. Bila protokol mewajibkan isolasi, jalankan ulang tahap 5 dari sesi yang bisa membuat subagent.

Catatan konteks: `/home/user/EWI/docs/designs/b0-fondasi-ui.md` tidak ada di repo, jadi kontrak shell B0/B3 tidak bisa diperiksa (lihat temuan 🟢 5).

Hasil inventive catalyst: ada false compromise (temuan 🟡 3, 5, 6 dan 🟢 4, 6).

## Ringkasan

| Tingkat | Jumlah |
| --- | --- |
| 🔴 Blocker | 0 |
| 🟡 Major | 7 |
| 🟢 Nit | 6 |

Gambaran umum: tujuannya jelas dan sesuai CONTEXT.md. Asisten hanya membaca dan menjawab dari fakta yang disusun server sesuai cakupan peran, jadi arahnya sudah benar. Arsitekturnya sederhana: satu router, satu daftar penyusun fakta, satu metode port AI, dan memakai `scopeFor`, `submoduleActive`, `ai_usage_logs`, audit, serta enkripsi per tenant yang sudah ada. Masalah utamanya bukan arsitektur yang berlebihan. Masalahnya ada tiga: (a) keputusan privasi penting hanya tercatat di tabel triase, (b) ada beberapa bagian spekulatif (registri perluasan, regex penolakan), dan (c) ada dua kompromi yang sebenarnya tidak perlu diterima (audit sesudah fakta terkirim, kegagalan penyedia yang menghabiskan kuota tanpa jalan cadangan).

---

## 🔴 Blocker

Tidak ada.

---

## 🟡 Major

### 1. Keputusan privasi penting hanya ada di tabel triase, tidak di badan spek - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** baris 205–223 (khususnya 219, 220, 221), dibandingkan dengan "Prinsip privasi" baris 11–21 dan urutan `POST /ask` baris 79–90
* **Discrepancy Description**: Tiga keputusan yang mengubah sifat privasi fitur hanya muncul sebagai "Terima" di tabel triase code review:
  * Fakta sudah terkirim ke model sebelum audit, sehingga fail closed hanya menutup respons (baris 219).
  * Nama anggota tim ikut di ekspor data atasan (baris 220).
  * "Rekan tim" pada pertanyaan umum ikut ditolak (baris 221).

  Badan spek tetap berbunyi "Audit dulu ... fail closed" (baris 87) dan "Model tidak pernah menerima data yang tidak boleh dilihat penanya" (baris 13). Pembaca baru yang membaca spek dari atas ke bawah tidak akan tahu batas sebenarnya.
* **Rationale & Recommendation**: Spek adalah sumber kebenaran untuk review "Spec" (`docs/agents/domain.md`). Pindahkan ketiga keputusan itu ke bagian yang relevan: "Prinsip privasi", langkah 8 urutan endpoint, dan bagian "Data dan migrasi" untuk ekspor. Tulis batasnya terang-terangan. Tabel triase cukup merujuk ke bagian itu. Bila perlu, ringkas kedua tabel triase (baris 187–223) menjadi riwayat singkat karena keduanya kini lebih panjang daripada bagian desain mana pun.

### 2. Registri perluasan (`registerFactBuilder`, `registerPage`, `registerView`) dibangun untuk pemakai yang belum ada - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** baris 127–129 "Perluasan oleh paket lain", baris 9 dan 35; triase baris 218 dan 223 ("registri tanpa pemakai produksi"); kode `facts.js` baris 121–132, `views.js` baris 20–31
* **Discrepancy Description**: Spek menambah API pendaftaran global yang mengubah state modul (`BUILDERS.push`, mutasi `PAGE_LABEL`, `VIEW_LABEL`, `ROLE_VIEWS`) supaya B11–B16 tidak perlu menyentuh router asisten. Saat ini tidak ada pemakai produksi. Triase sudah perlu memperbaiki satu bug darinya (objek beku, baris 218) dan menambah test khusus. Isi registri juga bergantung pada urutan `require` modul lain dan bisa bocor antar-test.
* **Rationale & Recommendation**: Ini YAGNI. Semua paket ada di repo yang sama, jadi B11–B16 cukup menambah satu entri ke array `BUILDERS` dan peta label di `facts.js`/`views.js` lewat PR mereka sendiri. Hasilnya sama-sama "tanpa perubahan di router", tanpa state global yang bisa diubah dan tanpa ketergantungan urutan impor. Hapus registri sekarang. Tambahkan bila nanti ada paket yang memang tidak boleh mengubah file asisten. Batas yang bersih tetap terjaga karena bentuk penyusun fakta `{ key, views, submodule?, flags?, page, build(ctx) }` sudah jadi kontraknya.

### 3. Penolakan pasti dengan regex: hematnya kecil, biayanya penolakan salah - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`, `egm-inventive-catalyst`
* **Affected Scope:** baris 82 (langkah 3), baris 92–102; triase baris 211 dan 221; kode `views.js` baris 48–50
* **Discrepancy Description**: Spek sendiri menyebut pola ini "penghemat panggilan, bukan pengaman utama". Penggunaan sudah dibatasi 20 pertanyaan per 10 menit dan tanpa plafon biaya (PO-10 C), jadi penghematannya kecil. Sebaliknya, pola ini sudah terbukti menolak pertanyaan sah ("rekan tim" pada pertanyaan umum, baris 221). Pola ini juga menambah aturan bahasa yang rapuh: hanya bahasa Indonesia, hanya satu huruf sesudah "karyawan". Aturan ini harus dirawat, dites, dan sudah sekali menyimpang dari spek (baris 211). Ini kompromi semu: "hemat panggilan" ditukar dengan "jawaban benar untuk pertanyaan sah". Padahal pengaman sebenarnya, yaitu fakta yang hanya berisi data diri sendiri di tampilan `karyawan`, sudah membuat model tidak mungkin membocorkan data orang lain.
* **Rationale & Recommendation**: Hapus langkah 3 dan regexnya. Biarkan model menolak lewat `refused: true` (baris 89, 140), karena fakta karyawan memang tidak memuat orang lain. Bila tetap ingin hemat, balik arahnya (pola Inversion): jangan tolak berdasarkan kata, tetapi lewati panggilan model hanya bila tidak ada satu pun fakta yang terisi.
  *Liabilitas sekunder:* setiap pertanyaan yang jelas menanyakan orang lain tetap memakai satu panggilan model (biaya token kecil). Bunyi penolakan menjadi tanggung jawab instruksi sistem, bukan teks tetap, sehingga test integrasi nomor 4 (baris 164) perlu memakai penyedia perekam yang mengembalikan `refused`.

### 4. "Aman karena susunannya" belum ditegakkan merata: tiga penyusun fakta HR mengabaikan `ctx.scope` - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** baris 15 (prinsip 1), tabel fakta baris 117, 121, 122; triase baris 213 ("semua penyusun memakai `ctx.scope`"); kode `facts.js` baris 89–118, `lna-stores.js` baris 975–977 dan 1174
* **Discrepancy Description**: `tinjauan`, `perbaikan`, dan `permintaanData` memanggil store seluruh tenant (`reviewQueue`, `improvementCounts(tenantId)`, `openCounts(tenantId)`) tanpa cakupan. Untuk HR hari ini hasilnya sama karena `visibleEmployeeScope()` HR = semua. Tetapi prinsip privasi spek dan putusan triase berbunyi semua penyusun memakai `ctx.scope`. Bila cakupan HR nanti dipersempit (misalnya HR per unit, atau Admin ETA dibedakan), ketiga fakta ini langsung membocorkan angka di luar cakupan tanpa ada yang terlihat berubah.
* **Rationale & Recommendation**: Perbaiki di komponen akarnya: store agregat menerima `scope` seperti `topTrainingGaps` dan `planStatusCounts` (`scopeSql`). Jangan andalkan anggapan "HR = semua" di penyusun fakta. Tambahkan aturan eksplisit di baris 106: setiap penyusun fakta wajib meneruskan `ctx.scope` ke store. Test integrasi nomor 6 (baris 166) bisa ditambah kasus cakupan sempit memakai cakupan tiruan.

### 5. Audit fail closed terjadi sesudah fakta sampai ke model (kompromi yang diterima tanpa perlu) - Severity: Major
* **Reviewer Lens:** `egm-inventive-catalyst`
* **Affected Scope:** baris 79–87 (urutan langkah 2, 4, 5, 8); triase baris 219
* **Discrepancy Description**: Kontradiksinya: "baca data individu diaudit (R2-2), fail closed" berhadapan dengan "panggilan model terjadi sebelum audit". Triase menerimanya dengan alasan `ai_usage_logs` mencatat panggilan. Tetapi `ai_usage_logs` tidak memuat `factKeys` atau `employeeIds`, jadi tidak menjawab pertanyaan audit "data siapa yang terbaca". Selain itu pencatatannya best effort (baris 84), bukan fail closed.
* **Proposed Resolution**: Pola Preliminary Action. Baris log `pending` sudah dibuat di langkah 2 dalam transaksi. Pindahkan audit `read assistant.answer` (atau audit "maksud baca" dengan `logId`, `view`, `factKeys`, `employeeIds`) ke titik sesudah fakta tersusun dan sebelum `ai.assistantReply`. Bila audit gagal, model tidak dipanggil. Sesudah model menjawab, cukup perbarui baris log. `outcome` dan `page` ada di log, yang sudah ditautkan dari audit lewat `logId`.
* **Secondary Liabilities**: Audit tercatat juga untuk permintaan yang kemudian gagal di penyedia, sehingga baris audit sedikit lebih banyak. Audit tidak lagi memuat `outcome`/`page` akhir, dan pembaca audit harus melihat `assistant_logs` untuk hasilnya. `employeeIds` HR yang berasal dari nama di jawaban (baris 90) tidak bisa diketahui sebelum model menjawab, jadi aturannya cukup "semua pemilik kode samaran di fakta" (lihat juga 🟢 3).

### 6. Penyedia gagal = kuota pengguna habis dan tidak ada jawaban cadangan - Severity: Major
* **Reviewer Lens:** `egm-inventive-catalyst`
* **Affected Scope:** baris 81 ("Percobaan yang gagal tetap terhitung"), baris 85 (`503`), baris 141 (tiruan); test baris 170
* **Discrepancy Description**: Spek menganggap dua hal sebagai keharusan. Pertama, setiap gangguan Bedrock memakan jatah 20 pertanyaan pengguna. Galat penyedia bukan hal yang dikendalikan pengguna, jadi saat Bedrock bermasalah pengguna yang mencoba ulang akan terkena `429` setelah Bedrock pulih. Kedua, gangguan penyedia langsung menjadi `503` tanpa mitigasi, padahal repo sudah punya penyedia tiruan deterministik yang merangkai jawaban dari angka fakta yang sama (baris 141).
* **Proposed Resolution**: Pola Beforehand Cushioning dan Blessing in Disguise:
  * Tetap hitung `refused`, `no_answer`, `answered`, dan galat validasi. Jangan hitung baris `error` yang berasal dari `AiError` penyedia (timeout, throttling), atau hitung dengan bobot lebih kecil.
  * Saat `AiError`, pakai jawaban terdegradasi dari logika tiruan berbasis kata kunci di atas fakta yang sudah tersusun, dengan `outcome` baru `fallback` atau `answered` plus penanda. Bila tidak ada yang cocok, baru kembalikan `503`.
* **Secondary Liabilities**: Logika tiruan menjadi kode produksi. Kalimatnya harus layak dibaca pengguna dan tabel kata kuncinya dirawat bersama daftar fakta. CHECK `outcome` dan test perlu ditambah. Pengecualian `error` dari batas pakai membuka sedikit ruang penyalahgunaan bila galat bisa dipicu dari input, jadi batasi pengecualian hanya untuk kode galat sisi penyedia.

### 7. Pemrosesan AI baru tanpa DPIA/persetujuan: syarat menyalakan flag belum ditulis - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** baris 143 (PK-17 `[⚠️ BELUM TERVERIFIKASI]`), baris 72 (flag `assistant`, default mati), baris 21 (keputusan nama belum diputus)
* **Discrepancy Description**: Asisten mengirim data karyawan (rencana, kompetensi, status wawancara, angka tim) ke Bedrock untuk tujuan baru. Spek mencatat bahwa DPIA dan teks persetujuan belum menyebut pemrosesan ini, lalu hanya "dicatat di PR". Tidak ada yang mengikat antara kekurangan itu dan kapan flag boleh dinyalakan untuk tenant mana pun. Hal yang sama berlaku untuk keputusan nama di baris 21 yang masih menunggu user.
* **Rationale & Recommendation**: Ini soal keselarasan dengan aturan proyek (PK-17), bukan detail kode. Tambahkan satu kalimat syarat rilis di bagian Endpoint atau Status: flag `assistant` tidak dinyalakan untuk tenant mana pun sebelum (1) DPIA/teks persetujuan memuat Asisten ELGOS dan (2) kartu keputusan nama 19 Nov sudah dijawab. Flag default mati sudah menjadi mekanismenya, tinggal syaratnya ditulis.

---

## 🟢 Nit

### 1. Ketinggian detail: spek memuat kode, dan status "spek" tidak cocok dengan daftar file yang sudah selesai - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** baris 42–64 (SQL migrasi lengkap), 68 (SQL `DELETE`), 96–98 (regex), 106 (tanda tangan `ctx` lengkap), 155–171 (daftar test per kasus); baris 3 dan 173–185
* **Discrepancy Description**: Sebagian besar spek adalah salinan kode yang sudah ada di file. Status di baris 3 berbunyi "spek", tetapi semua item di daftar perubahan file sudah `[x]`, jadi dokumen ini lebih mirip catatan implementasi.
* **Rationale & Recommendation**: Ganti SQL dan regex dengan ringkasan kolom/aturan dan rujukan ke file. Perbarui status (misalnya "spek + implementasi, PR #…") supaya pembaca tahu kode adalah sumber detailnya.

### 2. Validasi retensi 1–365 ditulis dua kali (JS dan SQL) - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** baris 68; triase baris 223; kode `lna-stores.js` baris 1413–1422
* **Discrepancy Description**: Job lintas tenant mengulang aturan `normalize()` di SQL (`jsonb_typeof`, regex, `BETWEEN`). Ada dua sumber kebenaran untuk satu setting.
* **Rationale & Recommendation**: Jumlah tenant kecil, jadi job cukup mengulang per tenant: `settings.get()` (sudah dinormalisasi) lalu satu `DELETE ... WHERE tenant_id = :t AND created_at < now() - :days`. Pola ini dekat dengan `import-batches-cleanup` yang sudah ada di `src/jobs/index.js` dan menghapus salinan aturan di SQL.

### 3. Aturan kode samaran dan audit untuk tampilan `hr` saat ini tidak dipakai - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** baris 21, baris 90 (aturan `employeeIds` tampilan `hr`); kode `facts.js` baris 87–118, `index.js` baris 131
* **Discrepancy Description**: Tidak ada penyusun fakta HR yang memanggil `ctx.alias`. Semua fakta HR adalah agregat, jadi `employeeIds` HR selalu kosong dan pilihan "nama ke HR" di baris 21 belum berdampak apa pun untuk HR.
* **Rationale & Recommendation**: Tulis terang-terangan bahwa fakta HR di paket ini hanya agregat tanpa kode samaran, dan aturan `employeeIds` HR baru berlaku bila ada fakta HR yang menyebut orang. Ini mencegah pembaca mengira HR sudah bisa melihat nama lewat asisten.

### 4. Semua fakta tampilan disusun dan dikirim untuk setiap pertanyaan - Severity: Nit
* **Reviewer Lens:** `egm-inventive-catalyst`
* **Affected Scope:** baris 106 (semua penyusun aktif dijalankan), baris 90 (audit atasan = seluruh tim); kode `index.js` baris 96–100
* **Discrepancy Description**: Kontradiksinya: cakupan jawaban berhadapan dengan minimisasi data. Pertanyaan "ada undangan wawancara?" tetap mengirim rencana dan kompetensi. Di tampilan atasan, setiap pertanyaan membuat audit mencatat seluruh tim.
* **Proposed Resolution**: Pola Segmentation. Pakai tabel kata kunci per kunci fakta yang sudah ada di penyedia tiruan untuk memilih fakta yang relevan, dan kirim semua fakta hanya bila tidak ada yang cocok.
* **Secondary Liabilities**: Ada risiko fakta yang dibutuhkan tidak terpilih sehingga jawaban menjadi "tidak tahu". Tabel kata kunci menjadi bagian jalur produksi. Ini advisori: fakta yang dikirim tetap dalam cakupan sah penanya, jadi tidak wajib untuk paket ini.

### 5. Konteks UI tidak bisa diverifikasi: `b0-fondasi-ui.md` tidak ada, kontrak `view` dari shell masih anggapan - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** baris 3, 33, 36
* **Discrepancy Description**: Spek bergantung pada pilihan tampilan di shell B3 dan nama tampilan mockup (`[⚠️ BELUM TERVERIFIKASI]`). Dokumen fondasi UI yang menjadi rujukan tidak ada di repo.
* **Rationale & Recommendation**: Rujuk dokumen/PR B3 yang benar-benar ada. Tulis kontrak minimum yang diharapkan dari shell: dari mana `view` berasal dan kapan `GET /api/assistant` dipanggil ulang saat tampilan berganti.

### 6. Batas waktu panggilan model belum diatur untuk panel chat - Severity: Nit
* **Reviewer Lens:** `egm-inventive-catalyst`
* **Affected Scope:** baris 140 (satu kali coba ulang lewat `converseParsed`); kode `bedrock-provider.js` baris 51 (`timeoutMs` bawaan 30000)
* **Discrepancy Description**: Batas waktu Bedrock bawaan adalah 30 detik, dan coba ulang format bisa menggandakannya. Panel chat kecil dengan jawaban maksimal 3 kalimat bisa membuat pengguna menunggu hingga sekitar 60 detik. Waktu sepanjang ini wajar untuk wawancara, tetapi tidak untuk asisten.
* **Proposed Resolution**: Pola Dynamics. Tetapkan `timeoutMs` khusus untuk `assistant_reply` (misalnya 10–15 detik) dan matikan coba ulang format bila waktu tersisa tidak cukup, lalu masuk ke jalur cadangan di 🟡 6.
* **Secondary Liabilities**: Galat timeout bertambah saat Bedrock lambat. Angka batas perlu dipantau dari `latencyMs` di `ai_usage_logs`.
