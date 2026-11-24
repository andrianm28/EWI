# Aksi mockup demo 25 Nov: LD, LIM, Super Admin, asisten (gap C6–C9, C11)

Status: spek paket kecil, 25 Nov 2026. Sumber gap: `daftar-gap-25nov.md` (sweep fungsional etavm2 pada 889a714) dan brief thread 3. Acuan layar: mockup final Pak Eji `project/Main.dc.html` (salinan lengkap di folder proyek, tidak di repo). Tampilan yang sudah 1:1 tidak diubah; paket ini hanya menambah aksi yang di mockup ada tetapi di aplikasi tidak jalan.

## 1. Tujuan

Semua tombol berikut di mockup harus berfungsi pada demo 25 Nov:

| # | Layar mockup | Aksi | Sekarang |
| --- | --- | --- | --- |
| C6a | `hr--lim--ai` | "Mulai sekarang" pada baris antrean berstatus Dijadwalkan | Hanya "Jadwalkan" dan "Batalkan" |
| C6b | `hr--lim--ai-sum` | "Simpan hasil" lalu kembali ke antrean | Hanya teks "Hasil tersimpan otomatis" |
| C6c | `hr--ld--dash` | "Kirim ajakan", "Minta konfirmasi" pada Saran tindakan; "Kirim pengingat" tetap | Hanya `remind` dan `open_training` |
| C6d | `hr--ld--soon` | "Lihat program" pada baris online yang siap | Selalu "Lihat saran" |
| C7 | `hr--dna--*`, `atasan--dna--*`, `hr--ina`, `atasan--ina` | Tombol "Buka wawancara AI" di kartu Agen AI | Kartu tanpa tombol |
| C8 | `super--tenants` | Toggle 8 modul tenant terlihat tanpa klik dulu, juga untuk tenant baru | Panel modul hanya muncul setelah klik "Modul" |
| C9 | (semua) | Alamat tak dikenal menampilkan halaman "tidak ditemukan" di dalam shell | Halaman putih |
| C11 | Asisten | HR bertanya status pelatihan; atasan mendapat jawaban berbeda per pertanyaan | Tidak dijawab / jawaban sama |

## 2. Rancangan

### C6a LIM "Mulai sekarang"
- Mockup: `act: x === 'none' ? 'Jadwalkan' : x === 'sched' ? 'Mulai sekarang' : 'Lihat hasil'` (Main.dc.html baris 1569).
- Di ELGOS wawancara ulang dikerjakan karyawan sendiri (spek B15 §12, transkrip hanya untuk karyawan). Jadi "Mulai sekarang" berarti **membuka wawancara ulang hari ini**: memanggil endpoint jadwal yang sudah ada `POST /api/lim/plans/:id/queue/schedule` dengan `date = hari ini (Asia/Jakarta)`. `checkScheduleDate` sudah menerima hari ini. Tanpa endpoint baru.
- Baris `scheduled`: tombol "Jadwalkan" diganti "Mulai sekarang" (sesuai mockup); "Batalkan" tetap. Baris `none`: "Jadwalkan" tetap. Notifikasi: "{nama} bisa mulai wawancara ulang hari ini dari menu Wawancara ulang."
- Tanggal hari ini dihitung di web dengan zona Asia/Jakarta (sama dengan `todayJakarta` API).

### C6b LIM "Simpan hasil"
- Mockup langkah Ringkasan: "Simpan hasil" + "Kembali ke antrian" (baris 1109); `limFinish` menyimpan skor dan kembali ke antrean.
- Di ELGOS skor sudah tersimpan saat wawancara selesai. "Simpan hasil" mencatat bahwa HR sudah meninjau hasil: endpoint baru `POST /api/lim/plans/:id/reinterviews/:userId/review` (gate flag `lim.reinterview` + HR, sama dengan GET hasil). Isinya: cek ada wawancara selesai (404 bila tidak), lalu `audit.record(req, 'update', 'lim.reinterview', { planId, employeeIds:[userId], reinterviewId, reviewed: true })`. Respons `204`. Tanpa migrasi (aksi `update` sudah diizinkan CHECK audit).
- Web: tombol "Simpan hasil" hanya di langkah Ringkasan, di samping "Kembali ke antrean". Setelah sukses, komponen memancarkan `saved`; induk menutup hasil dan menampilkan "Hasil wawancara ulang {nama} disimpan." Teks "Hasil tersimpan otomatis saat wawancara selesai." dihapus.

### C6c LD saran tindakan baru
Aturan tetap di `buildInsights` (bukan AI), tanpa kolom baru:
- `invite` "Kirim ajakan": pelatihan **online**, group `running`, `health === 'ok'`, tidak ada peserta tidak aktif, dan peserta belum selesai `participants − completed − failed > 0`. Judul `Dorong {pending} peserta {judul} yang belum selesai`, detail `Progres {pct}%, batas {tanggal}`. Insight tidak ditambah (mockup a3 tanpa insight sendiri).
- `confirm` "Minta konfirmasi": pelatihan **offline** akan datang, mulai dalam `INSIGHT_WINDOW_DAYS` (14) hari, punya peserta, belum ada kehadiran tercatat (`attendanceRecorded === 0`). Judul `Minta konfirmasi kehadiran peserta {judul} {tanggal}`, detail `{n} peserta belum mengonfirmasi`. Bisa berdampingan dengan `open_training` pelatihan yang sama (kunci aksi berbeda).
- Penyimpangan sengaja dari mockup a4 ("Konfirmasi tempat dan vendor ... Menunggu konfirmasi Mahaka Institute"): ELGOS tidak mengirim apa pun ke vendor (spek B14), jadi konfirmasi ditujukan ke peserta. Teks tombol tetap "Minta konfirmasi".
- Pengiriman: endpoint yang ada `POST /api/ld/trainings/:id/reminders` menerima body opsional `{ kind: 'remind' | 'invite' | 'confirm' }` (default `remind`, perilaku lama tidak berubah). `invite` hanya untuk online running, `confirm` hanya untuk offline upcoming (409 `INVALID_STATE` selain itu). Isi email beda per jenis. Batas sekali per 24 jam per pelatihan (klaim yang sama). Audit `ld.reminder` mencatat `kind`.
- Web: label tombol per jenis (`remind` "Kirim pengingat", `invite` "Kirim ajakan", `confirm` "Minta konfirmasi", `open_training` "Buka pelatihan"). Setelah terkirim, tombol aksi itu berganti teks selesai (mockup `done`: "Pengingat terkirim", "Ajakan terkirim", "Permintaan terkirim") dan nonaktif sampai halaman dimuat ulang.

### C6d LD "Lihat program"
- Mockup baris program online siap: `cta:'Lihat program', pick: set({ screen:'prog' })`.
- Web: baris akan datang non-manual yang semua cek kesiapannya `ok` menampilkan "Lihat program" (tautan ke rute `prog`) bila `routeOpen('prog','hr')`; selain itu "Lihat saran" seperti sekarang.

### C7 "Buka wawancara AI"
- Mockup: kedua kartu memanggil `go.aiv` (layar daftar wawancara AI).
- DNA (`DevelopmentNeedsView`): tampilan HR → `{ name: 'cc', query: { tab: 'aiv' } }` bila rute `cc` terbuka dan flag `cca.interview` menyala (sama dengan `aivTo` di Core Competencies); tampilan atasan → `{ name: 'aiv' }` bila `routeOpen('aiv','atasan')`. Selain itu tanpa tombol (perilaku UiAgentCard). [⚠️ BELUM TERVERIFIKASI] DN-1 (wawancara validasi kamus khusus DNA) belum diputuskan; tombol menuju daftar wawancara AI yang ada, sama seperti mockup.
- INA (`ImprovementNeedsView`): pengelola (HR, `manage`) → bagian "Verifikasi AI" di halaman yang sama (`{ name: 'ina', hash: '#ina-verifikasi-ai' }`); selain itu → rute `ina-verifikasi` (daftar verifikasi milik pengguna). Router mendapat `scrollBehavior` yang menggulir ke `to.hash` bila ada (tanpa mengubah perilaku lain).

### C8 Super Admin modul tenant
- Mockup `super--tenants`: kartu "Modul untuk {tenant}" selalu tampil di samping form "Buat tenant baru"; form mockup **tidak** punya centang modul. Agar 1:1, panel modul dibuka otomatis untuk tenant pertama saat daftar dimuat, dan untuk tenant yang baru dibuat setelah "Buat tenant" berhasil. Form tidak ditambah field.
- Penyimpangan dari teks brief ("centang di form") dicatat di PR; hasil yang dicari sama: modul tenant baru bisa langsung dinyalakan.

### C9 Rute catch-all
- Rute terakhir `{ path: '/:pathMatch(.*)*', name: 'not-found' }` → `NotFoundView.vue` di dalam `AppShell`: judul "Halaman tidak ditemukan", teks singkat, tautan "Kembali ke beranda" (rute `home`). Rute ini tidak publik: pengguna belum masuk diarahkan ke login seperti rute lain. Judul tab "Halaman tidak ditemukan".

### C11 Asisten
- Fakta baru `pelatihan` (tampilan `hr`, submodul `ld`, halaman `ld`): `{ running, online, offline, upcoming, avgProgress, attention, late: [judul ≤5] }` dari `stores.ld.listTrainings` + `decorate` + `kpis`. Hanya angka dan judul pelatihan (bukan data orang). `PAGE_LABEL.ld = 'Learning Delivery'`.
- Stub (`stub-provider.js`): aturan `pelatihan` dengan kata kunci `pelatihan, training, delivery`; pemilihan aturan diganti dari "pertama yang cocok" menjadi **jumlah kata kunci terbanyak, seri → urutan**. Kata kunci `tim` dibuang dari `wawancaraTim` (kata itu ada di semua pertanyaan atasan sehingga semua jawaban sama). Bedrock menerima fakta baru lewat prompt yang sama.
- Saran asisten (SUGGESTIONS) tidak diubah (mockup SUG hr tidak memuat pertanyaan pelatihan).

## 3. Data, flag, keamanan
- Tanpa migrasi, tanpa flag baru: semua aksi ada di modul yang sudah di balik `requireSubmodule`/flag (`lim.reinterview`, `module.ld`, `assistant`).
- Tenant: semua query tetap memakai `req.tenantId`. Endpoint review LIM memakai `loadPlan(req)` dan `completedReinterviews(req.tenantId, …)`.
- Privasi: fakta `pelatihan` tanpa nama orang. Email ajakan/konfirmasi hanya ke peserta pelatihan itu (`reminderRecipients`).

## 4. Test (ditulis dulu)
- Unit `ld-domain.test.js`: aksi `invite` dan `confirm` muncul/tidak muncul sesuai aturan.
- Integrasi `ld.test.js`: `POST /reminders` dengan `kind` invite/confirm (201 + teks email), jenis salah 400, keadaan salah 409.
- Integrasi `lim-wawancara-ulang.test.js`: `POST /review` 204 + audit; 404 tanpa wawancara selesai; non-HR 403.
- Unit `assistant.test.js`: stub menjawab berbeda untuk dua pertanyaan atasan; fakta `pelatihan` dijawab untuk HR.
- E2E (`page.route` mock): `ld.spec.ts` tombol Kirim ajakan/Minta konfirmasi/Lihat program; `lim-wawancara-ulang.spec.ts` Mulai sekarang dan Simpan hasil; `super-admin.spec.ts` panel modul tampil saat dimuat; `shell.spec.ts` rute tak dikenal; `b4-dna.spec.ts`/`improvement-needs.spec.ts` tombol Buka wawancara AI.

## 5. Checklist
- [ ] API ld: domain `invite`/`confirm`, endpoint `kind`
- [ ] API lim: `POST /plans/:id/reinterviews/:userId/review`
- [ ] API asisten: fakta `pelatihan`, stub skor kata kunci
- [ ] Web LD: label/selesai per jenis, Lihat program
- [ ] Web LIM: Mulai sekarang, Simpan hasil
- [ ] Web DNA/INA: tombol Buka wawancara AI, scrollBehavior hash
- [ ] Web Super Admin: panel modul otomatis
- [ ] Web router: catch-all + NotFoundView
- [ ] Test unit, integrasi, e2e
