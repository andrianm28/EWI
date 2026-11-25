Status: resolved (19 Nov 2026). Fixes applied in PR #17; escalations wait for the user. Escalations answered by the user on 23 Nov (see spec §15).

# Goldfish Annotated Review Report

**Target:** `docs/designs/b9-improvement-needs.md` (full file; §11–13 are earlier review logs, not target)

Inputs: stage 5 `zoom_out_report.md`, stage 6 `comprehension_report.md`, stage 7 `critic_report.md`, stage 8 `intermediate_zoom_out_report.md` (arbiter), stage 9 `implementation_readiness_report.md`, and the diff review `../diff/diff_review_report.md`. Run by reading `skills/egm-resolve/SKILL.md` in the main context (the Elephant, which wrote the spec and code).

Resolution gate: the thread runs unattended, so fixes that are text edits or test-first code changes were applied on the PR branch (reversible commits) instead of waiting at the gate. ESCALATE items are not changed and go to the user. Line numbers refer to the spec before this round.

Findings that several reviewers raised are merged into one row. One Blocker (CB9-1); one more Blocker (SR-1) was downgraded by the stage 8 arbiter and is listed as Major #21 without changing its recorded severity.

## Escalate (needs the user's knowledge)

### [E1] [`egm-design` DC-2] - Severity: Major
*   **Affected Scope:** L55 (§4.2)
*   **Discrepancy Description:** `eta_admin` gets `manage` over tenant-encrypted titles, details, summaries and grants; TNA gap routes exclude Admin ETA.
*   **Rationale:** Super Admin reading client improvement data is a privacy and commercial choice.
*   ***AI Suggestion:*** ESCALATE
*   ***Justification:*** The repo convention (`requireRole` lets `eta_admin` through) supports the current code, but whether ETA staff may read a client's INA data is a product decision nobody recorded. No code change.
*   ***Proposed Edit:*** §10 row "⚠️ `eta_admin` mendapat level `manage` seperti HR" (added).

### [E2] [`egm-design` DC-5] - Severity: Major
*   **Affected Scope:** L7, L63 (§1, §4.2)
*   **Discrepancy Description:** Action owners cannot see their own actions unless AI verification is on.
*   **Rationale:** An owner is told about work only through a Pilot feature.
*   ***AI Suggestion:*** ESCALATE
*   ***Justification:*** The mockup shows no owner view; adding `GET /actions/mine` was rejected at stage 8 (IZ-7). Whether owners need a list is Pak Eji's call.
*   ***Proposed Edit:*** §10 row "⚠️ Pemilik tindakan tidak punya tampilan…" (added).

### [E3] [`egm-zoom-out` ZO-6 / `egm-design` DC-11] - Severity: Nit
*   **Affected Scope:** L35, L56
*   **Discrepancy Description:** Pimpinan `summary` level rests on an unverified reconciliation of K-2 and K1.
*   ***AI Suggestion:*** ESCALATE
*   ***Justification:*** The brief (K2) lists no Pimpinan view; the 12 Nov grilling (K-2) gives Pimpinan read access. Only the user knows which wins.
*   ***Proposed Edit:*** §3 K-2 bullet reworded; §10 row kept.

## Blocker

### [Issue 1] [`egm-codebase-details` CB9-1] - Severity: Blocker
*   **Affected Scope:** L77 (§5)
*   **Discrepancy Description:** "every `ina_verification_turns` query joins `ina_verifications` with `tenant_id`" is false: count, INSERT and DELETE filter by `verification_id` only (`ina-stores.js:190, 194, 207`).
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** The claim is wrong as written. The code is safe because each of those queries runs after reading and locking the verification row with a tenant filter, but the spec must say that.
*   ***Proposed Edit:*** §5 sentence replaced: access always starts by reading/locking `ina_verifications` with `tenant_id`; later turn queries use that `verification_id`; transcript reads join with `tenant_id`.

## Major

| # | Reviewer · id | Finding (short) | Suggestion | Justification / edit |
| --- | --- | --- | --- | --- |
| 2 | inventive-catalyst IC-1, comprehension CO-4, design DC-3, stage 8 IZ-1, readiness IR9-1 | Writes and side effects not atomic; R2-2 broken; "pola repo" wrong | PROPOSE FIX | Code: `updateAction`/`createAction` run action, finding status and verification cancel in one transaction (commit `7ae83c8`, test IC-1). Spec §6.1 "Urutan tulis" rewritten. Audit stays after the transaction (⏳ row in §10): putting audit inside changes the shared audit service |
| 3 | inventive-catalyst IC-2 | INA writes `lna_findings.status` owned by TNA | CONTEST | Stage 8 rejected derive-at-read: TNA screens and PK-15 audit read `lna_findings.status` (`lna-stores.js` `setFindingStatus`). Recorded in new §3.1 |
| 4 | zoom-out ZO-4, stage 8 IZ-2 | INA copies `setFindingStatus`, no `tna.finding` audit | PROPOSE FIX (partly) | `tna.finding` audit added with `via:'ina'` (test ZO-4). Deviation from IZ-2: INA writes the status in its own transaction (`moveFinding`) instead of calling `stores.tna.setFindingStatus`, which runs outside the transaction and would undo IZ-1 |
| 5 | inventive-catalyst IC-3, stage 8 IZ-3 | B7 hand-off described two ways | PROPOSE FIX | §1 and §6.3 now say B7 only sets `improvement_handoff_at`; HR creates each action; mockup bulk button = open INA |
| 6 | inventive-catalyst IC-4 | Overdue verification has no consequence | DECLINE (hardening rejected by IZ-5) | §10 ⏳ row "tidak kedaluwarsa sendiri; HR membatalkannya" |
| 7 | inventive-catalyst IC-5 | AI fallback without timeout; failures swallowed | DECLINE (IZ-5) | Provider is the built-in deterministic one until Bedrock methods exist; revisit with the LLM provider |
| 8 | inventive-catalyst IC-6, zoom-out ZO-10, readiness CB9-3 | KPI from capped 2,000-row list | DECLINE (IZ-8 defers SQL aggregate) | §10 ⏳ row added |
| 9 | zoom-out ZO-1 | AI verification too large for what it does | CONTEST | Brief and mockup ask for the "Agen AI · Verifikasi" card; flag `ina.ai_verification` holds it (IZ-5). §3.1 bullet added |
| 10 | zoom-out ZO-2 | Parallel AI port instead of `src/ai` | PROPOSE FIX (text) | §6.3 now says future LLM methods go through the shared provider contract with usage records (IZ-5) |
| 11 | zoom-out ZO-3, design DC-1, readiness CB9-8 | Grant routes duplicated; TNA honours grant only with `tna.non_training_hr` | PROPOSE FIX (partly) | One audit name `tna.non_training_access` + `via` (code `7ae83c8`, test IZ-4); flag difference written in §6.2. Route merge rejected by IZ-4 |
| 12 | zoom-out ZO-5 | `involvesIndividual` solves the wrong problem | CONTEST | Mockup says individual findings are not shown; HR still needs to correct a mis-flagged action (§4.3, `hidden=1`). Stage 8 IZ-7 kept it |
| 13 | comprehension CO-1, critic SR-2, ST-3, zoom-out ZO-8 | Status line stale | PROPOSE FIX | L3 rewritten |
| 14 | comprehension CO-2, critic DC-8, readiness S9-3, IR9-3, CB9-2 | `GET /ina/owners` unspecified | PROPOSE FIX | Row added to §6.2 |
| 15 | comprehension CO-3, readiness S9-1, IR9-2 | SQL is the old draft | PROPOSE FIX | §5 DDL updated to the final migration |
| 16 | comprehension CO-5, critic ST-1, SR-3 | Codes without glossary; K-2 vs K2 | PROPOSE FIX | Terms line under status; K-2 vs K2 explained in §3 |
| 17 | comprehension CO-6 | `super` view undefined; no Pimpinan view | PROPOSE FIX | §7 explains `super` and that `summary` is used after B2 |
| 18 | comprehension CO-7 | `ina.dashboard` gates all vs `/access/me` outside | PROPOSE FIX | §6.2 says it is the only route outside the flag |
| 19 | critic ST-2 | K-2 bullet mixes rule and caveat | PROPOSE FIX | Rewritten |
| 20 | critic ST-4, SR-7 | §4.3 rules in prose | PROPOSE FIX | Role × outcome table |
| 21 | critic SR-1 (Blocker, downgraded by IZ-6), design DC-6 | No alternatives section | PROPOSE FIX | §3.1 "Alternatif yang ditolak" (4 bullets). Severity not changed; stage 8 judged a short list enough |
| 22 | critic SR-4 | Inline risks don't match §10 | PROPOSE FIX | §10 rows added for every ⚠️/⏳ in the text |
| 23 | design DC-4 | `read` level leaks `detail` and `sourceRef` | PROPOSE FIX (partly) | `sourceRef` no longer filled from a performance record (code, test CD-7). `detail` to supervisors kept, ⏳ row in §10 |
| 24 | readiness S9-2, IR9-7, comprehension CO-11 | Keyword list open-ended | PROPOSE FIX | §6.3 points to `domain.js` and its unit test instead of a partial list |
| 25 | readiness S9-4 | "atasan hanya menghitung miliknya" too narrow | PROPOSE FIX | Reworded to "cakupannya" |
| 26 | readiness IR9-4 | Old-owner title masking undocumented | PROPOSE FIX | §6.3 sentence added |
| 27 | readiness IR9-5 | Error responses open | DECLINE | Codes listed in §6.3; per-case messages live in `index.js` and tests; zoom-out ZO-7 warns against transcribing code |
| 28 | readiness IR9-6 | Field limits, "hasil tidak sah" undefined | DECLINE | Same reason as #27 |
| 29 | readiness IR9-8 | Web section names only | DECLINE | Web contract is B0 + e2e `improvement-needs.spec.ts` |
| 30 | readiness CB9-4 | "nama field" vs Indonesian labels | PROPOSE FIX | §6.1 says "label isian" |
| 31 | diff CD-1 | Unchanged owner re-validated → disabled owner blocks edits | PROPOSE FIX | Code checks references only when changed (test CD-1) |
| 32 | diff IR-1 | Verification insert race | PROPOSE FIX | Conditional `INSERT … SELECT` (test IR-1); §6.3 |
| 33 | diff IR-8 | Demoted HR keeps INA `manage` up to 8 h | PROPOSE FIX (text) | §10 ⏳ row |

## Nit

| Reviewer · id | Suggestion | Note |
| --- | --- | --- |
| IC-7, DC-9 one grant two audit names | PROPOSE FIX | Same fix as #11 |
| IC-8 verification result not prioritised | DECLINE | Hardening rejected (IZ-5) |
| ZO-7 §6 reads like code | DECLINE | Kept as API contract for web and tests |
| ZO-9 glossary conflict | PROPOSE FIX | Terms line cites `CONTEXT.md` |
| ZO-11 duplicated helpers | DECLINE | Repo-wide cleanup after 2 Des (§13 of the spec) |
| CO-8 INA/TNA/DNA undefined | PROPOSE FIX | Terms line |
| CO-9 finding status column | PROPOSE FIX | §6.1 names `lna_findings.status` path via `tna.finding` |
| CO-10 `overdue` card | PROPOSE FIX | §6.1 says it is the note on the TINDAKAN card |
| CO-12, CO-14, CO-15, CO-16, ST-6, ST-7, ST-8, SR-5, SR-6, SR-8, SR-9 | DECLINE | Wording; no reader impact after the status/terms rewrite |
| CO-13 owner of auto `involvesIndividual` | PROPOSE FIX | §10 row says B7 may fill it; §4.3 no longer says AI |
| ST-5 `ina.ai_verification` needs dashboard | DECLINE | Stated in §4.1 |
| DC-7 KPI cards vs mockup | PROPOSE FIX | §6.1 explains `lainnya` |
| DC-10 stale grants invisible | PROPOSE FIX | §10 row (CD-11) |
| S9-5, S9-6 paragraph density | PROPOSE FIX | §6.3 AI paragraph trimmed |
| IR9-9, IR9-10 test plan vs tests | PROPOSE FIX | §8 bullet for this round added |
| CB9-5, CB9-6, CB9-7, CB9-9, CB9-10 | PROPOSE FIX / DECLINE | CB9-5/6 documented (§6.1, §6.3); CB9-7/9 declined (#27); CB9-10 same as #15 |
| CD-5 cancelled verification not audited | PROPOSE FIX | Code + test; §6.1 |
| CD-6 `/turns` ignores `addTurn` false | DECLINE | Narrow race with withdraw; deferred, ticket candidate |
| CD-7 `sourceRef` from performance record | PROPOSE FIX | Same as #23 |
| CD-11 disabled supervisors hidden in `GET /access` | DECLINE | §10 row; with B2 |
| CD-12 uppercase UUID counts as change | PROPOSE FIX | `normId` (test CD-12) |
| IR-5, IR-6, IR-7 untested paths | PROPOSE FIX (IR-6) / DECLINE | IR-6 covered by the IC-1 test path; IR-5/IR-7 deferred |
