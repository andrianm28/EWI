# B3 · Dashboard utama HR dan Dashboard tim atasan

Status: spek final setelah review dan implementasi, 19 Nov 2026. Paket B3 dari rencana bangun penuh mockup Pak Eji. Menumpuk di atas B0 (`docs/designs/b0-fondasi-ui.md`).

Sumber acuan:

- Mockup Pak Eji, layar `dash` (blok `<!-- DASHBOARD UTAMA -->` di `Main.dc.html`; data di `renderVals` bagian "dashboard utama").
- Brief bangun penuh 19 Nov, bagian T1 dan default K1.
- Keputusan: RG-3 (cakupan lihat), PM-5 (draf AI hanya untuk HR), PM-2 D (persetujuan HR saat review = pemantauan, bukan angka akurasi resmi), PO-5 C (85% target yang dikejar, jawaban Pak Eji 18 Nov di Sheet Ronde 4; rekap master masih menulis ⏳ `[⚠️ BELUM TERVERIFIKASI]`), LIN-B20 (target pilot ≥ 85%), LIN-B1 (TNA ≤ 2 minggu), PM-6/K1 (temuan non-pelatihan: HR default, atasan hanya dengan akses dari HR), BT-30 (rumus Pareto, `tna/pareto.js`).

## 1. Tujuan

HR membuka ELGOS dan langsung melihat keadaan seluruh modul: berapa pegawai sudah dianalisis, gap apa yang paling besar, seberapa sering HR setuju dengan AI, berapa lama analisis berjalan, dan apa yang menunggu tindakannya. Atasan melihat hal yang sama untuk timnya saja.

Semua angka berasal dari data tenant. Tidak ada angka demo mockup yang dibawa.

## 2. Layar yang dicakup

Satu layar `dash`, dua tampilan:

| Tampilan | Judul | Cakupan data |
| --- | --- | --- |
| HR / L&D (`hr_admin`) | Dashboard utama | seluruh karyawan tenant |
| Atasan (`supervisor`) | Dashboard tim | bawahan langsung saja |

Bagian layar, urutan mockup: kartu KPI → Status modul → Pareto 20/80 → Perlu tindakan.

- API juga melayani `eta_admin` seperti HR, tetapi di web Admin ETA memakai tampilan Super Admin (B0) dan berandanya Tenant (B12), jadi tidak mendapat layar ini. Rute memuat `eta_admin` di `meta.roles` supaya kelak bisa dipakai bila Admin ETA mendapat tampilan HR (K2).
- `pimpinan` dan `role_leader` dipetakan ke tampilan Atasan, tetapi API menolak mereka. Rute memakai `meta.roles: ['hr_admin', 'eta_admin', 'supervisor']`, jadi mereka tetap di Beranda lama tanpa butir Dashboard.
- Mockup: subjudul "Peran aktif" diganti kalimat ringkas (peran sudah tampil di bilah atas). Catatan "Kepatuhan … ketentuan OJK" **tidak dibawa**: default K3 melarang klaim OJK sampai legal setuju, dan catatan kepatuhan sudah ada di pil audit bilah atas (B0).

## 3. API

### 3.1 Endpoint

`GET /api/dashboard` (modul baru `apps/api/src/modules/dashboard/`).

- Dipasang di `app.js` di bawah `auth` + `tenantContext()`, di balik **flag baru `dashboard.main`** (default mati) lewat `requireFlag`, hanya bila `stores.people`, `stores.interviews`, `stores.tna`, `stores.dna` tersedia (pola `/employees`). Router: `dashboardRouter({ stores, flags, entitlements, settings, audit })`; `entitlements` ditambahkan ke pemanggilan di `app.js`.
- **Bukan submodul**: dashboard merangkum beberapa modul, jadi tidak lewat `requireSubmodule()` (sama seperti `/api/employees`). Sebagai gantinya tiap bagian respons hanya diisi bila modul sumbernya terbuka untuk tenant (entitlement + flag, aturan yang sama dengan `requireSubmodule`). Bagian yang modulnya tertutup bernilai `null`.
- `tenant_id` hanya dari `req.tenantId`.
- Peran: `hr_admin`, `eta_admin`, `supervisor`. Peran lain → 403 `ROLE_FORBIDDEN`. Gerbang flag diperiksa lebih dulu: selama `dashboard.main` mati semua peran mendapat 403 `FEATURE_DISABLED`.
- Cakupan: dari `scopeFor()` → `visibleEmployeeScope()`. Untuk atasan, id dirinya sendiri dikeluarkan dari cakupan supaya "tim" berarti bawahan langsung (sama dengan `GET /tna/findings/non-training`). Atasan tanpa bawahan mendapat dashboard kosong, bukan galat.
- Audit (R2-2, gagal-tertutup: audit gagal → 500, data tidak dikirim):
  - **Atasan:** `audit.readIndividual(req, 'dashboard.summary', { employeeIds })` dengan **semua** id bawahan dalam cakupan. Agregat tim kecil bisa menunjuk orang.
  - **HR:** `audit.record(req, 'read', 'dashboard.summary', { scope: 'all', people })`, ringkas tanpa daftar id. Dashboard adalah halaman mendarat; menulis seluruh id tenant di setiap login tidak menambah jejak yang berguna.
  - **HR, baris Pareto berjudul:** temuan pelatihan tanpa kompetensi dikelompokkan dengan judul temuannya (`tna/pareto.js`), jadi labelnya isi individu. Bila baris seperti itu ikut terkirim, `audit.readIndividual(req, 'dashboard.pareto', { employeeIds })` mencatat karyawan di baliknya.
  - Komentar `core/audit/index.js` diperbarui (kode bersama: reviewer Andrian).

### 3.2 Respons

```jsonc
{
  "data": {
    "scope": "all",                    // "all" (HR) | "team" (atasan)
    "people": 42,                      // jumlah karyawan dalam cakupan (peran learner, supervisor, role_leader, sme)
    "kpis": {
      "employeesAnalyzed": 6,          // lihat 3.3; null bila DNA dan TNA sama-sama tertutup
      "competencyGaps": 5,             // null bila DNA tertutup
      "okrGaps": 3,                    // null bila TNA tertutup
      "aiHrAgreement": { "percent": 88, "approved": 22, "reviewed": 25, "targetPercent": 85 }, // hanya HR; null untuk atasan atau TNA tertutup
      "analysisDays": { "median": 11, "sessions": 9, "targetDays": 14 }                        // hanya HR; null untuk atasan, TNA tertutup, atau belum ada sesi
    },
    "modules": [                       // HR: 5 modul; atasan: modul yang ada di menunya (lna, lim, cp)
      { "no": 1, "key": "lna", "active": true, "parts": [ { "key": "cca", "active": false }, { "key": "dna", "active": true }, { "key": "tna", "active": true }, { "key": "ina", "active": false } ] },
      { "no": 2, "key": "li", "active": false },
      { "no": 3, "key": "ld", "active": false },
      { "no": 4, "key": "lim", "active": false },
      { "no": 5, "key": "cp", "active": false }
    ],
    "pareto": {                        // null bila TNA tertutup
      "rows": [ { "key": "…", "label": "Root Cause Analysis", "people": 4, "score": 6.2, "share": 0.41, "cumulativeShare": 0.41, "hot": true } ],
      "total": 7,                      // jumlah kebutuhan seluruh peringkat, sebelum dipotong 7 baris
      "hotCount": 2                    // dihitung dari seluruh peringkat (bisa lebih dari baris yang dikirim)
    },
    "actions": [ { "key": "review_pending", "count": 4 } ]
  }
}
```

Nama, deskripsi, dan teks tindakan **tidak** dikirim API; web yang memetakannya dari `key` (teks Indonesia di satu tempat).

### 3.3 Definisi angka

| Angka | Definisi | Sumber |
| --- | --- | --- |
| `people` | Karyawan aktif (`status <> 'disabled'`) dalam cakupan dengan peran `learner`, `supervisor`, `role_leader`, `sme`. **Penyebut semua angka per orang** (dianalisis, gap, Pareto, lama analisis, wawancara, rencana, Improvement Needs): baris data orang di luar daftar ini tidak dihitung. Dua pengecualian seluruh tenant, khusus HR: `aiHrAgreement` (putusan HR atas karyawan yang kemudian nonaktif tetap putusan sah) dan `review_pending` (harus sama dengan isi antrean tinjauan). `hr_admin`, `pimpinan`, dan orang tanpa jabatan tidak termasuk penyebut; K2 (HR juga karyawan) belum diterapkan di sini `[⏳ DITERIMA]` | `stores.people.list` |
| `employeesAnalyzed` | Karyawan dalam `people` yang punya minimal satu penilaian DNA (bila DNA terbuka) **atau** minimal satu temuan TNA yang sudah ditinjau HR, pelatihan maupun non-pelatihan (bila TNA terbuka). Temuan non-pelatihan hanya dihitung untuk HR, atau atasan yang diberi akses HR saat flag `tna.non_training_hr` menyala (K1). Sesi selesai yang temuannya masih draf **tidak** dihitung (PM-5), supaya atasan tidak bisa menyimpulkan ada draf | `stores.dna.assessmentsFor`, `stores.tna.listFindings` (hanya `approved`/`edited`) |
| `competencyGaps` | Definisi papan gap B5 (`tna/gaps.js competencyGaps`, `CONTEXT.md` "Gap kompetensi"): jumlah kompetensi **yang sudah disahkan HR** dengan rata-rata skor terbaru karyawan dalam `people` di bawah skor minimal. Kompetensi yang belum dinilai siapa pun bukan gap. Satu kueri kompetensi per kombinasi jabatan dan jenjang | `stores.dna.competenciesForPosition`, `assessmentsFor` |
| `okrGaps` | Definisi papan gap B5 (`tna/gaps.js okrGaps`, `CONTEXT.md` "Gap OKR"): jumlah metrik (jenis + `metricKey(nama)`) yang meleset untuk minimal satu karyawan dalam `people` pada **periode unggahan terbaru** tenant (`performancePeriods()[0]`, urut waktu unggah, bukan urutan teks). Toleransi per KPI (PM-1) sudah masuk di `isMet` | `stores.tna.performancePeriods`, `listPerformance` |
| `aiHrAgreement.percent` | **Hanya HR.** `approved / (approved + edited + rejected)` × 100, dibulatkan; `null` bila belum ada yang ditinjau. Seluruh tenant, hanya temuan hasil job analisis AI (`analysis_job_id` terisi) yang diputus orang (`reviewed_by` terisi), supaya temuan lama yang ditandai massal oleh migrasi `20261117000400` tidak menaikkan angka | store baru `stores.tna.aiReviewCounts` |
| `analysisDays.median` | **Hanya HR** (LIN-B1 adalah metrik waktu HR; untuk atasan selisih jumlah sesi bisa membocorkan draf). Per sesi TNA milik karyawan dalam `people`: hari pecahan dari wawancara selesai (`ended_at`) sampai temuan AI terakhirnya diputus. Hanya sesi yang seluruh temuan AI-nya sudah diputus orang. Median selisih itu dibulatkan ke 0,01 hari lalu ke atas ke hari penuh. `null` bila belum ada sesi | store baru `stores.tna.analysisDurations` (SQL di `lna-stores.js`) |
| `pareto.rows` | Helper bersama `rankFindings()` (`tna/pareto.js`, juga dipakai `GET /tna/pareto`: hitung `missRatio` lewat `evaluate()` lalu `rankTrainingNeeds()`) atas temuan pelatihan yang sudah ditinjau dalam `people`, dengan `settings.tna.pareto`; 7 teratas | sama dengan `GET /tna/pareto` |
| `pareto.rows[].hot` | Baris teratas sampai `cumulativeShare` pertama kali ≥ 0,8 (baris yang melewati 0,8 ikut) | dihitung di modul dashboard |

- `[⚠️ BELUM TERVERIFIKASI]` **Titik awal "waktu analisis".** LIN-B1 hanya menyebut "TNA ≤ 2 minggu" dan LIN-B16 (pembanding dari HR) belum punya data. Spek ini memakai "wawancara selesai → tinjauan HR selesai" (waktu kerja analisis dan HR, tanpa waktu tunggu karyawan). Bila Pak Eji atau Mas Abdan bermaksud lain (misalnya sejak data KPI diunggah), cukup ubah satu kueri.
- **Kesepakatan AI–HR adalah angka pemantauan** (PM-2 D): persentase temuan AI yang disetujui HR tanpa diubah. Bukan angka akurasi resmi 85% (yang diukur dengan golden set, LIN-B20). Layar menuliskan itu di catatan kartu supaya tidak disalahbaca.
- **Hanya HR** yang menerima `aiHrAgreement`, `analysisDays`, dan tindakan `review_pending`: peran lain tidak boleh tahu ada draf (PM-5 ★A, sama dengan `GET /tna/dashboard`).
- Pareto mockup dihitung dari gap skor terhadap Job Competency Model ("−33 poin"). Brief menetapkan `tna/pareto.js` (jumlah orang × besar meleset × kepentingan). Layar menampilkan "n orang · kum. x%" sebagai ganti "−n poin".

### 3.4 Status modul

| No | `key` | Aktif bila |
| --- | --- | --- |
| 1 | `lna` | minimal satu dari `cca`, `dna`, `tna`, `ina` terbuka (entitlement + flag `module.<key>`); `parts` merinci keempatnya |
| 2 | `li` | `li` terbuka: entitlement (`full_suite`) + flag `module.li`, sama dengan `requireSubmodule` di `app.js` |
| 3 | `ld` | `ld` terbuka: entitlement (`full_suite`) + flag `module.ld` |
| 4 | `lim` | produk `full_suite` + flag `module.lim` |
| 5 | `cp` | DNA terbuka + flag `promotion.recommendation` (endpoint ada di `/dna/promotion-candidates`) |

Status "Aktif" memakai gerbang yang sama dengan API modulnya, supaya dashboard tidak menyebut aktif modul yang API-nya menolak. `module.li` dan `module.ld` sudah ada (B13, B14). `module.lim` dibuat B15; sebelum ada, `flags.all()` tidak memuatnya dan modul 4 berstatus tidak aktif. Dashboard tidak mendaftarkan flag itu.

Mockup menampilkan status "Aktif / Baru / Konsep", persen kemajuan, dan satu metrik per modul. Itu data demo tanpa sumber. B3 menampilkan **Aktif** atau **Belum aktif** dari flag, rincian submodul untuk LNA, dan tombol "Buka" bila layarnya sudah terpasang. Tanpa batang persen. `[⏳ DITERIMA]` metrik per modul ditambahkan paket modul masing-masing lewat perubahan kecil di dashboard setelah datanya ada; tidak diuji di B3.

### 3.5 Perlu tindakan

Hanya butir dengan `count > 0` yang dikirim, urutan tetap:

| `key` | Untuk | Hitungan | Syarat |
| --- | --- | --- | --- |
| `review_pending` | HR | temuan berstatus draf seluruh tenant, yaitu isi antrean tinjauan HR (`reviewQueue`, semua kategori, hasil AI maupun bukan) yang dituju tombol "Tinjau" | TNA terbuka |
| `interviews_open` | HR, atasan | sesi TNA terbuka milik karyawan dalam `people`: `in_progress`, atau `scheduled` dengan undangan belum kedaluwarsa (`isOpen` di `tna/gaps.js`, sama dengan B5) | TNA terbuka |
| `plan_needs_module` | HR | butir rencana pelatihan milik karyawan dalam `people` tanpa modul (`needsModule`) yang belum `completed`/`rejected` | TNA terbuka |
| `non_training_findings` | HR; atasan **hanya bila** `hasNonTrainingGrant` | temuan non-pelatihan yang sudah ditinjau, dalam cakupan | TNA terbuka + flag `tna.non_training_hr` |
| `competencies_unapproved` | HR | kompetensi dengan `approvedAt` kosong | DNA terbuka |

- `non_training_findings` menerapkan K1: HR melihat secara bawaan; atasan langsung hanya bila HR memberinya akses. Tanpa akses, butir itu tidak dikirim (bukan dikirim dengan nol), sehingga atasan tidak bisa menyimpulkan ada temuan.
- Tindakan perbaikan lewat tenggat (mockup) menunggu modul Improvement Needs (B9); ditambahkan B9.
- Butir mockup "4 gap menunggu wawancara akar masalah" dipetakan ke `interviews_open` (sesi wawancara yang belum selesai), karena wawancara di ELGOS dibuat per karyawan, bukan per gap.
- `non_training_findings` bersifat **informasi** ("Untuk diketahui"): temuan itu tidak punya status "ditangani" sampai B9, jadi angkanya tidak turun karena tindakan di dashboard.

## 4. Web

- `apps/web/src/screens/b3-dashboard/routes.ts`: `{ path: '/dashboard', name: 'dash', meta: { views: ['hr', 'atasan'], flag: 'dashboard.main', roles: ['hr_admin', 'eta_admin', 'supervisor'] } }`.
- Sesuai kontrak B0 (bagian 5.2, `homeReady`): begitu flag menyala, HR dan atasan mendarat di `/dashboard` setelah login dan butir "Beranda" berganti "Dashboard utama"/"Dashboard tim". Saat flag mati, Beranda lama tetap, butir Beranda tetap, dan tampilan tambahan tidak berubah. Koreksi aturan peralihan B0 sudah masuk PR B0 (#18), bukan di B3.
- E2E shell B0 yang mendaftarkan rute uji `dash` tetap berjalan: di build uji, rute uji menggantikan rute asli bernama sama (B0 5.3). E2E lama lain tidak menyalakan `dashboard.main`, jadi tidak berubah.
- `DashboardView.vue` memakai komponen B0: `UiKpiCard`, `UiCard`, `UiChip`, `UiProgressBar`, `UiButton`, `UiNote`; `src/api/dashboard.ts` untuk tipe dan pemanggilan.
- Teks:
  - KPI HR (4): "Pegawai dianalisis" ("dari n pegawai"), "Gap kompetensi aktif" ("dan n target KPI/OKR meleset"), "Kesepakatan AI–HR" ("target pilot ≥ 85% · pemantauan tinjauan HR"), "Waktu analisis" ("n hari", "median n sesi · target ≤ 14 hari").
  - KPI atasan (2): "Pegawai dianalisis" dan "Gap kompetensi aktif" saja; dua kartu khusus HR tidak dirender (bukan "–").
  - Angka `null` ditampilkan "–" dengan alasannya: "Modul belum aktif" (modul sumber tertutup), "Belum ada temuan yang ditinjau HR" (kesepakatan tanpa data), "Belum ada sesi yang selesai ditinjau" (waktu analisis tanpa data). Bila DNA tertutup tetapi TNA terbuka, kartu gap bernilai "–" dengan catatan "n target KPI/OKR meleset".
  - Status modul: nama dan keterangan modul dari mockup, chip "Aktif"/"Belum aktif" dengan ikon, "Modul n", submodul aktif LNA ("DNA · TNA"). Tombol "Buka" (label aksesibel "Buka <modul>") hanya bila salah satu layar modul bisa dibuka (`routeOpen`): `lna` → `dna`, `tna`, `cc`, `ina`; `li` → `lib`, `prog`, `req`; `ld` → `ld`; `lim` → `lim`; `cp` → `cp`. Atasan: `lna`, `lim`, `cp` (nomor tetap 1, 4, 5).
  - Pareto: judul "Pareto 20/80: gap yang perlu diprioritaskan"; catatan "n dari m kebutuhan menyumbang sekitar 80% total. Mulai dari yang ditandai Prioritas." Tiap baris: label, chip "Prioritas" untuk `hot` (bukan warna saja), "n orang · kum. x%", batang kumulatif (kritis untuk `hot`). Kosong: "Belum ada temuan pelatihan yang disetujui HR." TNA tertutup: "Modul Training Needs belum aktif."
  - Perlu tindakan, urutan tetap di web: `review_pending` ("n temuan AI menunggu tinjauan HR", tombol "Tinjau" ke `review` atau `tna-review`), `interviews_open` ("n wawancara akar masalah belum selesai", ke `tna`), `plan_needs_module` ("n rencana belajar butuh modul baru", ke `tna`), `competencies_unapproved` ("n kompetensi di kamus belum disetujui", ke `dna`), `non_training_findings` ("n temuan di luar pelatihan (Improvement Needs)", ke `ina`). Tombol hanya bila rutenya bisa dibuka. Kosong: "Tidak ada yang menunggu tindakan."
  - Subjudul: HR "Ringkasan seluruh modul ELGOS, dari analisis kebutuhan sampai dampak."; atasan "Ringkasan tim Anda. Hanya bawahan langsung yang dihitung."
- Judul, subjudul, dan jumlah kartu KPI mengikuti `scope` dari respons API (`team` → "Dashboard tim"), bukan tampilan aktif. API menghitung dengan peran utama, jadi akun `hr_admin` + `supervisor` yang beralih ke tampilan Atasan tetap menerima data seluruh tenant dan layar tidak boleh menyebutnya "tim" (B0 5.1).
- Teks tambahan di luar mockup: catatan kartu gap saat TNA tertutup ("kompetensi di bawah standar jabatan"), keterangan satu baris tiap butir Perlu tindakan (`desc`), dan tombol "Lihat" untuk butir selain tinjauan. Keterangan modul 2 menulis "permintaan modul baru" sebagai ganti nama vendor (K4: nama vendor dari konfigurasi tenant).
- Keadaan muat ("Memuat…") dan galat: `UiNote` kritis "Dashboard tidak bisa dimuat. <pesan API>". `UiErrorSummary` khusus galat formulir (B0), jadi tidak dipakai untuk galat muat halaman; tidak ada `role="alert"` global.

## 5. Data dan migrasi

Tidak ada migrasi. Blok `20261119000300`–`…0399` tidak dipakai. Semua angka dihitung dari tabel yang ada. Dua fungsi store baru (`tna.aiReviewCounts`, `tna.analysisDurations`), helper bersama `rankFindings` di `tna/pareto.js`, dan flag baru `dashboard.main` di `src/core/flags`.

## 6. Test

Seam yang diuji (skill `tdd`): HTTP `GET /api/dashboard` (supertest), store Postgres baru, dan layar `/dashboard` lewat browser dengan API di-mock. Fungsi murni `summary.js` diuji langsung karena aturannya (batas 80%, pembulatan, periode terbaru) mudah salah.

Unit (`apps/api/tests/unit/dashboard.test.js`, store tiruan yang mencatat cakupan tiap panggilan + supertest): flag mati → 403; peran lain → 403 tanpa membaca data; HR semua bagian; `eta_admin` seperti HR; atasan hanya bawahan langsung dan tanpa angka yang bergantung pada draf; K1 dengan dan tanpa akses; flag `tna.non_training_hr` mati; atasan tanpa bawahan; modul tertutup → `null` dan datanya tidak dibaca (termasuk flag menyala tanpa entitlement); status modul; audit atasan (id bawahan), audit HR (ringkas), audit gagal → 500; semua pembacaan memakai tenant dari token; `markHot`, `median`, `latestUnmet`, `agreement`.

Integrasi Postgres (`apps/api/tests/integration/dashboard.test.js`): karyawan nonaktif dan temuan non-pelatihan (penyebut `people`, "dianalisis"), `aiReviewCounts` (temuan lama tanpa reviewer tidak dihitung), `analysisDurations` (sesi dengan draf dikecualikan, cakupan), HR ujung ke ujung tanpa data tenant lain, atasan ujung ke ujung dengan audit id bawahan, karyawan ditolak.

E2E (`apps/web/e2e/dashboard.spec.ts`, 14 test): multi-peran di tampilan Atasan memakai label dari `scope`; HR mendarat dengan empat KPI; atasan dua KPI; angka kosong dengan alasan; status modul dan tombol Buka; atasan tiga modul; Pareto dengan chip Prioritas dan kosong; Perlu tindakan dan kosong; galat API; flag mati → Beranda lama; `pimpinan` tetap di Beranda; snapshot terang dan gelap.

Gerbang: `npm run lint`, `npm test`, `npm run build`, `npm run e2e`.

## 7. Perubahan berkas

- [x] `docs/designs/b3-dashboard.md`
- [x] `apps/api/src/core/flags/index.js`: `DASHBOARD_MAIN: 'dashboard.main'`
- [x] `apps/api/src/modules/dashboard/index.js` (router), `summary.js` (fungsi murni)
- [x] `apps/api/src/app.js`: pasang `/dashboard`
- [x] `apps/api/src/db/lna-stores.js`: `tna.aiReviewCounts`, `tna.analysisDurations`
- [x] `apps/api/src/modules/tna/pareto.js`: helper bersama `rankFindings`; `tna/index.js` memakainya
- [x] `apps/api/src/core/audit/index.js`: komentar pengecualian dashboard
- [x] `apps/api/tests/unit/dashboard.test.js`, `tests/integration/dashboard.test.js`
- [x] `apps/web/src/api/dashboard.ts`
- [x] `apps/web/src/screens/b3-dashboard/routes.ts`, `DashboardView.vue`
- [x] ~~`apps/web/src/shell/menu.ts`, `components/AppDrawer.vue`, `docs/designs/b0-fondasi-ui.md`~~: koreksi aturan peralihan pindah ke PR B0 (#18)
- [x] `apps/web/e2e/dashboard.spec.ts`, snapshot `dashboard-hr-terang.png`, `dashboard-hr-gelap.png`
- [x] `docs/ewi/poc-dna-tna.md`: daftar flag bertambah `dashboard.main`

## 8. Asumsi dan risiko yang tersisa

- `[⚠️ BELUM TERVERIFIKASI]` definisi "waktu analisis" (3.3).
- `[⚠️ BELUM TERVERIFIKASI]` dashboard tim hanya untuk `supervisor`. `pimpinan` dan `role_leader` tidak mendapat layar ini (`meta.roles`) dan tetap di Beranda lama. Menunggu definisi lima peran dari B2.
- `[⏳ DITERIMA]` metrik per modul dan persen kemajuan tidak ditampilkan (3.4).
- `[⏳ DITERIMA]` kinerja: dashboard memuat daftar (temuan, kinerja, sesi, rencana) lalu menghitung di Node, seperti `GET /tna/dashboard`, termasuk mendekripsi judul yang hanya dipakai untuk menghitung. Pilot ELGOS L1: puluhan karyawan, beberapa ratus baris; target muat < 1 detik. Tenant ratusan orang (mis. 500 × 10 metrik × 12 periode = 60 ribu baris kinerja) butuh kueri hitung SQL tanpa dekripsi untuk rencana, sesi, dan Improvement Needs, serta kinerja satu periode saja. Dicatat untuk setelah 2 Des; tidak ada test beban.
- Flag `dashboard.main` harus dinyalakan per tenant oleh Admin ETA saat Go/No-Go; sampai itu pengguna tetap melihat Beranda lama.

## 9. Review egm

### Review spek (subagent baru, 19 Nov)

21 temuan: 2 berat, 13 sedang, 6 ringan. Triase:

| # | Temuan | Keputusan |
| --- | --- | --- |
| 7 (berat) | Rute uji `dash` di `shell.spec.ts` bertabrakan dengan `dash` asli | **Perbaiki** di B0 (#18): rute uji menggantikan rute asli bernama sama |
| 17 (berat) | Pemasangan modul tidak bisa dibangun dari spek: `entitlements`, syarat pasang, fixture | **Perbaiki**: tanda tangan router dan syarat pasang di 3.1; store tiruan di test unit |
| 1 | Rujukan PO-5 C | **Perbaiki**: ditandai ⚠️, bersandar juga pada LIN-B20 |
| 2 | Catatan OJK dan "Peran aktif" di mockup | **Perbaiki**: diputuskan di bagian 2 (catatan OJK tidak dibawa, K3) |
| 3 | "gap menunggu wawancara" vs `interviews_open` | **Perbaiki**: pemetaan ditulis di 3.5 |
| 4 | `eta_admin` diizinkan API tetapi tidak bisa membuka layar | **Perbaiki**: dinyatakan di bagian 2 (tampilan Super Admin) |
| 5 | `total`/`hotCount`, pembulatan median, kartu gap saat DNA tertutup | **Perbaiki**: definisi di 3.2, 3.3, 4 |
| 6 | Kalimat audit ambigu | **Perbaiki**: 3.1 |
| 8 | Draf bisa disimpulkan atasan lewat `analysisDays` dan `employeesAnalyzed` | **Perbaiki**: `analysisDays` hanya HR; "dianalisis" = penilaian DNA atau temuan yang sudah ditinjau |
| 9 | Kesepakatan AI–HR ikut temuan non-AI dan temuan lama migrasi | **Perbaiki**: `aiReviewCounts` (job AI + diputus orang) + test integrasi |
| 10 | `okrGaps` menghitung semua periode | **Perbaiki**: periode terbaru per metrik (`latestUnmet`) |
| 11 | Pembilang dan penyebut tidak sehimpunan | **Perbaiki**: semua angka disaring ke `people` |
| 12 | Audit per muat dashboard untuk HR | **Perbaiki**: HR ringkas, atasan individu; komentar audit diperbarui. Reviewer Andrian (kode bersama) |
| 13 | `pimpinan`/`role_leader` mendarat di layar galat | **Perbaiki**: `meta.roles` di rute (B0 menambah gerbang `roles`) |
| 14 | `plan_needs_module` dan `non_training_findings` tidak pernah turun | **Perbaiki sebagian**: status `completed`/`rejected` disaring; non-pelatihan ditandai informasi sampai B9 |
| 15 | `tenant_admin` ditawari tampilan HR | **Perbaiki** di B0 (#18): tampilan tambahan memakai `homeReady` (gerbang lengkap) |
| 16 | Galat memakai `UiNote` | **Tolak**: `UiErrorSummary` khusus galat formulir (B0 bagian 4); galat muat halaman memakai `UiNote` kritis |
| 18 | `analysisDurations` tanpa kontrak | **Perbaiki**: definisi di 3.3, SQL di `lna-stores.js`, test integrasi |
| 19 | `profiles()` tidak bisa dipakai | **Perbaiki**: `competenciesForPosition` + `computeGap().items`; `not_assessed` bukan gap |
| 20 | `missRatio` Pareto tidak disebut | **Perbaiki**: helper bersama `rankFindings` dipakai dua endpoint |
| 21 | Rute tombol Buka, tindakan, bentuk modul atasan | **Perbaiki**: bagian 4 |

### Code review dua sumbu (`mattpocock-skills:code-review`, 19 Nov) dan triasenya

Dijalankan terhadap titik tetap scbrmb dengan dua subagent (Standar = `CLAUDE.md`, Spek = dokumen ini). Ditriase oleh thread penerus setelah plugin egm termuat.

| Sumbu | Temuan | Keputusan |
| --- | --- | --- |
| Spek | `employeesAnalyzed` hanya memakai temuan pelatihan | **Perbaiki**: temuan non-pelatihan yang sudah ditinjau ikut (HR, atau atasan dengan akses K1). Test integrasi merah lalu hijau |
| Spek | `analysisDurations` dan `plan_needs_module` tidak disaring ke `people` | **Perbaiki**: disaring di modul dashboard; test karyawan nonaktif |
| Spek | `review_pending` memakai semua draf, spek menulis "temuan AI" | **Tolak**: tombol "Tinjau" menuju antrean tinjauan HR yang memuat semua draf (`reviewQueue`), jadi angkanya harus sama dengan antrean. Spek 3.5 dikoreksi |
| Spek | Keterangan modul tidak sama dengan mockup | **Perbaiki**: teks mockup, tanpa nama vendor (K4). E2E merah lalu hijau, snapshot diperbarui |
| Spek | Teks tambahan di luar mockup | **Perbaiki**: dicatat di bagian 4 |
| Spek | Daftar flag `dashboard.main` belum ditulis | **Perbaiki**: `docs/ewi/poc-dna-tna.md` |
| Standar | Reviewer Andrian (audit, flags, `app.js`) | **Sudah**: assignee dan reviewer PR |
| Standar | `MODULE_FLAGS` memakai string `module.li/ld/lim` | **Perbaiki**: `FLAGS.MODULE_LI`/`MODULE_LD` dari B13/B14; `module.lim` tetap string sampai B15 menambahkannya |
| Standar | Smell: `interviews_open` ganda, `aiReviewCounts` menyalin `reviewCounts`, handler panjang | **Perbaiki sebagian**: satu pemanggilan `interviews_open`, helper `byReviewStatus`. Pemisahan handler **diterima** `[⏳ DITERIMA]`: urutan butir dan cakupan bersama lebih mudah dibaca di satu fungsi |
| Standar | **Bug**: label tim dari `activeView`, API memakai peran utama | **Perbaiki**: label dari `scope` respons. E2E multi-peran merah lalu hijau |
| Standar | `meta.roles` memakai peran mana pun, API peran utama | **Diterima** `[⏳ DITERIMA]` sampai B2 (#20, `switch-role`) masuk |
| Standar | `aiReviewCounts` tidak menyaring `submodule`/karyawan aktif | **Tolak**: hanya `saveTna` yang menulis `lna_findings.analysis_job_id` (`lna-stores.js`), jadi job DNA tidak menghasilkan temuan. Kesepakatan dihitung seluruh tenant sesuai 3.3 (putusan HR atas karyawan yang kemudian nonaktif tetap putusan sah) |

### Review diff egm (plugin egm, 19 Nov)

Reviewer `egm:egm-codebase-details` dan `egm:egm-implementation-readiness` (subagent baru, hanya menerima spek, diff, `CLAUDE.md`, `docs/agents/domain.md`, `CONTEXT.md`, spek B0, mockup, dan brief). Hasil: 1 Blocker, 11 Major, 20 Nit. Privasi inti dinyatakan aman oleh keduanya (tidak ada jalur draf atau Improvement Needs tanpa akses ke atasan). Triase `egm-resolve` lengkap di folder proyek `elgos-eksekusi/egm/b3/goldfish_review_report.md`. Ringkasan:

| Temuan | Keputusan |
| --- | --- |
| Blocker: baris `people` bilang tidak ada angka di luar penyebut, padahal dua angka seluruh tenant | **Perbaiki**: pengecualian ditulis di 3.3 |
| Gap kompetensi ikut kompetensi yang belum disahkan; gap OKR memilih periode lewat urutan teks dan menghitung per orang | **Perbaiki**: memakai `competencyGaps`/`okrGaps`/`performancePeriods` B5, angka dashboard = papan gap. Test merah lalu hijau |
| Status modul 2–5 hanya dari flag | **Perbaiki**: gerbang API modulnya (3.4). Test merah lalu hijau |
| `interviews_open` menghitung undangan kedaluwarsa | **Perbaiki**: `isOpen` B5 |
| Baris Pareto berjudul temuan adalah isi individu, audit HR ringkas | **Perbaiki**: audit `dashboard.pareto` dengan id karyawan di baliknya |
| Celah test: K1 pada "dianalisis", audit HR gagal, Pareto `null` | **Perbaiki**: test ditambah (lulus tanpa perubahan kode) |
| Dua urutan tindakan (API vs web); label "temuan AI"; kunci modul tak dikenal membuat halaman galat; mock e2e tanpa `products`; median negatif | **Perbaiki** |
| Kontrak perluasan untuk B9 dan B13–B16 belum tertulis | **Perbaiki sebagian**: aturan di sub-bagian "Menambah bagian dashboard" di bawah. Seam berkas per bagian **ditunda** `[⏳ DITERIMA]`: lima thread sedang paralel, refaktor sekarang memindahkan konflik ke mereka |
| Kinerja dan dekripsi untuk tenant besar | **Diterima** `[⏳ DITERIMA]` dengan anggaran di bagian 8 |
| `non_training_findings` hanya dari `tna.non_training_hr`, bukan `module.ina` + `ina.dashboard` | **Ditunda** ke B9, yang memiliki rute `ina` dan status tindak lanjutnya |
| Kedip judul multi-peran sebelum data datang; Pareto tidak bisa diklik; `menuKey` statis | **Tolak** (Nit): kedip hanya akun multi-peran dan hilang setelah B2 `switch-role`; klik Pareto ke detail gap menunggu rute detail B5 di layar baru |

### Menambah bagian dashboard (B9, B13–B16)

- Tiap modul menambah datanya di `GET /api/dashboard` hanya bila modulnya terbuka dengan gerbang di 3.4, dan bernilai `null` (bukan 0) bila tertutup, tanpa membaca datanya.
- Metrik per modul: field opsional `modules[].metric: { label: string, value: number | null }`. Belum ada di B3; paket pertama yang mengirimnya juga menambah tampilannya di kartu modul (di bawah keterangan) beserta test e2e.
- Butir tindakan baru: kunci baru di akhir urutan 3.5 kecuali spek paketnya menyebut posisi lain; layar menambah entri di `ACTIONS` (`DashboardView.vue`). Kunci yang belum dikenal layar dilewati.
- Untuk atasan: angka yang bergantung pada draf tidak dikirim (PM-5); Improvement Needs hanya dengan akses HR (K1); id karyawan yang menjadi sumber angka ikut ke audit `readIndividual`.
- Test yang disalin tiap paket: modul tertutup → `null` dan store tidak dipanggil; cakupan atasan; tidak ada angka yang membocorkan draf.
