# QA malam ELGOS

QA malam menjalankan persona karyawan fiktif lewat aplikasi ELGOS sungguhan (API, Postgres, job analisis) dengan model AI sungguhan, lalu memeriksa hasilnya. Tujuannya menangkap hal yang tidak bisa ditangkap test biasa, karena test biasa memakai penyedia `stub`: pertanyaan yang bocor JSON, data orang lain yang ikut terkirim ke model, janji pelatihan, biaya dan latensi per malam. Spek: `docs/designs/b18-e2e-qa-malam.md` bagian 5.

Keputusan user 19 Nov 2026: hasil tiga malam (24, 25, 26 Nov) masuk bahan Go/No-Go 27 Nov. Bila akun AWS ELGOS belum siap 24 Nov, Andrian menjalankan satu run manual pada 26 Nov.

## Isi

| Berkas | Fungsi |
| --- | --- |
| `apps/api/tests/qa-malam/cli.js` | Titik masuk (`npm run qa:malam -w apps/api`): argumen, env, penyiapan database `_qa`, berkas laporan |
| `apps/api/tests/qa-malam/jalankan.js` | Pelaksana: pengaman, persona lewat API sungguhan, rekaman per persona, laporan (tanpa menulis berkas) |
| `apps/api/tests/qa-malam/pemeriksa.js` | Pemeriksaan struktur, privasi, dan klasifikasi, dan arti kode keluar (fungsi murni) |
| `apps/api/tests/qa-malam/perekam.js` | Membungkus penyedia AI: merekam payload, keluaran, token, latensi; batas token |
| `apps/api/tests/qa-malam/persona.js`, `persona/*.json` | Memuat dan memeriksa 12 persona TNA |
| `apps/api/tests/qa-malam/laporan.js` | Laporan Markdown |
| `apps/api/tests/alur/driver.js`, `data.js` | Langkah API (termasuk `jalankanWawancara`) dan data fiktif bersama test alur; berisi string kenari |
| `.github/workflows/qa-malam.yml` | Run terjadwal 02.00 WIB dan manual |

Semua berkas ada di `apps/api/tests/`, yang dibuang dari image produksi oleh `Dockerfile`.

## Menjalankan

### Dengan penyedia stub (siapa saja, kapan saja)

Untuk memeriksa pelaksana dan persona, tanpa biaya. Butuh Postgres lokal dengan database berakhiran `_qa`.

```bash
createdb ewi_qa   # sekali
NODE_ENV=test DATABASE_URL=postgres://ewi:ewi@localhost:5432/ewi_qa AI_PROVIDER=stub MAIL_PROVIDER=memory \
  npm run qa:malam -w apps/api -- --siapkan-db --keluaran ./qa-malam-hasil
```

Dengan stub, klasifikasi dan jumlah temuan tidak dinilai (stub selalu membuat temuan tetap), jadi kode 0 hanya berarti alur, struktur, dan privasi lulus.

### Dengan Bedrock, run manual (manusia saja)

Hanya dijalankan manusia (Andrian atau yang ditunjuk) di mesinnya sendiri, dengan kredensial berumur pendek. Tidak pernah dari sesi agen, dan tidak pernah dengan kunci IAM aplikasi (KMS/SES).

```bash
aws sso login --profile elgos-qa        # atau kredensial STS berumur pendek
export AWS_PROFILE=elgos-qa
NODE_ENV=test DATABASE_URL=postgres://ewi:ewi@localhost:5432/ewi_qa MAIL_PROVIDER=memory \
AI_PROVIDER=bedrock BEDROCK_REGION=<region QA> BEDROCK_MODEL_ID=<ID model atau profil apac.> \
AI_PRICE_INPUT_PER_MTOK=<harga> AI_PRICE_OUTPUT_PER_MTOK=<harga> QA_MALAM_MAX_TOKENS=400000 \
  npm run qa:malam -w apps/api -- --siapkan-db --keluaran ./qa-malam-hasil
```

Region dan model mengikuti PD-2b (Jakarta, lalu Singapura, lalu profil `apac.`). Konfigurasi divalidasi oleh `loadConfig`, jadi region atau profil di luar itu ditolak sebelum panggilan pertama.

### Opsi dan env

| Opsi atau env | Arti |
| --- | --- |
| `--siapkan-db` | Hapus schema `ewi` lalu jalankan migrasi. Hanya untuk database berakhiran `_qa` |
| `--persona <folder>` | Folder persona lain (bawaan `apps/api/tests/qa-malam/persona`) |
| `--keluaran <folder>` | Folder laporan (bawaan `./qa-malam-hasil`) |
| `QA_MALAM_MAX_TOKENS` | Batas total token per run; dicek sebelum tiap panggilan. Terlewati = kode 2 |
| `AI_PRICE_INPUT_PER_MTOK`, `AI_PRICE_OUTPUT_PER_MTOK` | Wajib untuk `bedrock`. Kosong = kode 2 sebelum panggilan pertama |
| `EWI_JWT_SECRET` | Diabaikan: pelaksana selalu membuat secret acak per run (aturan 5, tanpa fallback) |
| `MIGRATION_DATABASE_URL`, `DB_MIGRATION_*` | Dibuang saat `--siapkan-db` menjalankan migrasi, supaya migrasi mengenai database yang sama dengan yang dihapus |

Pengaman (kode 2 bila tidak terpenuhi):

- `NODE_ENV=test`, `EWI_ENV` bukan `staging`/`production`, `MAIL_PROVIDER` kosong atau `memory`.
- Nama database di `DATABASE_URL` dan database yang benar-benar tersambung (`current_database()`) berakhiran `_qa` atau `_test`. `--siapkan-db` hanya untuk `_qa`, dan keduanya harus sama.
- Untuk `bedrock`: harga token terisi, dan tidak ada kunci akses AWS jangka panjang (`AWS_ACCESS_KEY_ID` tanpa `AWS_SESSION_TOKEN`) di env run maupun `process.env`, misalnya kunci IAM aplikasi yang tertinggal di `apps/api/.env`. Kredensial harus sementara: SSO/STS di run manual, OIDC di workflow.

## Membaca laporan

Dua berkas per run: `qa-malam-<tanggal WIB>.json` dan `.md`. Di workflow, isi `.md` juga tampil di ringkasan run dan kedua berkas diunggah sebagai artefak (30 hari).

Kode keluar:

| Kode | Arti | Tindak lanjut |
| --- | --- | --- |
| 0 | Lulus | Catat angka klasifikasi, token, biaya, latensi |
| 1 | Gagal kualitas: struktur atau privasi | Baca bagian "Pelanggaran". Privasi = blokir modul terkait sampai diperbaiki |
| 2 | Gagal infrastruktur atau konfigurasi | Kredensial, kuota, region, harga token, persona tidak sah, atau batas token. Bukan soal mutu model |

Pemeriksaan per persona:

- **Struktur:** pertanyaan tidak kosong, paling panjang 400 karakter, berbahasa Indonesia, tanpa JSON atau markup; jumlah pertanyaan paling sedikit `harapan.minPertanyaan` bila diisi; sesi diterima selesai (202); job analisis `done`; jumlah temuan paling sedikit `harapan.minTemuan`; setiap panggilan model yang berhasil tercatat di `ai_usage_logs` (dasar laporan biaya mingguan PO-10). `minPertanyaan` dan `minTemuan` tidak dinilai untuk stub.
- **Langkah gagal:** bila langkah wawancara atau ringkasan B6 dijawab selain 2xx, wawancara persona itu berhenti dan dicatat sebagai `WAWANCARA_GAGAL`. Kelasnya ditentukan dari kode galat, sama untuk semua langkah: `AI_THROTTLED`, `AI_TIMEOUT`, `AI_UNAVAILABLE`, `AI_ACCESS_DENIED`, `AI_CREDENTIALS_MISSING`, `AI_MODEL_INVALID`, dan `QA_BATAS_TOKEN` adalah infrastruktur (kode 2); selebihnya, misalnya `AI_BAD_OUTPUT`, adalah mutu (kode 1). Persona berikutnya tetap dijalankan, kecuali batas token tercapai.
- **Privasi:** string kenari, nama, dan email karyawan lain atau tenant lain tidak ada di payload ke model maupun di keluaran (pertanyaan, ringkasan B6, temuan); alamat email apa pun tidak muncul di keluaran; teks di `tidakBolehMuncul` tidak muncul; pertanyaan tidak menjanjikan pelatihan.
- **Klasifikasi (dilaporkan saja):** himpunan kategori temuan sama dengan `harapan.kategori`; bila `harapan.bertautan` diisi, ada atau tidaknya temuan yang bertaut (BT-23, `linked_finding_id`) juga harus sesuai. Klasifikasi tidak membuat run merah sampai ambangnya diputuskan setelah tiga malam kalibrasi (pemilik PM-2). Target 85% (PO-5 C) berlaku untuk data HR sungguhan, bukan ambang ini.
- **Cakupan:** "Belum diuji" menyebut operasi AI di penyedia yang tidak terpanggil persona mana pun (sekarang `assessCompetencies`). Operasi baru, misalnya asisten B17, otomatis direkam dan muncul di sini sampai punya persona.

Laporan juga mencatat commit, model, region, dan sha256 `apps/api/src/ai/prompts.js`, supaya perubahan hasil antar malam bisa dikaitkan ke perubahan prompt atau model. Temperatur model tidak diatur, jadi hasil antar malam wajar sedikit berbeda.

## Menambah persona

Satu berkas `apps/api/tests/qa-malam/persona/<id>.json`, nama berkas sama dengan `id`. Semua data fiktif: jangan memakai nama, email, atau angka karyawan sungguhan.

```json
{
  "id": "campuran-bt23",
  "versi": 1,
  "operasi": "tna",
  "alur": "ringkasan",
  "deskripsi": "Apa yang diuji persona ini.",
  "karyawan": { "nama": "Agus Contoh", "jabatan": "Agen Layanan L1" },
  "target": [{ "kpi": "First Contact Resolution (%)", "target": 80, "aktual": 60 }],
  "naskah": ["jawaban giliran 1", "jawaban giliran 2"],
  "jawabanCadangan": "Saya rasa itu saja yang bisa saya ceritakan.",
  "harapan": { "kategori": ["training", "non_training"], "minTemuan": 2, "bertautan": true, "minPertanyaan": 2 },
  "tidakBolehMuncul": { "temuan": ["teks yang tidak boleh masuk temuan"], "keluaran": ["token injeksi"] }
}
```

- `alur`: `selesai` (bawaan, `POST …/complete`) atau `ringkasan` (langkah ringkasan B6 lalu kirim ke HR; flag `tna.interview_summary` dinyalakan untuk tenant persona itu).
- `harapan.kategori: null` berarti persona tidak dihitung dalam klasifikasi (misalnya jawaban sangat singkat). Nilai kategori mengikuti API: `training` (Training Needs) dan `non_training` (Improvement Needs).
- `harapan.minPertanyaan` (opsional): AI harus mengajukan paling sedikit sekian pertanyaan, misalnya supaya terbukti wawancara tetap berjalan setelah jawaban berisi perintah (persona `injeksi-perintah`).
- Naskah tidak menyesuaikan diri dengan pertanyaan AI, jadi tulis jawaban yang masuk akal untuk pertanyaan apa pun di topik itu. Bila naskah habis, `jawabanCadangan` dipakai sampai AI berhenti bertanya (paling banyak 20 giliran).
- Naikkan `versi` bila isi persona berubah, supaya angka antar malam tetap bisa dibandingkan.
- `npm test -w apps/api` memeriksa semua persona (`tests/unit/qa-malam-persona.test.js`).

## Mengaktifkan workflow (langkah manusia)

Workflow `.github/workflows/qa-malam.yml` dilewati selama variabel repo `QA_MALAM_ROLE_ARN` kosong, jadi aman digabung sebelum akun siap. Kode yang diuji selalu branch `dev`. Alasannya: kode itu berjalan dengan kredensial Bedrock, dan ke `dev` hanya masuk PR yang direview Andrian. Branch agen, termasuk branch integrasi, tidak diuji oleh workflow.

1. **Akun, role, dan alarm anggaran.** Jalankan wizard akun ELGOS dari PR #3 (`infra/setup-akun-elgos.sh`). Wizard menerapkan stack `infra/live/shared`: role `elgos-qa-malam` dengan trust OIDC GitHub untuk subjek `repo:andrianm28/EWI:environment:qa-malam` dan izin hanya `bedrock:InvokeModel` pada model atau inference profile QA, plus alarm anggaran akun. Wizard juga membuat environment `qa-malam` yang hanya boleh dipakai dari `main`.
2. **Variabel repo.** Wizard memasang `QA_MALAM_ROLE_ARN`, `QA_MALAM_BEDROCK_REGION`, dan `QA_MALAM_BEDROCK_MODEL_ID` (ID inference profile bila memakai profil `apac.`) sebagai variabel repo, bukan variabel environment, karena `if` di tingkat job tidak melihat variabel environment. Sejak PR #3 head 503d4dd wizard juga menanyakan dan memasang `QA_MALAM_AI_PRICE_INPUT_PER_MTOK` dan `QA_MALAM_AI_PRICE_OUTPUT_PER_MTOK` (US$ per sejuta token, dari halaman harga Bedrock untuk model dan region itu), serta opsional `QA_MALAM_MAX_TOKENS` (bawaan 400000).
3. **Berkas workflow di default branch.** GitHub hanya menjalankan `schedule` dan `workflow_dispatch` dari default branch (`main`, sekarang masih kosong). Pilihannya: menaruh `qa-malam.yml` di `main` lewat PR kecil yang direview Andrian, atau mengganti default branch.
4. **Kode QA malam di `dev`.** Workflow baru berguna setelah PR #8 masuk `dev`. Sebelum itu, malam kalibrasi dijalankan sebagai run manual oleh Andrian dari branch integrasi, setelah ia memeriksa diff-nya (bagian "Dengan Bedrock, run manual").
5. **Uji sekali.** Actions > QA malam > Run workflow. Kode 2 di run pertama biasanya berarti akses model belum diberikan di akun atau harga belum diisi.
