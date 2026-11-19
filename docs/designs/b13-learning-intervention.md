# B13 · Learning Intervention (modul `li`)

Status: spek untuk review egm · 19 Nov 2026 · paket B13 dari `brief-bangun-penuh-19nov.md` (thread T8).
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
`sme` dan `role_leader`.

## 3. Data dan migrasi

Blok migrasi 13: `20261119001300-learning-intervention.js` (raw SQL, punya `down`). Semua tabel punya `tenant_id`.

| Tabel | Kolom penting | Catatan |
| --- | --- | --- |
| `li_modules` | `code` (unik per tenant), `name`, `level` (`basic`/`intermediate`/`advanced`), `stream` (rumpun, teks bebas), `objective`, `catalog_item_id` → `lna_catalog_items` (null) , `import_batch_id` | Satu baris per modul DACUM Tool 2 |
| `li_module_items` | `module_id`, `kind` (`K`/`S`/`A`), `text`, `position` | Butir KSA |
| `li_module_job_roles` | `module_id`, `job_role_id` → `lna_job_roles` | Satu modul bisa dipakai beberapa jabatan |
| `li_module_competencies` | `module_id`, `competency_id` → `lna_competencies` | Dipakai untuk prioritas Pareto |
| `li_module_requests` | `module_id`, `vendor_name`, `status` (`requested`/`confirmed`/`delivered`/`installed`/`cancelled`), `requested_by`, waktu per status, `note` | Indeks unik parsial: satu permintaan aktif (bukan `cancelled`) per modul |
| `li_module_drafts` | `module_id` (unik per tenant), `status` (`draft`/`sme_review`/`approved`/`returned`), `objectives`/`sessions`/`assessments` (jsonb), `generated_by`, `submitted_at`, `reviewed_by`, `reviewer_name`, `review_note`, `reviewed_at`, `created_by` | Satu draf per modul; `review_recorded_by_hr` menandai keputusan SME yang dicatat HR |

Tabel `lna_catalog_items` berasal dari PK-18, yang sudah ada di branch integrasi.

Isi modul tidak memuat data pribadi, jadi tidak dienkripsi per tenant dan baca daftar modul tidak dicatat sebagai baca
data individu. Semua perubahan (permintaan, ubah status, draf diajukan, keputusan SME) dicatat lewat `audit.record`.

### Cara data masuk

Jenis impor baru `li_modules` di modul `imports` (template nomor 9), dipasang di `/api/li/imports`. Satu baris = satu
butir KSA. Kolom: Kode Modul*, Nama Modul*, Level*, Rumpun, Tujuan, Jabatan (nama jabatan, pisah titik koma),
Kompetensi (nama kompetensi di kamus, pisah titik koma), Tipe Butir* (K/S/A atau Knowledge/Skill/Attitude), Butir*.
Nama, level, rumpun, tujuan, jabatan, dan kompetensi diambil dari baris pertama tiap kode; baris berikutnya boleh
kosong, tetapi bila diisi harus sama. Impor ulang kode yang sama memperbarui modul dan mengganti butir, jabatan, serta
kompetensinya. Permintaan dan draf yang sudah ada tidak dihapus dan tidak disesuaikan. Impor bersifat atomik per
kode modul: satu baris salah menolak seluruh modul itu. Jabatan atau kompetensi yang tidak dikenal ditolak
per baris dengan alasan.

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
   (course di katalog LMS/EliteMentor, dicek milik tenant yang sama) agar rencana training bisa menunjuk course itu. ELGOS **tidak mengirim apa
   pun ke vendor**: tombol "Minta" hanya mencatat permintaan; HR yang menghubungi vendor. Ini ditulis di layar.
4. **Nama vendor** dari `settings.li.vendorName`, default `"Mahaka Institute"` (K4), disalin ke `vendor_name` saat
   permintaan dibuat.
5. **Sumber yang disarankan**: `dev` bila rumpun modul ada di `settings.li.devStreams` (default
   `["Specific Technical"]`), selain itu `vendor`. Ini usulan awal, tidak mengunci pilihan HR.
   `[⚠️ BELUM TERVERIFIKASI]` Aturan rumpun ini berasal dari logika mockup, belum dikonfirmasi Pak Eji.
6. **Prioritas Pareto 20/80.** Sumber: temuan TNA kategori `training`, diperingkat `rankTrainingNeeds`
   (`modules/tna/pareto.js`) dengan `settings.tna.pareto`. Data diambil lewat query khusus yang tidak membawa judul atau
   rincian temuan; temuan tanpa kompetensi tidak ikut dan dilaporkan sebagai `unlinkedFindings`. Pencocokan memakai nama
   kompetensi yang dinormalkan, dan dibatasi ke satu jabatan bila filter `jobRoleId` dipakai. Kompetensi prioritas = baris dengan
   `cumulativeShare ≤ 0,8`, ditambah baris peringkat 1 (agar tidak kosong bila satu kompetensi > 80%). Modul prioritas
   = modul yang terhubung ke kompetensi prioritas; peringkat modul = peringkat terbaik kompetensinya. Modul tanpa
   kompetensi terhubung atau tanpa temuan = "belum ada data gap". Bila `module.tna` mati untuk tenant, prioritas
   kosong dan `pareto.available = false`.
7. **Permintaan massal** (`POST /requests/bulk`): `scope: "pareto"` meminta semua modul prioritas yang sumber
   sarannya `vendor` dan statusnya `none`; `scope: "program"` (wajib `jobRoleId` dan `level`) meminta semua modul
   seperti itu di program tersebut. Respons: jumlah yang dibuat dan yang dilewati (termasuk yang kalah balapan dengan permintaan lain).
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
   HR boleh menyunting ketiga bagian (`PUT`) selama status `draft`/`returned`. `submit` ditolak bila ada tujuan
   yang tidak terukur, tujuan kosong, atau modul tanpa butir.
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
| GET | `/api/li/modules?jobRoleId&priority=pareto&type=K\|S\|A&level&stream` | `{ data: [ringkas], kpis, pareto, filters: { jobRoles, streams }, vendorName }` |
| GET | `/api/li/modules/:id` | detail + `items` per tipe, `jobRoles`, `status`, `priority`, `recommendation`, `request`, `draft` (ringkas) |
| POST | `/api/li/modules/:id/request` | 201 permintaan; 409 `PATH_ACTIVE` |
| POST | `/api/li/requests/bulk` | `{ scope, jobRoleId?, level? }` → `{ created, skipped }` |
| GET | `/api/li/requests` | `{ vendor: [...], drafts: [...], candidates: [...] }` (kandidat = saran `dev`, status `none`, prioritas dulu) |
| PATCH | `/api/li/requests/:id` | `{ status, catalogItemId?, note? }`; 409 `INVALID_TRANSITION` |
| GET | `/api/li/programs?jobRoleId&level` | `{ jobRoles, levels: [{ level, count }], kpis, groups: [{ stream, modules }] , pareto }` |
| POST | `/api/li/modules/:id/draft` | 201 draf baru, atau 200 draf yang sudah ada |
| PATCH | `/api/li/modules/:id` | `{ catalogItemId \| null }` tautkan course katalog |
| GET | `/api/li/drafts` | antrean tinjauan untuk `sme`/`role_leader`/HR |
| GET/PUT/DELETE | `/api/li/drafts/:id` | baca / sunting / hapus |
| POST | `/api/li/drafts/:id/submit` | → `sme_review`; 400 bila belum terukur |
| POST | `/api/li/drafts/:id/review` | `{ decision, note?, reviewerName? }` |
| * | `/api/li/imports/...` | router impor yang ada, `submodule: 'li'` |

Setiap query memfilter `tenant_id = req.tenantId`. ID dari tenant lain menghasilkan 404.

## 6. Test yang ditulis lebih dulu

- `tests/unit/li-domain.test.js`: `moduleStatus` (semua urutan), `recommendedSource`, `priorityFromPareto` (≤ 80%,
  peringkat 1 selalu masuk, kosong), `generateDraft` (K/S/A, modul tanpa A), `isMeasurable`, transisi vendor.
- `tests/unit/gating.test.js` (tambahan): `li` butuh `full_suite` + `module.li`; flag mati → 403 `FEATURE_DISABLED`.
- `tests/integration/li.test.js` (Postgres): impor `li_modules` (baru, ulang, baris ditolak) → daftar + filter + KPI →
  prioritas Pareto dari temuan TNA → minta vendor, alur status, batal, permintaan massal → draf, sunting, ajukan,
  kembalikan, setujui → program per jabatan → isolasi tenant (404/daftar kosong) → peran non-HR 403 → audit tercatat.
- UI (setelah B0): e2e Playwright dengan API mock untuk empat layar.

## 7. Daftar perubahan file

Backend:
- [x] `apps/api/migrations/20261119001300-learning-intervention.js`
- [x] `apps/api/src/core/flags/index.js` (flag `module.li`)
- [x] `apps/api/src/core/entitlement/index.js` (modul khusus `full_suite`)
- [x] `apps/api/src/core/settings/index.js` (`li.vendorName`, `li.devStreams`)
- [x] `apps/api/src/modules/li/domain.js`, `design.js`, `index.js`
- [x] `apps/api/src/db/li-stores.js` + sambungan di `db/lna-stores.js`
- [x] `apps/api/src/modules/imports/kinds/li-modules.js` + `kinds/index.js`
- [x] `apps/api/src/app.js` (pasang modul)
- [x] test di bagian 6

UI (menumpuk di atas B0):
- [ ] `apps/web/src/screens/li/` (api, layar Library, Program, Permintaan, Draf modul; `routes.ts` dengan nama rute
      `lib`, `prog`, `req`, sesuai kontrak B0)
- [ ] `apps/web/e2e/li.spec.ts`

## 8. Keputusan triase review egm

Review spek oleh subagen baru (empat lensa) dilakukan sebelum membangun. Diperbaiki (sudah tercermin di atas): query
Pareto tanpa judul temuan; pencocokan per nama kompetensi dan per jabatan; impor atomik per kode modul; tujuan draf
menyalin teks butir (tanpa id butir); perlindungan balapan (kunci baris modul, transisi atomik); `catalogItemId` dicek
per tenant; rancangan yang disetujui SME bukan berarti course tersedia (`dev_approved`); antrean tinjauan untuk SME;
`review_recorded_by_hr`; nama vendor di semua respons; perbandingan rumpun dinormalkan.

Ditolak, dengan alasan:
- Foreign key komposit `(tenant_id, id)`: pola repo adalah pengecekan tenant di store ditambah test isolasi; mengubahnya
  hanya untuk tabel `li_*` membuat dua pola.
- Menyaring temuan menurut status tinjauan: dibiarkan sama dengan `/api/tna/pareto` agar dua layar tidak menampilkan
  peringkat berbeda.

Ditunda (dicatat di PR): draf dari LLM (sekarang templat), HR mencatat keputusan SME selama peran SME belum pasti,
`isMeasurable` hanya memeriksa adanya angka (sama dengan mockup), pengaturan `settings.li` belum punya endpoint tulis,
impor ulang tidak menyesuaikan draf yang sudah ada.

## 9. Batas dengan paket lain

- B4 (Developmental Needs) dan B11 mengimpor DACUM (kompetensi, `code`, `stream`, `program_tier`, job function). B13
  mengimpor library modul KSA (Tool 2) ke tabel `li_*` sendiri dan tidak menambah kolom di `lna_competencies`. Setelah B4
  masuk, tautan modul ke kompetensi sebaiknya memakai `lna_competencies.code`, bukan nama.
- B14 menunjuk `li_modules` dari `ld_trainings.module_id`.
- Entitlement: `li` dan `ld` ikut `full_suite` lewat `FULL_SUITE_ONLY`; paket lain yang menambah modul cukup menambah
  kuncinya di sana.
