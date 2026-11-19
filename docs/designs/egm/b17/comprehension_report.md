# B17 · Tahap 6 Comprehension Test (egm-comprehension, subagent baru, hanya membaca spek)

## Apa yang diusulkan
Panel chat "Asisten ELGOS" yang menjawab singkat dan hanya membaca, dari fakta yang disusun server per tampilan peran (`karyawan`, `atasan`, `hr`) dalam cakupan tenant dan `visibleEmployeeScope()`. Nama diganti kode `K<n>` lalu dikembalikan setelah model menjawab. Alur: validasi tampilan → batas pakai 20/10 menit bersama log `pending` dalam transaksi berkunci → regex penolakan untuk tampilan karyawan → `assistantReply` (Bedrock/tiruan) berformat JSON → validasi halaman "Buka …" → audit sebelum log diperbarui (fail closed). Log terenkripsi di `assistant_logs`, retensi per tenant (90 hari) lewat job harian. Paket lain bisa mendaftarkan fakta, halaman, dan tampilan.

## Cara kerja sistem yang ada, menurut dokumen ini
Store per modul, `req.tenantId`, `visibleEmployeeScope()`, `requireRole`/`requireSubmodule`, flag dan setting tenant (`normalize()`), penyedia AI PR #15 (Bedrock/tiruan, `converseParsed`, `AiError`, `ai_usage_logs` dengan tiga operasi dan `submodule` 8 karakter), `audit_logs`, ekspor data karyawan, job systemd milik infra; B7 dan B8 menyediakan data fakta.

## Temuan
- 🟡 Tampilan `hr` tidak punya fakta bercode, tetapi aturan nama dan audit HR menganggap ada (baris 21, 90).
- 🟡 Mockup sumber tidak ditautkan (`SUG`, `LBL`, `TITLES`, `RULES`).
- 🟡 Paket B3/B7/B8/T1/T5 dan brief tidak didefinisikan/ditautkan.
- 🟡 Submodul `dna` tidak didefinisikan.
- 🟡 Teks jawaban saat model menolak tidak ditetapkan di bagian Endpoint.
- 🟡 Label status keputusan tanpa legenda; kartu keputusan 19 Nov tidak ditautkan.
- 🟢 PD-2b/PK-17; `scopeFor` lawan `visibleEmployeeScope`; helper yang dianggap dikenal; perilaku tanpa `view`; B13–B16 tanpa nama; status dokumen basi; jargon triase.
