# Rule: Dynamic Technical Debt Ledger (Living Backlog in SPEC.md & TECHNICAL_DEBT.md)

## Scope & Mandate
Applies to every session, forensic audit (`/forense-hallazgos-gemba`, `/auditor-tirano-sdd`, `/arquitecto-sdd`), code review, or feature implementation in FruFresco.

The table in **`SPEC.md` (§43.2 — Tablero Maestro Unificado de Deuda Técnica Activa)** and **`TECHNICAL_DEBT.md` (§2)** operates as a **Dynamic Living Queue (Cola Viva)**:

1. **Automatic Registration on Detection (`ADD`):**
   - Whenever any technical debt, architectural risk, unpaginated query, N+1 loop, or deferred improvement is detected during an audit or user interaction and is **not** fixed in the same turn, you MUST immediately append it to the active table (§43.2 in `SPEC.md` and §2 in `TECHNICAL_DEBT.md`) using the next sequential ID (`DT-11`, `DT-12`, ...), specifying Priority (`P0`–`P3`), Module, Technical Description, Key Files, Estimated Effort, and `⏳ Pendiente`.

2. **Automatic Removal & Archival on Resolution (`CLOSE`):**
   - Whenever the user asks to resolve a specific `DT-XX` (or when a fix resolves an existing `DT-XX`), as part of the exact same commit you MUST:
     1. **Remove** the `DT-XX` row from the active table (§43.2 in `SPEC.md` and §2 in `TECHNICAL_DEBT.md`) so the table only shows truly open items.
     2. **Append** the resolved `DT-XX` entry to the historical archive (§43.3 in `SPEC.md` and §3 in `TECHNICAL_DEBT.md`) with `✅ Resuelto (SDD v1.9.XXX — Fecha)` and a summary of the fix.
   - You can execute this deterministically via `node scripts/tech_debt_ledger.js close DT-XX "Descripción de la solución (SDD v1.9.XXX)"` or by editing both files directly.
