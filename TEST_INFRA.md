# FruFresco AI Test Infrastructure Specification (TEST_INFRA.md)

## 1. Overview & Architectural Scope
This document details the test infrastructure, test runner architecture, mock dispatchers, and four-tier verification methodology for the **Gemini-3.8-Flash AI Model Modernization and Obsolescence Sentinel** in FruFresco (`Investments Cortés SAS`).

The test suite provides opaque-box, end-to-end (E2E), and boundary verification across the entire AI ecosystem without mutating business logic, guaranteeing zero regressions and strict compliance with the architectural contracts defined in `PROJECT.md` and `SPEC.md`.

---

## 2. Test Framework & Execution Engine

| Component | Standard / Technology | Purpose |
|---|---|---|
| **Test Runner** | Node.js Test Runner (`node:test`) | Native execution, high speed (<1s runtime), zero external test-bloat |
| **Assertion Library** | `node:assert/strict` | Strict equality, deep equality, regex matching, exception catching |
| **TypeScript Transpiler** | `tsx` (`npx tsx --test`) | Direct execution of TypeScript test files without pre-compilation step |
| **Type Checking** | TypeScript Compiler (`tsc --noEmit`) | Strict static type validation, 0 type errors guaranteed |
| **Isolation Harness** | `tests/e2e/ai/test_helpers.ts` | Isolated mock fetch dispatcher, mock Supabase environment, PDF fixtures |

---

## 3. The 4-Tier Testing Methodology

```
+---------------------------------------------------------------------------------+
| TIER 4: Real-World Scenarios (PO PDF Failover, Health Latency & Google Catalog) |
+---------------------------------------------------------------------------------+
| TIER 3: Cross-Feature Combinations (Cascade Failovers, Supabase Audit Telemetry)|
+---------------------------------------------------------------------------------+
| TIER 2: Boundary & Corner Cases (404/410/MODEL_DEPRECATED, Timeouts, 429 Guard) |
+---------------------------------------------------------------------------------+
| TIER 1: Feature Coverage (Primary Model, Cascade Tiers, Order/Commercial/SEO)   |
+---------------------------------------------------------------------------------+
```

### Tier 1: Feature Coverage (>=5 test cases per feature)
- **Primary AI Model & Canonical Hierarchy**: Validates `gemini-3.8-flash` standard, order of the 5 canonical fallback models, and API key resolution precedence (`GOOGLE_GENERATIVE_AI_API_KEY` over `GEMINI_API_KEY`).
- **Order Parser Engine Text Extraction**: Validates text sanitization (`sanitizeDocText`), printer kerning repairs (aguacate, tomate, papa, colsubsidio), Greek Beta (`Β`/`β`) normalization, and prompt structure.
- **Binary PDF Extraction with `inline_data`**: Validates payload structure `{ inline_data: { mime_type: 'application/pdf', data: base64 } }` and omission when empty.
- **Commercial Parser Engine**: Validates structured extraction of B2B proposals (client identity, NIT, line items, proposed prices, markdown cleanup).
- **Transport Route Optimization AI**: Validates logistics parameters (b2b_kg_min=10, b2c_kg_min=5, avg_kg_per_crate=12.5), route explanations, and authentication (401).
- **Products Generator AI**: Validates bilingual description format (Spanish & English), nutritional benefits extraction, and master edit permissions (401).
- **Ancillary Endpoints**: Translation fallback, SEO audience discrimination (B2B vs B2C), and AI search query expansion with category classification.

### Tier 2: Boundary, Corner Cases & Poka-Yoke Guards
- **Empty / Whitespace Inputs**: Graceful handling of empty prompts, whitespace base64, null/undefined documents.
- **Unknown Model Handling**: Custom cascades and unrecognized model names handled without system crashes.
- **Obsolescence Error Classifier (`isObsolescenceError`)**:
  - Precision detection of 404, 410, `NOT_FOUND`, and signature phrases (`MODEL_DEPRECATED`, `not found for API version`, `has been discontinued`).
  - **Poka-Yoke Anti-Cascade Guard**: Strictly excludes HTTP 429 / Quota Exhaustion (`RESOURCE_EXHAUSTED`), timeouts, AbortError, and HTTP 400 Bad Request to prevent cascade burn.
- **Execution Timeouts**: Enforces configurable `timeoutMs` (defaults to 45,000ms), aborting hanging requests via `AbortSignal`.
- **Malformed Payloads**: Resilient handling of invalid base64 data and unparseable AI JSON strings.

### Tier 3: Cross-Feature Combinations & Telemetry Verification
- **Cascade Failover**:
  - Single failover: `gemini-3.8-flash` -> `gemini-3.7-flash` with `_obsolescenceWarning` attached.
  - Multi-tier failover: `3.8` (404) -> `3.7` (410) -> `3.5` (succeeds).
- **Cascade Exhaustion**: Clear aggregate error thrown when all 5 models fail.
- **Supabase Audit Logging Telemetry (`public.audit_logs`)**:
  - Server-side insertion via `createAdminClient()`.
  - Schema: `action: 'AI_MODEL_OBSOLESCENCE_DETECTED'`, `module`, `collaborator_id: null`, `collaborator_name: 'System / AI Obsolescence Sentinel'`, `details: { failedModel, fallbackModel, reason, statusCode, timestamp, operationName }`.
  - Operational Resilience: Inability to write audit records never blocks or crashes the business workflow.
- **Metadata Warning Attachment**: Attaches `_obsolescenceWarning` to the result when failover occurs; omitted on normal first-try executions.

### Tier 4: Real-World Scenarios
- **Scenario 1: B2B Purchase Order Ingestion with Deprecation Cascade**:
  - Realistic multi-item PDF purchase order submitted.
  - Primary model `gemini-3.8-flash` simulates 404 deprecation.
  - Centinela automatically cascades to `gemini-3.7-flash`.
  - Line items, customer NIT, delivery date extracted with 100% data fidelity.
  - Audit log recorded in Supabase, and warning attached to response.
- **Scenario 2: Health Diagnostic & `/v1beta/models` Catalog Inspection**:
  - `/api/ai/health` live latency benchmarking.
  - Google `/v1beta/models` catalog audit ensuring `gemini-3.8-flash` presence, 1M context token limit, and active generation methods.
  - Degraded / Quota Exceeded error mapping (429, 503, invalid key).

---

## 4. Test Suite Inventory

| File Path | Tiers Covered | Tests Count | Description |
|---|---|---|---|
| `tests/e2e/ai/ai_governance.test.ts` | Tier 1 & Tier 2 | 17 | Central AI Governance, Cascade order, API key resolution, and Obsolescence error classifier |
| `tests/e2e/ai/sentinel_failover_audit.test.ts` | Tier 2 & Tier 3 | 11 | Cascade failover, timeout handling, non-obsolescence fast-fail, Supabase audit logs, metadata attachment |
| `tests/e2e/ai/engines_multimodal.test.ts` | Tier 1 & Tier 2 | 31 | Order parser OCR/multimodal, PDF inline_data, commercial proposal, transport route, products generate, translate, SEO, AI search |
| `tests/e2e/ai/real_world_scenarios.test.ts` | Tier 4 | 7 | Real-world PO PDF simulated deprecation failover and `/api/ai/health` latency & catalog validation |
| `tests/e2e/ai/test_helpers.ts` | Harness / Utils | N/A | Mock fetch dispatcher, mock Supabase environment, PDF & PO fixtures, Next.js cache stub |

**Total Dedicated AI E2E Tests**: 66 test cases.
**Total Project Test Suite**: 97 test cases (100% passing).

---

## 5. Execution Commands

### Run Full Test Suite
```bash
npm test
```
*Equivalent to:*
```powershell
cmd /c "npm test"
# or
cmd /c "npx tsx --test tests/**/*.test.ts"
```

### Run Only AI Governance & Sentinel Tests
```bash
cmd /c "npx tsx --test tests/e2e/ai/*.test.ts"
```

### Verify TypeScript Compilation (Static Type Integrity)
```bash
cmd /c "node node_modules\typescript\bin\tsc --noEmit"
```
*Expected output: Exit code 0 (zero errors).*
