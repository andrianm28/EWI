# B14 · Learning Delivery (modul `ld`)

Status: dibangun (PR #23, masuk scbrmb), spek diselaraskan dengan review egm susulan (plugin egm asli) · 19 Nov 2026 · paket B14 dari `brief-bangun-penuh-19nov.md` (thread T8).
Acuan layar: mockup Pak Eji, layar `ld` dengan tab Ringkasan, Sedang berjalan, Akan datang, Pelatihan offline.
Bergantung pada B13 (`li_modules`) dan katalog belajar PK-18 (`lna_catalog_items`, `lna_catalog_completions`, sudah di branch integrasi).

## 1. Tujuan

HR/L&D melihat di satu layar pelatihan apa yang sedang dan akan berjalan, siapa yang tertinggal, dan apa yang belum
siap. Pelatihan online masuk otomatis dari EliteMentor (webhook) atau LMS klien (impor status course PR #13).
Pelatihan offline dicatat di ELGOS: jadwal, peserta, kehadiran, asesmen, dokumentasi. Data ini menjadi bahan B15
(Learning Impact Measurement): skor dan kehadiran per peserta per pelatihan.

Bukan tujuan: memutar materi belajar (itu EliteMentor/LMS), ujian di lokasi (layar `em` mockup adalah EliteMentor).

## 2. Layar yang dicakup

| Tab mockup | Isi | Endpoint |
| --- | --- | --- |
| Ringkasan | 4 KPI, insight, saran tindakan untuk HR | `GET /api/ld/dashboard`, `POST /api/ld/trainings/:id/reminders` |
| Sedang berjalan | Filter Semua/Online/Offline; tabel nama, sumber data, peserta, progres, status, batas | `GET /api/ld/trainings?state=running&mode=` |
| Akan datang | Tanggal, pelatihan, jenis, kesiapan (Jadwal, Materi, Peserta, Asesmen), tindakan | `GET /api/ld/trainings?state=upcoming` |
| Pelatihan offline | Daftar + form tambah; detail: kelengkapan data, peserta + kehadiran, asesmen, dokumentasi + catatan UU PDP | `POST /api/ld/trainings`, `GET/PATCH /api/ld/trainings/:id`, `PUT .../participants`, `PUT .../attendance`, `PUT .../assessment`, `PUT .../scores`, `POST .../documents`, `GET /api/ld/documents/:id/content`, `DELETE /api/ld/documents/:id` |

Semua endpoint hanya untuk `hr_admin` (dan `eta_admin`, kecuali unduh isi dokumentasi yang hanya `hr_admin`). Di mockup atasan dan karyawan tidak punya menu ini.
Data karyawan (pilihan peserta, daftar peserta) dibaca lewat cakupan `visibleEmployeeScope()` (aturan 4 CLAUDE.md); untuk HR dan admin ETA cakupannya semua karyawan tenant.
Rute web `ld` memakai `meta.flag = 'module.ld'` dan `meta.entitlement = 'full_suite'` (kontrak B0), jadi menu tidak tampil untuk tenant yang API-nya akan menjawab 403.

## 3. Data dan migrasi

Blok migrasi 14: `20261119001400-learning-delivery.js` (raw SQL, punya `down`). Semua tabel punya `tenant_id`.

| Tabel | Kolom penting |
| --- | --- |
| `ld_trainings` | `title`, `mode` (`online`/`offline`), `source` (`manual`/`elitementor`/`lms`), `external_ref` (unik per tenant+source bila terisi), `module_id` → `li_modules`, `program_tier`, `vendor_name`, `venue`, `starts_on`, `ends_on` (batas), `session_count`, `sessions_done`, `status` (`scheduled`/`running`/`done`/`cancelled`), `materials_ready`, `assessment_mode` (`none`/`elitementor`/`vendor_manual`), `assessment_ref` (kode asesmen di EliteMentor), `catalog_item_id`, `last_reminded_at`, `last_event_at`, `created_by` |
| `ld_participants` | `training_id`, `user_id` (unik per pelatihan, FK `ON DELETE CASCADE`: menghapus karyawan menghapus riwayatnya, lihat §9 B15), `progress_pct` 0–100, `status` (`enrolled`/`in_progress`/`completed`/`failed`), `attendance` (null/true/false) + siapa dan kapan mencatat, `score`, `score_source` (`elitementor`/`lms`/`vendor_manual`), `last_activity_at` (aktivitas belajar), `last_event_at` (urutan event), `completed_at` |
| `ld_documents` | `training_id`, `kind` (`material`/`photo`/`video`), `filename`, `mime`, `size_bytes`, `storage_key`, `uploaded_by` |
| `ld_sync_events` | `source`, `event_id` (unik per tenant+source), `type`, `result` (jsonb), `received_at` — idempotensi webhook |

Kehadiran dan skor adalah data individu: `GET /trainings/:id` dicatat dengan `audit.readIndividual`, semua perubahan
dengan `audit.record`. Skor disimpan sebagai angka terbuka 0–100 (CHECK), sama seperti `lna_catalog_completions.score`. Event webhook tidak
menulis baris audit satu per satu; `ld_sync_events` adalah catatannya.

### Pelatihan online dari LMS klien (tanpa webhook)

Course LMS menjadi baris `ld_trainings` sungguhan (`source = lms`, `external_ref` = kode course), supaya pengingat,
status, dan B15 memakai satu tabel. `stores.ld.syncFromCatalog(tenantId)` dipanggil setiap daftar atau ringkasan
dibaca (`GET /dashboard`, `GET /trainings`; detail `GET /trainings/:id` tidak menyinkronkan): membuat satu pelatihan per course aktif yang punya status peserta (course sumber `elitementor` dilewati,
karena datang lewat webhook) dan menyalin peserta dari `lna_catalog_completions` (`passed` → selesai 100%, `failed`,
`in_progress` dengan progres kosong; skor di luar 0–100 tidak disalin). Idempoten. Judul course yang berubah dan course yang dinonaktifkan tidak diteruskan ke pelatihan yang sudah ada (lihat §8, ditunda). HR boleh mengisi tanggal mulai dan batas; tanpa batas,
statusnya "sesuai jadwal".

### Pelatihan online dari EliteMentor (webhook, flag `em.webhook_sync`)

`modules/ld/sync.js` menjadi `handler` untuk `webhookRouter` yang sudah ada (verifikasi HMAC tidak diubah). Kontrak
event yang diusulkan:

```json
{ "id": "evt-123", "type": "learning.progress", "organizationId": 42,
  "course": { "ref": "ST-B4", "title": "Ticket Life Cycle", "programTier": "basic", "dueAt": "2026-12-15" },
  "user": { "email": "a@klien.co.id", "elitementorUserId": 7 },
  "progressPct": 78, "status": "in_progress", "score": null, "occurredAt": "2026-11-20T03:00:00Z" }
```

`type: "assessment.result"` memakai bentuk yang sama dengan `score` wajib; `course.ref` berisi kode asesmen yang
diisi HR di pelatihan offline (`assessment_ref`).

Pemrosesan (`sync.js` + `stores.ld.applySyncEvent`):
1. `normalizeEvent` memvalidasi bentuk dan rentang (`progressPct` dan `score` 0–100, `status` in_progress/completed/
   failed, `occurredAt`, `organizationId` dan `user.elitementorUserId` bilangan bulat 1–2147483647 atau string angka). Tidak valid → diabaikan, dijawab 202 (EliteMentor tidak perlu mengulang). Isi yang bukan JSON
   dijawab 400 oleh `webhook.js`.
2. Tenant dicari dari `tenants.elitementor_organization_id`; harus tepat satu tenant aktif. Nol atau lebih dari satu →
   diabaikan.
3. Entitlement `ld`, flag `module.ld`, dan flag `em.webhook_sync` harus menyala untuk tenant itu; bila tidak, event
   diabaikan dan tidak dicatat (tetap 202).
4. Satu transaksi per event. Baris `ld_sync_events` disisipkan lebih dulu (`ON CONFLICT DO NOTHING`), jadi event ganda
   atau bersamaan diproses sekali; bila penerapan gagal, semuanya batal dan EliteMentor boleh mengulang (5xx).
5. `learning.progress`: karyawan dicari di tenant itu lewat `elitementor_user_id`, lalu `lower(email)`; harus tepat
   satu dan tidak dinonaktifkan, selain itu `user_not_found`. Upsert `ld_trainings` (`source = elitementor`,
   `external_ref = course.ref`, `mode = online`; `module_id` diisi bila ada `li_modules.code = course.ref`). Batas dari
   event hanya mengisi `ends_on` yang kosong, jadi batas isian HR menang. Upsert peserta hanya bila `occurredAt` ≥
   `last_event_at` peserta (event terlambat dicatat `stale`). Satu pelatihan per `course.ref` (belum ada angkatan).
6. `assessment.result`: harus ada tepat satu pelatihan `manual` milik tenant dengan `assessment_mode = elitementor` dan
   `assessment_ref = course.ref`; skor diisi hanya untuk karyawan yang sudah menjadi peserta.

`[⚠️ BELUM TERVERIFIKASI]` Kontrak event ini belum disepakati dengan tim EliteMentor (FR-EM terbuka). Handler
ditulis di balik satu fungsi `normalizeEvent` agar perubahan bentuk payload hanya menyentuh satu tempat. Sampai
kontrak disepakati, flag `em.webhook_sync` tetap mati dan data online berasal dari impor LMS.

### Dokumentasi (unggah berkas)

Repo belum punya penyimpanan berkas (impor menyimpan baris di DB). Paket ini menambah port `storage`
(`integrations/storage`): `put(key, buffer)`, `get(key)`, `remove(key)`, dengan adapter disk lokal di
`EWI_UPLOAD_DIR` (kunci `<tenantId>/<uuid>`) dan adapter memori untuk test. Bila `EWI_UPLOAD_DIR` kosong, unggah
menjawab 501 `STORAGE_NOT_CONFIGURED`; bagian lain tetap berjalan.

- Hanya untuk pelatihan `manual`. Batas: `EWI_UPLOAD_MAX_MB` (1–200, default 25; di luar rentang aplikasi menolak boot) dan paling banyak 60 berkas per pelatihan. Tipe: JPEG, PNG, WebP, MP4, PDF (PDF hanya untuk `material`). Tipe dicek
  dari tanda tangan isi berkas (magic bytes), bukan hanya nama.
- Unggah: body mentah + `?filename=&kind=` (`kind` tidak diisi = `photo`), sama dengan pola impor. Sebelum body dibaca
  ke memori, router memeriksa: pelatihan ada dan `manual`, storage diatur (501), `kind` valid (400), jumlah berkas
  < 60 (409 `LIMIT_REACHED`), dan `Content-Length` ≤ batas. Body yang melebihi batas dijawab 413 `FILE_TOO_LARGE`
  ("Berkas melebihi batas N MB"). Saat menyimpan baris, pelatihan dikunci (`FOR UPDATE`) lalu jumlah berkas dihitung
  ulang, jadi unggahan bersamaan tidak melewati 60.
- Unduh hanya lewat API (`GET /api/ld/documents/:id/content`), `hr_admin` saja (admin ETA ditolak 403), dicatat audit,
  dengan `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, dan tipe hasil deteksi. Tidak ada URL publik.
- Urutan tulis: berkas dulu lalu baris (berkas dihapus bila baris gagal, batas tercapai, atau pelatihan terhapus di tengah unggah → 409/404); hapus: baris dulu lalu berkas.
- Hapus menghapus berkas dan barisnya. Menghapus tenant menghapus baris (CASCADE); berkas di disk dibersihkan oleh
  runbook hapus tenant (ditulis sebagai kebutuhan infra di PR).
- `[⏳ DITERIMA]` Berkas tidak dienkripsi per tenant di tingkat aplikasi; mengandalkan enkripsi disk VPS dan izin
  folder. Kebutuhan infra (volume, cadangan, enkripsi) ditulis di PR untuk thread infra. Test integrasi memastikan
  berkas tenant lain tidak bisa diunduh.
- Catatan UU PDP di layar mengikuti mockup. Dokumentasi hanya untuk HR; pengaturan akses per peran tidak dibangun.

## 4. Aturan bisnis

1. **Tambah pelatihan offline**: `title` dan `startsOn` wajib (400 dengan pesan "Isi judul dan tanggal").
   `vendorName` default `settings.li.vendorName` (K4). Tanggal memakai format ISO `YYYY-MM-DD` dari UI (pemilih
   tanggal), bukan teks bebas seperti di mockup.
2. **Peserta**: ditambah lewat `userIds` atau `jobRoleId` (semua karyawan di jabatan itu yang tidak dinonaktifkan). Hanya karyawan tenant
   yang sama. Menghapus peserta menghapus kehadiran dan skornya.
3. **Kehadiran**: per peserta `true`/`false`/`null`, atau `allPresent: true`. Pencatat dan waktu disimpan.
4. **Asesmen** (pelatihan offline): `none` → pilih `elitementor` (skor masuk lewat webhook; status `awaiting` sampai
   ada skor, lalu `synced` bila semua peserta yang hadir punya skor) atau `vendor_manual` (HR mengisi skor 0–100 per
   peserta; status `manual`). Mengganti mode ke `none` tidak menghapus skor yang sudah ada. Skor manual ditandai
   `score_source = vendor_manual` dan layar memberi catatan "tidak bisa diaudit per jawaban" (mockup).
   ELGOS tidak mengirim tautan ke EliteMentor di paket ini; `elitementor` hanya menandai bahwa skor ditunggu dari
   webhook, wajib `assessmentRef`, dan hanya boleh dipilih bila flag `em.webhook_sync` menyala (403 `FEATURE_DISABLED`).
   Pelatihan `elitementor`/`lms` hanya-baca: peserta, kehadiran, asesmen, skor, dan dokumen dijawab 409
   `READ_ONLY_SOURCE`; `PATCH` hanya `startsOn`, `endsOn`, `status`, `moduleId`. `[⏳ DITERIMA]` Pengiriman tautan asesmen butuh endpoint EliteMentor yang belum ada.
5. **Kelengkapan data** (fungsi murni `readiness(row)`, `row` = baris pelatihan + hitungan peserta dari store). Tiap
   cek punya `state`: `complete`, `missing`, atau `waiting`; Dokumentasi bertanda `optional`. Status asesmen
   (`assessmentStatus`): `none`, `awaiting`, `synced`, `manual_pending` (mode `vendor_manual`, skor belum lengkap),
   `manual`. Cek: Jadwal dan tempat (tanggal + tempat), Materi
   (`materials_ready` atau ada dokumen `material`), Daftar peserta (≥ 1), Daftar kehadiran (semua tercatat), Asesmen
   dan hasil (lengkap bila `synced`/`manual` dengan semua skor; menunggu bila `awaiting`), Dokumentasi (≥ 1 foto
   atau video; tidak wajib). Tab "Akan datang" memakai empat cek pertama versi ringkas: Jadwal, Materi, Peserta,
   Asesmen (asesmen dianggap siap bila mode sudah dipilih).
6. **Status pelatihan berjalan** (fungsi murni `health(training, today)`):
   - `late`: `ends_on` sudah lewat dan progres < 100.
   - `watch` online: progres tertinggal > 15 poin dari progres linear antara `starts_on` dan `ends_on` (butuh kedua
     tanggal).
   - `watch` offline: mulai ≤ 7 hari lagi, atau sudah mulai tetapi belum ditutup, dengan kelengkapan (Jadwal, Materi,
     Peserta, Asesmen) belum penuh. Sesi offline yang tertinggal tidak memicu `watch`; pelatihan offline yang lewat
     batas menjadi `late`.
   - selain itu `ok`.
   Progres online = rata-rata progres peserta: `completed` dan `failed` dihitung 100 (sudah tuntas), selain itu
   `progress_pct`, kosong = 0 (mis. status `in_progress` dari LMS yang tidak mengirim persen). Progres offline =
   `sessions_done / session_count`.
   `today` dihitung di zona waktu Asia/Jakarta.
7. **Kelompok daftar**: `running` = status `running`, atau `scheduled` dengan `starts_on ≤ today`; `upcoming` =
   `scheduled` dengan `starts_on > today`; `done`; `cancelled` (tidak bisa dibuka lagi). Pelatihan offline ditandai
   `done` oleh HR; pelatihan online selesai sendiri saat semua pesertanya tuntas, yaitu berstatus `completed` atau
   `failed`. Offline: `endsOn` default `startsOn`,
   `sessionCount` default 1.
8. **KPI ringkasan** (`kpis`): `running` (dengan rincian `online`/`offline`), `upcoming` (jumlah akan datang, dikirim
   untuk tab tetapi tidak ditampilkan sebagai kartu KPI), `activeLearners` (karyawan unik berstatus `enrolled` atau
   `in_progress` di pelatihan berjalan), `avgProgress` (rata-rata progres pelatihan berjalan), `attention` (pelatihan
   berjalan atau akan datang dengan status `watch` atau `late`). Layar menampilkan empat kartu: berjalan, peserta aktif,
   rata-rata progres, perlu perhatian.
   Peserta **tidak aktif** (hanya pelatihan online; offline selalu 0): status `enrolled`/`in_progress` dan aktivitas
   terakhir (atau, bila belum pernah aktif, waktu terdaftar di ELGOS) lebih dari 14 hari lalu.
   `[⏳ DITERIMA]` Untuk course LMS, "waktu terdaftar" adalah saat peserta pertama kali tersinkron ke ELGOS, karena impor
   status course tidak membawa tanggal daftar di LMS.
9. **Insight dan saran tindakan** (fungsi murni `buildInsights`), dibuat dari aturan, bukan LLM. Hanya pelatihan
   berjalan dan akan datang. Per pelatihan, aturan A dievaluasi berurutan dan berhenti di yang pertama cocok; aturan B
   dievaluasi terpisah (satu pelatihan bisa mendapat satu insight A dan satu insight B). "Belum selesai" = peserta
   dikurangi yang `completed` dan `failed`.

   | Urut | Syarat | Kunci insight | Saran (`action.kind`) |
   | --- | --- | --- | --- |
   | A1 | online, `late` | `late` "tertinggal dari jadwal" | `remind` bila ada yang belum selesai |
   | A2 | offline, `late` | `late` "belum ditutup" | `open_training` (lengkapi kehadiran, asesmen, status) |
   | A3 | online berjalan (bukan akan datang), ada peserta tidak aktif | `inactive` | `remind` |
   | A4 | online, `watch` | `behind` "di bawah jadwal" | `remind` bila ada yang belum selesai |
   | B1 | offline, mulai hari ini sampai 14 hari lagi, asesmen belum dipilih | `assessment` | `open_training` |
   | B2 | offline, mulai hari ini sampai 14 hari lagi, asesmen sudah dipilih tetapi Jadwal/Materi/Peserta belum lengkap | `readiness` | `open_training` |

   Respons memuat `generatedBy: "rules"`.
   `[⏳ DITERIMA]` Mockup menamai kartu ini "Insight AI". Isinya di paket ini berbasis aturan, jadi UI menulis
   "Insight" dengan keterangan "dari data pelatihan" sampai narasi LLM ditambahkan. Menyebut hasil aturan sebagai AI
   ke klien dinilai menyesatkan; keputusan akhir di user.
10. **Pengingat**: hanya untuk pelatihan berjalan atau akan datang (selain itu 409 `INVALID_STATE`); tanpa penerima
    dijawab 400. `POST /trainings/:id/reminders` mengirim email lewat `mailer` yang ada ke peserta yang belum
    selesai (online) atau semua peserta (offline), melewati akun nonaktif, paling sering sekali per 24 jam per pelatihan (409 `REMINDER_RECENT`), dicatat audit dengan jumlah
    penerima, terkirim, dan gagal. Jatah 24 jam diklaim secara atomik sebelum mengirim. Email hanya ke karyawan tenant, bukan
    vendor. Saran "minta konfirmasi vendor" di mockup tidak dibangun karena ELGOS tidak mengirim apa pun ke vendor.
11. **Entitlement**: `ld` terbuka bila tenant punya `full_suite` dan flag `module.ld` menyala (sama dengan B13).
    Peran selain `hr_admin`/`eta_admin` mendapat 403 dari `requireRole`.
12. **Cakupan data karyawan**: `GET /options` dan daftar peserta di detail memakai `scopeFor(req, stores.people)`.
    `GET /options` (nama dan email karyawan) dicatat `audit.readIndividual` dengan resource `ld.options`.

## 5. Endpoint (semua di bawah `requireSubmodule('ld')`, flag `module.ld`, default mati)

| Metode | Path | Isi |
| --- | --- | --- |
| GET | `/api/ld/` | probe modul `{ module, title, tenantId, role }` (dipakai test gerbang) |
| GET | `/api/ld/dashboard` | `{ kpis, insights, actions, generatedBy, today }` |
| GET | `/api/ld/options` | `{ jobRoles, employees, vendorName, storageReady, webhookSync }` untuk form peserta |
| GET | `/api/ld/trainings?state=running\|upcoming\|done\|cancelled&mode=online\|offline` | daftar baris pelatihan + `participants` (angka), `completed`, `failed`, `inactive`, `group`, `progressPct`, `health`, `checks` (4 cek ringkas), `assessmentStatus` |
| POST | `/api/ld/trainings` | tambah pelatihan offline (`sessionCount` bilangan bulat 1–100) |
| GET | `/api/ld/trainings/:id` | detail: semua kolom daftar + `readiness` (cek lengkap), `participantList`, `documents`, `storageReady` |
| PATCH | `/api/ld/trainings/:id` | judul, vendor, tempat, tanggal, `materialsReady`, `sessionCount`, `sessionsDone`, `status`, `moduleId` |
| PUT | `/api/ld/trainings/:id/participants` | `{ userIds }` atau `{ jobRoleId }` (menambah) |
| DELETE | `/api/ld/trainings/:id/participants/:userId` | |
| PUT | `/api/ld/trainings/:id/attendance` | `{ entries: [{ userId, present }] }` atau `{ allPresent: true }` |
| PUT | `/api/ld/trainings/:id/assessment` | `{ mode, assessmentRef? }` |
| PUT | `/api/ld/trainings/:id/scores` | `{ entries: [{ userId, score }] }`, hanya mode `vendor_manual` |
| POST | `/api/ld/trainings/:id/documents?filename&kind` | body mentah; 501 bila storage belum diatur |
| GET | `/api/ld/documents/:id/content` | unduh, diaudit |
| DELETE | `/api/ld/documents/:id` | |
| POST | `/api/ld/trainings/:id/reminders` | kirim pengingat; 201 `{ recipients, sent, failed }` |
| POST | `/api/integrations/elitementor/webhook` | sudah ada; kini diteruskan ke `ld/sync` |

Semua respons sukses dibungkus `{ data: ... }`; `DELETE` menjawab 204. Setiap query memfilter `tenant_id`; ID tenant
lain → 404. Bentuk galat: `{ error: { code, message } }`.

| Status | Kode | Kapan |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | isian tidak valid (tanggal, jumlah sesi, peserta, kehadiran, skor, cara asesmen, jenis/isi berkas, tanpa penerima pengingat) |
| 403 | `NOT_ENTITLED` / `FEATURE_DISABLED` | tenant tanpa `full_suite` / flag `module.ld` mati; `FEATURE_DISABLED` juga untuk asesmen `elitementor` saat `em.webhook_sync` mati |
| 403 | `ROLE_FORBIDDEN` | bukan HR; admin ETA membuka isi dokumentasi |
| 404 | `NOT_FOUND` | pelatihan, peserta, atau dokumen tidak ada di tenant ini |
| 409 | `READ_ONLY_SOURCE` | mengubah data pelatihan `elitementor`/`lms` |
| 409 | `INVALID_TRANSITION` | membuka lagi pelatihan yang dibatalkan |
| 409 | `INVALID_STATE` | skor di luar mode `vendor_manual`; pengingat untuk pelatihan selesai/batal |
| 409 | `ASSESSMENT_REF_TAKEN` | kode asesmen dipakai pelatihan manual aktif lain |
| 409 | `LIMIT_REACHED` | sudah 60 berkas |
| 409 | `REMINDER_RECENT` | pengingat dalam 24 jam terakhir |
| 413 | `FILE_TOO_LARGE` | berkas melebihi `EWI_UPLOAD_MAX_MB` |
| 501 | `STORAGE_NOT_CONFIGURED` | unggah, unduh, atau hapus dokumen tanpa `EWI_UPLOAD_DIR` |
| 400 / 401 | `BAD_PAYLOAD` / tanda tangan | webhook: isi bukan JSON / HMAC salah. Event yang bisa dibaca tetapi tidak dipakai tetap 202 |

## 6. Test yang ditulis lebih dulu

- `tests/unit/ld-domain.test.js`: `health` (late, watch linear, watch offline H-7, ok, tanpa tanggal), `readiness`,
  `assessmentStatus`, `groupOf`, `buildInsights`, `kpis`, `normalizeEvent` (valid, tidak valid).
- Storage (di berkas test yang sama): deteksi tipe dari magic bytes, tolak tipe lain, nama berkas aman, kunci tidak
  bisa keluar dari folder tenant.
- `tests/integration/ld.test.js` (Postgres): tambah pelatihan offline (validasi) → peserta per jabatan (+ cakupan
  `visibleEmployeeScope` di store, audit `ld.options`) → kehadiran → asesmen manual + skor → dokumen unggah/unduh/hapus
  (storage memori), 501 tanpa storage, 413 `FILE_TOO_LARGE`, 409 `LIMIT_REACHED` → daftar per kelompok → dashboard →
  pengingat (mailer memori, batas 24 jam) → webhook: tanda tangan, flag mati diabaikan, tenant tanpa entitlement
  diabaikan, `organizationId` di luar rentang integer diabaikan, idempoten, event terlambat, user tak dikenal, hasil
  asesmen → baris LMS dari katalog (selesai + gagal = tuntas, peserta yang belum pernah aktif dihitung tidak aktif)
  → isolasi tenant → peran non-HR 403 → audit.
- `tests/integration/alur-ld.test.js` (B18, lewat `tests/alur/driver.js`): pelatihan offline sampai skor dan dashboard, pengingat
  kedua 409, peran non-HR 403; webhook `learning.progress` membuat pelatihan online `elitementor`, `assessment.result`
  mengisi skor offline lewat kode asesmen, event ulang tanpa efek, flag/entitlement mati 202 tanpa efek dan tidak dicatat (kiriman ulang setelah pulih diproses).
- `tests/unit/gating.test.js`: `ld` butuh `full_suite` (403 `NOT_ENTITLED`) dan `module.ld` (403 `FEATURE_DISABLED`);
  learner 403. `tests/unit/config.test.js`: rentang `EWI_UPLOAD_MAX_MB`.
- UI (setelah B0): e2e Playwright dengan API mock untuk empat tab, plus menu tersembunyi bila tenant tanpa `full_suite`.

## 7. Daftar perubahan file

Tahap dan titik periksa (tiap tahap bisa di-build dan dites sendiri):
1. Migrasi + flag + env → `npm run migrate` naik-turun-naik.
2. Store + domain + test unit → `tests/unit/ld-domain.test.js`.
3. Router + test integrasi → `tests/integration/ld.test.js`, `tests/unit/gating.test.js`.
4. Webhook → kasus webhook di `ld.test.js`.
5. Layar + e2e → `apps/web/e2e/ld.spec.ts`.

Backend:
- [x] `apps/api/migrations/20261119001400-learning-delivery.js`
- [x] `apps/api/src/core/flags/index.js` (flag `module.ld`)
- [x] `apps/api/src/core/entitlement/index.js` (`FULL_SUITE_ONLY` berisi `li`, `ld`)
- [x] `apps/api/src/config/env.js` (`EWI_UPLOAD_DIR`, `EWI_UPLOAD_MAX_MB`) dan `.env.example`
- [x] `apps/api/src/integrations/storage/index.js`
- [x] `apps/api/src/modules/ld/domain.js`
- [x] `apps/api/src/modules/ld/sync.js`
- [x] `apps/api/src/modules/ld/index.js`
- [x] `apps/api/src/db/ld-stores.js` + sambungan di `apps/api/src/db/lna-stores.js`
- [x] `apps/api/src/db/scope-sql.js` (potongan SQL `visibleEmployeeScope`, dipakai bersama LNA/LI/LD)
- [x] `apps/api/src/app.js` (pasang modul, storage, handler webhook; `stores.elitementorEvents` hanya titik injeksi test)
- [x] `apps/api/src/integrations/elitementor/webhook.js` (JSON rusak dijawab 400)
- [x] `apps/api/tests/unit/ld-domain.test.js`, `apps/api/tests/unit/gating.test.js`, `apps/api/tests/unit/config.test.js`
- [x] `apps/api/tests/integration/ld.test.js`

UI (menumpuk di atas B0):
- [x] `apps/web/src/screens/b14-ld/api.ts`
- [x] `apps/web/src/screens/b14-ld/labels.ts`
- [x] `apps/web/src/screens/b14-ld/routes.ts` (rute `ld`, `meta.flag` + `meta.entitlement`)
- [x] `apps/web/src/screens/b14-ld/LearningDeliveryView.vue` (empat tab)
- [x] `apps/web/src/screens/b14-ld/OfflinePanel.vue`
- [x] `apps/web/e2e/ld.spec.ts`

Dokumen:
- [x] `docs/designs/b18-e2e-qa-malam.md` (baris alur B14 di tabel 3.3)
- [x] `apps/api/tests/integration/alur-ld.test.js` dan langkah `ld` di `apps/api/tests/alur/driver.js` (test alur B18)

## 8. Keputusan triase review egm

Review spek oleh subagen baru (empat lensa) dilakukan sebelum membangun. Diperbaiki (sudah tercermin di atas): course LMS
disimpan sebagai `ld_trainings`; asesmen `elitementor` dikunci flag dan dicocokkan lewat `assessment_ref`; webhook
transaksional, idempoten, memvalidasi rentang, dan mengecek entitlement serta flag; `last_event_at` dipisah dari
`last_activity_at`; tenant dan karyawan harus cocok tepat satu; dokumentasi hanya untuk pelatihan manual, unduh hanya
`hr_admin` dengan header aman; sumber non-manual hanya-baca; batas isian HR menang atas `dueAt`; pengingat diklaim atomik.

Ditolak, dengan alasan:
- `settings.ld.docsVisibleTo`: dihapus dari rancangan. Belum ada layar pengaturan dan belum ada peran lain yang boleh
  melihat foto peserta, jadi pengaturan itu hanya menambah permukaan tanpa pemakai.
- Insight "terhubung ke modul prioritas Pareto" dan saran "minta konfirmasi vendor": tidak dibangun. Yang pertama tidak
  memberi tindakan, yang kedua mengharuskan ELGOS mengirim sesuatu ke vendor.
- Audit per event webhook: ditolak, `ld_sync_events` sudah menjadi catatan dan log audit tidak dibanjiri.

Ditunda (dicatat di PR): hapus EXIF foto, kehadiran per sesi, data LD di ekspor/hapus data karyawan (PK-15), event yang
datang saat flag mati tidak disimpan, angkatan (lebih dari satu pelatihan per `course.ref`), retensi dan dasar hukum
foto (UU PDP), kebutuhan infra (volume `EWI_UPLOAD_DIR`, cadangan, enkripsi disk, pembersihan saat hapus tenant).

### Review diff (subagen baru, setelah kode selesai)

Tidak ada temuan berat. Diperbaiki: batas dari event yang lebih awal dari tanggal mulai isian HR diabaikan (sebelumnya
melanggar CHECK dan membuat webhook gagal terus); kode asesmen yang sudah dipakai pelatihan aktif lain ditolak 409
`ASSESSMENT_REF_TAKEN`; setelah kehadiran dicatat, hanya skor peserta yang hadir yang dihitung; jatah pengingat dilepas
bila tidak ada email yang terkirim; hapus dokumen dijawab 501 bila storage tidak ada (baris tidak dihapus); hanya merek
MP4 yang diterima sebagai video (HEIC, MOV, M4A ditolak); `occurredAt` kosong atau lebih dari 5 menit di depan ditolak.

Ditunda: skor asesmen yang datang sebelum karyawan dijadikan peserta tidak diisi ulang otomatis (tercatat di
`ld_sync_events` sebagai `not_participant_or_stale`); test balapan, batas 60 berkas, dan batas ukuran body.

### Code review (skill `mattpocock-skills:code-review`, dua sumbu, setelah layar selesai)

Sumbu standar: tidak ada pelanggaran CLAUDE.md maupun kontrak B0; label jenis berkas dipindah ke peta `DOC_KIND_LABEL`.
Sumbu spek, diperbaiki: pelatihan offline bisa diubah setelah dibuat (judul, vendor, tempat, tanggal, jumlah sesi, sesi
berjalan); tanggal mulai dan batas pelatihan online bisa diisi dari tab Sedang berjalan; tombol "Ambil skor dari
EliteMentor" terkunci saat flag `em.webhook_sync` mati (`/options` kini mengirim `webhookSync`); tombol kehadiran
disembunyikan untuk pelatihan yang selesai atau batal; catatan "akan datang" di KPI dihapus.

Ditunda: `OfflinePanel` memakai tabel sendiri karena berisi input skor dan tombol per baris; `raw()` di klien `ld`
mengulang logika `api/client.ts` untuk unggah dan unduh berkas (perlu opsi non-JSON di klien bersama).

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

## 9. Batas dengan paket lain

- B13: `ld_trainings.module_id` menunjuk `li_modules`; B14 tidak mengubah tabel B13. Course LMS dipetakan ke modul
  lewat `li_modules.catalog_item_id` (modul pertama menurut `code` bila lebih dari satu); event EliteMentor lewat
  `li_modules.code = course.ref`.
- B15 (Learning Impact Measurement) membaca `ld_trainings` dan `ld_participants` (kehadiran, skor, `score_source`,
  `completed_at`). Skor `vendor_manual` harus ditandai tidak bisa diaudit per jawaban. `ld_participants.user_id`
  memakai `ON DELETE CASCADE`: menghapus akun karyawan menghapus riwayat skornya. Aturan hapus/ekspor data karyawan
  (PK-15) untuk data LD masih ditunda (§8).
- B0: menu dan rute memakai `meta.entitlement = 'full_suite'` dari `/me/access.products` (#18).
- PK-18 katalog: B14 hanya membaca `lna_catalog_items` dan `lna_catalog_completions`.
- Infra: `EWI_UPLOAD_DIR` dan `EWI_UPLOAD_MAX_MB` perlu diisi oleh thread infra; tanpa itu unggah menjawab 501.
