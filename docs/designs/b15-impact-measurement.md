# B15 · Learning Impact Measurement (modul `lim`)

Status: spek tahap 1, review spek 1 dan 2 selesai dan ditriase (`egm-resolve`, bagian 11); tiga keputusan bisnis diajukan ke user, sementara dibangun dengan opsi rekomendasi · 19 Nov 2026 · paket B15 dari `brief-bangun-penuh-19nov.md` (thread T7).
Acuan layar: mockup Pak Eji (final 19 Nov), layar `lim` dengan tab Ringkasan, Per kompetensi, Dampak bisnis, Pengukuran AI.
Bergantung pada B14 (`ld_trainings`, `ld_participants`, PR #23), B13 (`li_modules`, `li_module_competencies`), dan DNA (`lna_competencies`, `lna_job_roles`).

## 1. Tujuan

HR/L&D dan atasan melihat dampak belajar sebagai satu rantai bukti: dari aktivitas belajar sampai hasil bisnis tim.
Mockup mengacu pada panduan Scheer IMC: mulai dari masalah bisnis, pilih metrik sesuai tujuan, jangan berhenti di data
kehadiran, dan jangan mengklaim sebab-akibat. ELGOS menampilkan garis bukti, tempat rantai putus, dan faktor lain yang
perlu dicek.

Bukan tujuan: ROI finansial wajib (mockup: "nilai finansial tidak dipaksakan"), klaim bahwa pelatihan menyebabkan
perubahan metrik, penilaian kinerja individu untuk HR selain sebagai bukti tingkat 4.

## 2. Pentahapan

| Tahap | Isi | Syarat mulai |
| --- | --- | --- |
| 1 (PR ini) | Migrasi, store, API rencana pengukuran (5 pertanyaan), indikator bisnis tim, faktor lain, skor pre dan kinerja per karyawan per kompetensi (isian dan impor), skor post dari Learning Delivery, rantai bukti 6 tingkat, ringkasan per kompetensi, antrean wawancara ulang (status dan jadwal), insight berbasis aturan, flag | PR B14 terbuka (sudah) |
| 2 | Layar empat tab dan e2e | PR B0 digabung ke basis; dikerjakan di PR yang sama bila waktu cukup |
| 3 | Wawancara ulang AI (percakapan konfirmasi hasil belajar, skor wawancara ulang, ringkasan rantai bukti per karyawan, rekomendasi AI) | PR B6 (mesin wawancara) terbuka |

Tahap 1 tidak menyentuh `src/modules/interviews`. Skor wawancara ulang di tahap 1 hanya bisa diisi lewat store
(`recordReinterview`), sambungan untuk mesin wawancara tahap 3. Jangan menjanjikan wawancara ulang ke klien sebelum
tahap 3.

## 3. Layar mockup dan data tahap 1

| Tab mockup | Elemen | Endpoint |
| --- | --- | --- |
| Ringkasan | "Mulai dari masalah bisnis · <jabatan>" (5 pertanyaan), rantai dampak 6 tingkat (tingkat, sumber data, temuan, cakupan), insight tempat rantai putus, dua jebakan, prinsip pelaporan | `GET /api/lim/plans/:id/overview` |
| Per kompetensi | Tabel kompetensi: pre, post, wawancara ulang, kinerja, kesimpulan. HR: tombol "Isi pre dari asesmen DNA" dan panel impor `lim_measurements` (rencana yang dibuka terpilih otomatis) | sama (`competencies`), `POST /plans/:id/pre-from-dna`, `/imports/*` |
| Dampak bisnis | Tabel indikator tim (sebelum, sesudah, target, kekuatan bukti, sumber), estimasi nilai (opsional), faktor lain | sama (`indicators`, `valueEstimate`, `factors`) |
| Pengukuran AI | Antrean wawancara ulang (karyawan, kompetensi, status, jadwal, tindakan) | `GET /api/lim/plans/:id/queue`, `POST /api/lim/plans/:id/queue/schedule` |
| Pengukuran AI: percakapan, benchmark, hasil bisnis, ringkasan | tahap 3 | belum ada |
| Di atas tab (HR) | Pilihan rencana bila lebih dari satu, tombol "Rencana baru", formulir rencana (judul, jabatan, periode, modul, lima pertanyaan); tanpa rencana formulir langsung tampil. Atasan tanpa rencana melihat catatan | `GET /plans`, `GET /options`, `POST /plans` |

Teks statis mockup (dua jebakan, prinsip pelaporan, catatan "Hubungan belajar dan hasil bukan bukti sebab-akibat")
ditulis di layar, bukan di API.

## 4. Data dan migrasi

Blok migrasi 15: `20261119001500-learning-impact.js` (raw SQL, punya `down`). Semua tabel punya `tenant_id`
dengan `ON DELETE CASCADE` dari `tenants`.

| Tabel | Kolom penting |
| --- | --- |
| `lim_plans` | rencana pengukuran: `title`, `job_role_id` → `lna_job_roles` ON DELETE SET NULL (nullable, "Mulai dari masalah bisnis · <jabatan>"), `period_from`, `period_until` (date nullable, kohort; bagian 4.1), `business_problem`, `desired_behavior`, `priority_capabilities`, `evidence_plan`, `existing_metrics` (teks 5 pertanyaan, maks 2000), `baseline_label`, `after_label` (mis. "Sep 2026", "Nov 2026"), `value_estimate` (jsonb nullable `{ label, value, note }`), `factors` (jsonb, larik teks maks 20), `status` (`active`/`archived`), `created_by`, `updated_by` (→ `users` ON DELETE SET NULL) |
| `lim_plan_modules` | `plan_id` (ON DELETE CASCADE), `module_id` → `li_modules` ON DELETE CASCADE (PK `plan_id, module_id`) : modul belajar yang diukur |
| `lim_indicators` | `plan_id` (ON DELETE CASCADE), `name` (maks 255), `level` (`performance`/`business`), `source` (maks 255), `unit` (maks 16, mis. "mnt", "%"), `direction` (`lower_better`/`higher_better`), `baseline`, `current`, `target` (numeric nullable), `strength` (`strong`/`moderate`/`weak`/null = dihitung), `position` |
| `lim_measurements` | per karyawan per kompetensi per rencana: `plan_id` (CASCADE), `user_id` → `users` (CASCADE), `competency_id` → `lna_competencies` (CASCADE), `pre_score`, `pre_source` (`manual`/`import`/`dna`), `post_score`, `post_source` (`manual`/`import`, penimpa skor LD), `performance_score`, `performance_source` (`manual`/`import`), `performance_note` (maks 500), `reinterview_status` (`none`/`scheduled`/`done`), `reinterview_on` (date), `reinterview_score`, `reinterview_session_id` (uuid, tanpa FK di tahap 1), `updated_by` (→ `users` SET NULL), `updated_at`. UNIQUE (`plan_id`, `user_id`, `competency_id`) |

Skor 0–100, CHECK di DB, sama dengan `ld_participants.score`.

**Skor post bawaan dibaca dari Learning Delivery**, dari `ld_participants` milik pelatihan yang `module_id`-nya
termasuk modul rencana dan modulnya terhubung ke kompetensi itu (`li_module_competencies`). Hanya peserta dengan
`score` terisi dan pelatihan yang tidak `cancelled` yang dihitung. Tanggal selesai efektif = `COALESCE(completed_at::date, ends_on, starts_on)` (pelatihan
offline dan isian vendor sering tanpa `completed_at`; untuk EliteMentor `ends_on` adalah tenggat, diterima sebagai perkiraan). Tanggal ini bisa NULL
(course LMS tanpa tanggal dan tanpa `completed_at`): skornya tetap dihitung, tetapi tidak masuk jadwal antrean (6.4). Bila karyawan punya lebih dari satu skor untuk kompetensi yang
sama, dipakai skor dengan tanggal selesai efektif terbaru (NULL dianggap paling lama; seri: `ld_participants.created_at` lalu `id` terbesar). Skor dengan
`score_source = vendor_manual` ditandai `postAuditable: false` (spek B14 bagian 9: "tidak bisa diaudit per jawaban").

**Skor post per kompetensi.** `ld_participants.score` adalah satu skor per pelatihan. Bila modulnya terhubung ke lebih
dari satu kompetensi, skor yang sama dipakai untuk semua kompetensi itu dan ditandai `postShared: true`, sehingga
layar menulis "skor modul, bukan per kompetensi". HR bisa mengisi skor post per kompetensi lewat isian atau impor
(`lim_measurements.post_score`, `post_source` `manual`/`import`); bila terisi, nilai itu yang dipakai dan
`postShared: false`. Tanggal untuk antrean tetap dari Learning Delivery.

**Skor pre** diisi HR, diimpor, atau diambil dari asesmen DNA. Asesmen DNA berskala 0–4 (`lna_assessments.score`,
CHECK di lna-core.js), jadi bila dipakai dikonversi ×25 dan ditandai `pre_source = dna`; layar memberi label "dari DNA
(level × 25)" karena level tidak setara skor tes. Pengambilan dari DNA hanya lewat tombol "Isi pre dari asesmen DNA"
(`POST /plans/:id/pre-from-dna`): per pasangan (peserta, kompetensi rencana) yang `pre_score`-nya masih kosong, diambil
asesmen kompetensi itu dengan tanggal `COALESCE(assessed_at, created_at)` terakhir sebelum tanggal mulai efektif
(`COALESCE(starts_on, created_at::date)`) pelatihan rencana pertama karyawan itu; semua sumber asesmen dihitung.
Pre yang sudah terisi (isian, impor, atau DNA sebelumnya) tidak pernah ditimpa. Karyawan tanpa pelatihan rencana dilewati.

### 4.1 Peserta dan kompetensi rencana

**Peserta rencana** = karyawan aktif yang menjadi peserta (`ld_participants`) pelatihan rencana, ditambah karyawan
yang sudah punya baris `lim_measurements`. **Pelatihan rencana** = `ld_trainings` tenant ini dengan `module_id` termasuk
modul rencana, status bukan `cancelled`, dan (bila `period_from`/`period_until` diisi) tanggal mulai efektif
`COALESCE(starts_on, created_at::date)` di dalam rentang itu. Bila rencana punya `job_role_id`, hanya peserta dengan
`users.job_role_id` yang sama yang dihitung. (Keputusan user 19 Nov 21.10 WIB, kartu "Siapa yang dihitung
sebagai peserta": periode + jabatan rencana.) Kompetensi rencana = gabungan `li_module_competencies` modul rencana.

## 5. Endpoint dan flag

Modul dipasang lewat `requireSubmodule('lim')`: kunci `lim` ditambah ke `FULL_SUITE_ONLY` di `core/entitlement`
(sama dengan `li` dan `ld` dari B13/B14) dan flag baru `module.lim` (`FLAGS.MODULE_LIM`, default mati). Modul
didaftarkan di daftar modul `app.js`. Tidak ada flag tambahan di tahap 1; wawancara ulang AI tahap 3 memakai flag
baru `lim.reinterview`.

| Metode dan path | Peran | Isi |
| --- | --- | --- |
| `GET /` | HR, atasan | info modul `{ module, title, tenantId, role }` (sama dengan modul lain) |
| `GET /options` | HR | pilihan formulir rencana `{ modules: [{ id, code, name }], jobRoles: [{ id, name }] }` (tanpa bergantung pada modul `li`/`dna` menyala) |
| `GET /plans` | HR, atasan | daftar rencana aktif `{ id, title, jobRoleName, moduleCount, participantCount }`; `?archived=1` ikut arsip (HR). Atasan hanya menerima rencana yang memuat ≥1 anggota timnya, dan `participantCount` dihitung atas timnya |
| `POST /plans` | HR | buat `{ title, jobRoleId?, periodFrom?, periodUntil?, businessProblem, desiredBehavior, priorityCapabilities, evidencePlan, existingMetrics, baselineLabel?, afterLabel?, moduleIds[] }`; `moduleIds` 1–20, modul tenant lain atau tidak ada → 400 `MODULE_NOT_FOUND`; `jobRoleId` tenant lain → 400 |
| `PATCH /plans/:id` | HR | ubah field di atas, `valueEstimate`, `factors`, `status`; field yang tidak dikirim tetap |
| `GET /plans/:id/overview` | HR, atasan | `{ plan, participants, chain, insight, competencies, indicators, valueEstimate, factors, generatedBy: 'rules' }`; atasan dihitung atas timnya saja, dan 404 bila rencana tidak memuat anggota timnya (sama dengan `GET /plans`) |
| `POST /plans/:id/indicators` | HR | tambah indikator |
| `PATCH /indicators/:id`, `DELETE /indicators/:id` | HR | ubah, hapus |
| `GET /plans/:id/measurements` | HR | baris per karyawan per kompetensi (nama, kompetensi, pre, post, sumber post, wawancara ulang, kinerja); dicatat `audit.readIndividual` |
| `PUT /plans/:id/measurements` | HR, atasan | `{ entries: [{ userId, competencyId, preScore?, postScore?, performanceScore?, performanceNote? }] }`, maks 500; `null` mengosongkan, tidak dikirim = tetap. `userId` harus peserta rencana dan `competencyId` kompetensi rencana, selain itu baris `rejected` ("Karyawan bukan peserta rencana ini", "Kompetensi bukan bagian rencana ini", "Skor harus bilangan bulat 0–100"). Atasan hanya untuk bawahan langsungnya ("Karyawan bukan anggota tim Anda", diperiksa sebelum cek peserta supaya atasan tidak bisa menebak peserta di luar timnya) dan hanya `performanceScore`/`performanceNote` (field lain → `rejected` "Atasan hanya mengisi skor kinerja") (keputusan user 23 Nov, kartu tingkat 4: "Atasan untuk timnya, HR untuk semua") |
| `POST /plans/:id/pre-from-dna` | HR | isi pre kosong dari asesmen DNA; `{ filled }` |
| `GET /plans/:id/queue` | HR | antrean wawancara ulang (aturan 6.4); dicatat `audit.readIndividual` |
| `POST /plans/:id/queue/schedule` | HR | `{ userIds: [...], date }`, maks 200; `date` `YYYY-MM-DD` dari hari ini sampai +180 hari, atau `null` untuk membatalkan jadwal |
| `/imports/*` | HR | `importRouter({ submodule: 'lim' })`, jenis impor baru `lim_measurements` |

### 5.1 Bentuk respons

Semua respons dibungkus `{ data }`. Skor bilangan bulat 0–100 atau `null`.

```text
GET /plans/:id/overview -> {
  plan: { id, title, jobRoleId, jobRoleName, businessProblem, desiredBehavior, priorityCapabilities,
          evidencePlan, existingMetrics, baselineLabel, afterLabel, status, modules: [{ id, title }] },
  participants: n,                       # peserta terlihat
  chain: [{ level: 1..6, key, label, source, finding, coverage: 'measured'|'partial'|'missing' }],
  insight: { level: 1..6 | null, text },
  competencies: [{ competencyId, name,
                   pre, preN, post, postN, postUnauditable, postShared,
                   reinterview, reinterviewN, performance, performanceN,
                   verdict: 'belum_diukur'|'retensi_turun'|'terkonfirmasi' }],
  indicators: [{ id, name, level, source, unit, direction, baseline, current, target,
                 improved, targetMet, strength: 'strong'|'moderate'|'weak'|'no_data', strengthSource: 'hr'|'rules', position }],
  valueEstimate: { label, value, note } | null,
  factors: [string],
  generatedBy: 'rules'
}
GET /plans/:id/measurements -> [{ userId, name, jobRoleName, competencyId, competencyName,
  preScore, preSource, postScore, postSource: 'ld'|'manual'|'import'|null, postAuditable, postShared,
  postCompletedOn, reinterviewStatus, reinterviewOn, reinterviewScore, performanceScore, performanceNote }]
GET /plans/:id/queue -> [{ userId, name, competencies: [{ competencyId, name }], postCompletedOn, dueFrom, dueUntil,
  status: 'none'|'scheduled'|'done', window: 'early'|'due'|'late'|null, scheduledOn, score }]
POST /plans/:id/queue/schedule -> { scheduled: [userId], skipped: [{ userId, reason }], rejected: [{ userId, message }] }
PUT /plans/:id/measurements -> { saved: n, rejected: [{ index, message }] }
```

`tenant_id` selalu dari `req.tenantId`. Objek tenant lain dan id bukan UUID dijawab 404. Perubahan dicatat
`audit.record` (resource `lim.plan`, `lim.indicator`, `lim.measurement`). Peran lain (karyawan, role_leader, sme) 403.
Rute layar `lim` memakai `meta.entitlement: 'full_suite'` (kontrak B0) agar menu tersembunyi bila tenant tidak punya paket.

## 6. Aturan bisnis

### 6.1 Ringkasan per kompetensi (tab Per kompetensi)

Per kompetensi rencana, atas peserta yang terlihat oleh pemanggil:

- `pre`, `post`, `reinterview`, `performance` = rata-rata atas karyawan yang punya nilainya (dibulatkan bilangan bulat
  seperti mockup), ditambah `n` masing-masing.
- `postUnauditable` = jumlah skor post dari `vendor_manual`.
- Kesimpulan mengikuti fungsi `verd` mockup: tanpa skor wawancara ulang → `belum_diukur` ("Belum diukur"); rata-rata
  wawancara ulang < 70 → `retensi_turun` ("Retensi turun, perlu penguatan"); selain itu `terkonfirmasi`
  ("Terkonfirmasi"). [⚠️ BELUM TERVERIFIKASI: ambang 70 dari mockup, sama dengan skor lulus 5C; belum ada keputusan
  bisnis.] Konstanta `RETENTION_MIN = 70` di `domain.js`.
- Diurutkan menurut nama kompetensi.

### 6.2 Rantai bukti 6 tingkat (tab Ringkasan)

Fungsi murni `buildChain(input)` menghasilkan enam baris `{ level, label, source, finding, coverage }` dengan
`coverage` = `measured` ("Terukur"), `partial` ("Sebagian"), atau `missing` ("Belum ada data"):

| # | Tingkat | Sumber | Temuan | Cakupan |
| --- | --- | --- | --- | --- |
| 1 | Aktivitas | Learning Delivery | per keikutsertaan (baris `ld_participants` pelatihan rencana): persen `status = completed`; bila ada pelatihan offline, ditambah "hadir x dari y tercatat" (`attendance = true` dari `attendance IS NOT NULL`) | `measured` bila ada peserta, selain itu `missing` |
| 2 | Pembelajaran | Asesmen pre dan post | rata-rata kenaikan post − pre atas pasangan lengkap, jumlah kompetensi | dihitung per pasangan (karyawan, kompetensi): `measured` bila semua pasangan yang punya post juga punya pre; `partial` bila sebagian; `missing` bila tidak ada pasangan |
| 3 | Kapabilitas | Wawancara ulang AI | "x dari n karyawan sudah diwawancara ulang"; x = karyawan dengan ≥1 skor wawancara ulang untuk kompetensi rencana mana pun | `measured` bila x = n > 0; `partial` bila 0 < x < n; `missing` bila x = 0 |
| 4 | Penerapan | Review atasan / isian kinerja | "x dari n karyawan punya skor kinerja"; x seperti tingkat 3 | sama seperti tingkat 3 |
| 5 | Kinerja | indikator `level = performance` | indikator pertama yang lengkap: "nama baseline → current unit" | `measured` bila semua indikator tingkat ini punya baseline dan current; `partial` bila sebagian; `missing` bila tidak ada atau kosong |
| 6 | Hasil bisnis | indikator `level = business` | sama, ditambah nama indikator yang belum ada datanya | sama |

`n` = peserta rencana yang terlihat. Insight (`buildInsight`): tingkat terendah dengan cakupan bukan `measured`, dengan
kalimat tetap per tingkat, mis. "Rantai paling lemah ada di tingkat 3. Baru 1 dari 6 karyawan yang dikonfirmasi lewat
wawancara ulang. Tanpa bukti di tengah, klaim bahwa pelatihan memperbaiki kinerja masih lemah." Bila semua `measured`:
"Semua tingkat punya bukti. Tetap cek faktor lain sebelum menyimpulkan." Respons memuat `generatedBy: 'rules'`.
`[⏳ DITERIMA]` Mockup menamai ini "Insight AI". Sama dengan keputusan B14: UI menulis "Insight" dengan keterangan
"dari data pengukuran" sampai ada narasi LLM.

### 6.3 Indikator bisnis tim (tab Dampak bisnis)

- Indikator adalah angka tingkat tim, diisi HR. Tidak ada data per orang.
- `improved` = `current` lebih baik dari `baseline` menurut `direction`; `targetMet` = `current` memenuhi `target`
  menurut `direction`. Null bila nilainya kurang.
- Kekuatan bukti: bila HR mengisi `strength`, itu yang dipakai. Bila tidak: tanpa baseline atau current →
  `no_data` ("Belum ada data"); membaik dan memenuhi target → `moderate` ("Indikasi sedang"); membaik tanpa memenuhi
  target → `weak` ("Indikasi lemah"); tidak membaik → `weak`. Dihitung tidak pernah memberi `strong`: "Indikasi kuat"
  hanya bila HR menilainya, karena kekuatan bukti bergantung pada faktor lain yang tidak diketahui ELGOS.
  [⚠️ BELUM TERVERIFIKASI: mockup memberi "Indikasi kuat" ke MTTR dan "sedang" ke indikator lain yang juga memenuhi
  target, jadi labelnya penilaian manusia; aturan hitung ini rekaan.]
- Maksimal 20 indikator per rencana. `unit` hanya label tampilan. `position` diatur lewat `PATCH /indicators/:id`; indikator baru di akhir.
- `valueEstimate` opsional `{ label, value, note }` (mis. "Waktu teknisi dihemat", "±14 jam / bulan"), teks bebas,
  ditampilkan sebagai "Estimasi nilai (ilustratif)".
- `factors`: larik teks, maks 20 butir × 300 karakter.

### 6.4 Antrean wawancara ulang (tab Pengukuran AI)

- Antrean satu baris per karyawan: satu wawancara ulang mencakup semua kompetensi rencana yang punya skor post dari
  Learning Delivery untuk karyawan itu. (Keputusan user 19 Nov 21.10 WIB: satu wawancara ulang
  per karyawan.) Tanggal selesai = tanggal selesai efektif terbaru di antara kompetensinya yang tanggalnya diketahui
  (NULL dianggap paling lama, bagian 4); NULL hanya bila semua kompetensinya tanpa tanggal.
- `dueFrom` = tanggal selesai + 28 hari, `dueUntil` = + 42 hari (mockup: "4 sampai 6 pekan setelah belajar"). Bila
  tanggal selesai NULL: `dueFrom`, `dueUntil`, `window` = null, dan karyawan itu tidak bisa dijadwalkan.
- Penjadwalan satu karyawan ditulis dalam satu transaksi (semua kompetensinya atau tidak sama sekali).
- Status karyawan: `done` bila semua kompetensinya `done` (skor = rata-rata), `scheduled` bila ada yang `scheduled`,
  selain itu `none`. Tambahan turunan `window`: `early` (hari ini < `dueFrom`), `due`, `late` (hari ini > `dueUntil` dan belum
  `done`). Hari ini menurut Asia/Jakarta.
- Jadwalkan: HR memilih karyawan dan tanggal; tanggal disimpan ke semua pasangan karyawan itu yang belum `done`
  (baris `lim_measurements` dibuat bila belum ada). Jadwal ulang menimpa tanggal. `date: null` membatalkan: pasangan
  `scheduled` kembali `none`. Karyawan yang semua kompetensinya `done` dilewati (`skipped`, reason `done`); karyawan
  yang bukan calon antrean atau tanpa tanggal selesai ditolak (`rejected`). `done` hanya bisa dicapai lewat store
  (`recordReinterview`, tahap 3).
- Tahap 1 tidak mengirim undangan dan tidak menjalankan wawancara. Mockup: "Dalam produk, karyawan mengerjakannya
  sendiri lewat EliteMentor"; mekanismenya diputuskan di tahap 3.
- Urutan: `late`, lalu `due`, lalu `early`; dalam kelompok menurut `dueFrom`.

### 6.5 Visibilitas

- HR (`hr_admin`, `eta_admin`): semua peserta tenant.
- Atasan (`supervisor` dan `pimpinan`, sama dengan B10 `modules/cca` `LEADER_ROLES`): cakupan = bawahan langsung
  (`people.directReportIds`), tanpa dirinya sendiri (beda dengan `visibleEmployeeScope()`, yang memasukkan id atasan).
  `GET /plans` dan `GET /plans/:id/overview` dihitung atas tim; indikator tim tetap tampil apa adanya. Atasan tidak
  menerima baris per orang, antrean, atau ringkasan wawancara; tab Pengukuran AI di layar atasan menampilkan catatan
  "Antrean wawancara ulang dikelola HR". Atasan boleh mengisi skor kinerja bawahan langsungnya (bagian 5).
  [⏳ DITERIMA: pemetaan `pimpinan` menunggu keputusan Andrian bersama B10.]
- Tidak ada ambang jumlah tim untuk rata-rata: RG-3 memberi atasan akses ke data timnya, dan modul lain sudah
  menampilkan data per orang ke atasan, jadi ambang tidak melindungi apa pun.
- Karyawan: 403. Hasil sendiri tampil di "Hasil saya" (B8), di luar paket ini.

### 6.6 Impor `lim_measurements`

- Opsi `planId` wajib (UUID rencana aktif tenant ini; diperiksa `context()`, fatal bila tidak ada).
- Opsi didefinisikan seperti `projectId` di `kinds/performance.js` (`{ key: 'planId', type: 'lim_plan', required: true }`).
  Kind ditambah di akhir `KINDS` (nomor template 11, sesudah `cca_program_results` nomor 10) agar nomor template lama tidak bergeser.
- Kolom: ID Karyawan atau Email, ID Kompetensi (UUID, opsional) atau Nama Kompetensi. Pencocokan hanya di antara
  kompetensi rencana; nama dicocokkan tanpa beda huruf, dan nama yang cocok ke lebih dari satu kompetensi rencana
  ditolak ("isi ID Kompetensi"). Karyawan harus peserta rencana. Skor Pre, Skor Post, Skor Kinerja, Catatan Kinerja. Skor 0–100 atau kosong (kosong = tidak diubah).
- Baris ganda (karyawan + kompetensi): baris terakhir dipakai.
- Tidak mengganti seluruh data (beda dengan impor program B10), jadi baris yang ditolak tidak menahan baris lain.

### 6.7 Ekspor dan hapus data karyawan (PK-15)

`buildExport` di `modules/employees` menambah `impactMeasurement`: baris `lim_measurements` karyawan itu (alasan
skor wawancara ulang ada di `lim_reinterviews.summary`, lihat 12.5; kolom `reinterview_summary` tidak dibuat). Tidak digerbang flag (PK-15: hak subjek data berlaku apa pun modul
yang aktif). Hapus karyawan menghapus barisnya lewat FK `lim_measurements.user_id` ON DELETE CASCADE.

## 7. Keputusan default yang dipakai

- K2: peran ikut mockup; menu LIM untuk tampilan hr dan atasan.
- Tidak ada ROI finansial; estimasi nilai opsional dan berlabel ilustratif.
- Satu rencana per kombinasi jabatan dan program dibuat HR; tidak ada pembuatan otomatis dari TNA. [⏳ DITERIMA:
  cukup untuk pilot L1 Service Delivery.]

## 8. Test (ditulis lebih dulu)

- `tests/unit/lim-domain.test.js`: `verdict`, `summarizeCompetencies` (rata-rata, n, post tidak teraudit),
  `buildChain` (tiap tingkat measured/partial/missing), `buildInsight`, `indicatorState` (arah, target, strength HR
  vs hitung), `buildQueue` (window early/due/late, urutan, tanggal terbaru yang diketahui), `checkScheduleDate`,
  `latestPost` (seri `created_at` berupa `Date`, `shared` dari baris pemenang).
- `tests/integration/lim.test.js` (Postgres): gerbang entitlement full_suite + flag; buat rencana dengan modul;
  pelatihan LD dengan skor (termasuk `vendor_manual`) → overview; indikator; isian pre/kinerja; pre dari DNA (×25, tidak
  menimpa); antrean dan jadwal (tolak pasangan bukan calon, lewati `done`); atasan hanya timnya, tanpa per orang;
  karyawan, sme, role_leader 403; impor (skor non-bulat ditolak, opsi `lim_plan`); audit `readIndividual` (termasuk
  antrean) dan `delete` indikator; ekspor karyawan; isolasi tenant termasuk penulisan; rencana tanpa jabatan dan tanpa
  data LD.
- `apps/web/e2e/lim.spec.ts` (Playwright, API mock): empat tab, jadwalkan per karyawan, formulir rencana, isi pre dari
  DNA dan impor dengan rencana terpilih, atasan tanpa antrean dan tanpa tombol HR, menu tersembunyi tanpa `full_suite`.

## 9. Daftar perubahan berkas (tahap 1)

- [x] `apps/api/migrations/20261119001500-learning-impact.js` (empat tabel + indeks, termasuk `ld_trainings_lim_module_idx`)
- [x] `apps/api/src/core/flags/index.js` (`MODULE_LIM`)
- [x] `apps/api/src/core/entitlement/index.js` (`lim` di `FULL_SUITE_ONLY`)
- [x] `apps/api/src/app.js` (daftar modul)
- [x] `apps/api/src/db/lim-stores.js` + sambungan di `db/lna-stores.js`
- [x] `apps/api/src/modules/lim/domain.js`, `index.js`
- [x] `apps/api/src/modules/imports/kinds/lim-measurements.js` + `kinds/index.js` (opsi `planId` bertipe `lim_plan`; `imports/index.js` tidak perlu diubah karena tipe opsi tidak divalidasi di sana)
- [x] `apps/api/src/modules/employees/index.js` (ekspor)
- [x] `apps/web/src/screens/b15-lim/` (`routes.ts`, `api.ts`, `labels.ts`, `LearningImpactView.vue`, `PlanForm.vue`)
- [x] `apps/web/src/components/ImportPanel.vue`, `apps/web/src/api/imports.ts` (submodul `lim`, opsi `lim_plan`)
- [x] test di bagian 8: `tests/unit/lim-domain.test.js`, `tests/integration/lim.test.js`, `tests/unit/gating.test.js`, `apps/web/e2e/lim.spec.ts`
- [x] `docs/designs/b15-impact-measurement.md`

## 10. Di luar cakupan tahap 1

- Percakapan wawancara ulang, skor otomatis, benchmark per karyawan, ringkasan rantai bukti per karyawan, rekomendasi AI
  (tahap 3).
- Koneksi otomatis ke sistem tiket atau laporan SLA klien; indikator diisi HR.
- Kepuasan pelanggan dan data bisnis lain dari sistem klien.
- Rekomendasi lintas modul (Improvement Needs, Career & Promotion) dari temuan; ditampilkan sebagai teks di tahap 3.

## 11. Catatan review egm

**Review spek 1** (subagent baru, empat lensa, 19 Nov): 15 temuan, 3 berat. Teks lengkap hasil review tidak tersimpan
di riwayat sesi, jadi hanya temuan berat yang ditriase di sini; temuan lain dikumpulkan ulang lewat review ulang
(diizinkan aturan 11 karena ada temuan berat).

| # | Temuan | Keputusan |
| --- | --- | --- |
| 1 (berat) | Banyak skor LD tanpa `completed_at` (offline, isian vendor), sehingga "terbaru" dan antrean tidak terdefinisi | Perbaiki: tanggal selesai efektif `COALESCE(completed_at, ends_on, starts_on)`, seri dengan id terbesar (bagian 4, 6.4) |
| 2 (berat) | `ld_participants.score` satu per pelatihan, tetapi dipakai sebagai skor per kompetensi | Perbaiki: tanda `postShared`, penimpa `post_score` per kompetensi lewat isian/impor (bagian 4, 5, 6.6) |
| 7 (berat) | Bentuk JSON respons tidak tertulis, engineer lain menebak | Perbaiki: bagian 5.1 |

**Review spek 2 (ulangan, subagent baru, 19 Nov 21.10 WIB):** 17 temuan, 3 berat. Teks utuh:
`/mnt/project-files/elgos-eksekusi/handoff/b15-review-spek-2.md`. Triase dengan skill `egm-resolve` (plugin egm),
laporan lengkap: `/mnt/project-files/elgos-eksekusi/egm-b10-b15/b15-goldfish_review_report.md`.

| # | Temuan (ringkas) | Keputusan | Di spek |
| --- | --- | --- | --- |
| 1 (berat) | `lna_competencies.code` tidak ada | Perbaiki: tanpa `code`; impor cocokkan ID Kompetensi atau nama di antara kompetensi rencana, nama ganda ditolak | 5.1, 6.6 |
| 2 (berat) | Tanggal selesai efektif bisa NULL | Perbaiki: skor tetap dihitung, tidak bisa dijadwalkan, `window: null` | 4, 6.4 |
| 3 (berat) | Kohort tanpa batas waktu/jabatan | Diajukan ke user → periode + jabatan rencana (19 Nov) | 4.1 |
| 4 | Pelatihan `cancelled` ikut | Perbaiki: dikecualikan | 4, 4.1 |
| 5 | Satuan karyawan vs pasangan | Perbaiki: tingkat 1 per keikutsertaan, tingkat 3/4 per karyawan | 6.2 |
| 6 | Antrean meledak per kompetensi | Diajukan ke user → satu per karyawan (19 Nov) | 6.4 |
| 7 | Atasan tanpa jalur isi tingkat 4 | Diputuskan user 23 Nov: atasan mengisi skor kinerja timnya, HR untuk semua (sama dengan default yang sudah dibangun) | 5, 6.5 |
| 8 | Tanpa ambang privasi; atasan masuk rata-rata | Tolak ambang (RG-3); perbaiki: atasan dibuang dari cakupan | 6.5 |
| 9 | Peran `pimpinan` kontradiktif | Perbaiki: sama dengan B10 (`LEADER_ROLES`) | 6.5 |
| 10 | Pre dari DNA belum rinci | Perbaiki: tanggal, sumber, tidak menimpa, label | 4 |
| 11 | Validasi PUT/POST | Perbaiki | 5 |
| 12 | Siklus jadwal | Perbaiki | 5, 6.4 |
| 13 | ON DELETE | Perbaiki | 4 |
| 14 | `no_data`, batas teks, position | Perbaiki | 4, 5.1, 6.3 |
| 15 | Urutan kind, opsi planId, gerbang ekspor | Perbaiki: akhir KINDS, ekspor tanpa gerbang (PK-15) | 6.6, 6.7 |
| 16 | GET /plans untuk atasan | Perbaiki | 5 |
| 17 | Teks review harus utuh | Perbaiki: ditautkan di atas | 11 |

**Review diff (goldfish, 19 Nov):** `mattpocock-skills:code-review` dua sumbu (Standards, Spec) terhadap
`origin/claude/project-thread-scbrmb`, plus persona egm `egm-codebase-details` dan `egm-implementation-readiness` atas
diff yang sama. Laporan dan triase `egm-resolve`: `/mnt/project-files/elgos-eksekusi/egm-b10-b15/b15-diff-review.md`.

| # | Temuan (ringkas, sumber) | Keputusan |
| --- | --- | --- |
| D1 | `latestPost` membandingkan `String(Date)`, seri `created_at` salah di data nyata (spek, dua persona) | Perbaiki: bandingkan waktu; test dengan `Date` |
| D2 | Skor desimal diterima, padahal 5.1 "bilangan bulat" (spek, codebase) | Perbaiki: PUT dan impor menolak non-bulat, pesan "bilangan bulat 0–100" |
| D3 | Satu kompetensi tanpa tanggal membuat karyawan tidak bisa dijadwalkan (readiness) | Perbaiki: tanggal terbaru yang diketahui (6.4 diperjelas) |
| D4 | Opsi impor `planId` bertipe `text`, layar tanpa jalur impor (spek, dua persona) | Perbaiki: tipe `lim_plan`, pilihan di ImportPanel, panel impor di tab Per kompetensi (HR) |
| D5 | Tombol "Isi pre dari asesmen DNA" tidak ada di layar (spek) | Perbaiki: tombol + keterangan "level × 25" di tab Per kompetensi (HR) |
| D6 | Label layar dipendekkan ("Retensi turun", "skor modul") (spek) | Perbaiki: teks spek utuh |
| D7 | `postShared` bisa diambil dari baris yang bukan pemenang (spek, dua persona) | Perbaiki: `latestPost` membawa `shared` |
| D8 | `recordReinterview` tidak memeriksa tenant karyawan/kompetensi (codebase) | Perbaiki: `EXISTS` per tenant + test |
| D9 | Atasan bisa menebak peserta lewat urutan pesan tolak (codebase) | Perbaiki: cek tim lebih dulu + test |
| D10 | Overview terbuka untuk atasan tanpa tim di rencana (codebase) | Perbaiki: 404, sama dengan GET /plans |
| D11 | Hapus indikator diaudit sebagai `update` (standards, codebase) | Perbaiki: `delete` + test |
| D12 | `schedule` tanpa transaksi (readiness, codebase) | Perbaiki: `tx` |
| D13 | Indeks FK `user_id`, `competency_id`, dan `ld_trainings (tenant_id, module_id)` (readiness) | Perbaiki di migrasi B15 (indeks `ld_trainings_lim_module_idx`, dibuang di `down`) |
| D14 | Celah test: entitlement API, audit baca antrean, rencana tanpa jabatan/tanpa data, peran sme/role_leader, tulis lintas tenant (readiness) | Perbaiki: test ditambah |
| D15 | Angka ajaib `× 25`, `decorateInd` diduplikasi (standards) | Perbaiki: `DNA_LEVEL_TO_SCORE`, satu helper |
| D16 | Header Sebelum/Sesudah mengabaikan `baselineLabel`/`afterLabel`; teks kosong menyebut impor indikator yang tidak ada (codebase) | Perbaiki |
| D17 | Tingkat 2 dihitung per pasangan, bukan per karyawan (spek, codebase) | Bantah: per pasangan lebih tepat untuk kenaikan per kompetensi; kalimat 6.2 diperjelas |
| D18 | `isHr` di Admin ETA tidak konsisten dengan guard `hr` (standards) | Tolak: `requireRole` meloloskan `eta_admin` (core/rbac), jadi konsisten |
| D19 | `GET /plans` N+1 (`planData` per rencana) (readiness, codebase) | Tunda: jumlah rencana per tenant kecil di POC; indeks D13 dipasang; agregat satu query dicatat untuk tahap 2 |
| D20 | `planData` sebaiknya pindah ke `domain.js`; UUID/`wrap`/`LEADER_ROLES` disalin (standards) | Tunda: pola repo saat ini; pindah ke core = kode bersama, diusulkan ke Andrian |
| D21 | Enum `Verdict` berbahasa Indonesia, `GET /api/lim/` tidak di tabel 5 (standards, spek) | Tolak: nilai mengikuti spek 6.1; `GET /` sama dengan modul lain |
| D22 | `job_role_id` ON DELETE SET NULL memperlebar kohort diam-diam (readiness) | Catat: perilaku sesuai bagian 4; layar menampilkan "semua jabatan" bila jabatan kosong |
| D23 | `teamOf` tidak memakai `visibleEmployeeScope()` (aturan 4) (standards) | Eskalasi ke Andrian (sama dengan B10 E7): spek 6.5 membuang atasan dari cakupan, `visibleEmployeeScope` memasukkannya |

### Test alur B18 (19 Nov, PR susulan)

Test alur `apps/api/tests/integration/alur-impact-measurement.test.js` (tabel 3.3 spek B18) menjalankan B13 → B14 → B15
lewat API sungguhan dan menemukan satu bug:

| # | Temuan | Keputusan |
| --- | --- | --- |
| A1 | `POST /api/lim/plans` tanpa `baselineLabel`/`afterLabel` (persis yang dikirim formulir web), atau tanpa `jobRoleId`/`periodFrom`/`periodUntil`, menghasilkan 500: isian `undefined` dari validasi menimpa bawaan `null` | Diperbaiki test-first: test integrasi "rencana minimal" (merah 500, lalu hijau 201); `planFields` kini membuang isian yang tidak dikirim (satu tempat untuk POST dan PATCH). E2E web tidak menangkapnya karena API di-mock |

## 12. Tahap 3: wawancara ulang AI (23 Nov)

Status: spek tahap 3, ditulis 23 Nov setelah thread paritas mockup mencatat layar ini belum ada (coordinator). Acuan:
mockup Pak Eji tab Pengukuran AI (antrean → Konfirmasi hasil belajar → Benchmark kinerja → Hasil bisnis → Ringkasan) dan
catatan mockup "Dalam produk, karyawan mengerjakannya sendiri lewat EliteMentor; di mockup ini HR memulainya untuk
demonstrasi". ELGOS terpisah dari EliteMentor (B15 revisi), jadi "lewat EliteMentor" dibaca sebagai: karyawan
mengerjakannya sendiri di layar karyawan ELGOS. Pola sesi, giliran terenkripsi, dan pemanggilan AI mengikuti B10 tahap 2
(`modules/cca/interview.js`), bukan mesin B6 (`modules/interviews`, terikat proyek TNA).

### 12.1 Keputusan

- **T-1 Pelaku.** Karyawan peserta antrean menjalankan wawancara ulangnya sendiri. HR tidak bisa memulai atau menjawab atas
  nama karyawan; HR hanya menjadwalkan (6.4) dan membaca hasil. Atasan tidak melihat apa pun di luar 6.5.
- **T-2 Kapan terbuka.** Wawancara terbuka bagi karyawan bila ada pasangan (karyawan, kompetensi) berstatus `scheduled`
  di rencana `active`. Tanggal jadwal adalah target, bukan kunci: karyawan boleh mulai lebih awal atau terlambat. Satu
  wawancara per (rencana, karyawan) mencakup semua kompetensi `scheduled` saat persetujuan diberikan (potret, maks
  `MAX_COMPETENCIES` = 4, urut nama; sisanya tetap `scheduled` untuk wawancara berikutnya).
- **T-3 Persetujuan.** Versi baru `lim-consent-id-v1.0` di `core/consent` (draf turunan teks TNA v1.0, tujuan
  "mengukur apakah hasil pelatihan masih terpakai; hasilnya dibandingkan dengan data kinerja untuk menilai dampak
  program, bukan dasar penilaian kinerja individu"), menunggu legal, sama dengan keputusan user untuk
  CCA (D-8 B10). Menambah versi mengubah kode bersama (review Andrian).
- **T-4 Pertanyaan.** Per kompetensi potret dua pertanyaan: `scenario` (situasi kerja, "apa langkah Anda") dan `verify`
  (cara memastikan hasilnya benar), lalu satu pertanyaan penutup `apply` untuk semua kompetensi ("apa yang berubah di
  pekerjaan Anda sejak pelatihan"). Jumlah = 2 × kompetensi + 1 (mockup, satu kompetensi: 3). AI membuat teks pertanyaan
  dan tiga pilihan jawaban; karyawan boleh mengetik jawaban sendiri (maks 2000 karakter). Pilihan jawaban tidak
  membawa skor ke layar.
- **T-5 Skor.** Setelah jawaban terakhir, server meminta AI menilai tiap kompetensi 0–100 dengan rubrik tetap (100 =
  langkah tepat dengan bukti dan sudah diterapkan; sekitar 60 = sebagian; sekitar 30 = tidak menunjukkan kemampuan) dan
  satu kalimat alasan per kompetensi (maks 200 karakter; prompt melarang mengutip jawaban karyawan, supaya alasan
  tidak menjadi jalan belakang ke transkrip). Skor dibulatkan bilangan bulat dan dijepit 0–100; kompetensi yang tidak dinilai
  model ditolak (sesi tetap `in_progress`, `step: 'scoring'`, layar mencoba lagi lewat `POST /turns` tanpa `text`).
  Skor ditulis lewat store baru `completeReinterview(tenantId, id, { scores, summary })`: satu transaksi mengunci baris
  wawancara `FOR UPDATE`, mensyaratkan `status = 'in_progress'` (dua jawaban terakhir paralel tidak bisa menutup dua
  kali), menulis `lim_measurements.reinterview_score`/status `done`/`reinterview_session_id` = id wawancara untuk
  pasangan potret yang belum `done` (lihat 12.8 #1), lalu menutup sesi. Tidak ada langkah konfirmasi ringkasan oleh karyawan: ini pengukuran, bukan pemetaan pendapat.
  Karyawan melihat "Terima kasih, jawaban Anda sudah tersimpan" tanpa skor.
- **T-6 Transkrip.** Giliran disimpan terenkripsi per tenant dan hanya untuk karyawan itu (sama dengan PO-6: layar
  review HR tanpa transkrip). Ringkasan (skor + alasan per kompetensi) disimpan terenkripsi di
  `lim_reinterviews.summary`; HR membaca skor dan alasan.
- **T-7 Benchmark, hasil bisnis, ringkasan (layar HR).** Dihitung aturan (`generatedBy: 'rules'`), bukan AI:
  - Benchmark per kompetensi potret: post (Learning Delivery atau isian), wawancara ulang, kinerja. Temuan seperti mockup:
    `post − wawancara ulang > 10` → "Hasil belajar tidak bertahan" (`retention_drop`), selain itu "Hasil belajar
    terkonfirmasi"; `wawancara ulang − kinerja > 10` → "Belum diterapkan penuh di pekerjaan" (`application_gap`), selain
    itu "Kemampuan terlihat di kinerja". Nilai yang kosong → temuan `missing` ("Data belum lengkap").
    Konstanta `GAP_THRESHOLD = 10` di `reinterview-rules.js`. [⚠️ BELUM TERVERIFIKASI: ambang 10 dari mockup.]
  - Hasil bisnis: indikator tim rencana dan faktor lain (sama dengan tab Dampak bisnis), dengan catatan mockup
    "Indikator tingkat tim, bukan per orang".
  - Ringkasan rantai bukti per karyawan, enam tingkat: Aktivitas (keikutsertaan LD karyawan itu), Pembelajaran (post),
    Kapabilitas (wawancara ulang), Penerapan (kinerja), Kinerja tim dan Hasil bisnis (indikator rencana pertama yang
    lengkap per tingkat). Tingkat keyakinan, urutan menang Rendah > Sedang > Tinggi: "Rendah" bila ada `missing`,
    "Sedang" bila ada `retention_drop`/`application_gap`, selain itu "Tinggi".
  - Rekomendasi aturan, satu per kompetensi per kondisi (tanpa duplikat teks; rekomendasi indikator satu per
    indikator tanpa data): `retention_drop` → "Jadwalkan penguatan <kompetensi> dan ulangi wawancara dalam
    4 pekan."; `application_gap` → "Buka tindakan perbaikan di Improvement Needs untuk hambatan non-pelatihan.";
    kedua temuan terukur dan bersih → "Lanjutkan ke kompetensi berikutnya dalam jalur belajar." (teks mockup; rekomendasi Career &
    Promotion tidak dipakai karena bertentangan dengan tujuan persetujuan dan bagian 1); indikator bisnis tanpa data → "Lengkapi
    data <indikator> agar tingkat hasil bisnis lengkap." [⏳ DITERIMA: mockup menulis "Rekomendasi AI" dan "tingkat
    keyakinan AI"; sama dengan keputusan 6.2 dan B14, layar menulis "Rekomendasi" dan "Tingkat keyakinan" dengan
    keterangan "dari data pengukuran" sampai ada narasi LLM.]
- **T-8 Flag.** Flag baru `lim.reinterview` (default mati), di samping `module.lim` dan paket `full_suite`.
- **T-9 Ulang.** Tidak ada "ulangi" di tengah wawancara. Setelah `done`, HR bisa menjadwalkan ulang hanya lewat
  rencana baru (6.4 tetap melewati pasangan `done`). [⏳ DITERIMA: penguatan dan wawancara ulang kedua masuk
  rekomendasi, mekanismenya di luar tahap 3.]

### 12.2 Data dan migrasi

Migrasi `20261123003000-lim-wawancara-ulang.js` (raw SQL, punya `down`):

- `lim_reinterviews`: `id`, `tenant_id` (CASCADE), `plan_id` → `lim_plans` (CASCADE), `user_id` → `users` (CASCADE),
  `status` (`in_progress`/`completed`), `consent_version`, `consent_at`, `competency_ids uuid[]` (potret, 1–4),
  `summary` (teks terenkripsi, JSON `{ competencies: [{ competencyId, score, reason }] }`), `completed_at`,
  `created_at`, `updated_at`. UNIQUE parsial (`plan_id`, `user_id`) WHERE `status = 'in_progress'`.
- `lim_reinterview_turns`: `reinterview_id` (CASCADE), `tenant_id`, `position` 1..18 (= 2 × (2 × `MAX_COMPETENCIES` + 1)), `role` (`ai`/`participant`),
  `kind` (`scenario`/`verify`/`apply`), `competency_id` (nullable untuk `apply`), `text` terenkripsi, `options` (JSON
  terenkripsi), UNIQUE (`reinterview_id`, `position`). Baris jawaban memakai `kind` dan `competency_id` pertanyaannya.
- `ai_usage_logs.operation` CHECK ditambah `lim_question` dan `summarize_lim` (kode bersama).

Sisipan giliran memakai pola B10: kunci baris wawancara `FOR UPDATE` lalu jumlah giliran harus = position − 1.

### 12.3 Endpoint (`/api/lim`, flag `lim.reinterview` untuk semua rute di bawah)

Rute karyawan dipasang sebelum pembatas peran HR/atasan dan hanya membaca data pemanggil sendiri.

| Rute | Siapa | Isi |
| --- | --- | --- |
| `GET /me/reinterviews` | semua peran | daftar rencana `active` tempat pemanggil punya pasangan `scheduled` atau wawancara `in_progress`/`completed`: `{ planId, planTitle, scheduledOn, status: 'open'/'in_progress'/'completed', competencies: [nama] }` |
| `GET /me/reinterviews/:planId/session` | pemilik | `step` (`consent`/`chat`/`done`), `consentVersionRequired`, giliran publik, `answerCount`, `questionCount` |
| `POST /me/reinterviews/:planId/consent` | pemilik | `{ consentVersion }` → buat wawancara dengan potret kompetensi, lalu pertanyaan pertama (AI gagal → `{ question: null }`, layar meminta lagi) |
| `POST /me/reinterviews/:planId/turns` | pemilik | `{ text }` jawaban; tanpa `text` = minta ulang pertanyaan yang belum ada. Jawaban terakhir memicu penilaian (T-5) dan menjawab `{ done: true }` |
| `GET /plans/:id/reinterviews/:userId` | HR | hasil satu karyawan: skor + alasan per kompetensi, benchmark, temuan, hasil bisnis, rantai bukti, keyakinan, rekomendasi (T-7). Dicatat `audit.readIndividual`. 404 bila belum `completed` |

Antrean (`GET /plans/:id/queue`) menambah `reinterviewId` dan `canView` (= `done` dan ada wawancara `completed`). Galat
AI menjadi 502 `AI_UNAVAILABLE` dengan pesan umum, seperti B10.

### 12.4 Layar

- Karyawan: rute baru `/wawancara-ulang` (tampilan karyawan dan atasan, submodul `lim`, flag `lim.reinterview`, judul
  "Wawancara ulang"): daftar dari `GET /me/reinterviews`, lalu sesi: teks persetujuan → percakapan "Konfirmasi hasil
  belajar" ("Pertanyaan n dari N", tiga tombol pilihan + "Atau ketik jawaban sendiri") → selesai.
- HR, tab Pengukuran AI: tombol "Lihat hasil" pada baris `canView` membuka alur empat langkah mockup (panel langkah
  kiri): 1 Konfirmasi hasil belajar (skor + alasan per kompetensi, tanpa transkrip), 2 Benchmark kinerja (tiga batang
  per kompetensi + temuan), 3 Hasil bisnis, 4 Ringkasan (rantai bukti, keyakinan, rekomendasi, "Kembali ke antrean").
  Catatan mockup "di mockup ini HR memulainya" diganti "Karyawan mengerjakan wawancara ulang sendiri dari menu
  Wawancara ulang setelah dijadwalkan."

### 12.5 Ekspor dan hapus (PK-15)

Ekspor karyawan menambah `reinterviews` (status, tanggal, skor per kompetensi); alasan dan transkrip hanya untuk
ekspor oleh karyawan itu sendiri. Hapus karyawan menghapus wawancara dan giliran lewat CASCADE.

### 12.6 Test (ditulis lebih dulu)

- Unit `lim-reinterview.test.js`: urutan pertanyaan (2 × n + 1, `scenario`/`verify` per kompetensi lalu `apply`),
  temuan benchmark dan ambang 10, keyakinan, rekomendasi, rantai per karyawan.
- Unit AI: prompt dan parser `limQuestion`/`summarizeLim` (stub dan Bedrock), skor dijepit dan kompetensi hilang ditolak.
- Integrasi `lim-wawancara-ulang.test.js`: alur karyawan (persetujuan, 3 pertanyaan untuk 1 kompetensi, skor tersimpan,
  antrean `done`, ringkasan per kompetensi terisi), privasi (karyawan lain 404, HR tanpa transkrip, atasan 403 untuk
  hasil), flag mati, versi persetujuan salah, AI gagal, jawaban paralel, ekspor/hapus.
- e2e: alur karyawan dengan API tiruan; HR membuka "Lihat hasil" dan melewati empat langkah.

### 12.7 Triase review spek (egm-resolve, 23 Nov)

Review goldfish (implementation-readiness) atas bagian 12. Semua temuan diterima kecuali yang dicatat.

| # | Temuan | Keputusan |
| --- | --- | --- |
| 1 | `position` 1..9 terlalu kecil (4 kompetensi = 18 giliran) | Diperbaiki di 12.2: 1..18; jawaban mewarisi `kind`/`competency_id` |
| 2 | HR membatalkan jadwal atau mengarsipkan rencana saat wawancara berjalan | Jadwal/batal (6.4) melewati pasangan milik wawancara `in_progress` (alasan lewat `in_progress`); `completeReinterview` menulis pasangan potret yang belum `done` (12.8 #1); rencana `archived` → rute sesi 409 `PLAN_ARCHIVED`, baris tetap `in_progress` |
| 3 | `recordReinterview` tidak bisa ikut transaksi | Store baru `completeReinterview` (T-5) |
| 4 | Coba lagi penilaian tidak punya endpoint | `POST /turns` tanpa `text` saat semua jawaban ada = nilai ulang; `step: 'scoring'` (T-5) |
| 5 | Lebih dari 4 kompetensi membuat `canView` palsu; banyak wawancara `completed` | `canView` = ada minimal satu wawancara `completed`; `GET /plans/:id/reinterviews/:userId` menjawab daftar wawancara `completed` terbaru dulu, layar menampilkan yang terbaru |
| 6 | Ringkasan di dua tempat | Kolom `lim_measurements.reinterview_summary` dihapus dari rencana (bagian 4, 6.7) |
| 7 | Persetujuan "bukan penilaian kinerja" vs benchmark kinerja dan rekomendasi C&P; alasan AI bisa mengutip jawaban | Teks tujuan persetujuan diubah (T-3); rekomendasi C&P dibuang; alasan maks 200 karakter, prompt melarang kutipan, ada test parser memotong |
| 8 | Keyakinan dan rekomendasi untuk banyak kompetensi tidak terdefinisi | Rendah > Sedang > Tinggi; satu rekomendasi per kompetensi per kondisi (T-7) |
| 9 | Celah mockup | "Lanjutkan ke kompetensi berikutnya…" ditambah; tombol mockup "Simpan hasil" tidak dibuat karena hasil tersimpan otomatis di T-5 |
| 10 | Kelayakan tidak dicek ulang | Saat persetujuan: pemanggil harus masih peserta rencana (periode + jabatan, 4.1), selain itu 404 |
| 11 | Kasus belum disebut | `audit.record` `lim.reinterview_consent` dan `lim.reinterview_completed`; flag mati → 403 `FEATURE_DISABLED` (`requireFlag`, sama dengan flag lain; koreksi review kode); giliran publik = semua giliran sesi (maks 18: `position`, `role`, `kind`, `text`, `options`). [⏳ DITERIMA: tidak ada batas waktu untuk wawancara `in_progress` yang ditinggal; karyawan bisa melanjutkan kapan saja selama rencana `active`.] |
| 12 | T-7 hampir fitur kedua | Diterima sebagai urutan kerja: T-1..T-6 (backend + layar karyawan) di komit pertama, T-7 (hasil HR) di komit berikut dengan test sendiri, flag yang sama |

### 12.8 Triase review diff dan code review dua sumbu (23 Nov)

Review goldfish atas diff (codebase-details) dan mattpocock-skills:code-review (Standards, Spec).

| # | Temuan | Keputusan |
| --- | --- | --- |
| 1 | Balapan: HR membatalkan jadwal bersamaan dengan persetujuan, skor hilang diam-diam | `schedule` mensyaratkan tidak ada wawancara `in_progress` (SQL `NOT EXISTS`); `completeReinterview` menulis pasangan potret yang belum `done`, karena wawancaranya tetap terjadi. Test integrasi balapan |
| 2 | Menu dan rute `/wawancara-ulang` hanya memeriksa `lim.reinterview`, padahal API butuh `module.lim` | Meta rute baru `flags: ['module.lim', 'lim.reinterview']` (gerbang router bersama, kode bersama web); e2e |
| 3 | Antrean memuat field tahap 3 walau flag mati | `reinterviewId`/`canView` hanya saat `lim.reinterview` menyala; test |
| 4 | "Lanjutkan" direkomendasikan saat data kosong | Hanya bila kedua temuan terukur dan bersih; test |
| 5 | Rantai per karyawan memakai kalimat tingkat rencana ("1 dari 1 karyawan") | `personalChain`: tingkat 2–4 menyebut skor orang itu ("Wawancara ulang AI: 72", mockup); test |
| 6 | `askAi` disalin dari CCA | Helper bersama `callAiOr502` di `modules/interviews/ai-calls.js`, dipakai CCA dan LIM |
| 7 | Spek: 404 vs 403 saat flag mati; letak `GAP_THRESHOLD` | Spek dikoreksi (403, `reinterview-rules.js`) |
| 8 | Teks chip berbeda dari mockup | Disamakan: "Terkonfirmasi", "Cek Improvement Needs", "Terapan baik" |
| 9 | Test hapus karyawan belum ada | Ditambah (CASCADE wawancara dan giliran) |
| 10 | Nama `tanggal` lokal menutupi helper labels | Diganti `tanggalWaktu` |
| — | "Kembali ke antrean" di semua langkah; hasil dibuka dari langkah 1 | [⏳ DITERIMA: memudahkan HR keluar; spek mengizinkan] |
| — | T-7 sudah ikut di komit API pertama (12.7 #12) | [⏳ DITERIMA: dua komit API lalu layar; T-7 punya test sendiri] |
