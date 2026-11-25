# Runbook: onboarding tenant ELGOS

Paket PK-13, menutup P0-5. Membuat tenant baru tanpa SQL manual: tenant, kunci enkripsi tenant, akun HR dan Admin ETA, entitlement, flag, dan pengaturan klien. Skrip aman dijalankan ulang; yang sudah ada tidak digandakan.

Asumsi keputusan (★, belum dijawab user per 17 Nov): PD-19 butir 6 (UUID tenant ditentukan dulu di Terraform, lalu dipakai skrip), PM-12 A (tenant uji internal terpisah dari tenant HR Elitery).

## Yang dibutuhkan

- Akses shell ke container API di lingkungan tujuan (env API sudah lengkap: `DATABASE_URL`, `ENCRYPTION_PROVIDER`, `KMS_KEY_ALIAS_PREFIX`, `MAIL_*`, `APP_BASE_URL`).
- Staging/produksi: akses `terraform apply` untuk `infra/live/<env>` (milik thread infra).

## Langkah

1. **Buat UUID tenant.** `node apps/api/scripts/onboard-tenant.js --uuid-baru`
2. **Buat kunci KMS (staging/produksi).** Tambahkan UUID itu ke `tenant_ids` di `infra/live/<env>/main.tf`, lalu `terraform apply`. Hasilnya alias `alias/elgos-<env>-tenant-<uuid>`. Lewati langkah ini di dev lokal (`ENCRYPTION_PROVIDER=local`).
3. **Tulis spesifikasi.** Salin `apps/api/scripts/tenants/uji-internal.example.json` atau `hr-elitery.example.json` menjadi `<slug>.json` di folder yang sama (berkas selain `*.example.json` diabaikan git karena berisi email orang). Isi `id` dengan UUID langkah 1.

   | Kolom | Isi |
   |---|---|
   | `id` | UUID dari Terraform. Wajib bila memakai KMS. |
   | `slug`, `name` | Slug login (huruf kecil, angka, tanda hubung) dan nama organisasi. Slug tidak bisa diganti lewat skrip. |
   | `products` | `full_suite` atau sebagian dari `cca`, `dna`, `tna`, `ina`. Boleh kosong (B12): modul lalu dinyalakan per tenant dari konsol Super Admin. |
   | `flags` | Daftar flag yang dinyalakan, atau objek `{ "flag": true/false }`. Flag yang tidak disebut tetap mati. POC: `module.dna`, `module.tna`. |
   | `users` | Akun pengelola: minimal satu `tenant_admin` (wajib sejak masa interim `hr_admin` dicabut 24 Nov), lalu opsional `hr_admin`, `eta_admin`, `pimpinan`. Karyawan masuk lewat impor, bukan di sini. |
   | `settings` | Opsional, digabung di tingkat atas, mis. `{ "tna": { "interviewScope": "all_members", "interviewJobRoleId": "..." } }`. |

4. **Periksa tanpa menyimpan.** `node apps/api/scripts/onboard-tenant.js apps/api/scripts/tenants/<slug>.json --periksa`. Semua langkah dijalankan lalu dibatalkan. Di sini kunci KMS ikut diuji.
5. **Jalankan.** Ulangi tanpa `--periksa`. Tiap baris laporan berstatus `dibuat`, `diperbarui`, `ada`, atau `dilewati`.
6. **Undang pengelola.** Tambah `--kirim-undangan` untuk mengirim link masuk 7 hari ke akun yang belum pernah masuk. Atau pengelola meminta link sendiri di halaman login. Link disimpan dan dicatat di audit lebih dulu; bila email gagal terkirim, skrip melaporkan jumlah yang gagal dan link tetap kedaluwarsa sendiri.

> **Konsol Super Admin (B12).** Tenant baru juga bisa dibuat dari layar Tenant (`POST /api/platform/tenants`) dengan onboarding yang sama dalam mode `create`: slug atau id yang sudah ada ditolak 409 `TENANT_EXISTS` sebelum KMS dipanggil, pelaku Super Admin tercatat di audit tenant dan log audit platform, dan undangan dikirim setelah COMMIT. Skrip ini tetap memakai mode bawaan (aman dijalankan ulang).
7. **Cek.** Masuk sebagai HR, pastikan menu DNA dan TNA tampil. Jejak audit tercatat di `audit_logs` dengan resource `tenant.onboarding`.

## Pengaman

- Produksi menolak berjalan tanpa `ENCRYPTION_PROVIDER=kms` dan SES (aturan konfigurasi yang sama dengan API).
- Dengan KMS, `id` wajib dan alias kunci diuji sebelum transaksi dimulai. Bila alias belum ada, skrip berhenti tanpa mengubah data dan menyebut `tenant_ids`.
- Bila tenant sudah punya kunci, skrip memastikan kunci itu masih bisa dibuka (kunci induk lokal atau KMS cocok) sebelum mengubah apa pun.
- Slug milik tenant lain ditolak. Akun yang sudah ada dengan peran berbeda tidak diubah, hanya dilaporkan `dilewati`.
- Entitlement hanya ditambah bila belum ada yang aktif untuk produk itu. Semua perubahan berjalan dalam satu transaksi.

## Bila gagal

| Pesan | Tindakan |
|---|---|
| `Kunci enkripsi tenant (alias/...) tidak bisa dipakai` | UUID belum di `tenant_ids`, belum `terraform apply`, atau `KMS_KEY_ALIAS_PREFIX` bukan `elgos-<env>-tenant`. |
| `... Pastikan EWI_LOCAL_MASTER_KEY sama` | Skrip dijalankan dengan kunci induk lokal yang berbeda dari API. |
| `Slug ... sudah dipakai tenant lain` | Pilih slug lain, atau pakai `id` tenant yang sudah ada. |
| `Spesifikasi tenant tidak valid` | Perbaiki kolom yang disebut; semua kesalahan ditampilkan sekaligus. |

Menonaktifkan atau menghapus tenant tidak termasuk skrip ini; ikuti runbook hapus/ekspor data (PD-19 butir 10).
