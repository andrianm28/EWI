# B8 · Karyawan: Hasil saya dan Rencana belajar

Status: backend terbangun dan direview egm tahap 5–9 (19 Nov 2026), PR #24. Paket T5 di brief bangun penuh. Dasar kode: PR #11 (privasi: transkrip hanya karyawan, ekspor, hapus oleh HR), PR #12 (undangan 7 hari, status rencana K-3), PR #13 (katalog course, status lulus), PR #16 (rencana hanya dari temuan yang sudah direview).

Penanda: `[⚠️ BELUM TERVERIFIKASI]` = asumsi yang belum dikonfirmasi pemiliknya; `[⏳ DITERIMA]` = kekurangan yang sengaja diterima untuk POC 2 Des, dicatat di PR. Laporan review: `docs/designs/egm/b8/`.

## Tujuan

Karyawan punya satu beranda: skor kompetensinya terhadap target jabatan, penugasan wawancara yang menunggunya, rencana belajar yang sudah disetujui HR, dan kendali atas datanya (baca transkrip sendiri, ekspor, minta hapus, tarik persetujuan).

Bukan tujuan: layar web di PR ini (dibangun di PR lanjutan di atas B0: rute `my` dan `li`, B0 §5.3; paket `my` juga memperbarui helper login e2e),  pemutar belajar EliteMentor (layar `ELITEMENTOR` di mockup adalah produk EliteMentor, bukan ELGOS), wawancara itu sendiri (B6), wawancara visi & nilai (B10).

## Layar mockup yang dicakup

`project/Main.dc.html`:

1. `KARYAWAN: BERANDA` (baris 280–293), logika `myComps` (baris 1830–1834): judul "Hasil saya", posisi, catatan undangan wawancara dengan tombol "Mulai wawancara", tabel `Kode | Kompetensi | Skor vs target | Status` (Menguasai / Sebagian / Belum), kartu "Rencana belajar saya" ("akan muncul di sini setelah HR menyetujui hasil wawancara").
2. `MODUL 2` tampilan karyawan "Rencana belajar" (baris 884–895), logika `liCards` (baris 1739): kartu modul dengan level, mode (Online/Offline), status, deskripsi, tempat belajar, kode, tombol ke EliteMentor.

Tidak ada di mockup tetapi sudah diputuskan dan tetap dibangun (brief aturan 5): tautan transkrip (hanya karyawan, PO-6 A), ekspor data, hapus data, tarik persetujuan (L4, PM-9).

## Data yang sudah ada

- Kompetensi dan skor: `stores.dna.competenciesForPosition`, `stores.dna.assessments`, `computeGap` (`modules/dna/gap.js`, skala 0–4).
- Sesi wawancara: `stores.interviews.list(tenantId, submodule, scope)` dengan `inviteExpiresAt`, `consentVersion`.
- Rencana: `stores.tna.listPlanItems(tenantId, scope)` dengan `catalogItemUrl`, `courseStatus`, `needsModule`. Rencana hanya bisa dibuat dari temuan `approved`/`edited` (PR #16), jadi "setelah HR setuju" sudah terjamin di sumbernya.
- Ekspor: `GET /api/employees/:userId/export` (karyawan sendiri menerima transkrip). Hapus: `DELETE /api/employees/:userId` oleh HR.

## Keputusan default yang dipakai

- **Skor per kompetensi ditampilkan ke karyawan.** Q45 (berlaku) memilih "Ringkasan + rekomendasi", bukan skor lengkap. Mockup Pak Eji (ditetapkan final oleh user 19 Nov 19.27 WIB, `/mnt/project-files/mockup-pak-eji/Main.dc.html`) dan brief T5 meminta "skor vs target". Mengikuti aturan 5 brief, mockup yang dipakai. `[⚠️ BELUM TERVERIFIKASI]` belum dikonfirmasi user bahwa mockup menggantikan Q45; dicatat di PR.
- **Arti tarik persetujuan (diputuskan user 19 Nov, [kartu keputusan di thread T5](https://claude.ai/code/project/chan_01F9v2ybUWTcZVvMHKBsGBDv?thread=cmsg_01F9v2ybUWTcZVvMHKBsGBDvYW3bf7iNfZ5WHcM8dCQprD): "Hanya ditandai, tanpa hapus").** Saat karyawan menarik persetujuan, wawancara berhenti dan sesi diberi tanda ditarik, tetapi datanya **tetap tersimpan** sampai HR menghapusnya sendiri. Tidak ada penghapusan otomatis dan tidak ada tenggat untuk penarikan. HR melihatnya di daftar permintaan (`GET /data-requests`, tanpa notifikasi terpisah) sebagai permintaan `withdraw_consent` yang bisa ia tutup tanpa menghapus, atau tutup sambil menghapus data wawancara itu. Hapus akun tetap permintaan terpisah (`delete_data`). Ini menggantikan default L4 ★ untuk penarikan persetujuan.
- **Tenggat 3×24 jam** (LIN-B23) hanya untuk permintaan hapus data (`delete_data`). Penarikan persetujuan tidak bertenggat.
- **Hanya wawancara TNA.** Wawancara AI DNA ada di balik `dna.ai_interview` dan belum punya teks persetujuan; ikut menyusul.
- **Penyimpangan aturan CLAUDE.md yang perlu persetujuan Andrian:**
  - `/api/my` tidak lewat `requireSubmodule()` karena isinya lintas DNA dan TNA; gantinya flag `learner.home` plus cek per bagian lewat helper baru `submoduleActive({ entitlements, flags }, tenantId, submodule)` (entitlement + flag + kill switch, logika yang sama dengan `requireSubmodule`).
  - `/api/my` tidak memanggil `visibleEmployeeScope()` karena selalu dan hanya data diri sendiri; scope-nya `{ userIds: [req.user.id] }`, sama dengan hasil `visibleEmployeeScope` untuk learner.
  - Permintaan data (tarik persetujuan, minta hapus) tanpa flag, mengikuti ekspor dan hapus PR #11: hak subjek data tidak boleh bergantung pada flag fitur atau kill switch.

## Data dan migrasi

`apps/api/migrations/20261119000800-permintaan-data-karyawan.js` (raw SQL, ada `down`):

```sql
CREATE TABLE data_subject_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type varchar(24) NOT NULL CHECK (type IN ('withdraw_consent','delete_data')),
  status varchar(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','cancelled')),
  reason text,                      -- terenkripsi per tenant
  created_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,               -- delete_data: created_at + 3 hari (LIN-B23); withdraw_consent: NULL
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolution_note text              -- terenkripsi per tenant
);
CREATE UNIQUE INDEX data_subject_requests_open_uniq ON data_subject_requests (tenant_id, user_id, type) WHERE status = 'open';
CREATE INDEX data_subject_requests_tenant_idx ON data_subject_requests (tenant_id, status, created_at);  -- urutan terbaru dulu memakai pindai mundur indeks
ALTER TABLE lna_interview_sessions ADD COLUMN consent_withdrawn_at timestamptz;
```

Tidak ada kolom baru di tabel rencana atau katalog. `lna_catalog_items` belum punya mode online/offline maupun deskripsi; kartu mengirim `mode: null` dan `description: null` sampai B13/B14 menambahkannya `[⏳ DITERIMA]` (web menyembunyikan bagian yang `null`; test integrasi memastikan field ada dan `null`). `lna_competencies` tidak punya kolom kode, jadi `code: null` sampai B4 menambahkannya.

Bergantung pada B7 (branch yang sama): setting `lms.delivery` dan `lms.lmsName`.

## Endpoint A: beranda karyawan (flag `learner.home`)

Router baru `apps/api/src/modules/my/index.js`, dipasang di `/api/my` (hanya bila `stores.dataRequests` ada) di balik `requireFlag(flags, FLAGS.LEARNER_HOME)` (flag baru, default mati; mati → `403 FEATURE_DISABLED`). `createApp` meneruskan `entitlements` ke router.

- Bagian DNA/TNA hanya diisi bila `submoduleActive({ entitlements, flags }, tenantId, key)` benar (helper baru di `core/entitlement/guard.js`: entitlement ada **dan** flag `module.<key>` efektif menyala). Kalau tidak, bagian itu `null`.
- Semua data hanya milik `req.user.id` di `req.tenantId`. Berlaku untuk semua peran: HR dan atasan yang membuka `/api/my` melihat data dirinya sebagai karyawan (K2).

1. `GET /api/my/results`
   ```json
   { "data": {
     "person": { "id", "name", "jobRoleName", "careerLevelName" },
     "competencies": null | { "items": [{ "competencyId", "code": null, "name", "required", "score", "status" }],
                              "summary": { "total", "assessed", "met", "partial", "gaps" } },
     "invitations": null | [{ "sessionId", "submodule": "tna", "status", "inviteExpiresAt", "expired", "canStart", "canContinue", "consentVersionRequired" }],
     "interviews": null | [{ "sessionId", "submodule": "tna", "status", "endedAt", "consentVersion", "consentWithdrawnAt", "transcriptPath" }],
     "plan": null | { "total", "byStatus" },
     "privacy": { "exportPath": "/api/employees/<id>/export", "requestsPath": "/api/employees/me/data-requests", "openRequests": [{ "id", "type", "createdAt", "dueAt" }] }
   } }
   ```
   - Kompetensi: `computeGap` (yang ada) memilih asesmen terbaru per kompetensi; statusnya dipetakan ulang oleh `competencyStatus(score, required)` mengikuti mockup: rasio ≥ 1 → `met` (Menguasai), ≥ 0,75 → `partial` (Sebagian), selain itu `gap` (Belum); belum dinilai → `not_assessed`; `required` 0 → `met`. `summary.partial` dan `summary.gaps` menghitung status masing-masing (jadi `gaps` di sini lebih kecil daripada angka HR yang menghitung semua skor di bawah target). Karyawan tanpa jabatan: `items: []`, sama dengan endpoint DNA. Bukti (`evidence`) asesmen tidak dikirim.
   - `invitations` = sesi TNA milik sendiri berstatus `scheduled`/`in_progress`. `expired` = undangan lewat. `canStart` = `scheduled` dan belum lewat. `canContinue` = `in_progress` (sesi yang sudah berjalan boleh diselesaikan walau undangan lewat, perilaku PR #12).
   - `interviews` = sesi TNA milik sendiri berstatus `completed`, atau `abandoned` yang punya `consent_at` (karyawan berhak membaca transkripnya sampai dihapus). `transcriptPath` = `/api/tna/sessions/<id>/transcript` (hanya sesi TNA).
   - `plan.byStatus` memakai filter yang sama dengan butir 2 (`new`, `in_progress`, `completed`).
   - Audit `readIndividual` `my.results` (self).
2. `GET /api/my/learning-plan` (TNA tidak aktif → `403 FEATURE_DISABLED`)
   ```json
   { "data": [{ "id", "title", "description": null, "level", "mode": null, "code",
                "status", "courseStatus", "courseScore", "reason", "needsModule",
                "where": { "target": "elitementor" | "lms", "label" }, "launchUrl" }],
     "delivery": { "target", "label" } }
   ```
   - Hanya rencana `new`, `in_progress`, `completed`. `requested` dan `rejected` tidak tampil.
   - `title` = judul course; bila rencana belum punya course (`needsModule`) = judul temuan; bila itu pun kosong = "Modul sedang disiapkan". `reason` = judul temuan. `level` = `programTier`. `code` = `catalogItemRef`. `courseScore` = nilai dari `lna_catalog_completions.score` (`listPlanItems` ditambah kolom ini).
   - `where` dari helper bersama B7 `deliveryFor(settings, catalogSource)`:

     | `catalogSource` rencana | `lms.delivery` | `where` |
     | --- | --- | --- |
     | `elitementor` | apa pun | `{ target: 'elitementor', label: 'EliteMentor' }` |
     | sumber lain (mis. `moodle`) | apa pun | `{ target: 'lms', label: lms.lmsName }` |
     | kosong | `elitementor` | `{ target: 'elitementor', label: 'EliteMentor' }` |
     | kosong | `lms_export` | `{ target: 'lms', label: lms.lmsName }` |

   - `launchUrl` = `catalogItemUrl` bila berskema `https:` (atau `http:` di luar produksi); selain itu `null`. Tautan dalam ke EliteMentor lewat SSO ada di balik `em.sso` dan di luar paket ini.
   - Audit `readIndividual` `my.learning_plan` (self).

## Endpoint B: permintaan data (tanpa flag, router `employees`)

Rute `/me/data-requests` dan `/data-requests` didaftarkan **sebelum** `/:userId`. `:id` bukan UUID → `404`. Permintaan yang sudah diproses → `409 INVALID_STATE`.

2b. `GET /api/employees/me/data-requests`: daftar permintaan sendiri `[{ id, type, status, createdAt, dueAt }]`, tanpa flag (hak subjek data tidak bergantung pada beranda). Audit `readIndividual` `my.data_requests` bila ada baris.

3. `POST /api/employees/me/data-requests` body `{ type: 'withdraw_consent' | 'delete_data', reason? }` (`reason` maks 1000 karakter, terenkripsi).
   - `delete_data`: akun HR atau Admin ETA → `409 ADMIN_ACCOUNT` ("Hubungi Admin ETA", sama dengan batasan `DELETE /employees/:userId`). Selain itu mencatat permintaan (`201`). Sudah ada yang `open` → `409 REQUEST_EXISTS` (termasuk bila kalah balapan pada indeks unik).
   - `withdraw_consent`: idempoten. Dalam **satu transaksi**: (a) buat permintaan, atau pakai yang masih `open` (alasan baru diabaikan, alasan pertama tetap); (b) semua sesi wawancara **TNA** sendiri berstatus `scheduled`/`in_progress` menjadi `abandoned` dengan `ended_at = now()` (wawancara DNA tidak tersentuh, lihat "Hanya wawancara TNA"); (c) semua sesi TNA sendiri yang dihentikan di (b) atau pernah disetujui, dan belum bertanda, diberi `consent_withdrawn_at` (sesi `scheduled` yang dihentikan ikut bertanda supaya HR bisa membedakannya dari sesi yang ditinggalkan biasa); (d) job analisis sesi-sesi itu yang belum `done` ditandai `failed` final dengan `last_error = 'CONSENT_WITHDRAWN'`. Respons `201` (baru) atau `200` (permintaan lama, efek sesi dijalankan ulang untuk sesi baru).
   - Audit `create` `my.data_request` `{ employeeIds: [self], type, requestId, sessions: <jumlah sesi terdampak>, objectIds }`. Untuk `withdraw_consent` audit ditulis **di dalam transaksi yang sama**: audit gagal = penarikan batal (aksi ini tidak bisa dibatalkan, jadi tidak boleh terjadi tanpa jejak).
4. `DELETE /api/employees/me/data-requests/:id`: membatalkan permintaan `delete_data` sendiri yang masih `open` (`cancelled`). `withdraw_consent` tidak bisa dibatalkan (`409 CANNOT_CANCEL`): persetujuan yang sudah ditarik tidak pulih; HR bisa mengundang ulang. Milik orang lain → `404`. Audit `update` `my.data_request`.
5. `GET /api/employees/data-requests?status=open|done|cancelled|all` (HR; Admin ETA ikut lolos lewat `requireRole`): `[{ id, userId, userName, type, status, reason, createdAt, dueAt, overdue, resolvedAt, resolvedByName }]`. `overdue` = `open`, `dueAt` terisi, dan `now > dueAt` (penarikan persetujuan tidak pernah terlambat). Audit `readIndividual` `employee.data_requests`.
6. `POST /api/employees/data-requests/:id/fulfill` body `{ note?, erase? }` (`note` dipotong ke 1000 karakter) (HR; pemohon tidak boleh memenuhi permintaannya sendiri → `409 CANNOT_FULFILL_OWN`).
   - `withdraw_consent` dengan `erase` kosong atau `false`: permintaan ditandai `done`, **tidak ada data yang dihapus** (keputusan user). Respons `{ erased: false }`.
   - `withdraw_consent` dengan `erase: true` (penghapusan manual oleh HR): dalam satu transaksi menghapus giliran percakapan (`lna_interview_turns`) semua sesi pemohon yang `consent_withdrawn_at`-nya terisi, menghapus temuan dari sesi-sesi itu (rencana turunannya ikut terhapus lewat FK), mengosongkan `result` job analisisnya, mengosongkan ringkasan temuan B6 di baris sesi (`summary_findings`, `summary_note`, `summary_at`, `summary_confirmed_at`, `summary_disputed`), lalu menandai permintaan `done`. Baris sesi tetap ada (status, tanggal, tanda penarikan). Respons `{ erased: true, deletedTurns, deletedFindings, deletedPlanItems }`.
   - `delete_data`: `409 USE_DELETE_EMPLOYEE`; pemenuhannya adalah `DELETE /api/employees/:userId` yang ada. Endpoint itu kini mencatat `dataRequests: [{ id, type, createdAt }]` yang masih terbuka di audit `delete employee` sebelum barisnya ikut terhapus (FK cascade), sehingga ada bukti permintaan mana dipenuhi kapan.
   - Audit: `update` `employee.data_request` `{ employeeIds, requestId, type, erase }`; bila `erase`, tambahan `delete` `employee.interview_data` `{ employeeIds, requestId, sessionIds }` yang ditulis **sebelum** penghapusan (pola PR #11). Keduanya ditulis di dalam transaksi pemenuhan (`audit.record(..., { transaction })`): bila hapus atau audit gagal, semuanya batal dan tidak ada jejak palsu.

## Aturan baca untuk persetujuan yang ditarik

Sejak `consent_withdrawn_at` terisi (data tetap tersimpan, tetapi tidak diproses lebih lanjut) `[⏳ DITERIMA]` tafsir "wawancara berhenti": yang belum dianalisis dan belum direview tidak diteruskan:

- `analysis.processJob` melewati job yang sesinya ditarik dan menandainya `failed` final `CONSENT_WITHDRAWN`, tanpa panggilan model. Penarikan sendiri mengubah job yang belum selesai menjadi `failed`, sehingga job yang sedang berjalan gagal menyimpan (`lockOwned` di transaksi simpan `saveTna`/`saveDna` menolak). HR tidak bisa mengulang analisisnya (`requeue` menolak).
- Temuan `draft` dari sesi yang ditarik tidak muncul di antrean review dan tidak dihitung di `reviewCounts`; `POST /findings/:id/review|classify` untuk temuan draf dari sesi yang ditarik → `409 CONSENT_WITHDRAWN`.
- Temuan yang sudah disetujui dan rencananya **dibekukan, datanya tetap disimpan** `[✅ DIPUTUSKAN]` (kartu keputusan user 19 Nov). Predikat bersama `apps/api/src/db/frozen-sql.js` (`isFrozen`, `notFrozen`, `planFrozen`) dipakai di semua tindak lanjut: klasifikasi ulang, rencana baru dari HR maupun permintaan karyawan, ubah rencana (`PATCH /plan-items/:id`), penugasan (juga di klaim), dan tindakan Improvement Needs dari temuan (`POST /api/ina/actions`) menjawab `409 CONSENT_WITHDRAWN`; solusi, ekspor CSV, Pareto, papan gap B5 (`findingsForGaps`), gap Learning Intervention (`listTrainingGaps`), dan kontrak B9 `listImprovementHandoffs` menyaring temuan itu (termasuk yang sudah diserahkan sebelum penarikan); serah ke Improvement Needs menjadi `skipped`; impor kelulusan LMS tidak menyelesaikan rencana beku. Status rencana tidak diubah oleh pembekuan. Data hanya hilang bila HR menutup permintaan dengan `erase: true`.
- `[⚠️ BELUM TERVERIFIKASI]` Agregat anonim (angka dashboard, gap teratas asisten) belum menyaring temuan beku; keputusan user tidak menyebutnya. Perlu cek legal (PK-17).
- `interviews.list` dan `get` mengembalikan `consentWithdrawnAt` supaya HR melihatnya.
- Undangan massal (`POST /tna/projects/:id/interviews`) melewati karyawan yang menarik persetujuan di proyek itu dan belum punya sesi baru (`skippedWithdrawn` di respons), kecuali HR mengirim `includeWithdrawn: true`. Sesi yang ditarik tidak menghalangi undangan baru.
- HR tetap bisa mengundang ulang; persetujuan baru di sesi baru berlaku sendiri. Penarikan berikutnya memakai permintaan `open` yang ada atau membuat yang baru (butir 3 idempoten), jadi sesi baru selalu bisa dihentikan.

## Balapan dengan wawancara yang sedang berjalan

Transisi sesi yang ada dibuat bersyarat supaya penarikan tidak tertimpa:

- `POST /sessions/:id/consent`: `stores.interviews.start` = `UPDATE ... WHERE status = 'scheduled' AND consent_withdrawn_at IS NULL`; 0 baris → `409 INVALID_STATE` dan pertanyaan pertama tidak disimpan.
- `POST /sessions/:id/turns`: `addTurn` hanya menyimpan bila sesi masih `in_progress` (`INSERT ... SELECT ... FROM lna_interview_sessions WHERE status = 'in_progress'`); kalau tidak `409 INVALID_STATE`.
- B6 (`summary`, `confirm`, `restart`) memakai penjaga yang sama di `addTurn` (`opts.guard`: ringkasan belum dibuat dan `restart_count` cocok), jadi penarikan di tengah ringkasan juga menghentikan penyimpanan.
- `POST /sessions/:id/complete` sudah bersyarat (`close`). Bila `complete` menang atas penarikan, job yang terbentuk dihentikan oleh aturan baca di atas.

## Aturan bisnis yang dirujuk

- RG-3: karyawan melihat hasilnya sendiri. Q45 lihat "Keputusan default".
- PO-6 A (dijawab 18 Nov): transkrip hanya untuk karyawan yang diwawancarai (endpoint PR #11 dipakai apa adanya).
- PM-9 A: versi persetujuan disimpan; ditampilkan di `interviews`.
- Keputusan user 19 Nov: tarik persetujuan hanya menandai, tanpa hapus. LIN-B23 (3×24 jam) berlaku untuk permintaan hapus data.
- PM-5 A: rencana hanya dari temuan yang sudah direview HR.
- Q38 / PM-8 D: undangan 7 hari.
- K4: tempat belajar dari konfigurasi tenant.

## Alternatif yang dipertimbangkan

| Alternatif | Keputusan | Alasan |
| --- | --- | --- |
| Tarik persetujuan = hapus otomatis dalam 3×24 jam (default L4 ★) | Ditolak | Keputusan user 19 Nov: hanya ditandai, HR menghapus manual |
| Ringkasan + rekomendasi tanpa skor (Q45) | Menunggu konfirmasi | Mockup final meminta skor vs target; dibangun mengikuti mockup, `[⚠️ BELUM TERVERIFIKASI]` |
| Status tarik persetujuan sebagai kolom di sesi saja, tanpa tabel permintaan | Ditolak | HR butuh antrean dengan pemohon, waktu, dan bukti penutupan; tabel yang sama dipakai `delete_data` |
| Endpoint permintaan data di router `/api/my` | Ditolak | `/api/my` di balik flag `learner.home`; hak subjek data tidak boleh bergantung pada flag |
| View atau trigger SQL "sesi aktif" untuk semua jalur baca | Ditolak | Satu konstanta predikat di `lna-stores.js` cukup tanpa objek skema dan `down` tambahan |

## Risiko dan mitigasi

| Risiko | Mitigasi | Status |
| --- | --- | --- |
| Pemrosesan temuan dan rencana yang sudah disetujui berlanjut setelah persetujuan ditarik (UU PDP: penarikan persetujuan mengakhiri pemrosesan) | Dibekukan lewat satu predikat `notFrozen` (keputusan user 19 Nov) | Dibangun; cek legal agregat anonim tetap perlu (PK-17, Fasha) |
| Penarikan terjadi tanpa jejak bila proses mati di antara commit dan audit | Audit di dalam transaksi | Dibangun |
| Hapus manual meninggalkan audit palsu bila transaksi batal | Audit di dalam transaksi pemenuhan | Dibangun |
| `launchUrl` berbahaya dari katalog | Hanya `https:` (atau `http:` di luar produksi) | Dibangun |
| Urutan rute `/me` tertimpa `/:userId` | Rute `/me/*` didaftarkan lebih dulu; test integrasi | Dibangun |
| Hapus akun (`delete_data`) tidak membatalkan penugasan di EliteMentor | Kontrak FR-EM belum final, adapter mati di produksi | `[⏳ DITERIMA]`; ketergantungan B7/FR-EM |
| HR tunggal tidak bisa menutup penarikan miliknya sendiri; akun HR tidak bisa minta hapus lewat sini | Pesan jelas (`CANNOT_FULFILL_OWN`, `ADMIN_ACCOUNT`): hubungi Admin ETA | `[⏳ DITERIMA]` |
| Undang ulang setelah penarikan lewat proyek lain atau penugasan atasan B5 | Undangan massal melewati yang menarik; sesi baru butuh persetujuan baru | `[⏳ DITERIMA]` untuk jalur B5 |

## Test

`apps/api/tests/unit/my-results.test.js`: `competencyStatus` (1,0 / 0,75 / di bawahnya / belum dinilai / required 0), `safeLaunchUrl` (https, http, `javascript:` ditolak), `inviteActions`. `deliveryFor` diuji di `apps/api/tests/unit/review-sla.test.js` (B7).

`apps/api/tests/integration/my-karyawan.test.js` (Postgres):

1. Flag `learner.home` mati → 403. Nyala → kompetensi dengan status benar, penugasan wawancara (`canStart`, `canContinue`, `expired`), wawancara selesai dengan `transcriptPath`, ringkasan rencana.
2. Hanya data sendiri: karyawan lain tidak pernah muncul; HR yang membuka `/my/results` melihat datanya sendiri.
3. DNA berhak tetapi flag mati → `competencies: null`; TNA flag nyala tetapi tidak berhak → bagian TNA `null` dan `/my/learning-plan` 403.
4. Rencana belajar: `requested`/`rejected` tidak tampil; `where`, `launchUrl`, `courseScore`, judul pengganti; `mode` dan `description` `null`.
5. Tarik persetujuan: sesi terbuka → `abandoned`; sesi DNA tidak tersentuh; `consent_withdrawn_at` terisi; job antre → `failed` `CONSENT_WITHDRAWN` dan penyedia AI tidak dipanggil; draf keluar dari antrean; `review`/`classify` draf → 409; panggilan kedua 200 tanpa permintaan ganda; tidak bisa dibatalkan; `consent` dan `turns` pada sesi yang ditarik → 409; undangan massal melewati yang menarik; audit gagal → tidak ada yang berubah.
6. Pemenuhan: HR melihat daftar (`overdue` hanya untuk `delete_data`); tenant lain tidak melihat dan mendapat 404 saat memenuhi; pemohon tidak bisa memenuhi sendiri; `fulfill` tanpa `erase` menutup permintaan dan data tetap ada; audit penutupan gagal → hapus batal tanpa jejak; `fulfill` dengan `erase: true` menghapus giliran, temuan, rencana, dan ringkasan B6 sesi itu, akun tetap; atasan dan karyawan lain 403.
7. `delete_data`: buat, 409 ganda, daftar sendiri lewat `GET /me/data-requests` walau `learner.home` mati, batalkan; milik orang lain 404; akun HR → `ADMIN_ACCOUNT`; `DELETE /employees/:id` mencatat `dataRequests` di audit.
8. Migrasi naik-turun-naik dijalankan CI (`.github/workflows/ci.yml`).

## Daftar perubahan file

- [x] `docs/designs/b8-karyawan.md`, laporan `docs/designs/egm/b8/`
- [x] `apps/api/migrations/20261119000800-permintaan-data-karyawan.js`
- [x] `apps/api/src/core/flags/index.js` (flag `learner.home`)
- [x] `apps/api/src/core/entitlement/guard.js` (`submoduleActive`)
- [x] `apps/api/src/modules/my/index.js` (baru: router), `apps/api/src/modules/my/view.js` (baru: fungsi murni)
- [x] `apps/api/src/modules/employees/index.js` (permintaan data, `GET /me/data-requests`, audit di dalam transaksi; audit `dataRequests` saat hapus)
- [x] `apps/api/src/core/audit/index.js`, `apps/api/src/db/stores.js` (`audit.record(..., { transaction })`)
- [x] `apps/api/src/modules/interviews/index.js`, `apps/api/src/modules/interviews/analysis.js` (transisi bersyarat, lewati sesi yang ditarik)
- [x] `apps/api/src/modules/tna/index.js` (`CONSENT_WITHDRAWN` di review; undangan massal `includeWithdrawn`/`skippedWithdrawn`), `apps/api/src/modules/tna/review-workspace.js` (classify)
- [x] `apps/api/src/db/lna-stores.js` (`dataRequests.*`, `interviews.start`, `interviews.update` bersyarat, `addTurn` bersyarat, `withdrawConsent`, `resolveWithdrawal`, `withdrawnFor`, `openFor`, `analysis.requeue`, nama jabatan/jenjang, `courseScore`, filter antrean)
- [x] `apps/api/src/app.js` (pasang `/api/my`, teruskan `entitlements`)
- [x] `apps/api/tests/unit/my-results.test.js`, `apps/api/tests/integration/my-karyawan.test.js`
- [x] `apps/web/src/api/lna.ts` (flag dan tipe)
- [ ] `apps/web/src/screens/b8-karyawan/` (rute `my`, `li`), helper login e2e, e2e

Catatan triase awal dipindahkan ke `docs/designs/egm/b8/triase-awal.md`; hasil egm-resolve di `docs/designs/egm/b8/goldfish_review_report.md`.

Reviewer Andrian (aturan 7): migrasi, `app.js`, flags, `lna-stores.js`, `core/entitlement`.
