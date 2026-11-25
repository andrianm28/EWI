# P5 · Drift spek vs kode (paritas LNA)

Spek: [p5-lna.md](../p5-lna.md). Kode akhir: `06cd22f` + dokumen.

| Bagian spek | Kode | Status |
| --- | --- | --- |
| CC-3/CC-4/CC-5/CC-6, CV-7..CV-10 | `RequirementsTab.vue`, `cc.css` | Sesuai |
| AH-1/AH-6/AH-7/AH-9 | `AssignmentsHr.vue` (`@loaded`), `SynthesisCard.vue` | Sesuai. Pratinjau pimpinan tampil di bawah tombol; pratinjau karyawan dipicu dari bagian lipat dan tampil di tempat yang sama |
| AA-1/AA-2/AA-3/AA-5/AA-6 | `InterviewAssignmentView.vue`, `api/cca.ts` (`fmtDate(iso, 'short')`) | Sesuai. Spek menyebut `fmtDateShort`; kode memakai parameter opsional `month` pada `fmtDate` (satu fungsi, kompatibel) |
| TN-2 (K-P5-4) | `routes.ts` (`tna-kelola`), `TnaKelolaView.vue`, `TnaScreen.vue`, `TnaPengelolaan.vue`, `tna.css` | Sesuai. Prop `heading` di `TnaPengelolaan` dihapus (tidak dipakai lagi) |
| TN-3/TN-5/TN-9/TN-10/TN-12 | `TnaScreen.vue` | Sesuai |
| IN-4..IN-7, IN-9, IN-11 (K-P5-5) | `ImprovementNeedsView.vue` | Sesuai. Tombol "Tambah tindakan" kini tonal di kanan h2 (sebelumnya filled di toolbar tabel) |
| DN-3/DN-4/DN-11/DN-13/DN-14 | `DevelopmentNeedsView.vue` | Sesuai |
| Test | `core-competencies`, `cca-wawancara`, `tna-gap`, `improvement-needs`, `b4-dna` (+ `poc-dna-tna` tetap hijau) | Sesuai. Uji 1280 untuk CC, 1440 dan 1280 untuk INA |

## Tindak lanjut di luar P5

- Spek B5 bagian 16 masih menyebut pengelolaan TNA "di bawah papan gap"; perlu satu kalimat amandemen (rute `tna-kelola`) oleh pemilik B5.
- `ImportPanel` bersama masih bergaya Tailwind (dipakai TNA, DNA POC, CC program, LIM).
- Butir yang dilewati: lihat p5-lna.md "Tidak dikerjakan".
