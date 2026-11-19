# Catatan triase awal b8 (19 Nov 2026)

Dipindahkan dari `docs/designs/b8-karyawan.md` saat egm-resolve (tahap 5–9). Keputusan yang masih berlaku sudah dimasukkan ke badan spek.

## Catatan triase review spek (19 Nov)

Review oleh subagent baru tanpa konteks percakapan; 15 temuan (4 berat).

| # | Temuan | Putusan |
| --- | --- | --- |
| 1 | Tarik persetujuan berujung hapus akun; tanpa tenggat; bisa "selesai" tanpa menghapus | Arti tarik persetujuan **diangkat ke user**; user memilih "Hanya ditandai, tanpa hapus" (19 Nov). Penarikan menghentikan wawancara dan menandai sesi; hapus hanya manual oleh HR (`erase: true`); tenggat 3 hari hanya untuk `delete_data` |
| 2 | Data dari persetujuan yang ditarik tetap diproses | **Perbaiki**: bagian "Aturan baca" |
| 3 | Balapan consent/turns dengan penarikan; transaksi | **Perbaiki**: transisi bersyarat, satu transaksi |
| 4 | Hak subjek data di balik flag fitur | **Perbaiki**: pindah ke router `employees` tanpa flag; penyimpangan aturan 3 dicatat untuk Andrian |
| 5 | HR/Admin membuat permintaan yang tak bisa dipenuhi | **Perbaiki**: `ADMIN_ACCOUNT`, `CANNOT_FULFILL_OWN` |
| 6 | Audit daftar, batal, pemenuhan; bukti setelah cascade | **Perbaiki** |
| 7 | `expired` mengunci sesi yang sedang berjalan | **Perbaiki**: `canStart`, `canContinue` |
| 8 | Isi `interviews` tidak terdefinisi | **Perbaiki**: `completed` + `abandoned` ber-persetujuan; hanya TNA |
| 9 | Skor per kompetensi bertentangan dengan Q45 | **Diangkat ke user** lewat PR dan balasan thread; dibangun mengikuti mockup (aturan 5 brief) |
| 10 | Ketergantungan setting B7; enum `where` campur | **Perbaiki**: tabel `deliveryFor`, helper bersama |
| 11 | Sesi baru tak bisa dihentikan selama permintaan lama terbuka | **Perbaiki**: `withdraw_consent` idempoten |
| 12 | Definisi `gaps`, tanpa jabatan | **Perbaiki** |
| 13 | Kartu tanpa skor dan deskripsi | **Perbaiki** `courseScore`, judul pengganti; `description: null` diterima `[⏳]` |
| 14 | Detail pemasangan | **Perbaiki** |
| 15 | Tanpa `requireSubmodule`/`visibleEmployeeScope` | **Tolak mengubah desain** (router lintas submodul, hanya data sendiri); helper `submoduleActive` ditambah dan penyimpangan dicatat untuk Andrian |

## Catatan triase review diff (19 Nov)

Review oleh subagent baru (diff + spek saja); 9 temuan, tidak ada yang berat.

| # | Temuan | Putusan |
| --- | --- | --- |
| 1 | Tarik persetujuan balapan dengan `fulfill` → 500 setelah commit | **Perbaiki**: permintaan terbuka dikunci `FOR UPDATE`, dicoba ulang bila baru ditutup |
| 2 | Audit `erase` tidak terikat pada yang dihapus | **Perbaiki**: audit ditulis di dalam transaksi setelah permintaan diklaim dan sesi dikunci, dari daftar yang sama dengan yang dihapus |
| 3 | Penarikan ikut mengenai sesi DNA | **Perbaiki**: hanya `submodule = 'tna'` sesuai spek; test memastikan sesi DNA tidak tersentuh |
| 4 | Undang ulang buntu untuk sesi `completed` yang ditarik; undangan massal mengundang lagi otomatis | **Perbaiki**: `openFor` mengabaikan sesi yang ditarik; undangan massal melewatinya kecuali `includeWithdrawn` |
| 5 | Respons menyesatkan bila penarikan masuk di tengah `consent`/`turns` | **Perbaiki**: `409 INVALID_STATE` |
| 6 | `interviews.update` tanpa syarat | **Perbaiki**: tidak menimpa sesi yang ditarik |
| 7 | Sesi `scheduled` yang dihentikan tidak bertanda | **Perbaiki**: ikut bertanda |
| 8 | Ekspor data tanpa tanda penarikan dan permintaan data | **Perbaiki**: `consentWithdrawnAt` per sesi dan `dataRequests` ikut diekspor |
| 9 | Celah test | **Perbaiki** sebagian (DNA, undangan massal, penarikan sesi terjadwal). Test konkurensi sungguhan dan isolasi lintas tenant untuk permintaan data **ditunda** ke QA B18 `[⏳ DITERIMA]` |

Catatan untuk pemilik produk (dari temuan 2): `erase: true` menghapus temuan dan rencana dari semua sesi TNA yang pernah ditarik karyawan itu, termasuk rencana yang sudah ditugaskan ke EliteMentor, tanpa pembatalan di sisi EliteMentor. Sesuai keputusan "hapus hanya manual oleh HR".
