# B6 · Wawancara akar masalah (backend)

Status: spek v3, sesuai backend yang sudah digabung (PR #25) dan perbaikan balapan baris di PR susulan. Riwayat review: bagian 11 (review spek manual), 12 (review diff), 14 (egm-review dengan plugin, 19 Nov). Paket B6 dari `/mnt/project-files/elgos-eksekusi/brief-bangun-penuh-19nov.md` (thread T4). Bergantung pada B5 (`docs/designs/b5-training-needs.md`) untuk kolom penugasan (`duration_minutes`, `focus_*`). Layar (web) menyusul di atas B0.

Penanda: `[⚠️ BELUM TERVERIFIKASI]` = pilihan penulis yang belum dikonfirmasi user atau data; `[⏳ DITERIMA]` = celah yang disadari dan sengaja ditunda. Kode keputusan (PO-, PD-, PM-, K-) merujuk ke `/mnt/project-files/ewi-grilling/keputusan-master-semua-grilling.md`.

## 1. Tujuan

Karyawan menjalani wawancara teks dengan AI dalam empat langkah yang jelas, dan **memeriksa sendiri ringkasan temuan sebelum dikirim ke HR**:

Undangan → Persetujuan → Wawancara → Ringkasan (Sesuai / Ulangi) → Selesai.

Sebelum B6 (PR #15 + #16) alurnya: persetujuan → percakapan → `POST /complete` → analisis di latar → temuan draf untuk HR. Karyawan tidak pernah melihat apa yang disimpulkan AI tentang dirinya. B6 menambah langkah ringkasan di antara percakapan dan pengiriman, tanpa mengubah pengaman yang sudah ada (transkrip hanya untuk karyawan PO-6, temuan draf sampai direview HR PD-14, persetujuan berversi PM-9).

## 2. Layar mockup Pak Eji yang dicakup

`project/Main.dc.html`, layar `iv` ("Wawancara akar masalah"):

- Stepper 5 langkah: Undangan, Persetujuan, Wawancara, Ringkasan, Selesai.
- **Persetujuan**: daftar ketentuan, satu checkbox, ringkasan galat "Ada masalah: centang persetujuan untuk melanjutkan", tombol "Lanjut ke wawancara".
- **Percakapan**: "Pertanyaan n dari N", giliran AI dan karyawan, kirim jawaban, lalu "Lihat ringkasan temuan".
- **Ringkasan temuan AI**: "Periksa apakah ringkasan ini sesuai dengan yang Anda maksud sebelum dikirim ke HR." Tiap temuan: teks, "Keyakinan AI: n%", label jenis. Tombol "Sesuai, kirim ke HR" dan "Ulangi wawancara".
- **Selesai**: "Ringkasan sudah dikirim ke HR untuk ditinjau."
- **Footer audit**: kode sesi · model AI · "log audit: persetujuan tercatat · n jawaban".

Pilihan jawaban siap-klik di mockup adalah simulasi; produk memakai jawaban teks bebas.

Di luar cakupan B6: layar web (menyusul di atas B0), input suara (B19; komponen Percakapan menyediakan slotnya), langkah ringkasan untuk DNA dan CCA, teks persetujuan final (legal), teks email pengingat, dan tampilan `summaryState` di antrean HR (B7).

## 3. Yang sudah ada dan dipakai ulang

| Hal | Di mana |
| --- | --- |
| Persetujuan berversi, audit persetujuan | `POST /:submodule/sessions/:id/consent` (`core/consent`) |
| Giliran tanya jawab, kuota pertanyaan | `POST /sessions/:id/turns`, `aiConfig.maxQuestions` (bawaan 8) |
| Tutup sesi + job analisis dua kali nilai | `POST /sessions/:id/complete`, `interviews/analysis.js`, `lna_analysis_jobs` |
| Temuan draf sampai direview HR | `lna_findings.review_status` |
| Transkrip hanya untuk karyawan | `GET /sessions/:id`, `/transcript` |
| Kontrak AI `analyzeTna({ transcript, triggers, competencies, pass })` | `src/ai` (stub + Bedrock) |
| Enkripsi per tenant | `cipher.encryptJson/decryptJson` di `db/lna-stores.js` |

## 4. Rancangan

### 4.1 Ringkasan = penilaian pertama analisis

Analisis TNA sekarang menilai transkrip dua kali (`pass` 1 dan 2) dan menyimpan hasil penilaian pertama dengan angka keyakinan dari kesepakatan keduanya (`combineRuns`). B6 memindahkan **penilaian pertama ke langkah ringkasan**:

1. Karyawan menekan "Lihat ringkasan temuan" → `POST /sessions/:id/summary`. Server memanggil `ai.analyzeTna(pass 1)` dan menyimpan hasilnya terenkripsi di sesi (`summary_findings`).
2. Karyawan melihat temuan itu (judul, kategori, keyakinan).
3. "Sesuai, kirim ke HR" → `POST /sessions/:id/summary/confirm`. Sesi ditutup, job analisis dibuat. Job memakai `summary_findings` sebagai penilaian pertama dan hanya memanggil model untuk penilaian kedua.

Akibatnya temuan yang masuk antrean review HR **adalah temuan yang dilihat dan dikonfirmasi karyawan**: judul, rincian (`detail`), kategori, dan urutannya sama. Yang boleh berbeda hanya angka keyakinan (rata-rata dua penilaian, atau setengahnya bila penilaian kedua tidak sepakat, lihat `combineRuns`). Temuan yang hanya muncul di penilaian kedua tidak disimpan. Tidak ada operasi AI baru. Alur normal tanpa ulangan tetap dua panggilan `analyzeTna` per sesi. Tiap "Ulangi wawancara" mengulang seluruh percakapan (sampai `questionLimit` panggilan `nextQuestion`) dan, bila sesudah ringkasan, menambah satu `analyzeTna`; penutupan oleh HR (A7) memakai dua penilaian sendiri.

Catatan: parameter `pass` yang dikirim `analysis.js` diabaikan kedua penyedia; kedua penilaian memakai prompt yang sama. "Penilaian pertama/kedua" di dokumen ini berarti urutan panggilan, bukan prompt berbeda.

### 4.2 Status dan langkah

Status sesi di DB tidak ditambah (`scheduled`, `in_progress`, `completed`, `abandoned`). Langkah stepper diturunkan dan dikirim sebagai `step` di `GET /sessions/:id`:

| `step` | Syarat |
| --- | --- |
| `expired` | status `scheduled` dan undangan sudah lewat (`isExpired`) |
| `consent` | status `scheduled`, undangan masih berlaku |
| `chat` | status `in_progress` dan `summary_at` kosong |
| `summary` | status `in_progress` dan `summary_at` terisi |
| `done` | status `completed` (web membedakan teks "Ringkasan sudah dikirim" dari "Sesi ditutup HR" lewat `summaryState`, A9) |
| `closed` | status `abandoned` |

"Undangan" selalu sudah lewat begitu karyawan membuka sesi (web menampilkannya sebagai langkah 1 yang selesai).

### 4.3 Aturan

- **A1 Flag.** Flag baru `tna.interview_summary`, default mati. Rute baru (`/summary`, `/summary/confirm`, `/restart`) hanya didaftarkan saat `interviewRouter` dipanggil dengan `submodule === 'tna'` (router yang sama dipakai DNA tanpa `flags`, `modules/dna/index.js`) dan dijaga `requireFlag`. Sesi DNA tidak berubah. Endpoint tetap di balik `requireSubmodule('tna')` (`module.tna`). Bila flag dimatikan saat sebuah sesi sudah punya ringkasan: kunci A4 tetap berlaku (berdasarkan data, bukan flag) sampai sesi ditutup; karyawan boleh menutup lewat `/complete` lama, dan karena ringkasan tidak dikonfirmasi, analisis berjalan dua penilaian seperti dulu dan `summaryState = 'unchecked'`. CCA (B10) di luar cakupan: bila B10 butuh langkah ringkasan, ia menambah operasi analisisnya sendiri dan memakai ulang `summary.js`.
- **A2 Membuat ringkasan.** `POST /sessions/:id/summary`: hanya karyawan yang diwawancarai; status harus `in_progress`; minimal satu jawaban. Bila ringkasan sudah ada, dikembalikan apa adanya tanpa memanggil model lagi (aman diulang). Penyimpanan bersyarat (`saveSummary`, satu transaksi yang mengunci baris sesi `FOR UPDATE`): ringkasan hanya tersimpan bila sesi masih `in_progress`, belum punya ringkasan, `restart_count` sama dengan saat permintaan dimulai, **dan** jumlah giliran sama dengan saat transkrip dibaca (D6: jawaban yang masuk selama AI meringkas tidak boleh hilang dari ringkasan). Permintaan yang kalah (klik ganda, sesi diulang, atau jawaban baru masuk saat AI masih bekerja) membuang hasilnya dan mengembalikan ringkasan pemenang bila ada, atau 409 `INVALID_STATE`; karyawan bisa meminta ringkasan lagi. Bila AI gagal, tidak ada yang tersimpan dan karyawan bisa mencoba lagi. Pemakaian token dicatat seperti panggilan lain (`callAi`). Ringkasan baru dicatat audit `create`, `tna.interview_summary`, `{ findings: n }`.
- **A3 Isi untuk karyawan.** `{ findings: [{ title, detail, category, confidence }], createdAt, confirmedAt, state }`. `detail` (1-3 kalimat bukti dari jawaban) **ikut ditampilkan**, karena itulah yang nanti dibaca HR; karyawan tidak boleh mengonfirmasi sesuatu yang tidak dilihatnya. ID kompetensi/target tidak dikirim. `confidence` adalah angka penilaian pertama dan bisa `null`; web menulis "Keyakinan AI sementara: n%" (tanpa baris itu bila `null`) karena angka di sisi HR bisa turun setelah penilaian kedua. Kategori ditampilkan sebagai "Training Needs" / "Improvement Needs"; keyakinan < 0,5 atau `null` diberi label "Perlu ditinjau HR" (aturan tampilan, konstanta bersama di web). Bila tidak ada temuan, `findings` kosong dan web menampilkan "Tidak ditemukan hambatan yang jelas"; karyawan tetap bisa mengirim.
- **A4 Sesudah ringkasan dibuat, percakapan terkunci.** `POST /turns` → 409 `SUMMARY_PENDING` ("Ringkasan sudah dibuat. Kirim ke HR atau ulangi wawancara."). Kunci ini juga ditegakkan di store: `addTurn` (dengan `opts.guard = { restartCount }`) hanya menyisipkan bila sesi `in_progress`, `summary_at` kosong, dan `restart_count` sama dengan yang dibaca saat permintaan dimulai. Pemeriksaan ini membaca baris sesi dengan `FOR SHARE`, sehingga bila `/restart` atau `/summary` sedang memegang kunci baris, penyisipan menunggu lalu memeriksa ulang baris yang sudah commit (tanpa kunci, `INSERT … SELECT` di READ COMMITTED bisa lolos penjaga lalu menyisip setelah ulangi selesai). Bila penjaga gagal, giliran tidak tersimpan dan jawaban 409 `INVALID_STATE`; ini berlaku untuk jawaban karyawan maupun pertanyaan AI berikutnya (D7: tidak pernah `{ question: null, done: false }`). Jalan keluar: konfirmasi (A5), kirim dengan catatan (A5b), atau ulangi (A6).
- **A5 Konfirmasi.** `POST /sessions/:id/summary/confirm`: hanya karyawan itu; harus ada ringkasan yang belum dikonfirmasi. Satu fungsi store `confirmSummary` dalam **satu transaksi**: `UPDATE lna_interview_sessions SET status = 'completed', ended_at = now(), summary_confirmed_at = now(), summary_disputed = :disputed, summary_note = :note WHERE tenant_id AND id AND status = 'in_progress' AND summary_at IS NOT NULL AND summary_confirmed_at IS NULL RETURNING ...`, lalu `INSERT` job analisis. Dari dua permintaan bersamaan hanya satu yang mendapat baris; yang lain 409 `INVALID_STATE`. Sesudah transaksi: job dijalankan di latar (`analysis.kick`) dan audit `update`, `tna.interview_summary`, `{ decision: 'confirmed' | 'disputed', findings: n }`. Bila audit gagal, respons 500 tetapi sesi dan job sudah konsisten (pola yang sama dengan `/complete`). Jawaban 202 `{ status: 'completed', analysis: { status }, summaryState }` (tanpa `aiModel`/`aiUsage`: biaya dan ID model tidak untuk karyawan).
- **A5b Kirim dengan catatan "tidak sesuai".** Supaya karyawan yang jatah ulangnya habis tidak dipaksa menyatakan "sesuai": body `/summary/confirm` boleh `{ accurate: false, note }` (`note` wajib, 10-1000 karakter, terenkripsi). Temuan tetap dikirim ke HR, tetapi sesi bertanda `summaryState = 'disputed'` dan HR melihat catatan karyawan di antrean review. Web menampilkan tombol "Kirim dengan catatan" hanya saat `restartsLeft = 0`; API menerimanya kapan pun. `[⏳ DITERIMA]` Jalur ini tidak ada di mockup Pak Eji (mockup hanya "Sesuai" dan "Ulangi"); ditambahkan atas temuan review dan diangkat ke user di PR.
- **A6 Ulangi wawancara.** `POST /sessions/:id/restart`: hanya karyawan itu; status `in_progress` (sebelum atau sesudah ringkasan dibuat); paling banyak **2 kali** per sesi (`restart_count`), berikutnya 409 `RESTART_LIMIT`. Bila undangan sudah lewat (`isExpired(inviteExpiresAt)`) → 409 `INVITATION_EXPIRED` **sebelum** apa pun dihapus, karena persetujuan ulang akan ditolak dan transkrip hilang percuma; karyawan masih bisa mengirim ringkasan atau meminta HR memperpanjang. Store `restart` mengunci baris sesi (`SELECT ... FOR UPDATE`, syarat `status = 'in_progress'` dan `restart_count < 2`) dan menghapus giliran lewat sesi (`DELETE FROM lna_interview_turns t USING lna_interview_sessions s WHERE s.id = t.session_id AND s.tenant_id = :tenantId AND s.id = :id`), karena tabel giliran tidak punya `tenant_id`. `[⚠️ BELUM TERVERIFIKASI]` batas 2 adalah pilihan penulis untuk membatasi biaya token; mockup tidak membatasi. Efek, dalam satu transaksi: semua giliran sesi dihapus, `summary_findings`/`summary_at` dikosongkan, `consent_at`/`consent_version`/`started_at` dikosongkan, status kembali `scheduled`, `restart_count + 1`. Karyawan menyetujui ulang seperti di mockup (ulang kembali ke langkah Persetujuan). Tenggat undangan tidak berubah. Audit: `delete`, `tna.interview_transcript`, `{ reason: 'restart', turns: n, restartCount }`. Catatan persetujuan lama tetap ada di log audit.
- **A7 `/complete` saat flag nyala.** Untuk sesi TNA, bila pemanggil adalah orang yang diwawancarai (`req.user.id === intervieweeId`, **apa pun perannya**, karena HR dan atasan juga bisa menjadi peserta, K2) → 409 `SUMMARY_REQUIRED` ("Periksa ringkasan temuan sebelum mengirim ke HR."). HR dan Admin ETA tetap bisa menutup sesi **orang lain** lewat `/complete` (mis. karyawan berhenti di tengah); analisis lalu berjalan dua penilaian seperti sekarang, `summary_confirmed_at` tetap kosong, dan `summaryState = 'unchecked'` (A9).
- **A8 Job analisis.** `analysis.analyze` untuk TNA: bila sesi punya `summary_findings` **dan** `summary_confirmed_at`, penilaian pertama diambil dari sana (`stores.interviews.summaryForAnalysis`, tanpa memanggil model), penilaian kedua tetap memanggil `ai.analyzeTna`. Selain itu perilaku lama. Urutan: (1) gabungkan kedua penilaian dengan ID asli (`combineTnaFindings`, kunci pencocokan memakai ID); (2) ID kompetensi/target yang tidak lagi ada **di tenant itu** diset null (`stores.dna.existingCompetencyIds`, `stores.tna.performanceByIds`, keduanya berfilter `tenant_id`), supaya FK tidak menggagalkan job; (3) simpan. Job yang diulang (percobaan ke-2/3) mengulang hanya penilaian kedua.
- **A9 Tanda untuk HR.** `stores.tna.reviewQueue` dan `getReviewItem` menambah `summaryState` dan `summaryNote` dari sesi temuan. B7 yang menampilkannya; B6 hanya menyediakan data. Tidak ada transkrip untuk HR (PO-6). Lima nilai `summaryState` (fungsi `summaryStateOf` di `summary.js`, dipakai juga di `GET /sessions/:id`):
  - `confirmed`: `summary_confirmed_at` terisi dan tidak disengketakan;
  - `disputed`: dikirim dengan catatan tidak sesuai (A5b);
  - `unchecked`: sesi **selesai** tanpa konfirmasi karyawan (ditutup HR, flag dimatikan, atau alur lama tanpa langkah ringkasan); bagi HR artinya karyawan tidak memeriksa temuan;
  - `pending`: ringkasan sudah dibuat dan sesi masih berjalan (hanya muncul di `GET /sessions/:id`, karena temuan baru masuk antrean HR setelah sesi selesai);
  - `not_applicable`: belum ada ringkasan dan sesi belum selesai, atau temuan tidak lagi tertaut ke sesi.
- **A10 Durasi dan topik (dari B5).** `duration_minutes` 15 → paling banyak 5 pertanyaan, 30 atau kosong → `aiConfig.maxQuestions` (bawaan 8); tidak pernah melebihi `aiConfig.maxQuestions`. `[⚠️ BELUM TERVERIFIKASI]` pemetaan menit → jumlah pertanyaan adalah perkiraan (±3 menit per pertanyaan); disetel setelah QA malam dengan LLM sungguhan. Bila sesi punya `focus_kind` `competency` atau `okr` dan `focus_label`, fokus dikirim ke AI sebagai `context.focus = { kind, label }` (label saja, bukan data orang, PM-10; label dipotong 120 karakter di prompt). Fokus OKR perlu karena di mode semua karyawan (B5 R10) orang yang ditugaskan belum tentu punya target meleset di `triggers` (D5). Di prompt wawancara TNA, bila `triggers` kosong **dan** ada fokus, blok target diganti topik, dan judul serta tujuan prompt mengikuti fokus (D10): kompetensi menjadi "Topik wawancara: gap kompetensi \"<label>\" (skor asesmen karyawan ini di bawah target jabatan). Tidak ada target kerja yang dibahas.", OKR menjadi "Topik wawancara: target kerja \"<label>\" yang meleset di tim karyawan ini (karyawan ini sendiri tidak tercatat meleset)."; baris aturan "Mulai dari target yang meleset" diganti "Mulai dari pengalaman kerja terakhir terkait topik, gali bagian yang sulit, ketersediaan panduan/alat, dan kesempatan praktik". Bila `triggers` berisi, blok target lama dipakai. Tanpa fokus, teks lama tidak berubah. Prompt analisis tidak diubah (daftar kompetensi sudah dikirim; temuan ditautkan lewat kode K). Stub: bila ada fokus dan tidak ada target, pertanyaan pembuka menyebut label lalu satu pertanyaan penutup yang sama dengan sekarang. `stores.interviews.get` ikut membaca `duration_minutes`, `focus_kind`, `focus_label` (kolom B5).
- **A11 Footer audit dan stepper.** `GET /sessions/:id` untuk orang yang diwawancarai menambah: `step`, `summaryState`, `answerCount`, `questionLimit` (batas atas; AI boleh selesai lebih awal, jadi web menulis "Pertanyaan n, paling banyak N"), `restartCount`, `restartsLeft`, `summaryAt`, `summaryConfirmedAt`, `aiLabel` (teks tetap `ELGOS-AI`; ID model Bedrock tidak dikirim ke karyawan), dan `sessionCode` (8 karakter pertama id, huruf besar). Peran lain hanya mendapat tambahan `step` dan `summaryState`. Respons disusun dari **daftar putih** per peran, bukan `...s`; `stores.interviews.get` tidak pernah memuat `summary_findings` atau `summary_note` (hanya `getSummary`/`summaryForAnalysis` yang memuatnya).
- **A12 Ringkasan adalah data pribadi karyawan.** `GET /sessions/:id/summary` hanya untuk orang yang diwawancarai (peran lain 403 `SUMMARY_PRIVATE`); HR melihat temuan lewat antrean review setelah dikirim. `GET` tetap 200 sesudah konfirmasi: karyawan boleh membaca lagi apa yang ia kirim, dan salinan terenkripsi itu tetap di baris sesi sampai sesi dihapus (`[⏳ DITERIMA]` retensi mengikuti sesi; bila HR mengubah temuan, salinan ini adalah versi yang dilihat karyawan). Pembacaan (GET, dan POST yang mengembalikan isi) dicatat `audit.readIndividual` dengan resource `tna.interview_summary`. Ekspor data karyawan (PR #11) tidak diubah di B6: temuan terkonfirmasi muncul di ekspor setelah direview HR seperti temuan lain. `[⏳ DITERIMA]` ringkasan yang belum dikonfirmasi tidak ikut ekspor; dicatat di PR.
- **A13 Hapus data karyawan (PR #11).** `summary_findings` berada di baris sesi, jadi ikut terhapus saat sesi/karyawan dihapus (`ON DELETE CASCADE` yang ada). Tidak ada tabel baru.

## 5. Migrasi (blok 06)

`20261119000600-ringkasan-wawancara.js`, raw SQL dengan `down`:

```sql
ALTER TABLE lna_interview_sessions
  ADD COLUMN summary_findings jsonb,          -- hasil analyzeTna penilaian pertama, terenkripsi (encryptJson)
  ADD COLUMN summary_at timestamptz,
  ADD COLUMN summary_confirmed_at timestamptz,
  ADD COLUMN summary_disputed boolean NOT NULL DEFAULT false,
  ADD COLUMN summary_note text,               -- catatan karyawan (A5b), terenkripsi
  ADD COLUMN restart_count smallint NOT NULL DEFAULT 0;
```

`down` menghapus keenam kolom.

## 6. Endpoint

Di bawah `/api/tna/sessions` (router `interviewRouter`). Rute baru (tiga baris pertama dan `/restart`, termasuk `GET /summary`) butuh flag `tna.interview_summary`; rute bertanda "ada" tidak dijaga flag ini. Semua respons sukses dibungkus `{ data: … }`, galat `{ error: { code, message } }`.

| Metode | Path | Siapa | Hasil (`data`) |
| --- | --- | --- | --- |
| POST | `/:id/summary` | karyawan itu | 201 (baru) / 200 (sudah ada) `{ findings, createdAt, confirmedAt, state }` (A3) |
| GET | `/:id/summary` | karyawan itu | 200 bentuk yang sama; 404 bila belum ada |
| POST | `/:id/summary/confirm` | karyawan itu | body `{ accurate?: boolean, note?: string }`; 202 `{ status: 'completed', analysis: { status }, summaryState }` |
| POST | `/:id/restart` | karyawan itu | 200 `{ status: 'scheduled', restartCount, restartsLeft }` |
| POST | `/:id/turns` (ada) | karyawan itu | + 409 `SUMMARY_PENDING` dan `INVALID_STATE` (A4); kuota mengikuti A10 |
| POST | `/:id/complete` (ada) | karyawan itu, atau HR/Admin ETA untuk sesi orang lain | + 409 `SUMMARY_REQUIRED` untuk orang yang diwawancarai saat flag nyala (TNA, A7) |
| GET | `/:id` (ada) | dalam cakupan | + kolom A11 |

Urutan pemeriksaan untuk rute baru: flag (403) → sesi dalam cakupan (404) → orang yang diwawancarai (403) → keadaan sesi (409) → body (400). Pengecualian: `/confirm` memeriksa body sebelum `SUMMARY_MISSING`.

### Kode galat

| Keadaan | Status | Kode |
| --- | --- | --- |
| Flag mati | 403 | `FEATURE_DISABLED` |
| Bukan orang yang diwawancarai (dalam cakupan) | 403 | `SUMMARY_PRIVATE` untuk `/summary`; `NOT_INTERVIEWEE` untuk `/confirm` dan `/restart` |
| Sesi di luar cakupan atau tenant lain | 404 | `NOT_FOUND` |
| `/summary` (POST), `/restart`, `/confirm` pada sesi yang bukan `in_progress`, atau kalah balapan | 409 | `INVALID_STATE` |
| `/summary` (POST) tanpa satu pun jawaban | 400 | `BAD_REQUEST` |
| `GET /summary` atau `/confirm` saat ringkasan belum ada | 404 / 409 | `NOT_FOUND` / `SUMMARY_MISSING` |
| `/confirm` dengan `accurate` bukan boolean, atau `accurate: false` tanpa `note` 10-1000 karakter | 400 | `BAD_REQUEST` |
| `/turns` saat ringkasan ada | 409 | `SUMMARY_PENDING` |
| `/turns` yang kalah balapan dengan `/summary` atau `/restart` (A4) | 409 | `INVALID_STATE` |
| `/complete` oleh orang yang diwawancarai (flag nyala, TNA) | 409 | `SUMMARY_REQUIRED` |
| `/restart` ketiga | 409 | `RESTART_LIMIT` |
| `/restart` saat undangan lewat | 409 | `INVITATION_EXPIRED` |
| AI gagal | seperti `/turns` sekarang (`AiError`) | |

## 7. Susunan kode

- `apps/api/src/modules/interviews/summary.js` (Buat): fungsi murni `stepOf(session, now)` (enam nilai), `summaryStateOf(session)` (lima nilai), `questionLimit(session, aiConfig)`, `publicSummary(findings)`, `sessionView(session, { interviewee })` dengan daftar putih `SHARED_FIELDS` (A11), `parseConfirmation(body)`, `MAX_RESTARTS = 2`.
- `apps/api/src/modules/interviews/index.js`: endpoint baru; `interviewRouter` menerima `flags`; `nextQuestion` memakai `questionLimit`.
- `apps/api/src/modules/interviews/ai-calls.js`: `aiContext` menambah `focus`.
- `apps/api/src/modules/interviews/analysis.js`: A8.
- `apps/api/src/ai/prompts.js`, `stub-provider.js`: baris topik fokus kompetensi.
- `apps/api/src/db/lna-stores.js`: `interviews.saveSummary` (transaksi, kunci baris, syarat jumlah giliran), `getSummary`, `summaryForAnalysis`, `confirmSummary` (transaksi + job), `restart` (kunci baris), kolom baru di `get` (tanpa isi ringkasan); `interviews.addTurn(tenantId, sessionId, speaker, text, opts)` dengan `opts.guard = { restartCount }` dan `FOR SHARE` (A4). Paket suara B19 menambah opsi `mode` sendiri saat membutuhkannya (S3); `dna.existingCompetencyIds`; `tna.reviewQueue`/`getReviewItem` + `summaryState`, `summaryNote`.
- `apps/api/src/core/flags/index.js`: flag baru.
- `apps/api/src/modules/tna/index.js`: meneruskan `flags` ke `interviewRouter`.

## 8. Test yang ditulis lebih dulu

Unit (`apps/api/tests/unit/interview-summary.test.js`): `stepOf` untuk keenam nilai; `summaryStateOf` untuk kelima nilai; `questionLimit` (15, 30, kosong, batas config lebih kecil); `publicSummary` memuat `detail` (A3 v2) tetapi tidak membocorkan `competencyId`, `performanceRecordId`; prompt TNA memuat topik fokus dan tidak memuat nama orang.

Integrasi (`apps/api/tests/integration/interview-summary.test.js`, Postgres lewat `DATABASE_URL`, dilewati bila tidak ada; AI stub yang menghitung panggilan):
- flag mati: `/summary`, `/confirm`, `/restart` → 403 `FEATURE_DISABLED`; `/complete` lama tetap 202;
- alur utuh flag nyala: persetujuan → jawaban → ringkasan (201, `summary_findings` di DB tidak terbaca polos) → `/turns` 409 → konfirmasi 202 → setelah job selesai, antrean review HR berisi temuan dengan judul yang sama persis dengan ringkasan, `summaryState = 'confirmed'`, dan `analyzeTna` dipanggil tepat dua kali untuk sesi itu;
- `/summary` kedua kali mengembalikan isi sama tanpa panggilan AI baru;
- AI gagal saat ringkasan: tidak ada yang tersimpan, bisa diulang;
- privasi: atasan, HR, Admin ETA → 403 untuk `/summary` (GET dan POST), `/confirm`, `/restart`; karyawan lain 404; tenant lain 404;
- `/complete` oleh karyawan 409 `SUMMARY_REQUIRED`; oleh HR 202 dan temuan bertanda `summaryState = 'unchecked'`;
- ulangi: giliran terhapus, status `scheduled`, persetujuan harus diulang, audit `delete` tercatat, ketiga kalinya 409 `RESTART_LIMIT`;
- dua konfirmasi bersamaan: satu 202, satu 409, satu job;
- durasi 15 menit: pertanyaan berhenti di 5; fokus kompetensi muncul di pertanyaan pembuka stub;
- `GET /sessions/:id`: kolom A11 untuk karyawan, tanpa `answerCount` untuk HR.

Tambahan dari review:
- AI berskrip (pola `scriptedAi` di `ai-review.test.js`) dengan penilaian kedua yang **berbeda**: judul, rincian, dan urutan di antrean HR mengikuti ringkasan; temuan yang hanya ada di penilaian kedua tidak tersimpan; keyakinan turun untuk yang tidak sepakat;
- balapan: dua `POST /summary` bersamaan → satu panggilan tersimpan, isi yang dikembalikan sama; `/turns` yang AI-nya masih berjalan saat `/summary` selesai → 409 dan giliran tidak tersimpan; `/summary` yang AI-nya masih berjalan saat `/restart` → hasil dibuang; 
- `/restart` saat undangan lewat → 409 `INVITATION_EXPIRED` dan giliran utuh;
- kirim dengan catatan: `accurate: false` tanpa `note` 400; dengan `note` 202, antrean HR `summaryState = 'disputed'` dan `summaryNote` terbaca, kolom di DB tidak polos;
- HR sebagai orang yang diwawancarai: `/complete` 409 `SUMMARY_REQUIRED`;
- `GET /sessions/:id` oleh HR tidak memuat `summaryFindings`, `summaryNote`, `restartCount`, `answerCount`;
- kompetensi dihapus di antara ringkasan dan konfirmasi: job selesai, temuan tersimpan dengan `competencyId` null;
- flag dimatikan setelah ringkasan dibuat: `/turns` tetap 409, `/complete` oleh karyawan 202, `summaryState = 'unchecked'`;
- sesi DNA: rute `/summary` tidak ada (404);
- jawaban yang masuk saat AI meringkas (D6): ringkasan tidak tersimpan (409) dan bisa dibuat ulang;
- balapan di tingkat baris (egm Stage 7 D-M4): `addTurn` berpenjaga yang menunggu kunci `/restart` tidak menyisip setelah commit; `saveSummary` yang menunggu giliran baru tidak tersimpan.

Test lama (`ai-review`, `poc-dna-tna`, `privacy-audit`, `business-rules-live`) harus tetap lulus tanpa diubah, karena flag bawaan mati.

## 9. Keputusan default dan asumsi

- PO-6 A, PD-14 ★A, PM-9 A dipertahankan.
- `[⚠️ BELUM TERVERIFIKASI]` A6 batas ulang 2 kali.
- `[⚠️ BELUM TERVERIFIKASI]` A10 15 menit = 5 pertanyaan.
- `[⏳ DITERIMA]` A12 ringkasan belum dikonfirmasi tidak ikut ekspor.
- `[⏳ DITERIMA]` Teks persetujuan di mockup ("±10 menit", empat butir) berbeda dari teks legal v1.0 (`tna-consent-id-v1.0`). B6 tidak mengubah teks atau versinya; teks final menunggu legal (Fasha) dan ditangani bersama layar.
- `[⏳ DITERIMA]` Kualitas ringkasan dengan LLM sungguhan baru teruji di QA malam (B18); test di sini memakai stub dan fixture Bedrock.

- `[⏳ DITERIMA]` A5b "Kirim dengan catatan" tidak ada di mockup; diangkat ke user di PR.
- `[⏳ DITERIMA]` Sesi tanpa temuan: `findings` kosong, HR tidak mendapat butir di antrean (hanya status sesi selesai dan hasil job 0 temuan). Mockup menampilkan satu butir "Perlu ditinjau HR"; ditunda ke B7/layar.
- `[⏳ DITERIMA]` Teks email pengingat belum menyebut langkah ringkasan (durasinya sudah mengikuti `duration_minutes`, B5 R13). Sesi yang menggantung di langkah ringkasan setelah tenggat ditutup HR lewat `/complete` (A7).
- `[⏳ DITERIMA]` Layar B6 tidak masuk commit backend ini karena menunggu PR B0 (aturan bersama 1). Keputusan layar yang sudah diambil: label "Pertanyaan n, paling banyak N"; tombol "Lihat ringkasan temuan" muncul setelah AI menyatakan selesai, dan sebagai tautan sekunder setelah minimal satu jawaban; baris "Topik: <focusLabel>" bila ada.

## 10. Daftar perubahan file

Semua Ubah kecuali yang bertanda Buat. Andrian wajib mereview migrasi, `lna-stores.js`, dan `modules/interviews/index.js` (kode bersama DNA/TNA).

- [x] Buat `apps/api/migrations/20261119000600-ringkasan-wawancara.js`
- [x] `apps/api/src/core/flags/index.js`
- [x] Buat `apps/api/src/modules/interviews/summary.js`
- [x] `apps/api/src/modules/interviews/index.js`
- [x] `apps/api/src/modules/interviews/ai-calls.js`
- [x] `apps/api/src/modules/interviews/analysis.js`
- [x] `apps/api/src/ai/prompts.js`
- [x] `apps/api/src/ai/stub-provider.js`
- [x] `apps/api/src/db/lna-stores.js`
- [x] `apps/api/src/modules/tna/index.js`
- [x] Buat `apps/api/tests/unit/interview-summary.test.js`
- [x] Buat `apps/api/tests/integration/interview-summary.test.js`
- [x] `docs/ewi/ai-teks.md` (alur ringkasan)
- [x] Layar web `apps/web/src/screens/b6-iv/` (bagian 15) dan `apps/web/e2e/iv.spec.ts`

## 11. Review egm atas spek (19 Nov)

Reviewer: subagent baru tanpa konteks percakapan, 20 temuan. Triase:

| # | Temuan | Keputusan |
| --- | --- | --- |
| 1 | HR menerima `detail` yang tidak dilihat karyawan | **Perbaiki**: `detail` ditampilkan ke karyawan (A3, 4.1) |
| 2 | `/summary`, `/turns`, `/restart` tanpa penjaga bersyarat | **Perbaiki**: A2, A4, A6 + test balapan |
| 3 | Ulangi setelah tenggat mengunci karyawan | **Perbaiki**: A6 menolak sebelum menghapus |
| 4 | Jatah ulang habis, tidak ada jalan keluar jujur | **Perbaiki** dengan A5b, dan **diangkat ke user** (tidak ada di mockup) |
| 5 | A7 membedakan lewat peran | **Perbaiki**: lewat `intervieweeId` |
| 6 | Keyakinan karyawan ≠ keyakinan HR, `null` | **Perbaiki sebagian**: angka tetap tampil (mockup) tetapi diberi kata "sementara"; `null` diatur |
| 7 | Klaim "tetap dua panggilan", `pass` diabaikan | **Perbaiki** kalimat 4.1 + test AI berskrip |
| 8 | Konfirmasi tidak atomik | **Perbaiki**: `confirmSummary` satu transaksi |
| 9 | Kolom baru bocor lewat `...s` | **Perbaiki**: daftar putih A11 |
| 10 | Router dipakai DNA; flag berubah di tengah sesi | **Perbaiki**: A1 |
| 11 | Prompt fokus bertabrakan; test durasi dengan stub | **Perbaiki**: A10; test durasi memakai 5+ target meleset |
| 12 | Boolean `summaryConfirmed` ambigu | **Perbaiki**: `summaryState` (kini lima nilai, A9) |
| 13 | Spek hanya backend | **Tunda** dengan alasan: layar wajib di atas PR B0 yang belum terbuka; keputusan layar dicatat di bagian 9 |
| 14 | Kode galat belum lengkap, ID model ke karyawan | **Perbaiki**: tabel kode galat, `aiLabel` |
| 15 | Urutan men-null-kan ID | **Perbaiki**: A8 |
| 16 | Retensi `summary_findings` | **Tolak** pengosongan: karyawan berhak membaca lagi apa yang ia kirim; retensi dicatat ⏳ (A12) |
| 17 | Hapus giliran harus lewat sesi | **Perbaiki**: A6 |
| 18 | `step` tidak lengkap | **Perbaiki**: `expired`, `closed` |
| 19 | Teks pengingat | **Tunda** (⏳ bagian 9) |
| 20 | Pemakaian ulang oleh B10 | **Tolak** perluasan: di luar cakupan B6; batasnya ditulis di A1 |

Permintaan thread suara (B19): `addTurn` satu pintu dengan `opts.mode` diterima (bagian 7); slot input di komponen Percakapan dicatat untuk layar.

## 12. Review diff dan code review (19 Nov)

Review diff oleh subagent baru dan `mattpocock-skills:code-review` sumbu Standards. Triase untuk B6:

| # | Temuan | Keputusan |
| --- | --- | --- |
| D4 | `GET /sessions/:id` masih `...s` dikurangi kolom, bukan daftar putih (A11) | **Perbaiki**: `sessionView` menyalin kolom dari daftar putih `SHARED_FIELDS`; kolom baru di store tidak ikut otomatis. |
| D5 | Sesi OKR mode semua karyawan tidak tahu target yang dibahas | **Perbaiki**: `aiContext` membawa fokus OKR (label saja); prompt menulis "Topik wawancara: target kerja ...". |
| D6 | Jawaban yang masuk selama AI meringkas hilang dari ringkasan | **Perbaiki**: `saveSummary` mensyaratkan jumlah giliran sama dengan saat transkrip dibaca; bila tidak, 409 dan ringkasan bisa dibuat ulang. |
| D7 | Giliran AI ditolak penjaga menghasilkan `{ question: null, done: false }` | **Perbaiki**: 409 `INVALID_STATE`. Tanpa test otomatis karena jendelanya di antara dua query; dicakup penjaga yang sama dengan D6. |
| D10 | Judul blok target tetap dipakai saat ada fokus; label tidak dipotong | **Perbaiki**: judul dan tujuan prompt mengikuti fokus; label `clip(…, 120)`. |
| D12 | Judul "## Prompt" hilang di `docs/ewi/ai-teks.md` | **Perbaiki**. |
| S3 | Opsi `mode` untuk suara B19 diteruskan tanpa dipakai | **Perbaiki**: dihapus (4851068); B19 menambahkannya saat dibutuhkan. |
| S4 | Logika khusus TNA di router wawancara bersama (Divergent Change) | **Tolak dengan alasan**: DNA belum punya langkah ringkasan; dipisah bila DNA memerlukannya. |

## 13. Alternatif yang ditolak dan risiko

- **Dua penilaian sekaligus di `/summary`** (vs penilaian kedua di job setelah konfirmasi): keyakinan yang dilihat karyawan akan final, tetapi tiap ulangi menggandakan biaya dan waktu tunggu karyawan. Ditolak.
- **Kolom `revision` untuk konkurensi** (vs penjaga `restart_count` + jumlah giliran + kunci baris): menambah kolom untuk masalah yang sudah ditutup kunci baris.
- **Outbox audit dan penyapu sesi menggantung**: kegagalan audit langka (pola yang sama dengan `/complete`); sesi menggantung ditutup HR (A7) atau diperpanjang (`/extend`).
- **Bila user menolak batas ulangi 2 dan A5b** (R-2 di bagian 14): yang dihapus adalah `RESTART_LIMIT`, `MAX_RESTARTS`, cabang `accurate: false` di `parseConfirmation`, kolom `summary_disputed`/`summary_note` tetap (migrasi tidak diubah), dan nilai `disputed` tidak pernah muncul.

Risiko yang diterima: kualitas ringkasan dengan LLM sungguhan baru teruji di QA malam (B18); angka keyakinan karyawan bisa turun di sisi HR (ditandai "sementara", A3); biaya token tiap ulangi (`restart_count` dicatat, laporan biaya mingguan PO-10).

## 14. egm-review dengan plugin (19 Nov)

Dijalankan ulang dengan plugin egm (`egm-review` tahap 5–9) karena review di bagian 11 manual. Reviewer ikan mas dipanggil langsung sebagai agent `egm:egm-*` dengan konteks hanya dokumen dan file yang dirujuk. Laporan: `/mnt/project-files/elgos-eksekusi/egm-b5-b6/b6/`. Triase (`egm-resolve`):

| Tema (temuan) | Keputusan |
| --- | --- |
| Badan normatif basi terhadap bagian 12 dan kode: fokus OKR, clip 120, syarat jumlah giliran, `opts.mode`, `stepOf` enam nilai, `summaryState` lima nilai, catatan "saat membangun", status v2 (Stage 6; Stage 7 structural, style; Stage 8 #1; Stage 9) | **Perbaiki**: A2, A4, A9, A10, bagian 7, 8, status v3 |
| `addTurn` `INSERT … SELECT` tanpa kunci baris bisa menyisip setelah ulangi commit (Stage 7 D-M4, diverifikasi Stage 8 #2) | **Perbaiki** di kode: `FOR SHARE OF s` di penjaga `addTurn`; `saveSummary` mengunci baris `FOR UPDATE` dan menghitung giliran di statement baru. Test merah lebih dulu (`interview-summary.test.js`, "balapan di tingkat baris"). Ditolak: kolom `revision` |
| Batas ulangi 2 + A5b "Kirim dengan catatan" (Stage 5; Stage 7 D-M3; Stage 8 #3) | **Eskalasi ke user** sebagai satu pilihan (R-2); bagian 13 menulis apa yang dihapus bila ditolak. Ditolak: "Lengkapi jawaban" (Inventive #3), model biaya numerik |
| Tidak ada alternatif, risiko, non-goals (Stage 7 D-B1, S-B1) | **Perbaiki** ringkas sesuai Stage 8 #4: bagian 1 (Di luar cakupan) dan 13 |
| Bentuk respons, amplop, `GET /summary` dijaga flag, siapa yang boleh `/complete`, `/turns` 409, `accurate` bukan boolean, urutan pemeriksaan (Stage 6; Stage 9 IR, CD) | **Perbaiki**: bagian 6 |
| Kalimat biaya di 4.1 hanya menghitung `analyzeTna` (Stage 8 #5) | **Perbaiki** |
| Cabang cadangan `analysis.js` untuk metode store yang selalu ada, salah satunya bisa melewati penjaga FK A8 (Stage 8 #6) | **Perbaiki** di kode: cabang dihapus; komentar `mode` basi di `index.js` dihapus |
| "Undangan" di prosa, label "Perlu ditinjau HR" per temuan (Stage 8 #7) | **Catat** sebagai celah glosarium untuk `mattpocock-skills:domain-modeling` saat layar dibangun |
| Inventive #1 (dua penilaian di `/summary`), #2 (outbox), #4 (penyapu), #5 (`revision`), D-M6 (ulangi dekat tenggat) | **Tolak** (bagian 13; `/extend` sudah ada untuk D-M6) |
| Logika khusus TNA di router bersama (S4 lama) | **Tetap ditolak**: dipisah bila DNA memerlukan langkah ringkasan |

Keputusan user yang masih terbuka:

- **R-2**: batas ulangi 2 kali bersama tombol "Kirim dengan catatan" (A5b, tidak ada di mockup). Rekomendasi: pertahankan keduanya (biaya token terbatas, karyawan tetap punya jalan keluar jujur).

Cek drift (`egm-drift-report`, laporan di folder yang sama) dan code review (`mattpocock-skills:code-review`) di PR susulan:

| Temuan | Keputusan |
| --- | --- |
| Audit `create` ringkasan tidak tertulis di spek; komentar fokus masih "kompetensi saja" | **Perbaiki** spek (A2) dan komentar `ai-calls.js`, `prompts.js`, `stub-provider.js` |
| Prompt wawancara memeriksa `direction === 'lower_better'`, padahal nilai tersimpan `lower`, jadi "(makin kecil makin baik)" tidak pernah muncul | **Perbaiki** di kode, test merah lebih dulu (`tests/unit/interview-summary.test.js`) |
| Test balapan memakai jeda 150 ms (Standards) | **Perbaiki**: menunggu backend yang antre kunci lewat `pg_stat_activity` |
| SQL ulangi disalin di test (Standards, Spec) | **Terima**: kunci harus dipegang selama `addTurn` menunggu; komentar test menjelaskan |
| `saveSummary` bergantung pada READ COMMITTED | **Perbaiki**: komentar di store |

## 15. Kontrak layar web (B6, rute `iv`)

Ditulis sebelum PR layar. Dasar: B0 bagian 4 dan 5.3, mockup layar `iv`. Folder `apps/web/src/screens/b6-iv/`.

**Rute:**

| Nama | Path | `meta` |
| --- | --- | --- |
| `iv` | `/iv` | `views: ['hr','atasan','karyawan','admin','super']`, `submodule: 'tna'`, `menuKey: 'iv'`, `title: 'Wawancara akar masalah'` |
| `iv-session` | `/iv/:id` | gerbang `iv` diulang, `menuKey: 'iv'`, `title: 'Wawancara akar masalah'` |
| `iv-lama` | `/m/tna/sessions/:id` | `redirect` ke `iv-session` dengan `id` yang sama |

- Tanpa `meta.flag`: alur lama (tanpa langkah ringkasan) tetap berjalan saat `tna.interview_summary` mati; flag diperiksa di layar.
- `screens/legacy-interview/` dipersempit ke DNA: path `/m/:key(dna)/sessions/:id`, nama `interview` tetap. `views/InterviewView.vue` tetap untuk DNA; teks persetujuan TNA dipindah ke `screens/b6-iv/PersetujuanTna.vue` dan tidak lagi ada di `InterviewView`.

**Layar `iv`** (`IvListView.vue`): `<h1>` "Wawancara akar masalah"; daftar sesi TNA milik pengguna (`GET /tna/sessions`, disaring `intervieweeId === user.id`): Topik (`focusLabel`, atau "Target kerja yang belum tercapai"), Durasi ("n menit" atau "sekitar 30 menit"), Tenggat WIB, status dari `status` + `inviteExpiresAt`: "Belum mulai" (`scheduled`), "Berakhir" (`scheduled` lewat tenggat), "Berjalan" (`in_progress`), "Selesai" (`completed`), "Dibatalkan" (`abandoned`). Daftar tidak membawa kolom ringkasan (B5 R14), jadi status "menunggu konfirmasi" hanya tampil di layar sesi. Sesi terbuka (`data-testid="iv-open"`) di atas, riwayat (`iv-history`) di bawah. Kosong: "Belum ada wawancara untuk Anda." `[⏳ DITERIMA]` daftar memuat semua sesi dalam cakupan pemanggil lalu disaring di peramban; untuk HR dan atasan isinya sama dengan yang sudah mereka lihat di Training Needs.

**Layar `iv-session`** (`IvSessionView.vue`, `GET /tna/sessions/:id`):
- Bila `transcriptVisible === false` (bukan orang yang diwawancarai): hanya catatan `data-testid="transcript-private"` "Percakapan wawancara hanya bisa dibaca karyawan yang bersangkutan." dan status `step`.
- `UiStepper` `label="Langkah wawancara"`, lima langkah dengan kunci `undangan`, `persetujuan`, `wawancara`, `ringkasan`, `selesai`; `current` dari `step` (`expired` → `undangan`, `consent` → `persetujuan`, `chat` → `wawancara`, `summary` → `ringkasan`, `done`/`closed` → `selesai`). Bila respons tanpa `step` (mock lama), `step` diturunkan dari `status` seperti `stepOf`. Bila flag ringkasan mati, langkah Ringkasan tidak ditampilkan, kecuali sesi sudah di `step = summary`.
- Baris "Topik: <focusLabel>" bila ada.
- **Persetujuan** (`PersetujuanTna.vue`): teks legal v1.0 (sama dengan teks lama), satu checkbox, tombol "Lanjut ke wawancara". Menekan tombol tanpa centang menampilkan `UiErrorSummary` "Ada masalah" dengan "Centang persetujuan untuk melanjutkan" dan fokus ke checkbox (mockup). Mengirim `consentVersion` dari `consentVersionRequired`.
- **Wawancara** (`PercakapanWawancara.vue`): label "Pertanyaan n, paling banyak N" (`n` = jumlah giliran AI, `N` = `questionLimit`), giliran AI dan karyawan (`data-testid="turn-ai"`/`turn-human`), kotak jawaban + "Kirim". Slot bernama `masukan-suara` di samping kotak jawaban untuk B19 (kosong di B6). Jawaban gagal dikembalikan ke kotak teks (perilaku lama).
  - "AI sudah selesai bertanya" = `done: true` dari `/turns`, atau setelah muat ulang: giliran terakhir milik karyawan (server tidak memberi pertanyaan lanjutan) atau jumlah giliran AI ≥ `questionLimit`. Saat itu kotak jawaban disembunyikan.
  - Flag nyala: "Lihat ringkasan temuan" (tombol utama) setelah AI selesai; sebelum itu tombol sekunder setelah minimal satu jawaban. Saat `POST /summary` berjalan: tombol nonaktif dan `UiStatus` "AI sedang menyusun ringkasan…"; bila gagal, pesan galat API di `UiErrorSummary` dan tombol bisa ditekan lagi. 409 `SUMMARY_PENDING`/`INVALID_STATE` memuat ulang sesi.
  - Flag mati: tombol lama "Selesai dan kirim"/"Akhiri wawancara" (`/complete`).
- **Ringkasan**: `<h2>` "Ringkasan temuan AI", kalimat mockup "Periksa apakah ringkasan ini sesuai dengan yang Anda maksud sebelum dikirim ke HR."; tiap temuan: judul, rincian, chip kategori ("Training Needs"/"Improvement Needs"), "Keyakinan AI sementara: n%" (tanpa baris bila `null`), chip "Perlu ditinjau HR" bila keyakinan < 0,5 atau `null`. Kosong: "Tidak ditemukan hambatan yang jelas." Tombol "Sesuai, kirim ke HR" dan "Ulangi wawancara" (dengan sisa "n kali lagi"; dinonaktifkan bila `restartsLeft = 0`). Bila `restartsLeft = 0`: tombol "Kirim dengan catatan" membuka isian "Catatan untuk HR" (10-1000 karakter) dan tombol "Kirim ringkasan dengan catatan" (R-2; disembunyikan bila user menolak A5b). Galat `/restart` (mis. 409 `INVITATION_EXPIRED`) dan `/confirm` ditampilkan apa adanya.
- **Flag dimatikan saat sesi di langkah ringkasan** (A1): `GET /summary` dan `/confirm` ditolak 403, jadi layar menampilkan catatan "Langkah ringkasan sedang dinonaktifkan. Kirim wawancara ke HR tanpa ringkasan." dan tombol "Selesai dan kirim" (`/complete`).
- **Selesai** (`step = done`): `summaryState` `confirmed`/`disputed` → "Ringkasan sudah dikirim ke HR untuk ditinjau."; selain itu "Wawancara ini sudah selesai." (`unchecked` juga mencakup alur lama, jadi tidak ditulis "ditutup HR"). `step = closed` → "Sesi ini dibatalkan."
- **Undangan berakhir** (`step = expired`, stepper di Undangan): "Undangan sudah berakhir. Minta HR memperpanjang undangan Anda."
- Footer `UiAuditLine`: `sessionCode` · `aiLabel` · "log audit: persetujuan tercatat · n jawaban" (`answerCount`).

**Klien API** `screens/b6-iv/api.ts`: `session`, `consent`, `answer`, `complete`, `summary` (POST), `getSummary`, `confirm`, `restart`.

Perubahan pada `e2e/poc-dna-tna.spec.ts` (test learner): tombol persetujuan menjadi "Lanjut ke wawancara" yang selalu aktif (mockup), dan setelah "Selesai dan kirim" (flag mati) layar kembali ke `/iv`. Test HR `transcript-private` tidak diubah (dialihkan).

**Test e2e lebih dulu** (`apps/web/e2e/iv.spec.ts`, `page.route`): persetujuan tanpa centang → ringkasan galat; alur flag nyala: persetujuan → jawaban → "Lihat ringkasan temuan" → temuan dengan "Keyakinan AI sementara" → "Sesuai, kirim ke HR" mengirim `{}` → langkah Selesai; "Ulangi wawancara" kembali ke Persetujuan; jatah habis → "Kirim dengan catatan" mengirim `{ accurate: false, note }`; flag mati → tombol lama `/complete`; HR membuka sesi orang lain → `transcript-private`; `/m/tna/sessions/s1` dialihkan ke `/iv/s1`; daftar `/iv` menampilkan topik dan tenggat.

### 15.1 Review kontrak layar (19 Nov)

Ikan mas yang sama dengan B5 bagian 16.1. Triase:

| Temuan | Keputusan |
| --- | --- |
| Persetujuan dan URL sesudah kirim mematahkan `poc-dna-tna.spec.ts` | **Perbaiki**: test learner diubah dan perubahannya ditulis di bagian 15 (mockup menang atas POC) |
| Kunci stepper, `step` hilang di mock, `expired` vs Selesai | **Perbaiki**: kunci langkah, turunan dari `status`, panel `expired` sendiri |
| "Menunggu konfirmasi ringkasan" di daftar tidak punya data | **Perbaiki**: label daftar hanya dari `status` + tenggat |
| "Sesi ditutup HR" salah untuk alur lama | **Perbaiki**: "Wawancara ini sudah selesai." |
| Keadaan hilang: menunggu/gagal `/summary`, flag dimatikan di langkah ringkasan, `INVITATION_EXPIRED`, AI selesai setelah muat ulang | **Perbaiki**: semuanya ditulis di bagian 15 |
| Daftar `/iv` memuat semua sesi dalam cakupan lalu disaring di peramban | **Terima** (⏳): isinya sama dengan yang sudah dilihat HR/atasan |

### 15.2 Code review layar (`mattpocock-skills:code-review`, 19 Nov)

Triase temuan sumbu Standards dan Spec untuk layar `iv`/`iv-session` (tabel lengkap untuk kolom API di B5 bagian 16.2):

| Sumbu | Temuan | Keputusan |
| --- | --- | --- |
| Spec + Standards | Galat "Tulis catatan 10-1000 karakter" tidak pernah tampil (`run()` hanya menampilkan `ApiError`), field tidak ditandai | **Perbaiki**: validasi di luar `run()`, galat menaut ke `iv-note`, `UiField :error` memberi `aria-invalid` (e2e baru) |
| Spec | Catatan transkrip privat menambah kalimat dan tidak menampilkan status `step` | **Perbaiki**: teks persis spek + "Status: <langkah>" |
| Spec | `GET /summary` gagal membuat layar kosong | **Perbaiki**: langkah sesi tetap tampil bersama galat (e2e baru) |
| Standards | `id` rute dibaca sekali; `restartsLeft` kosong mengunci pengguna; ringkasan diambil dua kali | **Perbaiki**: `watch(id)`, `restartsLeft ?? 0`, `load({ keepSummary })` |
| Standards | Fokus ke kotak centang memakai `setTimeout` dan merebut fokus dari `UiErrorSummary` | **Perbaiki**: ringkasan galat mengambil fokus, tautannya ke `iv-consent` (e2e diperbarui) |
| Standards | Percakapan tanpa `role="log"`; `sr-only` Tailwind; chip mentah; `list-disc` | **Perbaiki**: `role="log" aria-live="polite"`, `el-sr-only`, `UiChip`, `el-input` |
| Standards | `iv`/`iv-session` memakai lima tampilan, sedangkan menu `iv` hanya `karyawan` (B0 5.3 aturan 1) | **Tolak** untuk sekarang: brief koordinator meminta lima tampilan sampai B8, B11, B12 terpasang (sama dengan peralihan B0 aturan 6); dipersempit saat itu |
| Spec | Baris riwayat hanya topik dan status | **Terima**: riwayat sudah lewat tenggat; durasi dan tenggat ada di sesi terbuka |
| Standards | `IvListView` menyaring `intervieweeId` di peramban | **Terima**: sudah `⏳ DITERIMA` di bagian 15 |
