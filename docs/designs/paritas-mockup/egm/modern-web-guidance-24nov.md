# Audit modern-web-guidance: layar demo ELGOS (24 Nov)

Lingkup: jalan-jalan demo di `apps/web/e2e/demo-alur.spec.ts` dan UI bersama yang disentuhnya (`src/ui/UiDialog`,
`UiDataTable`, `UiSegmented`, `UiTabs`, `UiField`/`UiErrorSummary`, drawer dan top bar di `src/components`, panel Asisten
ELGOS). Alat: CLI `modern-web-guidance` (skill-version 2026_10_12-dacb5911); semua kutipan di bawah dikutip dari keluaran CLI
`retrieve`, diambil 24 Nov. Batasan: tata letak tidak berubah (snapshot
paritas mockup tetap), hanya perbaikan berisiko rendah sebelum demo 25 Nov. Test: `apps/web/e2e/modern-web-guidance.spec.ts`.

## Guide yang dipakai

- `tabs`: Saya menghapus `aria-controls` dari `UiTabs`, karena panel yang tidak terpilih tidak dirender (v-if), jadi
  IDREF-nya menggantung; guide: "Do not add `aria-controls` to the tabs: no screen reader uses it."
- `dialog`: Saya menambahkan penahan gulir ke `UiDialog` dan tidak mengunci gulir di body; guide: "without them,
  scrolling over the backdrop or inside the dialog scrolls the page behind it".
- `light-dismiss-a-dialog`: Saya sengaja tidak memasang `closedby="any"`, karena dialog ELGOS berisi formulir dan
  konfirmasi "tinggalkan tanpa menyimpan"; guide sendiri menyebut `closedby` hanya peningkatan: "light dismiss behavior
  for a `<dialog>` element using `closedby="any"` can be considered a progressive enhancement."
- `platform-controls-dismiss-dialog`: Saya memastikan Esc dan gestur kembali sudah ditangani oleh `showModal()` (dikunci
  test: Esc menutup, fokus kembali ke tombol pembuka); guide: "there is no specific change developers need to make if
  they are already using the `<dialog>` element."
- `html`: Saya memakai aturan dialog native untuk memeriksa `UiDialog` (sudah `showModal()` dengan tombol Tutup
  terlihat); guide: "DO provide a visible control for closing modal overlays".
- `accessibility`: Saya menjalankan pemeriksaan otomatis IDREF di layar demo (setara aturan axe `aria-valid-attr-value`),
  yang menemukan `aria-controls` menggantung di `UiTabs` dan `OfflinePanel`; guide: "Run Automated checks via axe-core
  or Lighthouse audits". Guide ini tidak punya aturan eksplisit tentang validitas IDREF; dasar perbaikannya adalah
  aturan `tabs` di atas dan spesifikasi WAI-ARIA (IDREF harus menunjuk elemen yang ada).
- `navigation-drawer`: Saya menilai drawer layar sempit sebagai modal, tetapi menundanya karena demo di desktop; guide:
  "Apply `aria-modal=\"true\"` while the drawer is open, and remove it when it closes."
- `sortable-table`: Saya memeriksa `UiDataTable` (tombol di dalam `<th>`, `aria-sort`, label tetap nama kolom) dan
  hanya menemukan pengumuman urutan yang belum ada; guide: "Use the single `role=\"status\"` element instead".
- `responsive-table`: Saya tidak menambah `tabindex="0"` pada pembungkus gulir tabel sekarang; guide: "Add a
  `tabindex=\"0\"` attribute to the container, to ensure that people using only a keyboard can consistently scroll the table."
- `forms`: Saya memeriksa `UiField` (sudah `aria-invalid` dan `aria-describedby`); guide: "DO set `aria-invalid=\"true\"`
  on form controls that fail custom validation, and clear it once resolved."
- `performance`: Saya memeriksa pemuatan font (fontsource, di-bundle sendiri) dan menunda preload; guide: "DO preload
  critical fonts".
- `dark-mode`: Saya memeriksa tema gelap (`color-scheme` sudah di `:root` per tema); guide: "MANDATORY: Apply the
  `color-scheme` property to the `html` element or the `:root` pseudo-class."
- `color`: Saya tidak mengubah warna (paritas mockup); kontras diperiksa terhadap "Maintain 4.5:1 for normal text".

## Temuan

### Diperbaiki

1. `UiTabs` (bersama): `aria-controls` menunjuk panel yang tidak ada di DOM pada setiap layar demo bertab (Training
   Needs, DNA, LD, LIM, CP, Core Competencies). Atribut dihapus. Tanpa perubahan piksel.
2. `OfflinePanel` (Learning Delivery, tab Pelatihan offline): tombol "Jalankan lewat EliteMentor" menunjuk `#ld-form-em`
   yang belum dirender. `aria-controls` kini hanya dipasang saat form terbuka.
3. `UiDialog` (bersama): roda tetikus di atas backdrop menggulir halaman di belakang dialog modal (mis. dialog
   "Tugaskan wawancara akar masalah" di demo HR). Ditambah `overscroll-behavior: contain` pada `.el-dialog:modal` dan
   `::backdrop` (+ `overflow: hidden` pada backdrop). Limited availability (Safari belum), peningkatan progresif
   tanpa fallback sesuai guide; tanpa perubahan piksel.

### Dilewati (dan alasannya)

- `closedby="any"` (light dismiss) di `UiDialog`: dialog berisi formulir; klik tak sengaja di backdrop membuang isian.
- Hapus jebakan Tab manual di `UiDialog` (guide: jangan pakai focus trap pada modal native): keputusan triase P8 yang
  sudah diuji; mengubah perilaku keyboard sehari sebelum demo tidak sepadan.
- Judul dialog `h2` ke `h1` (guide `dialog`/`html`): sudah konsisten satu tingkat; banyak test menaut level heading.
- Tab tidak dibungkus ke baris kedua (guide `tabs`): `flex-wrap` adalah bagian tata letak mockup; mengubahnya mengubah piksel di layar sempit.

### Tindak lanjut

- Drawer layar sempit sebagai modal: `role="dialog"` + `aria-modal` saat melayang (butuh pembungkus karena `<nav>` tidak
  boleh ber-role dialog), dan skip link ikut inert saat drawer terbuka.
- `tabindex="0"` pada tabpanel yang tidak berisi elemen fokus, dan pada pembungkus gulir tabel hanya saat meluap
  (guide `accessibility`: "Use `tabindex` only when necessary", jadi bukan tab stop tetap di setiap tabel).
- `UiDataTable`: satu `role="status"` tersembunyi yang mengumumkan kolom dan arah urutan.
- Preload woff2 Roboto 400/500 lewat plugin Vite (`<link rel="preload" as="font" crossorigin>`).
- `<meta name="color-scheme" content="light dark">` di `index.html` untuk mengurangi kilat putih sebelum JS
  menerapkan tema (perlu dicek terhadap pilihan tema tersimpan).
