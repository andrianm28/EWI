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
