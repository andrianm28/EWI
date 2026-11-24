# P7 · Code review (dua sumbu, mandiri)

Titik tetap: `eb92274` (awal worktree). Commit: `9991f7e` spek, `ea4ebe2` test merah LD/CP, `03eda5e` LD/CP, `c1baeba` test merah CV/peran/dashboard, `30bfbd3` CV/peran/dashboard, lalu perbaikan review. Skill: `mattpocock-skills:code-review` (dua sumbu dikerjakan sendiri karena sesi tanpa tool Agent; sesi induk menjalankan `egm:egm-codebase-details` independen).

## Standards (CLAUDE.md + B0)

- Bahasa: semua teks UI dan komentar baru berbahasa Indonesia, nama produk "ELGOS". OK.
- Arsitektur 1–7: tidak ada perubahan API, migrasi, auth, atau kode bersama `src/ui` (UiStatus tidak diubah, K-3). OK.
- B0 token: hanya `--el-*`. Satu komentar menyebut hex mockup (`#ECEFF5`) sebagai rujukan, bukan nilai. OK.
- B0 aksesibilitas: chip status tetap berteks; tombol pilih baris CP punya nama ("Pilih {nama}") dan `aria-pressed`; input file tersembunyi tetap berlabel (`Pilih berkas foto atau video`) dan dipicu tombol nyata; `<details>` berteks. OK.
- Judgement call, Duplicated Code: gaya kotak `.mod` mockup kini ada di `ld-mod`, `cc-mod`, `cp-mod`, `iv-finding`. Diterima untuk P7 (T3 "angkat ke ui/ bila ≥2 paket" masih terbuka, keputusan komponen bersama di luar lingkup). `[⏳ DITERIMA]`
- Judgement call, gaya sebaris: `CareerPromotionView.vue` dan `ProgramSection.vue` menambah beberapa `style="…"` mengikuti pola file yang sudah ada. `[⏳ DITERIMA]`
- Judgement call: `statusSub(row)` dipanggil dua kali per sel CP (v-if dan isi). Murah; dibiarkan. `[⏳ DITERIMA]`
- Pemberitahuan sukses dibungkus `<div role="status" v-if>`: wilayah live yang disisipkan bersama isinya bisa tidak dibacakan di sebagian pembaca layar. Perilaku sama dengan `<p role="status" v-if>` sebelumnya, jadi tidak ada regresi. `[⏳ DITERIMA]`

## Spec (p7-sisa.md)

- Temuan diperbaiki: LD-15 "{n} berkas foto atau video terunggah" menghitung semua dokumen termasuk materi, sedangkan baris Dokumentasi menghitung foto/video saja. Diseragamkan lewat `mediaCount` (foto + video). `[✅ DIPERBAIKI]`
- LD-8 test awal mengharapkan "siapkan jadwal"; label cek lengkap "jadwal dan tempat" lebih sesuai `CHECK_LABEL`. Test disesuaikan. `[✅ DIPERBAIKI]`
- IV-3: usulan gap juga menyebut awalan "model" di baris audit; tidak diambil karena label AI datang dari API (`aiLabel`). Dicatat di drift. `[⏳ DITERIMA]`
- CV-2: spek awal menyebut "ambang = target program"; implementasi memakai band tertinggi (K-P7-4, dengan nilai lulus sebagai batas bawah). Dicatat di drift.
- Lingkup: tidak ada perilaku di luar spek. Fitur kelola LD/CP tidak dibuang (K-P7-2).

Ringkasan: Standards 4 judgement call (semua diterima), Spec 2 diperbaiki + 2 dicatat. Terburuk per sumbu: Standards = duplikasi gaya `.mod` (menunggu T3); Spec = hitungan dokumentasi LD-15 (sudah diperbaiki).

## Review independen (sesi induk, 23 Nov)

Review egm independen atas P7 setelah digabung ke cabang integrasi (22b32a0). Triase di cabang `paritas-p7-triase`, test-first: merah c8c4f41, lalu hijau di commit berikutnya.

| # | Bobot | Temuan | Triase |
| --- | --- | --- | --- |
| 1 | tinggi | CFG-2: label integrasi diganti "tersambung", padahal B11 §7/§13 mewajibkan "Terkonfigurasi" dan tidak ada uji koneksi langsung | `[✅ DIPERBAIKI]` Dikembalikan ke "Terkonfigurasi (SSO · sync-back)"; CFG-2 ditandai **Tidak dikerjakan** dengan alasan di gaps-peran dan p7-sisa; test admin-tenant disesuaikan |
| 2 | tinggi | ADM-1: `AdminNav` dihapus, sedangkan HR dan Super Admin masih bisa membuka /admin/* lewat alamat (routes.ts) dan kini tidak punya jalan antar Pengguna, Jabatan, Impor | `[✅ DIPERBAIKI]` `AdminLinks.vue`: baris tautan ringkas antar tiga layar, hanya bila `session.activeView !== 'admin'`; menu laci tidak ditambah (tetap 1:1 mockup). Komentar "SEMENTARA sampai B2" di routes.ts diperbarui. e2e baru untuk tampilan hr |
| 3 | sedang | TenantsView: undangan gagal tampil di note hijau (success) | `[✅ DIPERBAIKI]` `noticeTone` = `warning` bila `invitation === 'failed'`; e2e super-admin mengharapkan `.el-note--warning` |
| 4 | sedang | CV-2: `avgCompleted` null menghasilkan bar berwarna; skala ambang belum dicek di API | `[✅ DIPERBAIKI]` Null = bar primer. API dicek: `passScore`, `bands[].min`, dan skor nilai sama-sama divalidasi 0–100 (`cca/program-report.js`, impor `cca-program-results`), jadi ambang tetap; dicatat di K-P7-4 beserta catatan bahwa band dihitung dari skor akhir |
| 5 | sedang | OfflinePanel: reset kehadiran ke "Belum dicatat" mungkin hilang | `[⏳ DITERIMA]` Riwayat dicek (eb92274): UI lama hanya punya "Hadir" dan "Tidak hadir", tidak ada tombol kembali ke "Belum dicatat". Tidak ada fungsi yang hilang, jadi tidak dipulihkan |
| 6 | sedang | OfflinePanel: `accept` menerima PDF tetapi copy hanya menyebut foto atau video | `[✅ DIPERBAIKI]` PDF dipertahankan (materi pelatihan); kalimat bantu di bawah tombol: materi PDF bisa diunggah, tercatat sebagai Materi, tidak dihitung sebagai foto atau video |
| 7 | sedang | "Jalankan lewat EliteMentor" tanpa `aria-expanded` dan fokus tidak pindah; belum ada e2e dengan `webhookSync: true` | `[✅ DIPERBAIKI]` `aria-expanded` + `aria-controls`, fokus ke `#ld-kode-asesmen`; e2e baru (klik, kolom muncul dan terfokus, kirim `mode: 'elitementor'`) |
| 8 | sedang | LD: info halaman tidak di `role="status"`; "Lihat saran" tidak memindah fokus | `[✅ DIPERBAIKI]` Info dibungkus `role="status"`; "Lihat saran" membuka Ringkasan lalu memfokuskan judul "Saran tindakan untuk HR" (`tabindex="-1"`) |
| 9 | rendah | CP: tombol pilih baris memakai `aria-pressed` (semantik sakelar); summary "Tambah catatan" tanpa nama karyawan | `[✅ DIPERBAIKI]` `aria-current="true"` (sorotan `:has()` ikut); summary berisi nama sr-only "untuk {nama}" |
| 10 | rendah | Penghitung "Pertanyaan n dari batas" bisa melewati batas bila AI mengirim penutup | `[✅ DIPERBAIKI]` `Math.min(n, batas)`; e2e dengan 6 giliran AI dan batas 5 |
| 11 | sedang | Fitur yang dipindah ke `<details>` belum dites: Batalkan pelatihan, klik Tandai selesai, Tambah/Tambah semua di "Ubah daftar peserta" | `[✅ DIPERBAIKI]` e2e baru memeriksa isi PATCH (`status: 'done'`, `status: 'cancelled'`) dan PUT peserta (`jobRoleId`, `userIds`) |
| 12 | rendah | Dokumen: kata rute CV-5, copy CP-9 dan footer "data indikatif" yang dibuang, beda copy LD-12 | `[✅ DIPERBAIKI]` CV-5 menyebut `/cc?tab=aiv`. Footer "Data karyawan G sampai O adalah data indikatif" sengaja tidak dibawa (catatan data contoh prototipe) dan dicatat di CP-9. LD-12 diselaraskan: "Materi pelatihan", peserta "Ubah" + sub "dari jabatan …", dokumentasi "Tambah"; materi tetap "Tandai siap" karena API hanya punya flag `materialsReady` (dicatat) |
