# ADR 0002 · Konsol platform Super Admin membaca dan mengubah tenant lain lewat jalur `/api/platform`

- Status: **Diusulkan** (19 Nov 2026, paket B12; menunggu review Andrian di PR)
- Tanggal: 19 Nov 2026

Aturan arsitektur 2 di `CLAUDE.md` mewajibkan setiap query data bisnis memfilter `tenant_id` dari `req.tenantId` (tenant akun yang login), tidak pernah dari body atau query. Super Admin (Admin ETA, peran `eta_admin`) di mockup final mengelola **semua** tenant dari satu konsol: daftar tenant, jumlah pengguna, modul per tenant, kualitas AI, dan biaya token. Kami memutuskan satu pengecualian yang sempit: hanya router `src/modules/platform` (dipasang di `/api/platform`, di luar router `/api` biasa) yang boleh memakai `tenantId` dari **path**, hanya untuk peran aktif `eta_admin`, dan hanya untuk membaca angka agregat dan metadata tenant (nama, slug, status admin, modul, angka kualitas dan biaya) serta mengubah flag modul dan membuat tenant. Router ini tidak pernah membaca isi data karyawan (jawaban wawancara, temuan, nilai), sehingga larangan Super Admin melihat isi jawaban wawancara tetap berlaku. Setiap perubahan lintas tenant dicatat dua kali: di audit tenant sasaran (agar Admin Tenant melihatnya) dan di log platform.

## Pilihan yang ditimbang

- **Super Admin login ulang ke tiap tenant** (tetap memakai `req.tenantId`): tidak butuh pengecualian, tetapi akun `eta_admin` harus ada di setiap tenant dan konsol "semua tenant" di mockup tidak mungkin dibuat. Ditolak.
- **Header `X-Tenant-Id` untuk semua rute bila peran `eta_admin`**: memperluas pengecualian ke seluruh API, termasuk rute yang membaca data karyawan. Ditolak karena melanggar batas privasi PM-6/PO-6.
- **Jalur `/api/platform` khusus dengan `tenantId` di path** (dipilih): pengecualian terkumpul di satu modul yang mudah diaudit dan dites.

## Konsekuensi

- Test wajib: peran selain `eta_admin` (termasuk `tenant_admin` dan `hr_admin`) mendapat 403 di semua rute `/api/platform`; rute platform tidak mengembalikan kolom isi data karyawan.
- Kode baru yang butuh akses lintas tenant ditaruh di `src/modules/platform`, bukan di modul submodul.
