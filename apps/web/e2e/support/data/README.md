# Fixture e2e web (B18)

Respons API untuk `mockApi` (`../api.ts`). Semua data fiktif. Setiap fixture disalin dari respons API sungguhan (Postgres, penyedia AI `stub`) dengan alur yang sama dengan test integrasi di bawah, lalu UUID diganti nilai tetap dan waktu diseragamkan. Bila kontrak API berubah, tangkap ulang fixture-nya; jangan menyunting bentuknya dengan tangan. Spek: `docs/designs/b18-e2e-qa-malam.md` 4.2 dan 4.5.

| Berkas | Endpoint | Sumber alur | Isi |
| --- | --- | --- | --- |
| `tna-review.json` | `GET /api/tna/review?projectId=…` (HR) | `apps/api/tests/integration/alur-tna.test.js`, langkah antrean review | Satu temuan draf (`reviewStatus: draft`) milik karyawan Rina Contoh |
| `tna-temuan.json` | `GET /api/tna/findings?projectId=…` (karyawan) | `alur-tna.test.js`, setelah HR menyetujui | Temuan yang sama, terlihat oleh karyawan |

ID tetap yang dipakai di fixture:

| ID | Arti |
| --- | --- |
| `00000000-0000-4000-8000-000000000001` | tenant |
| `00000000-0000-4000-8000-000000000002` | HR |
| `00000000-0000-4000-8000-000000000003` | atasan |
| `00000000-0000-4000-8000-000000000004` | karyawan (Rina Contoh) |
| `00000000-0000-4000-8000-000000000005` | proyek |
| `00000000-0000-4000-8000-000000000006` | sesi wawancara |

Contoh pemakaian:

```ts
import { fixture } from '../support/fixture'
const temuan = fixture('tna-temuan')
await mockApi(page, (req) => (cocok(req, 'GET /tna/findings') ? { json: temuan } : undefined))
```
