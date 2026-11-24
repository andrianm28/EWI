# B17 web · Drift spek vs kode

## b17-asisten-web.md

Dicocokkan dengan HEAD: bagian Layar (FAB 56px `smart_toy` kanan bawah, panel 380×560 `role="dialog"` ber-`aria-labelledby`, kepala primer, isi `role="log"`, chip, input "Tanya apa saja" `maxlength=500`, "Kirim", catatan kaki), Keputusan 1–16, Test 1–11, dan Checklist file.

- Drift ditemukan dan diperbaiki di spek: keputusan 10 tidak menyebut bahwa draf hanya dikembalikan bila input masih kosong (kode `store.ts` `if (!draft.value) draft.value = q`). Spek diperbarui.
- Drift dari code review (P-1 sampai P-3) sudah masuk spek: penutupan panel saat keluar/akun lain, draf ikut dikosongkan, gulir otomatis (keputusan 16).
- Sisanya: no drift detected.

## b17-asisten-elgos.md (bagian yang disentuh)

- Letak layar `screens/asisten/ShellExtra.vue` → `screens/b17-asisten/ShellExtra.vue` (pola nama folder `bN-*`): diperbarui di paragraf status dan daftar file.
- Kunci halaman di `apps/web/src/api/assistant.ts` menyebut `aiv`; API (`facts.js` `PAGE_LABEL`) mengirim `iv`. Komentar diperbaiki; tipe `AssistantView` ditambah `super` (API sudah menerimanya).
- Admin Tenant tanpa panel: konsisten dengan "Bukan tujuan: tampilan Admin Tenant (B11)"; dicatat di paragraf status.
- `apps/api`: tidak diubah; tidak ada bug penghalang.

## gaps-shell.md S1, gaps-peran.md X-1

Ditandai ditutup dengan tautan ke spek tahap; Admin Tenant (mockup punya FAB dengan saran impor/pengguna) tercatat ditunda.
