# Triase review diff B4/B16 (egm-resolve, 19 Nov)

**Status:** resolved. Sumber: `diff-review-egm.md` (agen `egm-codebase-details`, `egm-implementation-readiness`), `code-review-mattpocock.md` (Standards + Spec), `2026-11-19_DRIFT_REPORT.md`. Temuan yang sama digabung. Setiap PROPOSE FIX dikerjakan test-first (skill `tdd`): test merah dulu, lalu kode.

| # | Temuan (sumber) | Kategori | Tindakan dan bukti |
| --- | --- | --- | --- |
| D1 | Impor B4 (kolom baru, "Level", perbarui baris lama, jenis `dna_job_functions`) tidak di balik `dna.development` (codebase 1, readiness 1, Standards 1, Spec c1) | PROPOSE FIX | `field.flag`, `kind.flag`, `field.flagOffAliases` + `kindView()` di `imports/index.js`; flag mati = perilaku sebelum B4. Test merah lalu hijau: integrasi "flag dna.development mati: impor kamus berperilaku seperti sebelum B4". Kode impor bersama → reviewer Andrian. |
| D2 | Impor ulang nilai sama mereset pengesahan (codebase 2, readiness 2, Spec c2) | PROPOSE FIX | Patch hanya kolom yang berubah; tanpa perubahan dan tanpa JF → ditolak "tidak ada perubahan". Test unit "impor ulang dengan nilai yang sama ...". |
| D3 | `settings.dna = null` → 500 (codebase 3) | PROPOSE FIX | `promotionSettings` menerima null/bukan objek. Test unit "B16 setelan rusak". |
| D4 | HR menyetujui siklus usang dalam balapan dengan perubahan posisi (codebase 4) | PROPOSE FIX | UPDATE `hrDecide` mensyaratkan `from_level_id` = jenjang karyawan di bawah kunci; rute membalas 409 `WAITING_SUPERVISOR`. Test integrasi memanggil store dengan siklus usang → false. |
| D5 | UUID huruf besar di query/body B4 → 400 (codebase 5, readiness 4) | PROPOSE FIX | `lowerId()` untuk `jobRoleId`, `jobFunctionId`, `competencyIds`. Test integrasi. |
| D6 | `decisionView` tidak memeriksa `supervisorRole` (codebase 6) | PROPOSE FIX | Test unit "tombol atasan mengikuti peran di basis data". |
| D7 | A2 seri tanggal asesmen bergantung urutan (readiness 3) | PROPOSE FIX | Seri dipecah `createdAt`; store `ORDER BY created_at, id`. Test unit `latestByCompetency (A2)`. |
| D8 | Tabel pegawai tanpa cakupan `assessed/total` (Spec a3) | PROPOSE FIX | "dinilai x dari y" bila belum semua dinilai. E2E HR. |
| D9 | `PATCH /competencies/:id` tanpa flag (drift, Standards 1) | PROPOSE FIX | Sudah di commit drift (`b4Flag`). |
| D10 | Pembulatan OKR layar vs spek (codebase 7, readiness 7) | PROPOSE FIX | Spek diselaraskan (drift report). |
| D11 | 23503 → 409 tak disebut; komentar "A14"; "pemetaan saja tidak mereset" tanpa test; B16 §8 "balapan nol baris" terlalu luas; sinonim `TIER_CHOICES` berlaku untuk jenis lain; `b18-e2e-qa-malam.md` di luar daftar file (readiness 5/6/8/9, codebase 12, Spec b4) | PROPOSE FIX | Spek diperbarui; komentar dibetulkan; test unit impor ulang mencakup "hanya pemetaan JF → patch kosong". |
| D12 | B16 memakai flag lama `promotion.recommendation` (Standards) | DECLINE | Flag itu dibuat khusus untuk modul promosi (G2-A) dan default mati; flag kedua untuk modul yang sama tidak menambah kendali. |
| D13 | Default `promotionVisibleTo` melebar (Standards) | ESCALATE | Sama dengan S6 (RG-1e keputusan user); endpoint lama tetap khusus HR. Ditanyakan di PR. |
| D14 | Reuse: `isUuid` dari file rute dan duplikat di tna, `conflictCode` vs `conflict()`, `TIERS`/daftar peran ganda, dua loop insert, literal peran, nama pendek, `insertAudit` jalur kedua (codebase 8–11, Standards smell) | DECLINE (dicatat) | Memindahkan helper ke `core` menyentuh modul tna/ld/li/cca milik thread lain; diusulkan sebagai tiket terpisah (`/mattpocock-skills:to-tickets`). `insertAudit` disengaja (audit satu transaksi, C12). |
