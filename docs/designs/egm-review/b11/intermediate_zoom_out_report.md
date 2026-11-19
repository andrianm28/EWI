# Stage 8 · Intermediate Zoom Out · B11 Admin Tenant

Reviewer: `egm-zoom-out` (completed), with Stage 5–7 reports as input. Verdict: passes with changes, no Blocker (4 Major, 4 Nit).

- **IZ-1 🟡 Exit from the interim setup at B2 is incomplete** (L52–55, 59, 238; `access.js:27-46`). DB check on primary `users.role` locks out (a) users with `tenant_admin` as extra role, (b) every PK-13 tenant (manager is `hr_admin`). Smallest fix: restate DB check as "account active and token's active role is among roles assigned in DB"; make "onboarding managers moved to `tenant_admin`" an explicit precondition in §10 L238. Only finding with real production-lockout risk.
- **IZ-2 🟡 Rule-3 exception is a hand-written copy of `requireSubmodule`** (L44, 174; `index.js:298-305` vs `core/entitlement/guard.js:5-17`). Accept one option on `requireSubmodule` (`{ tenantFlag: false }`); reject IC-4's three-guard split.
- **IZ-3 🟡 Individual data for a pure `tenant_admin` undefined** (L158 vs L176). Write one decision sentence (own-upload preview only, `dna_results` excluded, rule-4 class = B2 decision) + ⏳ row.
- **IZ-4 🟡 Mitigations to reject/keep as documentation**: reject IC-1 (outbox), IC-2 (allow-list), IC-3 (auth middleware + cache; belongs to PK-16/B1, add DC-6 to L239 row); defer ZO-3 (import as `invited`); IC-6/SR-3/DC-7: soften L65 ("for sequential changes") + §10 row, no row locks.
- **IZ-5 🟡 (downgraded from SR-1 🔴) Alternatives**: one compact table of ~5–6 rows from existing inline rationale (+ DC-4 options).
- **IZ-6 🟢** Consolidate doc fixes into one "Istilah & tanda" block (⏳/⚠️, DNA/TNA/LNA, code families with sources, rule 3 quoted, kill switch). Keep §6 detail: it is the API contract for web and tests (rejects ZO-6).
- **IZ-7 🟢** Two job-role creation paths; note the HR route in §6.2, share validation later.
- **IZ-8 🟢** Stale/inconsistent: L3, L19 mockup path, `tersambung` vs "Terkonfigurasi", `gapExport` constant, importRouter signature (L158, L226), resend scope L204 vs L93/95.
