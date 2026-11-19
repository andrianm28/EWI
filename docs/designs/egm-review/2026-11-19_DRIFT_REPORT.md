# Drift report · B4 dan B16 (skill `egm-drift-report`, 19 Nov)

Direktori: `docs/designs/`, dibatasi ke dua spek milik PR #22. Kode dibaca pada head branch `claude/project-thread-c2bjxm` setelah triase review egm. Semua drift di bawah sudah diselesaikan di commit yang sama dengan laporan ini atau sebelumnya (kolom "Tindakan").

## b4-developmental-needs.md

- `PATCH /competencies/:id` (endpoint B4, dipasang di `dna/index.js`, bukan di `development-routes.js`) tidak di balik flag `dna.development`, padahal header spek dan R1 menyatakan semua endpoint B4 di balik flag. Tindakan: test merah di `tests/integration/dna-development.test.js` (kasus flag mati), lalu `b4Flag(flags)` dipasang; konstanta pesan disatukan.
- Kolom opsional baru (`code`, `stream`, `programTier`) di `POST /competencies`, `/competencies/bulk`, dan impor tidak di balik flag; spek tidak menyebutnya. Tindakan: spek header menyatakan ini disengaja (aditif).

## b16-career-promotion.md

- C2 langkah 5 dan §11 menulis "dibulatkan ke bawah", sedangkan `fmtPct` di `CareerPromotionView.vue` membulatkan biasa dan hanya ke bawah bila menyeberangi ambang. Tindakan: spek diselaraskan dengan kode.
