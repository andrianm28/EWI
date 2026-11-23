# P2 · Bug tampilan pasti (paritas mockup)

Bagian dari [rencana paritas](README.md). Lingkup: tiga bug tampilan yang membuat layar berbeda dari mockup Pak Eji tanpa ada keputusan desain yang dipertaruhkan.

## Gap yang ditutup

| Gap | Layar | Sebab | Perbaikan |
| --- | --- | --- | --- |
| modul X-1, LI-26 | `/prog`, `/req`, `/req/draf/:id` dibuka langsung | Kelas `li-*` hanya ada di `<style>` `LibraryView.vue`; chunk CSS Library tidak termuat bila Library belum dibuka | Pindah ke `screens/b13-li/li.css`, diimpor keempat view |
| shell S2 | Top bar akun multi-peran di lebar 1280 | Tombol tema (bukan bagian mockup) menambah 56px sehingga bar membungkus ke baris kedua | Tombol tema pindah ke kaki drawer sebagai butir "Mode gelap" (`aria-pressed` tetap). Top bar = urutan mockup: judul · pil audit · Tampilan · identitas · Keluar |
| peran (Hasil saya) | Undangan wawancara di `/my` | `.b8-list { margin: 0 }` didefinisikan setelah `.b8-sub`, jadi jarak 20px hilang | `.b8-list.b8-sub { margin-bottom: 20px }` |

## Keputusan

- Mode gelap tetap ada (spek B0 bagian 3), hanya letaknya yang pindah. `[⚠️ BELUM TERVERIFIKASI]` apakah Pak Eji ingin mode gelap terlihat sama sekali; tidak diubah tanpa keputusan.

## Test

- [x] `e2e/paritas.spec.ts`: bar ≤ 64px di 1280 untuk HR + karyawan; tombol Mode gelap ada di drawer, tidak di top bar.
- [x] `e2e/li.spec.ts`: `/prog` dibuka langsung, grup Jabatan `display: flex`.
- [x] `e2e/b8-karyawan.spec.ts`: undangan `margin-bottom: 20px`.
- [x] `shell.spec.ts`, `alur/menu-peran.spec.ts`: hitung grup lewat `button[aria-expanded]` karena drawer kini punya satu tombol non-grup.

## File

- [x] `apps/web/src/screens/b13-li/li.css` (baru), `LibraryView.vue`, `ProgramView.vue`, `RequestsView.vue`, `DraftView.vue`
- [x] `apps/web/src/components/AppTopBar.vue`, `AppDrawer.vue`
- [x] `apps/web/src/screens/b8-karyawan/b8.css`
