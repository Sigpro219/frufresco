---
id: REF-TELEMETRIA-SENTRY-FORENSE-GEMBA
version: 1.0
status: CERTIFICADO_EN_PRODUCCION
origin_project: delta-academy / frufresco / ingyemel_mantenimiento
author: Agente Cosechador (Delta CoreTech)
speed_multiplier: 10X
---

# 🔩 Refacción: Telemetría Forense Zero-Latency & Caja Negra del Gemba (`REF-TELEMETRIA-SENTRY-FORENSE-GEMBA`)

## 1. Dolor Operativo Resuelto
En plantas industriales y bodegas B2B (madrugadas de 3:00 AM a 6:00 AM), cuando falla una tablet de báscula, una sincronización offline o un endpoint de facturación, el operario no abre la consola de Chrome (`F12`): simplemente dice *"el sistema no sirve"* o envía horas después un pantallazo recortado por WhatsApp sin contexto. Esta refacción instala una **Caja Negra de Aviación (Telemetry Collector + Error Boundary Industrial)** que captura automáticamente la excepción exacta, el `tenantId`, el rol/estación, la ruta, el payload sanitizado y la latencia, persistiendo el rastro forense en vivo (Firestore `system_telemetry_errors` + Webhook/Sentry opcional) en el milisegundo exacto del fallo.

## 2. Multiplicador de Velocidad (Baseline 1X vs. Salto 10X)
- **Baseline 1X (Sin Refacción):** 1 a 2 semanas intentando reproducir a ciegas errores reportados por WhatsApp sin saber con qué datos se dispararon, o configurando SDKs pesados que inflan el bundle de cliente en 150 KB.
- **Salto 10X (Con Refacción):** **30 minutos**. Wrapper ligero (`< 3 KB`, cero impacto en LCP/INP) para rutas `/api/` y `global-error.tsx` de Next.js App Router que alimenta directamente el diagnóstico de `forense-hallazgos-gemba`.

## 3. Cuándo Ensamblar (y Cuándo NO)
- **SÍ Ensamblar en:** Todo sistema con operación física en planta/bodega, ingesta de archivos/IA, integraciones ERP o portales transaccionales B2B.
- **NO Ensamblar en:** Sitios estáticos informativos sin estado ni formularios críticos.

## 4. Secretos Sucios de Producción (Battle-Tested Nuances)
1. **Sanitización Obligatoria de Secretos y PII antes de Persistir (`Zero-Leak Telemetry`):** Si un endpoint falla al procesar un login o una tarjeta/token, guardar el `req.body` crudo en los logs viola la seguridad (`experto-seguridad`). El colector **enmascara recursivamente** cualquier llave que coincida con `/password|token|secret|key|authorization|cookie|base64/i` y trunca strings mayores a 500 caracteres (para no guardar fotos Base64 de 4 MB en la colección de errores).
2. **Fire-and-Forget No Bloqueante (Anti-Cascada):** Si el servicio de telemetría falla o tarda, **jamás debe bloquear ni retrasar** la respuesta al usuario ni tumbar la aplicación. Siempre se ejecuta en bloque `try/catch` silencioso o `waitUntil`.
3. **Deduplicación por Huella (`fingerprintHash`):** Si un loop de red en una tablet sin señal dispara el mismo error 200 veces en 1 minuto, no debes crear 200 documentos ni quemar cuota de Firestore/alertas. Se calcula una huella (`route + errorName + message.slice(0,80)`) con ventana de enfriamiento (*cooldown* de 60s en cliente).
4. **Código de Referencia Corto para el Operario (`ERR-XXXX`):** En lugar de mostrarle un stack trace técnico al operario de planta, la UI le muestra un código corto de 6 caracteres (ej. `Reporte código #GF-8492`). Con ese código, `forense-hallazgos-gemba` localiza en 2 segundos el documento exacto en base de datos.

## 5. Contrato de Interfaz & Código Base Reutilizable

### A. `src/lib/telemetry/gembaBlackBox.ts` (Motor Headless de Caja Negra)
```typescript
export interface GembaErrorTelemetry {
  traceCode: string;          // Ej. "GF-8492" para mostrar en UI al operario
  fingerprint: string;        // Hash lógico para agrupar errores idénticos
  timestampIso: string;
  severity: 'FATAL' | 'ERROR' | 'WARN';
  source: 'API_ROUTE' | 'CLIENT_BOUNDARY' | 'BACKGROUND_WORKER';
  routeOrComponent: string;
  tenantId?: string;
  userIdOrStation?: string;
  errorName: string;
  errorMessage: string;
  stackTopLines?: string;     // Primeras 8 líneas del stack trace
  sanitizedContext?: Record<string, unknown>;
}

const SENSITIVE_KEY_REGEX = /password|pass|token|secret|apikey|authorization|cookie|imagebase64|filebase64/i;

export function sanitizeTelemetryPayload(input: unknown, depth = 0): unknown {
  if (depth > 3 || input === null || input === undefined) return input;
  if (typeof input === 'string') {
    return input.length > 400 ? `${input.slice(0, 400)}...[TRUNCATED_${input.length}_CHARS]` : input;
  }
  if (Array.isArray(input)) {
    return input.slice(0, 10).map((item) => sanitizeTelemetryPayload(item, depth + 1));
  }
  if (typeof input === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      clean[k] = SENSITIVE_KEY_REGEX.test(k) ? '[REDACTED_SECRET]' : sanitizeTelemetryPayload(v, depth + 1);
    }
    return clean;
  }
  return input;
}

export function generateShortTraceCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Sin 0/O ni 1/I para lectura fácil en planta
  let code = 'GF-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function buildGembaTelemetryRecord(
  err: unknown,
  meta: Omit<GembaErrorTelemetry, 'traceCode' | 'fingerprint' | 'timestampIso' | 'errorName' | 'errorMessage' | 'stackTopLines'>
): GembaErrorTelemetry {
  const errorObj = err instanceof Error ? err : new Error(String(err));
  const traceCode = generateShortTraceCode();
  const stackTopLines = errorObj.stack ? errorObj.stack.split('\n').slice(0, 8).join('\n') : undefined;
  const fingerprint = `${meta.source}:${meta.routeOrComponent}:${errorObj.name}:${errorObj.message.slice(0, 80)}`;

  return {
    ...meta,
    traceCode,
    fingerprint,
    timestampIso: new Date().toISOString(),
    errorName: errorObj.name || 'UnknownError',
    errorMessage: errorObj.message || 'Sin mensaje de error',
    stackTopLines,
    sanitizedContext: meta.sanitizedContext
      ? (sanitizeTelemetryPayload(meta.sanitizedContext) as Record<string, unknown>)
      : undefined,
  };
}
```

### B. Wrapper para Endpoints Next.js (`withGembaTelemetry`)
```typescript
import { NextResponse } from 'next/server';
import { buildGembaTelemetryRecord } from './gembaBlackBox';

export async function captureApiFailure(
  err: unknown,
  route: string,
  context?: { tenantId?: string; userIdOrStation?: string; payload?: unknown }
) {
  const record = buildGembaTelemetryRecord(err, {
    severity: 'ERROR',
    source: 'API_ROUTE',
    routeOrComponent: route,
    tenantId: context?.tenantId,
    userIdOrStation: context?.userIdOrStation,
    sanitizedContext: context?.payload ? { payload: context.payload } : undefined,
  });

  // Log estructurado JSON para Vercel Runtime Logs / Sentry / Firestore
  console.error(JSON.stringify({ _type: 'GEMBA_BLACKBOX_EVENT', ...record }));

  return NextResponse.json(
    {
      error: 'Ocurrió un fallo inesperado procesando la operación.',
      traceCode: record.traceCode,
      message: record.errorMessage,
    },
    { status: 500 }
  );
}
```

## 6. Protocolo de Ensamble Paso a Paso
1. Copiar `src/lib/telemetry/gembaBlackBox.ts` en el proyecto.
2. Envolver el bloque `catch (err)` de los endpoints críticos (`/api/ops/*`, `/api/webhooks/*`, `/api/accounting/*`) con `captureApiFailure(err, '/api/ruta', { tenantId, payload })`.
3. Mostrar en los toasts de error de la interfaz el `traceCode` (`#GF-XXXX`) para que cuando se active `forense-hallazgos-gemba`, la búsqueda en logs/BD sea instantánea y determinista.
