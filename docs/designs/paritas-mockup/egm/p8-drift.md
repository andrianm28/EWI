# P8 · Drift spek vs kode

Dicocokkan: [p8-keputusan-r1-r22.md](../p8-keputusan-r1-r22.md) dengan kode akhir branch `paritas-p8`.

| Butir spek | Kode akhir | Status |
| --- | --- | --- |
| Test e2e "P8" | Ditambahkan ke file spec yang sudah ada per layar, bukan file baru | Sesuai checklist (checklist menyebut file per layar) |
| R2 dialog tenggat B10 | Komponen lokal baru `b10-core-competencies/AssignDueDialog.vue`, dipakai HR dan atasan | Tambahan file, checklist diperbarui |
| R2 judul dialog | HR "Tugaskan wawancara pimpinan", atasan "Tugaskan wawancara tim", TNA "Tugaskan wawancara akar masalah" | Sesuai maksud |
| R2 galat di dialog TNA | Galat validasi dan galat umum tampil di dialog selama terbuka | Diperbaiki saat review |
| R15 breadcrumb | `b6-iv/crumbs.ts`: induk bertaut bila butir menu `tna` tampil (`isVisible`), bukan cek peran langsung | Sesuai maksud, file baru dicatat di checklist |
| R8 intro Permintaan | "…dengan bantuan templat ELGOS…" di `RequestsView.vue` | Ditambahkan ke spek setelah komit spek |
| R4 dashboard | Dashboard tidak memakai `formatNumber` (snapshot tetap) | Sesuai spek |
| Snapshot | Tidak ada PNG yang berubah | Sesuai |

Tambahan pada spek: butir R8 intro Permintaan, dan dua file baru di checklist.
