# AI teks untuk wawancara (PK-06)

Menutup P0-1 (penyedia AI hanya tiruan berbasis kata kunci) dan sebagian P1-11. Wawancara TNA dan DNA berbasis teks
kini dijalankan model sungguhan lewat Amazon Bedrock. Suara (R3-1) tidak termasuk.

## Asumsi keputusan

PD-1 belum dijawab (per 19 Nov); kode memakai opsi ★. PM-10 diputus A (17 Nov). PD-2 diganti PD-2b (19 Nov 20.28 WIB); hasilnya dicek 23 Nov (Singapura, lihat baris PD-2b).

| Kode | Asumsi | Akibat di kode |
|---|---|---|
| PD-1 | ★A Amazon Bedrock (Claude) | `AI_PROVIDER=bedrock`, adaptor `src/ai/bedrock-provider.js` (Converse API) |
| PD-2b | ✅ Lokasi dengan latensi terendah ke Indonesia yang memenuhi spek (user, 19 Nov). Hasil cek akun ELGOS 23 Nov: Jakarta hanya lewat profil `global.anthropic.*` (tanpa model in-region dan tanpa `apac.`); Singapura punya `anthropic.claude-sonnet-5` on-demand, sedangkan Sonnet 5.5 hanya lewat profil `global.`. User memilih Singapura dengan Sonnet 5 (kartu 23 Nov 11.01 WIB), lalu menggantinya penuh ke Sonnet 5.5 lewat Singapura (23 Nov 12.27 WIB) | Urutan: Jakarta `ap-southeast-3` bila model Claude tersedia in-region, lalu Singapura `ap-southeast-1`, lalu profil lintas region `apac.`; profil `global.` diizinkan sejak keputusan 23 Nov, dengan opt-in `AI_ALLOW_GLOBAL_PROFILE=true` per lingkungan sejak 24 Nov. Terpakai: endpoint Singapura, `BEDROCK_MODEL_ID=global.anthropic.claude-sonnet-5-5`, jadi prompt bisa diproses di region AWS mana pun (spek `docs/designs/pd-2b-bedrock-singapura.md`). `BEDROCK_REGION` (bawaan `ap-southeast-1`) wajib ada di `AI_ALLOWED_REGIONS` (bawaan `ap-southeast-3,ap-southeast-1`); profil `us.`, `eu.`, dst. ditolak saat boot kecuali `AI_ALLOW_CROSS_REGION=true`. Lokasi yang dipakai tercetak saat boot (`in-region:<region>` atau `cross-region:global`) untuk DPIA |
| PM-10 | ✅ A (17 Nov) AI menyebut nama KPI dan angka milik karyawan itu | Model hanya menerima kompetensi jabatan dan target milik karyawan yang diwawancarai (`aiContext`); nama, email, dan data orang lain tidak dikirim |
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

## Ringkasan temuan diperiksa karyawan (B6, flag `tna.interview_summary`)

Spek: `docs/designs/b6-wawancara-akar-masalah.md`. Saat flag menyala, wawancara TNA punya langkah ringkasan:

1. `POST /api/tna/sessions/:id/summary` memanggil `analyzeTna` sekali (penilaian pertama) dan menyimpan hasilnya terenkripsi di sesi. Percakapan terkunci.
2. Karyawan memilih "Sesuai, kirim ke HR" (`POST .../summary/confirm`), "Kirim dengan catatan" (`{ accurate: false, note }`), atau "Ulangi wawancara" (`POST .../restart`, paling banyak 2 kali).
3. Konfirmasi menutup sesi dan membuat job analisis dalam satu transaksi. Job memakai ringkasan sebagai penilaian pertama dan hanya memanggil model untuk penilaian kedua, jadi alur normal tetap dua panggilan `analyzeTna` per sesi.
4. Sesi 15 menit paling banyak 5 pertanyaan. Sesi hasil penugasan gap (B5) membawa nama kompetensi atau nama target kerja sebagai topik di prompt bila karyawan tidak punya target meleset sendiri.
5. Ringkasan dibuang (409) bila ada jawaban baru masuk selama AI meringkas, sehingga karyawan tidak mengonfirmasi ringkasan tanpa jawaban terakhirnya.

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
| `BEDROCK_REGION` | `ap-southeast-1` | Harus ada di `AI_ALLOWED_REGIONS` (PD-2b); Jakarta tetap boleh diisi eksplisit |
| `AI_ALLOWED_REGIONS` | `ap-southeast-3,ap-southeast-1` | |
| `AI_ALLOW_GLOBAL_PROFILE` | `true` bila `BEDROCK_MODEL_ID` profil `global.` | Opt-in per lingkungan (keputusan user 24 Nov, review PR #8). Tanpa `true`, ID `global.` ditolak saat boot. Tidak membuka `us.`/`eu.` dan tidak melonggarkan `AI_ALLOWED_REGIONS`. Prod hanya setelah DPIA dan persetujuan diperbarui |
| `BEDROCK_MODEL_ID` | wajib untuk bedrock | Terpakai sejak 23 Nov: `global.anthropic.claude-sonnet-5-5` (ID inference profile, dipanggil dari endpoint Singapura). Bisa juga ID model in-region atau `apac.<id>` (langkah 2 di bawah) |
| `BEDROCK_EXTRA_FIELDS` | kosong | JSON `additionalModelRequestFields`, opsional |
| `AI_MAX_QUESTIONS` | 8 | |
| `AI_TIMEOUT_MS` | 30000 | per panggilan |
| `AI_PRICE_INPUT_PER_MTOK`, `AI_PRICE_OUTPUT_PER_MTOK` | kosong | USD per sejuta token, dari halaman harga Bedrock |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | | Sama dengan KMS dan SES |

Berkas deploy (`deploy/`, `infra/`) milik thread infra; variabel di atas dan izin IAM perlu ditambahkan di sana (A7 butir 5):
`bedrock:InvokeModel` pada `arn:aws:bedrock:<BEDROCK_REGION>::foundation-model/<model>`; bila memakai profil (`global.` sejak
23 Nov), juga ARN profil inferensinya dan foundation model di semua region tujuan profil itu. Thread infra memasangnya di
`infra/modules/app-crypto` (statement `ModelLewatProfil`: model dasar di region mana pun hanya lewat profil di akun ini).

## Uji asap setelah akun AWS ELGOS ada

1. Aktifkan akses model Anthropic di konsol Bedrock (akun ELGOS) untuk region yang akan dipakai.
2. Pilih lokasi sesuai PD-2b, berhenti di langkah pertama yang berhasil:
   a. Jakarta in-region: `aws bedrock list-foundation-models --region ap-southeast-3 --by-provider anthropic --query "modelSummaries[?contains(inferenceTypesSupported, 'ON_DEMAND')].modelId"`.
   b. Singapura in-region: perintah yang sama dengan `--region ap-southeast-1`.
   c. Profil APAC: `aws bedrock list-inference-profiles --region ap-southeast-3 --query "inferenceProfileSummaries[?starts_with(inferenceProfileId, 'apac.anthropic')].inferenceProfileId"` (ulangi untuk ap-southeast-1).
   d. Profil global (dipakai sejak 23 Nov, keputusan user): perintah c dengan `'global.anthropic'` dan `--region ap-southeast-1`.
      Region tujuan profil ini bisa di mana pun, jadi pilihan ini butuh keputusan user dan catatan DPIA.
   Pakai model Claude terbaru yang memenuhi spek. Bila a dan b sama-sama ada, bandingkan latensi dari etavm2 dengan
   uji asap di kedua region dan ambil yang lebih cepat. Bila tidak ada satu pun, bawa ke user.
3. Isi `BEDROCK_REGION`, `BEDROCK_MODEL_ID`, dan kredensial (dengan ID `global.` juga `AI_ALLOW_GLOBAL_PROFILE=true`), lalu jalankan dari root repo:
   `AI_PROVIDER=bedrock BEDROCK_REGION=<region> BEDROCK_MODEL_ID=<id> node apps/api/scripts/ai-smoke.js --record /tmp/rekaman-bedrock`
   Skrip memakai data fiktif, menjalankan wawancara TNA tiga giliran dan analisis, lalu mencetak pertanyaan, temuan, dan
   token per panggilan. Lulus bila tercetak `UJI ASAP LULUS`.
4. Periksa rekaman, lalu salin yang relevan ke `apps/api/tests/fixtures/bedrock/` menggantikan fixture susunan tangan
   (nama berkas mengikuti yang dipakai test).
5. Di dev: set `AI_PROVIDER=bedrock` dan `BEDROCK_MODEL_ID` (ID `global.` butuh `AI_ALLOW_GLOBAL_PROFILE=true`), jalankan satu wawancara TNA lewat UI dengan akun uji, lalu
   cek `SELECT operation, input_tokens, output_tokens FROM ewi.ai_usage_logs ORDER BY id DESC LIMIT 10;`.
   Ini bukti selesai PK-06 (wawancara ujung ke ujung dengan model nyata, log token terisi).

## Batas yang diketahui

- Langkah 2 dijalankan thread infra pada 23 Nov dengan akun ELGOS: Jakarta hanya menyediakan profil `global.anthropic.*`,
  Singapura menyediakan `anthropic.claude-sonnet-5` on-demand dan Sonnet 5.5 hanya lewat `global.anthropic.claude-sonnet-5-5`.
  User memilih Sonnet 5.5 lewat profil global. Uji asap (langkah 3) dan rekaman fixture (langkah 4) tetap perlu dijalankan
  dengan `BEDROCK_REGION=ap-southeast-1 BEDROCK_MODEL_ID=global.anthropic.claude-sonnet-5-5 AI_ALLOW_GLOBAL_PROFILE=true`.
- Profil `global.` berarti prompt (jawaban wawancara karyawan) bisa diproses di region AWS mana pun, di luar Indonesia
  dan APAC. Ini transfer data lintas negara menurut UU PDP: DPIA dan teks persetujuan wajib menyebutnya (thread legal).
- Analisis masih sinkron di `POST /complete`; B4 memindahkannya ke job terpisah dengan dua kali penilaian (PD-13).
- Tidak ada streaming jawaban; pertanyaan pendek (maks 400 token keluar).
- PD-2b juga berlaku untuk suara live (thread penyedia suara, rencana Gemini Live); kode ini hanya mengatur AI teks.
  Lokasi teks dan suara yang akhirnya dipakai harus ditulis di DPIA dan teks persetujuan.
