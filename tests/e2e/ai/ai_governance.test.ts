import './test_helpers';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  PRIMARY_AI_MODEL,
  CANONICAL_MODEL_CASCADE,
  getGeminiApiKey,
  isObsolescenceError,
  extractStatusCode,
  extractErrorMessage,
} from '@/lib/ai/aiModelConfig';

// ============================================================================
// TIER 1: FEATURE COVERAGE - CENTRAL AI GOVERNANCE CONFIGURATION
// ============================================================================
describe('Tier 1: Central AI Governance & Standard Model Specification', () => {

  it('1.1 should define PRIMARY_AI_MODEL as the 2026 standard "gemini-3.8-flash"', () => {
    assert.equal(PRIMARY_AI_MODEL, 'gemini-3.8-flash', 'Primary AI model must strictly be gemini-3.8-flash');
  });

  it('1.2 should establish the canonical model cascade hierarchy with exact ordering', () => {
    const expected = [
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.5-flash',
      'gemini-flash-latest',
      'gemini-2.5-flash',
    ];

    assert.equal(CANONICAL_MODEL_CASCADE.length, 5, 'Cascade must contain exactly 5 authorized fallback tiers');
    assert.deepEqual(Array.from(CANONICAL_MODEL_CASCADE), expected, 'Cascade order must match SPEC and PROJECT contracts');
  });

  it('1.3 should designate gemini-3.8-flash as the first tier and gemini-2.5-flash as the final fallback', () => {
    assert.equal(CANONICAL_MODEL_CASCADE[0], 'gemini-3.8-flash', 'First tier must be primary model');
    assert.equal(CANONICAL_MODEL_CASCADE[CANONICAL_MODEL_CASCADE.length - 1], 'gemini-2.5-flash', 'Final tier must be legacy anchor');
  });

  it('1.4 should resolve API key with precedence for GOOGLE_GENERATIVE_AI_API_KEY over GEMINI_API_KEY', () => {
    const origGoogle = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const origGemini = process.env.GEMINI_API_KEY;

    try {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'primary-google-key-123';
      process.env.GEMINI_API_KEY = 'secondary-gemini-key-456';

      const key = getGeminiApiKey();
      assert.equal(key, 'primary-google-key-123', 'GOOGLE_GENERATIVE_AI_API_KEY must take precedence');
    } finally {
      if (origGoogle !== undefined) process.env.GOOGLE_GENERATIVE_AI_API_KEY = origGoogle;
      else delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      if (origGemini !== undefined) process.env.GEMINI_API_KEY = origGemini;
      else delete process.env.GEMINI_API_KEY;
    }
  });

  it('1.5 should fallback to GEMINI_API_KEY when GOOGLE_GENERATIVE_AI_API_KEY is unset', () => {
    const origGoogle = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const origGemini = process.env.GEMINI_API_KEY;

    try {
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      process.env.GEMINI_API_KEY = 'gemini-env-key-999';

      const key = getGeminiApiKey();
      assert.equal(key, 'gemini-env-key-999', 'Should resolve GEMINI_API_KEY when primary var is unset');
    } finally {
      if (origGoogle !== undefined) process.env.GOOGLE_GENERATIVE_AI_API_KEY = origGoogle;
      else delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      if (origGemini !== undefined) process.env.GEMINI_API_KEY = origGemini;
      else delete process.env.GEMINI_API_KEY;
    }
  });

  it('1.6 should sanitize API key values by trimming whitespace and stripping quotation marks', () => {
    const origGoogle = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const origGemini = process.env.GEMINI_API_KEY;

    try {
      delete process.env.GEMINI_API_KEY;
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = '  "AIzaSyD-secret-key-quoted"  ';

      const key = getGeminiApiKey();
      assert.equal(key, 'AIzaSyD-secret-key-quoted', 'Must strip surrounding quotes and whitespace');
    } finally {
      if (origGoogle !== undefined) process.env.GOOGLE_GENERATIVE_AI_API_KEY = origGoogle;
      else delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      if (origGemini !== undefined) process.env.GEMINI_API_KEY = origGemini;
      else delete process.env.GEMINI_API_KEY;
    }
  });
});

// ============================================================================
// TIER 2: BOUNDARY & CORNER CASES - OBSOLESCENCE ERROR CLASSIFIER (POKA-YOKE)
// ============================================================================
describe('Tier 2: Obsolescence Error Classification & Boundary Poka-Yoke', () => {

  it('2.1 should return empty string when no Gemini API keys are configured in environment', () => {
    const origGoogle = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const origGemini = process.env.GEMINI_API_KEY;

    try {
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      const key = getGeminiApiKey();
      assert.equal(key, '', 'Must safely return empty string when env vars are absent');
    } finally {
      if (origGoogle !== undefined) process.env.GOOGLE_GENERATIVE_AI_API_KEY = origGoogle;
      else delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      if (origGemini !== undefined) process.env.GEMINI_API_KEY = origGemini;
      else delete process.env.GEMINI_API_KEY;
    }
  });

  it('2.2 should classify HTTP 404 (Not Found) status code as obsolescence', () => {
    const errorWithStatus = { status: 404, message: 'Resource not found' };
    const errorWithStatusCode = { statusCode: 404, message: 'Not found' };
    const errorWithResponseStatus = { response: { status: 404 }, message: 'Model missing' };

    assert.equal(isObsolescenceError(errorWithStatus), true, 'status: 404 must trigger obsolescence');
    assert.equal(isObsolescenceError(errorWithStatusCode), true, 'statusCode: 404 must trigger obsolescence');
    assert.equal(isObsolescenceError(errorWithResponseStatus), true, 'response.status: 404 must trigger obsolescence');
  });

  it('2.3 should classify HTTP 410 (Gone) status code as obsolescence', () => {
    const err410 = { status: 410, message: 'Endpoint permanently gone' };
    assert.equal(isObsolescenceError(err410), true, 'HTTP 410 Gone must trigger obsolescence');
  });

  it('2.4 should classify NOT_FOUND string code as obsolescence', () => {
    const errCode = { code: 'NOT_FOUND', message: 'models/gemini-3.8-flash was not found' };
    assert.equal(isObsolescenceError(errCode), true, 'code: NOT_FOUND must trigger obsolescence');
  });

  it('2.5 should detect obsolescence signature phrases in error message or details', () => {
    const testCases = [
      { message: 'Error: [404 Not Found] models/gemini-3.8-flash is not found for API version v1beta' },
      { message: 'MODEL_DEPRECATED: This version has reached end of life' },
      { message: 'The model gemini-3.8-flash is deprecated and discontinued' },
      { message: 'Model is not supported for generateContent in this region or API version' },
      { details: 'models/gemini-3.8-flash has been discontinued' },
    ];

    for (const tc of testCases) {
      assert.equal(isObsolescenceError(tc), true, `Failed to detect obsolescence signature in: ${JSON.stringify(tc)}`);
    }
  });

  it('2.6 should NEVER classify HTTP 429 / Quota Exhaustion as obsolescence (Poka-Yoke Anti-Cascade)', () => {
    const testCases = [
      { status: 429, message: 'Resource exhausted: quota exceeded' },
      { statusCode: 429, message: 'Rate limit exceeded for requests per minute' },
      { code: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' },
      { message: '429 Too Many Requests - please retry after 30 seconds' },
      { message: 'Google Gemini quota limit reached' },
    ];

    for (const tc of testCases) {
      assert.equal(isObsolescenceError(tc), false, `429/Quota error must NEVER trigger obsolescence: ${JSON.stringify(tc)}`);
    }
  });

  it('2.7 should NEVER classify network timeouts, AbortError, or connection dropouts as obsolescence', () => {
    const testCases = [
      { name: 'AbortError', message: 'The user aborted a request' },
      { message: 'AI operation timed out after 45000ms' },
      { message: 'fetch failed: connect ETIMEDOUT 142.250.190.42:443' },
      { message: 'ECONNREFUSED connect to generativelanguage.googleapis.com' },
      { message: 'ECONNRESET by peer' },
    ];

    for (const tc of testCases) {
      assert.equal(isObsolescenceError(tc), false, `Network/Timeout error must NEVER trigger obsolescence: ${JSON.stringify(tc)}`);
    }
  });

  it('2.8 should NEVER classify HTTP 400 Bad Request / Invalid Argument as obsolescence', () => {
    const testCases = [
      { status: 400, message: 'INVALID_ARGUMENT: contents cannot be empty' },
      { statusCode: 400, message: 'Malformed JSON payload' },
      { message: 'Request contains invalid base64 data' },
    ];

    for (const tc of testCases) {
      assert.equal(isObsolescenceError(tc), false, `400/Bad Request error must NEVER trigger obsolescence: ${JSON.stringify(tc)}`);
    }
  });

  it('2.9 should handle null, undefined, empty strings, and non-error values gracefully', () => {
    assert.equal(isObsolescenceError(null), false);
    assert.equal(isObsolescenceError(undefined), false);
    assert.equal(isObsolescenceError(''), false);
    assert.equal(isObsolescenceError({}), false);
    assert.equal(isObsolescenceError(12345), false);
  });

  it('2.10 extractStatusCode should reliably extract status from varied error shapes', () => {
    assert.equal(extractStatusCode({ status: 404 }), 404);
    assert.equal(extractStatusCode({ statusCode: 410 }), 410);
    assert.equal(extractStatusCode({ response: { status: 404 } }), 404);
    assert.equal(extractStatusCode({ message: 'Encountered 404 Not Found' }), 404);
    assert.equal(extractStatusCode({ message: 'HTTP 410 Gone' }), 410);
    assert.equal(extractStatusCode({ message: 'General runtime error' }), undefined);
    assert.equal(extractStatusCode(null), undefined);
  });

  it('2.11 extractErrorMessage should safely convert any error shape into a string', () => {
    assert.equal(extractErrorMessage('Direct error message'), 'Direct error message');
    assert.equal(extractErrorMessage(new Error('Standard Error object')), 'Standard Error object');
    assert.equal(extractErrorMessage({ message: 'Object with message property' }), 'Object with message property');
    assert.equal(extractErrorMessage({ statusText: 'Bad Gateway' }), 'Bad Gateway');
    assert.equal(extractErrorMessage(null), 'Unknown error');
    assert.equal(extractErrorMessage(undefined), 'Unknown error');
  });
});
