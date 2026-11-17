# Alur rilis ELGOS

PD-6 opsi A (produksi manual berpenyetuju) dan PD-11 opsi A (tiga pengaman pipeline). Menutup P1-5,
P1-6, I-1, I-2, N-2 (PK-10). Asumsi: nilai ★ dipakai sampai PD-6 dan PD-11 dijawab.

## Alur

```
branch fitur ──PR (review)──> dev ──> deploy dev (etavm1 / dev per worktree)
dev ──PR (review)──> main ──> CI ──> image ghcr.io/andrianm28/ewi-{api,web}:<sha> ──> staging (otomatis)
uji asap staging ──> Actions > "Deploy staging/prod" > Run workflow (branch main, prod, image_tag=<sha>)
                 ──> environment prod menunggu penyetuju ──> deploy produksi
```

| Peran | Orang |
|---|---|
| Penyetuju produksi | Andrian; cadangan Pringgo (PD-5/PD-6) |
| Reviewer PR | Zava utama; Pringgo untuk auth, migrasi, enkripsi, deploy (PD-5) |
| Pemilik berkas deploy/infra/workflow | lihat `.github/CODEOWNERS` |

## Pengaman yang ditegakkan

1. **Deploy hanya dari main.** `deploy.yml` menolak run dari branch lain (job `guard`), dan job
   `deploy` sendiri mensyaratkan `refs/heads/main`.
2. **SHA produksi harus commit di main.** `image_tag` wajib SHA 40 karakter dan diperiksa dengan
   `git merge-base --is-ancestor <sha> origin/main`. Image dari branch yang belum direview tidak bisa
   dipromosikan.
3. **Environment `prod` berpenyetuju dan hanya dari main.** Diatur di GitHub (bukan di repo), lihat
   langkah di bawah.
4. **Berkas sensitif lewat review.** `.github/CODEOWNERS` mencakup `.github/workflows/`, `deploy/`,
   `infra/`, `docs/infra/`, `apps/api/migrations/`.
5. **Terraform lewat role terbatas dan plan di PR** (`.github/workflows/terraform.yml`): PR yang
   mengubah `infra/` menjalankan plan dengan role baca-saja; apply hanya dari main lewat environment
   `infra` berpenyetuju. Tidak ada lagi apply manual dengan profil admin.
6. **Profil SSO akun management tidak ada di etavm1** (P1-6): setelah akun ELGOS dan role Terraform
   ada, hapus `~/.aws/config` profil `eta-andrian` dan cache SSO di etavm1
   (`rm -rf ~/.aws/sso/cache ~/.aws/cli/cache`); login SSO dilakukan dari laptop admin saja.

## Pengaturan GitHub (sekali, oleh admin repo)

- Settings > Environments > `prod`: Required reviewers = Andrian (+ Pringgo); Deployment branches =
  Selected branches `main`; centang "Prevent self-review" bila tersedia.
- Settings > Environments > `staging`: Deployment branches = `main`.
- Settings > Environments > `infra`: Required reviewers = Andrian; Deployment branches = `main`.
- Settings > Branches > `main` dan `dev`: Require pull request, Require review from Code Owners,
  Require status checks (CI), larang force push.
- Catatan: required reviewers dan aturan environment untuk repo **privat** butuh paket GitHub Team
  atau Enterprise (belum diverifikasi untuk akun ini). Bila tidak tersedia, pindahkan repo ke
  organisasi Elitery yang berbayar (PD-4) atau pakai jalur produksi terpisah (PD-11 opsi C).
  Pengaman 1, 2, 4, dan 5 tetap berlaku tanpa paket berbayar.

## Aturan migrasi (I-1)

Rollback otomatis memasang image lama. Agar image lama tetap jalan di atas skema baru:

- **Tambah dulu, hapus belakangan.** Kolom/tabel baru boleh di rilis N. Menghapus atau mengganti
  nama kolom yang masih dipakai image N-1 hanya di rilis N+1, setelah N stabil di produksi.
- Kolom baru `NOT NULL` wajib punya `DEFAULT`, atau diisi bertahap dalam dua rilis.
- Setiap migrasi wajib punya `down` dan lulus naik-turun-naik di CI (aturan 6 CLAUDE.md).
- Migrasi dijalankan deploy.sh sebagai pemilik skema sebelum container diganti; aplikasi memakai
  role `elgos_app` tanpa hak DDL (PD-8).
- Bila migrasi gagal setelah sebagian jalan, deploy.sh memulihkan schema `ewi` dari backup yang
  sudah diverifikasi terbaca sebelum migrasi. Bila backup tidak terbaca, skema tidak dihapus.

## Checklist rilis produksi

1. PR dev → main disetujui, CI hijau, staging terdeploy otomatis dengan SHA itu.
2. Uji asap staging: login HR dan learner, alur inti, `/api/ready` 200.
3. Catat SHA dan ringkasan perubahan di deskripsi run.
4. Run workflow `prod` + `image_tag`, penyetuju menyetujui di GitHub.
5. Setelah sukses: cek `https://elgos.eliteacademy.id/api/ready` dan log `/srv/elgos-prod/deploy.log`.
6. Rollback manual: Run workflow `prod` dengan SHA sebelumnya (`/srv/elgos-prod/previous.env`).
