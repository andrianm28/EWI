# Drift report 19 Nov 2026 (B7, B8, B17)

Dijalankan dengan `egm-drift-report` (agen `egm-codebase-details`) di head `e78e78a`, sebelum tindak lanjut. Status tiap butir sesudah commit tindak lanjut ditulis di akhir baris.

## b7-tinjauan-hr.md
- Blocker: EliteMentor gagal setelah klaim diambil alih menjawab `502`, spek meminta `409 ASSIGN_IN_PROGRESS`. **Kode diperbaiki, test merah lalu hijau.**
- Major: cek `CONSENT_WITHDRAWN` hanya untuk temuan `draft`, spek tanpa batasan. **Spek diperjelas; pembekuan temuan yang sudah disetujui menunggu kartu keputusan UU PDP.**
- Nit: audit `superseded` memuat `ref`; `assignment_ref` dari `id ?? ref`. **Spek diperbarui.**
- Nit: `improvement-handoff` menolak id bukan UUID sebelum `INA_DISABLED`, dedupe id; indeks `lna_findings_handoff_idx`; BOM dan nama file CSV; field tambahan item review. **Diterima, detail implementasi.**

## b8-karyawan.md
- Major: indeks `data_subject_requests_tenant_idx` tanpa `DESC`. **Spek diselaraskan (pindai mundur indeks cukup).**
- Major: tarik persetujuan mengisi `ended_at`. **Spek diperbarui.**
- Nit: alasan baru diabaikan pada permintaan `open` yang dipakai ulang; `note` fulfill dipotong 1000. **Spek diperbarui.**
- Nit: audit `employeeIds: []` saat kosong; `person` bisa `null`; audit `create` `delete_data` tanpa `sessions`. **Diterima.**

## b17-asisten-elgos.md
- Major: nama penanya sendiri di pertanyaan menjadi `[[ORANG_LAIN]]`. **Kode diperbaiki menjadi `(penanya)`, test merah lalu hijau, spek diperbarui.**
- Nit: nama < 3 huruf dilewati. **Spek diperbarui.**
- Nit: teks pengganti `no_answer`/penolakan/`(tanpa nama)`; `403` cakupan menandai log `error`; Bedrock mengabaikan `view`; aturan "Sapa dengan Anda". **Diterima, tidak mengubah perilaku yang dijanjikan.**
