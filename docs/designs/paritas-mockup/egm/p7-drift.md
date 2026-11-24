# P7 · Drift spek vs kode

Dicocokkan: [p7-sisa.md](../p7-sisa.md) dengan kode akhir branch `paritas-p7`.

| Butir spek | Kode akhir | Status |
| --- | --- | --- |
| CV-2 "ambang = target program" | `valueTarget` = maksimum dari nilai lulus dan `min` band program (band tertinggi, mis. Strong Culture Alignment 85). Mockup memakai 92 tetap; API tidak punya "target skor nilai". | Drift kecil, dicatat sebagai K-P7-4 di spek |
| IV-3 "tambahkan awalan model" (usulan gap) | Hanya "persetujuan belum/tercatat"; label AI tetap dari API | Tidak diambil, alasan di review |
| LD-12 chip status | Empat chip: Lengkap, Kurang, Menunggu, Opsional (spek menyebut keempatnya) | Sesuai |
| LD-13 "Tandai tidak hadir" | Tombol berganti teks bila peserta sudah hadir | Sesuai |
| LD-15 hitungan | Foto + video saja (`mediaCount`) di baris kelengkapan dan bagian Dokumentasi | Sesuai setelah review |
| ADM-5 | `white-space: nowrap` pada nama (`b.adm__nowrap`), bukan pada seluruh sel | Sesuai maksud |
| AIV-6 | Hanya untuk karyawan; kartu pimpinan (atasan) tetap memuat sesi di dalam kartu (pola P5 AA-2) | Sesuai lingkup gap (karyawan) |
| AIV-9 tombol kembali | "Kembali ke penugasan" juga di langkah done tanpa ringkasan | Tambahan kecil, konsisten |
| Checklist file | Semua file di checklist tersentuh; `AdminNav.vue` dihapus | Sesuai |

Tambahan pada spek: K-P7-4 (ambang CV-2) ditulis di bagian Keputusan.
