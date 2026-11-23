# Laporan drift (egm-drift-report) · 23 Nov 2026

Cakupan: `docs/designs/b8-karyawan.md` bagian "Layar web" s.d. "Perubahan API kecil" dan daftar perubahan file, dibandingkan dengan kode di branch `claude/project-thread-y6gg4b` setelah perbaikan review. Dicek per butir terhadap `apps/web/src/screens/b8-karyawan/*`, `screens/b6-iv/*`, `shell/menu.ts`, `stores/session.ts`, `api/imports.ts`, `api/lna.ts`, `apps/api/src/modules/employees/index.js`, `apps/api/src/modules/interviews/{summary,index}.js`, `apps/api/scripts/seed-dev.js`, dan spec e2e.

## b8-karyawan.md
- Tidak ada drift pada rute, layar Hasil saya, Data saya, perubahan B6, Rencana belajar, layar HR, perubahan API, dan daftar test setelah spek diperbarui di commit yang sama.
- Catatan: `.b8-h2` (16px) tetap dipakai untuk judul kartu walau spek tidak menyebut kelas CSS; bukan perilaku.
- Catatan: tautan keluar Rencana belajar memakai kelas `el-btn` langsung (spek menyebut "tautan keluar", tidak menyebut komponen); ditolak di code review S2.
