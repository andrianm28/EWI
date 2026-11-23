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
- [x] Hapus `deploy/dev-public/setup-etavm1.sh`.
- [x] README root, `deploy/dev-public/README.md`, `docs/infra/vps-etavm2.md`: tandai etavm1 dihentikan.
- [x] Test penjaga `apps/api/tests/unit/infra-etavm2-saja.test.js`: tidak ada `runs-on` berlabel etavm1,
      actionlint tanpa etavm1, tidak ada skrip `*etavm1*` di `deploy/` atau `infra/`.

## Di luar cakupan

- Deploy dev publik ke etavm2 (runner, nginx, DNS `dev-elgos`): milik thread infra (PR #3).
- Mencopot runner `etavm1-ewi-dev` dari Settings › Actions › Runners: langkah manusia (admin repo).
- `deploy/dev-public/deploy.sh` dan `docker-compose.yml` dibiarkan karena tidak lagi dipanggil workflow
  dan `nginx.conf` di folder yang sama masih dipakai `apps/web/Dockerfile`.
