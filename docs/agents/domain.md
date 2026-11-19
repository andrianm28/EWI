# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Khusus repo ELGOS

Tata letak: **single-context**. Satu `CONTEXT.md` di root (dibuat nanti oleh `/domain-modeling` saat istilah benar-benar diputuskan) dan ADR di `docs/adr/` (sudah ada, mulai `0001-ewi-terpisah-penuh.md`). `apps/api` dan `apps/web` adalah satu produk, jadi tidak memakai `CONTEXT-MAP.md`.

Selain daftar di bawah, baca juga:

- **`CLAUDE.md`**: aturan arsitektur wajib (tenant, `requireSubmodule`, flag, `visibleEmployeeScope`, migrasi `down`).
- **`docs/designs/<paket>.md`**: spek paket yang menyentuh area kerja (Prinsip egm). Spek adalah sumber untuk review "Spec" di `/code-review`.
- **`docs/ewi/tickets/ELITMEN-xxx.md`**: spec tiket bila pekerjaan berasal dari tiket Asana.

Istilah domain ditulis dalam bahasa Indonesia seperti di produk; nama produk "ELGOS", bukan "EWI".

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists: it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo (most repos):

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

Multi-context repo (presence of `CONTEXT-MAP.md` at the root):

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
