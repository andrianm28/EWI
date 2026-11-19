# B6 · Wawancara akar masalah (backend)

Status: spek v2, sudah direview subagent baru dan ditriase (bagian 11). Paket B6 dari `brief-bangun-penuh-19nov.md` (thread T4). Bergantung pada B5 (`docs/designs/b5-training-needs.md`) untuk kolom penugasan (`duration_minutes`, `focus_*`). Layar (web) menyusul di atas PR B0.

## 1. Tujuan

Karyawan menjalani wawancara teks dengan AI dalam empat langkah yang jelas, dan **memeriksa sendiri ringkasan temuan sebelum dikirim ke HR**:

Undangan → Persetujuan → Wawancara → Ringkasan (Sesuai / Ulangi) → Selesai.

Hari ini (PR #15 + #16) alurnya: persetujuan → percakapan → `POST /complete` → analisis di latar → temuan draf untuk HR. Karyawan tidak pernah melihat apa yang disimpulkan AI tentang dirinya. B6 menambah langkah ringkasan di antara percakapan dan pengiriman, tanpa mengubah pengaman yang sudah ada (transkrip hanya untuk karyawan PO-6, temuan draf sampai direview HR PD-14, persetujuan berversi PM-9).

## 2. Layar mockup Pak Eji yang dicakup

`project/Main.dc.html`, layar `iv` ("Wawancara akar masalah"):

- Stepper 5 langkah: Undangan, Persetujuan, Wawancara, Ringkasan, Selesai.
- **Persetujuan**: daftar ketentuan, satu checkbox, ringkasan galat "Ada masalah: centang persetujuan untuk melanjutkan", tombol "Lanjut ke wawancara".
- **Percakapan**: "Pertanyaan n dari N", giliran AI dan karyawan, kirim jawaban, lalu "Lihat ringkasan temuan".
- **Ringkasan temuan AI**: "Periksa apakah ringkasan ini sesuai dengan yang Anda maksud sebelum dikirim ke HR." Tiap temuan: teks, "Keyakinan AI: n%", label jenis. Tombol "Sesuai, kirim ke HR" dan "Ulangi wawancara".
- **Selesai**: "Ringkasan sudah dikirim ke HR untuk ditinjau."
- **Footer audit**: kode sesi · model AI · "log audit: persetujuan tercatat · n jawaban".

Pilihan jawaban siap-klik di mockup adalah simulasi; produk memakai jawaban teks bebas.

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

Akibatnya temuan yang masuk antrean review HR **adalah temuan yang dilihat dan dikonfirmasi karyawan**: judul, rincian (`detail`), kategori, dan urutannya sama. Yang boleh berbeda hanya angka keyakinan (rata-rata dua penilaian, atau setengahnya bila penilaian kedua tidak sepakat, lihat `combineRuns`). Temuan yang hanya muncul di penilaian kedua tidak disimpan. Tidak ada operasi AI baru. Alur normal tanpa ulangan tetap dua panggilan `analyzeTna` per sesi; tiap "Ulangi wawancara" sesudah ringkasan menambah satu, dan penutupan oleh HR (A7) memakai dua penilaian sendiri.

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
- **A2 Membuat ringkasan.** `POST /sessions/:id/summary`: hanya karyawan yang diwawancarai; status harus `in_progress`; minimal satu jawaban. Bila ringkasan sudah ada, dikembalikan apa adanya tanpa memanggil model lagi (aman diulang). Penyimpanan bersyarat: `UPDATE ... WHERE status = 'in_progress' AND summary_at IS NULL AND restart_count = :yangDilihat`; permintaan yang kalah (klik ganda, atau sesi diulang saat AI masih bekerja) membuang hasilnya dan mengembalikan ringkasan pemenang, atau 409 `INVALID_STATE` bila sesi sudah berubah. Bila AI gagal, tidak ada yang tersimpan dan karyawan bisa mencoba lagi. Pemakaian token dicatat seperti panggilan lain (`callAi`).
- **A3 Isi untuk karyawan.** `{ findings: [{ title, detail, category, confidence }], createdAt, confirmedAt, state }`. `detail` (1-3 kalimat bukti dari jawaban) **ikut ditampilkan**, karena itulah yang nanti dibaca HR; karyawan tidak boleh mengonfirmasi sesuatu yang tidak dilihatnya. ID kompetensi/target tidak dikirim. `confidence` adalah angka penilaian pertama dan bisa `null`; web menulis "Keyakinan AI sementara: n%" (tanpa baris itu bila `null`) karena angka di sisi HR bisa turun setelah penilaian kedua. Kategori ditampilkan sebagai "Training Needs" / "Improvement Needs"; keyakinan < 0,5 atau `null` diberi label "Perlu ditinjau HR" (aturan tampilan, konstanta bersama di web). Bila tidak ada temuan, `findings` kosong dan web menampilkan "Tidak ditemukan hambatan yang jelas"; karyawan tetap bisa mengirim.
- **A4 Sesudah ringkasan dibuat, percakapan terkunci.** `POST /turns` → 409 `SUMMARY_PENDING` ("Ringkasan sudah dibuat. Kirim ke HR atau ulangi wawancara."). Kunci ini juga ditegakkan di store: `addTurn` hanya menyisipkan bila sesi `in_progress`, `summary_at` kosong, dan `restart_count` sama dengan yang dibaca saat permintaan dimulai; bila tidak, giliran tidak tersimpan dan jawaban 409 `INVALID_STATE` (melindungi dari `/turns` yang masih menunggu AI saat `/summary` atau `/restart` masuk). Jalan keluar: konfirmasi (A5), kirim dengan catatan (A5b), atau ulangi (A6).
- **A5 Konfirmasi.** `POST /sessions/:id/summary/confirm`: hanya karyawan itu; harus ada ringkasan yang belum dikonfirmasi. Satu fungsi store `confirmSummary` dalam **satu transaksi**: `UPDATE lna_interview_sessions SET status = 'completed', ended_at = now(), summary_confirmed_at = now(), summary_disputed = :disputed, summary_note = :note WHERE tenant_id AND id AND status = 'in_progress' AND summary_at IS NOT NULL AND summary_confirmed_at IS NULL RETURNING ...`, lalu `INSERT` job analisis. Dari dua permintaan bersamaan hanya satu yang mendapat baris; yang lain 409 `INVALID_STATE`. Sesudah transaksi: job dijalankan di latar (`analysis.kick`) dan audit `update`, `tna.interview_summary`, `{ decision: 'confirmed' | 'disputed', findings: n }`. Bila audit gagal, respons 500 tetapi sesi dan job sudah konsisten (pola yang sama dengan `/complete`). Jawaban 202 `{ status: 'completed', analysis: { status }, summaryState }` (tanpa `aiModel`/`aiUsage`: biaya dan ID model tidak untuk karyawan).
- **A5b Kirim dengan catatan "tidak sesuai".** Supaya karyawan yang jatah ulangnya habis tidak dipaksa menyatakan "sesuai": body `/summary/confirm` boleh `{ accurate: false, note }` (`note` wajib, 10-1000 karakter, terenkripsi). Temuan tetap dikirim ke HR, tetapi sesi bertanda `summaryState = 'disputed'` dan HR melihat catatan karyawan di antrean review. Web menampilkan tombol "Kirim dengan catatan" hanya saat `restartsLeft = 0`; API menerimanya kapan pun. `[⏳ DITERIMA]` Jalur ini tidak ada di mockup Pak Eji (mockup hanya "Sesuai" dan "Ulangi"); ditambahkan atas temuan review dan diangkat ke user di PR.
- **A6 Ulangi wawancara.** `POST /sessions/:id/restart`: hanya karyawan itu; status `in_progress` (sebelum atau sesudah ringkasan dibuat); paling banyak **2 kali** per sesi (`restart_count`), berikutnya 409 `RESTART_LIMIT`. Bila undangan sudah lewat (`isExpired(inviteExpiresAt)`) → 409 `INVITATION_EXPIRED` **sebelum** apa pun dihapus, karena persetujuan ulang akan ditolak dan transkrip hilang percuma; karyawan masih bisa mengirim ringkasan atau meminta HR memperpanjang. Store `restart` mengunci baris sesi (`SELECT ... FOR UPDATE`, syarat `status = 'in_progress'` dan `restart_count < 2`) dan menghapus giliran lewat sesi (`DELETE FROM lna_interview_turns t USING lna_interview_sessions s WHERE s.id = t.session_id AND s.tenant_id = :tenantId AND s.id = :id`), karena tabel giliran tidak punya `tenant_id`. `[⚠️ BELUM TERVERIFIKASI]` batas 2 adalah pilihan penulis untuk membatasi biaya token; mockup tidak membatasi. Efek, dalam satu transaksi: semua giliran sesi dihapus, `summary_findings`/`summary_at` dikosongkan, `consent_at`/`consent_version`/`started_at` dikosongkan, status kembali `scheduled`, `restart_count + 1`. Karyawan menyetujui ulang seperti di mockup (ulang kembali ke langkah Persetujuan). Tenggat undangan tidak berubah. Audit: `delete`, `tna.interview_transcript`, `{ reason: 'restart', turns: n, restartCount }`. Catatan persetujuan lama tetap ada di log audit.
- **A7 `/complete` saat flag nyala.** Untuk sesi TNA, bila pemanggil adalah orang yang diwawancarai (`req.user.id === intervieweeId`, **apa pun perannya**, karena HR dan atasan juga bisa menjadi peserta, K2) → 409 `SUMMARY_REQUIRED` ("Periksa ringkasan temuan sebelum mengirim ke HR."). HR dan Admin ETA tetap bisa menutup sesi **orang lain** lewat `/complete` (mis. karyawan berhenti di tengah); analisis lalu berjalan dua penilaian seperti sekarang, `summary_confirmed_at` tetap kosong, dan `summaryState = 'unchecked'` (A9).
- **A8 Job analisis.** `analysis.analyze` untuk TNA: bila sesi punya `summary_findings` **dan** `summary_confirmed_at`, penilaian pertama diambil dari sana (`stores.interviews.summaryForAnalysis`, tanpa memanggil model), penilaian kedua tetap memanggil `ai.analyzeTna`. Selain itu perilaku lama. Urutan: (1) gabungkan kedua penilaian dengan ID asli (`combineTnaFindings`, kunci pencocokan memakai ID); (2) ID kompetensi/target yang tidak lagi ada **di tenant itu** diset null (`stores.dna.existingCompetencyIds`, `stores.tna.performanceByIds`, keduanya berfilter `tenant_id`), supaya FK tidak menggagalkan job; (3) simpan. Job yang diulang (percobaan ke-2/3) mengulang hanya penilaian kedua.
- **A9 Tanda untuk HR.** `stores.tna.reviewQueue` dan `getReviewItem` menambah `summaryState` dan `summaryNote` dari sesi temuan. B7 yang menampilkannya; B6 hanya menyediakan data. Tidak ada transkrip untuk HR (PO-6). Nilai `summaryState` (fungsi `summaryStateOf` di `summary.js`, dipakai juga di `GET /sessions/:id`):
  - `confirmed`: `summary_confirmed_at` terisi dan tidak disengketakan;
  - `disputed`: dikirim dengan catatan tidak sesuai (A5b);
  - `unchecked`: sesi punya `summary_at` tetapi tidak dikonfirmasi (ditutup HR, atau flag dimatikan);
  - `not_applicable`: sesi tidak pernah punya ringkasan (alur lama, DNA) atau temuan tidak lagi tertaut ke sesi.
- **A10 Durasi dan topik (dari B5).** `duration_minutes` 15 → paling banyak 5 pertanyaan, 30 atau kosong → `aiConfig.maxQuestions` (bawaan 8); tidak pernah melebihi `aiConfig.maxQuestions`. `[⚠️ BELUM TERVERIFIKASI]` pemetaan menit → jumlah pertanyaan adalah perkiraan (±3 menit per pertanyaan); disetel setelah QA malam dengan LLM sungguhan. Bila sesi punya `focus_kind = 'competency'`, kompetensi fokus dikirim ke AI sebagai `context.focus = { kind, label }` (nama kompetensi saja, bukan data orang, PM-10). Di prompt wawancara TNA, bila `triggers` kosong **dan** ada fokus, blok target diganti: "Topik wawancara: gap kompetensi \"<label>\" (skor asesmen karyawan ini di bawah target jabatan). Tidak ada target kerja yang dibahas." dan baris aturan "Mulai dari target yang meleset" diganti "Mulai dari pengalaman kerja terakhir terkait topik, gali bagian yang sulit, ketersediaan panduan/alat, dan kesempatan praktik". Tanpa fokus, teks lama tidak berubah. Prompt analisis tidak diubah (daftar kompetensi sudah dikirim; temuan ditautkan lewat kode K). Stub: bila ada fokus dan tidak ada target, pertanyaan pembuka menyebut label lalu satu pertanyaan penutup yang sama dengan sekarang. Untuk fokus OKR tidak ada tambahan karena target meleset sudah menjadi `triggers`. `stores.interviews.get` ikut membaca `duration_minutes`, `focus_kind`, `focus_label` (kolom B5).
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

Di bawah `/api/tna/sessions` (router `interviewRouter`), semua butuh flag `tna.interview_summary` kecuali yang bertanda "ada".

| Metode | Path | Siapa | Hasil |
| --- | --- | --- | --- |
| POST | `/:id/summary` | karyawan itu | 201 (baru) / 200 (sudah ada) `{ findings, createdAt }` |
| GET | `/:id/summary` | karyawan itu | 200; 404 bila belum ada |
| POST | `/:id/summary/confirm` | karyawan itu | 202 `{ status: 'completed', analysis: { status } }` |
| POST | `/:id/restart` | karyawan itu | 200 `{ status: 'scheduled', restartCount, restartsLeft }` |
| POST | `/:id/turns` (ada) | karyawan itu | + 409 `SUMMARY_PENDING`; kuota mengikuti A10 |
| POST | `/:id/complete` (ada) | | + 409 `SUMMARY_REQUIRED` untuk karyawan saat flag nyala (TNA) |
| GET | `/:id` (ada) | dalam cakupan | + kolom A11 |

### Kode galat

| Keadaan | Status | Kode |
| --- | --- | --- |
| Flag mati | 403 | `FEATURE_DISABLED` |
| Bukan orang yang diwawancarai (dalam cakupan) | 403 | `SUMMARY_PRIVATE` untuk `/summary`; `NOT_INTERVIEWEE` untuk `/confirm` dan `/restart` |
| Sesi di luar cakupan atau tenant lain | 404 | `NOT_FOUND` |
| `/summary` (POST), `/restart`, `/confirm` pada sesi yang bukan `in_progress`, atau kalah balapan | 409 | `INVALID_STATE` |
| `/summary` (POST) tanpa satu pun jawaban | 400 | `BAD_REQUEST` |
| `GET /summary` atau `/confirm` saat ringkasan belum ada | 404 / 409 | `NOT_FOUND` / `SUMMARY_MISSING` |
| `/confirm` dengan `accurate: false` tanpa `note` yang sah | 400 | `BAD_REQUEST` |
| `/turns` saat ringkasan ada | 409 | `SUMMARY_PENDING` |
| `/complete` oleh orang yang diwawancarai (flag nyala, TNA) | 409 | `SUMMARY_REQUIRED` |
| `/restart` ketiga | 409 | `RESTART_LIMIT` |
| `/restart` saat undangan lewat | 409 | `INVITATION_EXPIRED` |
| AI gagal | seperti `/turns` sekarang (`AiError`) | |

## 7. Susunan kode

- `apps/api/src/modules/interviews/summary.js`: fungsi murni `stepOf(session, now)`, `summaryStateOf(session)`, `questionLimit(session, aiConfig)`, `publicSummary(findings)`, `sessionView(session, { interviewee })` (daftar putih A11), `MAX_RESTARTS = 2`.
- `apps/api/src/modules/interviews/index.js`: endpoint baru; `interviewRouter` menerima `flags`; `nextQuestion` memakai `questionLimit`.
- `apps/api/src/modules/interviews/ai-calls.js`: `aiContext` menambah `focus`.
- `apps/api/src/modules/interviews/analysis.js`: A8.
- `apps/api/src/ai/prompts.js`, `stub-provider.js`: baris topik fokus kompetensi.
- `apps/api/src/db/lna-stores.js`: `interviews.saveSummary`, `getSummary`, `summaryForAnalysis`, `confirmSummary` (transaksi + job), `restart`, kolom baru di `get` (tanpa isi ringkasan); `interviews.addTurn(tenantId, sessionId, speaker, text, opts)` dengan `opts.guard = { restartCount }` (A4) dan `opts.mode` yang diteruskan apa adanya untuk paket suara B19 (kolomnya ditambah B19, B6 belum menyimpannya); `dna.existingCompetencyIds`; `tna.reviewQueue`/`getReviewItem` + `summaryState`, `summaryNote`.
- `apps/api/src/core/flags/index.js`: flag baru.
- `apps/api/src/modules/tna/index.js`: meneruskan `flags` ke `interviewRouter`.

## 8. Test yang ditulis lebih dulu

Unit (`tests/unit/interview-summary.test.js`): `stepOf` untuk empat langkah; `questionLimit` (15, 30, kosong, batas config lebih kecil); `publicSummary` tidak membocorkan `detail`, `competencyId`, `performanceRecordId`; prompt TNA memuat topik fokus dan tidak memuat nama orang.

Integrasi (`tests/integration/interview-summary.test.js`, Postgres, AI stub yang menghitung panggilan):
- flag mati: `/summary`, `/confirm`, `/restart` → 403 `FEATURE_DISABLED`; `/complete` lama tetap 202;
- alur utuh flag nyala: persetujuan → jawaban → ringkasan (201, `summary_findings` di DB tidak terbaca polos) → `/turns` 409 → konfirmasi 202 → setelah job selesai, antrean review HR berisi temuan dengan judul yang sama persis dengan ringkasan, `summaryConfirmed = true`, dan `analyzeTna` dipanggil tepat dua kali untuk sesi itu;
- `/summary` kedua kali mengembalikan isi sama tanpa panggilan AI baru;
- AI gagal saat ringkasan: tidak ada yang tersimpan, bisa diulang;
- privasi: atasan, HR, Admin ETA → 403 untuk `/summary` (GET dan POST), `/confirm`, `/restart`; karyawan lain 404; tenant lain 404;
- `/complete` oleh karyawan 409 `SUMMARY_REQUIRED`; oleh HR 202 dan temuan bertanda `summaryConfirmed = false`;
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
- sesi DNA: rute `/summary` tidak ada (404).

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
- `[⏳ DITERIMA]` Teks email pengingat ("belum Anda selesaikan, sekitar 30 menit") belum menyesuaikan langkah ringkasan dan durasi 15 menit. Sesi yang menggantung di langkah ringkasan setelah tenggat ditutup HR lewat `/complete` (A7).
- `[⏳ DITERIMA]` Layar B6 tidak masuk commit backend ini karena menunggu PR B0 (aturan bersama 1). Keputusan layar yang sudah diambil: label "Pertanyaan n, paling banyak N"; tombol "Lihat ringkasan temuan" muncul setelah AI menyatakan selesai, dan sebagai tautan sekunder setelah minimal satu jawaban; baris "Topik: <focusLabel>" bila ada.

## 10. Daftar perubahan file

- [ ] `apps/api/migrations/20261119000600-ringkasan-wawancara.js`
- [ ] `apps/api/src/core/flags/index.js`
- [ ] `apps/api/src/modules/interviews/summary.js`
- [ ] `apps/api/src/modules/interviews/index.js`
- [ ] `apps/api/src/modules/interviews/ai-calls.js`
- [ ] `apps/api/src/modules/interviews/analysis.js`
- [ ] `apps/api/src/ai/prompts.js`
- [ ] `apps/api/src/ai/stub-provider.js`
- [ ] `apps/api/src/db/lna-stores.js`
- [ ] `apps/api/src/modules/tna/index.js`
- [ ] `apps/api/tests/unit/interview-summary.test.js`
- [ ] `apps/api/tests/integration/interview-summary.test.js`
- [ ] `docs/ewi/ai-teks.md` (alur ringkasan)
- [ ] Layar web (menyusul, di atas PR B0)

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
| 12 | Boolean `summaryConfirmed` ambigu | **Perbaiki**: `summaryState` empat nilai |
| 13 | Spek hanya backend | **Tunda** dengan alasan: layar wajib di atas PR B0 yang belum terbuka; keputusan layar dicatat di bagian 9 |
| 14 | Kode galat belum lengkap, ID model ke karyawan | **Perbaiki**: tabel kode galat, `aiLabel` |
| 15 | Urutan men-null-kan ID | **Perbaiki**: A8 |
| 16 | Retensi `summary_findings` | **Tolak** pengosongan: karyawan berhak membaca lagi apa yang ia kirim; retensi dicatat ⏳ (A12) |
| 17 | Hapus giliran harus lewat sesi | **Perbaiki**: A6 |
| 18 | `step` tidak lengkap | **Perbaiki**: `expired`, `closed` |
| 19 | Teks pengingat | **Tunda** (⏳ bagian 9) |
| 20 | Pemakaian ulang oleh B10 | **Tolak** perluasan: di luar cakupan B6; batasnya ditulis di A1 |

Permintaan thread suara (B19): `addTurn` satu pintu dengan `opts.mode` diterima (bagian 7); slot input di komponen Percakapan dicatat untuk layar.
