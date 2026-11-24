# Aksi mockup demo 25 Nov: LD, LIM, Super Admin, asisten (gap C6–C9, C11)

Status: spek paket kecil, 25 Nov 2026 (diselaraskan dengan kode setelah review egm). Sumber gap: `daftar-gap-25nov.md` (sweep fungsional etavm2 pada 889a714) dan brief thread 3. Acuan layar: mockup final Pak Eji `project/Main.dc.html` (salinan lengkap di folder proyek, tidak di repo). Tampilan yang sudah 1:1 tidak diubah; paket ini hanya menambah aksi yang di mockup ada tetapi di aplikasi tidak jalan.

## 1. Tujuan

Semua tombol berikut di mockup harus berfungsi pada demo 25 Nov:

| # | Layar mockup | Aksi | Sebelum |
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
- Di ELGOS wawancara ulang dikerjakan karyawan sendiri (spek B15 §12, transkrip hanya untuk karyawan), dan karyawan boleh mulai lebih awal dari tanggal jadwal. Jadi "Mulai sekarang" berarti **membuka wawancara ulang hari ini dan mengabari karyawan**: endpoint jadwal yang ada `POST /api/lim/plans/:id/queue/schedule` menerima `notify: true` (hanya boolean `true`; 400 bila `date === null` atau flag `lim.reinterview` mati, karena email menunjuk menu Wawancara ulang). Setelah menjadwalkan, API mengirim email ke tiap karyawan yang terjadwal (subjek "Wawancara ulang Anda sudah bisa dimulai", isi menyebut judul rencana dan menu Wawancara ulang), mengembalikan `notified` (jumlah email terkirim), dan audit `lim.measurement` mencatat `notified`. Email gagal tidak menggagalkan jadwal.
- Web (`LearningImpactView.vue`): baris `scheduled` menampilkan "Mulai sekarang" menggantikan "Jadwalkan" (sesuai mockup) bila flag `lim.reinterview` menyala; "Batalkan" tetap, jadi jadwal ulang = batalkan lalu jadwalkan (diterima sengaja). Klik memanggil `lim.schedule(planId, [userId], todayJakarta(), true)`; setelah berhasil tombol berganti "Sudah dikabari" dan nonaktif sampai halaman dimuat ulang (email tidak terkirim berulang); notifikasi dari respons: terjadwal + email ("{nama} dikabari lewat email dan bisa mulai wawancara ulang hari ini dari menu Wawancara ulang."), terjadwal tanpa email, dilewati (`done` / `in_progress`), atau galat.
- `todayJakarta()` di `screens/b15-lim/labels.ts`, sama dengan `todayJakarta` API (UTC+7).
- Menggantikan keputusan T-1 (HR tanpa "Mulai sekarang") atas brief gap 25 Nov ("semua fitur jalan penuh pada demo").

### C6b LIM "Simpan hasil"
- Mockup langkah Ringkasan: "Simpan hasil" + "Kembali ke antrian" (baris 1109); `limFinish` menyimpan skor dan kembali ke antrean.
- Di ELGOS skor sudah tersimpan saat wawancara selesai. "Simpan hasil" mencatat bahwa HR sudah meninjau hasil: endpoint baru `POST /api/lim/plans/:id/reinterviews/:userId/review` body `{ reinterviewId? }` (gate flag `lim.reinterview` + HR, sama dengan GET hasil). Isinya: wawancara selesai yang diminta (`reinterviewId` dari layar) atau yang terbaru; 404 bila tidak ada. Lalu `audit.record(req, 'update', 'lim.reinterview', { planId, employeeIds:[userId], reinterviewId, reviewed: true })` (aksi `update` membedakannya dari `read`). Respons `204`. Klik berulang menulis audit lagi (diterima: tiap peninjauan tercatat). Tanpa migrasi; kolom `reviewed_at` [⏳ DITERIMA] ditunda sampai ada layar yang membacanya.
- Web: `lim.review(planId, userId, reinterviewId)`. Tombol "Simpan hasil" hanya di langkah Ringkasan, di baris yang sama dengan "Kembali ke antrean" (`emit('saved')`). Induk menutup hasil, menampilkan "Hasil wawancara ulang {nama} disimpan." dan memuat ulang antrean. Galat tampil di catatan galat komponen. Teks "Hasil tersimpan otomatis saat wawancara selesai." dihapus.

### C6c LD saran tindakan baru
Aturan tetap di `buildInsights` (bukan AI):
- `invite` "Kirim ajakan" (mockup a3 "peserta yang tinggal satu kegiatan"): pelatihan **online**, group `running`, `health === 'ok'`, `inactive === 0`, dan `nearlyDone > 0`. `nearlyDone` = kolom hitung baru di `ld.listTrainings`: peserta online `enrolled/in_progress` dengan `progress_pct >= NEARLY_DONE_PCT` (75, `ld/domain.js`). Judul `Dorong {nearlyDone} peserta {judul} yang hampir selesai`, detail `Progres minimal 75%, batas {dd/mm/yyyy}`. Penerima email hanya peserta hampir selesai (`reminderRecipients(..., { nearlyDoneOnly: true })`). Insight tidak ditambah.
- `confirm` "Minta konfirmasi": pelatihan **offline** group `upcoming`, mulai dalam `INSIGHT_WINDOW_DAYS` (14) hari, punya peserta, belum ada kehadiran tercatat (`attendanceRecorded === 0`). Judul `Minta konfirmasi kehadiran peserta {judul} {dd/mm/yyyy}`, detail `{n} peserta terdaftar, kehadiran belum dicatat` (tanpa klaim "belum mengonfirmasi": ELGOS tidak menyimpan jawaban konfirmasi). Bisa berdampingan dengan `open_training` pelatihan yang sama (kunci aksi berbeda).
- Penyimpangan sengaja dari mockup a4 ("Konfirmasi tempat dan vendor ... Menunggu konfirmasi Mahaka Institute"): ELGOS tidak mengirim apa pun ke vendor (spek B14), jadi konfirmasi ditujukan ke peserta. Teks tombol tetap "Minta konfirmasi".
- Pengiriman: endpoint yang ada `POST /api/ld/trainings/:id/reminders` menerima body opsional `{ kind: 'remind' | 'invite' | 'confirm' }` (default `remind`, perilaku lama tidak berubah). Galat: jenis lain 400 "Jenis pesan tidak dikenal. Pilih pengingat, ajakan, atau konfirmasi kehadiran."; `invite` selain online running dan `confirm` selain offline upcoming 409 `INVALID_STATE`; `invite` tanpa peserta hampir selesai 400 "Tidak ada peserta yang hampir selesai". Email: remind tetap; invite subjek "Selesaikan pelatihan: {judul}"; confirm subjek "Konfirmasi kehadiran: {judul}" dengan tanggal dan tempat. Batas sekali per 24 jam **per pelatihan, lintas jenis** (klaim `last_reminded_at` yang sama, sengaja: peserta tidak menerima lebih dari satu email HR per hari untuk satu pelatihan; 409 `REMINDER_RECENT` "Pesan HR untuk pelatihan ini (pengingat, ajakan, atau konfirmasi) sudah dikirim dalam 24 jam terakhir. Coba lagi besok."). Audit `ld.reminder` mencatat `kind`.
- Web: `ld.remind(id, kind)`, tipe `ActionKind`. Label tombol `ACTION_LABEL` (`remind` "Kirim pengingat", `invite` "Kirim ajakan", `confirm` "Minta konfirmasi", `open_training` "Buka pelatihan"). Setelah terkirim, tombol berganti teks selesai (mockup `done`: "Pengingat terkirim", "Ajakan terkirim", "Permintaan terkirim") dan nonaktif sampai halaman dimuat ulang. Bila API menjawab `REMINDER_RECENT`, tombol tidak ditandai selesai (pesan yang terkirim bisa berjenis lain); galat API tampil. Notifikasi "{jenis} dikirim ke {sent} dari {recipients} peserta."

### C6d LD "Lihat program"
- Mockup baris program online siap: `cta:'Lihat program', pick: set({ screen:'prog' })`.
- Web: baris akan datang non-manual yang semua cek kesiapannya `ok` menampilkan "Lihat program" (`UiButton :to="{ name: 'prog' }"`, daftar Program & Course) dan cek tidak kosong bila `routeOpen('prog','hr')`; selain itu "Lihat saran" seperti sebelumnya.

### C7 "Buka wawancara AI"
- Mockup: kedua kartu memanggil `go.aiv` (layar daftar wawancara AI). Menggantikan keputusan K-P3-2 (kartu tanpa tombol) atas brief gap 25 Nov.
- DNA (`DevelopmentNeedsView`), bercabang pada `session.activeView`: `hr` → `{ name: 'cc', query: { tab: 'aiv' } }` bila flag `cca.interview` menyala dan `routeOpen('cc', view)` (rute `cc` hanya untuk `hr`, jadi Super Admin tanpa tombol); `atasan` → `{ name: 'aiv' }` bila `routeOpen('aiv','atasan')`. Selain itu tanpa tombol. [⚠️ BELUM TERVERIFIKASI] DN-1 (wawancara validasi kamus khusus DNA) belum diputuskan; tombol menuju daftar wawancara AI yang ada, sama seperti mockup.
- INA (`ImprovementNeedsView`): pengelola (`manage`) → tombol (slot `action` baru di `UiAgentCard`) yang menggulir ke judul "Verifikasi AI" (`id="ina-verifikasi-ai"`, `tabindex="-1"`) lalu memindahkan fokus ke sana sesudah gulir selesai (`focus({ preventScroll: true })`). Selain itu → rute `ina-verifikasi` bila `routeOpen('ina-verifikasi', view)`. Router tidak diubah untuk ini.

### C8 Super Admin modul tenant
- Mockup `super--tenants`: kartu "Modul untuk {tenant}" selalu tampil; form mockup **tidak** punya centang modul. Panel modul dibuka otomatis **sekali** untuk tenant pertama saat daftar pertama kali dimuat (`autoOpened`, hanya bila `selected === null`), dan untuk tenant yang baru dibuat (dicari dengan id dari respons di daftar yang dimuat ulang). Muat ulang setelah aksi lain tidak mengganti pilihan; "Tutup" tetap menutup. Form tidak ditambah field.
- Penyimpangan dari teks brief ("centang di form") dicatat di PR. Modul berlangganan (li, ld, lim butuh `full_suite`) tetap "Menyala, menunggu langganan" sampai entitlement diberikan; itu aturan B12, bukan bagian paket ini.

### C9 Rute catch-all
- Rute terakhir di `router/index.ts`: `{ path: '/:pathMatch(.*)*', name: 'not-found', meta: { title: 'Halaman tidak ditemukan' } }` → `src/views/NotFoundView.vue` di dalam `AppShell`: judul "Halaman tidak ditemukan", teks singkat, tautan "Kembali ke beranda" (rute `home`). Rute ini tidak publik: pengguna belum masuk diarahkan ke login seperti rute lain. Rute terdaftar yang gerbangnya gagal tetap dialihkan ke beranda (perilaku lama).

### C11 Asisten
- Fakta baru `pelatihan` (tampilan `hr`, submodul `ld`, halaman `ld`): `{ running, online, offline, upcoming, avgProgress, attention, late }` dari `stores.ld.listTrainings` + `decorate` + `kpis`. `late` = judul (≤5) pelatihan berjalan/akan datang dengan `health === 'late'`. **Tanpa `syncFromCatalog`** (fakta hanya membaca; angka bisa tertinggal sampai dasbor LD dibuka, diterima). Hanya angka dan judul pelatihan, tanpa nama orang. `PAGE_LABEL.ld = 'Learning Delivery'`.
- Stub (`stub-provider.js`): aturan `pelatihan` dengan kata kunci `pelatihan, delivery` (tanpa `training` supaya "Training Needs" tidak tertangkap). Pemilihan aturan: **jumlah kata kunci cocok (substring) terbanyak, seri → urutan**. Urutan menentukan seri: `pelatihan` sebelum `tinjauan` ("Pelatihan mana yang perlu perhatian?"), `rencanaTim` sebelum `wawancaraTim` ("Apa status rencana tim saya?"). Pencocokan kata utuh ditolak karena akhiran bahasa Indonesia (-nya, -kah). Kata kunci `tim` dibuang dari `wawancaraTim` (kata itu ada di semua pertanyaan atasan sehingga semua jawaban sama). Bedrock menerima fakta baru lewat prompt yang sama.
- Saran asisten (SUGGESTIONS) tidak diubah.

## 3. Data, flag, keamanan
- Tanpa migrasi, tanpa flag baru. Pengecualian CLAUDE.md aturan 3: semua aksi berada di dalam modul/fitur yang sudah ber-flag dan default mati (`lim.reinterview`, `module.ld`, `assistant`), dan brief demo meminta aksi mockup jalan penuh.
- Kode bersama yang disentuh (reviewer wajib Andrian, aturan 7): `router/index.ts`, `ui/UiAgentCard.vue`, `ai/stub-provider.js`, `db/ld-stores.js`.
- Tenant: semua query tetap memakai `req.tenantId`. Endpoint review LIM memakai `loadPlan(req)` dan `completedReinterviews(req.tenantId, …)`.
- Privasi: fakta `pelatihan` tanpa nama orang. Email ajakan/konfirmasi hanya ke peserta pelatihan itu.
- Data demo: tombol hanya tampil bila datanya ada. Seed disiapkan thread "Lengkapi data seed demo" (branch `claude/project-thread-jqnz5m`).

## 4. Test (ditulis dulu)
- Unit `ld-domain.test.js`: aksi `invite` dan `confirm` muncul/tidak muncul sesuai aturan.
- Integrasi `ld.test.js`: `POST /reminders` dengan `kind` invite/confirm, jenis salah 400, keadaan salah 409.
- Integrasi `lim-wawancara-ulang.test.js`: `POST /review` 204 + audit; 404 tanpa wawancara selesai; non-HR 403. `lim.test.js`: `notify` mengirim email.
- Unit `assistant.test.js` dan integrasi `asisten.test.js`: stub menjawab berbeda untuk dua pertanyaan atasan; fakta `pelatihan` untuk HR.
- E2E (`page.route` mock): `ld.spec.ts`, `lim-wawancara-ulang.spec.ts`, `super-admin.spec.ts`, `shell.spec.ts`, `b4-dna.spec.ts`, `improvement-needs.spec.ts`.

## 5. Checklist
- [x] API ld: domain `invite`/`confirm`, `nearlyDone`, endpoint `kind`
- [x] API lim: `notify` pada jadwal, `POST /plans/:id/reinterviews/:userId/review`
- [x] API asisten: fakta `pelatihan`, stub skor kata kunci
- [x] Web LD: label/selesai per jenis, Lihat program
- [x] Web LIM: Mulai sekarang, Simpan hasil
- [x] Web DNA/INA: tombol Buka wawancara AI, slot `action` UiAgentCard
- [x] Web Super Admin: panel modul otomatis
- [x] Web router: catch-all + NotFoundView
- [x] Test unit, integrasi, e2e

## 6. Triase review spek (egm, 25 Nov)
Dua reviewer egm (`egm-design`, `egm-implementation-readiness`).
- Diperbaiki: Mulai sekarang mengirim email; konfirmasi tanpa klaim palsu; ajakan dipersempit ke peserta ≥75%; Simpan hasil memakai `reinterviewId`; panel modul dibuka sekali + tenant baru via id; pengecualian flag dan kode bersama ditulis; cara baca fakta `pelatihan` ditetapkan; `training` dibuang dari kata kunci; INA tanpa ubah router, fokus sesudah gulir; DNA bercabang pada tampilan aktif; spek diselaraskan dengan kode.
- Ditolak dengan alasan: pencocokan kata utuh (akhiran bahasa Indonesia); menghapus endpoint Simpan hasil (tinjauan HR perlu jejak audit).
## 7. Triase review diff (25 Nov)
`egm-codebase-details` + `mattpocock-skills:code-review` (sumbu standar dan spek). Laporan: `docs/designs/egm/demo-25nov/review-diff.md`.
- Diperbaiki: seri kata kunci stub (pelatihan vs tinjauan, rencanaTim vs wawancaraTim); `notify` hanya `=== true` dan butuh flag `lim.reinterview`; Mulai sekarang nonaktif setelah dikabari; `kind` kosong 400 (`??`); `REMINDER_RECENT` tidak lagi menandai tombol selesai dan pesannya netral lintas jenis; Lihat program butuh cek tidak kosong; fokus INA menunggu `scrollend`/Promise dengan batas waktu; teks NotFound tanpa klaim peran; pesan jenis salah tanpa kode mentah.
- Diterima, untuk Andrian: aturan 3 (tanpa flag baru, §3), kode bersama (§3), `ld-stores` mengimpor konstanta domain LD, duplikasi pembentuk isi email LD/LIM dan `todayJakarta` web/API, `reminderRecipients` dengan dua opsi boolean. Refaktor setelah demo.

- Ditunda: kolom `reviewed_at`, batas jumlah saran tindakan LD, entitlement modul berlangganan untuk tenant baru (aturan B12).
