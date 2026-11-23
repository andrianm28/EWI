# PD-2b terjawab: AI teks dan QA malam di Bedrock Singapura

Status: spek kecil thread integrasi (23 Nov). Pemilik keputusan: user, kartu di thread infra 23 Nov 11.01 WIB.

## 1. Konteks

PD-2b (user, 19 Nov 20.28 WIB) memilih lokasi pemrosesan AI teks dengan urutan: Jakarta `ap-southeast-3` bila model
Claude tersedia in-region, lalu Singapura `ap-southeast-1`, lalu profil lintas region `apac.`. Profil lain (`global.`,
`us.`, `eu.`, ...) ditolak saat boot kecuali `AI_ALLOW_CROSS_REGION=true`.

Thread infra mengecek akun AWS ELGOS pada 23 Nov:

- Jakarta: Claude hanya bisa dipanggil lewat profil `global.anthropic.*`. Tidak ada model in-region dan tidak ada profil `apac.`.
- Singapura: `anthropic.claude-sonnet-5` tersedia on-demand (in-region).

Jadi langkah pertama PD-2b gagal dan langkah kedua berhasil. User memilih Singapura dengan `anthropic.claude-sonnet-5`
on-demand untuk QA malam (kartu 23 Nov 11.01 WIB). Aplikasi memakai lokasi dan model yang sama, karena QA malam
harus menguji model yang dipakai produksi.

Masalahnya: bawaan `BEDROCK_REGION` di `apps/api/src/config/env.js` masih Jakarta. Dengan bawaan itu, model
in-region Singapura salah region, dan satu-satunya jalan di Jakarta (profil `global.`) ditolak tanpa
`AI_ALLOW_CROSS_REGION`. Setiap lingkungan yang lupa mengisi `BEDROCK_REGION` akan gagal.

## 2. Perubahan

| Berkas | Sebelum | Sesudah |
|---|---|---|
| `apps/api/src/config/env.js` | `BEDROCK_REGION` bawaan `ap-southeast-3` | bawaan `ap-southeast-1`; komentar mencatat hasil cek 23 Nov |
| `apps/api/tests/unit/config.test.js` | mengharapkan bawaan Jakarta | mengharapkan bawaan Singapura (`in-region:ap-southeast-1`) |
| `.env.example` | `BEDROCK_REGION=ap-southeast-3`, `BEDROCK_MODEL_ID=` | `BEDROCK_REGION=ap-southeast-1`, `BEDROCK_MODEL_ID=anthropic.claude-sonnet-5` (dipakai bila `AI_PROVIDER=bedrock`) |
| `docs/ewi/ai-teks.md` | PD-2b tanpa hasil, "belum bisa dicek" | hasil cek 23 Nov, bawaan baru, model terpilih |
| `docs/ewi/qa-malam.md` | contoh `<region QA>`, `<ID model atau profil apac.>` | `ap-southeast-1`, `anthropic.claude-sonnet-5`; nilai variabel repo QA malam |
| `docs/designs/b18-e2e-qa-malam.md` | PD-2b tanpa hasil | baris PD-2b mencatat lokasi QA malam |

Yang tidak berubah, dengan alasan:

- `AI_ALLOWED_REGIONS` tetap `ap-southeast-3,ap-southeast-1`. PD-2b masih mengutamakan Jakarta bila suatu saat Claude
  tersedia in-region di sana, dan daftar ini hanya pagar, bukan pilihan.
- `BEDROCK_MODEL_ID` tetap wajib diisi (tanpa bawaan di kode). Model bisa berganti tanpa rilis, dan boot yang gagal
  karena model kosong lebih aman daripada diam-diam memakai model lama.
- Penjaga profil lintas region tidak berubah. `global.` tetap ditolak tanpa `AI_ALLOW_CROSS_REGION=true`.

## 3. Bukan cakupan (milik thread infra, PR #3)

`infra/` dan `deploy/` milik thread infra (aturan di `docs/ewi/ai-teks.md`). Thread integrasi tidak mengubahnya agar
tidak bentrok dengan commit PR #3 yang masih berjalan. Diserahkan ke thread infra:

- `infra/live/shared/qa-malam.tf`: bawaan `qa_bedrock_region` masih `ap-southeast-3` (wizard mengirim nilai eksplisit,
  jadi bawaan ini hanya berlaku bila Terraform dijalankan tanpa wizard).
- `infra/setup-akun-elgos.sh`: teks pertanyaan region QA.
- `deploy/vps/.env.example`: `BEDROCK_MODEL_ID` kosong dan komentar "dicek saat akun AWS ELGOS ada".
- `docs/infra/vps-etavm2.md`: paragraf region QA malam.

`deploy/vps/docker-compose.yml` sudah memasang `BEDROCK_REGION: ap-southeast-1`, dan IAM aplikasi
(`infra/modules/app-crypto`) sudah mengizinkan `foundation-model/anthropic.*` di region stack (ap-southeast-1).

Di luar kode: DPIA (draf PK-17) dan catatan lokasi pemrosesan perlu menulis Singapura untuk AI teks. Teks persetujuan
di `apps/web/src/content/consent.ts` dan `apps/api/src/core/consent` tidak menyebut lokasi, jadi tidak berubah.

## 4. Test

- Unit `config.test.js`: tanpa `BEDROCK_REGION`, `loadConfig` produksi menghasilkan `region: 'ap-southeast-1'` dan
  `processing: 'in-region:ap-southeast-1'`. Test PD-2b lain (Jakarta eksplisit tetap diterima, `us-east-1` ditolak,
  profil `global.` ditolak kecuali diizinkan) tetap.
- Unit baru: tanpa `BEDROCK_REGION`, `BEDROCK_MODEL_ID=anthropic.claude-sonnet-5` lolos validasi dan tercatat in-region
  Singapura.
- Gerbang penuh pada hasil gabungan.

## 5. Risiko

- Lingkungan yang sengaja memakai Jakarta tanpa mengisi `BEDROCK_REGION` akan pindah ke Singapura. Saat ini tidak ada:
  compose VPS mengisi Singapura, dev memakai `stub`, dan QA malam mengisi region dari variabel repo.
- Harga token Singapura untuk model ini diisi wizard ke variabel repo QA malam (bukan dari repo).
</content>
