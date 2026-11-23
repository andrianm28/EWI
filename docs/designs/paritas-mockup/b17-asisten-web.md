# B17 web · Panel Asisten ELGOS (paritas mockup)

Bagian dari [rencana paritas](README.md). Paket: [B17 Asisten ELGOS](../b17-asisten-elgos.md) (backend, kontrak `GET /api/assistant` dan `POST /api/assistant/ask`, flag `assistant`). Tahap ini hanya layar web; `apps/api` tidak diubah.

## Tujuan

FAB `smart_toy` di kanan bawah setiap layar ber-shell dan panel chat "Asisten ELGOS" persis mockup Pak Eji (`tools/mockup-render/Main.dc.html` baris 1235–1250, CSS `.fab`/`.asst`/`.chat`/`.msg` baris 103–108 dan 138–142, logika `asOpen`/`asTurns`/`asDraft`/`asReply` baris 1741–1768 dan 2119–2120). Jawaban berasal dari API B17, bukan `RULES` mockup.

Referensi foto: `node catalog.cjs` dengan `{ asOpen: true }` untuk hr, atasan, karyawan, admin, super, HR sebagai karyawan, dan satu state berisi percakapan dengan tombol "Buka Rencana belajar".

## Gap yang ditutup

| Gap | Isi |
| --- | --- |
| shell S1 | FAB + panel `.asst` di semua layar ber-shell |
| peran X-1 | Sama dengan S1 (tercatat di dua grup) |

## Layar (urutan mockup)

1. **FAB** (`button`, `aria-label="Buka Asisten ELGOS"`): bulat 56px, `position: fixed; right: 24px; bottom: 24px`, latar `--el-primary`, ikon `smart_toy`, bayangan `--el-shadow`. Tidak tampil saat panel terbuka (mockup `asFab = !asOpen`).
2. **Panel** (`div role="dialog"`, `aria-labelledby` judul, non-modal seperti mockup: tanpa scrim dan tanpa `aria-modal`): 380×560px, `max-width: calc(100vw - 32px)`, `max-height: calc(100vh - 48px)`, sudut 20px, garis `--el-outline-variant`, bayangan `0 8px 24px rgb(0 0 0 / .25)`, `z-index: 50`.
   - **Kepala** (latar `--el-primary`, teks `--el-on-primary`): "Asisten ELGOS" (500) dan "Tanyakan urusan Anda · {roleLabel}" (12px, opasitas .85); tombol teks ikon `close` `aria-label="Tutup"`.
   - **Isi** (`role="log"`, `aria-live="polite"`): gelembung `ai` (latar `--el-surface-2`, sudut kiri bawah 4px, rata kiri) dan `me` (latar `--el-primary`, rata kanan), lebar maks 88%, label kecil "Asisten ELGOS"/"Anda" (11px). Gelembung pertama selalu salam. Gelembung jawaban dengan `action` memuat tombol tonal kecil "Buka {label}" ke rute `action.page`.
   - **Kaki**: chip saran (`button`, 12px, tinggi min 30px, garis `--el-outline`, sudut 8px), lalu baris input "Tanya apa saja" (`aria-label="Pertanyaan"`, tinggi 40px) + tombol "Kirim", lalu catatan 11px `disclaimer`.

## Keputusan

1. **Letak**: `apps/web/src/screens/b17-asisten/ShellExtra.vue` (dipasang `AppShell` lewat glob, B0 5.3) dan `screens/b17-asisten/store.ts` (Pinia). Nama folder mengikuti pola `bN-*`; spek B17 menyebut `screens/asisten/` dan diperbarui.
2. **Gerbang**: tampil hanya bila `session.hasFlag('assistant')` dan tampilan aktif salah satu `karyawan`, `atasan`, `hr`, `super`. Halaman login dan `/masuk` tidak memakai `AppShell`, jadi panel tidak pernah ada di sana.
3. **Admin Tenant tidak mendapat asisten** (`[⏳ DITUNDA]`): mockup memasang FAB untuk Admin Tenant dengan saran impor dan pengguna, tetapi B17 menyatakan tampilan Admin Tenant bukan tujuan dan API memetakan `tenant_admin` ke label "Karyawan". Menampilkannya akan berbunyi "Tanyakan urusan Anda · Karyawan" di layar admin. Akun admin yang memilih tampilan HR atau Karyawan tetap mendapat asisten.
4. **Teks dari API**: `roleLabel`, salam, saran, dan catatan kaki diambil dari `GET /api/assistant?view={tampilan aktif}`; selama intro dimuat (atau gagal), dipakai teks mockup dengan label tampilan B0 (`VIEW_LABEL`). Saran mockup yang topiknya belum punya fakta (promosi, impor) memang tidak dikirim API (B17).
5. **Tampilan yang dikirim** = `session.activeView` (salah satu dari empat di atas), baik di `GET` maupun `POST /ask`.
6. **Tombol "Buka"** hanya bila `routeOpen(action.page, activeView)` lolos (kontrak B17). Label tombol = "Buka " + `action.label` dari API. Klik menavigasi; panel tetap terbuka seperti mockup.
7. **State bertahan saat pindah halaman** (B0 5.3: `ShellExtra` dipasang ulang tiap halaman): `open`, `turns`, `draft`, `intro`, `pending` di store Pinia. Store diberi kunci `{user.id}|{tampilan}`; bila kunci berubah (ganti tampilan, keluar, akun lain) percakapan dan intro dikosongkan (mockup mengosongkan `asTurns` saat ganti peran). Riwayat dibatasi 40 gelembung terakhir.
8. **Fokus**: buka → fokus ke input pertanyaan. Tutup (tombol Tutup atau Esc saat fokus di dalam panel) → fokus kembali ke FAB. Esc ditangani di panel dan tidak diteruskan ke penangan Esc drawer di `AppShell`. Setelah tombol "Buka" menavigasi, panel yang dipasang ulang mengembalikan fokus ke input supaya fokus tidak jatuh ke `body`. Panel non-modal, jadi tidak ada perangkap fokus.
9. **Menunggu jawaban** (tambahan, mockup sinkron): gelembung `ai` "Sedang menyiapkan jawaban…"; Kirim dan chip nonaktif selama menunggu. Input tetap bisa diketik.
10. **Galat**: `ask` gagal → gelembung `ai` berisi pesan API (`RATE_LIMITED`, `AI_UNAVAILABLE`, `AI_BAD_OUTPUT`) atau "Asisten sedang tidak bisa menjawab. Coba lagi nanti." bila bukan galat API. Draf dikembalikan ke input supaya bisa dikirim ulang. Intro gagal → salam dan catatan mockup tetap tampil, chip kosong.
11. **Teks polos**: jawaban ditampilkan lewat interpolasi `{{ }}` (kontrak B17), tanpa `v-html`.
12. Input dibatasi `maxlength="500"` (batas API); kiriman kosong setelah di-trim diabaikan. Enter mengirim (form submit).
13. Token `--el-*` saja; mode gelap ikut token. Kelas berawalan `b17-`.

## Test (e2e, `apps/web/e2e/asisten.spec.ts`, API di-mock)

1. Flag `assistant` mati → tidak ada tombol "Buka Asisten ELGOS".
2. Halaman login → tidak ada FAB.
3. Per tampilan karyawan, atasan, hr, super: klik FAB → dialog "Asisten ELGOS" dengan "Tanyakan urusan Anda · {roleLabel}", salam, chip saran dari API, catatan kaki; FAB hilang; input terfokus; `GET /assistant?view=` membawa tampilan aktif.
4. Admin Tenant (tampilan `admin`) → tidak ada FAB.
5. Kirim pertanyaan (ketik + Enter, dan klik chip) → gelembung "Anda" + jawaban; body `POST /assistant/ask` = `{ question, view }`; tombol "Buka Rencana belajar" menavigasi ke `/li` dan panel tetap terbuka dengan percakapan utuh.
6. `action` ke rute yang tidak bisa dibuka → tanpa tombol.
7. Esc menutup panel dan fokus kembali ke FAB; tombol Tutup juga.
8. Galat 429 → pesan API tampil di gelembung, draf kembali ke input.
9. Ganti tampilan (HR → Karyawan) → percakapan dikosongkan, label "Karyawan".
10. Snapshot visual panel terbuka dengan percakapan (karyawan, 1440×900).

## Checklist file

- [ ] `apps/web/src/screens/b17-asisten/ShellExtra.vue` (baru)
- [ ] `apps/web/src/screens/b17-asisten/store.ts` (baru)
- [ ] `apps/web/src/api/assistant.ts` (tipe `AssistantView` + `super`, komentar kunci halaman)
- [ ] `apps/web/e2e/asisten.spec.ts` (baru) + snapshot
- [ ] `docs/designs/b17-asisten-elgos.md` (letak layar, butir checklist web)
- [ ] `docs/designs/paritas-mockup/gaps-shell.md` S1, `gaps-peran.md` X-1 (status ditutup)
- [ ] `docs/designs/paritas-mockup/egm/b17-asisten-web-code-review.md`, `egm/b17-asisten-web-drift.md`
