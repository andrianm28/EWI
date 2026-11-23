# P2 · Bug tampilan pasti (paritas mockup)

Bagian dari [rencana paritas](README.md). Lingkup: tiga bug tampilan yang membuat layar berbeda dari mockup Pak Eji tanpa ada keputusan desain yang dipertaruhkan.

## Gap yang ditutup

| Gap | Layar | Sebab | Perbaikan |
| --- | --- | --- | --- |
| modul X-1, LI-26 | `/prog`, `/req`, `/req/draf/:id` dibuka langsung | Kelas `li-*` hanya ada di `<style>` `LibraryView.vue`; chunk CSS Library tidak termuat bila Library belum dibuka | Pindah ke `screens/b13-li/li.css`, diimpor keempat view |
| shell S2 | Top bar akun multi-peran di lebar 1280 | Tombol tema (bukan bagian mockup) menambah 56px sehingga bar membungkus ke baris kedua | Tombol tema pindah ke kaki drawer sebagai butir "Mode gelap" (`aria-pressed` tetap). Basis lebar judul 160px (mockup 200px) karena tanpa itu sisa ruang hanya ±1px dan CI membungkus; saat satu baris judul tetap melebar, jadi tampilannya sama. Top bar = urutan mockup: judul · pil audit · Tampilan · identitas · Keluar |
| peran (Hasil saya) | Undangan wawancara di `/my` | `.b8-list { margin: 0 }` didefinisikan setelah `.b8-sub`, jadi jarak 20px hilang | `.b8-sub` dipindah ke bawah `.b8-list` |

## Keputusan

- `[⏳ DITERIMA]` Admin Tenant dengan tiga tampilan (Admin Tenant · HR / L&D · Karyawan (saya)) tetap membungkus ke baris kedua di 1280 dan kurang 1px di 1440. Mockup punya batas yang sama: lebar minimum bar mockup (judul 200 + pil + tiga segmen + identitas + Keluar + jarak) melebihi ruang konten, dan bar mockup hanya terpotong di 64px. Tidak diubah tanpa keputusan desain (mis. menyingkat label segmen).
- Mode gelap tetap ada (spek B0 bagian 3), hanya letaknya yang pindah. `[⚠️ BELUM TERVERIFIKASI]` apakah Pak Eji ingin mode gelap terlihat sama sekali; tidak diubah tanpa keputusan.

## Test

- [x] `e2e/paritas.spec.ts`: bar ≤ 64px di 1280 untuk HR + karyawan dan atasan + karyawan; tombol Mode gelap ada di drawer, tidak di top bar; di lebar 600 Mode gelap terjangkau lewat drawer.
- [x] `e2e/li.spec.ts`: `/prog` dibuka langsung, grup Jabatan `display: flex`; `/req` dibuka langsung, `.li-split` `display: grid`.
- [x] `e2e/b8-karyawan.spec.ts`: undangan `margin-bottom: 20px`.
- [x] `e2e/shell.spec.ts`, `e2e/alur/menu-peran.spec.ts`: hitung grup lewat helper `grupAkordion` (`e2e/support/sesi.ts`, `.el-drawer__list button[aria-expanded]`) karena drawer kini punya satu tombol non-grup.
- [x] Snapshot visual `shell-beranda-*` dan `dashboard-hr-*` diperbarui (top bar tanpa tombol tema, kaki drawer).

## File

- [x] `apps/web/src/screens/b13-li/li.css` (baru), `LibraryView.vue`, `ProgramView.vue`, `RequestsView.vue`, `DraftView.vue`
- [x] `apps/web/src/components/AppTopBar.vue`, `AppDrawer.vue`
- [x] `apps/web/src/screens/b8-karyawan/b8.css` (`.b8-sub` dipindah ke bawah `.b8-list`, tanpa duplikasi nilai)
- [x] `docs/designs/b0-fondasi-ui.md` bagian 3 dan 5.4: letak tombol tema
