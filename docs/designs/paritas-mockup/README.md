# Paritas UI ELGOS dengan mockup Pak Eji (audit 23 Nov 2026)

Acuan: mockup final Pak Eji (keputusan user 19 Nov), salinan di `tools/mockup-render/Main.dc.html` (asli di project files `mockup-pak-eji/`). Yang dibandingkan: `apps/web` di `claude/project-thread-scbrmb` head `524dead` (sudah termasuk PR #38).

## Cara membandingkan

1. **Mockup.** Runtime artifact (`support.js`) tidak ikut tersalin, jadi `tools/mockup-render/support.js` mengimplementasikan ulang format `.dc.html` seminimal mungkin: `{{ }}`, `sc-if`, `sc-for`, `onX`, dan `DCLogic.setState`. `node tools/mockup-render/catalog.cjs <folder>` memotret 70 state (5 peran, semua tab dan langkah utama) beserta teks `innerText`-nya.
2. **Aplikasi.** Semua e2e dijalankan dengan `screenshot: { mode: 'on', fullPage: true }`, sehingga ada satu PNG akhir untuk setiap test (API di-mock). Untuk state yang tidak tercakup, dibuat spec sementara di luar repo.
3. Satu reviewer untuk tiap grup layar membandingkan screenshot berdampingan, lalu membaca kode layar supaya setiap gap menunjuk `file:baris`.

Data demo boleh berbeda. Yang dinilai: struktur, urutan bagian, teks statis, komponen, token, ikon, menu, dan state. Keputusan proyek yang sudah tercatat (PD-10 login lewat tautan email, flag, RG-3, privasi transkrip, aturan arsitektur 1) tidak dihitung sebagai gap.

## Hasil

| Grup | File | Tinggi | Sedang | Rendah | Total |
| --- | --- | --- | --- | --- | --- |
| Shell, token, login, dashboard | [gaps-shell.md](gaps-shell.md) | 1 | 7 | 13 | 21 |
| LNA: Core Competencies, DNA, TNA, tinjauan, INA | [gaps-lna.md](gaps-lna.md) | 10 | 30 | 39 | 79 |
| Modul 2–5: LI, LD, LIM, CP | [gaps-modul.md](gaps-modul.md) | 8 | 28 | 37 | 73 |
| Karyawan, Admin Tenant, Super Admin | [gaps-peran.md](gaps-peran.md) | 1 | 16 | 33 | 50 |
| **Jumlah** | | **20** | **81** | **122** | **223** |

Asisten ELGOS tercatat di dua grup (S1 dan X-1 peran), jadi butir tinggi yang unik ada 19.

Yang sudah sama: 27 token warna `:root`, menu kelima peran (fungsi `N`) kecuali butir HR tambahan "Permintaan data karyawan", struktur dua panel login, dan kerangka dashboard.

### Layar mockup yang belum ada di aplikasi

| Layar | Pemilik paket | Catatan |
| --- | --- | --- |
| Panel Asisten ELGOS (FAB + chat di semua layar) | B17 (T5) | API dan flag `assistant` sudah ada, `ShellExtra.vue` belum |
| Tinjauan temuan AI per gap (HR) | B7 (T5) | Masih memakai `views/ReviewView.vue` POC lama |
| Alur wawancara ulang LIM (chat → benchmark → hasil bisnis → ringkasan) | B15 tahap 3 (T7) | Antrean saja yang ada |
| EliteMentor di dalam shell (belajar online, check-in offline) | perlu keputusan | Aturan arsitektur 1 mengarah ke deep link |

### Bug tampilan yang pasti (bukan soal selera)

- LI: kelas `li-*` hanya didefinisikan di `<style>` milik `LibraryView.vue`. Bila Program, Permintaan, atau Draf dibuka langsung, tata letaknya rusak (gaps-modul X-1).
- Top bar pecah dua baris di lebar 1280 px saat pemilih Tampilan muncul (gaps-shell S2).
- Hasil saya: `.b8-list` menimpa margin `.b8-sub`, sehingga catatan undangan menempel ke tabel (gaps-peran).
- Sisa gaya Tailwind POC di luar token: `/masuk` (`EmailLinkView.vue`), bagian "Pengelolaan TNA" di `/tna`, dan `ReviewView.vue`.

## Rencana PR (semua berbasis scbrmb, kecil, satu tema per PR)

| PR | Isi | Gap |
| --- | --- | --- |
| P1 | Audit ini + alat render mockup (dokumen saja) | - |
| P2 | Bug tampilan pasti: CSS LI bersama, top bar 1280, margin Hasil saya | X-1, LI-26, S2, b8 |
| P3 | Komponen bersama: `UiAgentCard`, `UiBreadcrumb`, varian chip terisi untuk status, baris tabel bisa diklik | CC-1, CV-1, DN-1, TN-1, X-2, X-3, D1, TN-7 |
| P4 | Login langkah 2 dan `/masuk` mengikuti tata letak login | L1–L7 |
| P5 | LNA: tabel CC/INA kembali ke kolom mockup, sintesis CCA berupa daftar tema, Pengelolaan TNA dipindah | CC-3, AH-6, TN-2, IN-7 |
| P6 | LI: filter chip, baris modul, wizard dua kolom | LI-5, LI-7, LI-27 |
| P7 | LD, LIM, CP, karyawan, admin, super: copy dan komponen bobot sedang/rendah | sisanya |

Layar yang belum ada (Asisten, Tinjauan per gap, wawancara ulang LIM) dikerjakan pemilik paketnya. Thread paritas memeriksa hasilnya dengan katalog yang sama.
