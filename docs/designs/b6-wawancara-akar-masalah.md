# B6 · Wawancara akar masalah (backend)

Status: spek untuk direview. Paket B6 dari `brief-bangun-penuh-19nov.md` (thread T4). Bergantung pada B5 (`docs/designs/b5-training-needs.md`) untuk kolom penugasan (`duration_minutes`, `focus_*`). Layar (web) menyusul di atas PR B0.

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

Akibatnya temuan yang masuk antrean review HR **adalah temuan yang dilihat dan dikonfirmasi karyawan** (isi dan urutannya sama; hanya angka keyakinan disesuaikan oleh penilaian kedua). Tidak ada operasi AI baru, dan jumlah panggilan model per sesi tetap dua.

### 4.2 Status dan langkah

Status sesi di DB tidak ditambah (`scheduled`, `in_progress`, `completed`, `abandoned`). Langkah stepper diturunkan dan dikirim sebagai `step` di `GET /sessions/:id`:

| `step` | Syarat |
| --- | --- |
| `consent` | status `scheduled` |
| `chat` | status `in_progress` dan `summary_at` kosong |
| `summary` | status `in_progress` dan `summary_at` terisi |
| `done` | status `completed` |

"Undangan" selalu sudah lewat begitu karyawan membuka sesi (web menampilkannya sebagai langkah 1 yang selesai).

### 4.3 Aturan

- **A1 Flag.** Flag baru `tna.interview_summary`, default mati. Mati = perilaku persis seperti sekarang. Nyala = aturan A2-A9 berlaku untuk sesi TNA. Sesi DNA tidak berubah. Endpoint tetap di router TNA di balik `requireSubmodule('tna')` (`module.tna`).
- **A2 Membuat ringkasan.** `POST /sessions/:id/summary`: hanya karyawan yang diwawancarai; status harus `in_progress`; minimal satu jawaban. Bila ringkasan sudah ada dan belum dikonfirmasi, dikembalikan apa adanya tanpa memanggil model lagi (aman diulang). Bila AI gagal, tidak ada yang tersimpan dan karyawan bisa mencoba lagi. Pemakaian token dicatat seperti panggilan lain (`callAi`).
- **A3 Isi untuk karyawan.** `{ findings: [{ title, category, confidence }], createdAt }`. `detail` tidak dikirim ke layar ringkasan karena mockup hanya menampilkan satu kalimat per temuan; `detail` tetap tersimpan untuk HR. Kategori ditampilkan web sebagai "Training Needs" / "Improvement Needs"; keyakinan < 0,5 diberi label "Perlu ditinjau HR" (aturan tampilan, konstanta bersama di web). Bila tidak ada temuan, `findings` kosong dan web menampilkan "Tidak ditemukan hambatan yang jelas"; karyawan tetap bisa mengirim.
- **A4 Sesudah ringkasan dibuat, percakapan terkunci.** `POST /turns` → 409 `SUMMARY_PENDING` ("Ringkasan sudah dibuat. Kirim ke HR atau ulangi wawancara."). Jalan keluar hanya konfirmasi (A5) atau ulangi (A6).
- **A5 Konfirmasi.** `POST /sessions/:id/summary/confirm`: hanya karyawan itu; harus ada ringkasan yang belum dikonfirmasi. Dalam satu langkah bersyarat: `summary_confirmed_at = now()`, sesi ditutup (`interviews.close`, hanya satu dari dua permintaan bersamaan yang lolos), job analisis dibuat dan dijalankan di latar. Jawaban 202 sama bentuknya dengan `/complete`. Audit: `update`, `tna.interview_summary`, `{ decision: 'confirmed', findings: n }`.
- **A6 Ulangi wawancara.** `POST /sessions/:id/restart`: hanya karyawan itu; status `in_progress` (sebelum atau sesudah ringkasan dibuat); paling banyak **2 kali** per sesi (`restart_count`), berikutnya 409 `RESTART_LIMIT`. `[⚠️ BELUM TERVERIFIKASI]` batas 2 adalah pilihan penulis untuk membatasi biaya token; mockup tidak membatasi. Efek, dalam satu transaksi: semua giliran sesi dihapus, `summary_findings`/`summary_at` dikosongkan, `consent_at`/`consent_version`/`started_at` dikosongkan, status kembali `scheduled`, `restart_count + 1`. Karyawan menyetujui ulang seperti di mockup (ulang kembali ke langkah Persetujuan). Tenggat undangan tidak berubah. Audit: `delete`, `tna.interview_transcript`, `{ reason: 'restart', turns: n, restartCount }`. Catatan persetujuan lama tetap ada di log audit.
- **A7 `/complete` saat flag nyala.** Untuk sesi TNA, karyawan yang memanggil `/complete` mendapat 409 `SUMMARY_REQUIRED` ("Periksa ringkasan temuan sebelum mengirim ke HR."). HR dan Admin ETA tetap bisa menutup sesi lewat `/complete` (mis. karyawan berhenti di tengah); dalam hal itu analisis berjalan dua kali nilai seperti sekarang dan `summary_confirmed_at` tetap kosong, sehingga HR tahu ringkasan tidak diperiksa karyawan (kolom `summaryConfirmed` di antrean review; lihat A9).
- **A8 Job analisis.** `analysis.analyze` untuk TNA: bila sesi punya `summary_findings` **dan** `summary_confirmed_at`, penilaian pertama diambil dari sana (tanpa memanggil model), penilaian kedua tetap memanggil `ai.analyzeTna(pass 2)`. Selain itu perilaku lama. ID kompetensi/target di `summary_findings` yang sudah tidak ada (terhapus di antara ringkasan dan konfirmasi) diset null sebelum disimpan.
- **A9 Tanda untuk HR.** `stores.tna.reviewQueue` menambah `summaryConfirmed` (boolean dari sesi temuan). B7 yang menampilkannya; B6 hanya menyediakan data. Tidak ada transkrip untuk HR (PO-6).
- **A10 Durasi dan topik (dari B5).** `duration_minutes` 15 → paling banyak 5 pertanyaan, 30 atau kosong → `aiConfig.maxQuestions` (bawaan 8); tidak pernah melebihi `aiConfig.maxQuestions`. `[⚠️ BELUM TERVERIFIKASI]` pemetaan menit → jumlah pertanyaan adalah perkiraan (±3 menit per pertanyaan); disetel setelah QA malam dengan LLM sungguhan. Bila sesi punya `focus_kind = 'competency'`, kompetensi fokus dikirim ke AI sebagai `context.focus = { kind, label, competencyId }`: prompt TNA mendapat satu baris "Topik wawancara: gap kompetensi <label>", dan stub memakai label itu di pertanyaan pembuka. Untuk fokus OKR tidak perlu tambahan karena target meleset sudah menjadi `triggers`. `focus` hanya memuat nama kompetensi, bukan data orang (PM-10).
- **A11 Footer audit dan stepper.** `GET /sessions/:id` untuk karyawan yang diwawancarai menambah: `step`, `answerCount`, `questionLimit`, `restartCount`, `restartsLeft`, `summaryAt`, `summaryConfirmedAt`, `aiModel` (nama model dari penyedia), dan `sessionCode` (8 karakter pertama id, huruf besar). Peran lain hanya mendapat `step` dan `summaryConfirmedAt` (status, bukan isi).
- **A12 Ringkasan adalah data pribadi karyawan.** `GET /sessions/:id/summary` hanya untuk karyawan itu (peran lain 403 `SUMMARY_PRIVATE`); HR melihat temuan lewat antrean review setelah dikonfirmasi. Pembacaan dicatat `audit.readIndividual`. Ekspor data karyawan (PR #11) tidak diubah di B6: temuan terkonfirmasi muncul di ekspor setelah direview HR seperti temuan lain. `[⏳ DITERIMA]` ringkasan yang belum dikonfirmasi tidak ikut ekspor; dicatat di PR.
- **A13 Hapus data karyawan (PR #11).** `summary_findings` berada di baris sesi, jadi ikut terhapus saat sesi/karyawan dihapus (`ON DELETE CASCADE` yang ada). Tidak ada tabel baru.

## 5. Migrasi (blok 06)

`20261119000600-ringkasan-wawancara.js`, raw SQL dengan `down`:

```sql
ALTER TABLE lna_interview_sessions
  ADD COLUMN summary_findings jsonb,          -- hasil analyzeTna pass 1, terenkripsi (encryptJson)
  ADD COLUMN summary_at timestamptz,
  ADD COLUMN summary_confirmed_at timestamptz,
  ADD COLUMN restart_count smallint NOT NULL DEFAULT 0;
```

`down` menghapus keempat kolom.

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

## 7. Susunan kode

- `apps/api/src/modules/interviews/summary.js`: fungsi murni `stepOf(session)`, `questionLimit(session, aiConfig)`, `publicSummary(findings)`, `MAX_RESTARTS = 2`.
- `apps/api/src/modules/interviews/index.js`: endpoint baru; `interviewRouter` menerima `flags`; `nextQuestion` memakai `questionLimit`.
- `apps/api/src/modules/interviews/ai-calls.js`: `aiContext` menambah `focus`.
- `apps/api/src/modules/interviews/analysis.js`: A8.
- `apps/api/src/ai/prompts.js`, `stub-provider.js`: baris topik fokus kompetensi.
- `apps/api/src/db/lna-stores.js`: `interviews.saveSummary`, `getSummary`, `confirmSummary`, `restart`, kolom baru di `get`; `tna.reviewQueue` + `summaryConfirmed`.
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

Test lama (`ai-review`, `poc-dna-tna`, `privacy-audit`, `business-rules-live`) harus tetap lulus tanpa diubah, karena flag bawaan mati.

## 9. Keputusan default dan asumsi

- PO-6 A, PD-14 ★A, PM-9 A dipertahankan.
- `[⚠️ BELUM TERVERIFIKASI]` A6 batas ulang 2 kali.
- `[⚠️ BELUM TERVERIFIKASI]` A10 15 menit = 5 pertanyaan.
- `[⏳ DITERIMA]` A12 ringkasan belum dikonfirmasi tidak ikut ekspor.
- `[⏳ DITERIMA]` Teks persetujuan di mockup ("±10 menit", empat butir) berbeda dari teks legal v1.0 (`tna-consent-id-v1.0`). B6 tidak mengubah teks atau versinya; teks final menunggu legal (Fasha) dan ditangani bersama layar.
- `[⏳ DITERIMA]` Kualitas ringkasan dengan LLM sungguhan baru teruji di QA malam (B18); test di sini memakai stub dan fixture Bedrock.

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
