# B16 · Career & Promotion

- Submodul: DNA (router `dna`, endpoint di bawah `/api/dna/career`)
- Paket: B16 (brief bangun penuh 19 Nov, thread T3). Dibangun di atas B4 (`docs/designs/b4-developmental-needs.md`): migrasi 04 harus jalan sebelum 16 karena `/paths` memakai `lna_competencies.program_tier`.
- Flag: `promotion.recommendation` (sudah ada, default mati, punya kill switch) untuk semua endpoint bagian 6, di dalam `requireSubmodule('dna')`.
- Migrasi: blok 16 → `20261119001600-promotion-decisions.js`
- Cakupan: API, domain, store, test, dan layar Vue di atas B0 (`apps/web/src/screens/b16-cp`, rute `cp` di `/cp`, `meta.flag` `promotion.recommendation`, `submodule: 'dna'`, `meta.roles` HR/atasan/Super Admin). Satu PR (#22) bersama B4.
- Reviewer wajib: Andrian (migrasi, `core/settings`, perubahan visibilitas RG-1e).
- Gerbang: `npm run lint`, `npm test`, `npm run build`, `npm run e2e`; CI menjalankan migrasi naik-turun-naik.

Sumber acuan:

- Mockup Pak Eji (final, 19 Nov): layar "Career & Promotion" (`s.cp`) di `Main.dc.html` (salinan di folder proyek `mockup-pak-eji/`; aslinya https://claude.ai/artifact/3pRkbt7pJexZqgnFsUGJud).
- Brief bangun penuh 19 Nov (`/mnt/project-files/elgos-eksekusi/brief-bangun-penuh-19nov.md`), bagian T3 dan default K1–K4.
- **B0** = `docs/designs/b0-fondasi-ui.md`; **B4** = `docs/designs/b4-developmental-needs.md`.
- Kode keputusan (log di `/mnt/project-files/ewi-grilling/`):
  - **RG-1** (rapat 10 Nov, Ahmad Gilang): jenjang karier dengan syarat program per jenjang; **RG-1e** = siapa yang melihat kandidat promosi (konfigurasi `promotionVisibleTo`); **RG-1g** = jumlah dan nama jenjang per klien.
  - **RG-3**: visibilitas data karyawan (learner dirinya, atasan timnya, HR semua).
  - **R2-2**: setiap pembacaan data individu dicatat di audit (`audit.readIndividual`). **R2-3**: teks bebas sensitif dienkripsi per tenant (`core/crypto`).
  - **G2-A** (13 Nov): promosi modul terpisah di luar POC; diganti "ya revisi" 19 Nov (promosi masuk janji 2 Des).
  - **K2** (brief): peran teknis yang ada dipakai apa adanya; multi-peran milik B2. **PK-15**: hak hapus data karyawan.
- `CLAUDE.md` repo ini (aturan arsitektur 1–7).

## 1. Tujuan

HR dan atasan perlu melihat posisi tiap karyawan pada jenjang jabatan berdasarkan dua bukti, yaitu program kompetensi yang sudah lulus dan pencapaian OKR, lalu mencatat keputusan promosi secara berurutan: atasan merekomendasi atau menunda, HR menyetujui atau menunda. Sistem hanya menandai siapa yang memenuhi syarat; **lulus program dan OKR tercapai bukan kenaikan jabatan otomatis**. Kode POC (`dna/career.js`) baru menghitung "kandidat promosi" dari kelulusan program saja, tanpa OKR dan tanpa alur keputusan.

Keputusan yang berlaku: G2-A (promosi modul terpisah) sudah diganti "ya revisi" 19 Nov, jadi promosi masuk janji 2 Des, tetap di balik flag `promotion.recommendation`.

**Bukan sasaran:** kenaikan jabatan otomatis (C8); rekomendasi AI (C15); riwayat siklus sebagai endpoint; departemen per karyawan (butuh kolom impor B11); B16 tidak menggantikan halaman POC DNA lama (C14).

**Alur komponen.** `career-routes.js` (HTTP, peran, scope) → `store.promotion` (`lna-stores.js`: muat karyawan, jenjang, completion, OKR, keputusan; tulis keputusan + audit dalam satu transaksi) → fungsi murni `career.js` (`okrAchievement`, `careerState`, `findCycle`, `decisionView`, `promotionSettings`). Layar `screens/b16-cp` hanya memakai `actions` dan `blockedReason` dari API untuk tombol.

## 2. Layar mockup yang dicakup

Mockup Pak Eji `/mnt/project-files/mockup-pak-eji/Main.dc.html`, layar "Career & Promotion" (`s.cp`; logika ±baris 1595–1655):

| Bagian mockup | Endpoint |
| --- | --- |
| Tab "Karyawan per divisi": 4 KPI, filter divisi, tabel karyawan (divisi, jabatan, program kompetensi, status jenjang) | `GET /dna/career/map` |
| Kartu "Bukti untuk `<karyawan>`" | `GET /dna/career/employees/:userId/evidence` |
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

(Ringkasan; DDL lengkap di file migrasi.) Tabel `lna_promotion_decisions`: `tenant_id`, `user_id`, `from_level_id`, `to_level_id` (FK `ON DELETE CASCADE`), `okr_achievement numeric(5,2)` (potret saat atasan memutuskan, hanya untuk audit; tidak dipakai menghitung ulang), `supervisor_decision` (`recommend|hold`), `supervisor_by/at/note`, `hr_decision` (`approved|hold`, null = siklus terbuka), `hr_by/at/note`. `supervisor_note` dan `hr_note` dienkripsi per tenant lewat `core/crypto` (R2-3). Indeks unik parsial: satu siklus terbuka per (tenant, karyawan, jenjang tujuan) dan satu `approved` per (tenant, karyawan, jenjang tujuan).


Baris dibuat saat atasan pertama kali memutuskan. FK `ON DELETE CASCADE` disengaja: menghapus data karyawan (hak hapus, PK-15) harus ikut menghapus keputusannya, dan belum ada endpoint yang menghapus jenjang.

Konfigurasi tenant di `core/settings` (`tenants.settings`, tanpa migrasi):

```js
dna: {
  promotionVisibleTo: ['hr_admin', 'supervisor'],   // sebelumnya ['hr_admin']
  promotion: { okrMin: 80, metricTypes: ['okr'] },   // metricTypes: setelan internal, tidak ada di layar
}
```

## 5. Aturan bisnis

- **C1 Syarat program.** `currentTierPassed` dan `nextTierPassed` dari `careerStatus()` yang ada: lulus = ada completion `passed` untuk `required_program_tier` jenjang itu; jenjang tanpa syarat program → `null`.
- **C2 Pencapaian OKR.** Dihitung dari `lna_performance_records` karyawan, berurutan:
  1. Ambil baris dengan `metric_type` ∈ `settings.dna.promotion.metricTypes` (default `['okr']`), dari semua proyek (`project_id` diabaikan).
  2. Pilih periode: nilai `period` terbesar menurut urutan teks (format yang dianjurkan impor: `2026-11`, `2026-Q4`). Baris dengan `period` kosong hanya dipakai bila karyawan tidak punya baris berperiode.
  3. Dalam periode itu, per `name` (tanpa beda huruf besar/kecil) ambil satu baris: `created_at` terbaru; bila sama, `id` terbesar. Impor ulang tidak menggandakan hitungan.
  4. Nilai tiap baris (0–100):
     - `value_type` `biner` atau `tenggat`: 100 bila `is_met`, selain itu 0.
     - `target` atau `actual` bukan angka atau negatif: baris dilewati.
     - `direction = 'lower'`: `actual` ≤ 0 → 100; selain itu `target / actual × 100`.
     - selain itu (`higher`): `target` ≤ 0 → baris dilewati; selain itu `actual / target × 100`.
     - hasil dibatasi 0–100.
  5. Pencapaian = rata-rata sederhana baris yang tidak dilewati, dibulatkan **dua desimal**. Ambang dibandingkan dengan nilai dua desimal itu (79,50 tidak lolos 80); layar membulatkan biasa untuk tampilan, kecuali bila pembulatan menyeberangi ambang (79,5 → 79%, bukan 80%).
  6. Tidak ada baris yang terhitung → `null`.
  - `[⚠️ BELUM TERVERIFIKASI]` Rumus, pemilihan periode, format periode campuran, dan batas umur periode (OKR lama tetap dipakai bila tidak ada yang baru) adalah asumsi sampai format OKR Mas Abdan (26 Nov) diketahui. Mockup hanya menampilkan satu persen OKR tanpa rumus.
- **C3 Memenuhi syarat** (`eligible`) = ada jenjang berikutnya, `currentTierPassed !== false`, `nextTierPassed === true`, dan pencapaian OKR ≥ `okrMin`. OKR `null` tidak memenuhi.
- **C4 Status jenjang** (kode → teks layar), dievaluasi berurutan:
  1. `no_path`: karyawan tanpa job role, atau `career_level_id` kosong, atau job role-nya belum punya kompetensi jabatan → "Belum ada kamus kompetensi".
  2. `below_current`: `currentTierPassed === false` → "Belum memenuhi kompetensi jabatan".
  3. `top_level`: tidak ada jenjang berikutnya → "Jenjang tertinggi".
  4. `next_no_requirement`: jenjang berikutnya tidak punya `required_program_tier` → "Jenjang berikutnya belum punya syarat program" (tidak ada di mockup; tanpa syarat program karyawan tidak boleh otomatis dianggap memenuhi).
  5. `eligible` → "Memenuhi syarat `<jenjang berikutnya>`".
  6. `program_passed_okr_low`: `nextTierPassed === true`, OKR ada tetapi < ambang → "Program lulus, OKR belum `<ambang>`%".
  7. `program_passed_no_okr`: `nextTierPassed === true`, OKR `null` → "Program lulus, data OKR belum ada" (tidak ada di mockup; data kosong tidak boleh tampil sebagai 0%).
  8. `on_track`: selain itu → "Menuju `<jenjang berikutnya>`".
- **C5 Kandidat di tab keputusan** = karyawan dalam scope dengan `nextTierPassed === true` dan `currentTierPassed !== false` (mockup: `nextProg`). Yang OKR-nya belum memenuhi tetap tampil tanpa tindakan.
- **C6 Keputusan atasan.**
  - Siapa: user berperan `supervisor` yang `id`-nya = `users.supervisor_id` karyawan itu. Bukan untuk dirinya sendiri. `hr_admin` dan `eta_admin` → 403 `ROLE_FORBIDDEN`; `supervisor` lain → 404 (karyawan di luar scope-nya).
  - Peran atasan dibaca dari basis data (`users.role` atasan = `supervisor`), bukan dari token; selain itu 403 `ROLE_FORBIDDEN`.
  - Syarat: karyawan `eligible` saat itu (selain itu 409 `NOT_ELIGIBLE`), dan belum ada siklus `approved` untuk jenjang tujuan itu (409 `ALREADY_DECIDED`). Pengecualian: `hold` atas siklus terbuka selalu boleh, supaya atasan bisa menarik rekomendasinya bila karyawan tidak lagi memenuhi syarat.
  - Nilai `recommend` atau `hold`, `note` opsional (teks ≤ 2000 karakter).
  - Tulis dalam transaksi yang mengunci baris karyawan (`FOR UPDATE`): `INSERT … ON CONFLICT (tenant_id, user_id, to_level_id) WHERE hr_decision IS NULL DO UPDATE` yang memperbarui keputusan, catatan, `supervisor_by/at`, `from_level_id`, dan potret `okr_achievement`. Jadi selama HR belum memutuskan atasan boleh mengganti keputusannya, dan klik ganda tidak membuat baris ganda.
- **C7 Keputusan HR.** Pemeriksaan berurutan:
  1. Peran token harus `hr_admin`; `eta_admin` dan `supervisor` → 403 `ROLE_FORBIDDEN`.
  2. Sudah ada siklus `approved` untuk jenjang tujuan → 409 `ALREADY_DECIDED`.
  3. Tidak ada siklus terbuka untuk (karyawan, jenjang berikutnya saat ini) dengan `from_level_id` = jenjang karyawan sekarang → 409 `WAITING_SUPERVISOR`.
  4. **Pemisahan tugas:** HR yang tercatat sebagai `supervisor_by` siklus itu (mis. perannya berubah dari atasan ke HR) → 403 `ROLE_FORBIDDEN`; layar tidak memberi tombol (`blockedReason: 'self_recommended'`).
  5. `approve`: atasan harus `recommend` (selain itu 409 `SUPERVISOR_NOT_RECOMMEND`) dan karyawan masih `eligible` (selain itu 409 `NOT_ELIGIBLE`). `hold` selalu boleh.
  - Tulis dalam transaksi yang mengunci baris karyawan (`SELECT … FOR UPDATE` pada `users`, sama dengan tahap atasan): `UPDATE … SET hr_decision … WHERE id = :id AND hr_decision IS NULL` dan, untuk `approve`, `AND supervisor_decision = 'recommend'`. UPDATE juga mensyaratkan `from_level_id` = jenjang karyawan saat ini (dibaca di bawah kunci), supaya perubahan posisi yang masuk setelah rute membaca siklus tidak meloloskan siklus usang (C9). Nol baris berubah → 409 `SUPERVISOR_NOT_RECOMMEND` bila siklus yang sama masih terbuka (atasan baru saja mengubah ke `hold`), `WAITING_SUPERVISOR` bila tidak ada lagi siklus terbuka yang cocok (posisi berubah), selain itu `ALREADY_DECIDED`. Indeks unik `approved` adalah penjaga terakhir.
  - Siklus terbuka yang dibuat atasan sah tetap boleh diputuskan HR walau atasan itu kemudian berganti, perannya dicabut, atau `supervisor_id` dikosongkan; rekomendasinya sah saat dibuat (C9). `no_supervisor` (C10) hanya menghalangi siklus yang belum ada.
  - Keputusan HR menutup siklus dan tidak bisa diubah.
- **C8 Tidak ada kenaikan otomatis.** `approve` tidak mengubah `users.career_level_id`. Jenjang diubah HR lewat `PUT /dna/employees/:userId/position` setelah ada surat keputusan.
- **C9 Siklus berikutnya dan siklus usang.** Setelah HR `hold`, atasan boleh mengajukan lagi (baris baru). Setelah HR `approved`, tidak ada tindakan lagi untuk jenjang tujuan itu. Endpoint menampilkan siklus terbaru untuk (karyawan, jenjang berikutnya saat ini). Bila posisi karyawan berubah saat siklus terbuka, baris lama tidak lagi cocok (`to_level_id` atau `from_level_id` berbeda) sehingga diabaikan dan tidak bisa disetujui; ia tidak dihapus. Pergantian atasan tidak membatalkan rekomendasi atasan lama; atasan baru bisa menggantinya (C6). Riwayat siklus lama tidak punya endpoint (§8).
- **C10 Karyawan tanpa atasan yang sah.** Bila `supervisor_id` kosong, atau menunjuk user yang perannya bukan `supervisor`, tidak ada yang bisa mengisi tahap atasan: baris menampilkan `blockedReason: 'no_supervisor'` dan HR tidak bisa memutuskan (kecuali siklus terbuka yang sudah ada, C7). HR tidak boleh merangkap tahap atasan (pemisahan tugas). Mockup tidak membahas kasus ini; diasumsikan HR membetulkan data atasan lewat impor karyawan (§8). K2 (satu akun banyak peran) adalah milik B2.
- **C11 Visibilitas dan peran.**
  - Semua endpoint: `requireRole(hr_admin, supervisor)`; `learner` dan peran lain → 403 `ROLE_FORBIDDEN`. `eta_admin` selalu lolos `requireRole`, jadi ia bisa memanggil GET (melihat) tetapi kedua POST menolaknya secara eksplisit (C6, C7).
  - Selain itu peran pemanggil harus ada di `settings.dna.promotionVisibleTo` (`dna` null atau bukan objek dianggap kosong; nilai `promotionVisibleTo` bukan array dianggap `['hr_admin']`; `okrMin` di luar 0–100 atau bukan angka dianggap 80, `metricTypes` kosong dianggap `['okr']`) (kecuali `eta_admin`), selain itu 403 `ROLE_FORBIDDEN`. Tenant yang mengisi `['hr_admin']` menutup modul ini untuk atasan; akibatnya tidak ada yang bisa merekomendasi dan alur berhenti di `waiting_supervisor`. Akibat ini diketahui dan disengaja: RG-1e adalah keputusan privasi user, jadi gerbang kedua ini tidak dihapus sepihak (eskalasi review egm S6, §8).
  - Data dibatasi `scopeFor()` → `visibleEmployeeScope()`: HR semua, atasan bawahan langsungnya. Baris **diri sendiri dikeluarkan** dari semua respons (atasan tidak melihat status promosi dirinya). Karyawan di luar scope, nonaktif, bukan populasi, tenant lain, atau id bukan UUID → 404.
- **C12 Audit.**
  - Baca peta, bukti, dan daftar keputusan → `audit.readIndividual` (`dna.career_map`, `dna.career_evidence`, `dna.promotion_decisions`; `objectType: 'promotion'`).
  - Setiap keputusan menulis satu baris `audit_logs` **dalam transaksi yang sama** dengan baris keputusan (store `promotion` menyisipkan keduanya; bila salah satu gagal, keduanya batal). Kolom `action` dibatasi CHECK ke `read/create/update/delete/export/login`, jadi dipakai `update` dengan `resource = 'dna.promotion_decision'` dan `meta = { event: 'supervisor_decision'|'hr_decision', decision, employeeId, decisionId, fromLevelId, toLevelId, decidedByName, role }`. Waktu = kolom `at`. Catatan (`note`) tidak masuk audit.
  - Nama pengambil keputusan dan waktunya juga tampil di respons (join `users`).
- **C13 Tenant.** Semua query memfilter `tenant_id` dari `req.tenantId`.
- **C14 Endpoint lama.** `GET /dna/promotion-candidates` dan field `career.promotionCandidate` dipertahankan (dipakai `DnaView.vue` sampai layar baru menggantikannya), masih tanpa OKR ("kandidat" = program saja, beda dengan `eligible` C3). Supaya dua definisi kandidat tidak bertemu di depan atasan, endpoint lama **tetap hanya untuk `hr_admin` dan `eta_admin`** seperti sebelum B16, walau default `promotionVisibleTo` kini memuat `supervisor`: atasan → 403 `ROLE_FORBIDDEN` dan field disembunyikan. Atasan memakai `/cp`. Setelan rusak dibaca lewat `promotionSettings()` (tidak 500). `promotionCandidate` untuk baris diri sendiri selalu disembunyikan.
- **C15 AI.** Tidak ada rekomendasi AI di paket ini. Bukti "Wawancara ulang AI" berasal dari Impact Measurement (B15) yang belum ada → `reinterview: null`.
- **C16 Catatan keputusan.** `supervisor_note` dan `hr_note` dikembalikan di `/decisions` kepada HR dan atasan karyawan itu (pembacaan tercakup `readIndividual`). Super Admin melihat keputusan dengan `note: null`.

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
- `division` = `lna_job_roles.division` job role karyawan, bisa `null`. `?division=`*nama* menyaring `employees` dengan nama persis; tanpa parameter semua tampil, termasuk yang `division: null` (layar mengelompokkannya sebagai "Tanpa divisi"). Skema belum punya departemen per karyawan, jadi kolom "departemen" mockup tidak diisi.
- Departemen: lihat §8.
- `kpi` dihitung dari seluruh scope, tidak terpengaruh filter `division`. `kpi.awaitingDecision` = karyawan `eligible` yang siklus terbarunya belum punya keputusan HR (termasuk yang belum disentuh atasan), sama dengan mockup.
- `programs` selalu tiga elemen berurutan basic, intermediate, advanced; `[]` bila status `no_path`.
- `decisionState` ∈ `none | supervisor_recommend | supervisor_hold | approved | hold` dari siklus terbaru yang cocok (C9).
- `evidence.okr` `null` bila tidak ada data; `supervisorRecommendation` = keputusan atasan pada siklus terbaru. `[⚠️ BELUM TERVERIFIKASI]` Di mockup "Review atasan" adalah butir bukti tersendiri (Tersedia/Belum) tanpa sumber data; di sini diisi dari rekomendasi atasan sampai ada sumber lain.
- `paths` tanpa `jobRoleId` memakai job role pertama (urut nama) yang punya jenjang; bila tidak ada → `{ jobRole: null, okrMin, levels: [] }`. `jobRoleId` bukan milik tenant atau bukan UUID → 400. `moduleCount` = jumlah kompetensi jabatan (`kind = 'job'`) job role itu dengan `program_tier` = syarat jenjang (0 bila jenjang tanpa syarat). `[⚠️ BELUM TERVERIFIKASI]` Mockup menghitung modul dari Library; diasumsikan sama dengan kompetensi ber-tingkat B4. `employees` dan `readyForNext` (= `eligible`) dihitung dalam scope pemanggil.
- `actions` dan `blockedReason` (`blockedReason` null bila `actions` tidak kosong), dievaluasi dari atas (`decisionView` di `career.js`):

  | Pemanggil | Keadaan | `actions` | `blockedReason` |
  | --- | --- | --- | --- |
  | `eta_admin` | apa pun | `[]` | `view_only` |
  | siapa pun | siklus `approved` | `[]` | `approved` |
  | atasan langsung (peran `supervisor` di basis data) | `eligible` | `['recommend','hold']` | null |
  | atasan langsung | tidak `eligible`, ada siklus terbuka | `['hold']` (tarik rekomendasi) | null |
  | atasan langsung | tidak `eligible`, tanpa siklus terbuka | `[]` | `not_eligible` |
  | `hr_admin` | siklus terbuka dicatat oleh dirinya | `[]` | `self_recommended` |
  | `hr_admin` | siklus terbuka, atasan `recommend`, `eligible` | `['approve','hold']` | null |
  | `hr_admin` | siklus terbuka lainnya | `['hold']` | null |
  | `hr_admin` | tanpa siklus terbuka, tidak `eligible` | `[]` | `not_eligible` |
  | `hr_admin` | tanpa siklus terbuka, tanpa atasan sah | `[]` | `no_supervisor` |
  | `hr_admin` | tanpa siklus terbuka, siklus terakhir `hold` | `[]` | `held` |
  | `hr_admin` | belum ada siklus | `[]` | `waiting_supervisor` |
  | lainnya | — | `[]` | `view_only` |

- Urutan: karyawan menurut nama. Tanpa paginasi (POC satu tenant ±50–200 karyawan).
- Galat: 400 `BAD_REQUEST` (`decision` tidak dikenal, `note` bukan teks atau > 2000 karakter); 403 `FEATURE_DISABLED` (flag mati atau kill switch); 403 `ROLE_FORBIDDEN`; 404 `NOT_FOUND`; 409 dengan kode `NOT_ELIGIBLE`, `WAITING_SUPERVISOR`, `SUPERVISOR_NOT_RECOMMEND`, `ALREADY_DECIDED`. Semua pesan berbahasa Indonesia.

## 7. Keputusan default yang dipakai

- K2: peran teknis yang ada (`hr_admin`, `supervisor`); Super Admin (`eta_admin`) melihat tetapi tidak memutuskan.
- "Ya revisi" 19 Nov: promosi masuk 2 Des. RG-3, R2-2, R2-3 (enkripsi catatan).
- **Gerbang rute `cp`: `submodule: 'dna'`, bukan `meta.entitlement: 'full_suite'`.** Usulan koordinator (aturan B0) ditolak dengan alasan (review egm S7, CONTEST): API `/api/dna/career/*` dipasang di bawah `requireSubmodule('dna')` dan tidak memeriksa produk `full_suite`. B0 §5.3 memakai `meta.entitlement` hanya bila API memeriksa produk itu; gerbang layar harus setara dengan gerbang API supaya menu tidak membuka layar yang API-nya menolak (atau sebaliknya). Bila bisnis memutuskan Career & Promotion dijual sebagai bagian Full Suite, API dan rute diubah bersama. Dicatat juga di baris `cp` B0 §5.2.

## 8. Asumsi dan risiko

Satu-satunya daftar status terbuka spek ini.

| Status | Butir | Mitigasi / pemicu |
| --- | --- | --- |
| `[⚠️ BELUM TERVERIFIKASI]` | C2 rumus OKR, periode, format periode campuran, OKR basi | Format OKR Mas Abdan 26 Nov; rumus ada di satu fungsi murni (`okrAchievement`) dengan test unit |
| `[⚠️ BELUM TERVERIFIKASI]` | C10 karyawan tanpa atasan sah | HR membetulkan `supervisor_id` lewat impor karyawan; layar menampilkan `no_supervisor` |
| `[⚠️ BELUM TERVERIFIKASI]` | Default `promotionVisibleTo` kini memuat atasan (mockup final; RG-1e sebelumnya hanya HR) | Endpoint lama tetap khusus HR (C14); tenant bisa mengisi `['hr_admin']` |
| ESKALASI (S6) | `promotionVisibleTo` sebagai gerbang kedua bisa mengunci alur (C11) | Keputusan user RG-1e; ditanyakan di PR untuk Andrian dan Pak Eji |
| `[⚠️ BELUM TERVERIFIKASI]` | Sumber "Review atasan" dan `moduleCount` (§6) | Diisi dari rekomendasi atasan dan kompetensi bertingkat B4 sampai ada sumber lain |
| `[⏳ DITERIMA]` | Departemen tidak tersedia | Kolom departemen di impor karyawan (B11) |
| `[⏳ DITERIMA]` | Riwayat siklus tanpa endpoint | Tersimpan di tabel dan audit |
| `[⏳ DITERIMA]` | Siklus usang hidup lagi bila karyawan kembali ke jenjang semula; indeks `approved` memblok promosi ulang ke jenjang yang sama; upsert atasan menimpa catatan sebelumnya (review egm S15) | Kasus langka pada POC; HR bisa menunda. Redesain epoch/event ditolak (YAGNI) |
| `[⏳ DITERIMA]` | Snapshot bukti, `drifted`, reviewer pengganti, optimasi `load()` (S16) | YAGNI untuk POC ±200 karyawan |
| `[⏳ DITERIMA]` | `/paths` agregat tidak diaudit; penghapusan karyawan tidak menghapus `meta` audit | Agregat tanpa data individu; mengikuti kebijakan retensi audit yang ada |
| `[⏳ DITERIMA]` | Tidak dites: atomisitas audit, cabang `SUPERVISOR_NOT_RECOMMEND` saat atasan berubah di tengah permintaan HR, kill switch, beban (dua persetujuan HR paralel dan siklus usang di store sudah dites) | Butuh injeksi kegagalan di store, di luar pola test repo |
| `[⏳ DITERIMA]` | Menu `cp` tanpa tampilan Super Admin | B12 memegang tampilan Super Admin; tautan langsung tetap terbuka |

## 9. Alternatif yang dipertimbangkan

| Keputusan | Dipilih | Ditolak | Alasan |
| --- | --- | --- | --- |
| Penyimpanan keputusan | satu baris per siklus yang diperbarui + baris audit | tabel event (append-only) | audit sudah mencatat setiap keputusan; layar hanya butuh keadaan terakhir |
| Kelayakan | dihitung saat dibaca | disimpan/di-cache | bukti (completion, OKR) berubah lewat impor; tidak ada sinkronisasi |
| Endpoint | router baru `/dna/career/*` | memperluas `/promotion-candidates` | definisi kandidat lama (program saja) dipakai halaman POC; mencampurnya membuat dua arti |
| Alur | dua tahap (atasan lalu HR) | HR saja | mockup menampilkan status atasan dan HR terpisah; pemisahan tugas |
| Identitas siklus | (karyawan, jenjang tujuan) + cocok `from_level_id` saat dibaca | epoch posisi | posisi berubah lewat dua jalur (PUT posisi, impor karyawan); membaca yang cocok tidak menulis di dua tempat |

## 10. Test

- `apps/api/tests/unit/dna-career.test.js`: OKR (arah, biner/tenggat, batas, baris dilewati, jenis metrik, periode, deduplikasi impor ulang termasuk waktu sama), delapan status C4, ambang konfigurasi, kandidat C5, `findCycle`, `decisionState`, tindakan atasan dan HR, pemisahan tugas (`self_recommended`), tanpa atasan sah dan Super Admin, setelan rusak (`dna: null`), atasan yang perannya dicabut.
- `apps/api/tests/unit/dna-domain.test.js`: `careerStatus` lama tetap lulus.
- `apps/api/tests/integration/dna-career.test.js` (Postgres): flag mati → 403; `promotionVisibleTo` tanpa `supervisor` → atasan 403; peta + KPI + filter divisi; atasan tidak melihat dirinya; bukti; jalur; rekomendasi → persetujuan dengan audit; klik ganda; `hold` vs `approve`; `WAITING_SUPERVISOR`; `NOT_ELIGIBLE`; atasan lain 404; karyawan 403; peran salah 403; tenant lain dan nonaktif 404; jenjang tidak berubah setelah `approve`; `ALREADY_DECIDED`; siklus baru setelah `hold`; perubahan posisi (termasuk store menolak siklus usang); `next_no_requirement`; `no_supervisor`; catatan terenkripsi; endpoint lama khusus HR; setelan `promotionVisibleTo` rusak tidak 500.
- `apps/api/tests/integration/alur-promosi.test.js` (B18 3.3, lewat `tests/alur/driver.js`): impor kelulusan program dan OKR, memenuhi syarat, penolakan per peran, rekomendasi atasan lalu persetujuan HR dengan nama, waktu, dan audit, jenjang tidak berubah, tenant tanpa flag 403.
- `apps/api/tests/integration/poc-dna-tna.test.js`: atasan 403 di `/promotion-candidates` (C14, tidak berubah dari base).
- `apps/web/e2e/b16-cp.spec.ts`: HR (peta per divisi, bukti, jalur, keputusan menunggu atasan); atasan merekomendasi dengan catatan; HR menyetujui rekomendasi atasan; HR yang mencatat rekomendasi sendiri tanpa tombol; menu dan rute tertutup bila flag mati.
- Tidak dites: lihat §8.

## 11. Layar (di atas B0)

- Rute `cp` (`/cp`, `meta.views` hr/atasan/super, `meta.roles` `hr_admin`/`supervisor`/`eta_admin`, flag `promotion.recommendation`, submodul `dna`). `meta.roles` menutup layar untuk peran tampilan `atasan` lain (pimpinan, `role_leader`) yang API-nya menolak.
- Tiga tab mockup: Karyawan per divisi (KPI, filter divisi termasuk "Tanpa divisi", tabel, kartu bukti), Jalur jenjang (kartu per jenjang dengan kalimat aturan, "Cara kerja kenaikan jabatan" mengikuti teks mockup), Keputusan promosi (tabel, catatan opsional, tombol dari `actions`, alasan dari `blockedReason`, termasuk "Anda yang merekomendasi" untuk `self_recommended`).
- Persen OKR dibulatkan biasa untuk tampilan; bila pembulatan menyeberangi ambang dipakai pembulatan ke bawah (79,5 tampil 79%).
- Teks cakupan atasan memakai "bawahan langsung" (§2).

## 12. Perubahan file

(B) baru, (U) ubah.

- (B) `apps/api/migrations/20261119001600-promotion-decisions.js`
- (U) `apps/api/src/modules/dna/career.js` (OKR, status, tindakan, `promotionSettings`; `careerStatus` tetap)
- (B) `apps/api/src/modules/dna/career-routes.js`
- (U) `apps/api/src/modules/dna/index.js` (pasang router, endpoint lama khusus HR, sembunyikan kandidat diri sendiri)
- (U) `apps/api/src/core/settings/index.js`
- (U) `apps/api/src/db/lna-stores.js` (store `promotion`, OKR per karyawan, divisi dan status di `people`)
- (B) `apps/api/tests/unit/dna-career.test.js`, `apps/api/tests/integration/dna-career.test.js`, `apps/api/tests/integration/alur-promosi.test.js`, langkah B16 di `apps/api/tests/alur/driver.js`
- (B) `apps/web/src/screens/b16-cp/routes.ts`, `api.ts`, `CareerPromotionView.vue`
- (B) `apps/web/e2e/b16-cp.spec.ts`
- (U) `docs/ewi/poc-dna-tna.md`, `docs/designs/b0-fondasi-ui.md` (catatan rute `cp`)

## Lampiran A. Riwayat review

Status terbuka hanya di §8; lampiran ini catatan sejarah.

**Review spek ikan mas (19 Nov, sebelum plugin egm terpasang).** 20 temuan; diperbaiki: aksi audit `update` + `meta.event`, balapan atasan vs HR, audit atomik, atasan bukan `supervisor`, OKR ganda dan periode mundur, catatan dikembalikan, `eta_admin` POST ditolak, atasan melihat dirinya, `promotionVisibleTo` untuk endpoint baru, siklus usang, larangan setelah `approved`, kode 409, populasi, `next_no_requirement`, pembulatan, bentuk respons. Ditolak: FK `RESTRICT`/potret nama jenjang (hak hapus PK-15), penutupan otomatis siklus saat posisi berubah (dua jalur tulis).

**Review diff ikan mas (19 Nov).** 11 temuan, dikerjakan test-first: peran atasan dari basis data, kunci `FOR UPDATE` dan cek `approved` lebih dulu, setelan rusak ke default, deduplikasi deterministik, tarik rekomendasi, Super Admin tanpa catatan, pemisahan tugas 403, test tambahan. Keputusan C9 vs C10 dan sisa yang ditunda pindah ke C7 dan §8.

**Review egm (19 Nov, plugin `egm`, tahap 5–9).** Laporan: `docs/designs/egm-review/b16/` dan triase egm-resolve di `goldfish_review_report.md`. Diterapkan: alternatif (S1); `self_recommended` menggantikan `waiting_hr` yang tidak pernah dikembalikan, plus tabel tindakan (S2); keputusan review diff dilipat ke C7/C10 (S3); `canSeePromotion` lewat `promotionSettings()` (S4); endpoint lama khusus HR (S5); `meta.roles` rute `cp` (S8); C2 sebagai daftar kasus (S9); bukan sasaran, register risiko, alur komponen (S10); sumber acuan dan glosarium kode (S11); placeholder dalam backtick (S12); `poc-dna-tna.md` (S13); §10 test (S14). Eskalasi: `promotionVisibleTo` (S6). Bantahan: `meta.entitlement` (S7, §7). Ditolak dengan catatan di §8: S15, S16.

**Review diff (19 Nov, agen egm + `mattpocock-skills:code-review`).** Triase di `docs/designs/egm-review/diff-review-triage.md`: setelan `dna: null`, siklus usang dalam balapan, tombol atasan dari peran basis data.

**Cek drift.** 19 Nov manual (sebelum plugin terpasang); setelah review egm dijalankan ulang dengan skill `egm-drift-report`, laporan di `docs/designs/egm-review/`.
