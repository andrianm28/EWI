# Review diff paket aksi mockup demo 25 Nov

Rentang: `claude/project-thread-scbrmb...HEAD` (5 commit fitur). Spek: `docs/designs/demo-25nov-aksi-mockup.md`.

## egm-codebase-details (ikan mas segar)
Tenant scope dan gerbang peran/flag: tidak ada cacat. Temuan:
1. Mayor: stub asisten, seri kata kunci membuat "Pelatihan mana yang perlu perhatian?" dijawab aturan tinjauan; "status rencana tim" dijawab wawancaraTim. **Diperbaiki** (urutan aturan + test).
2. Minor: Mulai sekarang bisa mengirim email berulang. **Diperbaiki** (tombol "Sudah dikabari" nonaktif).
3. Minor: `notify` tanpa cek flag `lim.reinterview` dan dicek truthy. **Diperbaiki** (`=== true`, 400 bila flag mati, test).
4. Minor: `kind` kosong jatuh ke remind. **Diperbaiki** (`??`, test 400).
5. Minor: `REMINDER_RECENT` menandai tombol selesai walau jenis lain yang terkirim. **Diperbaiki** (tidak ditandai, pesan netral).
6. Minor: spek menyebut `super` untuk tombol DNA, rute `cc` hanya `hr`. **Spek diperbaiki.**

## mattpocock code-review: Standar
- Aturan 3 (flag baru): tidak ada flag baru. **Diterima**, alasan di spek §3; keputusan Andrian.
- Aturan 7: kode bersama disentuh (UiAgentCard, router, stub-provider, ld-stores). **Andrian reviewer.**
- Teks galat memuat kode mentah. **Diperbaiki.**
- "Simpan hasil" hanya audit. **Diterima** (spek C6b: skor sudah tersimpan; audit = jejak tinjauan HR).
- Bau (penilaian): duplikasi isi email LD/LIM, predikat SQL hampir selesai dua kali, `todayJakarta` web/API, `ld-stores` impor domain, opsi boolean `reminderRecipients`, cabang `kind` berulang, nama `ld.remind`/`SENT_NOUN`, template literal kosong. Template literal **diperbaiki**; sisanya **ditunda** ke refaktor setelah demo.

## mattpocock code-review: Spek
- Tidak ada yang hilang.
- Fokus INA sebelum gulir selesai di browser tanpa Promise. **Diperbaiki** (tunggu Promise/`scrollend`, batas 800 ms).
- Lihat program untuk baris tanpa cek. **Diperbaiki** (`checks.length > 0`).
- Pesan `REMINDER_RECENT` menyebut "Pengingat" untuk semua jenis. **Diperbaiki.**
- Teks NotFound "belum tersedia untuk peran Anda" menyesatkan. **Diperbaiki.**
