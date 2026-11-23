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
| `docs/ewi/poc-dna-tna.md` | "lokasi PD-2b: Jakarta, Singapura, atau profil apac." | ditambah hasil 23 Nov (Singapura) |

Yang tidak berubah, dengan alasan:

- `AI_ALLOWED_REGIONS` tetap `ap-southeast-3,ap-southeast-1`. PD-2b masih mengutamakan Jakarta bila suatu saat Claude
  tersedia in-region di sana, dan daftar ini hanya pagar, bukan pilihan.
- `BEDROCK_MODEL_ID` tetap wajib diisi (tanpa bawaan di kode). Model bisa berganti tanpa rilis, dan boot yang gagal
  karena model kosong lebih aman daripada diam-diam memakai model lama.
- Penjaga profil lintas region tidak berubah. `global.` tetap ditolak tanpa `AI_ALLOW_CROSS_REGION=true`. Catatan:
  `AI_ALLOW_CROSS_REGION=true` juga melewati pemeriksaan `AI_ALLOWED_REGIONS`, bukan hanya penjaga profil.

## 3. Bukan cakupan (milik thread infra, PR #3)

`infra/` dan `deploy/` milik thread infra (aturan di `docs/ewi/ai-teks.md`). Thread integrasi tidak mengubahnya agar
tidak bentrok dengan commit PR #3 yang masih berjalan. Diserahkan ke thread infra:

- `infra/live/shared/qa-malam.tf`: bawaan `qa_bedrock_region` masih `ap-southeast-3` dan deskripsinya masih "Jakarta;
  Singapura bila Claude tidak tersedia di Jakarta" (wizard mengirim nilai eksplisit, jadi bawaan ini hanya berlaku bila
  Terraform dijalankan tanpa wizard).
- `infra/setup-akun-elgos.sh`: teks pertanyaan region QA, dan langkah mengaktifkan region opt-in Jakarta "agar Bedrock
  Jakarta bisa dicek" yang kini tidak dibutuhkan untuk AI teks.
- `deploy/vps/.env.example`: `BEDROCK_MODEL_ID` kosong dan komentar "dicek saat akun AWS ELGOS ada".
- `docs/infra/vps-etavm2.md`: paragraf region QA malam.

`deploy/vps/docker-compose.yml` sudah memasang `BEDROCK_REGION: ap-southeast-1`, dan IAM aplikasi
(`infra/modules/app-crypto`) sudah mengizinkan `foundation-model/anthropic.*` di region stack (ap-southeast-1).

Diserahkan ke legal (PK-17, Fasha): `docs/ewi/ai-teks.md` mewajibkan lokasi teks dan suara yang akhirnya dipakai ditulis
di DPIA dan teks persetujuan. Teks persetujuan (`apps/web/src/content/consent.ts`, `apps/api/src/core/consent`) sekarang
tidak menyebut lokasi sama sekali. Menambah lokasi berarti versi persetujuan baru, dan semua versi masih draf yang
menunggu legal, jadi spek ini tidak mengubahnya. DPIA dan teks persetujuan perlu menulis Singapura untuk AI teks.

## 4. Test

- Diubah, `config.test.js`: tanpa `BEDROCK_REGION`, `loadConfig` menghasilkan `region: 'ap-southeast-1'` dan
  `processing: 'in-region:ap-southeast-1'` (produksi dengan model `anthropic.claude-sonnet-5`, dan test PD-2b).
- Baru: `BEDROCK_REGION=ap-southeast-3` eksplisit tetap diterima (`in-region:ap-southeast-3`).
- Baru: `BEDROCK_REGION=''` (yang dikirim `qa-malam.yml` bila variabel repo belum diisi) jatuh ke Singapura.
- Baru: `AI_ALLOWED_REGIONS=ap-southeast-3` tanpa `BEDROCK_REGION` kini menolak boot (lihat risiko).
- Tetap: `us-east-1` ditolak, profil `global.`/`us.`/`eu.` ditolak kecuali diizinkan.
- Gerbang penuh pada hasil gabungan.

## 5. Risiko

- Lingkungan yang sengaja memakai Jakarta tanpa mengisi `BEDROCK_REGION` akan pindah ke Singapura. Saat ini tidak ada:
  compose VPS mengisi Singapura, dev memakai `stub`, dan QA malam mengisi region dari variabel repo.
- Lingkungan yang membatasi `AI_ALLOWED_REGIONS=ap-southeast-3` tanpa mengisi `BEDROCK_REGION` kini gagal boot dengan
  pesan PD-2b. Tidak ada lingkungan seperti itu di repo; pesannya menyebut region yang diizinkan.
- Harga token Singapura untuk model ini diisi wizard ke variabel repo QA malam (bukan dari repo).

## 6. Review

Review spek oleh goldfish `egm:egm-codebase-details` (tanpa riwayat percakapan), 23 Nov. Tidak ada blocker.

| Temuan | Bobot | Triase |
|---|---|---|
| Bagian 3 bilang teks persetujuan tidak berubah, padahal `ai-teks.md` mewajibkan lokasi di teks persetujuan | Major | Diterima: diserahkan ke legal (bagian 3), tidak diubah karena butuh versi persetujuan baru |
| Bagian 4 menyebut test Jakarta eksplisit sebagai test lama | Major | Diterima: dicatat sebagai test baru |
| `docs/ewi/poc-dna-tna.md:52` belum mencatat hasil | Minor | Diterima: diperbarui |
| Penyerahan infra belum menyebut langkah opt-in Jakarta di wizard dan deskripsi variabel tf | Minor | Diterima: bagian 3 |
| `AI_ALLOW_CROSS_REGION` juga melewati daftar region | Minor | Diterima: dicatat di bagian 2, perilaku tidak diubah |
| Butir test "unit baru" mengulang butir pertama | Minor | Diterima: bagian 4 disusun ulang |
| Kasus `BEDROCK_REGION=''` dan `AI_ALLOWED_REGIONS=ap-southeast-3` tanpa region belum diuji | Minor | Diterima: dua test baru, risiko kedua dicatat |
</content>
