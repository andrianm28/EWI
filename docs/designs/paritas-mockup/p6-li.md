# P6 · Learning Intervention (paritas mockup)

Bagian dari [rencana paritas](README.md). Lingkup: empat layar `apps/web/src/screens/b13-li` (Library, Program & Course, Permintaan & pengembangan, Draf/Pengembangan modul) dan `li.css`. Keputusan user 23 Nov: tata letak, copy, dan komponen ikut mockup 1:1; fitur kelola tambahan tidak dibuang tetapi dipindah ke pola sekunder. API tidak diubah.

Acuan domain: [b13-learning-intervention.md](../b13-learning-intervention.md), B0 (`docs/designs/b0-fondasi-ui.md` §4 token/kelas, §5.3 rute). Daftar gap: [gaps-modul.md](gaps-modul.md) §1.

## Layar mockup

`tools/mockup-render/Main.dc.html`: Library baris 726–777 (data 2005–2045), Program 780–805 (data 2026, 2048–2061), Permintaan 808–833, Pengembangan modul 836–880 (data 2078–2086). Foto: `parity/mock-shots/hr--lib`, `hr--prog`, `hr--req`, `hr--lidev--1..4`.

## Gap yang ditutup

| Gap | Perbaikan |
| --- | --- |
| LI-1 | Intro Library: "Saat ini seluruh modul berlaku untuk jabatan {X}." bila filter jabatan hanya berisi satu jabatan; "yang teridentifikasi dari DACUM Tool 2" |
| LI-2 | KPI "Butir Knowledge/Skill/Attitude", catatan "pengetahuan/keterampilan/sikap kerja"; Modul "DACUM Tool 2 dan 3, {n} rumpun" |
| LI-3 | Banner Pareto = `UiNote` info + `UiButton` filled sm; kalimat "{n} modul prioritas Pareto ({kode}) menyumbang sekitar {p} total gap. {m} modul lain belum punya data gap." + "{d} modul prioritas bersifat spesifik perusahaan dan perlu dikembangkan bersama ELGOS." (d dihitung dari daftar, hanya saat tidak ada filter tipe/level/rumpun/prioritas supaya angkanya tidak menyesatkan) |
| LI-5 | Kartu filter tonal: lima baris label (lebar 70px, muted, 500) + `UiSegmented variant="chips"` (tombol asli, `aria-pressed`, nama grup = label). Opsi "Semua jabatan"/jabatan…, "Semua modul"/"Prioritas Pareto saja", "Semua"/Knowledge/Skill/Attitude, "Semua"/level, "Semua"/rumpun. `<select>` dihapus. Gaya chip terpilih mengikuti `.rad button.on` mockup (latar `--el-secondary-container`, garis `--el-primary`) |
| LI-6 | "{tampil} dari {total} modul" teks muted di atas daftar, di luar kartu |
| LI-7 | Baris modul: grid `70px minmax(0,1fr) auto`; kode mono 12px kiri (tidak terpotong); nama 500 + "Rumpun · Level" muted 12px; chip `K n`/`S n`/`A n` netral, chip jabatan (tone training) atau "{n} jabatan" bila >1, chip Pareto critical; status chip kanan (UiChip, bukan UiStatus global). Baris terpilih latar abu `--el-surface-2` (mockup `#ECEFF5`). Baris = `<button aria-current>` di dalam `ul` (perilaku lama) |
| LI-8 | Status "Belum ada sumber" → "Belum tersedia" (labels.ts, berlaku juga di Program) |
| LI-9 | Kepala detail: chip kode (netral mono) / level (training) / rumpun (netral) di atas judul; chip status + chip Pareto; kalimat "Termasuk modul yang bersama-sama menyumbang sekitar {p} total gap{ jabatan X} (kumulatif sampai urutan ini). Sediakan lebih dulu." Modul tanpa prioritas: "Tidak termasuk modul prioritas Pareto." (hanya bila ada modul prioritas; API tidak membedakan modul tanpa data gap dari modul di luar 80%, jadi kalimat mockup "Belum ada data gap…" tidak bisa dipastikan benar) |
| LI-10 | Jabatan sebagai chip training; butir KSA berupa daftar 13px dengan garis kiri |
| LI-11 | Copy sumber dua varian mockup (dev / vendor), termasuk "Usulan awal, dapat diubah." Contoh topik "(kontrak, SLA, EliNotes, alur layanan)" tidak diambil karena data tenant demo |
| LI-12 | Ikon `auto_awesome` (ditambahkan ke `ui/icons.ts`); tombol aksi sebaris (`li-actions` tanpa wrap ≥ 400px) |
| LI-14 | Pemilih jabatan Program = tombol kartu outlined (`.li-pick`, garis `--el-primary` bila terpilih, `aria-pressed`) berisi nama + chip "Kamus tersedia" (success) / "Belum tersedia" (neutral) |
| LI-15 | Intro Program dinamis "…untuk {jabatan}, tersusun dari…"; `UiNote` info "Program ini untuk jabatan {X}. Susunan Basic, Intermediate, dan Advanced mengikuti kamus kompetensinya. Course yang sama dapat dipakai ulang di program jabatan lain." sebelum tab |
| LI-16 | Tab "{Level} · {n} course" |
| LI-17 | KPI "Diminta / draf"; catatan "program {Level} · {jabatan}", "dari {vendor}", "sedang diproses", "perlu diminta atau dikembangkan" |
| LI-18 | `UiNote` warning "Prioritas Pareto: {n} dari {m} course di program ini adalah prioritas Pareto: {kode}." (kode = course di program yang punya prioritas) |
| LI-19 | Banner vendor `UiNote` info + tombol filled sm |
| LI-20 | Satu kartu per rumpun, judul "{rumpun} · {n} course" di dalam kartu, baris dipisah garis; chip K/S/A, jabatan, status, Pareto sebaris; tombol "Detail" teks + tombol tonal kanan |
| LI-21 | Tombol per course "Minta ke {vendor pendek}" = kata pertama nama vendor ("Mahaka"); banner Library juga |
| LI-22 | Intro Permintaan "…dengan bantuan agen ELGOS…" |
| LI-23 | Hitungan kepala kartu jadi chip kanan: `review` "{n}", `training` "{n} draf" |
| LI-25 | Kandidat: tombol teks "Kembangkan" |
| (X-2 lokal) | Status permintaan vendor dan chip Pareto kandidat di Permintaan ikut memakai `UiChip` (K-P6-2) |
| LI-27 | Draf dua kolom: grid `240px minmax(0,1fr)`; kiri `UiCard tonal` berisi `UiStepper` + catatan Pendekatan (12px muted); kanan kartu konten. Satu kolom di bawah 900px |
| LI-28 (sebagian) | Chip kode/level/rumpun di atas judul. Copy "Agen ELGOS menyusun…" tidak diambil (PK-3); chip status draf tetap (data alur SME) |
| LI-30 | Note langkah 1: copy mockup bila semua terukur, copy app bila belum |
| LI-31 (sebagian) | Sesi: chip cakupan di kanan judul; asesmen: chip "{n} tujuan tercakup". Textarea tetap (PK-4) |
| LI-32 | Langkah 4: tiga butir ikon `check_circle` (success) dengan kalimat mockup; ikon `warning` + kalimat kurang bila belum terpenuhi |
| LI-33 | "Lanjut: rancang materi" / "Lanjut: asesmen" / "Lanjut: tinjau dan ajukan"; urutan langkah 4: Kembali (outlined), Kirim ke SME, Ke daftar permintaan (tonal). "Simpan perubahan" dan "Hapus draf" pindah ke `<details>` "Kelola draf" sekunder di bawah tombol navigasi |

## Tidak dikerjakan

| Gap | Alasan |
| --- | --- |
| LI-4, LI-24 | PK-1 (perlu keputusan): kalimat "ELGOS tidak mengirim apa pun…" dipertahankan |
| LI-13 | PK-2: seksi "Course di katalog" dipertahankan (fitur kelola) |
| LI-28 copy, LI-34 | PK-3: draf dibuat templat, bukan agen AI; copy tetap "templat ELGOS" |
| LI-29 | PK-4: tabel baca + tombol "Ubah" per baris menunggu keputusan pola sunting; textarea tetap |
| LI-26 | Sudah ditutup P2 (li-split) |
| LI-7 angka gap | API hanya mengirim `rank`, `share`, `cumulativeShare` (tanpa selisih skor seperti "−33"). Chip memakai "Pareto #n · {share} gap" (share = porsi skor Pareto). Bila angka gap mentah dibutuhkan, API LI perlu field baru (keputusan terpisah) |

## Keputusan

- K-P6-1: Filter memakai `UiSegmented variant="chips"` (B7) tanpa varian baru. Nilai "Semua" = kunci `''` sehingga kontrak `li.library(filter)` tidak berubah.
- K-P6-2: Status di layar LI memakai `UiChip` (tone: success → success, warning → review, info → training, neutral → neutral) karena mockup memakai chip terisi; `UiStatus` global tidak diubah (K-3). `statusLabel` mengembalikan `tone` chip.
- K-P6-3: Nama vendor pendek diturunkan di klien (kata pertama `vendorName`), tanpa field API baru. "Mahaka Institute" → "Mahaka".
- K-P6-4: Ikon `auto_awesome` tidak ada di paket `@material-symbols/svg-400` (diganti nama di Symbols); path diambil dari Material Icons outlined (Apache-2.0) dan diskalakan ke viewBox 960.

## Test (e2e, `apps/web/e2e/li.spec.ts`, API mock)

1. Library LI-5: lima grup filter (`role=group` dengan nama Jabatan/Prioritas/Tipe/Level/Rumpun) berisi tombol `aria-pressed`; "Semua jabatan" dan "Semua modul" terpilih awal; klik "Prioritas Pareto saja" → request `priority=pareto`, teks "1 dari 2 modul"; tidak ada `select` di kartu filter.
2. LI-7: baris ST-A2 memuat chip "K 1", "S 1", "A 1", "Engineer Service Delivery", "Pareto #1 · 60% gap", "Belum tersedia"; modul dengan dua jabatan menampilkan "2 jabatan"; baris terpilih berlatar abu (bukan transparan).
3. LI-1/2/3/6/9/10/11/12: copy intro, KPI, banner Pareto ber-kode, "2 dari 2 modul", kalimat kumulatif, chip jabatan, copy sumber dev.
4. LI-27: di `/req/draf/d-1` kartu stepper dan kartu konten bersebelahan (x kartu konten > x stepper + 240, y sama); catatan Pendekatan di dalam kartu stepper; tombol "Lanjut: rancang materi"; Simpan/Hapus di dalam "Kelola draf".
5. Program: chip "Kamus tersedia", tab "Basic · 1 course", note "Program ini untuk jabatan…", tombol "Minta ke Mahaka".
6. Permintaan: chip hitungan, tombol teks "Kembangkan" pada kandidat.
7. Test lama disesuaikan (select → chip, "Lanjut" → "Lanjut: …", "Belum ada sumber" → "Belum tersedia").

## Checklist file

- `apps/web/src/screens/b13-li/{LibraryView,ProgramView,RequestsView,DraftView}.vue`, `labels.ts`, `li.css`, `api.ts` (tipe `share`)
- `apps/web/src/ui/icons.ts` (auto_awesome)
- `apps/web/e2e/li.spec.ts`
- `docs/designs/paritas-mockup/gaps-modul.md` (tanda Ditutup/Sebagian)

## Review spek (mandiri; sesi induk menjalankan reviewer independen)

Lensa egm-design:
- Kesetiaan mockup: tiap baris mockup dipetakan ke gap ID; PK dibiarkan. OK.
- Aksesibilitas: chip filter = tombol `aria-pressed` dalam `role=group` berlabel; baris modul tetap tombol dengan `aria-current`; chip status tanpa ikon tetap berteks (warna bukan satu-satunya penanda). Stepper vertikal memakai `ol` + `aria-current="step"` (UiStepper). OK.
- Token: hanya `--el-*`; tidak ada warna hex baru. Catatan: latar terpilih memakai `--el-surface-2` (cek ada di token) agar gelap/terang selaras.

Lensa egm-implementation-readiness:
- Data: semua yang dibutuhkan ada di respons API (jobRoles, priority.share, pareto.codes, levels.count, vendorName). `share` belum ada di tipe klien; ditambah opsional. OK.
- Risiko: `devCount` LI-3 tergantung daftar terfilter → dibatasi saat tanpa filter (dicatat). Test lama berbasis `getByLabel('Prioritas').selectOption` harus diubah.
- Triase: tidak ada temuan blocker. Minor: nama vendor pendek heuristik (K-P6-3) diterima.
