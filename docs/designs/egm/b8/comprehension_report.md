# B8 · Tahap 6 Comprehension Test (egm-comprehension, subagent baru, hanya membaca spek)

## Apa yang diusulkan
Router baru `/api/my` (flag `learner.home`, default mati) mengembalikan data milik pengguna saja: skor kompetensi lawan target jabatan (Menguasai/Sebagian/Belum), undangan wawancara TNA dengan aksi mulai/lanjut, wawancara selesai dengan tautan transkrip, ringkasan dan daftar rencana belajar dengan tujuan belajar (EliteMentor atau LMS lain). Ditambah hak subjek data tanpa flag di router `employees`: tarik persetujuan (menghentikan dan menandai sesi, tanpa hapus) dan minta hapus data (tenggat 3 hari); HR menanganinya dan hanya HR yang bisa menghapus data wawancara manual (`erase: true`). Tabel baru `data_subject_requests`, kolom `consent_withdrawn_at`, dan aturan baca/transisi bersyarat agar sesi yang ditarik tidak dianalisis, direview, atau dilanjutkan.

## Cara kerja sistem yang ada, menurut dokumen ini
Modul DNA (kompetensi lawan jabatan, `computeGap` 0–4) dan TNA (wawancara AI → temuan draf direview HR → rencana dari katalog). Sesi `scheduled → in_progress → completed/abandoned`, undangan 7 hari, versi persetujuan; job analisis membuat temuan draf; rencana hanya dari temuan approved/edited. Sudah ada ekspor data sendiri, hapus karyawan oleh HR, transkrip hanya untuk karyawan (PR #11), `requireSubmodule`, `visibleEmployeeScope`.

## Temuan
- 🟡 Kode rujukan tidak terdefinisi/bertaut (T5, brief, Q45, L4, PM-9, LIN-B23, K-3, K2, B-paket).
- 🟡 Istilah domain inti tidak diperkenalkan (ELGOS, EliteMentor, DNA, TNA, awalan `lna_`, Admin ETA).
- 🟡 Cakupan penarikan tidak konsisten: Endpoint B butir 3b "semua sesi" lawan baris 32/216 "hanya TNA".
- 🟡 Perbaikan triase diff belum tercermin di badan spek (`interviews.update`, `openFor`, isi ekspor, kunci `FOR UPDATE`, audit erase di dalam transaksi).
- 🟡 Kalimat pembuka "Aturan baca" sulit diurai.
- 🟡 Syarat "pernah disetujui" dan kolom `consent_at` tidak dijelaskan.
- 🟡 Konsep "proyek" pada undangan massal muncul tanpa pengantar.
- 🟢 Definisi `submoduleActive` berbeda di dua tempat; penanda status tanpa legenda; field respons tanpa arti (`consentVersionRequired`, `programTier`); respons 200 `withdraw_consent` samar; istilah internal (`lockOwned`, `requeue`); `deliveryFor` saat setting kosong; `inviteActions`/`safeLaunchUrl` tidak di bagian fitur; orang disebut tanpa peran.
