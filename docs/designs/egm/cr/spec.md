## Spec (mattpocock-skills:code-review, 19 Nov)

**B7:** (a) tidak ada yang hilang. (c) minor: `recommendation` di solutions hanya dihitung bila `competencyId` ada; temuan pelatihan tanpa kompetensi tampil "perlu modul baru" tanpa cek katalog.
**B8:** (c) `/api/my/results` mengirim skor per kompetensi padahal Q45 masih terbuka (perlu keputusan sebelum merge). (c) Teks langkah (b) "semua sesi … menjadi abandoned" bertentangan dengan "Hanya wawancara TNA"; kode benar, perbaiki teks. Keputusan tarik persetujuan diimplementasikan benar.
**B17:** (c) Pemetaan peran→view bertentangan dengan B0 §5.1. (c) Kunci halaman bertentangan dengan B0 §5.2 (`aiv` = cca; wawancara TNA = `iv`; tidak ada `aiv` untuk hr). (c) minor: `tinjauan`, `perbaikan`, `permintaanData` tidak memakai `ctx.scope`. (c) minor: fallback judul `rencanaSaya` melewati judul temuan. (b) trivial: penolakan karyawan menjalankan `scopeOf` lebih dulu.
**Scope creep:** tidak ada yang berarti.
