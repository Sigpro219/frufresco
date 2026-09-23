import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  PRIMARY_AI_MODEL,
  CANONICAL_MODEL_CASCADE,
  getGeminiApiKey,
} from '@/lib/ai/aiModelConfig';

export const dynamic = 'force-dynamic';

export interface CatalogAuditResult {
  isPrimaryModelAvailable: boolean;
  totalModelsCount: number;
  availableModels: string[];
  alert: string | null;
}

export interface AiHealthResponse {
  ok: boolean;
  status: 'healthy' | 'degraded' | 'error';
  primaryModel: string;
  model: string;
  latencyMs: number;
  catalogAudit: CatalogAuditResult;
  cascade: string[];
  timestamp: string;
  code?: string;
  message?: string;
  details?: string;
}

export async function GET(request?: Request) {
  let isStrict = false;
  if (request) {
    try {
      const url = new URL(request.url);
      isStrict =
        url.searchParams.get('strict') === 'true' ||
        request.headers?.get('x-health-strict') === 'true';
    } catch {
      // Ignore URL parsing errors for non-standard Request objects
    }
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    const errorBody: AiHealthResponse = {
      ok: false,
      status: 'error',
      code: 'KEY_MISSING',
      message: 'No se ha configurado la clave de API de Gemini.',
      primaryModel: PRIMARY_AI_MODEL,
      model: PRIMARY_AI_MODEL,
      latencyMs: 0,
      catalogAudit: {
        isPrimaryModelAvailable: false,
        totalModelsCount: 0,
        availableModels: [],
        alert: 'API key is missing; catalog audit skipped.',
      },
      cascade: Array.from(CANONICAL_MODEL_CASCADE),
      timestamp: new Date().toISOString(),
    };
    return NextResponse.json(errorBody, { status: isStrict ? 500 : 200 });
  }

  const overallStartTime = Date.now();
  let latencyMs = 0;

  try {
    // 1. Test connectivity and measure active latency on PRIMARY_AI_MODEL (gemini-3.8-flash)
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: PRIMARY_AI_MODEL });
    const pingStart = Date.now();
    const result = await model.generateContent('ping');
    result.response.text();
    latencyMs = Date.now() - pingStart;

    // 2. Query Google /v1beta/models catalog to audit primary model & superior version availability
    let catalogAudit: CatalogAuditResult = {
      isPrimaryModelAvailable: true,
      totalModelsCount: 1,
      availableModels: [PRIMARY_AI_MODEL],
      alert: null,
    };

    try {
      const catalogUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
      const catalogRes = await fetch(catalogUrl, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (catalogRes.ok) {
        const catalogData = await catalogRes.json();
        if (Array.isArray(catalogData?.models)) {
          const rawModels = catalogData.models as Array<{
            name: string;
            supportedGenerationMethods?: string[];
            [key: string]: any;
          }>;

          const availableModels = rawModels
            .map(m => (typeof m.name === 'string' ? m.name.replace(/^models\//, '') : ''))
            .filter(Boolean);

          const primaryEntry = rawModels.find(m => {
            const cleanName = typeof m.name === 'string' ? m.name.replace(/^models\//, '') : '';
            return cleanName === PRIMARY_AI_MODEL;
          });

          const isPrimaryAvailable = Boolean(
            primaryEntry &&
            (!Array.isArray(primaryEntry.supportedGenerationMethods) ||
              primaryEntry.supportedGenerationMethods.includes('generateContent'))
          );

          let alert: string | null = null;
          if (!isPrimaryAvailable) {
            alert = `Primary model '${PRIMARY_AI_MODEL}' is discontinued or not supported for generateContent in Google Cloud catalog.`;
          } else {
            // Detect if a newer/superior Flash version is available in the catalog
            const currentMatch = PRIMARY_AI_MODEL.match(/^gemini-(\d+(?:\.\d+)?)-flash/);
            const currentVer = currentMatch ? parseFloat(currentMatch[1]) : 3.8;

            const newerModels = availableModels
              .map(name => {
                const match = name.match(/^gemini-(\d+(?:\.\d+)?)-flash/);
                return match ? { name, ver: parseFloat(match[1]) } : null;
              })
              .filter((item): item is { name: string; ver: number } => item !== null && item.ver > currentVer)
              .sort((a, b) => b.ver - a.ver);

            if (newerModels.length > 0) {
              alert = `Newer model '${newerModels[0].name}' detected in Google catalog (current primary: '${PRIMARY_AI_MODEL}'). Upgrade available.`;
            }
          }

          catalogAudit = {
            isPrimaryModelAvailable: isPrimaryAvailable,
            totalModelsCount: rawModels.length,
            availableModels,
            alert,
          };
        }
      }
    } catch (catalogErr: any) {
      console.warn('[AI Health Sentinel] Catalog inspection non-blocking warning:', catalogErr?.message || catalogErr);
    }

    const isHealthy = catalogAudit.isPrimaryModelAvailable;
    const status: 'healthy' | 'degraded' = isHealthy ? 'healthy' : 'degraded';

    const responseBody: AiHealthResponse = {
      ok: isHealthy,
      status,
      primaryModel: PRIMARY_AI_MODEL,
      model: PRIMARY_AI_MODEL,
      latencyMs,
      catalogAudit,
      cascade: Array.from(CANONICAL_MODEL_CASCADE),
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(responseBody, {
      status: (!isHealthy && isStrict) ? 503 : 200,
    });
  } catch (error: any) {
    const errMsg = error?.message || '';
    let code = 'AI_ERROR';
    let userMessage = 'El servicio de IA presentó una interrupción temporal.';
    let status: 'healthy' | 'degraded' | 'error' = 'degraded';
    let httpStatus = isStrict ? 503 : 200;

    if (
      errMsg.includes('429') ||
      errMsg.includes('Quota exceeded') ||
      errMsg.includes('Too Many Requests') ||
      errMsg.includes('RESOURCE_EXHAUSTED')
    ) {
      code = 'QUOTA_EXCEEDED';
      userMessage = 'Límite de cuota alcanzado en la API de Google Gemini.';
      status = 'degraded';
      httpStatus = isStrict ? 503 : 200;
    } else if (
      errMsg.includes('503') ||
      errMsg.includes('Service Unavailable') ||
      errMsg.includes('high demand')
    ) {
      code = 'SERVICE_UNAVAILABLE';
      userMessage = 'Google Gemini está experimentando alta demanda momentánea.';
      status = 'degraded';
      httpStatus = isStrict ? 503 : 200;
    } else if (
      errMsg.includes('API_KEY_INVALID') ||
      errMsg.includes('API key not valid') ||
      errMsg.includes('API_KEY_NOT_VALID')
    ) {
      code = 'INVALID_KEY';
      userMessage = 'La clave de API de Google Gemini no es válida.';
      status = 'error';
      httpStatus = isStrict ? 500 : 200;
    } else if (
      errMsg.includes('404') ||
      errMsg.includes('not found') ||
      errMsg.includes('MODEL_DEPRECATED')
    ) {
      code = 'PRIMARY_MODEL_OBSOLETE';
      userMessage = `El modelo primario '${PRIMARY_AI_MODEL}' no fue encontrado o está obsoleto.`;
      status = 'degraded';
      httpStatus = isStrict ? 503 : 200;
    }

    const fallbackBody: AiHealthResponse = {
      ok: false,
      status,
      code,
      message: userMessage,
      details: errMsg.slice(0, 300),
      primaryModel: PRIMARY_AI_MODEL,
      model: PRIMARY_AI_MODEL,
      latencyMs: Date.now() - overallStartTime,
      catalogAudit: {
        isPrimaryModelAvailable: false,
        totalModelsCount: 0,
        availableModels: [],
        alert: `Inference failed: ${errMsg.slice(0, 200)}`,
      },
      cascade: Array.from(CANONICAL_MODEL_CASCADE),
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(fallbackBody, { status: httpStatus });
  }
}

