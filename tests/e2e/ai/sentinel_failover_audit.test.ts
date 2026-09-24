import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchMock,
  setupMockSupabaseEnv,
} from './test_helpers';

import {
  executeWithObsolescenceGuard,
  CANONICAL_MODEL_CASCADE,
  PRIMARY_AI_MODEL,
} from '@/lib/ai/aiModelConfig';

// ============================================================================
// TIER 2 & TIER 3: OBSOLESCENCE SENTINEL FAILOVER, AUDIT & METADATA INJECTION
// ============================================================================
describe('Tier 2 & Tier 3: Sentinel Cascade Failover & Supabase Audit Verification', () => {
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
  // TIER 2: BOUNDARY & TIMEOUT TESTS
  // --------------------------------------------------------------------------
  describe('Tier 2: Timeout, Unknown Models & Guard Boundaries', () => {

    it('2.1 should execute successfully on first try when no obsolescence occurs', async () => {
      const modelsAttempted: string[] = [];

      const result = await executeWithObsolescenceGuard(async (modelName, key) => {
        modelsAttempted.push(modelName);
        return { data: 'success_on_primary', model: modelName };
      }, { moduleName: 'test_module', operationName: 'direct_run' });

      assert.equal(modelsAttempted.length, 1);
      assert.equal(modelsAttempted[0], PRIMARY_AI_MODEL);
      assert.equal(result.data, 'success_on_primary');
      assert.equal(result._obsolescenceWarning, undefined, 'Must NOT attach obsolescence warning on clean first-try success');
    });

    it('2.2 should enforce timeoutMs and abort long-running AI operations', async () => {
      const start = Date.now();
      let caughtError: any = null;

      try {
        await executeWithObsolescenceGuard(async (modelName, key, signal) => {
          // Simulate an unresponsive endpoint
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => resolve({ delayed: true }), 5000);
            if (signal) {
              signal.addEventListener('abort', () => {
                clearTimeout(timer);
                reject(new Error('Operation aborted by signal'));
              });
            }
          });
        }, { timeoutMs: 50 }); // Fast 50ms timeout
      } catch (err: any) {
        caughtError = err;
      }

      const elapsed = Date.now() - start;
      assert.ok(caughtError !== null, 'Operation must reject on timeout');
      assert.match(caughtError.message, /timed out/i);
      assert.ok(elapsed < 2000, `Timeout must trigger quickly, took ${elapsed}ms`);
    });

    it('2.3 should accept custom model cascades and unknown models without crashing', async () => {
      const customCascade = ['gemini-experimental-x', 'gemini-3.8-flash'];
      const modelsAttempted: string[] = [];

      const result = await executeWithObsolescenceGuard(async (modelName) => {
        modelsAttempted.push(modelName);
        if (modelName === 'gemini-experimental-x') {
          const err = new Error('models/gemini-experimental-x is not found for API version v1beta');
          (err as any).status = 404;
          throw err;
        }
        return { model: modelName, success: true };
      }, { cascade: customCascade });

      assert.deepEqual(modelsAttempted, ['gemini-experimental-x', 'gemini-3.8-flash']);
      assert.equal(result.model, 'gemini-3.8-flash');
      assert.ok(result._obsolescenceWarning !== undefined);
      assert.equal(result._obsolescenceWarning.failedModel, 'gemini-experimental-x');
      assert.equal(result._obsolescenceWarning.fallbackModel, 'gemini-3.8-flash');
    });

    it('2.4 should fast-fail immediately on non-obsolescence error (HTTP 429 Quota Exhaustion)', async () => {
      const modelsAttempted: string[] = [];
      let caughtError: any = null;

      try {
        await executeWithObsolescenceGuard(async (modelName) => {
          modelsAttempted.push(modelName);
          const err = new Error('Resource has been exhausted (e.g. check quota)');
          (err as any).status = 429;
          throw err;
        });
      } catch (err) {
        caughtError = err;
      }

      assert.equal(modelsAttempted.length, 1, 'Must NOT attempt subsequent models on HTTP 429');
      assert.equal(modelsAttempted[0], PRIMARY_AI_MODEL);
      assert.ok(caughtError !== null);
      assert.equal(caughtError.status, 429);
    });

    it('2.5 should fast-fail immediately on HTTP 400 Bad Request without triggering cascade', async () => {
      const modelsAttempted: string[] = [];
      let caughtError: any = null;

      try {
        await executeWithObsolescenceGuard(async (modelName) => {
          modelsAttempted.push(modelName);
          const err = new Error('INVALID_ARGUMENT: contents cannot be empty');
          (err as any).statusCode = 400;
          throw err;
        });
      } catch (err) {
        caughtError = err;
      }

      assert.equal(modelsAttempted.length, 1, 'Must NOT switch models on malformed payload (400)');
      assert.ok(caughtError !== null);
      assert.match(caughtError.message, /INVALID_ARGUMENT/);
    });
  });

  // --------------------------------------------------------------------------
  // TIER 3: CROSS-FEATURE CASCADE, AUDIT LOG & WARNING ATTACHMENT
  // --------------------------------------------------------------------------
  describe('Tier 3: Cascade Failover Hierarchy & Supabase Telemetry', () => {

    it('3.1 should failover from gemini-3.8-flash to gemini-3.7-flash upon 404 and attach warning', async () => {
      const modelsAttempted: string[] = [];

      const result = await executeWithObsolescenceGuard(async (modelName) => {
        modelsAttempted.push(modelName);
        if (modelName === 'gemini-3.8-flash') {
          const err = new Error('[404 Not Found] models/gemini-3.8-flash is discontinued');
          (err as any).status = 404;
          throw err;
        }
        return { ordersParsed: 15, currentModel: modelName };
      }, {
        moduleName: 'orders',
        operationName: 'order_parser_engine',
      });

      assert.deepEqual(modelsAttempted, ['gemini-3.8-flash', 'gemini-3.7-flash']);
      assert.equal(result.ordersParsed, 15);
      assert.equal(result.currentModel, 'gemini-3.7-flash');

      // Verify metadata attachment
      assert.ok(result._obsolescenceWarning !== undefined, 'Result must contain _obsolescenceWarning');
      assert.equal(result._obsolescenceWarning.failedModel, 'gemini-3.8-flash');
      assert.equal(result._obsolescenceWarning.fallbackModel, 'gemini-3.7-flash');
      assert.equal(result._obsolescenceWarning.statusCode, 404);
      assert.match(result._obsolescenceWarning.reason, /404 Not Found/);
      assert.ok(!isNaN(Date.parse(result._obsolescenceWarning.timestamp)));
    });

    it('3.2 should traverse multiple cascade tiers: 3.8 (404) -> 3.7 (410) -> 3.5 (succeeds)', async () => {
      const modelsAttempted: string[] = [];

      const result = await executeWithObsolescenceGuard(async (modelName) => {
        modelsAttempted.push(modelName);
        if (modelName === 'gemini-3.8-flash') {
          const err = new Error('models/gemini-3.8-flash is not found');
          (err as any).status = 404;
          throw err;
        }
        if (modelName === 'gemini-3.7-flash') {
          const err = new Error('HTTP 410 Gone: model has been retired');
          (err as any).status = 410;
          throw err;
        }
        return { commercialProposal: 'Valid Proposal', resolvedModel: modelName };
      }, {
        moduleName: 'commercial',
        operationName: 'commercial_proposal_extractor',
      });

      assert.deepEqual(modelsAttempted, ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash']);
      assert.equal(result.commercialProposal, 'Valid Proposal');
      assert.equal(result.resolvedModel, 'gemini-3.5-flash');

      assert.ok(result._obsolescenceWarning !== undefined);
      assert.equal(result._obsolescenceWarning.failedModel, 'gemini-3.8-flash');
      assert.equal(result._obsolescenceWarning.fallbackModel, 'gemini-3.7-flash');
    });

    it('3.3 should throw an aggregate error when the entire canonical cascade is exhausted', async () => {
      const modelsAttempted: string[] = [];
      let caughtError: any = null;

      try {
        await executeWithObsolescenceGuard(async (modelName) => {
          modelsAttempted.push(modelName);
          const err = new Error(`MODEL_DEPRECATED: ${modelName} is no longer available`);
          (err as any).status = 404;
          throw err;
        });
      } catch (err) {
        caughtError = err;
      }

      assert.deepEqual(modelsAttempted, Array.from(CANONICAL_MODEL_CASCADE));
      assert.ok(caughtError !== null);
      assert.match(caughtError.message, /All AI models in cascade.*failed/);
    });

    it('3.4 should post audit log to Supabase public.audit_logs with exact contractual schema', async () => {
      let auditLogCaptured: any = null;

      // Intercept Supabase audit_logs REST insertion
      fetchMock.registerRoute('/rest/v1/audit_logs', async (req) => {
        auditLogCaptured = req.bodyJson;
        return new Response(JSON.stringify([{ id: 101, status: 'ok' }]), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      await executeWithObsolescenceGuard(async (modelName) => {
        if (modelName === 'gemini-3.8-flash') {
          const err = new Error('404 Not Found: gemini-3.8-flash deprecated');
          (err as any).status = 404;
          throw err;
        }
        return { success: true };
      }, {
        moduleName: 'transport_logistics',
        operationName: 'route_optimization_explanation',
      });

      assert.ok(auditLogCaptured !== null, 'Supabase audit log record must be sent via REST');
      const record = Array.isArray(auditLogCaptured) ? auditLogCaptured[0] : auditLogCaptured;

      assert.equal(record.action, 'AI_MODEL_OBSOLESCENCE_DETECTED', 'Action must match contract');
      assert.equal(record.module, 'transport_logistics', 'Module must match options.moduleName');
      assert.equal(record.collaborator_id, null, 'collaborator_id must be null to prevent FK violations');
      assert.equal(record.collaborator_name, 'System / AI Obsolescence Sentinel');

      // Verify details object
      assert.ok(record.details !== undefined);
      assert.equal(record.details.failedModel, 'gemini-3.8-flash');
      assert.equal(record.details.fallbackModel, 'gemini-3.7-flash');
      assert.equal(record.details.statusCode, 404);
      assert.equal(record.details.operationName, 'route_optimization_explanation');
      assert.ok(!isNaN(Date.parse(record.details.timestamp)));
    });

    it('3.5 should maintain operational resilience if Supabase audit logging throws an exception', async () => {
      // Configure mock to simulate Supabase database failure
      fetchMock.registerRoute('/rest/v1/audit_logs', async () => {
        return new Response(JSON.stringify({ error: 'Database connection timeout' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      // Operation must still complete and return data without failing the business user
      const result = await executeWithObsolescenceGuard(async (modelName) => {
        if (modelName === 'gemini-3.8-flash') {
          const err = new Error('404 Not Found');
          (err as any).status = 404;
          throw err;
        }
        return { catalogGenerated: true };
      }, {
        moduleName: 'products_generate',
        operationName: 'description_generation',
      });

      assert.equal(result.catalogGenerated, true, 'Business operation must succeed despite telemetry outage');
      assert.ok(result._obsolescenceWarning !== undefined);
      assert.equal(result._obsolescenceWarning.fallbackModel, 'gemini-3.7-flash');
    });

    it('3.6 should gracefully return primitive or immutable return types', async () => {
      const primitiveResult = await executeWithObsolescenceGuard(async (modelName) => {
        if (modelName === 'gemini-3.8-flash') {
          const err = new Error('404 Not Found');
          (err as any).status = 404;
          throw err;
        }
        return 'plain text response string';
      });

      assert.equal(primitiveResult, 'plain text response string');
    });
  });
});
