<!-- Test alur B18 untuk B13/B14, 19 Nov 2026. Diff 2d0f231...92ff442, perbaikan di commit berikutnya.
     Langkah: egm-drift-report (manual, karena diff hanya test + spek) dan egm-review tahap 9 dengan dua persona
     terisolasi (egm:egm-codebase-details, egm:egm-implementation-readiness), ditambah mattpocock-skills:code-review
     (Standards, Spec). Triase mengikuti egm-resolve: PROPOSE FIX, CONTEST, ESCALATE, DECLINE. -->

# Review test alur B18 untuk B13/B14

## Drift (spek lawan kode)

| # | Temuan | Keputusan |
| --- | --- | --- |
| D1 | Baris 3.3 "Webhook EliteMentor ke pelatihan online" menulis course LMS yang tersinkron lalu diperbarui webhook. Kode memisahkan dua jalur: `syncFromCatalog` melewati course `elitementor`, `learning.progress` membuat pelatihan `elitementor` lewat `course.ref`, `assessment.result` hanya ke pelatihan offline ber-`assessment_ref` (`ld-stores.js` `applyProgress`, `applyAssessment`; spek B14 §3 langkah 5–6). Ditemukan saat test merah. | PROPOSE FIX: baris dikoreksi mengikuti kontrak B14 §3; jalur LMS tetap dites `ld.test.js`. Reviewer Spec menilai koreksi setia, tidak melemahkan syarat |
| D2 | Spek 3.2 masih mendaftar fungsi driver lama. | PROPOSE FIX: daftar langkah B13/B14 ditambah |
| D3 | Baris 3.3 B13 menyebut alternatif `PATCH /api/li/modules/:id` tanpa test alur. | PROPOSE FIX: ditulis bahwa jalur itu dites di `li.test.js` |
| D4 | Baris 3.3 offline tidak menyebut langkah asesmen `vendor_manual` dan status `manual_pending`. | PROPOSE FIX: langkah ditulis lengkap |

## Review diff (persona + code review)

| # | Sumber | Temuan | Berat | Keputusan |
| --- | --- | --- | --- | --- |
| R1 | Standards, readiness, codebase | SQL flag/entitlement dan katalog di berkas test, padahal header driver menyatakan driver satu-satunya tempat penyiapan | Major | PROPOSE FIX: `selamaMati` (pulih di `finally`) dan `nyalakanFlag` di driver; katalog lewat impor `catalog_courses` (`li.imporCourse`) |
| R2 | codebase, Spec | "Dashboard memuat pelatihan itu" dicek dengan `JSON.stringify().toContain(id)`, lolos karena insight `late` | Major | PROPOSE FIX: cek `kpis` (berjalan, offline, perlu perhatian) dan insight `late:<id>`; alasannya ditulis di baris 3.3 |
| R3 | Spec | Flag/entitlement mati hanya dicek 202 tanpa efek; event yang tercatat saat mati akan membuat kiriman ulang EliteMentor hilang | Major | PROPOSE FIX: tiap kasus memakai karyawan sendiri, event yang sama dikirim ulang setelah pulih dan harus diproses |
| R4 | codebase | Judul temuan stub ditulis keras (`/Kesulitan mencapai target/`) | Nit | PROPOSE FIX: judul diambil dari antrean review |
| R5 | codebase | Cek 403 hanya status | Nit | PROPOSE FIX: juga `ROLE_FORBIDDEN` |
| R6 | Standards, codebase | Literal flag, bukan `FLAGS.*` | Nit | PROPOSE FIX |
| R7 | Standards, codebase | `hari()` menggandakan `day()` dengan angka 7 jam tanpa nama | Nit | PROPOSE FIX: `tanggalWib` + `ZONA_WIB_MS` di `tests/alur/data.js`. `ld.test.js`/`lim.test.js` tidak diubah (di luar paket) |
| R8 | codebase | Komentar `ld.pengingat` tidak menyebut 409 `INVALID_STATE` dan 400 | Nit | PROPOSE FIX |
| R9 | Standards | Nama `online()` terbaca boolean | Nit | PROPOSE FIX: `pelatihanOnline()` |
| R10 | Standards | `beforeAll` (db, app, HR/atasan/karyawan) mirip di kedua berkas | Nit | DECLINE: pola sama dengan `alur-tna` dan `alur-modul-mati`; fixture bersama sebaiknya diputuskan pemilik driver (B18) |
| R11 | Standards | Pola `kirim(...).expect(N).body.data` berulang di langkah | Nit | DECLINE: gaya yang sudah ada di driver |
| R12 | readiness, codebase | Test dalam satu berkas bergantung pada urutan | Nit | DECLINE: test alur memang berurutan (sama dengan `alur-tna`); tiap berkas punya tenant sendiri yang dihapus di `afterAll` |
| R13 | Spec | Tidak ada kasus campuran (satu temuan disetujui, satu belum) atau keputusan `edited` | Nit | DECLINE: stub menghasilkan satu temuan training per pemicu; kasus campuran dan `edited` sudah dites di `li.test.js` lewat store |
| R14 | readiness | `orgId` acak tanpa jaminan unik | Nit | DECLINE: rentang 16 juta, peluang tabrakan sangat kecil; kolom unik akan gagal keras, bukan diam |
| R15 | Spec | Spek diubah dalam commit yang sama dengan test | Catatan | Diterima: tiap ubahan baris ditelusuri ke kode (D1–D4); dicatat di badan PR untuk thread integrasi |

Hasil: 0 Blocker; 3 Major dan 10 butir lain diperbaiki; 5 ditolak dengan alasan; 0 ESCALATE.
