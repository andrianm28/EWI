# Audit 23 Nov: hentikan deploy dev ke etavm1

Status: diterapkan di PR audit (base `claude/project-thread-scbrmb`). Pemilik keputusan: aturan project
("Server: hanya etavm2, jangan pernah etavm1").

## Masalah

Di scbrmb (`a8e48b6`), `.github/workflows/deploy-dev.yml` menjalankan job `deploy` di runner
`[self-hosted, etavm1, ewi-dev]` pada setiap push ke `dev`. PR #8 menuju `dev`, jadi begitu Andrian
menggabungnya, GitHub langsung mengirim job deploy ke etavm1 (bila runner itu masih terpasang) atau
membiarkan job menggantung menunggu runner. `deploy/dev-public/setup-etavm1.sh` juga masih mengajak
orang memasang runner di etavm1.

## Perubahan

- [x] `deploy-dev.yml`: hapus job `deploy` dan input `seed`/`rollback_to`. Push ke `dev` tinggal gate CI
      penuh + build image GHCR.
- [x] `.github/actionlint.yaml`: label runner `etavm2, elgos` (dipakai `deploy.yml`), bukan `etavm1`.
- [x] Hapus `deploy/dev-public/setup-etavm1.sh` dan `deploy/dev-public/deploy.sh` (hanya dipanggil job yang dihapus).
- [x] Komentar `deploy/dev-public/docker-compose.yml` ditandai dihentikan.
- [x] README root, `deploy/dev-public/README.md`, `docs/infra/vps-etavm2.md`: tandai etavm1 dihentikan.
- [x] Test penjaga `apps/api/tests/unit/infra-etavm2-saja.test.js`: tidak ada `runs-on` berlabel etavm1,
      workflow tidak menyebut etavm1 di luar komentar (menangkap `runs-on` daftar/labels),
      actionlint tanpa etavm1, tidak ada berkas `*etavm1*` di `deploy/`/`infra/`, dan tidak ada skrip `.sh` di
      `deploy/` yang menyebut etavm1.

## Di luar cakupan

- Deploy dev publik ke etavm2 (runner, nginx, DNS `dev-elgos`): milik thread infra (PR #3).
- Mencopot runner `etavm1-ewi-dev` dari Settings › Actions › Runners: langkah manusia (admin repo).
- `docker-compose.yml` dan `nginx.conf` dibiarkan (jalan lokal; `nginx.conf` dipakai `apps/web/Dockerfile`).
- Environment GitHub `dev` dan variabel `DEV_PUBLIC_URL` kini tidak terpakai; dibersihkan admin repo.
- `docs/infra/alur-rilis.md:35` dan `vps-etavm2.md:192` (hapus profil SSO dari etavm1) sengaja dibiarkan:
  itu pembersihan kredensial di etavm1, bukan pemakaian etavm1 sebagai server (triase review ikan mas).

## Review ikan mas (egm-codebase-details) dan triase

| Temuan | Keputusan |
| --- | --- |
| P2 test per baris melewatkan `runs-on` bentuk daftar/labels | Perbaiki: larang kata etavm1 di baris non-komentar |
| P2 test 3 hanya cek nama berkas; `deploy.sh` masih menyasar etavm1 | Perbaiki: hapus `deploy.sh`, test juga cek isi `.sh` di `deploy/` |
| P2 komentar basi di `deploy.sh`, `docker-compose.yml` | Perbaiki |
| P3 langkah setup etavm1 masih di README dev-public | Tunda: banner "DIHENTIKAN" cukup sampai thread infra memindahkan dev publik |
| P3 `alur-rilis.md`/`vps-etavm2.md` menyebut pembersihan di etavm1 | Tolak: pembersihan kredensial, bukan target server |
