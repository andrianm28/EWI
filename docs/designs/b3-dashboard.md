# B3 · Dashboard utama HR dan Dashboard tim atasan

Status: draf spek, 19 Nov 2026. Paket B3 dari rencana bangun penuh mockup Pak Eji. Menumpuk di atas B0 (`docs/designs/b0-fondasi-ui.md`).

Sumber acuan:

- Mockup Pak Eji, layar `dash` (blok `<!-- DASHBOARD UTAMA -->` di `Main.dc.html`; data di `renderVals` bagian "dashboard utama").
- Brief bangun penuh 19 Nov, bagian T1 dan default K1.
- Keputusan: RG-3 (cakupan lihat), PM-5 (draf AI hanya untuk HR), PM-2 D (persetujuan HR saat review = pemantauan, bukan angka akurasi resmi), PO-5 C (85% target yang dikejar), LIN-B1 (TNA ≤ 2 minggu), PM-6/K1 (temuan non-pelatihan: HR default, atasan hanya dengan akses dari HR), BT-30 (rumus Pareto, `tna/pareto.js`).

## 1. Tujuan

HR membuka ELGOS dan langsung melihat keadaan seluruh modul: berapa pegawai sudah dianalisis, gap apa yang paling besar, seberapa sering HR setuju dengan AI, berapa lama analisis berjalan, dan apa yang menunggu tindakannya. Atasan melihat hal yang sama untuk timnya saja.

Semua angka berasal dari data tenant. Tidak ada angka demo mockup yang dibawa.

## 2. Layar yang dicakup

Satu layar `dash`, dua tampilan:

| Tampilan | Judul | Cakupan data |
| --- | --- | --- |
| HR / L&D (`hr_admin`, `eta_admin`) | Dashboard utama | seluruh karyawan tenant |
| Atasan (`supervisor`) | Dashboard tim | bawahan langsung saja |

Bagian layar, urutan mockup: kartu KPI → Status modul → Pareto 20/80 → Perlu tindakan.

## 3. API

### 3.1 Endpoint

`GET /api/dashboard` (modul baru `apps/api/src/modules/dashboard/`).

- Dipasang di `app.js` di bawah `auth` + `tenantContext()`, di balik **flag baru `dashboard.main`** (default mati) lewat `requireFlag`.
- **Bukan submodul**: dashboard merangkum beberapa modul, jadi tidak lewat `requireSubmodule()` (sama seperti `/api/employees`). Sebagai gantinya tiap bagian respons hanya diisi bila modul sumbernya terbuka untuk tenant (entitlement + flag, aturan yang sama dengan `requireSubmodule`). Bagian yang modulnya tertutup bernilai `null`.
- `tenant_id` hanya dari `req.tenantId`.
- Peran: `hr_admin`, `eta_admin`, `supervisor`. Peran lain → 403 `ROLE_FORBIDDEN`.
- Cakupan: dari `scopeFor()` → `visibleEmployeeScope()`. Untuk atasan, id dirinya sendiri dikeluarkan dari cakupan supaya "tim" berarti bawahan langsung (sama dengan `GET /tna/findings/non-training`). Atasan tanpa bawahan mendapat dashboard kosong, bukan galat.
- Audit: `audit.readIndividual(req, 'dashboard.summary', { employeeIds })` dengan id karyawan yang datanya ikut dihitung. Angka di dashboard adalah agregat, tetapi untuk tim kecil agregat bisa menunjuk orang, jadi dicatat sebagai baca data individu (R2-2, gagal-tertutup).

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
      "analysisDays": { "median": 11, "sessions": 9, "targetDays": 14 }                        // null bila TNA tertutup
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
      "total": 7,                      // jumlah kebutuhan sebelum dipotong
      "hotCount": 2
    },
    "actions": [ { "key": "review_pending", "count": 4 } ]
  }
}
```

Nama, deskripsi, dan teks tindakan **tidak** dikirim API; web yang memetakannya dari `key` (teks Indonesia di satu tempat).

### 3.3 Definisi angka

| Angka | Definisi | Sumber |
| --- | --- | --- |
| `people` | Karyawan dalam cakupan dengan peran `learner`, `supervisor`, `role_leader`, `sme` | `stores.people.list` |
| `employeesAnalyzed` | Karyawan dalam cakupan yang punya minimal satu penilaian DNA (bila DNA terbuka) **atau** minimal satu sesi wawancara TNA berstatus `completed` (bila TNA terbuka) | `stores.dna.assessmentsFor`, `stores.interviews.list` |
| `competencyGaps` | Jumlah kompetensi berbeda yang minimal satu karyawan dalam cakupan berstatus `gap` terhadap kompetensi jabatannya | `computeGap` (`dna/gap.js`), cara yang sama dengan `GET /dna/employees` |
| `okrGaps` | Jumlah catatan kinerja (KPI/OKR/SLA) dalam cakupan dengan `isMet === false`. Toleransi per KPI (PM-1) sudah masuk di `isMet` | `stores.tna.listPerformance` |
| `aiHrAgreement.percent` | `approved / (approved + edited + rejected)` × 100, dibulatkan; `null` bila belum ada yang ditinjau. Seluruh tenant | `stores.tna.reviewCounts` |
| `analysisDays.median` | Median, dibulatkan ke atas ke hari penuh, dari selisih antara sesi TNA dibuat (penugasan) dan waktu temuan terakhir sesi itu ditinjau HR. Hanya sesi dalam cakupan yang punya minimal satu temuan dan tidak punya temuan draf. `null` bila belum ada | store baru `stores.tna.analysisDurations` |
| `pareto.rows` | `rankTrainingNeeds()` atas temuan pelatihan yang sudah disetujui/diubah HR dalam cakupan, dengan `settings.tna.pareto`; 7 teratas | sama dengan `GET /tna/pareto` |
| `pareto.rows[].hot` | Baris teratas sampai `cumulativeShare` pertama kali ≥ 0,8 (baris yang melewati 0,8 ikut) | dihitung di modul dashboard |

- `[⚠️ BELUM TERVERIFIKASI]` **Titik awal "waktu analisis".** LIN-B1 hanya menyebut "TNA ≤ 2 minggu" dan LIN-B16 (pembanding dari HR) belum punya data. Spek ini memakai "penugasan wawancara → tinjauan HR selesai". Bila Pak Eji atau Mas Abdan bermaksud lain (misalnya sejak data KPI diunggah), cukup ubah satu kueri.
- **Kesepakatan AI–HR adalah angka pemantauan** (PM-2 D): persentase temuan AI yang disetujui HR tanpa diubah. Bukan angka akurasi resmi 85% (yang diukur dengan golden set, LIN-B20). Layar menuliskan itu di catatan kartu supaya tidak disalahbaca.
- **Hanya HR** yang menerima `aiHrAgreement` dan tindakan `review_pending`: peran lain tidak boleh tahu ada draf (PM-5 ★A, sama dengan `GET /tna/dashboard`).
- Pareto mockup dihitung dari gap skor terhadap Job Competency Model ("−33 poin"). Brief menetapkan `tna/pareto.js` (jumlah orang × besar meleset × kepentingan). Layar menampilkan "n orang · kum. x%" sebagai ganti "−n poin".

### 3.4 Status modul

| No | `key` | Aktif bila |
| --- | --- | --- |
| 1 | `lna` | minimal satu dari `cca`, `dna`, `tna`, `ina` terbuka (entitlement + flag `module.<key>`); `parts` merinci keempatnya |
| 2 | `li` | flag `module.li` |
| 3 | `ld` | flag `module.ld` |
| 4 | `lim` | flag `module.lim` |
| 5 | `cp` | flag `promotion.recommendation` |

Flag `module.li`, `module.ld`, `module.lim` dibuat paket B13–B15. Sebelum ada, `flags.all()` tidak memuatnya dan modulnya berstatus tidak aktif. Dashboard tidak mendaftarkan flag itu.

Mockup menampilkan status "Aktif / Baru / Konsep", persen kemajuan, dan satu metrik per modul. Itu data demo tanpa sumber. B3 menampilkan **Aktif** atau **Belum aktif** dari flag, rincian submodul untuk LNA, dan tombol "Buka" bila layarnya sudah terpasang. Tanpa batang persen. `[⏳ DITERIMA]` metrik per modul ditambahkan paket modul masing-masing lewat perubahan kecil di dashboard setelah datanya ada; tidak diuji di B3.

### 3.5 Perlu tindakan

Hanya butir dengan `count > 0` yang dikirim, urutan tetap:

| `key` | Untuk | Hitungan | Syarat |
| --- | --- | --- | --- |
| `review_pending` | HR | temuan AI berstatus draf, seluruh tenant | TNA terbuka |
| `interviews_open` | HR, atasan | sesi TNA `scheduled` atau `in_progress` dalam cakupan | TNA terbuka |
| `plan_needs_module` | HR | butir rencana pelatihan tanpa modul (`needsModule`) | TNA terbuka |
| `non_training_findings` | HR; atasan **hanya bila** `hasNonTrainingGrant` | temuan non-pelatihan yang sudah ditinjau, dalam cakupan | TNA terbuka + flag `tna.non_training_hr` |
| `competencies_unapproved` | HR | kompetensi dengan `approvedAt` kosong | DNA terbuka |

- `non_training_findings` menerapkan K1: HR melihat secara bawaan; atasan langsung hanya bila HR memberinya akses. Tanpa akses, butir itu tidak dikirim (bukan dikirim dengan nol), sehingga atasan tidak bisa menyimpulkan ada temuan.
- Tindakan perbaikan lewat tenggat (mockup) menunggu modul Improvement Needs (B9); ditambahkan B9.

## 4. Web

- `apps/web/src/screens/b3-dashboard/routes.ts`: `{ path: '/dashboard', name: 'dash', meta: { views: ['hr', 'atasan'], flag: 'dashboard.main' } }`.
- Sesuai kontrak B0: begitu flag menyala, HR dan atasan mendarat di `/dashboard` setelah login dan butir "Beranda" berganti "Dashboard utama"/"Dashboard tim". Saat flag mati, `homeFor()` jatuh ke Beranda lama, jadi **e2e lama tidak berubah** (mock-nya tidak menyalakan `dashboard.main`).
- `DashboardView.vue` memakai komponen B0: `UiKpiCard`, `UiCard`, `UiChip`, `UiProgressBar`, `UiButton`, `UiNote`.
- Catatan B0 yang perlu dikoreksi: menu B0 menyembunyikan butir peralihan "Beranda" begitu rute `dash` **terdaftar**. Dengan flag mati rute `dash` terdaftar tetapi tertutup, sehingga HR kehilangan butir Beranda. B3 mengubah aturan peralihan di `shell/menu.ts` menjadi "beranda tampilan **bisa dibuka**" (memakai `homeFor`), dan memperbarui spek B0 bagian 5.2.
- Teks:
  - KPI: "Pegawai dianalisis" (catatan "dari n pegawai"), "Gap kompetensi aktif" (catatan "dan n target KPI/OKR meleset"), "Kesepakatan AI–HR" (catatan "target pilot ≥ 85% · pemantauan tinjauan HR"), "Waktu analisis" ("n hari", catatan "median n sesi · target ≤ 14 hari").
  - Angka `null` ditampilkan "–" dengan catatan "Belum ada data" atau "Modul belum aktif".
  - Pareto: judul "Pareto 20/80: gap yang perlu diprioritaskan"; catatan "n dari m kebutuhan menyumbang sekitar 80% total. Mulai dari yang merah." Baris `hot` memakai batang kritis **dan** chip "Prioritas" (bukan warna saja). Kosong: "Belum ada temuan pelatihan yang disetujui HR."
  - Perlu tindakan: satu baris per butir dengan tombol ke layar terkait bila rutenya ada (`tna-review`, `tna`, `dna`). Kosong: "Tidak ada yang menunggu tindakan."
  - Atasan: subjudul "Ringkasan tim Anda. Hanya bawahan langsung yang dihitung."
- Keadaan muat ("Memuat…") dan galat (`UiNote` kritis dengan pesan API). Galat tidak memakai `role="alert"` global di shell; ada di dalam konten halaman.

## 5. Data dan migrasi

Tidak ada migrasi. Blok `20261119000300`–`…0399` tidak dipakai. Semua angka dihitung dari tabel yang ada. Satu fungsi store baru (`tna.analysisDurations`) dan flag baru `dashboard.main` di `src/core/flags`.

## 6. Test

Unit (`tests/unit/dashboard.test.js`, store in-memory + supertest):

1. Flag `dashboard.main` mati → 403 `FEATURE_DISABLED`.
2. `learner` → 403 `ROLE_FORBIDDEN`.
3. HR: semua bagian terisi; `aiHrAgreement` dihitung benar; `review_pending` ada.
4. Atasan: store hanya dipanggil dengan id bawahan (bukan dirinya, bukan orang lain); tanpa `aiHrAgreement`, tanpa `review_pending`.
5. Atasan tanpa akses non-pelatihan tidak menerima `non_training_findings`; dengan akses menerima.
6. TNA tertutup → `pareto`, `okrGaps`, `analysisDays` `null`; DNA tertutup → `competencyGaps` `null`.
7. Modul: `lna.parts` mengikuti entitlement + flag; atasan hanya `lna`, `lim`, `cp`.
8. Fungsi murni: `markHot` (batas 0,8, satu baris, kosong), `median`, `agreement` (nol ditinjau → `null`).
9. Audit `dashboard.summary` tercatat dengan id karyawan dalam cakupan.
10. Tenant lain tidak ikut terhitung (store dipanggil dengan `req.tenantId`).

Integrasi Postgres (`tests/integration/dashboard.test.js`): `analysisDurations` (sesi dengan draf dikecualikan, cakupan, tenant lain), dan satu panggilan `GET /api/dashboard` ujung ke ujung untuk HR dan atasan.

E2E (`apps/web/e2e/dashboard.spec.ts`, API di-mock): HR mendarat di dashboard dan melihat KPI, modul, Pareto dengan chip Prioritas, tindakan dengan tautan; atasan melihat "Dashboard tim" tanpa kartu kesepakatan; flag mati → Beranda lama dengan butir Beranda; galat API tampil; snapshot visual.

Gerbang: `npm run lint`, `npm test`, `npm run build`, `npm run e2e`.

## 7. Perubahan berkas

- [ ] `docs/designs/b3-dashboard.md`
- [ ] `apps/api/src/core/flags/index.js`: `DASHBOARD_MAIN: 'dashboard.main'`
- [ ] `apps/api/src/modules/dashboard/index.js` (router), `summary.js` (fungsi murni)
- [ ] `apps/api/src/app.js`: pasang `/dashboard`
- [ ] `apps/api/src/db/lna-stores.js`: `tna.analysisDurations`
- [ ] `apps/api/tests/unit/dashboard.test.js`, `tests/integration/dashboard.test.js`
- [ ] `apps/web/src/api/dashboard.ts`
- [ ] `apps/web/src/screens/b3-dashboard/routes.ts`, `DashboardView.vue`
- [ ] `apps/web/src/shell/menu.ts`, `components/AppDrawer.vue`: aturan butir peralihan memakai "beranda bisa dibuka"
- [ ] `docs/designs/b0-fondasi-ui.md`: koreksi bagian 5.2
- [ ] `apps/web/e2e/dashboard.spec.ts`, snapshot
- [ ] `docs/ewi/poc-dna-tna.md` atau README: daftar flag bertambah `dashboard.main`

## 8. Asumsi dan risiko yang tersisa

- `[⚠️ BELUM TERVERIFIKASI]` definisi "waktu analisis" (3.3).
- `[⚠️ BELUM TERVERIFIKASI]` dashboard tim hanya untuk `supervisor`. `pimpinan` dan `role_leader` dipetakan ke tampilan Atasan oleh B0 tetapi `visibleEmployeeScope()` memberi mereka dirinya saja; mereka mendapat 403 dan layar menampilkan pesan. Menunggu definisi lima peran dari B2.
- `[⏳ DITERIMA]` metrik per modul dan persen kemajuan tidak ditampilkan (3.4).
- `[⏳ DITERIMA]` kinerja: dashboard memuat daftar (temuan, kinerja, sesi) lalu menghitung di Node, seperti `GET /tna/dashboard`. Cukup untuk pilot (puluhan karyawan); agregasi SQL bila tenant ratusan orang. Tidak ada test beban.
- Flag `dashboard.main` harus dinyalakan per tenant oleh Admin ETA saat Go/No-Go; sampai itu pengguna tetap melihat Beranda lama.
