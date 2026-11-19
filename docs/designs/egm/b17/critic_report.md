# B17 · Tahap 7 Critic Review (egm-review-loop ronde 1; egm-design, egm-structural, egm-style; dispatch langsung)

## egm-style (seluruh dokumen) — 0 🔴, 6 🟡, 9 🟢
- 🟡 1. Klaim privasi mutlak (baris 11, 13, 16): teks pertanyaan dikirim apa adanya; persempit klaim, judul netral.
- 🟡 2. Status dokumen bertentangan dengan isi (baris 3 lawan daftar file `[x]`).
- 🟡 3. "user" ambigu (pengguna lawan pemilik produk) (baris 21, 197, 68).
- 🟡 4. "temuan non-pelatihan"/"temuan pelatihan" → Improvement Needs / Training Needs (baris 115, 121).
- 🟡 5. "undangan" → Penugasan wawancara (baris 76, 113).
- 🟡 6. Teks UI "Jawaban dicatat di log audit" padahal disimpan di `assistant_logs`; salam menjanjikan cakupan lebih luas (baris 66, 75).
- 🟢 7–15: "memang", jargon T1/T5, kalimat berlapis baris 21, legenda penanda, "di seluruh kode", istilah Inggris, istilah review bercampur, jargon proses, putusan triase longgar.

## egm-structural (baris 1–154, feature-spec-standard) — 2 🔴, 5 🟡, 5 🟢
- 🔴 1. Tidak ada "Alternatif yang dipertimbangkan" (fakta server lawan tool/RAG; filter di model lawan susunan fakta; jawaban aturan tanpa LLM; advisory lock lawan limiter memori; `assistant_logs` lawan `audit_logs`; memperluas `ai_usage_logs`).
- 🔴 2. Tidak ada "Risiko dan mitigasi" (skala penyusun fakta, timeout Bedrock, antrean advisory lock, ukuran log, salah tolak regex, kebocoran agregat tim kecil).
- 🟡 3. Tidak ada pernyataan masalah.
- 🟡 4. Penanda status tanpa legenda, posisi tidak konsisten.
- 🟡 5. Rujukan tanpa tautan (mockup, PR, kartu keputusan, kode aturan).
- 🟡 6. "Aturan bisnis yang dirujuk" tidak sinkron (PD-2b, PK-17 hilang).
- 🟡 7. Istilah menyimpang dari glosarium (undangan, non-pelatihan, sesi TNA).
- 🟢 8–12: blok kode tanpa bahasa; paragraf padat; format kolom Syarat; tidak ada ringkasan alur data; nama orang di heading.

## egm-design (baris 1–154, feature-spec-standard) — BELUM LULUS: 3 🔴, 6 🟡, 5 nit
- 🔴 1. Tidak ada evaluasi alternatif (fakta lengkap vs tool calling; LLM vs mesin aturan `RULES` mockup; kode samaran vs agregat; hitung per permintaan vs cache).
- 🔴 2. "Model tidak pernah menerima nama" tidak berlaku untuk teks pertanyaan: `question` dikirim mentah (`index.js:103`). Pilih: samarkan nama di pertanyaan, atau ubah klaim menjadi "fakta server tanpa nama" dan catat risiko sisa di DPIA PK-17. Tambah test.
- 🔴 3. Kode samaran `K<n>` bertabrakan dengan istilah domain "K3" (Keselamatan dan Kesehatan Kerja): `restoreNames` bisa menyisipkan nama orang ke nama kompetensi; audit `employeeIds` salah. Pakai token yang tidak muncul alami (mis. `⟦P1⟧`) + test "kompetensi K3 tidak diganti nama".
- 🟡 4. Tidak ada Risiko & Mitigasi; fakta HR memuat semua sesi/draf ke memori tiap pertanyaan. Pakai agregat SQL dan target ukuran tenant.
- 🟡 5. Kuota Bedrock dipakai bersama wawancara; tanpa pembatas per tenant/global (noisy neighbor). Prioritas operasi wawancara, alarm dari `ai_usage_logs`.
- 🟡 6. Prompt injection lewat data (judul katalog, nama kompetensi) dan rendering: kontrak teks polos (tanpa `v-html`/autolink), buang URL/markup dari `answer`, escape pembatas, test injeksi.
- 🟡 7. Isolasi bergantung disiplin builder: `tinjauan`, `perbaikan`, `permintaanData` tidak memakai `scope`. Assert "tampilan hr mensyaratkan scope.all", facade store terikat tenant, test kontrak pindai nama/email/id.
- 🟡 8. Hak hapus: nama anggota tim tetap di log/ekspor atasan setelah akun dihapus. Simpan jawaban ber-kode + peta kode→user_id, atau catat sebagai risiko.
- 🟡 9. Rencana test kurang: tabrakan kode, nama di pertanyaan, injeksi, konkurensi rate limit (N paralel → tepat 20), audit sukses tapi `finish` gagal.
- Nit: audit `answered` vs log `error` bila `finish` gagal; baris `pending` yatim (sweeper >5 menit → error); potong 1200 karakter sebelum penggantian nama; tampilan HR angka kecil setara data individu (nyatakan diterima); `hashtext` 32-bit aman (sebut).
- Sudah benar: rate limit advisory lock tanpa race; semua query `req.tenantId`; `scopeSql` userIds kosong → UUID nol; halaman usulan divalidasi; instruksi sistem statis + blok berpembatas; teks terenkripsi dan tidak masuk `audit_logs.meta`.

---
# Tahap 9 — egm-implementation-readiness (baris 155–akhir): siap dengan catatan, 0 🔴
- 🟡 Rencana test belum memuat fail closed audit (test ada) dan penolakan dari model lewat `restoreNames` (test belum ada).
- 🟡 Butir 7 tenant lain: data uji tenant lain terlalu tipis (hanya satu draf); sebutkan data minimum.
- 🟡 `normalize()` `assistant.retentionDays` tanpa test unit.
- 🟡 Retensi bisa gagal untuk semua tenant: nilai mentah besar lolos `^[0-9]+$` lalu `::int` out of range dalam satu DELETE lintas tenant. Batasi `^[0-9]{1,3}$` + test.
- 🟡 Pembatas `<fakta>`/`<pertanyaan>` di `prompts.js:247` tidak di-escape.
- 🟢 Klaim "semua penyusun memakai `ctx.scope`" tidak benar untuk `tinjauan`, `perbaikan`, `permintaanData`.
- 🟢 Test hilang: Admin ETA lewat API, atasan `view=karyawan`, saran hilang bila fakta mati, potong 1200 karakter.
- 🟢 Audit HR `employeeIds` selalu `[]`; regex `\bK(\d+)\b` bisa mengganti "Modul K1".
- Benar: tenant, flag default mati, rate limit transaksional, audit sebelum `finish`, enkripsi, `down` migrasi.

# Tahap 9 — egm-codebase-details (B17)
- 🟡 b17:85/170: `AI_BAD_OUTPUT` = 502, bukan 503.
- 🟡 b17:213 klaim `ctx.scope` tidak akurat untuk `tinjauan`, `perbaikan`, `permintaanData`.
- 🟢 pesan pengguna juga memuat baris peran dan blok `<halaman>`; peran tak dikenal jatuh ke learner; judul pengganti `rencanaSaya` berbeda dari B8.
- Reuse: logika "Hasil saya" dan hitungan held/overdue diduplikasi; `tinjauan` mendekripsi semua draf hanya untuk menghitung.
