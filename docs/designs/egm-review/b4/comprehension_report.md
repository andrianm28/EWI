# Comprehension Report (Tahap 6 egm-review) · B4

Reviewer: `egm:egm-comprehension` (subagent baru, hanya membaca dokumen). Status: completed.

## What this proposes

A "Developmental Needs" feature in the DNA submodule. Per job role, HR and supervisors see a competency dictionary grouped by job function, a Basic/Intermediate/Advanced curriculum, each employee's stage and a per-employee plan. Competencies get nullable `code`, `stream`, `program_tier`; new tables `lna_job_functions` and a link table. No plan table: plans are recomputed from latest assessments. Stage = lowest tier with at least one assessed module below target; `done` if none; `not_assessed` if nothing assessed. Module status `met`/`develop`/`locked`/`not_assessed`. ~11 endpoints behind `module.dna`, role checks and RG-3 scope, with read-audit. Import gains the new columns, can fill existing rows, plus a `dna_job_functions` kind. A Vue screen replaces `legacy-dna` in the same PR.

## How the existing system works, per this document

POC (PR #2) has job roles, career levels, competencies (`kind` job/core, `required_score`, `approved_at`), 0–4 assessments, per-position gap (`computeGap`, latest assessment). Routers mount via `requireSubmodule('dna')`. Visibility via `scopeFor()`/`visibleEmployeeScope()`; out-of-scope → 404. Import kinds commit row by row without transaction; competencies keyed by job role + level + name; `checkPositionIds`. Audit actions limited by CHECK. `lna_program_completions` belongs to B16.

## Findings

1. Major — l.1, 7, 9, 209-218: title "(backend)" and "e2e tidak berubah" vs screen + `b4-dna.spec.ts` in same PR; §12 claims no drift. → update header and l.9.
2. Major — l.169 flag rationale contradicted by l.7/211 (screen ships in same PR). → restate.
3. Major — two "## 11", §9b after §11, ambiguous cross-refs. → renumber / appendix.
4. Major — A6 advice text (l.99) "semua modul <Tingkat> tercapai" contradicts A4 (only assessed modules). → reword.
5. Major — brief "bangun penuh 19 Nov, thread T3" cited as authority but not linked. → link/quote.
6. Major — project codes undefined (B0, B6/B10, K1/K3/K4, Q12, RG-3, R2-2, F6-A, PK-18, commit e2d3707). → reference table; at least define B0.
7. Nit — §9a/§9b refer to finding numbers not listed; "(6)" used twice; `orConflict` undefined.
8. Nit — l.128 "KPI all zero" vs l.135 tenant-wide `jobsTotal`.
9. Nit — DACUM Tool 1/2/3 not expanded.
10. Nit — `approved` boolean vs count.
11. Nit — `kind`, `eta_admin`, "super" view, `menuKey`, "Beranda" not in §3.
12. Nit — mockup path without root/link.
13. Nit — file list all `[x]` (spec vs status); `conflict` helper "bila belum ada" vs l.140.
