# B16 · Career & Promotion (backend)

- Submodul: DNA (router `dna`, endpoint di bawah `/api/dna/career`)
- Paket: B16 (brief bangun penuh 19 Nov, thread T3). Dibangun di atas B4 (`docs/designs/b4-developmental-needs.md`): migrasi 04 harus jalan sebelum 16 karena `/paths` memakai `lna_competencies.program_tier`.
- Flag: `promotion.recommendation` (sudah ada, default mati, punya kill switch) untuk semua endpoint bagian 6, di dalam `requireSubmodule('dna')`.
- Migrasi: blok 16 → `20261119001600-promotion-decisions.js`
- Cakupan tahap ini: API, domain, store, test. Layar (Vue) menyusul di branch yang sama setelah B0 terbuka.
- Reviewer wajib: Andrian (migrasi, `core/settings`, perubahan visibilitas RG-1e).
- Gerbang: `npm run lint`, `npm test`, `npm run build`, `npm run e2e`; CI menjalankan migrasi naik-turun-naik.

## 1. Tujuan

HR dan atasan perlu melihat posisi tiap karyawan pada jenjang jabatan berdasarkan dua bukti, yaitu program kompetensi yang sudah lulus dan pencapaian OKR, lalu mencatat keputusan promosi secara berurutan: atasan merekomendasi atau menunda, HR menyetujui atau menunda. Sistem hanya menandai siapa yang memenuhi syarat; **lulus program dan OKR tercapai bukan kenaikan jabatan otomatis**. Kode POC (`dna/career.js`) baru menghitung "kandidat promosi" dari kelulusan program saja, tanpa OKR dan tanpa alur keputusan.

Keputusan yang berlaku: G2-A (promosi modul terpisah) sudah diganti "ya revisi" 19 Nov, jadi promosi masuk janji 2 Des, tetap di balik flag `promotion.recommendation`.

## 2. Layar mockup yang dicakup

Mockup Pak Eji `/mnt/project-files/mockup-pak-eji/Main.dc.html`, layar "Career & Promotion" (`s.cp`; logika ±baris 1595–1655):

| Bagian mockup | Endpoint |
| --- | --- |
| Tab "Karyawan per divisi": 4 KPI, filter divisi, tabel karyawan (divisi, jabatan, program kompetensi, status jenjang) | `GET /dna/career/map` |
| Kartu "Bukti untuk <karyawan>" | `GET /dna/career/employees/:userId/evidence` |
| Tab "Jalur jenjang": kartu per jenjang (program, jumlah modul, karyawan di jenjang, sudah memenuhi syarat berikutnya) | `GET /dna/career/paths` |
| Tab "Keputusan promosi": tabel usulan, syarat, status atasan, status HR, tombol tindakan | `GET /dna/career/decisions`, `POST …/supervisor`, `POST …/hr` |

Teks statis mockup ("Cara kerja kenaikan jabatan", catatan peringatan, kalimat aturan per jenjang) ada di layar, bukan di API. Tombol "Ulangi demo" tidak dibangun. Mockup menulis atasan "melihat tim di divisi Anda"; API memakai bawahan langsung (RG-3), dan layar menyesuaikan teksnya.

## 3. Istilah

- **Jenjang** = `lna_career_levels` per job role, urut `level_order` (mis. Junior → Senior → Team Leader). Tiap jenjang boleh punya `required_program_tier`.
- **Program lulus** = baris `lna_program_completions` berstatus `passed` untuk tingkat `basic|intermediate|advanced`.
- **Pencapaian OKR** = satu angka 0–100 per karyawan (aturan C2).
- **Ambang OKR** (`okrMin`) = 80 secara default, konfigurasi tenant.
- **Karyawan** (populasi peta, KPI, dan keputusan) = user aktif (status bukan `disabled`) berperan `learner`, `supervisor`, `role_leader`, atau `sme`, sama dengan `GET /dna/employees`. `hr_admin`, `pimpinan`, dan `eta_admin` bukan subjek promosi di paket ini. Bila B2 mengubah daftar peran (K2), daftar ini ikut disesuaikan di sana.
- **Siklus keputusan** = satu baris `lna_promotion_decisions` untuk satu karyawan dari jenjang sekarang ke jenjang berikutnya; **terbuka** selama `hr_decision IS NULL`.
- Nilai keputusan: body atasan `recommend|hold` disimpan apa adanya; body HR `approve|hold` disimpan sebagai `approved|hold`.

## 4. Data dan migrasi

`20261119001600-promotion-decisions.js` (raw SQL, diawali `SET search_path TO "${S}"`; `down` = `DROP TABLE IF EXISTS lna_promotion_decisions`):

```sql
CREATE TABLE lna_promotion_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_level_id uuid NOT NULL REFERENCES lna_career_levels(id) ON DELETE CASCADE,
  to_level_id uuid NOT NULL REFERENCES lna_career_levels(id) ON DELETE CASCADE,
  okr_achievement numeric(5,2),               -- potret saat atasan memutuskan (dua desimal, tanpa pembulatan ke bulat)
  supervisor_decision varchar(16) NOT NULL CHECK (supervisor_decision IN ('recommend','hold')),
  supervisor_by uuid REFERENCES users(id) ON DELETE SET NULL,
  supervisor_at timestamptz NOT NULL,
  supervisor_note text,                       -- terenkripsi per tenant (R2-3)
  hr_decision varchar(16) CHECK (hr_decision IN ('approved','hold')),
  hr_by uuid REFERENCES users(id) ON DELETE SET NULL,
  hr_at timestamptz,
  hr_note text,                               -- terenkripsi per tenant (R2-3)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- paling banyak satu siklus terbuka per karyawan dan jenjang tujuan
CREATE UNIQUE INDEX lna_promotion_open_uq ON lna_promotion_decisions (tenant_id, user_id, to_level_id) WHERE hr_decision IS NULL;
-- paling banyak satu persetujuan per karyawan dan jenjang tujuan
CREATE UNIQUE INDEX lna_promotion_approved_uq ON lna_promotion_decisions (tenant_id, user_id, to_level_id) WHERE hr_decision = 'approved';
CREATE INDEX lna_promotion_user_idx ON lna_promotion_decisions (tenant_id, user_id, created_at DESC);
```

Baris dibuat saat atasan pertama kali memutuskan. FK `ON DELETE CASCADE` disengaja: menghapus data karyawan (hak hapus, PK-15) harus ikut menghapus keputusannya, dan belum ada endpoint yang menghapus jenjang.

Konfigurasi tenant di `core/settings` (`tenants.settings`, tanpa migrasi):

```js
dna: {
  promotionVisibleTo: ['hr_admin', 'supervisor'],   // sebelumnya ['hr_admin']
  promotion: { okrMin: 80, metricTypes: ['okr'] },
}
```

## 5. Aturan bisnis

- **C1 Syarat program.** `currentTierPassed` dan `nextTierPassed` dari `careerStatus()` yang ada: lulus = ada completion `passed` untuk `required_program_tier` jenjang itu; jenjang tanpa syarat program → `null`.
- **C2 Pencapaian OKR.**
  - Sumber: `lna_performance_records` karyawan dengan `metric_type` ∈ `settings.dna.promotion.metricTypes` (default hanya `okr`), dari semua proyek (`project_id` diabaikan).
  - Periode: nilai `period` terbesar menurut urutan teks (format yang dianjurkan impor: `2026-11`, `2026-Q4`); baris tanpa periode hanya dipakai bila karyawan tidak punya baris berperiode.
  - Impor ulang: dalam periode itu, per nama metrik (tanpa beda huruf besar/kecil) hanya baris dengan `created_at` terbaru yang dipakai, supaya impor ulang tidak menggandakan hitungan.
  - Per baris: tipe `biner` dan `tenggat` → 100 bila `is_met`, selain itu 0. Selain itu: arah `higher` → `actual / target × 100` (target ≤ 0 → baris dilewati); arah `lower` → `target / actual × 100` (aktual ≤ 0 → 100 bila target ≥ 0). Target atau aktual bukan angka, atau negatif → baris dilewati. Hasil dibatasi 0–100.
  - Pencapaian = rata-rata sederhana baris yang terhitung, disimpan dua desimal. Perbandingan dengan ambang memakai nilai dua desimal itu (79,50 tidak lolos ambang 80); layar yang membulatkan untuk tampilan.
  - Tanpa baris yang bisa dihitung → `null`.
  - `[⚠️ BELUM TERVERIFIKASI]` Mockup hanya menampilkan satu persen OKR per karyawan tanpa rumus; rumus dan pemilihan periode ini asumsi sampai format data OKR Mas Abdan (26 Nov) diketahui.
- **C3 Memenuhi syarat** (`eligible`) = ada jenjang berikutnya, `currentTierPassed !== false`, `nextTierPassed === true`, dan pencapaian OKR ≥ `okrMin`. OKR `null` tidak memenuhi.
- **C4 Status jenjang** (kode → teks layar), dievaluasi berurutan:
  1. `no_path`: karyawan tanpa job role, atau `career_level_id` kosong, atau job role-nya belum punya kompetensi jabatan → "Belum ada kamus kompetensi".
  2. `below_current`: `currentTierPassed === false` → "Belum memenuhi kompetensi jabatan".
  3. `top_level`: tidak ada jenjang berikutnya → "Jenjang tertinggi".
  4. `next_no_requirement`: jenjang berikutnya tidak punya `required_program_tier` → "Jenjang berikutnya belum punya syarat program" (tidak ada di mockup; tanpa syarat program karyawan tidak boleh otomatis dianggap memenuhi).
  5. `eligible` → "Memenuhi syarat <jenjang berikutnya>".
  6. `program_passed_okr_low`: `nextTierPassed === true`, OKR ada tetapi < ambang → "Program lulus, OKR belum <ambang>%".
  7. `program_passed_no_okr`: `nextTierPassed === true`, OKR `null` → "Program lulus, data OKR belum ada" (tidak ada di mockup; data kosong tidak boleh tampil sebagai 0%).
  8. `on_track`: selain itu → "Menuju <jenjang berikutnya>".
- **C5 Kandidat di tab keputusan** = karyawan dalam scope dengan `nextTierPassed === true` dan `currentTierPassed !== false` (mockup: `nextProg`). Yang OKR-nya belum memenuhi tetap tampil tanpa tindakan.
- **C6 Keputusan atasan.**
  - Siapa: user berperan `supervisor` yang `id`-nya = `users.supervisor_id` karyawan itu. Bukan untuk dirinya sendiri. `hr_admin` dan `eta_admin` → 403 `ROLE_FORBIDDEN`; `supervisor` lain → 404 (karyawan di luar scope-nya).
  - Syarat: karyawan `eligible` saat itu (selain itu 409 `NOT_ELIGIBLE`), dan belum ada siklus `approved` untuk jenjang tujuan itu (409 `ALREADY_DECIDED`).
  - Nilai `recommend` atau `hold`, `note` opsional (teks ≤ 2000 karakter).
  - Tulis: `INSERT … ON CONFLICT (tenant_id, user_id, to_level_id) WHERE hr_decision IS NULL DO UPDATE` yang memperbarui keputusan, catatan, `supervisor_by/at`, `from_level_id`, dan potret `okr_achievement`. Jadi selama HR belum memutuskan atasan boleh mengganti keputusannya, dan klik ganda tidak membuat baris ganda.
- **C7 Keputusan HR.**
  - Siapa: hanya `hr_admin`. `eta_admin` (Super Admin) dan `supervisor` → 403 `ROLE_FORBIDDEN`.
  - Syarat: ada siklus terbuka untuk (karyawan, jenjang berikutnya saat ini) yang `from_level_id`-nya = jenjang karyawan sekarang; bila tidak ada → 409 `WAITING_SUPERVISOR`. `approve` hanya bila atasan `recommend` (selain itu 409 `SUPERVISOR_NOT_RECOMMEND`) dan karyawan masih `eligible` (selain itu 409 `NOT_ELIGIBLE`). `hold` selalu boleh.
  - Tulis (aman terhadap balapan): `UPDATE … SET hr_decision … WHERE id = :id AND hr_decision IS NULL` dan, untuk `approve`, `AND supervisor_decision = 'recommend'`. Nol baris berubah → 409 `ALREADY_DECIDED` (HR lain sudah memutuskan) atau `SUPERVISOR_NOT_RECOMMEND` (atasan baru saja mengubah ke `hold`).
  - Keputusan HR menutup siklus dan tidak bisa diubah.
- **C8 Tidak ada kenaikan otomatis.** `approve` tidak mengubah `users.career_level_id`. Jenjang diubah HR lewat `PUT /dna/employees/:userId/position` setelah ada surat keputusan.
- **C9 Siklus berikutnya dan siklus usang.** Setelah HR `hold`, atasan boleh mengajukan lagi (baris baru). Setelah HR `approved`, tidak ada tindakan lagi untuk jenjang tujuan itu. Endpoint menampilkan siklus terbaru untuk (karyawan, jenjang berikutnya saat ini). Bila posisi karyawan berubah saat siklus terbuka, baris lama tidak lagi cocok (`to_level_id` atau `from_level_id` berbeda) sehingga diabaikan dan tidak bisa disetujui; ia tidak dihapus. Pergantian atasan tidak membatalkan rekomendasi atasan lama; atasan baru bisa menggantinya (C6). `[⏳ DITERIMA]` Riwayat siklus lama tidak punya endpoint; tersimpan di tabel dan audit.
- **C10 Karyawan tanpa atasan yang sah.** Bila `supervisor_id` kosong, atau menunjuk user yang perannya bukan `supervisor`, tidak ada yang bisa mengisi tahap atasan: baris menampilkan `blockedReason: 'no_supervisor'` dan HR tidak bisa memutuskan. HR tidak boleh merangkap tahap atasan (pemisahan tugas). `[⚠️ BELUM TERVERIFIKASI]` Mockup tidak membahas kasus ini; diasumsikan HR membetulkan data atasan lewat impor karyawan. K2 (satu akun banyak peran) adalah milik B2.
- **C11 Visibilitas dan peran.**
  - Semua endpoint: `requireRole(hr_admin, supervisor)`; karyawan dan peran lain → 403. `eta_admin` selalu lolos `requireRole`, jadi ia bisa memanggil GET (melihat) tetapi kedua POST menolaknya secara eksplisit (C6, C7).
  - Selain itu peran pemanggil harus ada di `settings.dna.promotionVisibleTo` (kecuali `eta_admin`), selain itu 403 `ROLE_FORBIDDEN`. Tenant yang mengisi `['hr_admin']` menutup modul ini untuk atasan; akibatnya tidak ada yang bisa merekomendasi, dan itu pilihan tenant.
  - Data dibatasi `scopeFor()` → `visibleEmployeeScope()`: HR semua, atasan bawahan langsungnya. Baris **diri sendiri dikeluarkan** dari semua respons (atasan tidak melihat status promosi dirinya). Karyawan di luar scope, nonaktif, bukan populasi, tenant lain, atau id bukan UUID → 404.
- **C12 Audit.**
  - Baca peta, bukti, dan daftar keputusan → `audit.readIndividual` (`dna.career_map`, `dna.career_evidence`, `dna.promotion_decisions`; `objectType: 'promotion'`).
  - Setiap keputusan menulis satu baris `audit_logs` **dalam transaksi yang sama** dengan baris keputusan (store `promotion` menyisipkan keduanya; bila salah satu gagal, keduanya batal). Kolom `action` dibatasi CHECK ke `read/create/update/delete/export/login`, jadi dipakai `update` dengan `resource = 'dna.promotion_decision'` dan `meta = { event: 'supervisor_decision'|'hr_decision', decision, employeeId, decisionId, fromLevelId, toLevelId, decidedByName, role }`. Waktu = kolom `at`. Catatan (`note`) tidak masuk audit.
  - Nama pengambil keputusan dan waktunya juga tampil di respons (join `users`).
- **C13 Tenant.** Semua query memfilter `tenant_id` dari `req.tenantId`.
- **C14 Endpoint lama.** `GET /dna/promotion-candidates` dan field `career.promotionCandidate` dipertahankan (dipakai `DnaView.vue` sampai layar baru menggantikannya), masih tanpa OKR. Karena default `promotionVisibleTo` kini memuat `supervisor`, atasan ikut melihatnya untuk timnya; `promotionCandidate` untuk baris diri sendiri selalu disembunyikan. Test lama disesuaikan.
- **C15 AI.** Tidak ada rekomendasi AI di paket ini. Bukti "Wawancara ulang AI" berasal dari Impact Measurement (B15) yang belum ada → `reinterview: null`.
- **C16 Catatan keputusan.** `supervisor_note` dan `hr_note` dikembalikan di `/decisions` kepada HR dan atasan karyawan itu (pembacaan tercakup `readIndividual`).

## 6. Endpoint

Semua di bawah `/api/dna/career`: `requireFlag(flags, FLAGS.PROMOTION_RECOMMENDATION, …)`, lalu C11.

| Metode | Path | Respons `data` |
| --- | --- | --- |
| GET | `/map?division=` | `{ okrMin, kpi: { employees, divisions, eligible, awaitingDecision, belowCurrent }, divisions: [nama], employees: [Baris peta] }` |
| GET | `/employees/:userId/evidence` | `{ person: { id, name, division, jobRoleName, level }, status, nextLevel, programsPassed: [tier], okr: { achievement, min, met, period, count } \| null, reinterview: null, supervisorRecommendation: { decision, byName, at } \| null }` |
| GET | `/paths?jobRoleId=` | `{ jobRole: { id, name } \| null, okrMin, levels: [{ id, order, name, requiredProgramTier, moduleCount, employees, readyForNext }] }` |
| GET | `/decisions` | `[Baris keputusan]` |
| POST | `/decisions/:userId/supervisor` | body `{ decision: 'recommend'\|'hold', note? }` → Baris keputusan |
| POST | `/decisions/:userId/hr` | body `{ decision: 'approve'\|'hold', note? }` → Baris keputusan |

**Baris peta:** `{ id, name, division, jobRoleId, jobRoleName, level: { id, name } | null, programs: [{ tier, passed }], okr: { achievement, period, count } | null, status, nextLevel: { id, name, requiredProgramTier } | null, decisionState }`.

**Baris keputusan:** `{ employee: { id, name, division, jobRoleName }, fromLevel: { id, name }, toLevel: { id, name }, requirement: { programPassed: true, okr: { achievement, min, met } | null }, eligible, supervisor: { decision, byName, at, note } | null, hr: { decision, byName, at, note } | null, actions: [...], blockedReason }`.

Catatan:

- `levels[].order` = `level_order` apa adanya (mulai 0); layar yang memberi nomor tampilan.
- `level`, `fromLevel`, `toLevel`, `nextLevel` selalu `{ id, name }` (`nextLevel` ditambah `requiredProgramTier`).
- `division` = `lna_job_roles.division` job role karyawan, bisa `null`. `?division=<nama>` menyaring `employees` dengan nama persis; tanpa parameter semua tampil, termasuk yang `division: null` (layar mengelompokkannya sebagai "Tanpa divisi"). Skema belum punya departemen per karyawan, jadi kolom "departemen" mockup tidak diisi. `[⏳ DITERIMA]` dicatat di PR sebagai kebutuhan data (kolom departemen di impor karyawan, milik B11).
- `kpi` dihitung dari seluruh scope, tidak terpengaruh filter `division`. `kpi.awaitingDecision` = karyawan `eligible` yang siklus terbarunya belum punya keputusan HR (termasuk yang belum disentuh atasan), sama dengan mockup.
- `programs` selalu tiga elemen berurutan basic, intermediate, advanced; `[]` bila status `no_path`.
- `decisionState` ∈ `none | supervisor_recommend | supervisor_hold | approved | hold` dari siklus terbaru yang cocok (C9).
- `evidence.okr` `null` bila tidak ada data; `supervisorRecommendation` = keputusan atasan pada siklus terbaru. `[⚠️ BELUM TERVERIFIKASI]` Di mockup "Review atasan" adalah butir bukti tersendiri (Tersedia/Belum) tanpa sumber data; di sini diisi dari rekomendasi atasan sampai ada sumber lain.
- `paths` tanpa `jobRoleId` memakai job role pertama (urut nama) yang punya jenjang; bila tidak ada → `{ jobRole: null, okrMin, levels: [] }`. `jobRoleId` bukan milik tenant atau bukan UUID → 400. `moduleCount` = jumlah kompetensi jabatan (`kind = 'job'`) job role itu dengan `program_tier` = syarat jenjang (0 bila jenjang tanpa syarat). `[⚠️ BELUM TERVERIFIKASI]` Mockup menghitung modul dari Library; diasumsikan sama dengan kompetensi ber-tingkat B4. `employees` dan `readyForNext` (= `eligible`) dihitung dalam scope pemanggil.
- `actions` untuk pemanggil: atasan langsung + `eligible` + belum `approved` + HR belum memutuskan siklus terbuka → `['recommend','hold']`; `hr_admin` + ada siklus terbuka yang cocok → `['approve','hold']` (`approve` dihilangkan bila atasan `hold` atau karyawan tidak lagi `eligible`); selain itu `[]`. Layar menampilkan tombol nonaktif dari `blockedReason`.
- `blockedReason` (null bila `actions` tidak kosong): `not_eligible` | `no_supervisor` | `waiting_supervisor` (HR, atasan belum memutuskan) | `waiting_hr` (atasan, sudah memutuskan dan masih boleh mengganti → sebenarnya `actions` tetap ada, jadi nilai ini hanya untuk peran lain) | `approved` | `held` (HR menunda; atasan boleh mengajukan lagi sehingga bagi atasan `actions` terisi) | `view_only` (`eta_admin`).
- Urutan: karyawan menurut nama. Tanpa paginasi (POC satu tenant ±50–200 karyawan).
- Galat: 400 `BAD_REQUEST` (`decision` tidak dikenal, `note` bukan teks atau > 2000 karakter); 403 `FEATURE_DISABLED` (flag mati atau kill switch); 403 `ROLE_FORBIDDEN`; 404 `NOT_FOUND`; 409 dengan kode `NOT_ELIGIBLE`, `WAITING_SUPERVISOR`, `SUPERVISOR_NOT_RECOMMEND`, `ALREADY_DECIDED`. Semua pesan berbahasa Indonesia.

## 7. Keputusan default yang dipakai

- K2: peran teknis yang ada (`hr_admin`, `supervisor`); Super Admin (`eta_admin`) melihat tetapi tidak memutuskan.
- "Ya revisi" 19 Nov: promosi masuk 2 Des. RG-3, R2-2, R2-3 (enkripsi catatan).

## 8. Asumsi dan risiko

- `[⚠️ BELUM TERVERIFIKASI]` C2 rumus pencapaian OKR dan pemilihan periode.
- `[⚠️ BELUM TERVERIFIKASI]` C10 karyawan tanpa atasan yang sah.
- `[⚠️ BELUM TERVERIFIKASI]` Perubahan default `promotionVisibleTo` (atasan melihat kandidat timnya) mengikuti mockup final; RG-1e sebelumnya hanya HR.
- `[⚠️ BELUM TERVERIFIKASI]` Sumber "Review atasan" dan `moduleCount`.
- `[⏳ DITERIMA]` Departemen tidak tersedia. Riwayat siklus tanpa endpoint. Tidak ada test beban.

## 8a. Triase review spek (ikan mas, 19 Nov)

20 temuan. **Diperbaiki di spek ini:** aksi audit `decide` ditolak CHECK skema (pakai `update` + `meta.event`); balapan atasan mengubah vs HR menyetujui (UPDATE bersyarat); audit tidak atomik (satu transaksi); atasan yang perannya bukan `supervisor` (C10); OKR terhitung ganda saat impor ulang dan periode mundur (C2); catatan tidak pernah dikembalikan (C16); `eta_admin` lolos `requireRole` (C11, POST menolak eksplisit); atasan melihat status dirinya dan `promotionVisibleTo` tidak menjaga endpoint baru (C11, C14); siklus usang saat posisi berubah (C9); larangan setelah `approved` dan penanganan indeks unik (C6); kode 409 terpisah dan validasi `:userId`; populasi karyawan; jenjang berikutnya tanpa syarat program (`next_no_requirement`); pembulatan terhadap ambang; bentuk respons dan kasus kosong; istilah.

**Ditolak dengan alasan:**
- *FK `RESTRICT` atau potret nama jenjang.* Hak hapus data karyawan (PK-15) mengharuskan keputusan ikut terhapus, dan belum ada endpoint penghapus jenjang; audit tetap menyimpan id jenjang.
- *Penutupan otomatis siklus saat posisi berubah.* Posisi bisa berubah lewat dua jalur (PUT posisi dan impor karyawan); mengabaikan baris yang tidak cocok saat dibaca (C9) menutup celah yang sama tanpa menulis di dua tempat.

**Ditunda (dicatat di PR):** endpoint riwayat keputusan; sumber data "Review atasan" yang terpisah dari rekomendasi.

## 9. Test yang ditulis lebih dulu

- `tests/unit/dna-career.test.js`: pencapaian OKR (arah, biner, tenggat, batas 0–100, target 0, negatif, periode terbesar, deduplikasi impor ulang, kosong, 79,5 tidak lolos), kedelapan status C4, `eligible`, `actions`/`blockedReason` per peran dan keadaan, `decisionState`.
- `tests/unit/dna-domain.test.js`: `careerStatus` lama tetap lulus.
- `tests/integration/dna-career.test.js` (Postgres): flag mati → 403 `FEATURE_DISABLED`; `promotionVisibleTo` tanpa `supervisor` → atasan 403; peta + KPI + filter divisi; atasan tidak melihat dirinya; bukti; jalur; atasan merekomendasi lalu HR menyetujui, dengan baris audit `update` bermeta nama; klik ganda atasan tidak membuat baris ganda; atasan `hold` → HR `approve` 409 `SUPERVISOR_NOT_RECOMMEND` tetapi `hold` boleh; HR sebelum atasan → 409 `WAITING_SUPERVISOR`; OKR < 80 → atasan 409 `NOT_ELIGIBLE`; atasan lain 404; karyawan 403; `hr_admin` di tahap atasan dan `eta_admin` di kedua tahap 403, `eta_admin` GET 200; tenant lain 404; karyawan nonaktif 404; jenjang karyawan tidak berubah setelah `approve`; setelah `approved` atasan 409 `ALREADY_DECIDED`; siklus baru setelah HR `hold`; perubahan posisi membuat siklus terbuka lama tidak bisa disetujui; jenjang berikutnya tanpa syarat program; atasan bukan peran `supervisor` → `no_supervisor`; catatan tersimpan terenkripsi dan tampil di `/decisions`.
- `tests/integration/poc-dna-tna.test.js`: penyesuaian C14.

## 10. Perubahan file

- [x] `apps/api/migrations/20261119001600-promotion-decisions.js`
- [x] `apps/api/src/modules/dna/career.js` (OKR, status, tindakan; `careerStatus` tetap)
- [x] `apps/api/src/modules/dna/career-routes.js`
- [x] `apps/api/src/modules/dna/index.js` (pasang router, sembunyikan kandidat diri sendiri)
- [x] `apps/api/src/core/settings/index.js`
- [x] `apps/api/src/db/lna-stores.js` (store `promotion`, OKR per karyawan, divisi dan status di `people`)
- [x] `apps/api/tests/unit/dna-career.test.js`
- [x] `apps/api/tests/integration/dna-career.test.js`
- [x] `apps/api/tests/integration/poc-dna-tna.test.js`
- [x] `docs/ewi/poc-dna-tna.md`

## 10a. Triase review diff (ikan mas, 19 Nov)

Review diff B16 oleh subagent baru: 11 temuan, tidak ada yang berat. Perbaikan dikerjakan test-first (skill `tdd`: test merah dulu di seam HTTP `/api/dna/career/*` dan fungsi murni `dna/career.js`, lalu implementasi).

**Diperbaiki:**
- Tahap atasan membaca peran atasan dari basis data (`supervisorRole`), bukan dari token: token atasan yang perannya sudah dicabut → 403 (1).
- Balapan atasan vs HR `approve`: rute HR memeriksa `approved` lebih dulu; kedua transaksi mengunci baris karyawan (`FOR UPDATE`); indeks unik parsial `lna_promotion_approved_uq` sebagai penjaga terakhir (2).
- Konfigurasi `dna.promotion` dan `promotionVisibleTo` yang rusak jatuh ke default (`promotionSettings`), bukan meloloskan semua atau 500 (3).
- Deduplikasi impor ulang OKR deterministik: waktu sama → id terbesar; query berurutan `created_at, id` (5).
- Atasan boleh menarik rekomendasi terbuka (`hold`) walau karyawan tidak lagi memenuhi syarat; `recommend` tetap 409 `NOT_ELIGIBLE` (6). Mengubah C6.
- Super Admin melihat keputusan tanpa catatan (8). Memperjelas C16.
- Pemisahan tugas: HR yang memberi rekomendasi itu sendiri (peran berubah) tidak boleh memutuskannya → 403 (9).
- Test tambahan: karyawan `below_current` di data integrasi, `hr_note` terenkripsi, catatan terlihat atasan lewat GET, POST HR untuk karyawan tanpa atasan, HR melihat HR lain → 404, konfigurasi rusak (10, 11 sebagian).

**Diputuskan (C9 vs C10):** siklus terbuka yang dibuat atasan sah tetap boleh diputuskan HR walau atasan itu kemudian berganti atau perannya dicabut; rekomendasinya sah saat dibuat (C9). `no_supervisor` hanya menghalangi siklus yang belum ada.

**Ditunda (dicatat di PR):** urutan teks periode untuk format campuran (4; tetap `[⚠️ BELUM TERVERIFIKASI]` sampai format OKR Mas Abdan diketahui); siklus usang yang hidup lagi bila karyawan kembali ke jenjang semula (7; kasus langka, HR bisa menunda); test atomisitas audit, balapan nol baris, dan kill switch (10; butuh injeksi kegagalan di store, di luar pola test repo).
