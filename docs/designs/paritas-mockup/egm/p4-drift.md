## p4-login.md

No drift detected. Dicocokkan dengan kode di HEAD:

- Gap L1: `views/EmailLinkView.vue` memakai `components/LoginLayout.vue`, `UiErrorSummary` (galat "Link tidak lengkap…" dan galat server), `UiButton` filled "Lanjutkan masuk" + text "Ke halaman login" (`to="/login"`); tanpa kelas Tailwind.
- Gap L2: `views/LoginView.vue` `step` `'form' | 'sent'`; langkah 2 h1 "Periksa email Anda" (`tabindex=-1`, difokuskan), sub menyebut email, `UiErrorSummary`, catatan `role="status"` berisi pesan server, "Kirim ulang" (memanggil `sendLink`, endpoint sama) + "Kembali" (text, fokus ke `#em`). Tanpa kolom sandi atau kode di langkah 2.
- L3: `:slotted(.lg-h1)` 24/32 weight 400 margin `0 0 4px`. L4: `.lg-logo` r12, 700, 15px, `.5px`; `UiIcon` ukuran bawaan 22; `.lg-small` opacity .7. L5: `UiAuditLine class="lg-meta"` margin-top 28px. L6: `.lg` flex-wrap, `.lg-l` `1 1 420px` padding 48, `.lg-r` `1 1 460px` padding 32, `.lg-c` max 420, `.lg-sub` `0 0 8px`. L7: media query penyembunyi dihapus.
- Keputusan: nama "Lanjutkan masuk" tetap, `e2e/support/sesi.ts` tidak berubah; tidak ada perubahan `apps/api`; tidak ada flag baru.
- Test dan File yang disebut ada; `e2e/login.spec.ts` 11 test hijau.

Catatan di luar spek P4: `docs/designs/b1-login.md` baris 41 menyebut tombol "/masuk → Masuk"; nama sebenarnya "Lanjutkan masuk" sejak sebelum P4. Bukan drift P4; dibiarkan.
