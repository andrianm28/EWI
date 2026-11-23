# Review diff ikan mas (egm:egm-codebase-details) · B8 web, triase egm-resolve

Laporan subagent (read-only, disalin ringkas). Tidak ada temuan tinggi; 4 sedang, 9 rendah, 4 catatan dokumen. Tidak ada pelanggaran CLAUDE.md.

| # | Temuan | Keputusan |
| --- | --- | --- |
| M1 | `consentWithdrawnAt` di daftar putih bersama terlihat atasan dan Super Admin (tekanan atas persetujuan, UU PDP); daftar sesi sudah membocorkannya ke atasan | **Perbaiki**: `sessionView({ withdrawal })` hanya HR + yang diwawancarai; `listView` membuang kolom untuk peran lain; test unit baru |
| M2 | Sesi `completed` yang kemudian ditarik masih "Ringkasan sudah dikirim" | **Perbaiki** + test e2e |
| M3 | Fokus hilang saat panel konfirmasi tertutup | **Perbaiki**: fokus kembali ke pemicu (Batal) atau ke pesan hasil (sukses) |
| M4 | Teks undangan lewat beda dengan B6 | **Perbaiki** (= P1) |
| L5 | `ADMIN_ACCOUNT` memblokir lebih luas dari `DELETE /:userId` (cek `roles`) | **Perbaiki**: peran utama akun saja, web memakai `primaryRole` |
| L6 | Halaman kosong bila pemulihan `FEATURE_DISABLED` tidak berpindah | **Perbaiki**: `leaveIfDisabled` mengembalikan false bila rute tidak berubah, galat + Coba lagi tampil |
| L7 | "Coba lagi" berulang, urutan respons | **Perbaiki**: tombol nonaktif saat memuat, penghitung urutan |
| L8 | Cadangan "3×24 jam WIB" | **Perbaiki** (= P2) |
| L9 | Live region dipasang bersama isinya; dua ringkasan galat berebut fokus | **Perbaiki sebagian**: status selalu ada di DOM. Rebutan fokus saat dua galat muat sekaligus **ditunda** (kasus langka, `UiErrorSummary` bersama) |
| L10 | Judul ganda dan `aria-live` di transkrip statis | **Perbaiki sebagian**: judul luar diganti `aria-label`; `role="log"` dari komponen B6 dibiarkan (tidak mengubah komponen B6 untuk satu kasus) |
| L11 | Lompatan h1 → h3 di kartu rencana | **Perbaiki**: h2 |
| L12 | Isian hapus tampil sebelum daftar termuat; `session.user!` | **Perbaiki**: `rowsLoaded`, penjaga sesi |
| L13 | Tarik persetujuan hilang bila hasil gagal | **Perbaiki**: tetap tampil |
| L14 | Salinan kode unduh | **Perbaiki** (= S3) |
| L15 | Peran ditulis langsung, ada `HR_ROLES` di B5 | **Tolak**: aturan sekarang peran utama, bukan daftar peran |
| L16 | Status tak dikenal membuat tabel galat | **Perbaiki** (= S9) |
| L17 | Daftar sesi masih "Dibatalkan" untuk yang ditarik | **Perbaiki**: "Persetujuan ditarik" |
| D1–D4 | Checklist spek, kalimat `req.user.roles`, syarat tombol tarik, galat hasil | **Perbaiki**: spek diperbarui |
