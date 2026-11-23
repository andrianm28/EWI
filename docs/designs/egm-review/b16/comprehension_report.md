# Comprehension Report (Tahap 6 egm-review) · B16

Reviewer: `egm:egm-comprehension` (subagent baru, hanya membaca dokumen). Status: completed.

## What this proposes

Package B16 adds a "Career & Promotion" capability to the DNA submodule: endpoints under `/api/dna/career` and a Vue screen at `/cp`, behind `promotion.recommendation`. For each employee in scope it works out their position on the job role's level ladder. "Eligible" = next level exists, current level's program requirement met, next level's program tier passed, and OKR achievement (0-100, two decimals) ≥ tenant threshold (default 80). A two-step decision is recorded in `lna_promotion_decisions`: supervisor recommends/holds, then HR approves/holds (closes the cycle). Every write audits in the same transaction; notes are encrypted. Approval never changes the level; HR does that via the existing position endpoint after a formal decree.

## How the existing system works, per this document

A POC `dna/career.js` computes a "promotion candidate" from program completion only (`careerStatus()`), exposed via `GET /dna/promotion-candidates` and `career.promotionCandidate` used by `DnaView.vue`. Existing data: career levels per job role, program completions, performance records, job roles with division, B4 tiered competencies, users with role/supervisor/career level. Visibility via `scopeFor()`/`visibleEmployeeScope()`. `promotionVisibleTo` defaults to `['hr_admin']`. Level changes via `PUT /dna/employees/:userId/position` or import. Paraphrase holds except `blockedReason`/`actions` and C10 vs later decisions (findings 1-3).

## Findings

1. Major — §6 `actions`/`blockedReason` (l.157-158) vs C6 (l.106), §10a(6): no role ever receives `waiting_hr`; `held` caveat; no precedence; supervisor actions only when eligible contradicts C6 "hold always allowed on open cycle". → table (role × cycle state × eligibility) → actions/blockedReason.
2. Major — C10 (l.116) vs §10a l.219 (HR can still decide cycle opened by a then-valid supervisor); C9 (l.115) vs §10a(7) l.221 (stale cycle revives). → move carve-out into C10, gap into C9 as `[⏳ DITERIMA]`.
3. Major — HR 403 when same user recommended, `FOR UPDATE` lock, approved-first check (§10a 2, 9) and OKR dedup tie-break (§10a 5) absent from C7/C2. → put in C7/C2.
4. Major — C2 (l.88): column names/enum values of `lna_performance_records` (type, direction, name) not given; order of edge cases (actual ≤ 0 vs negative skipped) unclear. → name columns, state evaluation order.
5. Major — "terenkripsi per tenant (R2-3)": helper, key source, decrypt point not named. → name `core/crypto` and decrypt point.
6. Major — decision codes (RG-1e, RG-3, R2-2, R2-3, PK-15, K2, G2-A) lack glossary; R2-2 never explained. → glossary/link.
7. Nit — C7: how zero-row update distinguishes `ALREADY_DECIDED` vs `SUPERVISOR_NOT_RECOMMEND` (re-read).
8. Nit — C11: `okrMin`/`metricTypes` normalisation belongs in §4.
9. Nit — helpers/terms undefined (`requireSubmodule`, `requireFlag`, `requireRole`, `scopeFor`, `audit.readIndividual`, kill switch, B0, `meta.flag` vs `meta.views`, "kompetensi jabatan").
10. Nit — people/process jargon (Pak Eji, Mas Abdan, T3, brief, ikan mas) and local mockup path.
11. Nit — KPI fields undefined; `hold` vs `held`; owner response of `career.promotionCandidate`.
12. Nit — §11 rounding rule only by example (79.5).
