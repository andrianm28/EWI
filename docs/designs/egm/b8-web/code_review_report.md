# Code review dua sumbu (mattpocock-skills:code-review) · B8 web

Titik tetap: `origin/claude/project-thread-scbrmb` (4f78b68, sebelum gabung 54f876e). Standards = `CLAUDE.md` + B0 §4/§5.3 + baseline smell Fowler. Spec = `docs/designs/b8-karyawan.md` "Layar web" s.d. "Perubahan API kecil".

## Standards

Tidak ada pelanggaran keras CLAUDE.md 1–7 maupun B0 §5.3. Temuan (penilaian):

| # | Temuan | Tindak lanjut |
| --- | --- | --- |
| S1 | `.b8-mono` menulis font langsung; fallback `--el-surface-container` bukan token | **Diperbaiki**: `var(--el-font-mono)`, `var(--el-surface)` |
| S2 | Tautan keluar menyalin kelas `el-btn` karena `UiButton` hanya punya `to` (RouterLink) | **Ditolak dengan alasan**: menambah `href` ke komponen bersama di luar cakupan; dicatat untuk Andrian |
| S3 | `downloadFile` menambah salinan keempat kode blob | **Diperbaiki**: `downloadTemplate` dan `downloadGapCsv` kini memanggil `downloadFile` (`platform.ts` belum, di luar paket) |
| S4 | Blok `FEATURE_DISABLED` kembar di dua layar | **Diperbaiki**: `screens/b8-karyawan/gate.ts` `leaveIfDisabled` |
| S5 | `.b8-h1/.b8-h2` mengulang `.el-h1/.el-h2` | **Sebagian**: `.el-h1` dipakai; `.b8-h2` (16px) dipertahankan untuk judul kartu |
| S6 | Daftar peran admin kembar web/API | **Diterima**: dicatat di komentar `isAdminAccount` (sama dengan API) |
| S7 | `.b8-link` tak terpakai | **Diperbaiki**: dihapus |
| S8 | `REQUEST_*_LABEL` memakai `Record<string, string>` | **Diperbaiki**: `Record<DataRequestType, …>` |
| S9 | Cast ganda `COMPETENCY_STATUS[...]` | **Diperbaiki**: `competencyStatus()` dengan cadangan |
| S10 | Nama `NEEDS_MODULE` | **Diperbaiki**: `NEEDS_MODULE_LABEL` |
| S11 | Perubahan API dan B6 ikut paket layar | **Diterima**: commit terpisah, dibutuhkan layar ini |

## Spec

| # | Temuan | Tindak lanjut |
| --- | --- | --- |
| P1 | Teks undangan lewat salah ("lewat tenggat… undangan baru"), test mengunci salahnya | **Diperbaiki**: teks B6, test diperbarui |
| P2 | Cadangan "3×24 jam WIB" | **Diperbaiki** |
| P3 | `consentWithdrawnAt` di `SHARED_FIELDS` tidak tercantum di spek web | **Diperbaiki dan dipersempit**: hanya HR dan yang diwawancarai (lihat review egm M1), dicantumkan di "Perubahan API kecil" |
| P4 | `SEMUA_MODUL` menyalakan `learner.home` bertentangan dengan "test lama tidak terpengaruh" | **Spek diperbarui** |
| P5 | Pesan "Permintaan hapus dibatalkan." dan `.b8-link` tanpa spek | Pesan **diterima** (umpan balik aksi), `.b8-link` dihapus |

Ringkas: Standards 11 temuan (terberat S2/S3 duplikasi dan komponen), Spec 5 temuan (terberat P1 teks undangan).
