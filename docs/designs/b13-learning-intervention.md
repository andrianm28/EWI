# B13 · Learning Intervention (modul `li`)

Status: dibangun (PR #23, masuk scbrmb), spek diselaraskan dengan review egm susulan (plugin egm asli) · 19 Nov 2026 · paket B13 dari `brief-bangun-penuh-19nov.md` (thread T8).
Acuan layar: mockup Pak Eji, layar `lib`, `prog`, `req`, `lidev` (`project/Main.dc.html`).

## 1. Tujuan

HR/L&D punya satu tempat untuk melihat semua modul belajar Knowledge, Skill, Attitude (KSA) hasil DACUM Tool 2,
melihat susunannya sebagai program Basic/Intermediate/Advanced per jabatan (DACUM Tool 3), dan memastikan setiap
modul punya sumber: diminta ke vendor atau dikembangkan sendiri dengan bantuan ELGOS. Modul yang menutup gap terbesar
(Pareto dari Training Needs) ditandai agar disediakan lebih dulu.

Bukan tujuan paket ini: rencana belajar karyawan (B8), penugasan ke EliteMentor (B7), pelaksanaan pelatihan (B14).

## 2. Layar yang dicakup

| Layar mockup | Isi | Endpoint |
| --- | --- | --- |
| Library (`lib`) | KPI (modul, butir K/S/A), catatan Pareto, filter jabatan/prioritas/tipe/level/rumpun, daftar modul, panel detail (tujuan, butir KSA, jabatan, sumber yang disarankan, tombol minta/kembangkan) | `GET /api/li/modules`, `GET /api/li/modules/:id`, `POST /api/li/modules/:id/request`, `POST /api/li/modules/:id/draft`, `POST /api/li/requests/bulk` |
| Program & Course (`prog`) | Pilih jabatan, tab Basic/Intermediate/Advanced, KPI, course per rumpun, minta semua modul generik | `GET /api/li/programs` , `POST /api/li/requests/bulk` |
| Permintaan & pengembangan (`req`) | Daftar permintaan vendor dengan status, draf ELGOS, kandidat "disarankan dikembangkan sendiri" | `GET /api/li/requests`, `PATCH /api/li/requests/:id` |
| Pengembangan modul (`lidev`) | Stepper 4 langkah: tujuan terukur → rancangan materi → asesmen → tinjau dan ajukan ke SME | `GET/PUT /api/li/drafts/:id`, `POST /api/li/drafts/:id/submit`, `POST /api/li/drafts/:id/review` |

Semua endpoint hanya untuk peran `hr_admin` (dan `eta_admin` yang selalu lolos `requireRole`). Di mockup hanya HR yang
punya menu Learning Intervention; atasan dan karyawan tidak. Pengecualian: `POST /drafts/:id/review` juga boleh untuk
`sme` dan `role_leader`, begitu pula `GET /drafts`, `GET /drafts/:id`, dan probe `GET /api/li/`.
Rute web memakai `meta.flag = 'module.li'` dan `meta.entitlement = 'full_suite'` (kontrak B0), jadi menu tidak tampil
untuk tenant yang API-nya akan menjawab 403. Data gap per karyawan untuk Pareto dibaca lewat cakupan
`visibleEmployeeScope()` (aturan 4 CLAUDE.md); untuk HR dan admin ETA cakupannya semua karyawan tenant.

## 3. Data dan migrasi

Blok migrasi 13: `20261119001300-learning-intervention.js` (raw SQL, punya `down`). Semua tabel punya `tenant_id`.

| Tabel | Kolom penting | Catatan |
| --- | --- | --- |
| `li_modules` | `code` (unik per tenant), `name`, `level` (`basic`/`intermediate`/`advanced`), `stream` (rumpun, teks bebas), `objective`, `catalog_item_id` → `lna_catalog_items` (null) , `import_batch_id` | Satu baris per modul DACUM Tool 2 |
| `li_module_items` | `module_id`, `kind` (`K`/`S`/`A`), `text`, `position` | Butir KSA |
| `li_module_job_roles` | `module_id`, `job_role_id` → `lna_job_roles` | Satu modul bisa dipakai beberapa jabatan |
| `li_module_competencies` | `module_id`, `competency_id` → `lna_competencies` | Dipakai untuk prioritas Pareto |
| `li_module_requests` | `module_id`, `vendor_name`, `status` (`requested`/`confirmed`/`delivered`/`installed`/`cancelled`), `requested_by`, `updated_by`, waktu per status, `note` | Indeks unik parsial: satu permintaan aktif (bukan `cancelled`) per modul |
| `li_module_drafts` | `module_id` (unik per tenant), `status` (`draft`/`sme_review`/`approved`/`returned`), `objectives`/`sessions`/`assessments` (jsonb), `generated_by`, `submitted_at`, `submitted_by`, `reviewed_by`, `reviewer_name`, `review_note`, `reviewed_at`, `review_recorded_by_hr`, `created_by`, `updated_by` | Satu draf per modul; `review_recorded_by_hr` menandai keputusan SME yang dicatat HR |

Tabel `lna_catalog_items` berasal dari PK-18, yang sudah ada di branch integrasi.

Isi modul tidak memuat data pribadi, jadi tidak dienkripsi per tenant dan baca daftar modul tidak dicatat sebagai baca
data individu. Semua perubahan (permintaan, ubah status, draf dibuat, disunting, dihapus, diajukan, keputusan SME,
tautan course) dicatat lewat `audit.record`.

### Cara data masuk

Jenis impor baru `li_modules` di modul `imports` (template nomor 9), dipasang di `/api/li/imports`. Satu baris = satu
butir KSA. Kolom: Kode Modul*, Nama Modul*, Level*, Rumpun, Tujuan, Jabatan (nama jabatan, pisah titik koma),
Kompetensi (nama kompetensi di kamus, pisah titik koma), Tipe Butir* (K/S/A atau Knowledge/Skill/Attitude), Butir*.
Nama, level, rumpun, tujuan, jabatan, dan kompetensi diambil dari baris pertama tiap kode; baris berikutnya boleh
kosong, tetapi bila diisi harus sama. Impor ulang kode yang sama memperbarui modul dan mengganti butir, jabatan, serta
kompetensinya. Permintaan dan draf yang sudah ada tidak dihapus dan tidak disesuaikan. Impor bersifat atomik per
kode modul: satu baris salah menolak seluruh modul itu. Jabatan atau kompetensi yang tidak dikenal juga menolak seluruh
modul itu, dengan alasan per baris.

**Tautan modul ke kompetensi lewat kode (setelah B4, PR #22).** Di DACUM, kode modul Tool 2 sama dengan kode
kompetensi Tool 1 (`lna_competencies.code`, contoh `ST-A2`, unik per jabatan). Sebuah modul terhubung ke kompetensi bila:
(a) kompetensi itu disebut namanya di kolom Kompetensi saat impor (tersimpan di `li_module_competencies`), atau (b)
`lower(kompetensi.code) = lower(modul.code)` dan jabatan kompetensi termasuk jabatan modul (`li_module_job_roles`).
Jalur (b) dihitung saat dibaca, bukan disimpan, jadi urutan impor (kamus dulu atau library dulu) dan perubahan kode lewat
`PATCH /api/dna/competencies/:id` langsung berlaku tanpa impor ulang. Modul tanpa jabatan tidak dicocokkan lewat kode,
karena kode hanya unik per jabatan. Tidak ada migrasi: kedua jalur memakai tabel yang sudah ada. Jalur nama tetap ada
untuk kompetensi tanpa kode (kompetensi inti, kamus lama). Ganti nama kompetensi tetap memutus tautan jalur (a) seperti sebelumnya; jaminan
"langsung berlaku" hanya untuk jalur (b).

Cakupan dan aturan tambahan jalur (b):
- Berlaku untuk library, detail modul, dan Pareto B13 saja. Evaluasi LIM (`lim-stores.js` `planCompetencies`,
  `participations`) tetap membaca `li_module_competencies`; menyamakannya adalah paket susulan pemilik LIM.
- Tidak bergantung pada flag `dna.development` atau `module.dna`: kode yang sudah tersimpan tetap dibaca walau flag B4
  dimatikan kemudian, sama seperti jalur nama membaca kamus apa pun keadaan flagnya.
- Kompetensi dan jabatan modul harus milik tenant yang sama dengan modul (`c.tenant_id = m.tenant_id`,
  `mj.tenant_id = m.tenant_id`).
- Modul dengan jabatan A dan B yang sama-sama punya kompetensi `ST-A2` terhubung ke keduanya (dua entri).

`[⚠️ BELUM TERVERIFIKASI]` Bentuk berkas DACUM Tool 2 asli dari Mas Abdan belum dilihat. Pemetaan kolom memakai mesin
pemetaan impor yang ada, jadi judul kolom berbeda masih bisa dipetakan HR, tetapi berkas yang satu modul per baris
dengan butir di banyak kolom perlu dirapikan dulu.

## 4. Aturan bisnis

1. **Status sumber modul** (fungsi murni `moduleStatus`), urutan prioritas:
   `available` (permintaan `installed`, atau `catalog_item_id` terisi) → `dev_approved` (draf `approved`: rancangan
   disetujui SME tetapi course belum ada; menjadi `available` setelah HR menautkan course lewat
   `PATCH /modules/:id { catalogItemId }`) → `dev_review` (draf
   `sme_review`) → `dev_draft` (draf `draft`/`returned`) → `delivered` → `confirmed` → `requested` → `none`.
   Respons memuat `status.key` dan `status.via` (`vendor`/`elgos`/`catalog`); label Indonesia dibuat di UI.
2. **Satu jalur aktif per modul.** Minta ke vendor ditolak (409) bila ada permintaan aktif atau draf. Membuat draf
   ditolak bila ada permintaan aktif. Permintaan `cancelled` membuka kembali kedua jalur. Draf `draft`/`returned`
   boleh dihapus (`DELETE /api/li/drafts/:id`) untuk pindah jalur.
3. **Alur vendor** (K4): `requested` → `confirmed` → `delivered` → `installed`, maju satu langkah, tidak mundur.
   `cancelled` boleh dari status mana pun kecuali `installed`. Saat `installed`, HR boleh mengisi `catalogItemId`
   (course **aktif** di katalog LMS/EliteMentor milik tenant yang sama, sama dengan pilihan `GET /catalog`) agar rencana
   training bisa menunjuk course itu (lihat §9 B8). Status yang kosong atau tidak dikenal dijawab 400; transisi yang
   tidak boleh 409 `INVALID_TRANSITION`. ELGOS **tidak mengirim apa
   pun ke vendor**: tombol "Minta" hanya mencatat permintaan; HR yang menghubungi vendor. Ini ditulis di layar.
4. **Nama vendor** dari `settings.li.vendorName`, default `"Mahaka Institute"` (K4), disalin ke `vendor_name` saat
   permintaan dibuat.
5. **Sumber yang disarankan**: `dev` bila rumpun modul ada di `settings.li.devStreams` (default
   `["Specific Technical"]`), selain itu `vendor`. Ini usulan awal, tidak mengunci pilihan HR.
   `[⚠️ BELUM TERVERIFIKASI]` Aturan rumpun ini berasal dari logika mockup, belum dikonfirmasi Pak Eji.
6. **Prioritas Pareto 20/80.** Sumber: temuan TNA kategori `training`, diperingkat `rankTrainingNeeds`
   (`modules/tna/pareto.js`) dengan `settings.tna.pareto`. Data diambil lewat query khusus yang tidak membawa judul atau
   rincian temuan; temuan tanpa kompetensi tidak ikut dan dilaporkan sebagai `unlinkedFindings`. Pencocokan memakai nama
   kompetensi yang dinormalkan dari semua kompetensi yang terhubung ke modul (lewat nama atau kode, lihat "Tautan modul
   ke kompetensi" di §3), dan dibatasi ke satu jabatan bila filter `jobRoleId` dipakai. Kunci Pareto tetap nama, jadi modul yang terhubung lewat kode ke "Komunikasi" jabatan X juga
   menghitung temuan "Komunikasi" dari jabatan lain; ini sama dengan jalur nama dan diterima sadar (presisi per id
   kompetensi = paket susulan bila data pilot menunjukkan nama kembar antarjabatan). Kompetensi prioritas = baris dengan
   `cumulativeShare ≤ 0,8`, ditambah baris peringkat 1 (agar tidak kosong bila satu kompetensi > 80%). Modul prioritas
   = modul yang terhubung ke kompetensi prioritas; peringkat modul = peringkat terbaik kompetensinya. Modul tanpa
   kompetensi terhubung atau tanpa temuan = "belum ada data gap". Bila `module.tna` mati untuk tenant, prioritas
   kosong dan `pareto.available = false`. Filter `jobRoleId` membatasi ke karyawan yang **sekarang** memegang jabatan
   itu (`users.job_role_id`), bukan ke jabatan pemilik kompetensi.
7. **Permintaan massal** (`POST /requests/bulk`): `scope: "pareto"` meminta semua modul prioritas yang sumber
   sarannya `vendor` dan statusnya `none`; `scope: "program"` (wajib `jobRoleId` dan `level`) meminta semua modul
   seperti itu di program tersebut. Respons selalu 201: `{ created, skipped, requests }` (termasuk yang kalah balapan
   dengan permintaan lain; `created` boleh 0).
8. **Program & Course**: program = (jabatan × level). Course = modul yang berlaku untuk jabatan itu pada level itu,
   dikelompokkan per rumpun, prioritas Pareto di atas. Jabatan `hasDictionary = true` bila punya minimal satu modul.
   Jabatan tanpa modul tampil dengan status "kamus belum tersedia" dan tanpa course. Data contoh (dummy) untuk
   Solution Architect dan Project Manager di mockup **tidak** dibangun (aturan 5 brief: data demo diganti data tenant).
9. **Draf pengembangan** (`modules/li/design.js`, fungsi murni `generateDraft(module)`):
   - Tujuan terukur per butir, kata kerja operasional Bloom per tipe: K "menjelaskan … pada tes tertulis (skor ≥ 80%)",
     S "mempraktikkan … sesuai checklist pada simulasi kerja (skor observasi ≥ 80%)", A "menunjukkan … secara
     konsisten, dinilai atasan (skala 1–5, rata-rata ≥ 4) dalam 4 minggu".
   - Rancangan materi mengikuti urutan Gagné, disusun mundur dari tujuan: pembuka, konsep inti (bila ada K),
     demonstrasi dan praktik (bila ada S), studi kasus dan refleksi (bila ada A), rangkuman dan transfer.
   - Asesmen per tipe yang ada, dengan kriteria lulus.
   - `isMeasurable(text)`: tujuan dianggap terukur bila memuat angka kriteria.
   Draf hanya bisa dibuat untuk modul yang punya butir (400). HR boleh menyunting ketiga bagian (`PUT`) selama status
   `draft`/`returned`. `submit` (fungsi `validateDraft`) ditolak 400 bila tidak ada tujuan, ada tujuan kosong, ada
   tujuan yang tidak terukur, tidak ada sesi atau ada sesi tanpa judul, atau tidak ada asesmen atau ada asesmen tanpa
   rincian. Mengubah draf yang sudah diajukan dijawab 409 `INVALID_STATE`.
   `[⏳ DITERIMA]` Draf awal dibuat dari templat deterministik (`generated_by = 'template'`), belum oleh LLM, karena
   penyedia Bedrock (PR #15) belum masuk branch integrasi dan kontrak `ai` belum punya fungsi untuk ini. Test unit
   `li-domain.test.js` mengunci bentuk draf agar penggantian ke LLM tidak mengubah kontrak. Layar tetap memakai
   istilah mockup, dengan meta "draf awal dari templat, perlu persetujuan SME".
10. **Tinjauan SME**: `submit` → `sme_review`. Keputusan `approved`/`returned` oleh `sme`/`role_leader`, atau dicatat
    oleh `hr_admin` atas nama SME dengan `reviewerName` wajib. `returned` wajib `note`. `approved` membuat modul
    berstatus `dev_approved`. `sme`/`role_leader` punya antrean `GET /drafts` dan `GET /drafts/:id`. Nama + waktu tercatat di audit.
    `[⚠️ BELUM TERVERIFIKASI]` K2 (5 peran mockup) tidak punya peran SME. Karena itu HR boleh mencatat keputusan SME.
    Bila B2 menghapus peran `sme`/`role_leader`, daftar peran di endpoint ini disesuaikan.
11. **Entitlement.** `li` terbuka bila tenant punya `full_suite` dan flag `module.li` menyala. Pembelian `li` terpisah
    belum ada (CHECK `entitlements.product` tidak diubah agar tidak bertabrakan dengan paket lain).
    `[⚠️ BELUM TERVERIFIKASI]` Model komersial 5 modul belum diputuskan.

## 5. Endpoint (semua di bawah `requireSubmodule('li')`, flag `module.li`, default mati)

| Metode | Path | Isi |
| --- | --- | --- |
| GET | `/api/li/` | probe modul `{ module, title, tenantId, role }` (HR, SME, role leader; dipakai test gerbang) |
| GET | `/api/li/modules?jobRoleId&priority=pareto&type=K\|S\|A&level&stream` | `{ data: [ringkas], kpis (termasuk `streams`), pareto, filters: { jobRoles, streams }, vendorName }` |
| GET | `/api/li/modules/:id` | detail + `items` per tipe, `jobRoles`, `competencies: [{ id, code, name, jobRoleId, via: 'code' \| 'name' }]` (kompetensi terhubung, diurutkan nama lalu kode; `via = code` bila cocok lewat kode, walau juga disebut namanya; hanya di detail, tidak di baris daftar), `status`, `priority`, `recommendation`, `request`, `draft` (ringkas) |
| POST | `/api/li/modules/:id/request` | 201 permintaan; 409 `PATH_ACTIVE` |
| POST | `/api/li/requests/bulk` | `{ scope, jobRoleId?, level? }` → 201 `{ created, skipped, requests }` |
| GET | `/api/li/requests` | `{ data: { vendor, drafts, candidates }, vendorName }` (kandidat = saran `dev`, status `none`, prioritas dulu) |
| PATCH | `/api/li/requests/:id` | `{ status, catalogItemId?, note? }`; 400 status tidak dikenal; 409 `INVALID_TRANSITION` |
| GET | `/api/li/programs?jobRoleId&level` | `{ data: { jobRoles, jobRoleId (default: jabatan pertama yang punya modul), level, levels: [{ level, count }], kpis, groups: [{ stream, modules }], pareto }, vendorName }`; modul tanpa rumpun dikelompokkan "Lainnya" |
| POST | `/api/li/modules/:id/draft` | 201 draf baru, atau 200 draf yang sudah ada |
| PATCH | `/api/li/modules/:id` | `{ catalogItemId \| null }` tautkan course katalog |
| GET | `/api/li/catalog` | course aktif di katalog tenant, untuk menautkan modul |
| GET | `/api/li/drafts` | antrean tinjauan untuk `sme`/`role_leader`/HR |
| GET/PUT/DELETE | `/api/li/drafts/:id` | baca / sunting / hapus |
| POST | `/api/li/drafts/:id/submit` | → `sme_review`; 400 bila belum terukur |
| POST | `/api/li/drafts/:id/review` | `{ decision, note?, reviewerName? }` |
| * | `/api/li/imports/...` | router impor yang ada, `submodule: 'li'` |

Semua respons sukses dibungkus `{ data: ... }` (ditambah `vendorName` atau `pareto` di sebelahnya bila disebut).
`DELETE` menjawab 204. Setiap query memfilter `tenant_id = req.tenantId`. ID dari tenant lain menghasilkan 404.
Bentuk galat: `{ error: { code, message } }`.

| Status | Kode | Kapan |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | filter tidak valid; status permintaan kosong/tidak dikenal; course katalog tidak ada, nonaktif, milik tenant lain, atau diisi bukan saat `installed`; draf tanpa butir; draf belum memenuhi syarat ajukan; suntingan tidak valid; keputusan SME tidak valid, `returned` tanpa catatan, HR tanpa `reviewerName` |
| 403 | `NOT_ENTITLED` / `FEATURE_DISABLED` / `ROLE_FORBIDDEN` | tenant tanpa `full_suite` / flag `module.li` mati / peran tidak berhak |
| 404 | `NOT_FOUND` | modul, permintaan, draf, atau jabatan tidak ada di tenant ini; SME membuka draf yang tidak `sme_review` |
| 409 | `PATH_ACTIVE` | modul sudah punya permintaan aktif atau draf |
| 409 | `INVALID_TRANSITION` | langkah status permintaan tidak boleh, atau status berubah di tengah jalan |
| 409 | `INVALID_STATE` | menyunting, menghapus, mengajukan, atau meninjau draf yang statusnya tidak sesuai |

## 6. Test yang ditulis lebih dulu

- `tests/unit/li-domain.test.js`: `moduleStatus` (semua urutan), `recommendedSource`, `priorityFromPareto` (≤ 80%,
  peringkat 1 selalu masuk, kosong), `generateDraft` (K/S/A, modul tanpa A), `isMeasurable`, transisi vendor.
- `tests/unit/gating.test.js` (tambahan): `li` butuh `full_suite` (tanpa itu 403 `NOT_ENTITLED`) + `module.li` (mati →
  403 `FEATURE_DISABLED`); learner 403.
- `tests/integration/li.test.js` (Postgres): impor `li_modules` (baru, ulang, baris ditolak) → daftar + filter + KPI →
  prioritas Pareto dari temuan TNA → minta vendor, alur status, batal, permintaan massal → draf, sunting, ajukan,
  kembalikan, setujui (suntingan draf diaudit) → course katalog aktif saja → program per jabatan → cakupan
  `visibleEmployeeScope` di `listTrainingGaps` → isolasi tenant (404/daftar kosong) → peran non-HR 403 → audit tercatat.
- `tests/integration/li.test.js` (tautan lewat kode): modul ber-kode sama dengan kompetensi di jabatannya terhubung tanpa
  kolom Kompetensi, baik kamus diimpor sebelum maupun sesudah library; kode sama di jabatan lain tidak terhubung; modul
  tanpa jabatan tidak dicocokkan; huruf besar/kecil tidak berpengaruh; detail `competencies` dengan `via`; prioritas Pareto
  ikut tautan kode; mengganti kode kompetensi lewat `PATCH /api/dna/competencies/:id` langsung memindahkan tautan. Modul dua jabatan
  dengan kode sama terhubung ke dua kompetensi; tenant lain dengan kode sama tidak ikut.
- `tests/integration/alur-li.test.js` (B18, lewat `tests/alur/driver.js`): impor library → wawancara TNA stub menghasilkan gap
  training → gap belum masuk Pareto sebelum HR meninjau → setelah disetujui modul kompetensi itu prioritas Pareto (tanpa
  judul temuan) → minta vendor sampai `installed` dengan course aktif → modul `available`; atasan/karyawan 403; flag
  mati `FEATURE_DISABLED`; tanpa `full_suite` `NOT_ENTITLED`.
- UI (setelah B0): e2e Playwright dengan API mock untuk empat layar, plus menu tersembunyi bila tenant tanpa `full_suite`.

## 7. Daftar perubahan file

Tahap dan titik periksa (tiap tahap bisa di-build dan dites sendiri):
1. Migrasi + flag + entitlement + settings → `npm run migrate` naik-turun-naik.
2. Domain + `design.js` + test unit → `tests/unit/li-domain.test.js`.
3. Store + jenis impor + router + test integrasi → `tests/integration/li.test.js`, `tests/unit/gating.test.js`.
4. Layar + e2e → `apps/web/e2e/li.spec.ts`.

Backend:
- [x] `apps/api/migrations/20261119001300-learning-intervention.js`
- [x] `apps/api/src/core/flags/index.js` (flag `module.li`)
- [x] `apps/api/src/core/entitlement/index.js` (modul khusus `full_suite`)
- [x] `apps/api/src/core/settings/index.js` (`li.vendorName`, `li.devStreams`)
- [x] `apps/api/src/modules/li/domain.js`
- [x] `apps/api/src/modules/li/design.js`
- [x] `apps/api/src/modules/li/index.js`
- [x] `apps/api/src/db/li-stores.js` + sambungan di `apps/api/src/db/lna-stores.js`
- [x] `apps/api/src/db/scope-sql.js` (potongan SQL `visibleEmployeeScope`, dipakai bersama LNA/LI/LD)
- [x] `apps/api/src/modules/imports/kinds/li-modules.js` + `apps/api/src/modules/imports/kinds/index.js`
- [x] `apps/api/src/app.js` (pasang modul)
- [x] `apps/api/tests/unit/li-domain.test.js`, `apps/api/tests/unit/gating.test.js`
- [x] `apps/api/tests/integration/li.test.js`

UI (menumpuk di atas B0):
- [x] `apps/web/src/screens/b13-li/api.ts`
- [x] `apps/web/src/screens/b13-li/labels.ts`
- [x] `apps/web/src/screens/b13-li/routes.ts` (rute `lib`, `prog`, `req`, `req-draf`; `meta.flag` + `meta.entitlement`)
- [x] `apps/web/src/screens/b13-li/LibraryView.vue`
- [x] `apps/web/src/screens/b13-li/ProgramView.vue`
- [x] `apps/web/src/screens/b13-li/RequestsView.vue`
- [x] `apps/web/src/screens/b13-li/DraftView.vue`
- [x] `apps/web/e2e/li.spec.ts`

Dokumen:
- [x] `docs/designs/b18-e2e-qa-malam.md` (baris alur B13 di tabel 3.3)
- [x] `apps/api/tests/integration/alur-li.test.js` dan langkah `li` di `apps/api/tests/alur/driver.js` (test alur B18)
- [ ] Tautan lewat kode: `apps/api/src/db/li-stores.js` (`competencyKeys` + daftar `competencies` untuk detail),
  `apps/api/src/modules/li/index.js` (detail memuat `competencies`, daftar tidak), `apps/api/tests/integration/li.test.js`

## 8. Keputusan triase review egm

Review spek oleh subagen baru (empat lensa) dilakukan sebelum membangun. Diperbaiki (sudah tercermin di atas): query
Pareto tanpa judul temuan; pencocokan per nama kompetensi dan per jabatan; impor atomik per kode modul; tujuan draf
menyalin teks butir (tanpa id butir); perlindungan balapan (kunci baris modul, transisi atomik); `catalogItemId` dicek
per tenant; rancangan yang disetujui SME bukan berarti course tersedia (`dev_approved`); antrean tinjauan untuk SME;
`review_recorded_by_hr`; nama vendor di semua respons; perbandingan rumpun dinormalkan.

Ditolak, dengan alasan:
- Foreign key komposit `(tenant_id, id)`: pola repo adalah pengecekan tenant di store ditambah test isolasi; mengubahnya
  hanya untuk tabel `li_*` membuat dua pola.
- Menyaring temuan menurut status tinjauan dengan aturan sendiri: ditolak; B13 mengikuti aturan `/api/tna/pareto` agar
  dua layar tidak menampilkan peringkat berbeda (lihat review diff di bawah).

Ditunda (dicatat di PR): draf dari LLM (sekarang templat), HR mencatat keputusan SME selama peran SME belum pasti,
`isMeasurable` hanya memeriksa adanya angka (sama dengan mockup), pengaturan `settings.li` belum punya endpoint tulis,
impor ulang tidak menyesuaikan draf yang sudah ada.

### Review diff (subagen baru, setelah kode selesai)

Tidak ada temuan berat. Diperbaiki: Pareto hanya menghitung temuan yang sudah ditinjau HR (`approved`/`edited`), sama
dengan `/api/tna/pareto` setelah PK-14 masuk (keputusan "ditolak" di atas soal status tinjauan tidak berlaku lagi);
permintaan massal `scope: "pareto"` dan detail modul menerima `jobRoleId` agar sama dengan daftar yang tampil; SME hanya
bisa membuka draf berstatus `sme_review`; kode modul disimpan huruf besar agar impor ulang tidak menggandakan; pesan 409
untuk modul yang sudah punya draf diperjelas.

Ditunda: menarik kembali draf yang sudah disetujui SME (belum ada jalan mundur dari `approved`), test balapan dengan
permintaan bersamaan.

### Code review (skill `mattpocock-skills:code-review`, dua sumbu, setelah layar selesai)

Sumbu standar: tidak ada pelanggaran CLAUDE.md maupun kontrak B0. Sumbu spek, diperbaiki: layar kini bisa menautkan
course katalog ke modul (`GET /api/li/catalog` baru, pilih course saat permintaan dipasang dan di detail Library),
sehingga rancangan yang disetujui SME bisa menjadi tersedia; draf `draft`/`returned` bisa dihapus dari layar.
(Layar draf menyebut "DACUM Tool 1 dan Tool 2" karena butir KSA berasal dari Tool 2 yang disusun dari daftar tugas Tool 1.)

Ditunda: layar tinjauan untuk peran `sme`/`role_leader` (mockup hanya memberi menu ke HR; API sudah mendukung), helper
bersama untuk `wrap`/`UUID`/pesan galat di `li` dan `ld`, dan menggabungkan store `li`/`ld` langsung di `createStores`
alih-alih lewat `lna-stores.js`. Ketegangan kontrak: B0 menganggap modul 2–5 cukup memakai flag, sedangkan API `li`
juga memeriksa entitlement `full_suite` (CLAUDE.md aturan 3). Tenant dengan flag menyala tanpa `full_suite` akan
melihat menu lalu mendapat 403; diteruskan ke pemilik B0. **Selesai 19 Nov**: B0 (#18) menambah `meta.entitlement`,
dan rute `li`/`ld` kini memakainya.

### Review egm susulan (plugin egm asli, 19 Nov 2026, setelah PR #23 masuk scbrmb)

Thread T8 menjalankan langkah egm secara manual karena plugin belum termuat. Thread susulan menjalankannya dengan
plugin: `egm-drift-report` (subagen baru) dan `egm-review` tahap 9 atas diff dengan persona terdaftar
`egm:egm-codebase-details` dan `egm:egm-implementation-readiness`, lalu triase `egm-resolve`. Tidak ada temuan berat
atau Blocker. Laporan dan keputusan per butir: `docs/designs/egm/b13-b14-2026-11-19_DRIFT_REPORT.md` dan
`docs/designs/egm/b13-b14-goldfish_review_report.md`. Perubahan spek di atas (tabel galat, tabel insight, definisi
tuntas dan tidak aktif, cakupan `visibleEmployeeScope`, batas unggah, `meta.entitlement`, daftar file per tahap) berasal
dari triase itu.

Ditunda dari review susulan: kunci unik pelatihan LMS per `catalog_item_id` dan penerusan judul/course nonaktif;
indeks unik parsial `assessment_ref`; kunci per tenant di `syncFromCatalog`; test isolasi tenant untuk endpoint yang
belum dites, webhook tenant ambigu, akun nonaktif di pengingat; kasus tepi status (buka lagi `done`, minta modul yang
sudah tersedia); helper bersama `li`/`ld`.

Review spek tautan lewat kode (`egm:egm-implementation-readiness`, subagen baru, 19 Nov): 0 Blocker, 4 Major, semuanya
diperbaiki di §3, §4 aturan 6, §5, §6, §7, dan §9. Keputusannya: cakupan dibatasi ke library, detail, dan Pareto B13
(LIM = susulan); kunci Pareto tetap nama dan diterima sadar; jalur kode tidak bergantung pada flag B4; `competencies`
diurutkan dan hanya ada di detail; modul dua jabatan menghasilkan dua entri. Nit isolasi tenant dan kurikulum B4 juga
dicatat di spek.

## 9. Batas dengan paket lain

- B4 (Developmental Needs) dan B11 mengimpor DACUM (kompetensi, `code`, `stream`, `program_tier`, job function). B13
  mengimpor library modul KSA (Tool 2) ke tabel `li_*` sendiri dan tidak menambah kolom di `lna_competencies`. Sejak B4
  masuk, modul juga terhubung ke kompetensi lewat `lna_competencies.code` = `li_modules.code` per jabatan (§3), dibaca
  langsung dari kolom B4; B13 tidak menulis ke tabel B4. `GET /api/dna/job-roles/:id/curriculum` (B4) tidak berubah.
- B14 menunjuk `li_modules` dari `ld_trainings.module_id`, dan memetakan course LMS ke modul lewat
  `li_modules.catalog_item_id`.
- B7/B8 (rencana belajar): membaca `li_modules.catalog_item_id` (boleh kosong, per tenant) sebagai course untuk modul,
  dan `status.key = available` sebagai tanda modul siap dipakai. B13 tidak menulis ke tabel B7/B8.
- Entitlement: `li` dan `ld` ikut `full_suite` lewat `FULL_SUITE_ONLY`; paket lain yang menambah modul cukup menambah
  kuncinya di sana.
