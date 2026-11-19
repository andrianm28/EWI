# AI teks untuk wawancara (PK-06)

Menutup P0-1 (penyedia AI hanya tiruan berbasis kata kunci) dan sebagian P1-11. Wawancara TNA dan DNA berbasis teks
kini dijalankan model sungguhan lewat Amazon Bedrock. Suara (R3-1) tidak termasuk.

## Asumsi keputusan

Keputusan berikut belum dijawab; kode memakai opsi ★ dan mudah diubah bila jawabannya lain.

| Kode | Asumsi | Akibat di kode |
|---|---|---|
| PD-1 | ★A Amazon Bedrock (Claude) | `AI_PROVIDER=bedrock`, adaptor `src/ai/bedrock-provider.js` (Converse API) |
| PD-2 | ★A Hanya region Singapura | `BEDROCK_REGION` wajib `ap-southeast-1`; ID profil lintas region (`global.`, `apac.`, `us.`, dst.) ditolak saat boot. `AI_ALLOW_CROSS_REGION=true` hanya bila PD-2 berubah |
| PM-10 | ★A AI menyebut nama KPI dan angka milik karyawan itu | Model hanya menerima kompetensi jabatan dan target milik karyawan yang diwawancarai (`aiContext`); nama, email, dan data orang lain tidak dikirim |
| R3-6 | ✅ A Pemakaian dicatat per panggilan sejak POC | Tabel `ai_usage_logs` (migrasi `20261117000100`) |

## Cara kerja

- Kontrak penyedia ada di `src/ai/index.js`. Semua metode async dan mengembalikan `usage` (satu catatan per panggilan model).
  B4 (review hasil AI) memakai kontrak ini; temuan sudah membawa `confidence`.
- `AI_PROVIDER`: `stub` (bawaan di luar produksi, dipakai semua test) atau `bedrock` (bawaan dan wajib di produksi).
  Produksi dengan `stub` ditolak saat boot.
- Saat boot, API memeriksa kredensial AWS (tanpa memanggil model). Bila tidak ada, API berhenti dengan pesan
  `AI_CREDENTIALS_MISSING` yang menyebut variabel yang perlu diisi.
- Galat Bedrock dipetakan ke kode yang jelas: `AI_ACCESS_DENIED`, `AI_MODEL_INVALID`, `AI_THROTTLED`, `AI_TIMEOUT`,
  `AI_UNAVAILABLE` (503), `AI_BAD_OUTPUT` (502, setelah satu kali coba ulang dengan teguran format).
- Pertanyaan dibuat sebelum jawaban disimpan. Bila AI gagal, jawaban tidak tersimpan dan bisa dikirim ulang; persetujuan
  juga bisa diulang. Bila analisis gagal, sesi tetap `in_progress` dan `complete` bisa diulang.
- Kuota pertanyaan `AI_MAX_QUESTIONS` (bawaan 8) ditegakkan di kode, tidak hanya di prompt.

## Prompt

`src/ai/prompts.js`, Bahasa Indonesia:

- Wawancara TNA: mulai dari target yang meleset (nama dan angka milik karyawan), cari penyebab, bedakan pelatihan
  (pengetahuan/keterampilan) dari non-pelatihan (SOP, tools, sistem, akses, beban kerja). Kendala operasional digali
  singkat lalu kembali (BT-11). Satu pertanyaan per giliran, tanpa janji, tanpa data pribadi sensitif. Model membalas
  `[SELESAI]` bila cukup.
- Wawancara DNA (di balik flag `dna.ai_interview`): bukti perilaku per kompetensi jabatan.
- Analisis TNA: JSON temuan `training`/`non_training`; bila satu sebab memuat keduanya, dua temuan berurutan yang
  ditautkan (BT-23). Kompetensi dan target dirujuk dengan kode pendek (K1, T1) lalu dipetakan balik; kode karangan dibuang.
- Penilaian DNA: skor bulat 0 sampai 4 hanya untuk kompetensi yang punya bukti.
- Transkrip dikirim dalam tag `<transkrip>` dan disebut sebagai data, bukan instruksi.

## Pemakaian token (R3-6)

`ai_usage_logs`: tenant, proyek, sesi, karyawan, submodul, operasi (`next_question`, `assess_competencies`,
`analyze_tna`), penyedia, model, token masuk/keluar, latensi, estimasi biaya (bila `AI_PRICE_*_PER_MTOK` diisi).
Isi prompt dan jawaban tidak disimpan. Panggilan yang formatnya gagal tetap dicatat. Total per sesi dikembalikan di
respons `POST /:id/complete` (`aiUsage`). Laporan biaya di panel Admin ETA belum dibuat.

## Variabel lingkungan

| Variabel | Bawaan | Keterangan |
|---|---|---|
| `AI_PROVIDER` | `stub`, produksi `bedrock` | |
| `BEDROCK_REGION` | `ap-southeast-1` | Region lain ditolak (PD-2) |
| `BEDROCK_MODEL_ID` | wajib untuk bedrock | ID model Claude in-region Singapura, dicek di akun ELGOS (langkah 2 di bawah) |
| `BEDROCK_EXTRA_FIELDS` | kosong | JSON `additionalModelRequestFields`, opsional |
| `AI_MAX_QUESTIONS` | 8 | |
| `AI_TIMEOUT_MS` | 30000 | per panggilan |
| `AI_PRICE_INPUT_PER_MTOK`, `AI_PRICE_OUTPUT_PER_MTOK` | kosong | USD per sejuta token, dari halaman harga Bedrock |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | | Sama dengan KMS dan SES |

Berkas deploy (`deploy/`, `infra/`) milik thread infra; variabel di atas dan izin IAM perlu ditambahkan di sana (A7 butir 5):
`bedrock:InvokeModel` pada ARN foundation model `arn:aws:bedrock:ap-southeast-1::foundation-model/<BEDROCK_MODEL_ID>`.

## Uji asap setelah akun AWS ELGOS ada

1. Aktifkan akses model Anthropic di konsol Bedrock region ap-southeast-1 (akun ELGOS).
2. Pastikan model tersedia in-region (bukan hanya lewat profil lintas region):
   `aws bedrock list-foundation-models --region ap-southeast-1 --by-provider anthropic --query "modelSummaries[?contains(inferenceTypesSupported, 'ON_DEMAND')].modelId"`.
   Pilih model Claude terbaru yang muncul. Bila daftar kosong, PD-2 opsi A tidak bisa dipenuhi untuk model itu:
   bawa ke user (pilih model lain yang tersedia, atau PD-2 opsi B dengan profil `apac.`).
3. Isi `BEDROCK_MODEL_ID` dan kredensial, lalu jalankan dari root repo:
   `AI_PROVIDER=bedrock BEDROCK_MODEL_ID=<id> node apps/api/scripts/ai-smoke.js --record /tmp/rekaman-bedrock`
   Skrip memakai data fiktif, menjalankan wawancara TNA tiga giliran dan analisis, lalu mencetak pertanyaan, temuan, dan
   token per panggilan. Lulus bila tercetak `UJI ASAP LULUS`.
4. Periksa rekaman, lalu salin yang relevan ke `apps/api/tests/fixtures/bedrock/` menggantikan fixture susunan tangan
   (nama berkas mengikuti yang dipakai test).
5. Di dev: set `AI_PROVIDER=bedrock` dan `BEDROCK_MODEL_ID`, jalankan satu wawancara TNA lewat UI dengan akun uji, lalu
   cek `SELECT operation, input_tokens, output_tokens FROM ewi.ai_usage_logs ORDER BY id DESC LIMIT 10;`.
   Ini bukti selesai PK-06 (wawancara ujung ke ujung dengan model nyata, log token terisi).

## Batas yang diketahui

- Ketersediaan Claude in-region di ap-southeast-1 belum bisa dicek dari sini (tidak ada akun). Dokumentasi model
  Claude terbaru di Bedrock mencantumkan profil geo `us.`, `eu.`, `au.`, `in.` dan `global.`, tanpa profil APAC/Singapura,
  jadi langkah 2 wajib sebelum 20 Nov.
- Analisis masih sinkron di `POST /complete`; B4 memindahkannya ke job terpisah dengan dua kali penilaian (PD-13).
- Tidak ada streaming jawaban; pertanyaan pendek (maks 400 token keluar).
