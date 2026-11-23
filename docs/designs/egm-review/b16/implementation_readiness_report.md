# Implementation Readiness Report (Tahap 9 egm-review) · B16

DetailedRange (§10 dst). Reviewer dijalankan langsung: egm:egm-implementation-readiness dan egm:egm-codebase-details (standar implementation-readiness-standard), egm:egm-style.

| Reviewer | Status |
| --- | --- |
| egm-implementation-readiness | completed |
| egm-codebase-details | completed |
| egm-style | completed |

## egm-implementation-readiness · B16 (completed, standar implementation-readiness) — FAIL: 0 Blocker, 7 Major, 5 Nit
- M1 — Pemisahan tugas (career-routes l.189) tidak di C7/§6; `decisionView` tetap memberi `['approve','hold']` → tombol pasti 403. Usul `self_recommended` + test.
- M2 — l.219 vs C10 bertentangan; kode ikut §10a.
- M3 — drift: `waiting_hr` tidak pernah dikembalikan; C12 mensyaratkan `meta.decisionId` tetapi `auditMeta()` tidak mengisinya (store yang menambahkan — tidak disebut).
- M4 — Kontrak store `promotion` tidak dispesifikasi (signature, FOR UPDATE, helper enkripsi, kapan null).
- M5 — §9 usang (tambahan §10a tanpa kasus) dan tidak ada daftar skenario e2e.
- M6 — `meta.views` atasan mencakup pimpinan/role_leader tetapi API hanya supervisor → pakai `meta.roles`.
- M7 — Keputusan layar terbuka (pemilih job role di Jalur jenjang, pilih /supervisor vs /hr, refetch, status kosong/galat, tipe api.ts, sumber peran).
- Nit — path test relatif vs repo; `dna-domain.test.js` di §9 tidak di §10; aturan pembulatan; siklus usang ke §8 ⏳; tanpa fase; test tertunda tanpa pemilik.

## egm-codebase-details · B16 (completed, standar implementation-readiness) — 0 Blocker, 4 Major, 4 Nit
Terverifikasi di kode: `meta.decisionId` ditambahkan store, FOR UPDATE di dua transaksi, indeks `lna_promotion_approved_uq`, fallback `promotionSettings`, tie-break id, peran atasan dari DB, 403 pemisahan tugas, Super Admin `note: null`; test integrasi mencakup §9.
- M1 — §12 salah: `waiting_hr` mati (layar masih memetakannya); C7 tanpa cek approved-dulu (409) dan 403 pemisahan tugas; C10 tanpa pengecualian siklus terbuka.
- M2 — `canSeePromotion()` (dna/index.js:88-92) memakai `.includes` pada setelan mentah: `null`/objek → TypeError 500 di `GET /api/dna/employees`, `/employees/:userId`, `/promotion-candidates` saat flag menyala; string → cocok substring. Test "konfigurasi rusak" hanya `/map`.
- M3 — Daftar file tanpa C/M/D; `dna-domain.test.js` di §9 tidak di §10; `menu.ts` tidak disebut.
- M4 — `docs/ewi/poc-dna-tna.md` masih usang: l.55 default RG-1e "hanya HR", l.17-19 G2-A "modul terpisah".
- Nit — menu `cp` tanpa `super` (rute punya `super`); atasan nonaktif juga `no_supervisor` (tidak di C10); tombol yang pasti ditolak server (atasan dicabut, HR perekomendasi); tidak ada rencana test layar di §9.

## egm-style · B16 (completed) — 0 Blocker, 6 Major, 7 Nit
- M1 — §12 "Tidak ada perbedaan lain" tidak didukung: tie-break dedup (C2), FOR UPDATE (C6/C7), 403 pemisahan tugas (C7), C9 vs C10 belum masuk aturan.
- M2 — l.219 mempersempit C10 tetapi C10 dan test l.189 belum; sebut prasyarat "tanpa siklus terbuka".
- M3 — l.227 "dibulatkan" padahal contoh = floor; nyatakan aturannya.
- M4 — l.189 satu butir ±30 kasus, beberapa tanpa hasil yang diharapkan; pecah "kondisi → hasil".
- M5 — "karyawan 403" → "`learner` 403".
- M6 — nomor (1)–(11) di §10a merujuk daftar yang tidak ada; "11 sebagian" tidak jelas.
- Nit — "tidak ada yang berat" → hitungan; "kasus langka" → kondisinya; l.211 urutan cek; l.216 kalimat; "penyesuaian C14" tanpa isi; jargon proses; `meta.views` l.225 vs l.7, `dna-domain.test.js` di §9 tidak di §10.
