# Code review B4/B16 (skill `mattpocock-skills:code-review`, 19 Nov)

Titik tetap: `origin/claude/project-thread-scbrmb` (1b25810), diff tiga titik, tanpa `docs/designs/egm-review/*`. Standards: `CLAUDE.md` + baseline smell Fowler. Spec: `docs/designs/b4-developmental-needs.md`, `docs/designs/b16-career-promotion.md`. Dua sub-agent paralel; laporan ditulis apa adanya (diringkas ringan), triase di bagian akhir.

## Standards

(Ditinjau di head 6edeeb1.)

**Pelanggaran keras**

1. CLAUDE.md aturan 3 (fitur baru di balik flag baru, default mati): `PATCH /competencies/:id` tanpa flag di 6edeeb1; kolom `code`/`stream`/`programTier` di `POST /competencies` dan `/bulk`, jenis impor `dna_job_functions`, dan kolom impor baru tidak di balik flag (`dna_job_functions` tampil di daftar template semua tenant).

**Judgement call (standar)**

- B16 memakai flag lama `promotion.recommendation` (dicadangkan untuk modul ini sejak G2-A), bukan flag baru.
- Default `promotionVisibleTo` melebar ke `['hr_admin','supervisor']`: tenant yang flag-nya sudah menyala langsung membuka modul untuk atasan.

Aturan 1, 2, 4, 6 terpenuhi.

**Smell baseline**

- Duplicated Code: `TIERS` di `dna/index.js` dan `development.js`; `TIER_LABEL` di tiga file web dan `development.js`; daftar peran karyawan di tiga tempat; pesan flag mati tersalin; dua loop insert pemetaan job function berbentuk sama.
- Feature Envy / helper salah tempat: `isUuid`/`orConflict` diambil dari file rute `development-routes.js`.
- Divergent mechanism: `insertAudit` di store menulis `audit_logs` langsung (alasan: transaksi); `conflictCode` lokal di samping `core/errors.conflict()`.
- Primitive Obsession: `decisionView` memakai literal peran, rute memakai `ROLES.*`.
- Mysterious Name: `forbidden` membayangi helper core; nama pendek `on`, `x`, `d0`.
- Konvensi: `b16-cp` memakai `meta.flag`, `b4-dna` memakai `beforeEnter` (beralasan: jatuh ke `dna-poc`).

## Spec

(Ditinjau di head 985540b.)

- (c1) Impor: header spek menyebut impor aditif, padahal §9 memakai perubahan impor sebagai alasan flag. Dengan flag mati, judul "Level" tetap ke Level Program, nilai bukan jenjang ditolak, baris lama diperbarui dan pengesahannya direset. Perilaku impor tenant lama berubah.
- (c2) Impor ulang mereset pengesahan walau nilainya sama (§7 "direset bila ada kolom kompetensi yang berubah"; `updateCompetency` selalu mengosongkan `approved_at`).
- (a3) Tabel pegawai menampilkan `met / assessed`, bukan cakupan `assessed / total` (A4); pegawai `done` tampak dinilai penuh.
- (b4) `docs/designs/b18-e2e-qa-malam.md` diubah tetapi tidak ada di daftar file kedua spek.

B16 C2–C14, tabel tindakan, audit satu transaksi, dan endpoint lama khusus HR sesuai spek.

Ringkasan: Standards 1 pelanggaran keras (aturan 3, flag) + 2 judgement call + 7 smell; Spec 4 temuan, terberat c1 (impor di luar flag).
