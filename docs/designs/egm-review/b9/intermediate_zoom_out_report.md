# Stage 8 · Intermediate Zoom Out · B9 Improvement Needs

Reviewer: `egm-zoom-out` (completed; first attempt ran while the Stage 5–7 reports were temporarily stashed during a merge and returned no verdict, so it was re-run). Verdict: pass with major revisions (4 Major, 4 Nit).

- **IZ-1 🟡 Writes not atomic, R2-2 broken; "pola repo" reason wrong** (L37, 163–171; `index.js` 189–192, 218–235). Repo uses `sequelize.transaction` widely. Accept IC-1/CO-4/DC-3 in simplest form: save + side effects + audit in one unit of work. Reject outbox/queues. Fix L171.
- **IZ-2 🟡 INA copies `setFindingStatus`** (L163; `ina-stores.js` 116–118). Accept ZO-4: call `stores.tna.setFindingStatus` and audit `tna.finding`. Reject IC-2 (derive at read).
- **IZ-3 🟡 B7 hand-off described two ways** (L11 vs L212; mockup L692–696). B7 sets only `improvement_handoff_at`; HR creates each action via `POST /actions` with `findingId`; mockup bulk button = "go to INA". Reject draft state/queue.
- **IZ-4 🟡 One grant, two route sets, two audit names, two behaviours** (L32, 182, 262). Audit under one name (`tna.non_training_access`), panel text conditional on TNA flag, one line in §10. Reject full route merge and stale-grant tracking (for now).
- **IZ-5 🟢 Keep AI verification; reject hardening** (ZO-1, IC-4, IC-5, IC-8). Keep one sentence from ZO-2: future LLM methods go through the shared provider contract with usage records.
- **IZ-6 🟢 SR-1/DC-6 downgraded from Blocker**: a 3–4 bullet "Alternatif yang ditolak" list pointing at existing rationale.
- **IZ-7 🟢 Reject added access machinery** (DC-5 `/actions/mine`, ZO-5, DC-4); record open decisions in §10 (owners have no dashboard view, `eta_admin` manage, Pimpinan summary). L69 → role × outcome table.
- **IZ-8 🟢 Doc hygiene accepted** (L3, L46/177, `/ina/owners`, final schema in §5, `lainnya` in `process` vs mockup, trim L202); reject KPI SQL aggregate (deferred) and full glossary (link + reconcile K-2/K2).
