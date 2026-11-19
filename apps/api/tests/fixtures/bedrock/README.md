# Respons Bedrock Converse untuk test kontrak (PK-06)

Berkas JSON di sini berbentuk respons `ConverseCommand` (`output.message.content`, `stopReason`, `usage`, `metrics`).
Isi awal disusun tangan mengikuti bentuk respons Converse karena akun AWS ELGOS belum ada. Setelah akun ada,
ganti dengan rekaman asli: `node apps/api/scripts/ai-smoke.js --record apps/api/tests/fixtures/bedrock`
(lihat docs/ewi/ai-teks.md). Rekaman memakai data uji fiktif, jangan pernah transkrip karyawan sungguhan.
