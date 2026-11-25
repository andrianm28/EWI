# P3 · Review diff (mattpocock-skills:code-review)

Titik tetap: `57144a8` (HEAD awal worktree, akhir P2). Commit: 9dbee51 (spek), ed64e51 (test merah), 973157c (kode hijau), lalu commit triase ini.

Catatan proses: sesi subagent P3 tidak punya tool Agent, jadi dua sumbu skill dan `egm:egm-codebase-details` tidak bisa dijalankan sebagai subagent terpisah. Kedua sumbu dijalankan berurutan oleh agen yang sama dengan daftar periksa skill (Standards = CLAUDE.md + B0 + baseline smell Fowler; Spec = `p3-komponen-bersama.md`). Disarankan induk menjalankan review subagent asli sebelum PR.

## Standards (CLAUDE.md, B0)

| # | Temuan | Jenis | Triase |
| --- | --- | --- | --- |
| S-1 | `UiAgentCard` punya prop `chip` dan `headingLevel` yang tidak dipakai pemanggil mana pun (Speculative Generality) | penilaian | **Perbaiki**: kedua prop dihapus; chip selalu "Pilot", judul `h2`. B0 dan spek diperbarui |
| S-2 | `detailLink` di `TnaScreen.vue` diubah menerima `Record<string, unknown>` lalu di-cast | penilaian | **Perbaiki**: kembali ke `CompetencyGap \| OkrGap`; generic `UiDataTable` sudah menyimpulkan tipe baris |
| S-3 | Pola `routeOpen(x, …) ? { name: x } : null` muncul di `TnaScreen.vue` dan `DashboardView.vue` (Duplicated Code ringan) | penilaian | **Tolak**: dua baris, masing-masing dengan rute dan bentuk tujuan berbeda; helper tidak menambah kejelasan |
| S-4 | CLAUDE.md aturan 3: fitur baru di balik flag | aturan | **Bukan pelanggaran**: tidak ada fitur baru; kartu, breadcrumb, dan baris klik adalah tampilan atas fitur yang sudah bergerbang (`cca.interview`, `tna.gap_board`, `ina.ai_verification`, `routeOpen`) |
| S-5 | CLAUDE.md aturan 2 dan RG-3 pada perubahan API | aturan | **Lolos**: `code` dan `competencyId` aditif pada baris yang sudah difilter `tenant_id` dan cakupan; tidak ada query baru |
| S-6 | Fokus keyboard baris tabel dan Pareto | B0 aksesibilitas | **Lolos**: satu `RouterLink` per baris, cincin `:focus-visible` global (style.css), diuji dengan Tab/Enter di `/ui-kit` dan `tna-gap` |
| S-7 | Kelas lama `tna-bc`, `cc-crumb` | kebersihan | **Lolos**: dihapus, `grep` kosong |

## Spec (p3-komponen-bersama.md)

| # | Temuan | Triase |
| --- | --- | --- |
| P-1 | Bagian Test menyebut `e2e/paritas.spec.ts`, padahal test ditaruh di spec modul masing-masing | **Perbaiki spek**: mock API layar sudah ada di spec modul; daftar test di spek diperbarui |
| P-2 | Kartu INA juga tampil untuk atasan berakses dan pimpinan (tingkat ringkasan) | **Terima**: K-P3-1 mensyaratkan flag saja; teks kartu umum dan tidak membuka data |
| P-3 | Breadcrumb Wawancara AI (AA-1/AIV-1) dan label kembali dinamis Detail gap (TD-1) tidak dikerjakan | **Tunda**: di luar lingkup P3 (AA-1 terkait K-5, TD-1 terkait CC-3 di P5); `UiBreadcrumb` siap dipakai |
| P-4 | Klik baris CC membuka panel ubah, bukan Detail gap seperti mockup | **Terima dengan catatan** (K-P3-4): persyaratan B10 tidak punya layar detail; diputuskan ulang di P5 |
| P-5 | TN-7 kolom Orang/Status tidak dipindah | **Terima** (K-P3-3): tetap, dicatat |
| Lingkup tambahan | Baris Gap OKR ikut bisa diklik; breadcrumb INA (IN-1) | **Terima**: memakai prop yang sama, keduanya gap tercatat (TN-11 bagian klik, IN-1) |

## Goldfish (pengganti `egm:egm-codebase-details`, tinjauan mandiri)

| # | Bobot | Temuan | Triase |
| --- | --- | --- | --- |
| G-1 | sedang | `RouterLink` induk breadcrumb mendapat `aria-current="page"` bila tujuannya rute yang sama (terlihat di `/ui-kit`) | **Perbaiki contoh**: tautan contoh di `/ui-kit` ke `/`. Di layar produk induk selalu rute lain |
| G-2 | ringan | `?ubah=` yang menunjuk baris di grup lain (VM vs Values) diabaikan diam-diam | **Terima**: tiap tab memuat grupnya sendiri; id dari tab lain tidak berlaku |
| G-3 | ringan | `ui-kit.spec.ts` mengeraskan port 4174 | **Perbaiki**: memakai origin halaman |
| G-4 | ringan | Snapshot `ui-kit-*` berubah | **Perbaiki**: diperbarui, gambar terang dan gelap diperiksa. Snapshot dashboard tidak berubah (flag papan gap mati di test snapshot) |

Ringkasan: Standards 7 butir (terberat S-1, diperbaiki), Spec 5 + lingkup (terberat P-4, diterima dengan catatan), goldfish 4 (terberat G-1, diperbaiki).

## Review independen (sesi induk, 23 Nov)

Reviewer `egm:egm-codebase-details` (C) dan `egm:egm-implementation-readiness` (R) dijalankan terpisah atas P3. Test merah dibuat dulu (Ctrl/klik tengah, Ubah/Batal ↔ `?ubah`, nama aksesibel Pareto), lalu diperbaiki.

| # | Bobot | Temuan | Triase |
| --- | --- | --- | --- |
| C-1 / R-6 | sedang | Ctrl/Cmd/Shift-klik di sel non-tautan berpindah di tab yang sama; klik tengah tidak berbuat apa-apa | **Perbaiki**: tab baru lewat `router.resolve`, `@auxclick`; test |
| C-2 | sedang | Tombol Ubah dan Tambah tidak memperbarui `?ubah`; Batal bisa meninggalkan `?ubah` basi sehingga klik baris berikutnya tidak membuka apa pun | **Perbaiki**: Ubah menavigasi ke `?ubah=<id>`; Batal/Tambah selalu menghapus; test (K-P3-10) |
| C-3 | rendah | Seleksi teks di mana pun di halaman menghalangi klik baris | **Perbaiki**: hanya seleksi di baris itu (tanpa test e2e, K-P3-9) |
| C-4 | rendah | Daftar elemen interaktif kurang lengkap; kontrol di sel tautan bersarang di dalam tautan | **Perbaiki**: daftar diperluas; komentar melarang kontrol di sel `rowLinkKey` |
| C-5 | rendah | Nama aksesibel tautan Pareto memuat seluruh isi kartu | **Perbaiki**: `aria-label` "{label}, {n} orang"; test |
| C-6 | rendah | Kartu Agen AI LIM belum memakai `UiAgentCard` | **Tunda**: LIM milik thread B15 |
| R-1 | besar | Klaim T2/X-3 lebih luas dari kenyataan: breadcrumb B7 dan AA-1 | **Perbaiki**: klaim dipersempit (K-P3-7); B7 dipindah setelah triase B7; AA-1 ke P5 |
| R-2 | besar | Status gap di gaps-*.md belum diperbarui | **Perbaiki**: status Ditutup/Sebagian/Terbuka per baris |
| R-3 | nit | Breadcrumb sesi IV tidak sama dengan mockup | **Perbaiki**: "Training Needs › Wawancara akar masalah"; test di `iv.spec.ts` |
| R-4 | nit | Kartu INA tersembunyi saat galat muat tanpa keputusan | **Perbaiki**: K-P3-8 |
| R-5 | nit | Jalur tanpa test | **Perbaiki sebagian**: INA flag mati, tombol di baris bertautan tidak menavigasi. Tidak ditambah: baris `rowTo` null (belum ada pemakai), tab Values, Breadcrumb Draf |
| R-7 | nit | `?ubah` tak dikenal tertinggal; isian belum disimpan tertimpa | **Perbaiki** bagian pertama; bagian kedua `[⏳ DITERIMA]` |
| R-8 | nit | Test integrasi API tidak memeriksa `code`; Draf tanpa test breadcrumb | **Tunda**: test unit `tna-gaps` sudah memeriksa `code` |

Hasil: e2e 275 lulus, lint dan `vue-tsc` bersih.
