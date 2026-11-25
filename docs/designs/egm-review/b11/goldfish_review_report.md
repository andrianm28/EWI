Status: resolved (19 Nov 2026). Fixes applied in PR #17; escalations wait for the user. Escalations answered by the user on 23 Nov (see spec §15).

# Goldfish Annotated Review Report

**Target:** `docs/designs/b11-admin-tenant.md` (full file; §11–13 are earlier review logs, not target)

Inputs: stage 5 `zoom_out_report.md`, stage 6 `comprehension_report.md`, stage 7 `critic_report.md`, stage 8 `intermediate_zoom_out_report.md` (arbiter), stage 9 `implementation_readiness_report.md`, and the diff review `../diff/diff_review_report.md`. Run by reading `skills/egm-resolve/SKILL.md` in the main context (the Elephant, which wrote the spec and code).

Resolution gate: the thread runs unattended, so text edits and test-first code changes were applied on the PR branch (reversible commits) instead of waiting at the gate. ESCALATE items are not changed and go to the user. Findings raised by several reviewers are merged into one row. Line numbers refer to the spec before this round.

## Escalate (needs the user's knowledge)

### [E1] [`egm-design` DC-2, `egm-inventive-catalyst` IC-2] - Severity: Major
*   **Affected Scope:** L52, L66–67 (§4.2, §4.3)
*   **Discrepancy Description:** Until B2, every `hr_admin` is a full tenant admin: creates accounts, changes roles, disables other admins including the PK-13 manager.
*   **Rationale:** Wider than needed during the interim.
*   ***AI Suggestion:*** ESCALATE
*   ***Justification:*** The allow-list alternative (IC-2) was rejected at stage 8 because it changes shared settings for a short interim. Whether this risk is acceptable if B2 slips past 2 Des is for Pak Eji / Andrian.
*   ***Proposed Edit:*** Risk stated in §4.2 and as a §10 ⏳ row (added). No code change.

### [E2] [`egm-design` DC-8] - Severity: Nit
*   **Affected Scope:** L64 (§4.3)
*   **Discrepancy Description:** Client admins cannot remove `eta_admin` accounts in their tenant and see ETA emails.
*   ***AI Suggestion:*** ESCALATE
*   ***Justification:*** Written now as a decision in §4.3, but no recorded user decision exists; confirm with the user.
*   ***Proposed Edit:*** §4.3 sentence "Keputusan: admin klien tidak bisa menghapus akun ETA…" (added).

## Blocker

### [Issue 1] [`egm-structural` SR-1] - Severity: Blocker
*   **Affected Scope:** whole Feature section
*   **Discrepancy Description:** No "Alternatives Considered" section; rejected options only inline.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Valid per feature-spec-standard. Stage 8 (IZ-5) judged one compact table enough.
*   ***Proposed Edit:*** New §3.1 table with five rejected alternatives.

## Major

| # | Reviewer · id | Finding (short) | Suggestion | Justification / edit |
| --- | --- | --- | --- | --- |
| 2 | design DC-1, DC-3, comprehension CO-4, stage 8 IZ-1 | DB check on primary `users.role` locks out B2 users; dropping `hr_admin` locks out PK-13 tenants | PROPOSE FIX | Code: gate requires the token's active role to be among roles assigned in DB (`actor.roles` or `[actor.role]`), test DC-1 red then green (commit `d34f1b0`). Spec §4.2 restated; migration of onboarded managers to `tenant_admin` written as a precondition and §10 row |
| 3 | inventive-catalyst IC-1 | Audit lost on retry; no shared transaction | DECLINE (outbox rejected by IZ-4) | §10 ⏳ row; same pattern as `core/flags/admin-routes.js` |
| 4 | inventive-catalyst IC-3 | DB status check only on `/api/tenant-admin` | CONTEST | Belongs to PK-16/B1 session work (stage 8 IZ-4); §10 row for demoted `hr_admin` elsewhere |
| 5 | inventive-catalyst IC-4, zoom-out ZO-1, diff CD-2, stage 8 IZ-2 | Hand-written copy of `requireSubmodule` | PROPOSE FIX | `requireSubmodule(sm, deps, { tenantFlag: false })` with unit tests (`gating.test.js`, red then green); tenant-admin import gate uses it (commit `5f35f85`) |
| 6 | zoom-out ZO-2 | "Only place for role rules" untrue (employees import, `/api/invitations`) | PROPOSE FIX (text) | §3.1 explains why HR routes are not reused; employees import is not opened to admins (`only`) |
| 7 | zoom-out ZO-3 | `pendingLogin` treats a symptom (imports create `active`) | DECLINE (deferred by IZ-4) | Changing the employees import is outside B11 |
| 8 | zoom-out ZO-4, stage 8 IZ-7 | Job-role endpoints duplicate `POST /api/dna/job-roles` | PROPOSE FIX (text) | §6.2 names the HR route and its weaker validation; §10 row |
| 9 | zoom-out ZO-5, stage 8 IZ-3 | Individual data rule for `tenant_admin` undefined | PROPOSE FIX | One decision sentence in §6.3 + §10 ⏳ row |
| 10 | zoom-out ZO-6 | Too much code-level detail | CONTEST | Stage 8 IZ-6: §6 is the API contract for web and tests |
| 11 | style ST-1, structural SR-4, comprehension CO-7, stage 8 IZ-8 | Status line stale | PROPOSE FIX | L3 rewritten |
| 12 | style ST-2, comprehension CO-1, CO-2, CO-8, CO-10, stage 8 IZ-6 | Codes, rule 3, kill switch, DNA/TNA without legend | PROPOSE FIX | "Istilah dan tanda" table under the status |
| 13 | style ST-3 | "kecuali user memutuskan lain" | PROPOSE FIX | Replaced by an explicit precondition and §10 rows |
| 14 | style ST-4, structural SR-3, design DC-7, inventive-catalyst IC-6 | "At least one admin" stated as absolute | PROPOSE FIX | §4.3 softened; concurrency and `eta_admin` exceptions; §10 row |
| 15 | structural SR-2 | §1 mixes problem, goals, non-goals | DECLINE | Short section; stage 8 kept it |
| 16 | structural SR-5 | Inline ⏳/⚠️ not linked to §10 | PROPOSE FIX | Every marker now has a §10 row |
| 17 | design DC-4 | No alternatives | PROPOSE FIX | Same as Issue 1 |
| 18 | design DC-5 | B2 contract unverifiable (other branch) | PROPOSE FIX (text) | §4.2 says the file lands with the B2 PR |
| 19 | comprehension CO-3 | Display roles vs role keys; `pimpinan` | PROPOSE FIX | Terms table maps Admin Tenant / Super Admin to keys |
| 20 | comprehension CO-5, readiness S9-1, IR9-2, stage 8 IZ-8 | Resend scope `invited` vs `pendingLogin` | PROPOSE FIX | §8 says `pendingLogin` |
| 21 | comprehension CO-6, readiness S9-3, IR9-6, CB9-7 | `importRouter` signature misses `only`, `ownDrafts`; checklist | PROPOSE FIX | §6.3 item 1 and §9 updated; batch filter in SQL |
| 22 | comprehension CO-9 | `missed` undefined | PROPOSE FIX | §6.3 defines `records`/`missed` |
| 23 | readiness S9-2, inventive-catalyst IC-9, CB9-9 | API value `tersambung` | PROPOSE FIX | Renamed to `terkonfigurasi` in API, web type, label check and e2e (commit `5f35f85`); env vars named |
| 24 | readiness IR9-1, CB9-1, diff CD-4, IR-3 | Test plan points at wrong files | PROPOSE FIX | §8 and §9 now list `unit/tenant-admin.test.js` (options) and `unit/gating.test.js`; `unit/imports.test.js` removed |
| 25 | readiness IR9-3, diff CD-3, IR-4 | Body id outside tenant: 400 vs 404 | PROPOSE FIX | §4.3 and error list: URL id 404, body id 400 |
| 26 | readiness IR9-4, CB9-5 | Validation limits unstated | PROPOSE FIX | §6.1 lists limits |
| 27 | readiness IR9-5 | Dependency wiring unspecified | DECLINE | Visible in `app.js`; not needed by a reader of the contract |
| 28 | readiness IR9-7, CB9-10 | Web part not buildable from text | DECLINE | Web contract is B0 + e2e `admin-tenant.spec.ts` |
| 29 | readiness CB9-2 | Scheduled test name wrong | PROPOSE FIX | §4.2 cites the real test name |
| 30 | readiness CB9-3 | Menu items invisible before B2 | PROPOSE FIX (text) | §7 states it as intended (HR menu stays as in the mockup) |
| 31 | readiness CB9-4 | Email-failure branches untested | PROPOSE FIX | Test CB9-4 added (characterisation; passed on first run) |
| 32 | diff CD-8, IR-2 | Supervisor grant survives role change | PROPOSE FIX | Revoke + audit `tna.non_training_access` `reason:'role_changed'`, test red then green (`dbe26d3` → `5f35f85`); §4.3 |
| 33 | diff CD-10 | Admin `/batches` filtered after `LIMIT 100` | PROPOSE FIX | `imports.list(…, kinds)` filters in SQL, test red then green |

## Nit

| Reviewer · id | Suggestion | Note |
| --- | --- | --- |
| IC-5 revised DACUM re-import | DECLINE | Depends on real DACUM files (26 Nov, B4) |
| IC-7 admin as retry mechanism for mail | DECLINE | Accepted design (§6.1) |
| IC-8 `importRouter` switches accumulate | DECLINE | Three options; revisit if a fourth appears |
| ZO-7 POST vs PATCH job role shapes | DECLINE | Documented in §6.2 |
| ZO-8, IZ-8 `gapExport` constant | DECLINE | Documented as K4 note in §6.3 |
| ZO-9 `competencyModel` duplicates `/job-roles` | DECLINE | Different screen, different shape |
| ZO-10 role labels outside `roles.js` | DECLINE | With B2 (spec §13) |
| ST-5, ST-6, ST-7, SR-8 wording | PROPOSE FIX | §2 and §4.3 sentences reworded |
| ST-8, SR-7, SR-10, DC-11 pointers and paths | PROPOSE FIX | Mockup artifact link added |
| SR-6, SR-9 ordering | DECLINE | No reader impact |
| DC-6 demoted `hr_admin` keeps HR powers | PROPOSE FIX | §10 row |
| DC-9 integration card differs from mockup | PROPOSE FIX | §2 row says so |
| DC-10 levels / `programTier` | PROPOSE FIX | §2 row |
| S9-4 "tenant POC jauh di bawah" | DECLINE | Pilot size known (L1 team) |
| S9-5, S9-6 example lists, density | DECLINE | Wording |
| IR9-8, IR9-9, IR9-10 audit meta, order, sort | DECLINE | Code is the source; zoom-out ZO-6 warns against more detail |
| CB9-6 error list misses 401, kill switch | PROPOSE FIX | Error list updated |
| CB9-8 case-insensitive name race | DECLINE | §10 row; index needs a migration (Andrian) |
| IR-9 `GET /users` no `readIndividual` | DECLINE | Directory data (name, email, role), not individual assessment data; ticket candidate |
| IR-10 resend rate-limit check-then-act | DECLINE | §10 row |
| CD-9 three UUID regexes | DECLINE | Repo-wide cleanup after 2 Des |
| Comprehension nits (24) | DECLINE | Covered by the terms table where they affect meaning |
