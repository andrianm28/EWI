# Privasi transkrip, hapus dan ekspor data, audit (PK-15)

Ditambahkan 17 Nov 2026. Menutup temuan audit P1-1, P1-12, R-1 dan empat celah dari dokumen legal & privasi POC (PK-17).
Keputusan yang dipakai belum dijawab resmi, jadi memakai rekomendasi ★: PO-6 A, PM-9 A, PD-19 butir 4, PD-15 A.

## Aturan

| Hal | Perilaku |
|---|---|
| Transkrip mentah | Hanya karyawan yang diwawancarai. `GET /{dna,tna}/sessions/:id` mengirim `turns` hanya kepadanya; peran lain menerima status sesi dengan `transcriptVisible: false`. `GET /sessions/:id/transcript` menolak peran lain dengan `403 TRANSCRIPT_PRIVATE`, termasuk Admin ETA. Atasan dan HR melihat temuan. |
| Persetujuan | `POST /sessions/:id/consent` wajib `{ consentVersion }`. Versi berlaku `tna-consent-id-v1.0` (`src/core/consent`, web `src/content/consent.ts`). Tanpa versi `400`, versi lama `409 CONSENT_VERSION_OUTDATED`. Disimpan di `lna_interview_sessions.consent_version`; sesi lama tetap NULL. DNA belum punya teks: `409 CONSENT_TEXT_PENDING`. |
| Audit baca | Transkrip (karyawan sendiri), temuan, rencana, profil DNA, dan kini data kinerja (`tna.performance`). |
| Audit tulis | Persetujuan, rencana training (buat/ubah, termasuk request karyawan), status temuan, posisi karyawan, login password (`auth.password`), hapus karyawan, ekspor. |
| ID dari body | `jobRoleId`/`careerLevelId` di posisi dan kamus kompetensi wajib milik tenant (404/400). ID lain sudah divalidasi sebelumnya. RLS menyusul Desember. |
| Hapus karyawan | `DELETE /api/employees/:userId` (HR tenant yang sama). Tidak untuk akun sendiri atau akun HR/Admin ETA. Audit `delete` ditulis lebih dulu, lalu satu transaksi: baris karyawan dibuang dari batch impor yang belum disimpan, lalu `DELETE FROM users` (FK menghapus data turunan). |
| Ekspor | `GET /api/employees/:userId/export` (JSON `elgos-employee-export-v1`). Karyawan sendiri: semua data termasuk transkrip. HR: tanpa transkrip mentah, temuan non-training hanya bila INA aktif. Atasan dan karyawan lain ditolak. Tercatat dengan aksi `export`. |
| Riwayat impor | Commit sudah mengosongkan `rows`. Job `node scripts/run-job.js import-batches-cleanup` menghapus batch `uploaded` lebih tua dari `IMPORT_BATCH_TTL_DAYS` (bawaan 7) dan mengosongkan sisa `rows` di batch `committed`. |

## Audit log dan hapus user

Migrasi `20261117000502` mengubah trigger `audit_logs_immutable()`: UPDATE diizinkan hanya bila `user_id` berubah dari terisi
menjadi NULL dan tidak ada kolom lain yang berubah (aksi FK `ON DELETE SET NULL`). UPDATE, DELETE, dan TRUNCATE lain tetap
ditolak. Aplikasi tidak pernah menyalakan `ewi.audit_maintenance`.

Aksi FK di Postgres berjalan sebagai pemilik tabel, jadi hapus user tetap jalan untuk role aplikasi yang tidak punya hak
UPDATE di `audit_logs` (B2). Test `tests/integration/privacy-audit.test.js` membuktikannya dengan role non-superuser.

## Kebutuhan untuk thread infra

- Timer systemd di etavm2 (PD-15 A) yang menjalankan `node scripts/run-job.js import-batches-cleanup` sekali sehari di
  kontainer API staging dan prod. Variabel opsional `IMPORT_BATCH_TTL_DAYS`.
