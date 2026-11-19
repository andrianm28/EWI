# Stage 9 · Implementation Readiness · B9 Improvement Needs

Target: `docs/designs/b9-improvement-needs.md`, DetailedRange L75–263. Reviewers dispatched directly.

| Reviewer | Status |
| --- | --- |
| `egm-style` | completed |
| `egm-implementation-readiness` | completed |
| `egm-codebase-details` | completed |

## egm-style (4 Major, 2 Nit)

- **S9-1 🟡 L77, 105–124** SQL block is an old draft (no `withdrawn`, no `due_date`, no `sub_label` CHECK).
- **S9-2 🟡 L202** keyword list open-ended ("…"), "tanpa negasi" undefined; point to the constant.
- **S9-3 🟡 L222** `GET /ina/owners` undefined in §6.
- **S9-4 🟡 L157** "atasan hanya menghitung miliknya" narrower than scope (self + direct reports).
- **S9-5 🟢 L202** paragraph covers seven topics.
- **S9-6 🟢 L191, 198, 218** "Siapa" column misuse; "rute percakapan" unlisted; "(hasil code review)" leftover.

## egm-implementation-readiness (7 Major, 3 Nit) — not ready

- **IR9-1 🟡 L171** "tanpa transaksi bersama" contradicts code (row lock in `addTurn`, transaction in withdraw, optimistic `updateAction` → 409); a rebuild would reintroduce §12 races.
- **IR9-2 🟡 L77–134** schema is draft + diff prose; use final DDL.
- **IR9-3 🟡 L222** `GET /ina/owners` missing from §6.1.
- **IR9-4 🟡 L63, 190–191** old-owner title masking and own-turn access only in §12 #7 / code.
- **IR9-5 🟡 L150, 161–165** error responses open (`hidden=1` non-manage 403, bad query 400, create-from-finding rejections, field labels vs names).
- **IR9-6 🟡 L161, 202** field limits and "hasil tidak sah" undefined.
- **IR9-7 🟡 L202** keyword lists and precedence incomplete.
- **IR9-8 🟡 L214–222** web section names only.
- **IR9-9 🟢 L224–239** test plan vs real tests.
- **IR9-10 🟢 L241–252** glob paths, no phases, row limits, finding status on `rejected`.

## egm-codebase-details (1 Blocker, 3 Major, 6 Nit)

- **CB9-1 🔴 L77** "every `ina_verification_turns` query joins `ina_verifications` with `tenant_id`" is false: count, INSERT and DELETE filter by `verification_id` only (`ina-stores.js:190, 194, 207`); safe today because a tenant-checked lock/UPDATE runs first in the same transaction. Reword or add the join.
- **CB9-2 🟡 L148–153, 222** `GET /ina/owners` missing from §6.1 and §8.
- **CB9-3 🟡 L157** KPI from `LIMIT 2000` list; verifications `LIMIT 500`; undocumented.
- **CB9-4 🟡 L162** "400 dengan nama field-nya" but code returns Indonesian labels, no field key.
- **CB9-5 🟢** optimistic PATCH → 409 edge case undocumented.
- **CB9-6 🟢** old-owner title masking undocumented.
- **CB9-7 🟢** error codes for invalid `dueDate` and empty `complete` unstated.
- **CB9-8 🟢 L182** granting in INA ignores `tna.non_training_hr`; INA re-implements TNA grant helpers.
- **CB9-9 🟢 L202** keyword rule understated; truncation limits undocumented.
- **CB9-10 🟢 L79–134** draft SQL.
