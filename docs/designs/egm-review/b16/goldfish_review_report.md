# Goldfish Annotated Review Report · B16

**Target:** `docs/designs/b16-career-promotion.md` (full file)
**Sumber temuan:** tahap 5–9 egm-review di folder ini.

## Blocker

### S1 · Tidak ada "Alternatif yang dipertimbangkan" [structural] — Blocker
* ***AI Suggestion:*** PROPOSE FIX (ringkas, saran tahap 8)
* ***Proposed Edit:*** tabel: baris keputusan mutable + audit vs tabel event; kelayakan dihitung saat baca vs disimpan; router baru vs memperluas `/promotion-candidates`; dua tahap vs HR saja; identitas siklus (karyawan, jenjang tujuan) vs epoch posisi.

## Major

| # | Temuan (reviewer) | Kategori | Keputusan |
| --- | --- | --- | --- |
| S2 | `blockedReason`: `waiting_hr` tidak pernah dikembalikan; HR yang merekomendasi sendiri mendapat tombol yang pasti 403 (zoom-out, comprehension, design, style, readiness, codebase, tahap 8) | PROPOSE FIX | Test dulu: `decisionView` memberi `blocked('self_recommended')` bila `cycle.open.supervisorBy === viewer.id`; `waiting_hr` dihapus dari spek, layar, e2e. Tabel peran × status × eligible → actions/blockedReason. |
| S3 | C7/C10/C2 tidak memuat keputusan §10a (FOR UPDATE, cek approved dulu, 403 pemisahan tugas, tie-break, pengecualian siklus terbuka, atasan nonaktif) (semua) | PROPOSE FIX | Dipindah ke aturan C; §12 dibetulkan. |
| S4 | `canSeePromotion` membaca setelan mentah → 500 untuk nilai rusak; string cocok substring (codebase-details, zoom-out) | PROPOSE FIX | Test dulu: pakai `promotionSettings()`. |
| S5 | Dua definisi "kandidat": badge program-saja di halaman lama kini terlihat atasan karena default diperluas (zoom-out, tahap 8) | PROPOSE FIX | Endpoint lama (`/promotion-candidates`, `career.promotionCandidate`) hanya untuk `hr_admin`/`eta_admin` seperti sebelum B16, walau default `promotionVisibleTo` kini memuat supervisor. Atasan memakai `/cp`. Test dulu. |
| S6 | `promotionVisibleTo` sebagai gerbang kedua bisa mengunci alur (inventive, tahap 8) | ESCALATE | RG-1e keputusan user (privasi), tidak dihapus sepihak. Kombinasi `['hr_admin']` dicatat di C11 sebagai akibat yang diketahui. |
| S7 | B16 di balik `requireSubmodule('dna')`, B0 menyatakan modul 2–5 hanya flag; koordinator meminta `meta.entitlement: 'full_suite'` (zoom-out, koordinator) | CONTEST | API `/api/dna/career/*` memeriksa submodul `dna`, bukan produk `full_suite` (`app.js` mount `requireSubmodule('dna')`). B0 §5.3: `meta.entitlement` dipakai bila API memeriksa produk itu. Rute memakai `submodule: 'dna'`, yang setara dengan pemeriksaan API. Keputusan dicatat di §7 dan baris `cp` B0 §5.2. |
| S8 | `meta.views` atasan mencakup pimpinan/role_leader → 403 (readiness, design B4) | PROPOSE FIX | `meta.roles: ['hr_admin','supervisor','eta_admin']` di rute `cp`. |
| S9 | Rumus C2 ambigu; kolom tidak disebut; OKR basi dan urutan periode teks (comprehension, style, design, tahap 8) | PROPOSE FIX + ESCALATE | C2 ditulis ulang sebagai daftar kasus berurutan dengan nama kolom. Batas umur periode dan format periode: ⚠️ menunggu format OKR Mas Abdan 26 Nov. `metricTypes` dinyatakan internal. |
| S10 | §8 bukan register risiko; tanpa Sasaran/Bukan sasaran; tanpa arsitektur (structural, design) | PROPOSE FIX | Daftar Bukan sasaran di §1, risiko diberi mitigasi singkat; paragraf alur komponen. |
| S11 | Kode keputusan tanpa glosarium, R2-2 tidak dijelaskan (comprehension, style, structural) | PROPOSE FIX | Blok "Sumber acuan" dan penjelasan singkat tiap kode. |
| S12 | Placeholder `<...>` hilang saat dirender (structural) | PROPOSE FIX | Dibungkus backtick. |
| S13 | `docs/ewi/poc-dna-tna.md` usang (RG-1e, G2-A) (codebase-details) | PROPOSE FIX | Diperbarui. |
| S14 | §9 usang, tanpa e2e, path test, `dna-domain.test.js` (readiness, codebase) | PROPOSE FIX | §9 diperbarui. |
| S15 | Siklus usang hidup lagi; indeks approved memblok promosi ulang; upsert menimpa catatan atasan (inventive, design, tahap 8) | DECLINE | ⏳ DITERIMA di §8 (redesain epoch/event ditolak tahap 8 sebagai YAGNI). |
| S16 | Snapshot bukti + `drifted`, `approved_pending_sk`, reviewer pengganti, optimasi `load()` (inventive, design) | DECLINE | Ditolak tahap 8 (YAGNI untuk POC ±200 karyawan). `okr_achievement` dinyatakan hanya untuk audit. |

## Nit

Pembulatan OKR ditulis sebagai aturan (PROPOSE FIX); "`learner` 403" (PROPOSE FIX); nomor temuan di §10a dihapus (PROPOSE FIX); menu `cp` tanpa `super` (DECLINE: B12 memegang tampilan Super Admin; tautan langsung tetap terbuka); `/paths` agregat tidak diaudit (DECLINE, dicatat); erasure vs audit meta (DECLINE, dicatat sebagai kebijakan retensi audit yang ada); enkripsi catatan merujuk `core/crypto` (PROPOSE FIX).
