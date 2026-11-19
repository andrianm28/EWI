# Stage 9 · Implementation Readiness · B11 Admin Tenant

Target: `docs/designs/b11-admin-tenant.md`, DetailedRange L69–242. Reviewers dispatched directly.

| Reviewer | Status |
| --- | --- |
| `egm-style` | completed |
| `egm-implementation-readiness` | completed |
| `egm-codebase-details` | completed |

## egm-style (3 Major, 3 Nit) — ready once Majors fixed

- **S9-1 🟡 L204 vs L93/95** resend test "hanya untuk `invited`" narrower than `pendingLogin` contract.
- **S9-2 🟡 L146, 151, 154, 188, 241** API value `tersambung` needs two caveats; rename to `terkonfigurasi`.
- **S9-3 🟡 L226** checklist lists only `guard`, misses `only`, `ownDrafts` and the entitlement/kill-switch gate.
- **S9-4 🟢 L89** "tenant POC jauh di bawah itu" unmeasured.
- **S9-5 🟢 L171 vs 187** two different source example lists.
- **S9-6 🟢 L71, 95, 101, 182** migration block scheme unexplained; L95 mixes three things; error list omits 500; L182 dense.

## egm-implementation-readiness (7 Major, 3 Nit) — not ready as standalone build spec

- **IR9-1 🟡 L192–214, 231** test plan points at wrong files (route/flag/validation cases live in the integration file; option tests in `unit/tenant-admin.test.js`, not `unit/imports.test.js`); omits `ownDrafts` 404, `only` vs batch history, mutual-supervisor check.
- **IR9-2 🟡 L204 vs L93/95** resend scope.
- **IR9-3 🟡 L103 (+ L63)** status code for body id outside tenant undefined (code: 400; path id: 404).
- **IR9-4 🟡 L89, 103, 116–117** validation limits unstated (`employeeId` 64, name/division 255, description 2000, ≤20 levels, `programTier` enum, trim/empty→null, `status`/`q` filters, job-role PATCH with no known field → 400).
- **IR9-5 🟡 L93, 225** dependency wiring unspecified (`links`, shared `RATE`, `entitlements`, `settings`, `config.elitementor`; exact `app.js` call).
- **IR9-6 🟡 L158, 226** `importRouter` change under-specified (`ownDrafts`, option trimming); store methods and `isUniqueViolation` not listed.
- **IR9-7 🟡 L180–190** web part not buildable from text (e2e cases, invite fields, source key vs label, competency source labels, `ImportFlow.vue` states); glob in L232.
- **IR9-8 🟢 L109, 129** audit meta incomplete.
- **IR9-9 🟢 L174** kill-switch read and check order not described.
- **IR9-10 🟢 L138–140** sort orders and limits missing.

## egm-codebase-details (4 Major, 6 Nit)

- **CB9-1 🟡 L194–199, 214** test plan points at wrong files (same as IR9-1).
- **CB9-2 🟡 L52** scheduled test name `hr_admin lolos sementara` doesn't match real test name (`unit/tenant-admin.test.js:45`).
- **CB9-3 🟡 L182** menu items `users/jobs/cfg` are `views: ['admin']` only (`shell/menu.ts:51-53`); `admin` view maps only to `tenant_admin` (`shell/views.ts:21`), so before B2 no account sees the menu; hr_admin/eta_admin reach screens by URL only.
- **CB9-4 🟡 L91–109** email-failure branches (`invited: false` on POST /users, 502 `MAIL_FAILED` on resend) untested.
- **CB9-5 🟢** validation limits undocumented (same as IR9-4).
- **CB9-6 🟢 L101** error list misses 401 and kill-switch `FEATURE_DISABLED`.
- **CB9-7 🟢 L226** checklist misses `only`, `ownDrafts`.
- **CB9-8 🟢 L125** case-insensitive job-role name check is app-only; DB UNIQUE is case-sensitive (race).
- **CB9-9 🟢 L147, 151, 171** env vars for `tersambung`, default `lms.targets`, source keys vs labels.
- **CB9-10 🟢 L182** `tenantAdmin.ts` duplicates the HR import client; `updateJobRole` return type wrong.
