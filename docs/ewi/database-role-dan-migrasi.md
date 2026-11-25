# Role database, kesiapan, dan pola migrasi ELGOS

Paket PK-07 (sisi aplikasi). Menutup P1-7 (sisi aplikasi), I-6, I-5, R-3, dan menuliskan pola migrasi dua langkah (PD-19 butir 8). Sisi server (membuat role di Postgres etavm2, mengisi `.env`, deploy memakai `/api/ready`) dikerjakan di `deploy/` oleh pemilik infra.

## 1. Dua user database (PD-8 opsi A)

| Peran | Variabel | Hak |
|---|---|---|
| Pemilik schema (migrasi) | `DB_MIGRATION_USER`, `DB_MIGRATION_PASSWORD` | Pemilik schema `ewi` dan semua tabelnya. Menjalankan `npm run migrate`, `ensure-schema`, `migrate:undo`, `db:grant-app`. Bukan superuser. |
| Aplikasi (API) | `DB_USER`, `DB_PASSWORD` (dirakit jadi `DATABASE_URL` oleh `docker-entrypoint.sh`) | `SELECT, INSERT, UPDATE, DELETE` pada tabel bisnis. Tanpa DDL. `audit_logs` hanya `SELECT, INSERT`. `sequelize_meta` hanya `SELECT`. |

Cara kerjanya di kode:

- `src/db/urls.js`: migrasi memakai `MIGRATION_DATABASE_URL` bila diisi; bila tidak, `DATABASE_URL` dengan user dan password diganti `DB_MIGRATION_USER` dan `DB_MIGRATION_PASSWORD`. Host, nama database, dan opsi TLS tetap sama. Bila keduanya kosong (dev lokal, CI), migrasi memakai user yang sama dengan aplikasi.
- Migrasi `20261117000200-app-role-grants.js` memberi hak ke role aplikasi (`DB_APP_ROLE`, atau `DB_USER`). Bila role aplikasi sama dengan user migrasi, migrasi ini tidak mengubah apa pun. Default privileges ikut dipasang, jadi tabel baru dari migrasi berikutnya otomatis mendapat DML yang sama. Tabel audit baru harus ditambahkan ke `AUDIT_TABLES` di `src/db/app-role.js` lalu `npm run db:grant-app` dijalankan.
- `npm run db:grant-app` menerapkan ulang hak yang sama (aman diulang). Pakai bila role aplikasi dibuat setelah migrasi 20261117000200 sudah jalan.
- Saat boot, API memeriksa apakah ia tersambung sebagai superuser. `DB_REQUIRE_NON_SUPERUSER=true` membuat API menolak boot. Tanpa flag itu, produksi hanya menulis peringatan `P1-7` ke log.

Membuat role di server (sekali, oleh pemilik infra sebagai superuser Postgres; password dari generator, simpan di `/srv/elgos-<env>/.env`):

```sql
CREATE ROLE elgos_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '<acak>';
CREATE ROLE elgos_app   LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '<acak>';
ALTER DATABASE elgos OWNER TO elgos_owner;
ALTER SCHEMA ewi OWNER TO elgos_owner;            -- bila schema sudah ada
-- tabel, sequence, dan fungsi lama milik superuser bawaan container: pindahkan ke elgos_owner
-- (REASSIGN OWNED tidak bisa dipakai karena superuser bawaan juga memiliki objek sistem)
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT format('ALTER TABLE ewi.%I OWNER TO elgos_owner', tablename) AS s FROM pg_tables WHERE schemaname = 'ewi'
    UNION ALL SELECT format('ALTER SEQUENCE ewi.%I OWNER TO elgos_owner', sequencename) FROM pg_sequences WHERE schemaname = 'ewi'
    UNION ALL SELECT format('ALTER FUNCTION ewi.%I(%s) OWNER TO elgos_owner', p.proname, pg_get_function_identity_arguments(p.oid))
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'ewi'
  LOOP EXECUTE r.s; END LOOP;
END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
```

Lalu isi `.env`: `DB_USER=elgos_app`, `DB_PASSWORD=...`, `DB_MIGRATION_USER=elgos_owner`, `DB_MIGRATION_PASSWORD=...`, `DB_REQUIRE_NON_SUPERUSER=true`, kemudian `npm run migrate` (menerapkan hak) atau `npm run db:grant-app`.

Catatan untuk alur hapus user (B5/PK-15): aksi foreign key `ON DELETE SET NULL` dari `users` ke `audit_logs` berjalan sebagai pemilik tabel, jadi hak UPDATE yang dicabut dari role aplikasi tidak memblokirnya. Penolakan yang ada sekarang datang dari trigger append-only. Ini dibuktikan di `tests/integration/db-app-role.test.js`.

## 2. Kesehatan dan kesiapan (I-6)

| Endpoint | Isi | Dipakai untuk |
|---|---|---|
| `GET /api/health` | Selalu 200 bila proses hidup. Tanpa I/O. | Healthcheck container (liveness). |
| `GET /api/ready` | 200 `{"status":"ready","checks":{"database":"ok","encryption":"ok"}}` hanya bila `SELECT 1` ke database berhasil dan penyedia enkripsi bisa membuka satu kunci tenant tersimpan. Selain itu 503 `not_ready`, dengan pemeriksaan yang gagal bernilai `gagal`. | Keputusan deploy berhasil atau rollback (`deploy.sh`), pemantau uptime. |

- Pemeriksaan enkripsi: dengan KMS, memanggil `Decrypt` pada DEK tenant terbaru (memastikan kredensial IAM, izin, dan region benar). Dengan kunci lokal, membuka DEK tersimpan (memastikan `EWI_LOCAL_MASTER_KEY` benar), atau uji bungkus-buka bila belum ada tenant. Hasil sukses di-cache 30 detik. Kegagalan tidak di-cache.
- Tiap pemeriksaan dibatasi 3 detik. Pesan error hanya ke log (`[ready] ...`), tidak ke respons publik.

## 3. Email staging (I-5)

`MAIL_ALLOWED_DOMAINS` (dipisah koma, subdomain ikut) membatasi penerima. Email ke domain lain tidak dikirim, tidak melempar error, dan hanya dicatat `[mail:diblokir]` tanpa isi email. Dengan `EWI_ENV=staging` dan variabel kosong, daftar bawaan adalah `eliteacademy.id,elitery.com`. Nilai `*` ditolak di staging.

## 4. Pengaman turun migrasi (R-3)

Turunkan migrasi hanya lewat `npm run migrate:undo` (satu terakhir), `npm run migrate:undo:all`, atau `node scripts/migrate-undo.js --to <berkas>`. Skrip memeriksa daftar `GUARDS` di `src/db/undo-guard.js` sebelum memanggil sequelize-cli.

- `20261113000008-tenant-keys.js` ditolak (kode keluar 2) bila ada baris `tenant_keys` atau nilai berawalan `enc:` di kolom terenkripsi atau `import_batches.rows`. Arah turunnya menghapus DEK terbungkus, jadi data terenkripsi tidak bisa dibaca lagi. Untuk kembali ke versi sebelum enkripsi, pulihkan dari backup.
- Jangan memanggil `sequelize-cli db:migrate:undo` langsung di staging atau produksi.

## 5. Pola migrasi dua langkah (PD-19 butir 8)

Deploy mengganti container setelah migrasi selesai, jadi selama beberapa detik kode lama berjalan di atas skema baru, dan saat rollback kode lama berjalan lagi. Karena itu setiap migrasi harus bisa dipakai kode versi sebelumnya.

**Langkah 1, expand (rilis N):** hanya menambah.
- Tambah tabel atau kolom baru sebagai nullable atau dengan default. Tambah index dengan `CREATE INDEX CONCURRENTLY` di migrasi terpisah bila tabelnya besar.
- Kode rilis N menulis ke kolom lama dan baru, dan membaca dari yang lama (atau yang baru dengan fallback).
- Isi data lama lewat skrip sekali jalan yang idempoten (`node scripts/...`), bukan di dalam migrasi bila datanya besar.

**Langkah 2, contract (rilis N+1 atau setelahnya, setelah N stabil di produksi):**
- Kode hanya memakai kolom baru.
- Migrasi menghapus kolom lama, mengubah `NULL` menjadi `NOT NULL`, atau mengganti nama.

Yang tidak boleh dalam satu rilis: mengganti nama atau menghapus kolom yang masih dibaca kode lama, mengubah tipe kolom yang mengecilkan data, atau `NOT NULL` tanpa default pada tabel berisi.

Aturan lain:
- Setiap migrasi punya `down` dan lolos naik-turun-naik di CI.
- Migrasi yang `down`-nya merusak data (menghapus kolom berisi, kunci, atau mengecilkan tipe) wajib didaftarkan di `GUARDS`.
- Deploy produksi yang membawa migrasi dijalankan di luar jam wawancara karyawan, dan backup dibuat sebelum migrasi (sudah dilakukan `deploy.sh`).
- Nomor migrasi `YYYYMMDDNNNNNN-nama.js`. Thread paralel memakai blok nomor masing-masing.
