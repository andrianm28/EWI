# B8 · Tahap 5 Initial Zoom Out (egm-review, mode uninterrupted)

Target: `docs/designs/b8-karyawan.md`. Reviewer: `egm:egm-zoom-out` dan `egm:egm-inventive-catalyst`, masing-masing subagent baru, dikirim langsung dari sesi utama. Konteks: CLAUDE.md, CONTEXT.md, docs/agents/domain.md, spek B0 (PR #18), mockup Pak Eji, kode `my`, `employees`, `interviews`, `lna-stores`.

Catatan: putaran pertama lewat `egm-synthesizer` tidak bisa membuat subagent, sehingga synthesizer membaca sendiri dengan dua lensa. Satu temuannya tetap dipakai karena terbukti di kode (S1).

| Reviewer | Status | 🔴 | 🟡 | 🟢 |
| --- | --- | --- | --- | --- |
| egm-zoom-out | selesai | 0 | 4 | 4 |
| egm-inventive-catalyst | selesai | 0 (4 Major) | 4 | 3 |
| synthesizer (pembacaan sendiri) | dipakai sebagian | 1 | — | — |

## Temuan (sudah dideduplikasi)

### 🔴
- **S1. `erase: true` tidak mengosongkan ringkasan wawancara B6** (`summary_findings`, `summary_note`, `summary_disputed` di baris sesi), yang masuk lewat penggabungan scbrmb. **Sudah diperbaiki** di commit "fix(b8): erase juga mengosongkan ringkasan temuan B6" (test merah lalu hijau).

### 🟡
- **I1. Hak subjek data lepas dari flag saat menulis, tapi masih bergantung `learner.home` saat membaca**: daftar permintaan milik sendiri hanya ada di `GET /api/my/results`.
- **I2. Audit permintaan data ditulis setelah commit** di `withdrawConsent`, `createDelete`, `cancel`, dan `fulfill` tanpa erase (hanya jalur erase yang di dalam transaksi).
- **I3/Z2. Aturan "sesi ditarik" tersebar di ±13 titik** (`consent_withdrawn_at IS NULL`). Usulan: trigger DB atau ubah status temuan draf menjadi final saat penarikan.
- **I4/Z3. `erase: true` menghapus rencana yang sudah ditugaskan ke EliteMentor tanpa pembatalan di sana.**
- **Z1. Batas paket**: B8 membawa subsistem hak subjek data lintas modul; usul pisah PR.
- **Z4. Keputusan lintas modul belum menjadi ADR**; istilah "Tarik persetujuan" dan "Permintaan data" belum di CONTEXT.md.

### 🟢
- I5. Skor lengkap lawan Q45 bisa dijadikan setting tenant.
- I6. Permintaan tarik persetujuan tanpa tenggat menumpuk tanpa sinyal; tambah `ageDays`.
- I7. Penarikan bersifat global, undangan massal per proyek.
- Z5. Istilah API menyimpang dari glosarium (`invitations` lawan "Penugasan wawancara").
- Z6. `plan` di `/my/results` menduplikasi `/my/learning-plan`.
- Z7. `submoduleActive` dan `requireSubmodule` menyalin logika yang sama.
- Z8. Spek turun ke detail SQL; dua tabel triase membuat spek gemuk.

Triase: lihat `goldfish_review_report.md` setelah tahap 9.
