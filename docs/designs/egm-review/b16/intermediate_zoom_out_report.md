# Intermediate Zoom Out Report (Tahap 8 egm-review) · B16

Reviewer: `egm:egm-zoom-out` (subagent baru, standar zoom-out-standard, membaca laporan tahap 5–7). Status: completed. 0 Blocker, 5 Major, 5 Nit.

1. Major — `actions`/`blockedReason`: `waiting_hr` tidak pernah dikembalikan; HR yang merekomendasi sendiri diberi `['approve','hold']` padahal rute membalas 403. Usul: satu tabel (peran × status siklus × eligible → actions, blockedReason) dari `decisionView`; hapus `waiting_hr`; satu guard di `decisionView` (`supervisorBy === viewer.id`) dengan satu nilai `blockedReason` baru.
2. Major — Keputusan §10a (FOR UPDATE, cek approved dulu, 403 HR=perekomendasi, tie-break dedup OKR, pengecualian C10, siklus usang hidup lagi) hanya di log. Pindahkan ke aturan C; siklus usang sebagai ⏳ di C9; ringkas §8a/§10a; perbaiki klaim §12.
3. Major — `promotionVisibleTo` gerbang kedua yang hanya bisa mematikan alur. Koreksi atas Critic M6: `canSeePromotion` memeriksa flag yang sama lebih dulu, jadi tidak bocor di luar flag. Usul: buang `promotionVisibleTo` dari router baru (flag + peran + cakupan cukup); `canSeePromotion` pakai `promotionSettings().visibleTo`.
4. Major — Dua definisi "kandidat": badge "Kandidat" di DnaView (program saja) vs `eligible` di /cp. Usul: hentikan badge lama (atau tautkan ke /cp) dan kembalikan default `['hr_admin']`; atau badge memakai `careerState().eligible`.
5. Major — C2: tulis daftar kasus berurutan yang meniru `recordScore` dengan nama kolom; urutan periode lewat aturan impor (`YYYY-MM` nol di depan / `YYYY-Qn`), bukan parser; C2 tetap sementara; `metricTypes` internal.
6. Nit — Tolak: epoch posisi/trigger, `approved_pending_sk`, snapshot+`drifted`, reviewer pengganti, tabel event, optimasi `load()`. Catat dua kasus tepi sebagai ⏳ (indeks approved memblok promosi ulang; upsert menimpa catatan atasan).
7. Nit — Alternatif/sasaran/arsitektur: paragraf tiga baris dan daftar sasaran singkat.
8. Nit — Kode keputusan: satu tautan ke sumber; R2-2 belum dijelaskan.
9. Nit — Placeholder `<...>` di luar backtick.
10. Nit — SQL di C6/C7 jadi aturan; `okr_achievement` tampilkan atau sebut hanya untuk audit.
