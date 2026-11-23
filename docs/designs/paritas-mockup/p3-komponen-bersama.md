# P3 · Komponen bersama (paritas mockup)

Bagian dari [rencana paritas](README.md). Lingkup: tiga pola mockup Pak Eji yang berulang di banyak layar dan saat ini dibuat ulang per layar atau tidak ada sama sekali. Ketiganya dijadikan komponen di `apps/web/src/ui` lalu dipasang di layar yang tercantum. `b15-lim` tidak disentuh (dikerjakan thread lain).

Acuan domain: B0 (`docs/designs/b0-fondasi-ui.md` bagian 4 dan 5.3), B4, B5 bagian 16, B9, B10.

## Layar mockup

`/mnt/project-files/mockup-pak-eji/Main.dc.html`: `.bc` (baris 124–125), `.card.t` + `.btn.t.sm` (60, 72), `.row.lk` (87–88). Kartu Agen AI: baris 308 (CC Visi & Misi), 332 (CC Nilai), 392 (DNA), 478 (TNA), 708 (INA). Breadcrumb: 297, 389, 476, 524, 706, 726, 781, 809, 837, 939 (LD), 1120 (CP). Baris klik: 319/377 (CC), 504 (TNA kompetensi), 1790 (Pareto dashboard → `open(c.id)`).

## Gap yang ditutup

| Gap | Layar | Perbaikan |
| --- | --- | --- |
| lna P1, CC-1 | `/cc` tab Corporate Vision & Mission | `UiAgentCard` "Wawancara pimpinan dan karyawan" di bawah subjudul tab, tombol "Buka wawancara AI" ke `?tab=aiv` hanya bila flag `cca.interview` menyala |
| CV-1 (bagian kartu) | `/cc` tab Corporate Values | `UiAgentCard` "Wawancara nilai" di atas `ProgramSection`, tombol sama dengan CC-1 |
| DN-1 | `/dna` | `UiAgentCard` "Validasi kamus kompetensi" di bawah subjudul. Tanpa tombol (lihat Keputusan K-P3-2) |
| TN-1 | `/tna` (papan gap) | `UiAgentCard` "Wawancara akar masalah" di antara h1 dan subjudul, tombol "Contoh wawancara" ke `iv` bila `routeOpen('iv')` |
| IN-2, IN-3 | `/ina` | Kartu buatan sendiri diganti `UiAgentCard` "Verifikasi tindakan perbaikan" di antara h1 dan subjudul, copy mockup. Tabel verifikasi pindah ke kartu sendiri "Verifikasi AI" di bawah daftar tindakan (hanya `manage` + flag). Tanpa tombol (K-P3-2) |
| lna P3, shell T2, DN-2, modul X-3 (kecuali LIM) | semua breadcrumb buatan sendiri | `UiBreadcrumb` di CC, DNA, TNA, Detail gap, sesi IV ("Training Needs › Wawancara akar masalah", mockup baris 549), LI (Library, Program, Permintaan, Draf); baru di LD ("Learning Delivery"), CP ("Career & Promotion"), INA (IN-1, "Learning Needs Analysis › Improvement Needs") |
| lna P2 (sebagian) | `UiDataTable` | Prop `rowTo` membuat baris bisa diklik (lihat Desain) |
| TN-7 | `/tna?tab=kompetensi` | Kolom Kode (pertama, mono) ditambahkan; baris klik → Detail gap. Orang/Status wawancara dipertahankan (K-P3-3) |
| (TN-11 bagian klik) | `/tna?tab=okr` | Baris klik → Detail gap (sama dengan tabel kompetensi) |
| D1 | Dashboard, kartu Pareto | Baris gap kompetensi menjadi tautan ke `tna-gap` bila `routeOpen('tna-gap')`; baris temuan tanpa kompetensi tetap teks |
| CC-3 (bagian klik saja) | `/cc` tabel persyaratan (VM dan Values) | Baris klik membuka panel ubah persyaratan baris itu (K-P3-4). Pengurangan kolom tetap P5 |

## Desain komponen

### `UiAgentCard`

```
<UiAgentCard title="Wawancara akar masalah" action="Contoh wawancara" :to="ivOpen ? { name: 'iv' } : null">
  Setiap gap kompetensi diwawancarai AI …
</UiAgentCard>
```

- Props: `title` (tanpa awalan; komponen menulis "Agen AI · {title}"), `action?` (label tombol), `to?: RouteLocationRaw | null`. Chip selalu "Pilot" dan judul selalu `h2` (semua kartu mockup sama; prop tambahan dihapus saat review, Speculative Generality).
- Tampilan = `.card.t` mockup: `UiCard tonal`, baris flex `justify-content: space-between`, kiri judul tebal + `UiChip tone="review"` + teks muted (slot default, `margin-top: 4px`), kanan `UiButton variant="tonal" size="sm"`. Margin bawah 16px. Di bawah 600px tombol turun ke bawah teks (`flex-wrap`).
- Tombol hanya dirender bila `action` dan `to` ada. Pemanggil menentukan `to` dengan `routeOpen()` atau flag, sehingga tidak ada tombol ke layar yang tertutup.
- Judul memakai elemen heading `h2` bergaya 14px/500 supaya pembaca layar bisa melompat ke kartu; `data-testid` diteruskan lewat atribut.

### `UiBreadcrumb`

```
<UiBreadcrumb :items="[{ label: 'Training Needs', to: { name: 'tna', query: { tab } } }, { label: 'Detail gap' }]" />
```

- `<nav aria-label="Lokasi" class="el-bc"><ol>…</ol></nav>`; butir terakhir `aria-current="page"`.
- Gaya `.bc`: 12px, `--el-on-surface-variant`, margin bawah 8px, flex `gap: 6px`, `flex-wrap`. Pemisah "›" (`aria-hidden="true"`) di antara butir. Butir dengan `to` menjadi `RouterLink` warna `--el-primary` bergaris bawah.
- Teks butir persis mockup `.bc` (induk LNA bukan tautan karena di mockup juga bukan tautan).
- Kelas lama `tna-bc`, `cc-crumb`, dan `<p class="el-muted">` breadcrumb dihapus.

### `UiDataTable` baris klik

- Prop baru `rowTo?: (row) => RouteLocationRaw | null | undefined` dan `rowLinkKey?: string` (default kolom pertama).
- Bila `rowTo(row)` memberi tujuan: isi sel `rowLinkKey` dibungkus `RouterLink` (`el-table__link`, satu-satunya titik fokus keyboard per baris, nama aksesibel = isi sel), `<tr>` mendapat kelas `is-link` (kursor penunjuk, hover `--el-surface-1` seperti `.row.lk`) dan klik di mana pun pada baris memanggil `router.push`. Klik yang berasal dari elemen interaktif (`a`, `button`, `input`, `select`, `textarea`, `label`, `summary`) atau saat ada teks terseleksi diabaikan, sehingga tombol di sel lain tetap bekerja. Ctrl/Cmd/klik tengah pada tautan tetap perilaku peramban.
- Baris dengan `rowTo` = null tetap biasa. Header sort tidak berubah (pengurutan terjadi pada `sorted`, tautan mengikuti baris).

## Keputusan

- **K-P3-1** Kartu Agen AI selalu tampil di layar terkait (mockup 1:1); yang dijaga adalah tombolnya. Pengecualian INA: kartu hanya tampil bila flag `ina.ai_verification` menyala, karena teksnya menjanjikan fitur yang di balik flag (perilaku sebelumnya, B9).
- **K-P3-2** DNA dan INA tanpa tombol. Di mockup keduanya menuju `aiv` (wawancara visi/misi/nilai B10), padahal fitur yang dijelaskan kartu berbeda: validasi kamus DACUM belum ada di aplikasi, dan verifikasi INA dimulai per tindakan ("Verifikasi lewat AI"). Tombol ke `aiv` akan menyesatkan. `[⏳ DITUNDA]` sampai paket pemilik (B4, B9) punya layar tujuan.
- **K-P3-3** TN-7: kolom Orang dan Status wawancara **dipertahankan** di tabel gap. Detail gap memang menampilkan karyawan dan sesinya, tetapi HR memakai kolom status untuk memindai gap mana yang belum diwawancarai tanpa membuka satu per satu (spek B5 bagian 16); pengurangan kolom menunggu keputusan butir 7 gaps-lna (dibawa ke P5). Kolom Kode ditambahkan.
- **K-P3-4** CC tidak punya layar "detail gap" untuk persyaratan visi/misi/nilai (persyaratan B10 bukan kompetensi B5, jadi `tna-gap` tidak bisa memuatnya). Sampai CC-3/TD-1 diputuskan di P5, klik baris membuka panel ubah persyaratan itu lewat query `?ubah=<id>` (bisa dibagikan, tombol Kembali menutup). Tombol Ubah/Validasi/Tolak tetap di kolom Tindakan.
- **K-P3-5** Data tambahan dari API (aditif, tanpa migrasi): `code` pada baris `GET /tna/gaps/competencies` (kolom `lna_competencies.code` sudah ada) dan `competencyId` pada baris Pareto `GET /dashboard` (sudah dihitung `rankTrainingNeeds`, hanya tidak dikirim). Keduanya tidak mengubah otorisasi atau cakupan RG-3.
- **K-P3-7** Breadcrumb B7 (`b7-tinjauan/AntreanView.vue`, `TinjauanView.vue`) masuk bersama B7 dan dipindah ke `UiBreadcrumb` setelah triase B7. AA-1 (breadcrumb Wawancara AI untuk atasan) tidak masuk P3 dan dibawa ke P5.
- **K-P3-8** Kartu INA juga disembunyikan saat data INA gagal dimuat: ringkasan galat menggantikan isi layar, dan kartu yang menjanjikan verifikasi tidak relevan tanpa data.
- **K-P3-9** Klik tengah dan Ctrl/Cmd/Shift-klik di sel non-tautan membuka tab baru (perilaku tautan peramban). Seleksi teks hanya menghalangi klik bila seleksinya di baris yang sama. Tidak ada test e2e untuk penjaga seleksi: mouse down Playwright selalu menghapus seleksi lebih dulu.
- **K-P3-10** CC: tombol Ubah juga menavigasi ke `?ubah=<id>`, sehingga URL dan panel selalu selaras; Batal dan Tambah selalu menghapus `?ubah`; id yang tidak dikenal dihapus dari URL. Klik baris lain saat mengubah tetap menimpa isian yang belum disimpan, sama dengan tombol Ubah sebelumnya. `[⏳ DITERIMA]`
- **K-P3-6** Subjudul CV-1 ("Hasil program 5C Elitery …") tidak ditambahkan: teksnya spesifik klien dan sumbernya datang dari data program. Tetap di P5/P7. X-2 (varian chip terisi untuk status) di luar tugas ini dan bergantung pada keputusan K-3 (UiStatus global tidak diubah).

## Test (e2e, API di-mock)

- [x] `e2e/ui-kit.spec.ts`: `UiAgentCard` (judul "Agen AI · …", chip Pilot, tombol tonal bila `to`; tanpa `to` tidak ada tombol); `UiBreadcrumb` (`navigation "Lokasi"`, induk tautan, butir terakhir `aria-current`, 12px); tabel klik baris (klik sel non-tautan berpindah, Tab memfokus tautan lalu Enter berpindah, sort tetap). Snapshot `ui-kit-*` diperbarui.
- [x] Per layar, di spec modulnya (mock API sudah ada di sana, bukan `paritas.spec.ts`): kartu Agen AI di `core-competencies.spec.ts` (VM, Values, tanpa flag `cca.interview` tanpa tombol), `b4-dna.spec.ts` (tanpa tombol), `tna-gap.spec.ts` (tombol ke `/iv`), `improvement-needs.spec.ts`; breadcrumb `nav "Lokasi"` 12px di `ld.spec.ts`, `b16-cp.spec.ts`, `li.spec.ts` (Library, Program, Permintaan), CC, DNA, TNA, Detail gap, INA.
- [x] `e2e/tna-gap.spec.ts`: kolom Kode tampil; klik sel Target pada baris membuka Detail gap; tautan nama tetap bisa difokus.
- [x] `e2e/dashboard.spec.ts`: baris Pareto kompetensi adalah tautan ke `/tna/gap?kind=competency&competencyId=…` bila flag papan menyala; tanpa flag tidak ada tautan.
- [x] `e2e/core-competencies.spec.ts`: klik baris persyaratan membuka panel ubah untuk baris itu.
- [x] `e2e/improvement-needs.spec.ts`: kartu Agen AI berisi copy mockup; tabel verifikasi di kartu "Verifikasi AI".
- [x] API unit: `tna-gaps.test.js` (`code` ikut di baris kompetensi), `dashboard.test.js` (`competencyId` di baris Pareto).

## File

- [x] `apps/web/src/ui/UiAgentCard.vue`, `UiBreadcrumb.vue` (baru), `UiDataTable.vue`, `index.ts`
- [x] `apps/web/src/screens/ui-kit/UiKitView.vue`
- [x] `apps/web/src/screens/b10-core-competencies/CoreCompetenciesView.vue`, `RequirementsTab.vue`, `cc.css`
- [x] `apps/web/src/screens/b4-dna/DevelopmentNeedsView.vue`
- [x] `apps/web/src/screens/b5-tna/TnaScreen.vue`, `TnaGapView.vue`, `api.ts`, `tna.css`
- [x] `apps/web/src/screens/b6-iv/IvSessionView.vue`
- [x] `apps/web/src/screens/b9-ina/ImprovementNeedsView.vue`
- [x] `apps/web/src/screens/b13-li/LibraryView.vue`, `ProgramView.vue`, `RequestsView.vue`, `DraftView.vue`
- [x] `apps/web/src/screens/b14-ld/LearningDeliveryView.vue`, `b16-cp/CareerPromotionView.vue`
- [x] `apps/web/src/screens/b3-dashboard/DashboardView.vue`, `apps/web/src/api/dashboard.ts`
- [x] `apps/api/src/modules/tna/gaps.js`, `apps/api/src/modules/dashboard/index.js` + test unit
- [x] `docs/designs/b0-fondasi-ui.md` bagian 4

## Review spek

Subagent `egm:egm-design` / `egm:egm-implementation-readiness` tidak bisa dijalankan: sesi subagent ini tidak punya tool Agent. Pengganti: tinjauan mandiri dengan daftar periksa kedua skill (arsitektur, kontrak komponen, aksesibilitas, kesiapan test), dicatat di sini agar induk bisa menjalankan review asli saat penggabungan.

| # | Temuan | Triase |
| --- | --- | --- |
| R-1 | Seluruh baris bisa diklik tetapi hanya satu tautan per baris: pembaca layar tidak mendengar "baris dapat diklik" | **Terima**: pola ini sama dengan "stretched link"; nama tautan = isi sel kunci, cukup untuk WCAG 2.4.4. `rowLinkKey` dipilih kolom nama, bukan kolom Kode yang bisa kosong |
| R-2 | `UiDataTable` jadi bergantung pada router | **Terima**: `UiButton` sudah memakai `RouterLink`; komponen tetap bisa dipakai tanpa `rowTo` |
| R-3 | K-P3-4 (klik baris CC membuka panel ubah) bukan perilaku mockup | **Terima dengan catatan**: tidak ada layar tujuan yang benar; dicatat sebagai sementara sampai P5 |
| R-4 | Perubahan API di tahap UI | **Terima**: aditif, satu field masing-masing, dengan test unit; tanpa migrasi dan tanpa perubahan otorisasi |
| R-5 | Test port: `ui-kit.spec.ts` mengeraskan `http://localhost:4174` | **Perbaiki**: pakai origin halaman, supaya gate bisa jalan di port lain (worktree paralel) |
