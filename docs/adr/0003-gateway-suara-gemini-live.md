# ADR 0003 · Wawancara suara lewat gateway WebSocket di proses API ke Gemini Live (Vertex AI)

- Status: **Diusulkan** (25 Nov 2026, paket B19; menunggu review Andrian di PR #56)
- Tanggal: 25 Nov 2026

Wawancara akar masalah TNA perlu mode suara dua arah untuk demo 25 Nov dan pilot. Kami memutuskan browser **tidak pernah** berbicara langsung ke penyedia suara. Browser membuka WebSocket ke API ELGOS (`/api/voice/sessions/:id/stream`), dan gateway di proses API yang sama meneruskan audio ke Gemini Live di Vertex AI memakai kunci service account yang hanya ada di server. Gateway menyimpan transkrip ke tabel giliran yang sama dengan jalur teks (terenkripsi per tenant), mencatat biaya per sambungan, dan menegakkan aturan tenant, persetujuan, dan flag. Penulis lama (tab kedua, tiket diputar ulang, gateway setelah pindah ke teks) ditolak oleh `voice_epoch` di database, bukan oleh memori proses.

## Pilihan yang ditimbang

- **Token sementara di browser, browser langsung ke Google**: latensi sedikit lebih rendah, tetapi transkrip, biaya, dan penegakan persetujuan pindah ke browser yang tidak bisa dipercaya, dan kunci/izin Google ikut terekspos. Ditolak (R3-5, R2-3).
- **Layanan suara terpisah**: isolasi lebih baik, tetapi butuh deploy, auth, dan akses DB kedua sebelum demo. Ditunda; gateway ditulis sebagai modul (`src/modules/voice`) sehingga bisa dipindah.
- **Gateway di proses API** (dipilih).

## Konsekuensi

- Satu proses API memegang sambungan WS panjang; nginx wajib meneruskan upgrade di `location /api/voice/` dengan timeout panjang. SIGTERM menyimpan giliran terbuka dan mencatat biaya sebelum keluar.
- Lokasi Vertex dipilih saat deploy dari smoke (25 Nov: `asia-south1`; `asia-southeast1` dan `global` tidak menyediakan `gemini-3.8-live`). Audio diproses di luar Indonesia, jadi teks persetujuan suara terpisah dan flag `voice.realtime` mati untuk tenant sungguhan sampai teks v1.0 terbit.
- Proses yang mati mendadak (bukan SIGTERM) kehilangan baris biaya sambungan yang berjalan.
