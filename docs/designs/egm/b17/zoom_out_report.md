# B17 · Tahap 5 Initial Zoom Out (egm-review, mode uninterrupted)

Target: `docs/designs/b17-asisten-elgos.md`. Reviewer: `egm:egm-zoom-out` dan `egm:egm-inventive-catalyst`, masing-masing subagent baru tanpa riwayat percakapan, dikirim langsung dari sesi utama (synthesizer di sesi ini tidak bisa membuat subagent, jadi laporan synthesizer lama diganti laporan ini). Konteks: CLAUDE.md, CONTEXT.md, docs/agents/domain.md, spek B0 (PR #18), mockup Pak Eji, kode modul assistant.

| Reviewer | Status | 🔴 | 🟡 | 🟢 |
| --- | --- | --- | --- | --- |
| egm-zoom-out | selesai | 1 | 6 | 4 |
| egm-inventive-catalyst | selesai | 1 | 3 | 2 |

## Temuan (sudah dideduplikasi)

### 🔴
- **Z1/I1. Peta peran ke tampilan bertentangan dengan B0 §5.1** (baris 25–36, `views.js`). B0: pimpinan/role_leader → `atasan`, eta_admin → `super`. B17: pimpinan/role_leader → `karyawan`, eta_admin → `hr`. Panel yang mengirim `view` aktif shell mendapat 403/400. Kedua reviewer menemukan ini secara terpisah.

### 🟡
- **Z2. Halaman "Buka …" tidak cocok dengan menu B0 §5.2**: `aiv` tidak ada untuk tampilan `hr`; untuk atasan `aiv` milik `cca` (B10); undangan TNA karyawan seharusnya ke `iv` (B6).
- **Z3. Apakah LLM perlu untuk rilis 2 Des**: semua fakta agregat kecil; penjawab deterministik sudah ada sebagai penyedia tiruan.
- **I2. Fakta individu terkirim ke model sebelum audit tercatat** (baris 83–87): "fail closed" hanya menutup respons.
- **I3. Kegagalan penyedia AI memakan kuota pengguna** (baris 81, 85).
- **I4. Retensi bergantung penuh pada timer infra** (baris 68).
- **Z4. Registri `registerFactBuilder`/`registerPage`/`registerView` spekulatif**, mutasi state global lewat `require` (baris 127–129).
- **Z5. Setting retensi per tenant terlalu dini**; job sejenis memakai env (baris 68).
- **Z6. Aturan audit `hr` mengacu ke kode samaran yang tidak dipakai fakta HR** (baris 90).
- **Z7. Saran pertanyaan dan topik menyimpang dari mockup tanpa catatan** (baris 76; topik `perbaikan` atasan ada di mockup).

### 🟢
- I5. Penyusun fakta berurutan dan memuat seluruh sesi untuk dihitung.
- I6. Regex penolakan menambah salah-tolak tanpa menambah privasi.
- Z8. Detail implementasi berlebih di spek.
- Z9. `submodule = 'assistant'` memaksa melebarkan kolom `ai_usage_logs` milik PR #15.
- Z10. Status dokumen masih "spek" padahal sudah diimplementasikan.
- Z11. Dua tabel triase membuat spek gemuk.

Triase: lihat `goldfish_review_report.md` (egm-resolve) setelah tahap 9.

---
# Tahap 8 — zoom-out lanjutan (ronde 2)

Kesimpulan reviewer: satu keputusan desain menghapus sebagian besar mitigasi kritik: keluarkan nama orang dari teks jawaban model, dan (opsional) jadikan penjawab deterministik jalur utama POC.

## 🔴
- R1. Pemetaan tampilan wajib mengikuti B0 §5.1 (`pimpinan`, `role_leader` → atasan; `eta_admin` → super, sementara fakta `hr` seperti butir peralihan B0). Jangan tolak.
- R2. Bagian Alternatif dan Risiko, singkat (5–6 butir).

## 🟡
- Y1. Penjawab aturan (`RULES` mockup, sudah ada sebagai penyedia tiruan) sebagai jalur utama POC, LLM di balik flag kedua. Bila LLM tetap di POC: persempit klaim baris 13 menjadi "fakta dari server tanpa nama" dan catat teks pertanyaan sebagai risiko sisa.
- Y2. Hapus kode samaran: hanya `wawancaraTim` yang memakainya. Kirim angka saja ke model; daftar nama dikirim server sebagai field terstruktur di luar `answer`. Menghapus tabrakan "K3", `restoreNames`, nama tertinggal di log/ekspor setelah hapus akun.
- Y3. Kunci halaman "Buka …": server kirim kunci, web hanya tampilkan tombol bila `routeOpen(page, view)` lolos; undangan karyawan → `iv`.
- Y4. Registri `registerFactBuilder/Page/View` dan retensi per tenant spekulatif (YAGNI): array biasa dan satu konstanta/env.

## 🟢
- G1 kontrak teks polos satu kalimat; G2 facade store berlebihan, cukup assert "tampilan hr hanya dengan cakupan HR"; G3 agregat SQL catat sebagai risiko; G4 kuota per tenant spekulatif; G5 regex/SQL/tabel triase pindah ke PR/egm.
