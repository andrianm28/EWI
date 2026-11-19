# Catatan triase awal b17 (19 Nov 2026)

Dipindahkan dari `docs/designs/b17-asisten-elgos.md` saat egm-resolve (tahap 5–9). Keputusan yang masih berlaku sudah dimasukkan ke badan spek.

## Catatan triase review spek (19 Nov)

Review oleh subagent baru (hanya path); 11 temuan (2 berat).

| # | Temuan | Putusan |
| --- | --- | --- |
| 1 | `ai_usage_logs` menolak `submodule = 'assistant'` dan `operation = 'assistant_reply'` | **Perbaiki**: migrasi melebarkan kolom dan mengganti CHECK; `down` membersihkan baris dulu |
| 2 | Fakta hanya memeriksa modul, bukan flag (jalan pintas lewat `learner.home`, `tna.review_workspace`, INA) | **Perbaiki**: kolom syarat memuat flag; halaman hanya ditawarkan bila faktanya terisi |
| 3 | Batas pakai tidak menghitung permintaan gagal; balapan; pemakaian saat gagal | **Perbaiki**: log awal `pending` dalam transaksi berkunci, semua hasil dihitung, `e.usage` dicatat |
| 4 | Tabel tampilan tidak memuat 7 peran; Admin ETA vs Admin Tenant | **Perbaiki**: 7 peran; Admin ETA memakai `hr` (sama dengan `requireRole`); tampilan Admin Tenant dan Super Admin ke B11/B12 |
| 5 | Nama ke HR/atasan, topik minimum, retensi dan teks kaki adalah keputusan bisnis | **Diangkat ke user** (kartu keputusan nama); dibangun dengan rekomendasi (kode samaran). Topik "hari ini" HR dijawab dari fakta yang ada; topik promosi, pelatihan, 5C, dampak menunggu modulnya (perluasan). Retensi 90 hari dan bunyi teks kaki dicatat di PR |
| 6 | Audit `self: true` untuk tampilan atasan/HR; aturan "lainnya" tak terdefinisi | **Perbaiki**: `employeeIds` per tampilan; aturan ambang dihapus karena atasan memang berhak atas timnya dan auditnya kini memuat seluruh tim |
| 7 | Job retensi tidak bisa dibangun dari spek | **Perbaiki**: nama `assistant-logs-cleanup`, satu `DELETE` dengan batas per tenant, timer infra dicatat di PR |
| 8 | Urutan log/audit/pemakaian tidak atomik | **Perbaiki**: log awal, pemakaian best effort, audit dulu lalu log diperbarui; audit gagal → `error` |
| 9 | Pola penolakan dan bentuk "tidak tahu" ambigu | **Perbaiki**: regex final dengan contoh; JSON `answer: null`; `refused` dari model |
| 10 | Fakta di instruksi sistem | **Perbaiki**: instruksi sistem statis, fakta dan pertanyaan di pesan pengguna berpembatas, string dipotong |
| 11 | Kontrak kecil (kode 400, salam, impor, pengguna aktif, halaman permintaan data, e2e) | **Perbaiki**: kode dan teks ditulis; fakta admin (impor, pengguna) ikut tampilan admin ke B11; permintaan data tanpa tombol; e2e panel menyusul bersama layar di atas PR B3 |

## Catatan triase code review (mattpocock-skills:code-review, 19 Nov)

Dua sumbu, subagent baru masing-masing, titik tetap `6ff9541` (diff B17 saja; store ada di commit sebelumnya).

| Sumbu | Temuan | Putusan |
| --- | --- | --- |
| Spec | Regex penolakan diberi lookahead tambahan, "Karyawan B berapa skornya?" lolos | **Perbaiki**: kembali ke regex spek |
| Spec | `ctx` penyusun fakta tidak sama dengan spek (tanpa `scope`, `flags`, `settings`) | **Perbaiki**: `ctx` memuat semuanya; spek diperbarui dengan `conf` dan `team` |
| Spec | Tampilan hr memanggil store dengan `{ all: true }`, bukan `visibleEmployeeScope()` | **Perbaiki**: semua penyusun memakai `ctx.scope` |
| Spec | Tiruan tidak menjawab "hari ini" dari `perbaikan` dan `permintaanData`; kunci lain tanpa aturan | **Perbaiki**: aturan "hari ini" merangkai tiga fakta; aturan `rencana`, `rencanaTim`, `wawancara`, `saya` ditambah |
| Spec | Store masuk commit sebelumnya | **Dicatat di PR** |
| Spec | Indeks `assistant_logs_created_idx` di luar spek | **Terima**: dipakai job retensi; spek diperbarui |
| Spec + Standards | Teks penolakan dari model tidak melewati `restoreNames` | **Perbaiki** |
| Standards | `registerPage` selalu melempar (objek beku) | **Perbaiki** + test unit `registerFactBuilder`/`registerPage`/`registerView` |
| Standards | Fakta sudah terkirim ke model sebelum audit; fail closed hanya menutup respons dan log | **Terima**: audit `assistant.answer` mencatat jawaban yang diterima pengguna; panggilan model sendiri tercatat di `ai_usage_logs` (R3-6) dengan `user_id` |
| Standards | Nama anggota tim ikut di ekspor data atasan (`assistantLogs`) | **Terima**: itu jawaban yang memang diterima atasan dalam cakupannya; ekspor HR tetap HR. Dicatat di PR untuk pemilik dokumen privasi |
| Standards | "rekan tim" pada pertanyaan umum ikut ditolak | **Terima**: regex final spek (penghemat panggilan, hanya tampilan karyawan); dipantau dari log `refused` |
| Standards | Kunci peran sebagai string | **Perbaiki**: `ROLES.*` |
| Standards | Batas retensi 1–365 ada di JS dan SQL; kata kunci tiruan ganda; `v`; registri tanpa pemakai produksi; `wawancara` memuat sesi untuk dihitung | **Tunda/terima**: SQL perlu batas sendiri karena job lintas tenant tanpa `normalize`; registri dijanjikan untuk B11–B16; sisanya kosmetik |
