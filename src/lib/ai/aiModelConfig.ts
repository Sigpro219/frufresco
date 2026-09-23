/**
 * FruFresco Central AI Model Governance & Obsolescence Sentinel
 *
 * Single Source of Truth for Gemini models, contingency cascades, API key resolution,
 * and poka-yoke obsolescence detection with automatic cascading fallback and audit logging.
 */

/**
 * Primary AI model for the FruFresco ecosystem (Gemini 3.0 / 2026, 1M context, integrated reasoning).
 */
export const PRIMARY_AI_MODEL = 'gemini-3.8-flash';

/**
 * Canonical contingency cascade hierarchy.
 * Traversed in order when an obsolescence or deprecation error (HTTP 404, 410, MODEL_DEPRECATED) is detected.
 */
export const CANONICAL_MODEL_CASCADE = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-2.5-flash',
] as const;

export type AiModelName = typeof CANONICAL_MODEL_CASCADE[number] | string;

/**
 * Configuration options for executeWithObsolescenceGuard.
 */
export interface ObsolescenceGuardOptions {
  /** Execution timeout in milliseconds. Defaults to 45,000ms (45s). */
  timeoutMs?: number;
  /** Originating module name for audit logging (e.g. 'orders', 'commercial', 'transport'). Defaults to 'ai_governance'. */
  moduleName?: string;
  /** Operation or task identifier for telemetry (e.g. 'order_parser_engine', 'transport_optimize'). */
  operationName?: string;
  /** Backward-compatible alias for operationName */
  taskName?: string;
  /** Custom model cascade to override the canonical cascade if needed. */
  cascade?: readonly string[];
  /** Explicit API key override. If omitted, resolved via getGeminiApiKey(). */
  apiKey?: string;
  /** Additional metadata for logging/context */
  contextMetadata?: Record<string, any>;
  /** Collaborator name for audit trail */
  collaboratorName?: string;
}

/**
 * Metadata attached to the returned result when obsolescence failover occurs.
 */
export interface ObsolescenceWarningMetadata {
  failedModel: string;
  fallbackModel: string;
  reason: string;
  timestamp: string;
  statusCode?: number;
}

/**
 * Resolves the Google Gemini API key from environment variables with sanitization.
 * Checks GOOGLE_GENERATIVE_AI_API_KEY, then GEMINI_API_KEY, returning empty string if unset.
 */
export function getGeminiApiKey(): string {
  const rawKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
  return rawKey.trim().replace(/^["']|["']$/g, '');
}

/**
 * Determines whether an error corresponds to model obsolescence, deprecation, or non-existence.
 * Accurately detects:
 * - HTTP status 404, 410, 'NOT_FOUND'
 * - Messages containing '[404 Not Found]', '404', '410', 'MODEL_DEPRECATED',
 *   'models/... is not found', 'not found for API version', 'not supported for generateContent',
 *   'is deprecated', 'has been discontinued'
 * 
 * Accurately excludes:
 * - 429 Quota exhaustion / rate limits (RESOURCE_EXHAUSTED)
 * - Network timeouts / AbortErrors
 * - 400 Bad Request / invalid payload formats
 */
export function isObsolescenceError(error: any): boolean {
  if (!error) return false;

  // Extract status / code
  const rawStatus = error.status ?? error.statusCode ?? error.response?.status ?? error.code;
  const numStatus = typeof rawStatus === 'number' ? rawStatus : Number(rawStatus);

  // Quota exhaustion or rate limit (429) -> NEVER obsolescence
  if (numStatus === 429 || rawStatus === 'RESOURCE_EXHAUSTED') {
    return false;
  }

  // Extract text details
  const errString = typeof error === 'string' ? error : '';
  const message = error.message ? String(error.message) : '';
  const statusText = error.statusText ? String(error.statusText) : '';
  const details = typeof error.details === 'string'
    ? error.details
    : (error.details ? JSON.stringify(error.details) : '');

  const combined = `${errString} ${message} ${statusText} ${details}`.toLowerCase();

  // If message indicates rate limiting or quota exhaustion, not obsolescence
  if (
    combined.includes('429') ||
    combined.includes('resource_exhausted') ||
    combined.includes('quota') ||
    combined.includes('rate limit')
  ) {
    return false;
  }

  // If message indicates network timeout or abort, not obsolescence
  if (
    error.name === 'AbortError' ||
    combined.includes('timed out') ||
    combined.includes('timeout') ||
    combined.includes('etimedout') ||
    combined.includes('fetch failed') ||
    combined.includes('econnrefused') ||
    combined.includes('econnreset')
  ) {
    return false;
  }

  // Check explicit status codes: 404 (Not Found) or 410 (Gone)
  if (numStatus === 404 || numStatus === 410 || rawStatus === 'NOT_FOUND') {
    return true;
  }

  // Obsolescence signature phrases in message or statusText
  const obsolescenceSignatures = [
    '404 not found',
    '[404 not found]',
    '410 gone',
    'model_deprecated',
    'is not found',
    'not found for api version',
    'not supported for generatecontent',
    'is deprecated',
    'has been discontinued',
    'model not found',
  ];

  return obsolescenceSignatures.some(sig => combined.includes(sig));
}

/**
 * Helper to safely extract status code from an error
 */
export function extractStatusCode(error: any): number | undefined {
  if (!error) return undefined;
  const raw = error.status ?? error.statusCode ?? error.response?.status ?? error.code;
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!isNaN(num) && num > 0) return num;

  const msg = (error.message || String(error)).toLowerCase();
  if (msg.includes('404')) return 404;
  if (msg.includes('410')) return 410;
  return undefined;
}

/**
 * Helper to safely extract error message string
 */
export function extractErrorMessage(error: any): string {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error.message) return String(error.message);
  if (error.statusText) return String(error.statusText);
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Logs an obsolescence event to Supabase public.audit_logs using createAdminClient() from @/lib/supabase.
 * Designed to be non-blocking: failure to write audit logs will NEVER crash operational flow.
 */
async function logObsolescenceIncident(params: {
  failedModel: string;
  fallbackModel: string;
  reason: string;
  statusCode?: number;
  timestamp: string;
  operationName: string;
  moduleName: string;
}): Promise<void> {
  try {
    let adminSupabase: any;
    try {
      const { createAdminClient } = await import('@/lib/supabase');
      adminSupabase = createAdminClient();
    } catch {
      // Dynamic fallback if module-scoped env vars were set after initial load
      const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/^["']|["']$/g, '');
      const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/^["']|["']$/g, '');
      if (url.startsWith('http') && key) {
        const { createClient } = await import('@supabase/supabase-js');
        adminSupabase = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
      }
    }

    if (!adminSupabase) {
      console.warn('[AI Obsolescence Sentinel] Supabase admin client unavailable; audit log skipped.');
      return;
    }

    const details = {
      failedModel: params.failedModel,
      fallbackModel: params.fallbackModel,
      reason: params.reason,
      statusCode: params.statusCode,
      timestamp: params.timestamp,
      operationName: params.operationName,
    };

    const { error } = await adminSupabase.from('audit_logs').insert([{
      action: 'AI_MODEL_OBSOLESCENCE_DETECTED',
      module: params.moduleName,
      collaborator_id: null,
      collaborator_name: 'System / AI Obsolescence Sentinel',
      details,
    }]);

    if (error) {
      console.warn('[AI Obsolescence Sentinel] Failed to insert audit log record:', error.message);
    }
  } catch (err: any) {
    console.warn('[AI Obsolescence Sentinel] Exception recording audit log:', err?.message || err);
  }
}

/**
 * Executes an AI operation wrapped in the Centinela Poka-Yoke Obsolescence Guard.
 * 
 * - Enforces configurable timeout (default 45s).
 * - Traverses CANONICAL_MODEL_CASCADE on obsolescence errors (404, 410, MODEL_DEPRECATED).
 * - Automatically logs obsolescence incidents to Supabase public.audit_logs.
 * - Injects `_obsolescenceWarning` metadata into the returned result object upon failover.
 * - Re-throws immediately on non-obsolescence errors (429, 400, timeout) without switching models.
 * - Throws a clear error if all cascade models fail.
 */
export async function executeWithObsolescenceGuard<T>(
  operation: (modelName: string, apiKey: string, signal?: AbortSignal) => Promise<T>,
  options?: ObsolescenceGuardOptions
): Promise<T & { _obsolescenceWarning?: ObsolescenceWarningMetadata }> {
  const cascade = options?.cascade && options.cascade.length > 0
    ? options.cascade
    : CANONICAL_MODEL_CASCADE;

  const apiKey = options?.apiKey || getGeminiApiKey();
  const timeoutMs = options?.timeoutMs ?? 45000;
  const operationName = options?.operationName || options?.taskName || 'unspecified_operation';
  const moduleName = options?.moduleName || 'ai_governance';

  let warningMetadata: ObsolescenceWarningMetadata | undefined;

  for (let i = 0; i < cascade.length; i++) {
    const currentModel = cascade[i];
    const controller = new AbortController();
    let timeoutId: NodeJS.Timeout | undefined;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          reject(new Error(`AI operation timed out after ${timeoutMs}ms (model: ${currentModel})`));
        }, timeoutMs);
      });

      const result = await Promise.race([
        operation(currentModel, apiKey, controller.signal),
        timeoutPromise,
      ]);

      // Execution succeeded! Attach obsolescence warning if failover occurred
      if (warningMetadata) {
        if (result !== null && (typeof result === 'object' || typeof result === 'function')) {
          try {
            (result as any)._obsolescenceWarning = warningMetadata;
          } catch {
            try {
              return Object.assign({}, result, { _obsolescenceWarning: warningMetadata });
            } catch {
              // Retain original result if mutation and cloning are prohibited
            }
          }
        }
      }

      return result as T & { _obsolescenceWarning?: ObsolescenceWarningMetadata };
    } catch (err: any) {
      if (isObsolescenceError(err)) {
        const hasNextModel = i + 1 < cascade.length;
        const nextModel = hasNextModel ? cascade[i + 1] : undefined;
        const timestamp = new Date().toISOString();
        const statusCode = extractStatusCode(err);
        const reason = extractErrorMessage(err);

        // Record the first failover warning (preserving the initial failedModel and the first fallbackModel)
        if (!warningMetadata && nextModel) {
          warningMetadata = {
            failedModel: currentModel,
            fallbackModel: nextModel,
            reason,
            timestamp,
            statusCode,
          };
        }

        if (nextModel) {
          console.warn(
            `[AI Obsolescence Sentinel] Model '${currentModel}' failed due to obsolescence (${statusCode || 'N/A'}: ${reason}). Switching to fallback model '${nextModel}'...`
          );

          // Log incident to public.audit_logs
          await logObsolescenceIncident({
            failedModel: currentModel,
            fallbackModel: nextModel,
            reason,
            statusCode,
            timestamp,
            operationName,
            moduleName,
          });

          // Cascade to the next model
          continue;
        } else {
          // All cascade models exhausted with obsolescence errors
          const errorMsg = `All AI models in cascade [${cascade.join(', ')}] failed. Last error on model '${currentModel}': ${reason}`;
          const finalError = new Error(errorMsg);
          (finalError as any).cause = err;
          (finalError as any).lastError = err;
          throw finalError;
        }
      }

      // Non-obsolescence error (e.g., 429 quota exhaustion, 400 bad request, timeout)
      // Throws immediately without cascading
      throw err;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  throw new Error(`AI cascade completed without returning a result. Models tried: ${cascade.join(', ')}`);
}
