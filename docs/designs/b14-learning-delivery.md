# B14 · Learning Delivery (modul `ld`)

Status: spek untuk review egm · 19 Nov 2026 · paket B14 dari `brief-bangun-penuh-19nov.md` (thread T8).
Acuan layar: mockup Pak Eji, layar `ld` dengan tab Ringkasan, Sedang berjalan, Akan datang, Pelatihan offline.
Bergantung pada B13 (`li_modules`) dan PR #13 (`lna_catalog_items`, `lna_catalog_completions`).

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
| Pelatihan offline | Daftar + form tambah; detail: kelengkapan data, peserta + kehadiran, asesmen, dokumentasi + catatan UU PDP | `POST /api/ld/trainings`, `GET/PATCH /api/ld/trainings/:id`, `PUT .../participants`, `PUT .../attendance`, `PUT .../assessment`, `PUT .../scores`, `POST .../documents`, `GET/DELETE /api/ld/documents/:id` |

Semua endpoint hanya untuk `hr_admin` (dan `eta_admin`). Di mockup atasan dan karyawan tidak punya menu ini.

## 3. Data dan migrasi

Blok migrasi 14: `20261119001400-learning-delivery.js` (raw SQL, punya `down`). Semua tabel punya `tenant_id`.

| Tabel | Kolom penting |
| --- | --- |
| `ld_trainings` | `title`, `mode` (`online`/`offline`), `source` (`elgos`/`elitementor`/`lms`/`manual`), `external_ref` (unik per tenant+source bila terisi), `module_id` → `li_modules`, `program_tier`, `vendor_name`, `venue`, `starts_on`, `ends_on` (batas), `session_count`, `sessions_done`, `status` (`scheduled`/`running`/`done`/`cancelled`), `materials_ready`, `assessment_mode` (`none`/`elitementor`/`vendor_manual`), `last_reminded_at`, `created_by` |
| `ld_participants` | `training_id`, `user_id` (unik per pelatihan), `progress_pct` 0–100, `status` (`enrolled`/`in_progress`/`completed`/`failed`), `attendance` (null/true/false) + siapa dan kapan mencatat, `score`, `score_source` (`elitementor`/`lms`/`vendor_manual`), `last_activity_at`, `completed_at` |
| `ld_documents` | `training_id`, `kind` (`material`/`photo`/`video`), `filename`, `mime`, `size_bytes`, `storage_key`, `uploaded_by` |
| `ld_sync_events` | `source`, `event_id` (unik per tenant+source), `type`, `result` (jsonb), `received_at` — idempotensi webhook |

Kehadiran dan skor adalah data individu: `GET /trainings/:id` dicatat dengan `audit.readIndividual`, semua perubahan
dengan `audit.record`. Skor disimpan sebagai angka terbuka (sama seperti `lna_catalog_completions.score`).

### Pelatihan online dari LMS klien (tanpa webhook)

Baris "sedang berjalan" untuk LMS diturunkan saat baca dari `lna_catalog_completions` per `lna_catalog_items`
(PR #13): peserta = jumlah baris, progres = persen `passed`. Baris ini hanya-baca (id `catalog:<uuid>`), tanpa batas
waktu, sehingga statusnya selalu "sesuai jadwal" kecuali semua lulus (tidak ditampilkan lagi sebagai berjalan).

### Pelatihan online dari EliteMentor (webhook, flag `em.webhook_sync`)

`modules/ld/sync.js` menjadi `handler` untuk `webhookRouter` yang sudah ada (verifikasi HMAC tidak diubah). Kontrak
event yang diusulkan:

```json
{ "id": "evt-123", "type": "learning.progress", "organizationId": 42,
  "course": { "ref": "ST-B4", "title": "Ticket Life Cycle", "programTier": "basic", "dueAt": "2026-12-15" },
  "user": { "email": "a@klien.co.id", "elitementorUserId": 7 },
  "progressPct": 78, "status": "in_progress", "score": null, "occurredAt": "2026-11-20T03:00:00Z" }
```

`type: "assessment.result"` memakai bentuk yang sama, ditambah `trainingId` (id `ld_trainings` pelatihan offline yang
asesmennya dijalankan lewat EliteMentor) dan `score`.

Pemrosesan:
1. Tenant dicari dari `tenants.elitementor_organization_id = organizationId`. Tidak ketemu → diabaikan.
2. Flag `em.webhook_sync` **dan** `module.ld` harus menyala untuk tenant itu; bila tidak, event diabaikan (tetap 202).
3. Idempoten: `ld_sync_events (tenant_id, source, event_id)`; event yang sudah ada tidak diproses ulang.
4. `learning.progress`: upsert `ld_trainings` (`source = elitementor`, `external_ref = course.ref`, `mode = online`,
   `status = running`; `module_id` diisi bila ada `li_modules.code = course.ref`). Karyawan dicari di tenant itu lewat
   `elitementor_user_id`, lalu email. Tidak ketemu → dilewati dan dicatat di `result`. Upsert peserta; pembaruan
   diterapkan hanya bila `occurredAt` ≥ `last_activity_at` (event terlambat tidak menimpa data baru).
5. `assessment.result`: pelatihan harus milik tenant itu dan `assessment_mode = elitementor`; skor peserta diisi
   dengan `score_source = elitementor`. Selain itu dilewati.
6. Payload tidak valid → dicatat sebagai `invalid` dan dijawab 202 (EliteMentor tidak perlu mengulang).

`[⚠️ BELUM TERVERIFIKASI]` Kontrak event ini belum disepakati dengan tim EliteMentor (FR-EM terbuka). Handler
ditulis di balik satu fungsi `normalizeEvent` agar perubahan bentuk payload hanya menyentuh satu tempat. Sampai
kontrak disepakati, flag `em.webhook_sync` tetap mati dan data online berasal dari impor LMS.

### Dokumentasi (unggah berkas)

Repo belum punya penyimpanan berkas (impor menyimpan baris di DB). Paket ini menambah port `storage`
(`integrations/storage`): `put(key, buffer)`, `get(key)`, `remove(key)`, dengan adapter disk lokal di
`EWI_UPLOAD_DIR` (kunci `<tenantId>/<uuid>`) dan adapter memori untuk test. Bila `EWI_UPLOAD_DIR` kosong, unggah
menjawab 501 `STORAGE_NOT_CONFIGURED`; bagian lain tetap berjalan.

- Batas: `EWI_UPLOAD_MAX_MB` (default 25). Tipe: JPEG, PNG, WebP, MP4, PDF (PDF hanya untuk `material`). Tipe dicek
  dari tanda tangan isi berkas (magic bytes), bukan hanya nama.
- Unggah: body mentah + `?filename=&kind=`, sama dengan pola impor.
- Unduh hanya lewat API (`GET /api/ld/documents/:id/content`), HR saja, dicatat audit. Tidak ada URL publik.
- Hapus menghapus berkas dan barisnya. Menghapus tenant menghapus baris (CASCADE); berkas di disk dibersihkan oleh
  runbook hapus tenant (ditulis sebagai kebutuhan infra di PR).
- `[⏳ DITERIMA]` Berkas tidak dienkripsi per tenant di tingkat aplikasi; mengandalkan enkripsi disk VPS dan izin
  folder. Kebutuhan infra (volume, cadangan, enkripsi) ditulis di PR untuk thread infra. Test integrasi memastikan
  berkas tenant lain tidak bisa diunduh.
- Catatan UU PDP di layar mengikuti mockup. Pengaturan akses dokumentasi per tenant: `settings.ld.docsVisibleTo`
  (default `["hr_admin"]`); peran lain belum didukung di paket ini.

## 4. Aturan bisnis

1. **Tambah pelatihan offline**: `title` dan `startsOn` wajib (400 dengan pesan "Isi judul dan tanggal").
   `vendorName` default `settings.li.vendorName` (K4). Tanggal memakai format ISO `YYYY-MM-DD` dari UI (pemilih
   tanggal), bukan teks bebas seperti di mockup.
2. **Peserta**: ditambah lewat `userIds` atau `jobRoleId` (semua karyawan aktif di jabatan itu). Hanya karyawan tenant
   yang sama. Menghapus peserta menghapus kehadiran dan skornya.
3. **Kehadiran**: per peserta `true`/`false`/`null`, atau `allPresent: true`. Pencatat dan waktu disimpan.
4. **Asesmen** (pelatihan offline): `none` → pilih `elitementor` (skor masuk lewat webhook; status `link_sent` sampai
   ada skor, lalu `synced` bila semua peserta yang hadir punya skor) atau `vendor_manual` (HR mengisi skor 0–100 per
   peserta; status `manual`). Mengganti mode ke `none` tidak menghapus skor yang sudah ada. Skor manual ditandai
   `score_source = vendor_manual` dan layar memberi catatan "tidak bisa diaudit per jawaban" (mockup).
   ELGOS tidak mengirim tautan ke EliteMentor di paket ini; `elitementor` hanya menandai bahwa skor ditunggu dari
   webhook. `[⏳ DITERIMA]` Pengiriman tautan asesmen butuh endpoint EliteMentor yang belum ada.
5. **Kelengkapan data** (fungsi murni `readiness(training, counts)`): Jadwal dan tempat (tanggal + tempat), Materi
   (`materials_ready` atau ada dokumen `material`), Daftar peserta (≥ 1), Daftar kehadiran (semua tercatat), Asesmen
   dan hasil (lengkap bila `synced`/`manual` dengan semua skor; menunggu bila `link_sent`), Dokumentasi (≥ 1 foto
   atau video; tidak wajib). Tab "Akan datang" memakai empat cek pertama versi ringkas: Jadwal, Materi, Peserta,
   Asesmen (asesmen dianggap siap bila mode sudah dipilih).
6. **Status pelatihan berjalan** (fungsi murni `health(training, today)`):
   - `late`: `ends_on` sudah lewat dan progres < 100.
   - `watch`: progres tertinggal > 15 poin dari progres linear antara `starts_on` dan `ends_on`; atau offline yang
     mulai ≤ 7 hari lagi dengan kelengkapan (Jadwal, Materi, Peserta, Asesmen) belum penuh.
   - selain itu `ok`.
   Progres online = rata-rata `progress_pct` peserta. Progres offline = `sessions_done / session_count`.
   `today` dihitung di zona waktu Asia/Jakarta.
7. **Kelompok daftar**: `running` = status `running`, atau `scheduled` dengan `starts_on ≤ today`; `upcoming` =
   `scheduled` dengan `starts_on > today`; `done`. Pelatihan offline ditandai `done` oleh HR.
8. **KPI ringkasan**: program berjalan (dengan rincian online/offline), peserta aktif (karyawan unik yang belum
   selesai di pelatihan berjalan), rata-rata progres antar program, perlu perhatian (`watch` + `late`).
9. **Insight dan saran tindakan** (fungsi murni `buildInsights`), dibuat dari aturan, bukan LLM:
   - pelatihan `late` → saran "Kirim pengingat" (`remind`);
   - peserta online tanpa aktivitas ≥ 14 hari → saran `remind`;
   - offline mulai ≤ 14 hari tanpa asesmen atau tanpa peserta → saran "Buka pelatihan" (`open_training`);
   - pelatihan yang terhubung ke modul prioritas Pareto (B13) → insight "pastikan peserta hadir".
   Respons memuat `generatedBy: "rules"`.
   `[⏳ DITERIMA]` Mockup menamai kartu ini "Insight AI". Isinya di paket ini berbasis aturan, jadi UI menulis
   "Insight" dengan keterangan "dari data pelatihan" sampai narasi LLM ditambahkan. Menyebut hasil aturan sebagai AI
   ke klien dinilai menyesatkan; keputusan akhir di user.
10. **Pengingat**: `POST /trainings/:id/reminders` mengirim email lewat `mailer` yang ada ke peserta yang belum
    selesai, paling sering sekali per 24 jam per pelatihan (409 `REMINDER_RECENT`), dicatat audit dengan jumlah
    penerima. Hanya untuk pelatihan yang tersimpan (bukan baris `catalog:`). Email hanya ke karyawan tenant, bukan
    vendor. Saran "minta konfirmasi vendor" di mockup tidak dibangun karena ELGOS tidak mengirim apa pun ke vendor.
11. **Entitlement**: `ld` terbuka bila tenant punya `full_suite` dan flag `module.ld` menyala (sama dengan B13).

## 5. Endpoint (semua di bawah `requireSubmodule('ld')`, flag `module.ld`, default mati)

| Metode | Path | Isi |
| --- | --- | --- |
| GET | `/api/ld/dashboard` | `{ kpis, insights, actions, generatedBy }` |
| GET | `/api/ld/trainings?state=running\|upcoming\|done&mode=online\|offline` | daftar dengan `participants`, `progressPct`, `health`, `readiness` ringkas |
| POST | `/api/ld/trainings` | tambah pelatihan offline |
| GET | `/api/ld/trainings/:id` | detail: `readiness`, `participants`, `assessment`, `documents` |
| PATCH | `/api/ld/trainings/:id` | judul, vendor, tempat, tanggal, `materialsReady`, `sessionCount`, `sessionsDone`, `status`, `moduleId` |
| PUT | `/api/ld/trainings/:id/participants` | `{ userIds }` atau `{ jobRoleId }` (menambah) |
| DELETE | `/api/ld/trainings/:id/participants/:userId` | |
| PUT | `/api/ld/trainings/:id/attendance` | `{ entries: [{ userId, present }] }` atau `{ allPresent: true }` |
| PUT | `/api/ld/trainings/:id/assessment` | `{ mode }` |
| PUT | `/api/ld/trainings/:id/scores` | `{ entries: [{ userId, score }] }`, hanya mode `vendor_manual` |
| POST | `/api/ld/trainings/:id/documents?filename&kind` | body mentah; 501 bila storage belum diatur |
| GET | `/api/ld/documents/:id/content` | unduh, diaudit |
| DELETE | `/api/ld/documents/:id` | |
| POST | `/api/ld/trainings/:id/reminders` | kirim pengingat |
| POST | `/api/integrations/elitementor/webhook` | sudah ada; kini diteruskan ke `ld/sync` |

Pelatihan dari webhook (`source = elitementor`) hanya-baca untuk kolom yang dikirim EliteMentor; HR tetap boleh
mengisi `moduleId` dan `endsOn`. Setiap query memfilter `tenant_id`; ID tenant lain → 404.

## 6. Test yang ditulis lebih dulu

- `tests/unit/ld-domain.test.js`: `health` (late, watch linear, watch offline H-7, ok, tanpa tanggal), `readiness`,
  `assessmentStatus`, `groupOf`, `buildInsights`, `kpis`, `normalizeEvent` (valid, tidak valid).
- `tests/unit/storage.test.js`: deteksi tipe dari magic bytes, tolak tipe lain, batas ukuran, kunci tidak bisa keluar
  dari folder tenant.
- `tests/integration/ld.test.js` (Postgres): tambah pelatihan offline (validasi) → peserta per jabatan → kehadiran →
  asesmen manual + skor → dokumen unggah/unduh/hapus (storage memori) dan 501 tanpa storage → daftar per kelompok →
  dashboard → pengingat (mailer memori, batas 24 jam) → webhook: tanda tangan, flag mati diabaikan, idempoten, event
  terlambat, user tak dikenal, hasil asesmen → baris LMS dari katalog → isolasi tenant → peran non-HR 403 → audit.
- UI (setelah B0): e2e Playwright dengan API mock untuk empat tab.

## 7. Daftar perubahan file

Backend:
- [ ] `apps/api/migrations/20261119001400-learning-delivery.js`
- [ ] `apps/api/src/core/flags/index.js` (flag `module.ld`)
- [ ] `apps/api/src/core/settings/index.js` (`ld.docsVisibleTo`)
- [ ] `apps/api/src/config/env.js` (`EWI_UPLOAD_DIR`, `EWI_UPLOAD_MAX_MB`)
- [ ] `apps/api/src/integrations/storage/index.js`
- [ ] `apps/api/src/modules/ld/domain.js`, `sync.js`, `index.js`
- [ ] `apps/api/src/db/ld-stores.js` + sambungan di `db/lna-stores.js`
- [ ] `apps/api/src/app.js` (pasang modul, storage, handler webhook)
- [ ] test di bagian 6

UI (menumpuk di atas B0):
- [ ] `apps/web/src/api/ld.ts`
- [ ] `apps/web/src/views/ld/LearningDeliveryView.vue` + komponen tab
- [ ] rute + menu di shell B0
- [ ] `apps/web/e2e/ld.spec.ts`

## 8. Keputusan triase review egm

Lihat bagian "Review egm" di deskripsi PR; temuan yang ditolak dicatat di sini.
