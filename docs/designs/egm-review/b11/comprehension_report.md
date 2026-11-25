# Stage 6 · Comprehension Test · B11 Admin Tenant

Reviewer: `egm-comprehension` (completed). FeatureRange L1–68, DetailedRange L69–242. Read only the target.

## What this proposes

Package B11 adds a self-service "Admin Tenant" area to ELGOS behind a new default-off flag `admin.tenant`. A client company's admin can, without the ETA team or SQL: invite users and change role, job title, level, supervisor and status; list and add job titles and see whether each has a competency dictionary; import competency models (one DACUM file per job title) and KPI/OKR data (per period); and see a read-only EliteMentor/LMS integration status. Access is checked on every request against the DB, not only the token. `hr_admin` passes temporarily until B2 adds `tenant_admin`. The screen can never grant or modify `eta_admin`; an admin cannot change their own role or status. No migration. The shared import router gets `guard`/`only` parameters and `jobRoleId`/`source` options. Admin import routes check entitlement and the global kill switch but deliberately not the tenant module flag.

## How the existing system works, per this document

An onboarding script (PK-13) creates the tenant and a first `hr_admin`. Flags are changed only by the ETA Admin. Accounts sign in through emailed links; invitations last 7 days. JWTs last up to 8 hours and cannot yet be revoked. Imports go upload → map → preview → save; raw rows are deleted after saving. Audit is mandatory; writes follow "save, then audit, no shared transaction". HR has its own import routes (`/api/dna/imports`, `/api/tna/imports`, `requireRole(HR_ADMIN)`) and a bulk invitation route. The employee import can create accounts that are `active` but never logged in. Roles live in `ROLES` and a CHECK on `users.role`, which B2 will extend.

## Findings (10 Major, 24 Nit)

- **CO-1 🟡** Codes without legend (B0/B1/B8/B13, PK-16, FR-EM, "thread", "brief") — L3, 13, 23, 32–38, 107, 153–154.
- **CO-2 🟡** Architecture rules cited (L31) and rule 3 deviation declared (L174) without the rule text.
- **CO-3 🟡** Display roles (K2) not mapped to role keys; `pimpinan` (L197) undefined.
- **CO-4 🟡** "Primary role" vs "active role" after B2: which DB value the gate compares (L53, 55).
- **CO-5 🟡** Resend invitation scope: L93/95 allow any `pendingLogin` (incl. imported `active`), test at L204 says "hanya untuk `invited`".
- **CO-6 🟡** `importRouter` signature at L158 omits `ownDrafts` (L176); checklist L226 lists only `guard`.
- **CO-7 🟡** L3 "web menunggu B0" vs §7 and checklist L232.
- **CO-8 🟡** DNA/TNA/LNA undefined.
- **CO-9 🟡** `performance.missed` (L140) undefined.
- **CO-10 🟡** "Global kill switch" (L174) undefined.
- **Nits (24):** ELGOS/"tim ETA" not introduced; DACUM glossed nowhere; EliteMentor undescribed; ⏳/⚠️ markers lack legend; "user" ambiguous (L52); is `eta_admin` per tenant (L64); `eta_admin` can disable the last admin (L65); "otomatis mengenal flag baru" vague (L57); `tenantAdmin.actor`/`requireRole` assumed (L50, 55); migration block convention (L71); supervisor scope undefined (L97); order of save/email/audit in `POST /users` (L99, 105); error list misses 500 and the code for `invited → active` (L95, 101); `employeeIds` meaning (L109); `programTier` (L116); batch status `committed` (L122); `em.*` flags vs `auth.sso` (L152); "Andrian" role (L156); source values `cca`/`both`/synonyms (L165); `internal` option marker (L159); "pratinjau" vs "periksa" (L35, 182); performance source lists differ (L171, 187); route meta `views`/`routeOpen()` assume B0 contract (L182).
