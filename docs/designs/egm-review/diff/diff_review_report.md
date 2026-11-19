# Diff review (rule 11 step 5) · PR #17 B9 + B11

Diff: B9/B11 changes only (base = scbrmb `4ca0f70` merged with PR #18 head `4823b8e`, so B0 shell changes are excluded). Reviewers: registered egm agents, fresh context, given only the diff, the specs and CLAUDE.md.

| Reviewer | Status |
| --- | --- |
| `egm-codebase-details` | completed |
| `egm-implementation-readiness` | completed |

## egm-codebase-details (4 Major, 8 Nit, no Blocker)

Verified clean: tenant filter on every new query, migration `down`, both new flags default off, supervisor scope via `visibleEmployeeScope`, transcripts owner-only, encryption, audit on reads/writes, DB re-read in `requireTenantAdmin`, `only`/`ownDrafts` limits.

- **CD-1 🟡** `ina/index.js:149-154` `readFields` validates `ownerUserId` (and `competencyId`, `performanceRecordId`) even when unchanged; web always sends `ownerUserId`, so an action whose owner was disabled cannot be edited (400 "Pemilik tidak ditemukan").
- **CD-2 🟡** `tenant-admin/index.js:298-306` admin import gate re-implements entitlement + kill switch instead of `requireSubmodule` (rule 3 deviation, needs Andrian).
- **CD-3 🟡** B11 spec L63/L101 says unknown body ids → 404; code and test return 400. Spec wrong.
- **CD-4 🟡** B11 spec ticks `tests/unit/imports.test.js` for `jobRoleId`/`source` options, but the file has no such cases; uncovered: same job role in column accepted, `options.source` fallback, 64-char source limit.
- **CD-5 🟢** Auto-cancelled verifications get no `ina.verification` `cancelled` audit event.
- **CD-6 🟢** `/turns` ignores `addTurn` false (withdraw/cancel during generation) and still returns a question.
- **CD-7 🟢** `sourceRef` derived from an individual performance record reaches supervisors.
- **CD-8 🟢** Supervisor grant survives role change away from `supervisor`.
- **CD-9 🟢** Three UUID regexes across modules (`tna/assignment.js` `isUuid`, INA copy, looser tenant-admin regex).
- **CD-10 🟢** Admin `/batches` filters `only` after HR's `LIMIT 100`.
- **CD-11 🟢** `GET /ina/access` hides disabled supervisors who still hold a grant.
- **CD-12 🟢** Uppercase UUID in `ownerUserId` counts as a change → false audit + cancelled verification.

## egm-implementation-readiness (3 Major, 7 Nit, no Blocker)

- **IR-1 🟡** Race: `POST /actions/:id/verifications` (`ina/index.js:281-290`, `ina-stores.js:139-147`) checks owner/individual/open on a stale read and inserts unconditionally; a concurrent PATCH can cancel first, leaving an open verification for the old owner or a closed/hidden action, and the old owner then sees the current title. Fix: conditional `INSERT … SELECT … WHERE` on current action state.
- **IR-2 🟡** Supervisor grant survives B11 role change; HR can neither list nor revoke it (`GET /access` lists supervisors only, `DELETE` 404s on non-supervisor); re-promotion silently restores access (same as CD-8).
- **IR-3 🟡** B11 §8/§9 test bookkeeping wrong: `imports.test.js` untouched; option tests live in `tests/unit/tenant-admin.test.js:75-111`; route/flag/validation tests live in the integration file (overlaps CD-4).
- **IR-4 🟢** B11 §4.3 body ids → 404 contradicts code/test (400) (same as CD-3).
- **IR-5 🟢** Deactivated owner paths untested; disabling an owner leaves an open verification blocking new ones.
- **IR-6 🟢** "Marking individual cancels open verification" untested.
- **IR-7 🟢** `ina.ai_verification` on with `ina.dashboard` off untested.
- **IR-8 🟢** INA access read from token while B11 gate re-reads DB; demoted `hr_admin` keeps INA manage up to 8 h — note in B9 §10.
- **IR-9 🟢** B11 `GET /users` does not `audit.readIndividual`, B9 does; no stated rule.
- **IR-10 🟢** Resend-invite rate limit is check-then-act.
