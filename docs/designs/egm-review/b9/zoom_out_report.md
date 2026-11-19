# Stage 5 · Initial Zoom Out · B9 Improvement Needs

Target: `docs/designs/b9-improvement-needs.md` (full file; §11–13 not target). Dispatched directly from the main context (the `egm-synthesizer` subagent has no Agent tool in this harness, so it could not nest reviewers).

| Reviewer | Status |
| --- | --- |
| `egm-inventive-catalyst` | completed |
| `egm-zoom-out` | completed |

## egm-inventive-catalyst (6 Major, 2 Nit)

- **IC-1 🟡 Writes without shared transaction leave state a retry cannot repair** (L37, 163, 167, 168, 171). PATCH: status saved, then `cancelOpenVerifications`/`setFindingStatus` fails; retry with same value returns early, side effects and audit never run. POST from finding: retry gets 409 and finding never becomes `planned`. POST without finding: audit fail → 500, retry creates a second action. `ina-stores.js` already uses `sequelize.transaction`.
- **IC-2 🟡 INA writes `lna_findings.status`, a table owned by TNA/B6/B7** (L163, 212). Proposal: derive finding status from `ina_actions` at read time.
- **IC-3 🟡 B7 integration direction contradicts itself** (L11 push vs L212 pull) and the mockup's bulk "Buat tindakan di Improvement Needs" button cannot coexist with per-action title + `involvesIndividual` (L71). Proposal: B7 writes handoff marker only; INA pulls into a queue or creates `draft` actions.
- **IC-4 🟡 Overdue verification has no consequence** (L77, 124, 188). An ignored `assigned` verification blocks new ones forever (409). Proposal: compute `verification.overdue` at read time, lazy expiry.
- **IC-5 🟡 AI fallback with no timeout; failures swallowed** (L202; `verification-ai.js` 62–65, 71–77 `catch {}`). Proposal: per-call timeout, record fallback reason, store question provider.
- **IC-6 🟡 KPI and lists silently capped (2000/500) and computed in JS** (L150, 157); `hidden=1` fetches the list twice. Proposal: SQL aggregate for KPIs, `meta.truncated`.
- **IC-7 🟢 One supervisor grant audited under two resource names** (`ina.supervisor_access` vs `tna.non_training_access`).
- **IC-8 🟢 Verification result not prioritised for HR** (no `needsReview` / `kpis.blocked`).

Reviewer judged tenancy, gates, PO-6 privacy split and the state machine balanced.

## egm-zoom-out (5 Major, 6 Nit) — verdict: pass with major revisions

- **ZO-1 🟡 AI verification is a large subsystem (9 endpoints, 2 tables, consent, 5 states) for what is today a fixed 3-question form + regex classifier** (L47, 105–133, 184–208). Proposal: defer §6.3 or replace with owner "update status".
- **ZO-2 🟡 Parallel AI port instead of `src/ai`** (L136, 202). `src/ai/index.js` already has `nextQuestion({submodule,…})` + usage records + stub; spec says shared AI code "tidak diubah". Mockup routes "Buka wawancara AI" to the shared interview hub.
- **ZO-3 🟡 §6.2 re-implements TNA grant routes** (`ina/index.js:241-273` vs `tna/index.js:206-239`): same row, two audit resources, two flags, two scope meanings.
- **ZO-4 🟡 INA writes `lna_findings.status` via its own store with no `tna.finding` audit** (L163; `ina-stores.js:111-118`). `stores.tna.setFindingStatus` exists; TNA audits finding status changes (PK-15).
- **ZO-5 🟡 `involvesIndividual` machinery may solve the wrong problem** (L61, 67–73, 150, 167). Mockup: individual findings "tidak ditampilkan di sini"; root fix = such findings never become INA actions.
- **ZO-6 🟢 Pimpinan `summary` level rests on an unverified decision** (L35, 56, 150).
- **ZO-7 🟢 §6.1/§6.3 read like a transcription of `index.js`** (regex keywords, validation, transition table).
- **ZO-8 🟢 Stale header** (L3 "web menunggu B0") and two-step schema in §5.
- **ZO-9 🟢 Glossary conflict**: CONTEXT.md prefers "Improvement Needs" over "temuan non-pelatihan".
- **ZO-10 🟢 KPI from a 2000-row capped list** (same as IC-6).
- **ZO-11 🟢 Small helpers duplicated across modules.**
