# modules/voice · gateway wawancara suara (B19)

Spek: `docs/designs/b19-wawancara-suara.md`. ADR: `docs/adr/0004-gateway-suara-gemini-live.md`.

| Berkas | Isi |
| --- | --- |
| `index.js` | `createVoiceModule(deps)`: tiket, registry, kelayakan, `attach(server)` (upgrade WS, cek Origin, auth pesan pertama), `shutdown()` (SIGTERM) |
| `session.js` | `createVoiceSession`: satu sesi suara. Susun giliran di `turnComplete`, disela, alat, kuota, batas waktu, sambung ulang, biaya per sambungan |
| `ticket.js` | Tiket WS HS256 audience `ewi-voice`, 60 detik, `jti` sekali pakai |
| `eligibility.js` | `assertVoiceEligible` dipakai endpoint tiket, auth WS, dan pemeriksaan tiap 30 detik |
| `registry.js` | Paling banyak satu sesi suara per sesi wawancara di proses ini |

Penyedia ada di `src/voice` (`gemini-vertex`, `fake`, `none`). Endpoint HTTP (consent mode suara, tiket, switch, koreksi) ada di `src/modules/interviews/index.js`.
Kunci Google, caption, transkrip, dan isi galat Gemini tidak pernah ditulis ke log atau audit.
