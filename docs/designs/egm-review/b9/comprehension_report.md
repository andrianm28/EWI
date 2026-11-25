# Stage 6 · Comprehension Test · B9 Improvement Needs

Reviewer: `egm-comprehension` (completed). FeatureRange L1–74, DetailedRange L75–263. Read only the target.

## What this proposes

Package B9 "Improvement Needs": HR records and tracks fixes for problems training cannot solve (SOP, tools, systems, culture, or "other" with a sub-label), found during training-needs work. Each action has title, category, optional owner, due date and status (new → in progress → done/rejected). HR sees and manages all actions; a supervisor sees only actions owned by themselves or direct reports, and only while HR has granted access (the same grant used for non-training findings). Leadership sees KPI totals only. Actions HR flags as "involving an individual" are hidden from lists and KPIs. Behind a separate flag, HR can assign a short AI check-in to the owner: consent, max three questions, HR sees summary and reported status, never the transcript; owner can withdraw (turns deleted); the result never changes action status by itself. Until the LLM provider gets two new methods, a built-in fallback produces a fixed-sentence summary using keyword rules. Includes a Vue screen, owner check-in screen and shell reminder. PDF reports, whistleblowing and voice are out of scope.

## How the existing system works, per this document

Root-cause interviews (B6) produce findings; HR review (B7, PK-14) classifies them as training or non-training and will expose a handoff list that does not exist yet. PR #12 built a per-supervisor grant for non-training findings (`lna_non_training_grants`, store functions in `tna.*`). `requireSubmodule('ina')` gates `/api/ina`; flag `ina.dashboard` exists; `visibleEmployeeScope()` limits a supervisor to self and direct reports. Reads/writes of individual data are audited and a failed audit must fail the request; interview text is encrypted per tenant with a shared `cipher`. `lna_interview_sessions` serves DNA/TNA interviews and is being reworked by B6. An AI layer exists at `src/ai/index.js` with a Bedrock provider. A legacy INA screen exists at `/m/ina`; new screens build on the B0 shell (PR #18).

## Findings (7 Major, 9 Nit)

- **CO-1 🟡** L3 "Bagian web menunggu B0" conflicts with §7 and checklist L251 (web done).
- **CO-2 🟡** L222 `GET /ina/owners` used by the owner picker but never specified in §6.
- **CO-3 🟡** L77 vs SQL L105–124: SQL is the old draft (no `withdrawn`, no `due_date`); unclear how `withdrawn` relates to the open-verification index and to `lastVerification`.
- **CO-4 🟡** L171 vs L37: R2-2 "audit fail = request fail" vs save-then-audit without transaction; resulting state undefined.
- **CO-5 🟡** Many decision/package codes without glossary or link (PK-14/15, PM-8, K-3, BI-21, RG-4, T5/T6/B0/B2/B12/B18, "the brief"); L35 "K-2 (12 Nov)" vs "K2 di brief" collide.
- **CO-6 🟡** L222 web route `views: ['hr','atasan','super']`: `super` undefined, no Leadership view although API has `summary` level.
- **CO-7 🟡** L46 says `ina.dashboard` gates all action and supervisor-access routes; L177 says `GET /access/me` is outside the flag.
- **CO-8 🟢** INA/TNA/DNA/LNA never expanded.
- **CO-9 🟢** L163 finding status column not named; effect of `rejected` action or `ON DELETE SET NULL` on the finding not stated.
- **CO-10 🟢** `kpis.overdue` has no card in the four-card mockup.
- **CO-11 🟢** L202 keyword list ends in "…"; precedence and "tanpa negasi" undefined.
- **CO-12 🟢** L192 consent response shape uses "...".
- **CO-13 🟢** L73 vs L259: future owner of auto-filling `involvesIndividual` (AI vs B7) inconsistent.
- **CO-14 🟢** CLAUDE.md rules cited without content (L30, 65).
- **CO-15 🟢** "QA malam" and "dipasang otomatis oleh shell B0" undefined (L202, 220, 260).
- **CO-16 🟢** L39 "INA masuk 2 Des" ambiguous (release, merge or pilot).
