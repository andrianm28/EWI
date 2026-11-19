# B8 · Tahap 7 Critic Review (egm-review-loop ronde 1; egm-design, egm-structural, egm-style; dispatch langsung)

## egm-style (seluruh dokumen) — 0 🔴, 5 🟡, 11 🟢
- 🟡 M1. "undangan" ditandai _Avoid_ (istilah baku: Penugasan wawancara) di prosa (baris 7, 15, 23, 133, 151).
- 🟡 M2. "wawancara TNA" → "Wawancara akar masalah" (baris 32, 84–85, 199, 216).
- 🟡 M3. Kalimat pembuka "Aturan baca" (baris 127) rusak.
- 🟡 M4. Status dan kala tidak sesuai bukti (baris 3, 154, 169–182).
- 🟡 M5. Peringatan `erase` lawan EliteMentor ada di akhir triase (baris 224), seharusnya di butir 6.
- 🟢 N1–N11: "Paket T5…", "menumpuk di PR B0", penanda ganda baris 29, judul "Keputusan default", "ikut menyusul", klaim normatif baris 36 tanpa sumber, penanda ⏳ tanpa legenda, "lebih kecil" → "tidak lebih besar", "balapan", "tautan dalam", "4 berat".

## egm-structural (baris 1–153, feature-spec-standard) — 2 🔴, 4 🟡, 4 🟢
- 🔴 1. Tidak ada "Alternatif yang dipertimbangkan" (arti tarik persetujuan, skor lawan Q45, router lintas submodul, tabel baru lawan kolom sesi, router `employees` lawan `/api/my`).
- 🔴 2. Keputusan diatribusikan ke orang tanpa tautan (Pak Eji, kartu keputusan user, Andrian).
- 🟡 3. Tidak ada "Risiko dan mitigasi" (skala transaksi penarikan, `launchUrl`, urutan rute `/me`, erase lawan EliteMentor, Q45).
- 🟡 4. Tidak ada pernyataan masalah.
- 🟡 5. Kode rujukan tanpa definisi/tautan; tidak ada ID tiket ELITMEN.
- 🟡 6. Kosakata menyimpang dari glosarium.
- 🟢 7–10: tidak ada gambaran komponen; pseudo-JSON berlabel `json`; penanda di tengah kalimat; metadata status.

## egm-design (baris 1–153, feature-spec-standard) — 3 🔴, 7 🟡, 6 🟢
- 🔴 1. Tidak ada evaluasi alternatif.
- 🔴 2. Tarik persetujuan tanpa tenggat dan pemrosesan lanjutan atas temuan/rencana yang sudah disetujui berisiko bertentangan dengan UU PDP (perlu verifikasi legal; reviewer merujuk Pasal 40: akhiri pemrosesan 3x24 jam). Keputusan user 19 Nov menjawab soal hapus, bukan soal pemrosesan lanjutan.
- 🔴 3. Tidak ada tabel Risiko & Mitigasi.
- 🟡 1. Pintu masuk hak subjek data di web masih di balik `learner.home`.
- 🟡 2. "HR menerima pemberitahuan" tidak punya mekanisme; `overdue` hanya terlihat bila daftar dibuka.
- 🟡 3. Undang ulang setelah penarikan lewat proyek baru / penugasan atasan B5 tanpa tanda.
- 🟡 4. Skor per kompetensi lawan Q45: usul sub-flag sampai dikonfirmasi.
- 🟡 5. Karyawan berperan HR: `delete_data` ditolak tanpa catatan; HR tunggal tidak bisa menutup penarikannya sendiri.
- 🟡 6. Isolasi lintas tenant permintaan data belum diuji di PR ini.
- 🟡 7. Hapus akun tidak membahas provisioning ulang/sinkronisasi EliteMentor.
- 🟢 1–6: bagian Balapan tidak menyebut jalur B6 (`summary`, `confirm`, `restart`); `transcriptPath` setelah erase; transkrip lewat rute ber-`requireSubmodule`; penarikan tanpa sesi; volume audit beranda; `down` migrasi dan `DELETE turns` tanpa filter tenant.
