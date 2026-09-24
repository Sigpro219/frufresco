/**
 * FruFresco E2E Test Suite - Shared AI Testing Harness & Helpers
 * Provides isolated mock fetch, Supabase audit interceptors, and fixture generators.
 */

// Initialize baseline test environment variables before module dependencies evaluate
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith('http')) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock-frufresco.supabase.co';
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key-sentinel-test-2026';
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key-sentinel-test-2026';
}
if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'mock-google-ai-test-key';
}

// Transparently stub unstable_cache for unit/e2e testing outside Next server runtime
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nextCache = require('next/cache');
  if (nextCache) {
    nextCache.unstable_cache = (fn: any) => fn;
  }
} catch {
  // Ignore if require is unavailable
}

export interface CapturedFetchRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  bodyText?: string;
  bodyJson?: any;
}

export interface MockFetchRoute {
  pattern: RegExp | string;
  handler: (req: CapturedFetchRequest) => Promise<Response> | Response;
}

class TestFetchDispatcher {
  private originalFetch: typeof globalThis.fetch | null = null;
  private routes: MockFetchRoute[] = [];
  public capturedRequests: CapturedFetchRequest[] = [];

  public install(): void {
    if (this.originalFetch) return; // already installed
    this.originalFetch = globalThis.fetch;
    this.capturedRequests = [];
    this.routes = [];

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
      const method = (init?.method || 'GET').toUpperCase();
      
      const headers: Record<string, string> = {};
      if (init?.headers) {
        if (typeof (init.headers as any).forEach === 'function') {
          (init.headers as Headers).forEach((val, key) => { headers[key.toLowerCase()] = val; });
        } else if (Array.isArray(init.headers)) {
          for (const [k, v] of init.headers) { headers[k.toLowerCase()] = v; }
        } else {
          for (const [k, v] of Object.entries(init.headers)) { headers[k.toLowerCase()] = String(v); }
        }
      }

      let bodyText: string | undefined;
      let bodyJson: any;

      if (init?.body) {
        if (typeof init.body === 'string') {
          bodyText = init.body;
          try {
            bodyJson = JSON.parse(init.body);
          } catch {
            // Not JSON
          }
        }
      }

      const captured: CapturedFetchRequest = { url, method, headers, bodyText, bodyJson };
      this.capturedRequests.push(captured);

      for (const route of this.routes) {
        const matches = typeof route.pattern === 'string'
          ? url.includes(route.pattern)
          : route.pattern.test(url);

        if (matches) {
          return route.handler(captured);
        }
      }

      // Default mock fallback: if URL is Supabase audit_logs, return 201 Created
      if (url.includes('/rest/v1/audit_logs')) {
        return new Response(JSON.stringify([{ id: 1, action: 'AI_MODEL_OBSOLESCENCE_DETECTED' }]), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // If URL is Google Gemini API, return a clean mocked response by default
      if (url.includes('generativelanguage.googleapis.com')) {
        return new Response(JSON.stringify({
          candidates: [{
            content: {
              parts: [{ text: '{"result": "mock_gemini_success"}' }]
            }
          }]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
  }

  public registerRoute(pattern: RegExp | string, handler: (req: CapturedFetchRequest) => Promise<Response> | Response): void {
    this.routes.unshift({ pattern, handler });
  }

  public clearRoutes(): void {
    this.routes = [];
    this.capturedRequests = [];
  }

  public restore(): void {
    if (this.originalFetch) {
      globalThis.fetch = this.originalFetch;
      this.originalFetch = null;
    }
    this.routes = [];
    this.capturedRequests = [];
  }
}

export const fetchMock = new TestFetchDispatcher();

/**
 * Configure mock Supabase environment variables for audit logging tests
 */
export function setupMockSupabaseEnv(): () => void {
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const prevServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock-frufresco.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key-sentinel-test-2026';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key-sentinel-test-2026';

  return () => {
    if (prevUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    else delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (prevAnonKey !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevAnonKey;
    else delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (prevServiceKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = prevServiceKey;
    else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  };
}

/**
 * Valid sample minimal Base64 PDF header and payload
 */
export const SAMPLE_BASE64_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Title (FruFresco Purchase Order Test) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF'
).toString('base64');

/**
 * Malformed Base64 strings for negative boundary testing
 */
export const MALFORMED_BASE64_STRINGS = [
  'not_valid_base64!@#$%',
  '==abc==',
  '----BEGIN INVALID----',
  '!!$$%%&&',
  'invalid base64 with spaces and symbols *&*&^',
];

/**
 * Real-world Purchase Order Text Fixture
 */
export const SAMPLE_PURCHASE_ORDER_TEXT = `
ORDEN DE COMPRA COMERCIAL B2B
FruFresco - Investments Cortes SAS
Cliente: RESTAURANTE EL SABOR CRIOLLO SAS
NIT: 900.543.210-9
Dirección: Calle 85 # 14-22, Chico, Bogota
Telefono: 3105559988
Fecha de Entrega Solicitada: 2026-09-25

ITEMS SOLICITADOS:
1. Tomate Chonto Maduro - 80 Kg - Precio Solicitado: $3.200 / Kg
2. Aguacate Hass Extra - 50 Kg - Precio Solicitado: $6.800 / Kg
3. Cebolla Cabezona Blanca Limpia - 40 Kg - Precio Solicitado: $2.500 / Kg
4. Papa Pastusa Especial - 100 Kg - Precio Solicitado: $1.900 / Kg
5. Limon Tahiti Exportacion - 30 Kg - Precio Solicitado: $3.500 / Kg

Condiciones: Facturacion a 30 dias credito comercial.
`;

/**
 * Mock Google /v1beta/models catalog payload
 */
export const MOCK_GOOGLE_MODELS_CATALOG = {
  models: [
    {
      name: 'models/gemini-3.8-flash',
      version: '3.8',
      displayName: 'Gemini 3.8 Flash',
      description: 'Next-generation multimodal model with integrated reasoning',
      inputTokenLimit: 1048576,
      outputTokenLimit: 8192,
      supportedGenerationMethods: ['generateContent', 'countTokens'],
    },
    {
      name: 'models/gemini-3.7-flash',
      version: '3.7',
      displayName: 'Gemini 3.7 Flash',
      description: 'High speed multimodal model',
      inputTokenLimit: 1048576,
      outputTokenLimit: 8192,
      supportedGenerationMethods: ['generateContent'],
    },
    {
      name: 'models/gemini-3.5-flash',
      version: '3.5',
      displayName: 'Gemini 3.5 Flash',
      description: 'Balanced speed and accuracy',
      inputTokenLimit: 524288,
      outputTokenLimit: 4096,
      supportedGenerationMethods: ['generateContent'],
    },
    {
      name: 'models/gemini-2.5-flash',
      version: '2.5',
      displayName: 'Gemini 2.5 Flash',
      description: 'Legacy generation fallback',
      inputTokenLimit: 128000,
      outputTokenLimit: 2048,
      supportedGenerationMethods: ['generateContent'],
    }
  ]
};
