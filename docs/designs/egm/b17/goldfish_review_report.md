Status: resolved

# Goldfish Annotated Review Report

**Target:** `docs/designs/b17-asisten-elgos.md` (full file) dan diff `origin/claude/project-thread-scbrmb...HEAD` bagian B17

Sumber temuan: tahap 5 (zoom-out, inventive), 6 (comprehension), 7 (style, structural, design), 8 (zoom-out lanjutan), 9 (implementation-readiness, codebase-details), dan `mattpocock-skills:code-review` (Standards, Spec). Laporan mentah: `zoom_out_report.md`, `comprehension_report.md`, `critic_report.md`, `../cr/`. Triase mengikuti brief aturan 11 langkah 3: perbaiki, tolak dengan alasan, atau tunda; temuan yang mengubah tujuan bisnis diangkat ke user.

## Prioritized Findings & AI Suggestions

### [Issue 1] [`egm-zoom-out`, `egm-design`, Spec] - Severity: Blocker
*   **Affected Scope:** Tampilan peran
*   **Discrepancy Description:** Pemetaan peran bertentangan dengan B0 §5.1 (`pimpinan`/`role_leader` → atasan, `eta_admin` → super); panel akan mendapat 403/400.
*   ***AI Suggestion:*** PROPOSE FIX (diterapkan)
*   ***Justification:*** B0 adalah kontrak UI yang sudah digabung (#18).
*   ***Proposed Edit:*** `views.js` mengikuti B0; `super` memakai fakta hr (peralihan B0); tabel spek diganti. Test unit + integrasi 9.

### [Issue 2] [`egm-design`] - Severity: Blocker
*   **Affected Scope:** Prinsip privasi, Port AI
*   **Discrepancy Description:** Klaim "model tidak pernah menerima nama" tidak berlaku untuk teks pertanyaan.
*   ***AI Suggestion:*** PROPOSE FIX (diterapkan)
*   ***Justification:*** Keputusan user "model tidak melihat nama"; pencocokan dengan daftar nama pengguna tenant murah.
*   ***Proposed Edit:*** `maskNames` sebelum panggilan model; prinsip butir 3; sisa risiko di tabel Risiko. Test unit + integrasi 7.

### [Issue 3] [`egm-design`] - Severity: Blocker
*   **Affected Scope:** Kode samaran
*   **Discrepancy Description:** `K<n>` bertabrakan dengan istilah "K3".
*   ***AI Suggestion:*** PROPOSE FIX (diterapkan)
*   ***Justification:*** Tabrakan menyisipkan nama orang ke nama kompetensi dan mengotori audit.
*   ***Proposed Edit:*** Token `[[ORANG_n]]`, `[[ORANG_LAIN]]` → "orang lain"; test "K3 tidak diganti".

### [Issue 4] [`egm-structural`, `egm-design`, `egm-zoom-out`] - Severity: Blocker
*   **Affected Scope:** seluruh dokumen
*   **Discrepancy Description:** Tidak ada bagian Alternatif dan Risiko; tidak ada legenda penanda; status basi.
*   ***AI Suggestion:*** PROPOSE FIX (diterapkan)
*   ***Proposed Edit:*** Bagian "Alternatif yang dipertimbangkan" dan "Risiko dan mitigasi"; legenda penanda; status diperbarui.

### [Issue 5] [`egm-zoom-out` Y1] - Severity: Major
*   **Discrepancy Description:** Jadikan penjawab aturan jalur utama POC, LLM di balik flag kedua.
*   ***AI Suggestion:*** CONTEST
*   ***Justification:*** Keputusan user 19 Nov (kartu keputusan nama) memilih model dengan nama tersamar; mesin aturan tetap ada sebagai penyedia tiruan. Dicatat di tabel Alternatif.

### [Issue 6] [`egm-zoom-out` Y2] - Severity: Major
*   **Discrepancy Description:** Hapus kode samaran, kirim angka saja.
*   ***AI Suggestion:*** CONTEST
*   ***Justification:*** Opsi "angka saja" tidak dipilih user. Masalah turunannya (tabrakan K3) diselesaikan Issue 3.

### [Issue 7] [`egm-zoom-out` Y3, Spec] - Severity: Major
*   **Discrepancy Description:** Kunci halaman tidak cocok dengan menu B0 (`aiv` = cca).
*   ***AI Suggestion:*** PROPOSE FIX (diterapkan)
*   ***Proposed Edit:*** `iv` untuk karyawan, `tna` untuk atasan/hr; web menampilkan tombol hanya bila `routeOpen(page, view)` lolos.

### [Issue 8] [`egm-design`, Spec, impl-readiness, codebase-details] - Severity: Major
*   **Discrepancy Description:** `tinjauan`, `perbaikan`, `permintaanData` tidak memakai `ctx.scope`; klaim triase tidak akurat.
*   ***AI Suggestion:*** PROPOSE FIX (diterapkan)
*   ***Proposed Edit:*** Satu titik penegakan: tampilan hr/super mensyaratkan `scope.all` (403). Facade store terikat tenant DECLINE (berlebihan untuk POC).

### [Issue 9] [impl-readiness] - Severity: Major
*   **Discrepancy Description:** Retensi gagal untuk semua tenant bila satu tenant menyimpan angka besar.
*   ***AI Suggestion:*** PROPOSE FIX (diterapkan)
*   ***Proposed Edit:*** `CASE` bertingkat + regex `^[0-9]{1,3}$`; test merah lalu hijau.

### [Issue 10] [`egm-design`, impl-readiness] - Severity: Major
*   **Discrepancy Description:** Pembatas `<fakta>`/`<pertanyaan>` bisa ditutup dari data; kontrak rendering belum ada.
*   ***AI Suggestion:*** PROPOSE FIX (diterapkan)
*   ***Proposed Edit:*** `fence()` mengganti `< >`; kontrak teks polos di spek; test unit. Membuang URL dari jawaban DECLINE (jawaban teks polos tanpa autolink cukup).

### [Issue 11] [Standards, `egm-zoom-out` Y4] - Severity: Major
*   **Discrepancy Description:** Registri `registerView/FactBuilder/Page` spekulatif.
*   ***AI Suggestion:*** PROPOSE FIX (diterapkan)
*   ***Proposed Edit:*** Dihapus beserta test; paket lain menambah baris `BUILDERS`.

### [Issue 12] [`egm-design`] - Severity: Major
*   **Discrepancy Description:** Kuota Bedrock bersama wawancara; tanpa pembatas per tenant.
*   ***AI Suggestion:*** DECLINE (tunda)
*   ***Justification:*** PO-10 C tanpa plafon; ukuran pilot kecil. Dicatat di Risiko sebagai `[⚠️]` untuk thread infra.

### [Issue 13] [`egm-design`] - Severity: Major
*   **Discrepancy Description:** Nama anggota tim tertinggal di log/ekspor atasan setelah akun anggota dihapus.
*   ***AI Suggestion:*** DECLINE (tunda)
*   ***Justification:*** Retensi membatasi; dicatat di Risiko untuk pemilik dokumen privasi.

### [Issue 14] [`egm-design`, codebase-details] - Severity: Major
*   **Discrepancy Description:** Fakta HR memuat semua sesi/draf ke memori; logika "Hasil saya" dan held/overdue diduplikasi.
*   ***AI Suggestion:*** DECLINE (tunda)
*   ***Justification:*** Optimasi sebelum ada ukuran tenant; ambang dicatat di Risiko (> 1.000 karyawan). Ekstraksi helper bersama ditunda agar diff tidak melebar sebelum review Andrian.

### [Issue 15] [codebase-details, impl-readiness] - Severity: Major
*   **Discrepancy Description:** `AI_BAD_OUTPUT` = 502, bukan 503; rencana test kurang (penolakan dari model, fail closed, tenant lain tipis).
*   ***AI Suggestion:*** PROPOSE FIX (diterapkan)
*   ***Proposed Edit:*** Langkah 7 menyebut 502/503; test integrasi 8, 13; data tenant lain ditambah (sesi, rencana, permintaan data, temuan INA).

### [Issue 16] [Standards] - Severity: Nit
*   **Discrepancy Description:** "undangan" di teks asisten; duplikasi `OPEN`, `countBy`, builder `gap`/`gapTim`.
*   ***AI Suggestion:*** PROPOSE FIX untuk istilah (diterapkan: "wawancara akar masalah"), DECLINE untuk duplikasi kecil.

### [Issue 17] [`egm-design` nit] - Severity: Nit
*   **Discrepancy Description:** Baris `pending` yatim; audit `answered` vs log `error`; `hashtext` 32-bit.
*   ***AI Suggestion:*** DECLINE
*   ***Justification:*** Dicatat di Risiko (`pending`); sisanya tidak mengubah perilaku yang terlihat.

Ringkas: 11 diterapkan, 2 dibantah dengan bukti keputusan user, 4 ditunda/ditolak dengan alasan, 0 eskalasi baru.
