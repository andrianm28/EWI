# P4 · Login langkah 2 dan `/masuk` mengikuti tata letak login (paritas mockup)

Bagian dari [rencana paritas](README.md). Lingkup: gap shell L1–L7 ([gaps-shell.md](gaps-shell.md) bagian 3). Paket asal: [B1 login](../b1-login.md) (amandemen 19 Nov: tanpa verifikasi dua langkah).

**Kode auth: reviewer wajib Andrian** (CLAUDE.md aturan 7). Tidak ada perubahan API, token, sesi, atau penyimpanan token; hanya tampilan web.

## Tujuan

Layar masuk, langkah "periksa email", dan halaman tujuan tautan `/masuk` tampil dengan tata letak dua panel mockup Pak Eji (`Main.dc.html` bagian LOGIN, baris 160–205), memakai token `--el-*` dan komponen `Ui*` saja.

## Layar mockup

- `login--cred`: panel kepercayaan kiri (`.lg-l`, `flex:1 1 420px`), panel kanan (`.lg-r`, `flex:1 1 460px`, padding 32px) berisi `.lg-c` max 420px. h1 24/32 weight 400, `.sub` margin `0 0 8px`, tombol-tombol filled/outlined bertumpuk, `.meta` mono 11px margin-top 28px.
- `login--otp`: isi panel kanan diganti: h1 "Verifikasi dua langkah", sub menyebut email, isian kode, baris tombol filled + "Kembali" (`btn x` = text), meta yang sama.

## Gap yang ditutup

| Gap | Perbaikan |
| --- | --- |
| L1 | `views/EmailLinkView.vue` ditulis ulang di dalam `components/LoginLayout.vue` (diekstrak dari `LoginView`): h1 "Masuk ke ELGOS", sub, `UiErrorSummary` untuk galat token (link tidak lengkap / gagal ditukar), baris tombol `UiButton` filled "Lanjutkan masuk" + text "Ke halaman login". Tanpa kelas Tailwind. |
| L2 | Setelah link berhasil diminta, panel kanan berganti ke langkah "Periksa email Anda" (struktur `lg.otp`): h1, sub "Bila {email} terdaftar, link masuk dikirim ke alamat itu. Link berlaku 15 menit dan hanya bisa dipakai sekali.", wilayah `role="status"` yang selalu terpasang berisi pesan server (nada info; kirim ulang yang berhasil diawali "Link baru sudah diminta."), baris tombol filled "Kirim ulang" + text "Kembali". Fokus pindah ke h1 langkah baru. "Kembali" mengembalikan formulir dengan isian organisasi/email tetap. |
| L3 | h1 weight 400, margin `0 0 4px` (h1 global mockup). |
| L4 | Logo panel kiri r12, weight 700, 15px, letter-spacing .5px; ikon kepercayaan 22px; teks kecil opacity .7. |
| L5 | Baris meta memakai `UiAuditLine` (Roboto Mono 11px), margin-top 28px. |
| L6 | `.lg` flex-wrap; `.lg-l` `flex:1 1 420px`; `.lg-r` `flex:1 1 460px`, padding 32px; `.lg-c` max 420px; sub margin `0 0 8px`. |
| L7 | Media query penyembunyi teks dihapus. Di layar sempit panel kiri membungkus ke atas (flex-wrap), semua teks tetap, tanpa gulir horizontal. |

## Keputusan

- PD-10 tetap: tidak ada kata sandi di produksi dan tidak ada kode 6 digit. Langkah 2 mockup ("Verifikasi dua langkah") diganti padanannya "Periksa email Anda"; tombol utama "Kirim ulang" mengganti "Verifikasi dan masuk".
- Pesan server ("Bila email terdaftar …") tetap tampil sebagai catatan status di langkah 2 supaya jawaban yang tidak membocorkan keberadaan akun tetap jujur. Sub sengaja tidak berkata "link sudah dikirim" secara mutlak.
- "Kirim ulang" memanggil endpoint yang sama (`POST /api/auth/email-link`); batas 3 link per 15 menit di server tidak berubah. Galat kirim ulang tampil di `UiErrorSummary` langkah 2.
- Kolom organisasi, tombol SSO, kolom sandi (non-produksi), catatan sesi habis, dan ringkasan galat (K-L1) tidak berubah.
- Galat token di `/masuk` memakai `UiErrorSummary` (judul "Ada masalah"), sama dengan formulir login.
- Padding panel kiri tetap 48px di layar sempit seperti mockup (mockup tidak punya media query). `[⏳ DITERIMA]`
- Di layar sempit formulir berada di bawah panel kepercayaan penuh (sekitar 600px pada lebar 400), jadi pengguna ponsel menggulir dulu. Itu perilaku mockup (L7 "tampilkan sesuai mockup"). `[⏳ DITERIMA]`
- "Kembali" memindahkan fokus ke kolom email (tombol yang ditekan hilang bersama langkah 2); "Kirim link masuk" yang berhasil memindahkan fokus ke h1 langkah 2.
- Aturan sub L1/L2: teks tidak boleh menyatakan link pasti terkirim, karena server menjawab sama untuk email terdaftar dan tidak terdaftar. Karena itu sub memakai "Bila … terdaftar" dan catatan status bernada info, bukan sukses.
- Di lingkungan uji (kata sandi aktif) tombol "Minta link lewat email" juga membuka langkah 2. Di produksi hanya "Kirim link masuk".
- Tidak ada jeda tunggu (cooldown) di tombol "Kirim ulang"; batas server 3 link per 15 menit yang menahan, dan galatnya tampil di ringkasan. `[⏳ DITERIMA]`
- Teks kepercayaan panel kiri tidak berubah dan tetap tunduk pada K3 (tanpa klaim OJK).
- Tombol dan aksi dijaga dari klik ganda (`if (loading) return`) di `sendLink` dan `enter`.
- Setelah token ditolak server, "Lanjutkan masuk" disembunyikan: token sekali pakai tidak bisa dicoba ulang, pengguna diarahkan ke "Ke halaman login".
- Tidak ada flag baru: perubahan tampilan paritas atas layar yang sudah ada, bukan fitur baru (sama dengan P2).
- `LoginLayout` memegang panel kiri, `<main id="isi-login">`, dan baris meta; isi panel kanan lewat slot. Nama aksesibel tombol "Lanjutkan masuk" dipertahankan, jadi `loginSebagai` (`e2e/support/sesi.ts`) tidak berubah.

## Test (e2e, API di-mock)

`e2e/login.spec.ts`:

- [x] L2: produksi, kirim link → heading "Periksa email Anda", teks memuat email, status memuat pesan server, tanpa kolom sandi/kode; "Kirim ulang" mengirim permintaan kedua dengan isi sama; "Kembali" → heading "Masuk ke ELGOS", email tetap terisi.
- [x] L2: kirim ulang ditolak server (429) → ringkasan galat di langkah 2.
- [x] L1: `/masuk#token=…` → panel "Tentang ELGOS" terlihat, heading "Masuk ke ELGOS", tombol "Lanjutkan masuk" ber-kelas `el-btn`, meta `.el-audit`, tidak ada kelas `slate`/`bg-white`.
- [x] L1: `/masuk` tanpa token → ringkasan galat "Link tidak lengkap…", tanpa tombol "Lanjutkan masuk", tautan "Ke halaman login".
- [x] L1: token ditolak (401) → ringkasan galat memuat pesan server.
- [x] L3–L6: h1 24px weight 400; logo r12 weight 700 15px; meta Roboto Mono 11px; `.lg-c` max 420px; di 1280 kedua panel berdampingan.
- [x] L7: lebar 400px → kalimat utama terlihat, panel kiri di atas panel kanan, tanpa gulir horizontal.
- [x] Review: sub langkah 2 memakai "Bila {email} terdaftar"; kirim ulang yang berhasil menampilkan "Link baru sudah diminta." di wilayah status.
- [x] Review: token ditolak (401) → tombol "Lanjutkan masuk" hilang.
- [x] Review: `#token` dihapus dari address bar sebelum tombol ditekan.
- [x] Fokus: h1 langkah 2 setelah kirim; kolom email setelah "Kembali".
- [x] Tetap hijau: `login.spec.ts` lama, `gating.spec.ts`, semua spec yang memakai `loginSebagai`.

## File

- [x] `apps/web/src/components/LoginLayout.vue` (baru)
- [x] `apps/web/src/views/LoginView.vue`
- [x] `apps/web/src/views/EmailLinkView.vue`
- [x] `apps/web/e2e/login.spec.ts`

## Review spek (langkah 2 SDLC)

Tool Agent (subagent `egm:egm-design`, `egm:egm-implementation-readiness`) tidak tersedia di sesi subagent ini, jadi review spek dilakukan sendiri dengan dua lensa itu terhadap mockup baris 160–205 dan kode `LoginView`/`EmailLinkView`/`e2e/support/sesi.ts`. Sesi induk kemudian menjalankan reviewer independen (`egm:egm-codebase-details`, `egm:egm-implementation-readiness`) atas diff; triasenya di [egm/p4-code-review.md](egm/p4-code-review.md) bagian "Review independen".

| # | Lensa | Temuan | Triase |
| --- | --- | --- | --- |
| R-1 | desain | Sub langkah 2 "Link dikirim ke {email}" (usulan gap) membocorkan keberadaan akun bila dibaca mutlak | **Perbaiki**: sub "Bila {email} terdaftar, link masuk dikirim…" + pesan server di catatan status (kalimat awal "Buka link … yang kami kirim" masih mutlak; dikoreksi setelah review independen) |
| R-2 | desain | Fokus hilang saat isi panel kanan berganti | **Perbaiki**: fokus ke h1 langkah 2 dan ke email setelah Kembali |
| R-3 | kesiapan | `gating.spec.ts` memeriksa `role=status` memuat "link masuk sudah dikirim" | **Perbaiki**: catatan status tetap ada di langkah 2 |
| R-4 | kesiapan | `loginSebagai` bergantung pada nama "Lanjutkan masuk" | **Perbaiki**: nama dipertahankan, helper tidak diubah |
| R-5 | desain | Padding 48px panel kiri di ponsel terasa besar | **Tolak dengan alasan**: mockup tanpa media query; ikut 1:1 |

## Review diff

Lihat [egm/p4-code-review.md](egm/p4-code-review.md). Drift: [egm/p4-drift.md](egm/p4-drift.md).
