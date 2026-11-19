# Stage 7 · Critic Review · B9 Improvement Needs

Target: `docs/designs/b9-improvement-needs.md`, FeatureRange L1–74. Reviewers dispatched directly from the main context (egm-review-loop direct dispatch).

| Reviewer | Status |
| --- | --- |
| `egm-style` | completed |
| `egm-design` | completed |
| `egm-structural` | completed |

## egm-style (4 Major, 4 Nit)

- **ST-1 🟡 L31, 34, 35** decision IDs inconsistent ("K1", "K-2", "K2 di brief"); L35 mixes two different decisions.
- **ST-2 🟡 L35** K-2 bullet mixes rule, reconciliation and an unverified caveat; ends in a verbless fragment.
- **ST-3 🟡 L3, 45, 46** claims about existing code without evidence; status line packs three facts.
- **ST-4 🟡 L69** §4.3 first paragraph holds ~7 role-dependent rules; make it a list/table.
- **ST-5 🟢 L21 vs 47** mockup table omits that `ina.ai_verification` also needs `ina.dashboard`.
- **ST-6 🟢 L7** double negative / absolute in goal.
- **ST-7 🟢 L65, 71** "dengan sadar", "Catatan:" filler.
- **ST-8 🟢 L39, 73** speculative caveat; "RG-4 / ya revisi" and "INA masuk 2 Des" opaque.

## egm-structural (1 Blocker, 3 Major, 5 Nit) — verdict: revise

- **SR-1 🔴 No "Alternatives Considered" section.** Shared PM-6 grant (L32), Pimpinan visibility (L35), manual vs automatic individual flag (L73) stated without rejected options; rationale only in review log (L271) and L136.
- **SR-2 🟡 Status line (L3) out of date.**
- **SR-3 🟡 "K1" vs "K-2/K-3" vs "K2 di brief" undefined** (L31, 34, 35).
- **SR-4 🟡 Inline risks don't match §10** (L73 "AI" vs L259 "B7"); shared grant only "Disengaja"; no mitigation column.
- **SR-5 🟢** §1 has no separate problem / goals / non-goals.
- **SR-6 🟢** L11 non-goal bullet carries an integration contract.
- **SR-7 🟢** L69 rule matrix in prose.
- **SR-8 🟢** §4.2 table "–" vs API `level: null`; header casing.
- **SR-9 🟢** References not links (L17, 30, 32).

## egm-design (6 Major, 5 Nit) — verdict: needs revision

- **DC-1 🟡 L31–32 shared PM-6 grant behaves differently per module**: TNA honours it only while `tna.non_training_hr` is on (`tna/gap-routes.js:35`), INA always (`ina/access.js:20`); turning on INA flags also opens TNA non-training findings to HR (`gap-routes.js:26-28`). Panel text "berlaku juga untuk daftar temuan" false when TNA flag off.
- **DC-2 🟡 L55 `eta_admin` gets `manage`** over tenant-encrypted titles/details, summaries and grants; TNA gap routes exclude Admin ETA (`gap-routes.js:44`). Decision for user.
- **DC-3 🟡 L37 vs L171 R2-2** broken: write → side effects → audit with no transaction.
- **DC-4 🟡 L61, 71 `read` level leaks**: `detail` (HR free text) returned to supervisors; `sourceRef` auto-filled from a per-employee performance record; re-identification when interviewee is the owner.
- **DC-5 🟡 L7, 63 owners cannot see their own actions** unless AI verification (Pilot, off) is on. Proposal: `GET /actions/mine` or explicit assumption.
- **DC-6 🟡 No alternatives for the access model** (shared vs separate grant, Pimpinan levels, supervisor self-scope, manual flag vs restricted queue).
- **DC-7 🟢 L22 KPI cards not "Sama"**: mockup SOP/ALAT/SISTEM = everything except Budaya; spec's `process` excludes `lainnya`.
- **DC-8 🟢 L46** `GET /access/me` outside the flag; `GET /owners` unspecified.
- **DC-9 🟢** One grant audited under two resource names.
- **DC-10 🟢** Stale grants after demotion invisible to HR.
- **DC-11 🟢 L35, 59** Pimpinan level and `tenant_admin` depend on B2; add §10 row.
