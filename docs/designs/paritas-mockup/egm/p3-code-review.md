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
