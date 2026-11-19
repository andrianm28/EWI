# Stage 7 · Critic Review · B11 Admin Tenant

Target: `docs/designs/b11-admin-tenant.md`, FeatureRange L1–68. Reviewers dispatched directly from the main context (egm-review-loop direct dispatch).

| Reviewer | Status |
| --- | --- |
| `egm-style` | completed |
| `egm-design` | completed |
| `egm-structural` | completed |

## egm-style (4 Major, 4 Nit)

- **ST-1 🟡 L3** status claims "spek sesuai kode backend" without evidence; "brief bangun penuh", T6 are process jargon.
- **ST-2 🟡 L13, 29–38, 53** codes (K/R/PK/B/T) without source; L13 "B12 (thread T2)" vs L32 "B2 (thread T2)"; branch name at L53 is unstable.
- **ST-3 🟡 L52** "kecuali user memutuskan lain": "user" clashes with domain term; no forum/deadline; ⏳ marker unexplained.
- **ST-4 🟡 L65** "at least one active pengelola" ignores `eta_admin` changing other accounts; "pengelola/admin tenant/Admin Tenant/`tenant_admin`" used without mapping.
- **ST-5 🟢 L23** "perlu agar layar berguna" subjective; cell packs four decisions.
- **ST-6 🟢 L64** "agar jumlah pengguna jujur" imprecise.
- **ST-7 🟢 L66** "memang" defensive.
- **ST-8 🟢 L15, 25** "DACUM Tool 1–3" and "alur impor yang sudah ada" lack pointers.

## egm-structural (1 Blocker, 4 Major, 5 Nit) — verdict: does not pass

- **SR-1 🔴 No "Alternatives Considered" section** (feature-spec-standard Alternatives Rule). Rejected options only inline: L44 `requireSubmodule`, L52 interim `hr_admin`, L55 DB re-read vs token, L59 not touching `roles.js`, L65 no `LAST_ADMIN`.
- **SR-2 🟡 §1 mixes problem, goals, context and non-goals**; L15 non-goals as run-on sentence.
- **SR-3 🟡 L65 guarantee stated as absolute** while §12 #4 says it fails under concurrency; not in §10.
- **SR-4 🟡 Status line (L3) out of date.**
- **SR-5 🟡 Inline ⏳/⚠️ not linked to §10; §10 lacks a mitigation column**; 2,000-row limit (L89) missing from §10.
- **SR-6 🟢** L57 belongs in §4.1; L53 contract bullet sits in the role list.
- **SR-7 🟢** Cross-references unlinked (PR #9, `b2-peran.md` on another branch, mockup path).
- **SR-8 🟢** L23 table cell overloaded.
- **SR-9 🟢** §3 list unordered; bold convention differs from B9.
- **SR-10 🟢** Inconsistent path prefixes (L48 vs L220).

## egm-design (5 Major, 6 Nit) — verdict: needs revision

- **DC-1 🟡 L53, 55 DB check against primary `users.role` will lock out B2 users** whose `tenant_admin` is an extra role. Proposal: check "token's active role is still among roles assigned in DB, and account active".
- **DC-2 🟡 L52, 66, 67 granting `hr_admin` grants full admin control during the interim** (create accounts, change roles, disable other admins incl. PK-13 manager); bypasses `employees.js:50` safeguard. State as ⏳ with owner sign-off or limit.
- **DC-3 🟡 L52, 59 dropping `hr_admin` after B2 locks out every onboarded tenant**; needs a data migration (onboarding managers → `tenant_admin`) as precondition.
- **DC-4 🟡 No alternatives section** (wait for B2 / add `tenant_admin` now; extend HR routes; `requireSubmodule` option).
- **DC-5 🟡 L53 B2 contract unverifiable** (file on another branch, "confirmed by T2").
- **DC-6 🟢 L55 demoted `hr_admin` keeps HR powers elsewhere up to 8 h**; ⏳ at L107 covers only disabled accounts.
- **DC-7 🟢 L65 guarantee unconditional.**
- **DC-8 🟢 L64 client admins cannot remove `eta_admin` accounts in their tenant; ETA emails shown** — state as a decision.
- **DC-9 🟢 L25 integration card "Sama" but differs from mockup** (Terkonfigurasi, no deep link/sync-back).
- **DC-10 🟢 L24 levels/`programTier` and Basic/Intermediate/Advanced not reflected in the table.**
- **DC-11 🟢 L19 mockup path wrong.**
