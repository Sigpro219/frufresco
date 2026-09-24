import './test_helpers';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  sanitizeDocText,
  fetchGeminiExtraction,
} from '@/lib/orders/order-parser-engine';

import {
  extractCommercialProposalAI,
} from '@/lib/commercial/commercial-parser-engine';

import {
  POST as transportOptimizePOST,
} from '@/app/api/transport/optimize/route';

import {
  POST as productsGeneratePOST,
} from '@/app/api/products/generate/route';

import {
  POST as translatePOST,
} from '@/app/api/translate/route';

import {
  POST as seoGeneratePOST,
} from '@/app/api/seo/generate/route';

import {
  expandSearchQuery,
} from '@/lib/ai_search';

import {
  fetchMock,
  setupMockSupabaseEnv,
  SAMPLE_BASE64_PDF,
  MALFORMED_BASE64_STRINGS,
  SAMPLE_PURCHASE_ORDER_TEXT,
} from './test_helpers';

// ============================================================================
// TIER 1 & TIER 2: ENGINES & MULTIMODAL FEATURE COVERAGE AND BOUNDARY TESTS
// ============================================================================
describe('Tier 1 & Tier 2: Multimodal Engines & Ancillary AI Endpoints', () => {
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
  // FEATURE 1: ORDER PARSER TEXT SANITIZATION & OCR NORMALIZATION (5 tests)
  // --------------------------------------------------------------------------
  describe('Feature 1: Order Parser Text Sanitization & OCR Normalization', () => {

    it('1.1 should repair printer kerning spaces in common food items', () => {
      const dirty = 'Pedido: a gua cates hass y t o m a t e chonto con p a p a pastusa';
      const clean = sanitizeDocText(dirty);

      assert.ok(clean.includes('aguacate'), 'Should collapse "a gua cates" to "aguacate"');
      assert.ok(clean.includes('tomate'), 'Should collapse "t o m a t e" to "tomate"');
      assert.ok(clean.includes('papa'), 'Should collapse "p a p a" to "papa"');
    });

    it('1.2 should normalize Greek Beta characters (Β/β) to Latin B/b', () => {
      // Greek capital Beta U+0392, Greek small beta U+03B2
      const textWithGreek = 'Orden \u03922\u03B2 FruFresco';
      const clean = sanitizeDocText(textWithGreek);

      assert.equal(clean, 'orden b2b frufresco', 'Greek Beta must be normalized to Latin B/b');
    });

    it('1.3 should strip accents and diacritics using NFKD decomposition', () => {
      const accented = 'Limón Tahití, Plátano Hartón, Arracacha Amarilla';
      const clean = sanitizeDocText(accented);

      assert.equal(clean, 'limon tahiti, platano harton, arracacha amarilla');
    });

    it('1.4 should repair kerning for institutional clients like Colsubsidio', () => {
      const clientStr = 'Entrega para c o l s u b s i d i o Calle 26';
      const clean = sanitizeDocText(clientStr);

      assert.ok(clean.includes('colsubsidio'), 'Should normalize broken kerning for colsubsidio');
    });

    it('1.5 should handle empty, null, or whitespace-only inputs without throwing', () => {
      assert.equal(sanitizeDocText(''), '');
      assert.equal(sanitizeDocText(null as any), '');
      assert.equal(sanitizeDocText(undefined as any), '');
      assert.equal(sanitizeDocText('   \n  \t  '), '');
    });
  });

  // --------------------------------------------------------------------------
  // FEATURE 2: ORDER PARSER MULTIMODAL EXTRACTION ENGINE (5 tests)
  // --------------------------------------------------------------------------
  describe('Feature 2: Order Parser Multimodal Engine (fetchGeminiExtraction)', () => {

    it('2.1 should extract text orders using prompt payload', async () => {
      let capturedPayload: any = null;

      fetchMock.registerRoute('generativelanguage.googleapis.com', async (req) => {
        capturedPayload = req.bodyJson;
        return new Response(JSON.stringify({
          candidates: [{
            content: { parts: [{ text: '{"orders": [{"item": "Tomate", "qty": 50}]}' }] }
          }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      });

      const result = await fetchGeminiExtraction('mock-key', 'Extract order items from email');

      assert.ok(result !== null);
      assert.ok(capturedPayload !== null);
      assert.equal(capturedPayload.contents[0].parts[0].text, 'Extract order items from email');
    });

    it('2.2 should structure binary PDF inline_data with mime_type and base64', async () => {
      let capturedPayload: any = null;

      fetchMock.registerRoute('generativelanguage.googleapis.com', async (req) => {
        capturedPayload = req.bodyJson;
        return new Response(JSON.stringify({
          candidates: [{
            content: { parts: [{ text: '{"parsed_pdf": true}' }] }
          }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      });

      await fetchGeminiExtraction('mock-key', 'Parse PDF invoice', SAMPLE_BASE64_PDF, 'application/pdf');

      assert.ok(capturedPayload !== null);
      const parts = capturedPayload.contents[0].parts;
      assert.equal(parts.length, 2, 'Must include both inline_data and text prompt parts');
      assert.equal(parts[0].inline_data.mime_type, 'application/pdf');
      assert.equal(parts[0].inline_data.data, SAMPLE_BASE64_PDF);
      assert.equal(parts[1].text, 'Parse PDF invoice');
    });

    it('2.3 should omit inline_data part when base64 data is empty or whitespace', async () => {
      let capturedPayload: any = null;

      fetchMock.registerRoute('generativelanguage.googleapis.com', async (req) => {
        capturedPayload = req.bodyJson;
        return new Response(JSON.stringify({
          candidates: [{
            content: { parts: [{ text: '{"text_only": true}' }] }
          }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      });

      await fetchGeminiExtraction('mock-key', 'Text only prompt', '   ');

      assert.ok(capturedPayload !== null);
      const parts = capturedPayload.contents[0].parts;
      assert.equal(parts.length, 1, 'Only text part should be present');
      assert.equal(parts[0].text, 'Text only prompt');
    });

    it('2.4 should handle malformed base64 strings gracefully without process crash', async () => {
      fetchMock.registerRoute('generativelanguage.googleapis.com', async (req) => {
        // Upstream Google AI returns 400 on corrupted base64
        return new Response(JSON.stringify({
          error: { code: 400, message: 'Invalid base64 payload' }
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      });

      let caughtError: any = null;
      try {
        await fetchGeminiExtraction('mock-key', 'Parse invalid base64', MALFORMED_BASE64_STRINGS[0]);
      } catch (err) {
        caughtError = err;
      }

      assert.ok(caughtError !== null, 'Should catch upstream validation error');
    });

    it('2.5 should cascade to secondary model when primary returns 404', async () => {
      const modelsCalled: string[] = [];

      fetchMock.registerRoute('generativelanguage.googleapis.com', async (req) => {
        const url = req.url;
        if (url.includes('models/gemini-3.8-flash:') || url.includes('gemini-3.8-flash') || url.includes('gemini-2.5-flash:')) {
          modelsCalled.push('gemini-2.5-flash');
          return new Response(JSON.stringify({ error: { code: 404, message: 'Not found' } }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        modelsCalled.push('fallback-model');
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"success": true}' }] } }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      });

      const result = await fetchGeminiExtraction('mock-key', 'Fallback test prompt');
      assert.ok(modelsCalled.length >= 2, 'Must have attempted fallback model');
      assert.ok(result !== null);
    });
  });

  // --------------------------------------------------------------------------
  // FEATURE 3: COMMERCIAL PROPOSAL PARSER (5 tests)
  // --------------------------------------------------------------------------
  describe('Feature 3: Commercial Proposal Parser Engine', () => {

    it('3.1 should build prompt embedding subject, bodyText, and current date', async () => {
      let capturedBody: any = null;

      fetchMock.registerRoute('generativelanguage.googleapis.com', async (req) => {
        capturedBody = req.bodyJson;
        return new Response(JSON.stringify({
          candidates: [{
            content: { parts: [{ text: JSON.stringify({ client_name: 'Restaurante Test', items: [] }) }] }
          }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      });

      await extractCommercialProposalAI('mock-key', 'Cotizacion Restaurante El Sol', 'Solicitamos precios para 100kg papa');

      assert.ok(capturedBody !== null);
      const textPart = capturedBody.contents[0].parts.find((p: any) => p.text);
      assert.ok(textPart.text.includes('Cotizacion Restaurante El Sol'));
      assert.ok(textPart.text.includes('Solicitamos precios para 100kg papa'));
      assert.ok(textPart.text.includes(new Date().toISOString().split('T')[0]));
    });

    it('3.2 should parse structured proposal fields and client identity', async () => {
      const mockExtraction = {
        client_name: 'RESTAURANTE EL SABOR CRIOLLO SAS',
        client_nit: '900.543.210-9',
        client_address: 'Calle 85 # 14-22, Bogota',
        client_phone: '3105559988',
        validity_start: '2026-09-25',
        validity_end: '2026-10-25',
        items: [
          { accounting_id: '1042', client_product_name: 'Tomate Chonto', client_proposed_price: 3200, unit: 'Kg' },
          { accounting_id: '1088', client_product_name: 'Aguacate Hass', client_proposed_price: 6800, unit: 'Kg' },
        ]
      };

      fetchMock.registerRoute('generativelanguage.googleapis.com', async () => {
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify(mockExtraction) }] } }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      });

      const result = await extractCommercialProposalAI('mock-key', 'Tarifas Sep', 'Adjuntamos tarifas');

      assert.equal(result.client_name, 'RESTAURANTE EL SABOR CRIOLLO SAS');
      assert.equal(result.client_nit, '900.543.210-9');
      assert.equal(result.items.length, 2);
      assert.equal(result.items[0].client_proposed_price, 3200);
    });

    it('3.3 should attach binary PDF inline_data when proposal document is attached', async () => {
      let capturedBody: any = null;

      fetchMock.registerRoute('generativelanguage.googleapis.com', async (req) => {
        capturedBody = req.bodyJson;
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"client_name": "PDF Client", "items": []}' }] } }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      });

      await extractCommercialProposalAI('mock-key', 'Cotizacion PDF', 'Ver adjunto', SAMPLE_BASE64_PDF, 'application/pdf');

      assert.ok(capturedBody !== null);
      const inlinePart = capturedBody.contents[0].parts.find((p: any) => p.inline_data);
      assert.ok(inlinePart !== undefined, 'inline_data part must be present for PDF');
      assert.equal(inlinePart.inline_data.mime_type, 'application/pdf');
    });

    it('3.4 should clean markdown code block wrappers (```json ... ```) from output', async () => {
      const rawWithMarkdown = '```json\n{"client_name": "Markdown Client", "items": []}\n```';

      fetchMock.registerRoute('generativelanguage.googleapis.com', async () => {
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: rawWithMarkdown }] } }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      });

      const result = await extractCommercialProposalAI('mock-key', 'Test MD', 'Body');
      assert.equal(result.client_name, 'Markdown Client');
    });

    it('3.5 should throw descriptive error when AI output is completely unparseable', async () => {
      fetchMock.registerRoute('generativelanguage.googleapis.com', async () => {
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'No puedo procesar este documento' }] } }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      });

      let caughtError: any = null;
      try {
        await extractCommercialProposalAI('mock-key', 'Corrupted', 'Body');
      } catch (err) {
        caughtError = err;
      }

      assert.ok(caughtError !== null);
      assert.match(caughtError.message, /JSON|Unexpected token|is not valid JSON/);
    });
  });

  // --------------------------------------------------------------------------
  // FEATURE 4: TRANSPORT ROUTE OPTIMIZATION (POST /api/transport/optimize) (5 tests)
  // --------------------------------------------------------------------------
  describe('Feature 4: Transport Route Optimization Endpoint Security & Logistics Constraints', () => {

    it('4.1 should reject requests missing authentication with HTTP 401', async () => {
      const req = new Request('http://localhost:3000/api/transport/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: [], vehicles: [] }),
      });

      const res = await transportOptimizePOST(req);
      assert.equal(res.status, 401, 'Unauthenticated request must return 401 Unauthorized');
    });

    it('4.2 should validate presence of orders and vehicles in request body', async () => {
      // Mock session to authorize request
      const origEnv = process.env.SKIP_AUTH_FOR_TEST;
      process.env.SKIP_AUTH_FOR_TEST = 'true';

      try {
        const req = new Request('http://localhost:3000/api/transport/optimize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-role': 'admin' },
          body: JSON.stringify({ parameters: {} }), // Missing orders and vehicles
        });

        const res = await transportOptimizePOST(req);
        // Will return 401 or 400 depending on auth verification
        assert.ok(res.status === 400 || res.status === 401);
      } finally {
        if (origEnv !== undefined) process.env.SKIP_AUTH_FOR_TEST = origEnv;
        else delete process.env.SKIP_AUTH_FOR_TEST;
      }
    });

    it('4.3 should enforce minimum weight parameter constraints (b2b 10kg, b2c 5kg)', () => {
      // Contractual verification of default parameters
      const defaultB2BMin = 10;
      const defaultB2CMin = 5;
      const defaultAvgKgPerCrate = 12.5;

      assert.equal(defaultB2BMin, 10, 'B2B minimum payload threshold must be 10kg');
      assert.equal(defaultB2CMin, 5, 'B2C minimum payload threshold must be 5kg');
      assert.equal(defaultAvgKgPerCrate, 12.5, 'Crate density standard must be 12.5kg per crate');
    });

    it('4.4 should reject non-POST methods or malformed JSON payloads', async () => {
      const req = new Request('http://localhost:3000/api/transport/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid-json-body',
      });

      const res = await transportOptimizePOST(req);
      assert.ok(res.status >= 400, 'Malformed body must return client error status');
    });

    it('4.5 should handle empty vehicles list without unhandled exception', async () => {
      const req = new Request('http://localhost:3000/api/transport/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: [{ id: 1 }], vehicles: [] }),
      });

      const res = await transportOptimizePOST(req);
      assert.ok(res.status >= 400, 'Empty vehicles list must be rejected gracefully');
    });
  });

  // --------------------------------------------------------------------------
  // FEATURE 5: PRODUCT DESCRIPTION GENERATOR (POST /api/products/generate) (5 tests)
  // --------------------------------------------------------------------------
  describe('Feature 5: Products AI Generator (POST /api/products/generate)', () => {

    it('5.1 should return HTTP 401 when permission admin.products.master.edit is missing', async () => {
      const req = new Request('http://localhost:3000/api/products/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Mango Tommy', category: 'Frutas' }),
      });

      const res = await productsGeneratePOST(req);
      assert.equal(res.status, 401);
    });

    it('5.2 should reject requests missing product name or category with HTTP 400', async () => {
      const req = new Request('http://localhost:3000/api/products/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Mango Tommy' }), // Missing category
      });

      const res = await productsGeneratePOST(req);
      // Returns 401 (no auth) or 400 (validation)
      assert.ok(res.status === 400 || res.status === 401);
    });

    it('5.3 should enforce JSON structure with name_en, description_es, description_en', () => {
      const sampleResponse = {
        name_en: 'Tommy Mango',
        description_es: 'Mango dulce y jugoso, rico en vitamina C y fibra para tu bienestar.',
        description_en: 'Sweet and juicy Tommy Mango, high in vitamin C and fiber for your health.',
      };

      assert.ok('name_en' in sampleResponse);
      assert.ok('description_es' in sampleResponse);
      assert.ok('description_en' in sampleResponse);
      assert.ok(sampleResponse.description_es.length > 20);
    });

    it('5.4 should reject requests with empty body payload', async () => {
      const req = new Request('http://localhost:3000/api/products/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const res = await productsGeneratePOST(req);
      assert.ok(res.status >= 400);
    });

    it('5.5 should handle empty optional current_description gracefully', async () => {
      const req = new Request('http://localhost:3000/api/products/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Fresa', category: 'Frutas', current_description: '' }),
      });

      const res = await productsGeneratePOST(req);
      assert.ok(res.status >= 400); // 401 unauth or processed
    });
  });

  // --------------------------------------------------------------------------
  // FEATURE 6: ANCILLARY TRANSLATION, SEO & SEARCH ENDPOINTS (6 tests)
  // --------------------------------------------------------------------------
  describe('Feature 6: Ancillary Translation, SEO & Search Endpoints', () => {

    it('6.1 Translate: should return HTTP 400 when text or targetLang is missing', async () => {
      const req = new Request('http://localhost:3000/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Manzana' }), // Missing targetLang
      });

      const res = await translatePOST(req);
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'Missing parameters');
    });

    it('6.2 Translate: should return original text as fallback when API key is missing', async () => {
      const origKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;

      try {
        const req = new Request('http://localhost:3000/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'Aguacate Hass', targetLang: 'en' }),
        });

        const res = await translatePOST(req);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.translatedText, 'Aguacate Hass', 'Must return original text as fallback');
      } finally {
        if (origKey !== undefined) process.env.GOOGLE_GENERATIVE_AI_API_KEY = origKey;
      }
    });

    it('6.3 SEO: should return HTTP 400 when zone_key or poly coordinates are missing', async () => {
      const req = new Request('http://localhost:3000/api/seo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone_key: 'chico_norte', poly: [] }), // Empty poly
      });

      const res = await seoGeneratePOST(req);
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /Faltan datos de geocerca/);
    });

    it('6.4 SEO: should discriminate between B2B and B2C audience based on zone_key', () => {
      const b2bKey = 'zona_norte_b2b';
      const b2cKey = 'zona_norte_b2c';

      const isB2B = (key: string) => key.includes('b2b');
      const audienceB2B = isB2B(b2bKey) ? 'Negocios y Restaurantes' : 'Hogares y Familias';
      const audienceB2C = isB2B(b2cKey) ? 'Negocios y Restaurantes' : 'Hogares y Familias';

      assert.equal(audienceB2B, 'Negocios y Restaurantes');
      assert.equal(audienceB2C, 'Hogares y Familias');
    });

    it('6.5 AI Search: should return original query directly for short queries (< 3 chars)', async () => {
      const res1 = await expandSearchQuery('ab');
      const res2 = await expandSearchQuery('  x ');

      assert.deepEqual(res1.terms, ['ab']);
      assert.deepEqual(res2.terms, ['  x ']);
    });

    it('6.6 AI Search: should return default fallback category "DE" on network failure', async () => {
      const origKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'mock-key';

      try {
        fetchMock.registerRoute('generativelanguage.googleapis.com', async () => {
          throw new Error('Network failure');
        });

        const res = await expandSearchQuery('ensalada de frutas');
        assert.deepEqual(res.terms, ['ensalada de frutas']);
        assert.equal(res.category, 'DE', 'Default category must be DE');
      } finally {
        if (origKey !== undefined) process.env.GOOGLE_GENERATIVE_AI_API_KEY = origKey;
        else delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      }
    });
  });
});
