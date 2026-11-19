# Stage 5 · Initial Zoom Out · B11 Admin Tenant

Target: `docs/designs/b11-admin-tenant.md` (full file; §11–13 not target). Dispatched directly from the main context (the `egm-synthesizer` subagent has no Agent tool in this harness, so it could not nest reviewers).

| Reviewer | Status |
| --- | --- |
| `egm-inventive-catalyst` | completed |
| `egm-zoom-out` | completed |

## egm-inventive-catalyst (4 Major, 5 Nit)

- **IC-1 🟡 Audit R2-2 silently lost on retry** (L37, 97, 99, 105). Save then audit without shared transaction: a failed audit returns 500 after data is saved; a retried PATCH sees no change and writes no audit; POST retry gets 409. `sendInvite` sends mail before `audit.record`. Proposal: write business row and audit in one transaction (or outbox).
- **IC-2 🟡 All `hr_admin` = tenant admin until B2 is wider than needed** (L52, 238). Proposal: interim allow-list in `tenants.settings.tenantAdminUserIds`.
- **IC-3 🟡 Per-request DB status check only on `/api/tenant-admin`** (L55, 107, 239). Disabled user keeps 8 h of JWT access elsewhere. Proposal: move the check into shared auth middleware with a short TTL cache.
- **IC-4 🟡 Rule 3 deviation avoidable by splitting `requireSubmodule`** (L44, 174). index.js re-implements entitlement + kill switch. Proposal: `requireEntitlement` + `requireNotKilled` + `requireModuleFlag`.
- **IC-5 🟢 Re-importing a revised DACUM (v2.1 → v2.2) is undefined**; existing rows are rejected, no delete path.
- **IC-6 🟢 "At least one active admin" not guaranteed under concurrent mutual disable** (L65).
- **IC-7 🟢 Admin is the retry mechanism for invitation email** (L93, 105).
- **IC-8 🟢 `importRouter` accumulates one-off switches** (`guard`, `only`, `ownDrafts`).
- **IC-9 🟢 API value `tersambung` means "configured"; `gapExport: true` is a constant shown as live status.**

Already balanced per reviewer: DB-read gate (L55), `only` limited to two kinds, `ownDrafts`, one file per job role, period from `import_batch_id`.

## egm-zoom-out (6 Major, 4 Nit) — verdict: passes with changes

- **ZO-1 🟡 Hand-written copy of `requireSubmodule`** (L174; `tenant-admin/index.js:298-305`). Proposal: `requireSubmodule(sm, deps, { tenantFlag: false })` so the rule-3 exception lives in one place.
- **ZO-2 🟡 "Only place for role rules" not true** (L48, 95). `imports/kinds/employees.js:44-50` also assigns roles with different rules; `POST /api/invitations` is a second invite path.
- **ZO-3 🟡 `pendingLogin` and `disabled → invited` rewrite treat a symptom** (L92, 95). Cause: `lna-stores.js:118` creates imported employees as `active` before first login.
- **ZO-4 🟡 Job-role endpoints exceed agreed scope and duplicate `POST /api/dna/job-roles`** (L24 vs 116–118, 126).
- **ZO-5 🟡 Individual-data rule inconsistent** (L158 excludes `dna_results`, L176 previews per-employee KPI rows); no visibility class for a future pure `tenant_admin` under rule 4.
- **ZO-6 🟡 Too much code-level detail** in §6.1/§6.3 (field lengths, trim, null-clearing).
- **ZO-7 🟢 POST vs PATCH job role return different shapes** (L126).
- **ZO-8 🟢 `lms.gapExport` always `true`** (L147, 153).
- **ZO-9 🟢 `competencyModel` in `/imports/summary` duplicates `/job-roles`** (L138 vs 115).
- **ZO-10 🟢 Stale header (L3) and role labels outside `core/rbac/roles.js`.**
