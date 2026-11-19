# Drift report 2026-11-19

Scope: sections 1–10 of each design doc, checked against the code as of 19 Nov 2026 14:40 UTC. Both docs were edited during the review (b9 §5 and §6.1/§6.3 text, plus a new §14 in both docs). This report reflects the latest version. Doc line numbers refer to that version.

## b9-improvement-needs.md

- **`?hidden=1` for non-HR returns 403 instead of being ignored.** Doc §4.3 table (b9:83–84) says `?hidden=1` is "diabaikan" (ignored) for `read` (supervisor) and `summary` (pimpinan). Code rejects it with 403 `ROLE_FORBIDDEN`: `apps/api/src/modules/ina/index.js:88-89`. The integration test asserts the 403 (`apps/api/tests/integration/ina.test.js:216`).
- **Keyword rules for `reportedStatus` live in a different file than the doc says.** Doc §6.3 (b9:219) says the keyword rules are "di `domain.js`". `apps/api/src/modules/ina/domain.js` has no keyword logic. The regexes and `classify()` are in `apps/api/src/modules/ina/verification-ai.js:23-35`.
- **`GET /access/me` is not the only route outside `ina.dashboard`.** Doc §6.2 (b9:193) calls it "satu-satunya rute di luar flag itu". `r.get('/')` at `apps/api/src/modules/ina/index.js:42` is also mounted without the `dashboard` middleware. It returns `{ module, title, tenantId }`.
- **The web screen cannot create an action from a finding (incomplete model in the web client).** Doc §1 (b9:13) and §6.3 (b9:229) say HR creates each action "di layar ini" through `POST /ina/actions` with `findingId`. In `apps/web/src/api/ina.ts:30-33`, `ActionInput` has no `findingId`, `competencyId` or `performanceRecordId`, and `ImprovementNeedsView.vue:126-130` never sends them. Only the API supports creating from a finding.
- **The web `InaAction` type is missing fields from the doc's `action` shape.** Doc §6.1 (b9:171) defines `createdAt`, `updatedAt`, `competencyId*` and `performanceRecordId*`. The API returns them (`index.js:62-64`), but `apps/web/src/api/ina.ts:21-27` does not declare them.
- **Title masking for an old owner has an extra trigger the doc does not mention.** Doc §6.3 (b9:215) says the action title is replaced only for the old owner after the owner changes. `ownerView` at `apps/api/src/modules/ina/index.js:77` also replaces it when the action is now `involvesIndividual`, including for the current owner.
- **Manual cancel by HR is audited without a `reason`.** Doc §6.1 (b9:183) says each verification cancellation is audited as `cancelled` with a `reason`. The doc lists only the automatic reasons (`owner_changed`, `action_closed`, `involves_individual`). `POST /verifications/:id/cancel` records `{ event: 'cancelled' }` with no `reason` (`apps/api/src/modules/ina/index.js:428`). The doc does not describe this path.
- **`GET /verifications` has an undocumented 500-row cap.** Doc §6.3 (b9:206) says the route returns all verifications ("semua"), and §10 (b9:284) mentions only the 2,000-row cap on actions. `listVerifications` has `LIMIT 500` (`apps/api/src/db/ina-stores.js:198`). `GET /verifications/mine` uses the same cap.
- **The store exports a method nothing calls.** `cancelOpenVerifications` (`apps/api/src/db/ina-stores.js:214-216`) is never called. Cancellation goes through the transactional `cancelOpen` inside `updateAction` (`ina-stores.js:141`). The doc does not mention this method.
- **The migration up-down-up test is not where the doc puts it.** Doc §8 (b9:257) lists "migrasi naik-turun-naik" under `apps/api/tests/integration/ina.test.js`. That file has no migration test. The check runs in CI at `.github/workflows/ci.yml:37-41`.
- **Minor: `inaAccess` takes two arguments.** Doc §4.2 (b9:60) gives the signature as `inaAccess(req)`. The code is `inaAccess(req, stores)` (`apps/api/src/modules/ina/access.js:15`), and every call site passes `stores`.
- **Minor: undocumented validation on `GET /actions`.** An unknown `status` or `category` query value returns 400 (`apps/api/src/modules/ina/index.js:86-87`). Doc §6.1 (b9:166) does not say this.

## b11-admin-tenant.md

- **Wrong default for `lms.targets`.** Doc §6.3 (b11:172 JSON example, b11:178) says `lms.targets` defaults to `["elitementor"]`. The actual default is `['elitementor', 'moodle']` (`apps/api/src/core/settings/index.js:20-24`). `/imports/summary` returns it unchanged (`apps/api/src/modules/tenant-admin/index.js:293`), and the web screen already labels Moodle (`apps/web/src/screens/b11-admin/ConfigView.vue:37`).
- **Missing feature: the web screen cannot add career levels to a new job role.** Doc §2 (b11:37) says "Tambah jabatan baru (nama, divisi, jenjang dengan tingkat program Basic/Intermediate/Advanced)". The API accepts `levels` (`apps/api/src/modules/tenant-admin/index.js:231-238`). The web form only has `{ name, division }` (`apps/web/src/screens/b11-admin/JobsView.vue:43,56`), and `createJobRole` is typed without `levels` (`apps/web/src/api/tenantAdmin.ts:48`).
- **The "Sumber" column does not follow §6.2.** Doc §6.2 (b11:147) says the column shows the `lastImport` file name if there is one, otherwise the labels from `sources`. Code shows both, as "labels · filename" (`apps/web/src/screens/b11-admin/JobsView.vue:35-39`). That matches §7 (b11:212) but not §6.2, so the doc contradicts itself.
- **The doc says the HR import routes are unchanged, but the shared code changes them.** Doc §6.3 item 1 (b11:183) says `/api/dna/imports` and `/api/tna/imports` "tidak berubah perilakunya". Two changes reach them:
  - option trimming now applies to every `importRouter`, including the HR routes (`apps/api/src/modules/imports/index.js:62`);
  - the new `tna_performance` option `source` is not `internal` (`apps/api/src/modules/imports/kinds/performance.js:57`), so `publicKind` shows it as a free field on the HR import screen (`imports/index.js:22`). The doc marks only the `dna_competencies` options as internal (b11:184).
- **Tests are attributed to the wrong file.** Doc §8 (b11:220-226) says `apps/api/tests/unit/tenant-admin.test.js` covers:
  - flag off → 403 for all routes;
  - body validation on `POST /users` and `PATCH /users/:id`;
  - "tidak bisa mengubah akun `eta_admin`" and "tidak bisa mengubah peran/status sendiri".

  The unit file has none of these. They are in the integration file `apps/api/tests/integration/tenant-admin.test.js:72` (flag), `:157` (validation) and `:204` (eta_admin / self-change). The unit file also tests the admin import gate (`unit/tenant-admin.test.js:10-42`), which §8 does not list there.
- **Stale line reference.** Doc §8 (b11:226) says "baris 75–111 berkas ini". The rules table is now at b11:186-195, and the matching unit tests are at `apps/api/tests/unit/tenant-admin.test.js:86-120`.
- **Undocumented hard limits in the summary data.** None of these appear in §6.2/§6.3:
  - `performanceByPeriod` caps the result at 200 periods (`apps/api/src/db/tenant-admin-stores.js:101`);
  - `imports.listCommitted` caps it at 1,000 batches (`apps/api/src/db/lna-stores.js:948`). Older batches silently get `lastImport: null` in `GET /job-roles` and `/imports/summary`.
- **Undocumented validation limits.**
  - `POST /job-roles` allows at most 20 levels, and each level name is at most 64 characters (`apps/api/src/modules/tenant-admin/index.js:232`). The §6.1 validation list (b11:127) does not include these.
  - The `GET /users` query `q` is cut to 100 characters (`index.js:123`). The doc does not say this.
- **Undocumented 403 on resending an invitation to an `eta_admin`.** `POST /users/:id/invite` on an `eta_admin` account returns 403 `ROLE_FORBIDDEN` (`apps/api/src/modules/tenant-admin/index.js:187`). The §6.1 table (b11:117) lists only 409/429/502. §4.3 (b11:87) covers changing an `eta_admin` account, not sending it an invitation.

## Missing links

These are doc statements whose code I had to find with grep. The doc should link to each location.

- b9 §4.1 "Sudah terpasang di `app.js`": the `/api/ina` mount is in `apps/api/src/app.js:28,100-102`.
- b9 §4.2 `scopeFor(req, stores.people)`: `apps/api/src/core/rbac/scope.js:5-8`.
- b9 §3 PM-6 store (`tna.hasNonTrainingGrant / grantNonTraining / revokeNonTraining / nonTrainingGrants`): `apps/api/src/db/lna-stores.js:670-691`.
- b9 §6.1 "`GET /actions` … mencatat `audit.readIndividual`": the doc does not name the resources. They are `ina.actions` (list) and `ina.action` (single), in `apps/api/src/modules/ina/index.js:100,120`. The `self` flag in §6.3 is set automatically in `apps/api/src/core/audit/index.js:29`.
- b9 §6.3 keyword rules: point to `apps/api/src/modules/ina/verification-ai.js:23-35`, not `domain.js`.
- b9 §7 "`ShellExtra.vue` dipasang otomatis oleh shell B0": the glob is in `apps/web/src/components/AppShell.vue:31-32`. `routeOpen()` is in `apps/web/src/router/index.ts:86`.
- b9 §8 migration up-down-up: `.github/workflows/ci.yml:37-41`.
- b11 §6.3 "env `ELITEMENTOR_*`": `apps/api/src/config/env.js:65-71`. The `lms.targets` default is in `apps/api/src/core/settings/index.js:20-24`.
- b11 §6.1 "Maksimal 3 link per 15 menit": `RATE` and `recentCount` are in `apps/api/src/core/auth/email-link.js:12,44-46`.
- b11 §7 menu items `users`/`jobs`/`cfg` (admin view only): `apps/web/src/shell/menu.ts:51-53`. This file is not in the §9 checklist.
- b11 §6.2 job-role creation and levels reuse `stores.dna.createJobRole` / `listJobRoles` / `listLevels`, which are not named in the doc. The `GET /job-roles/:id/competencies` shape comes from `stores.dna.listCompetencies`, the same store `apps/api/src/modules/dna/index.js:100-102` uses.
- b11 §4.2 cites `docs/designs/b2-peran.md`, and `apps/api/src/modules/tenant-admin/access.js:24` references it too. The file is not in the repo yet; the doc says it arrives with PR B2.

## Resolution (19 Nov 2026, main context)

All drift items above were triaged the same day:

- **Doc fixed:** b9 #1, #2, #3, #4 (doc now says the web form lacks `findingId`; §10 row), #5, #6, #7, #8, #10, #11; b11 #1, #2, #3, #4, #5, #6, #7, #8, #9.
- **Code fixed:** b9 #9 (unused `cancelOpenVerifications` removed from `ina-stores.js`).
- **Missing links:** left as is. The docs name the files; the `app.js` mount, rate-limit constant, and menu file are found with one grep.

---

Bagian berikut dari thread B4/B16 (skill `egm-drift-report`, 19 Nov).

Direktori: `docs/designs/`, dibatasi ke dua spek milik PR #22. Kode dibaca pada head branch `claude/project-thread-c2bjxm` setelah triase review egm. Semua drift di bawah sudah diselesaikan di commit yang sama dengan laporan ini atau sebelumnya (kolom "Tindakan").

## b4-developmental-needs.md

- `PATCH /competencies/:id` (endpoint B4, dipasang di `dna/index.js`, bukan di `development-routes.js`) tidak di balik flag `dna.development`, padahal header spek dan R1 menyatakan semua endpoint B4 di balik flag. Tindakan: test merah di `tests/integration/dna-development.test.js` (kasus flag mati), lalu `b4Flag(flags)` dipasang; konstanta pesan disatukan.
- Kolom opsional baru (`code`, `stream`, `programTier`) di `POST /competencies`, `/competencies/bulk`, dan impor tidak di balik flag; spek tidak menyebutnya. Tindakan: spek header menyatakan ini disengaja (aditif).

## b16-career-promotion.md

- C2 langkah 5 dan §11 menulis "dibulatkan ke bawah", sedangkan `fmtPct` di `CareerPromotionView.vue` membulatkan biasa dan hanya ke bawah bila menyeberangi ambang. Tindakan: spek diselaraskan dengan kode.
