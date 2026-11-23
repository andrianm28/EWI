# B7 web · Tinjauan temuan AI per gap (paritas mockup)

Bagian dari [rencana paritas](README.md). Melanjutkan paket [B7](../b7-tinjauan-hr.md) (backend sudah ada, PR #24) dengan layar web yang tertunda di checklist B7 ("`apps/web/src/screens/b7-tinjauan/` (rute `review`), hapus `screens/legacy-review`, e2e"). Diambil alih dari thread T5.

Penanda: `[⚠️ BELUM TERVERIFIKASI]` asumsi belum dikonfirmasi; `[⏳ DITERIMA]` kekurangan yang sengaja diterima; `[❓ PERLU KEPUTUSAN]` beda mockup dengan spek proyek, ditanyakan ke user.

## Tujuan

HR membuka "Tinjauan temuan AI" dari detail gap Training Needs, mengklasifikasi tiap temuan AI gap itu dengan tiga pilihan mockup, lalu menjalankan solusi: modul rekomendasi ditugaskan ke EliteMentor (atau dibuat rencananya dan diekspor ke LMS klien) dan temuan non-pelatihan diteruskan ke Improvement Needs.

## Layar mockup

`tools/mockup-render/Main.dc.html` baris 671–702 (template `s.review`) dan 1926–1944, 2163–2166 (logika `rev`, `modRec`, `sendEM`, `makeIna`). Foto: `mock-shots/hr--review.png`, `mock-shots/atasan--review.png`.

1. Breadcrumb `Training Needs › Tinjauan HR`. Tautan kembali ke asal gap (mockup `goBack` = `st.back`, yaitu tab Training Needs asal gap, bukan Detail gap).
2. h1 "Tinjauan temuan AI"; subjudul "{nama gap}. HR memastikan klasifikasi sebelum solusi dijalankan; AI tidak memutuskan sendiri."
3. Grid dua kolom (`el-grid el-grid-2`, rata atas). Kiri `UiCard` "Temuan dan klasifikasi": tiap temuan = teks + muted "· AI {n}%", lalu tiga tombol terpisah (`.rad` mockup) Training Needs / Improvement Needs / Perlu ditinjau HR.
4. Kanan: `UiCard` "Solusi pelatihan" + `UiChip tone=training` "Training Needs": kotak modul (kode mono, nama, meta), tombol "Tugaskan di EliteMentor" (ikon `open_in_new`) + catatan kecil; setelah terkirim `UiNote success` "Penugasan terkirim ke EliteMentor. Progres akan tersinkron kembali ke ELGOS."; tanpa temuan pelatihan: "Belum ada temuan yang diklasifikasi sebagai pelatihan."
5. `UiCard` "Tindakan perbaikan" + `UiChip tone=improvement` "Improvement Needs": teks penjelasan, tombol "Buat tindakan di Improvement Needs"; tanpa temuan: "Belum ada temuan non-pelatihan."

## Gap yang ditutup

| Gap | Perbaikan |
| --- | --- |
| lna RV-1 | Rute baru `review` per gap dengan tata letak mockup (UiCard, UiSegmented, UiChip, UiNote) |
| lna RV-2 | h1 "Tinjauan temuan AI" (28px, `el-h1`) |
| shell S5 | Judul top bar rute `review` = "Tinjauan HR" (TITLES.review mockup) |
| README "sisa Tailwind" untuk `ReviewView.vue` | Antrean lama ditulis ulang dengan token/komponen ELGOS (tanpa kelas Tailwind) |

Tidak ditutup: RV-3 dan TD-6 (akses atasan), lihat Keputusan.

## Keputusan

1. **Rute.** `review` (nama dari B0 §5.3), path `/tna/tinjauan`, query = rujukan gap yang sama dengan `/tna/gap` (`kind`, `competencyId` | `metricType`, `name`, `period`) + `tab` asal. `meta`: `views: ['hr','admin','super']`, `roles: ['hr_admin','eta_admin']`, `submodule: 'tna'`, `flag: 'tna.review_workspace'`, `menuKey: 'tna'`, `title: 'Tinjauan HR'`. Flag di meta karena semua endpoint tulis layar ini di balik flag itu (B7 "Di balik flag baru"); tanpa flag, tombol di detail gap kembali ke antrean lama.
2. **Akses atasan** `[❓ PERLU KEPUTUSAN]` (RV-3, TD-6). Mockup `atasan--review` identik dengan HR. Spek B7 menetapkan semua endpoint tinjauan hanya HR (`requireRole(HR_ADMIN)`, atasan 403), sejalan dengan PM-5/PD-14 (draf hanya HR) dan PM-6 (temuan non-pelatihan hanya lewat izin). Spek proyek diikuti: atasan tidak mendapat rute maupun tombol "Langsung ke tinjauan HR". Bila user memilih mockup, perlu perubahan API (cakupan `visibleEmployeeScope`, draf terlihat atasan) dan keputusan ulang PM-5.
3. **Per gap di API (perubahan kecil, test dulu).** `GET /api/tna/review` dan `GET /api/tna/review/solutions` menerima filter gap opsional dengan parameter yang sama seperti `GET /tna/gaps/detail`. Keanggotaan temuan di gap memakai aturan R6 yang sudah ada (`findingsByGap` di `modules/tna/gaps.js`: kompetensi temuan, baris kinerja temuan, atau fokus sesi bila tak tertaut), jadi layar per gap dan klasifikasi papan gap memakai satu definisi. Dengan filter gap:
   - `data` dan `counts` (termasuk `held`, `overdue`) dihitung dari temuan gap itu saja; parameter `status` tetap berlaku untuk `data`.
   - Respons `GET /review` menambah `gap: { key, label }`; `label` = nama kompetensi (dari `stores.dna.getCompetency`, tenant sendiri) atau nama metrik OKR. Kompetensi tidak ada di tenant → `404`.
   - Rujukan gap tidak valid → `400` (pesan sama dengan `/gaps/detail`).
   - Tanpa filter gap, perilaku dan respons tidak berubah (antrean lama dan test lama tetap).
   - Audit `readIndividual` tetap hanya memuat baris yang dikirim. Tetap hanya HR; `tenant_id` dari `req.tenantId`; tidak ada migrasi. `GET /review` tetap tanpa flag, `/review/solutions` tetap di balik `tna.review_workspace`.
   - Kolom tambahan internal untuk pencocokan (`metricType`, `metricPeriod`, fokus sesi) tidak ikut di respons.
4. **Pilihan awal temuan draf.** Mockup memilih saran AI sebelum HR menyentuh apa pun. Di aplikasi temuan draf belum diputus, jadi tidak ada tombol yang aktif; saran AI ditulis di baris meta: "· AI 90% · saran AI: Training Needs" (`suggestedClassification`). Menampilkan saran sebagai pilihan aktif akan terlihat seperti keputusan yang sudah tersimpan ("AI tidak memutuskan sendiri"). Temuan diputus: tombol sesuai `category`; temuan ditahan: "Perlu ditinjau HR".
5. **Tombol klasifikasi** memakai `UiSegmented` dengan dua tambahan kecil di komponen bersama (reviewer Andrian): `variant="chips"` (tombol terpisah gaya `.rad` mockup: radius 8px, tinggi 32px, jarak 6px, pilihan aktif `secondary-container` + garis `primary`) dan `disabled` per opsi. Dinonaktifkan: "Perlu ditinjau HR" untuk temuan yang sudah diputus (API `409 ALREADY_REVIEWED`), dan ketiga tombol untuk temuan yang sudah ditindaklanjuti (punya rencana training di `solutions` atau `handedOffAt`; API `409 ALREADY_ACTIONED`). Pilihan disimpan langsung (`POST /findings/:id/classify`); selama permintaan berjalan tombol baris itu nonaktif; galat API tampil di `UiErrorSummary` dan pilihan kembali ke nilai server.
6. **Nama karyawan** ditampilkan muted di baris meta temuan (mockup menggabungkan temuan per gap tanpa nama; di aplikasi temuan per orang, dan dua orang bisa punya teks sama). HR boleh melihat semua karyawan (RG-3). Tanpa transkrip (PO-6): layar hanya memakai `title`, tidak memuat `detail` maupun giliran.
7. **Temuan ditolak** tidak ditampilkan di layar per gap; menolak dan mengubah teks tetap di antrean lama (fitur kelola di luar mockup dipindah ke tautan sekunder "Ubah teks atau tolak temuan di antrean tinjauan" di bawah kartu temuan).
8. **Solusi pelatihan.** Data dari `GET /review/solutions` per gap.
   - Kotak modul: rencana terbaru yang punya course (`planItem.catalogItemRef/Title`), selain itu `recommendation` pertama. Kode = `ref`, nama = `title`, meta = "Level {Basic|Intermediate|Advanced} · {kompetensi}" (bagian yang kosong dilewati). Tanpa course: "Belum ada modul yang cocok di katalog. Rencana dibuat sebagai kebutuhan modul baru." `[⏳ DITERIMA]` mockup menulis sumber roadmap DACUM; API belum punya sumber itu.
   - `delivery.assignAvailable` benar: tombol "Tugaskan di EliteMentor" → untuk tiap temuan pelatihan gap ini: `POST /findings/:id/plan` bila belum ada rencana, lalu `POST /plan-items/:id/assign` bila belum `sent` (B7 alur 3). Catatan: "Satu klik. Bila klien tidak memakai EliteMentor, gap diekspor ke LMS klien." (frasa "masuk lewat SSO" dihapus: SSO EliteMentor di luar B7, flag `em.sso`). Semua `sent` → `UiNote success` mockup.
   - Salah (termasuk tenant pilot `lms_export`): tombol "Buat rencana" (hanya plan), catatan "Organisasi Anda belajar di {label}. Buat rencana, lalu unduh daftar gap untuk diunggah ke sana."; setelah semua punya rencana: `UiNote success` "Rencana dibuat. Unduh daftar gap untuk {label}." + tombol outlined "Unduh daftar gap (CSV)" (`lna.downloadGapCsv`).
   - Galat per temuan dikumpulkan ke `UiErrorSummary`; yang berhasil tetap tersimpan, data dimuat ulang.
9. **Tindakan perbaikan.** Temuan non-pelatihan dari `solutions.improvement`. Tombol "Buat tindakan di Improvement Needs" → `POST /review/improvement-handoff` dengan temuan yang belum diteruskan. Hasil: `UiNote success` "{n} temuan diteruskan ke Improvement Needs." (spek B7 butir 6: tindakan dibuat modul B9, jadi bukan "tindakan perbaikan dibuat" seperti mockup). Semua sudah diteruskan sebelumnya → note yang sama dengan jumlah total. `inaEnabled` salah → tombol tidak tampil, muted "Modul Improvement Needs belum aktif untuk organisasi Anda."
10. **Detail gap** (`TnaGapView.vue`): "Langsung ke tinjauan HR" menuju `review` dengan query gap + tab bila `routeOpen('review')`, selain itu antrean lama `tna-review` (perilaku sekarang). Tetap hanya HR.
11. **Dashboard "Tinjau"** (`review_pending`, B3) menunjuk antrean `tna-review` saja: angkanya seluruh tenant, sedangkan `review` butuh rujukan gap. Mockup `go.review` dari dashboard membuka layar tanpa gap; tidak bisa dipetakan tanpa memilih gap. Spek B3 3.5 diperbarui.
12. **Temuan beku** (persetujuan wawancara ditarik, B8) tidak tampil di layar per gap maupun hitungannya: tidak bisa diklasifikasi (`409 CONSENT_WITHDRAWN`). Antrean lama tetap menampilkan yang sudah diputus sebagai riwayat.
13. **Antrean lama** tetap ada sebagai antrean lintas karyawan (dirujuk banner Pengelolaan TNA, dashboard, dan test). Dipindah dari `views/ReviewView.vue` + `screens/legacy-review/` ke `screens/b7-tinjauan/AntreanView.vue`; nama rute `tna-review`, path `/m/tna/review`, judul "Tinjauan hasil AI" tidak berubah. Ditulis ulang dengan `UiCard`, `UiButton`, `UiChip`, `UiTabs`, `UiField`, `UiStatus`, `UiErrorSummary`; teks, `data-testid`, dan perilaku sama. Tabel B0 §5.3/§4 diperbarui.

## Test (TDD, merah dulu)

API `apps/api/tests/integration/tinjauan-hr.test.js` (Postgres), blok baru "per gap":
- [x] `GET /review?kind=competency&competencyId=…&status=all`: hanya temuan kompetensi itu (termasuk temuan tanpa kompetensi dari sesi berfokus gap itu), `counts` per gap, `gap.label` = nama kompetensi; tanpa transkrip.
- [x] Gap OKR lewat baris kinerja temuan.
- [x] Rujukan tidak valid → 400; kompetensi tenant lain → 404; atasan → 403.
- [x] `GET /review/solutions?kind=…`: hanya temuan gap itu.

E2E `apps/web/e2e/b7-tinjauan.spec.ts` (mock `page.route` lewat `mockApi`, `loginSebagai`):
- [x] Dari detail gap HR: "Langsung ke tinjauan HR" membuka `/tna/tinjauan?…`; breadcrumb, h1, subjudul dengan nama gap; judul top bar "Tinjauan HR"; tautan breadcrumb kembali ke `/tna?tab=kompetensi`.
- [x] Daftar temuan dengan "· AI 90%", saran AI untuk draf, tombol aktif sesuai keputusan; klik Improvement Needs mengirim `classify` `improvement` dan tombol menjadi aktif; "Perlu ditinjau HR" nonaktif untuk temuan yang sudah diputus.
- [x] Solusi: kotak modul (kode, nama, level); "Tugaskan di EliteMentor" mengirim plan lalu assign; note terkirim.
- [x] `lms_export`: "Buat rencana" hanya plan, lalu tombol unduh CSV.
- [x] "Buat tindakan di Improvement Needs" mengirim handoff dan menampilkan "n temuan diteruskan ke Improvement Needs."
- [x] Tanpa temuan pelatihan/non-pelatihan: teks kosong mockup.
- [x] Flag `tna.review_workspace` mati: tombol di detail gap ke antrean lama; `/tna/tinjauan` memantul ke beranda.
- [x] Atasan: `/tna/tinjauan` memantul; tombol tidak ada (test lama tna-gap tetap).
- [x] Respons tidak memuat/menampilkan `detail` (PO-6): teks rincian tidak muncul.
- [x] Antrean lama: test `poc-dna-tna`, `shell`, `alur/batas-akses` tetap hijau; tidak ada kelas Tailwind di `AntreanView.vue` (test statis sederhana di e2e lewat cek kelas `el-card` pada item).
- [x] Snapshot visual layar tinjauan HR 1440 (dibandingkan dengan `hr--review.png`).

## Checklist file

- [x] `docs/designs/paritas-mockup/b7-tinjauan-web.md` (dokumen ini)
- [x] `apps/api/src/modules/tna/index.js` (`GET /review` filter gap), `review-workspace.js` (`/review/solutions` filter gap, helper filter), `gaps.js` (ekspor helper kunci gap temuan bila perlu), `gap-routes.js` (parser rujukan gap dipindah agar bisa dipakai bersama)
- [x] `apps/api/src/db/lna-stores.js` (kolom pencocokan di `REVIEW_COLS` dan `listReviewedForSolutions`)
- [x] `apps/api/tests/integration/tinjauan-hr.test.js`
- [x] `apps/web/src/screens/b7-tinjauan/routes.ts`, `TinjauanView.vue`, `AntreanView.vue`, `api.ts`, `b7.css`
- [x] hapus `apps/web/src/screens/legacy-review/`, `apps/web/src/views/ReviewView.vue`
- [x] `apps/web/src/ui/UiSegmented.vue` (`variant`, `disabled` per opsi)
- [x] `apps/web/src/screens/b5-tna/TnaGapView.vue` (tujuan tombol)
- [x] `apps/web/src/api/lna.ts` (parameter gap)
- [x] `apps/web/e2e/b7-tinjauan.spec.ts`, `apps/web/e2e/support/tinjauan.ts`
- [x] `docs/designs/b0-fondasi-ui.md` (UiSegmented, tabel rute), `docs/designs/b7-tinjauan-hr.md` (checklist web, filter gap)

Reviewer wajib: Andrian (perubahan API, kode bersama `UiSegmented`, router paket).

## Review spek (langkah 2)

Subagent `egm:egm-design` dan `egm:egm-implementation-readiness` tidak tersedia di sesi ini (tool Agent tidak ada untuk subagent pelaksana). Pengganti: tinjauan mandiri dengan dua lensa yang sama sebelum test ditulis. `[⚠️ BELUM TERVERIFIKASI]` review independen egm diulang sesi induk.

| Temuan | Triase |
| --- | --- |
| Per gap butuh definisi keanggotaan temuan; API belum punya filter | **Perbaiki**: filter gap di API memakai R6 yang sudah ada (keputusan 3), test API merah dulu |
| Nama gap untuk subjudul: memanggil `/gaps/detail` akan mengaudit seluruh karyawan gap hanya untuk label | **Perbaiki**: `GET /review` mengembalikan `gap.label` |
| Dashboard `review_pending` ikut terbuka ke `review` tanpa gap (layar kosong) | **Perbaiki**: keputusan 11 |
| Saran AI dipilihkan seperti mockup | **Tolak**: menyesatkan (keputusan 4) |
| Filter gap di `GET /review` tanpa flag baru (CLAUDE.md aturan 3) | **Tolak dengan alasan**: hanya mempersempit bacaan yang sudah ada, HR saja, tanpa perilaku tulis; rute web di balik `tna.review_workspace` |
