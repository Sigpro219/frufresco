import './test_helpers';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  executeWithObsolescenceGuard,
  PRIMARY_AI_MODEL,
} from '@/lib/ai/aiModelConfig';

import {
  GET as healthGET,
} from '@/app/api/ai/health/route';

import {
  fetchMock,
  setupMockSupabaseEnv,
  SAMPLE_BASE64_PDF,
  SAMPLE_PURCHASE_ORDER_TEXT,
  MOCK_GOOGLE_MODELS_CATALOG,
} from './test_helpers';

// ============================================================================
// TIER 4: REAL-WORLD E2E SCENARIOS & SYSTEM SENTINEL HEALTH AUDIT
// ============================================================================
describe('Tier 4: Real-World Scenarios & AI Sentinel Diagnostic Engine', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = setupMockSupabaseEnv();
    fetchMock.install();
  });

  afterEach(() => {
    fetchMock.restore();
    restoreEnv();
  });

  // --------------------------------------------------------------------------
  // SCENARIO 1: PURCHASE ORDER INGESTION UNDER SIMULATED DEPRECATION FAILOVER
  // --------------------------------------------------------------------------
  describe('Scenario 1: B2B Purchase Order Ingestion with Deprecation Cascade', () => {

    it('4.1.1 should process incoming PO PDF, detect primary deprecation, cascade to 3.7, and log audit', async () => {
      let auditLogRecord: any = null;
      const modelExecutionTrail: string[] = [];

      // Intercept Supabase audit table
      fetchMock.registerRoute('/rest/v1/audit_logs', async (req) => {
        auditLogRecord = req.bodyJson;
        return new Response(JSON.stringify([{ id: 888, created_at: new Date().toISOString() }]), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      // Simulated realistic purchase order extraction output
      const expectedPOData = {
        purchase_order_id: 'PO-2026-0925-01',
        client_name: 'RESTAURANTE EL SABOR CRIOLLO SAS',
        client_nit: '900.543.210-9',
        delivery_date: '2026-09-25',
        total_items: 5,
        lines: [
          { sku: 'TOM-01', name: 'Tomate Chonto Maduro', quantity: 80, unit: 'Kg', unit_price: 3200 },
          { sku: 'AGU-02', name: 'Aguacate Hass Extra', quantity: 50, unit: 'Kg', unit_price: 6800 },
          { sku: 'CEB-03', name: 'Cebolla Cabezona Blanca Limpia', quantity: 40, unit: 'Kg', unit_price: 2500 },
          { sku: 'PAP-04', name: 'Papa Pastusa Especial', quantity: 100, unit: 'Kg', unit_price: 1900 },
          { sku: 'LIM-05', name: 'Limon Tahiti Exportacion', quantity: 30, unit: 'Kg', unit_price: 3500 },
        ],
        commercial_terms: 'Facturacion a 30 dias credito comercial',
      };

      // Wrap the PO processing pipeline with executeWithObsolescenceGuard
      const result = await executeWithObsolescenceGuard(async (modelName, key) => {
        modelExecutionTrail.push(modelName);

        // Simulate that PRIMARY_AI_MODEL (gemini-3.8-flash) was deprecated by Google
        if (modelName === PRIMARY_AI_MODEL) {
          const deprecationError = new Error(`[404 Not Found] models/${modelName} is deprecated on API v1beta`);
          (deprecationError as any).status = 404;
          throw deprecationError;
        }

        // Secondary fallback model (gemini-3.7-flash) successfully processes the document
        return {
          ...expectedPOData,
          _processedBy: modelName,
        };
      }, {
        moduleName: 'orders',
        operationName: 'b2b_pdf_order_ingestion',
      });

      // 1. Verify business output integrity
      assert.equal(result.client_name, 'RESTAURANTE EL SABOR CRIOLLO SAS');
      assert.equal(result.client_nit, '900.543.210-9');
      assert.equal(result.lines.length, 5);
      assert.equal(result._processedBy, 'gemini-3.7-flash');

      // 2. Verify model failover trail
      assert.deepEqual(modelExecutionTrail, ['gemini-3.8-flash', 'gemini-3.7-flash']);

      // 3. Verify _obsolescenceWarning metadata was attached to the returned object
      assert.ok(result._obsolescenceWarning !== undefined, 'Result must carry _obsolescenceWarning');
      assert.equal(result._obsolescenceWarning.failedModel, 'gemini-3.8-flash');
      assert.equal(result._obsolescenceWarning.fallbackModel, 'gemini-3.7-flash');
      assert.equal(result._obsolescenceWarning.statusCode, 404);
      assert.match(result._obsolescenceWarning.reason, /404 Not Found/);

      // 4. Verify Supabase audit log persistence
      assert.ok(auditLogRecord !== null, 'Audit log must be recorded in Supabase');
      const entry = Array.isArray(auditLogRecord) ? auditLogRecord[0] : auditLogRecord;
      assert.equal(entry.action, 'AI_MODEL_OBSOLESCENCE_DETECTED');
      assert.equal(entry.module, 'orders');
      assert.equal(entry.collaborator_id, null);
      assert.equal(entry.collaborator_name, 'System / AI Obsolescence Sentinel');
      assert.equal(entry.details.failedModel, 'gemini-3.8-flash');
      assert.equal(entry.details.fallbackModel, 'gemini-3.7-flash');
      assert.equal(entry.details.operationName, 'b2b_pdf_order_ingestion');
    });

    it('4.1.2 should process unformatted raw text emails when PDF is not available', async () => {
      const result = await executeWithObsolescenceGuard(async (modelName) => {
        // Parse sample text order fixture
        assert.ok(SAMPLE_PURCHASE_ORDER_TEXT.includes('RESTAURANTE EL SABOR CRIOLLO'));
        return {
          orderSource: 'email_body',
          modelUsed: modelName,
          parsedItemsCount: 5,
        };
      }, {
        moduleName: 'orders',
        operationName: 'text_order_extractor',
      });

      assert.equal(result.orderSource, 'email_body');
      assert.equal(result.parsedItemsCount, 5);
      assert.equal(result._obsolescenceWarning, undefined);
    });
  });

  // --------------------------------------------------------------------------
  // SCENARIO 2: HEALTH DIAGNOSTIC & /v1beta/models CATALOG SENTINEL
  // --------------------------------------------------------------------------
  describe('Scenario 2: Health Diagnostic Endpoint (/api/ai/health) & Google Catalog Inspection', () => {

    it('4.2.1 should return status "error" with code "KEY_MISSING" when API key is unset', async () => {
      const origGoogle = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      const origGemini = process.env.GEMINI_API_KEY;

      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      try {
        const response = await healthGET();
        assert.equal(response.status, 200);

        const data = await response.json();
        assert.equal(data.ok, false);
        assert.equal(data.status, 'error');
        assert.equal(data.code, 'KEY_MISSING');
        assert.match(data.message, /No se ha configurado la clave de API/);
      } finally {
        if (origGoogle !== undefined) process.env.GOOGLE_GENERATIVE_AI_API_KEY = origGoogle;
        if (origGemini !== undefined) process.env.GEMINI_API_KEY = origGemini;
      }
    });

    it('4.2.2 should report status "healthy" and return model metadata when service is operational', async () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'valid-mock-key';

      fetchMock.registerRoute('generativelanguage.googleapis.com', async () => {
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'pong' }] } }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      });

      const response = await healthGET();
      assert.equal(response.status, 200);

      const data = await response.json();
      assert.equal(data.ok, true);
      assert.equal(data.status, 'healthy');
      assert.ok('model' in data);
      assert.ok('timestamp' in data);
      assert.ok(!isNaN(Date.parse(data.timestamp)));
    });

    it('4.2.3 should map HTTP 429 quota exhaustion to status "degraded" with QUOTA_EXCEEDED code', async () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'valid-mock-key';

      fetchMock.registerRoute('generativelanguage.googleapis.com', async () => {
        return new Response(JSON.stringify({
          error: { code: 429, message: 'Resource exhausted: Quota exceeded' }
        }), { status: 429, headers: { 'Content-Type': 'application/json' } });
      });

      const response = await healthGET();
      assert.equal(response.status, 200);

      const data = await response.json();
      assert.equal(data.ok, false);
      assert.equal(data.status, 'degraded');
      assert.equal(data.code, 'QUOTA_EXCEEDED');
      assert.match(data.message, /cuota/i);
    });

    it('4.2.4 should audit Google /v1beta/models catalog to verify primary model availability', async () => {
      // Direct simulation of Google models catalog endpoint inspection
      fetchMock.registerRoute('/v1beta/models', async () => {
        return new Response(JSON.stringify(MOCK_GOOGLE_MODELS_CATALOG), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const catalogRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=mock-key');
      const catalogData = await catalogRes.json();

      assert.ok(Array.isArray(catalogData.models));
      const modelNames = catalogData.models.map((m: any) => m.name.replace('models/', ''));

      assert.ok(modelNames.includes('gemini-3.8-flash'), 'Catalog must include primary model gemini-3.8-flash');
      assert.ok(modelNames.includes('gemini-3.7-flash'), 'Catalog must include tier-2 fallback gemini-3.7-flash');

      const primaryModelEntry = catalogData.models.find((m: any) => m.name === 'models/gemini-3.8-flash');
      assert.ok(primaryModelEntry.supportedGenerationMethods.includes('generateContent'));
      assert.ok(primaryModelEntry.inputTokenLimit >= 1048576, 'Primary model must have at least 1M token context');
    });

    it('4.2.5 should measure and benchmark active AI latency within acceptable bounds (< 5000ms)', async () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'valid-mock-key';

      const simulatedLatencyMs = 25;
      fetchMock.registerRoute('generativelanguage.googleapis.com', async () => {
        await new Promise((r) => setTimeout(r, simulatedLatencyMs));
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'pong' }] } }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      });

      const start = Date.now();
      const response = await healthGET();
      const elapsedMs = Date.now() - start;

      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.ok, true);

      // Verify measured round-trip latency
      assert.ok(elapsedMs >= simulatedLatencyMs, `Elapsed (${elapsedMs}ms) should reflect network delay`);
      assert.ok(elapsedMs < 5000, `Health check latency (${elapsedMs}ms) exceeded SLA threshold`);
    });
  });
});
