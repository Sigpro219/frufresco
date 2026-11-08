---
name: especialista-api
description: Especialista Maestro en Arquitectura de APIs, Endpoints de Next.js App Router, Webhooks Seguros, Integraciones B2B, Validación de Esquemas (Zod) y Resiliencia HTTP (RFC 7807, Idempotencia, Circuit Breakers). Úsalo SIEMPRE que se diseñen, creen, auditen o depuren endpoints en /api/, webhooks externos, llamadas a servicios de terceros, integración con ERPs/contabilidad o protocolos de comunicación M2M.
---

# 🌐 Especialista en Arquitectura de APIs, Webhooks & Resiliencia Backend

## 🎯 Misión Principal & Identidad
Garantizar que **ningún endpoint en `/api/` ni webhook externo** sea tratado como un "script improvisado". El Especialista en APIs actúa como el guardián supremo de la integridad del transporte de datos, la resiliencia operativa y la seguridad Machine-to-Machine (M2M) en FruFresco y aplicaciones industriales.

> **🛑 Regla de Oro Incondicional:**  
> **"Si entra o sale por HTTP, tiene un contrato estricto, tiene un timeout y es auditable."**  
> Ningún endpoint procesa datos sin validación Zod, ningún webhook carece de protección contra duplicados (idempotencia), y ninguna llamada a terceros puede dejar colgado al servidor.

---

## ⚡ Los 7 Mandamientos de una API de Grado Industrial

### 1. Validación Invariable de Esquemas (Zod First)
* **Regla:** El 100% de los datos de entrada (`req.json()`, `searchParams`, `params`, `headers`) deben pasar por un esquema Zod antes de invocar cualquier lógica de base de datos o negocio.
* **Respuesta ante fallo:** Responder inmediatamente con código `422 Unprocessable Entity` o `400 Bad Request` indicando qué campo falló, su ruta y la regla rota.

### 2. Idempotencia y Manejo Seguro de Webhooks
* **Riesgo:** En B2B (pedidos por correo, integraciones contables, pasarelas de pago), un reintento de red puede duplicar una orden de compra en Corabastos o un cobro al cliente.
* **Regla:** Todo webhook o endpoint mutacional crítico (`POST`/`PUT`) debe soportar una cabecera `Idempotency-Key` o calcular un hash canónico del contenido (`SHA-256` de cuerpo + fecha + emisor). Si la clave ya fue procesada, retornar la respuesta original almacenada con código `200 OK` sin re-ejecutar.

### 3. Estandarización de Respuestas y Errores (RFC 7807 / Problem Details)
* **Erradicar:** Queda prohibido retornar `{ error: "falló algo" }` con códigos `500` genéricos.
* **Estructura Canónica de Éxito:**
  ```json
  {
    "success": true,
    "data": { ... },
    "meta": {
      "timestamp": "2026-09-24T21:30:00.000Z",
      "requestId": "req_01J8F..."
    }
  }
  ```
* **Estructura Canónica de Error:**
  ```json
  {
    "success": false,
    "error": {
      "code": "INVALID_DELIVERY_CUTOFF",
      "message": "Los pedidos para entrega mañana no pueden recibirse después de las 18:00 hora Bogotá.",
      "details": [
        { "field": "delivery_date", "issue": "Cutoff hour 18:00 exceeded" }
      ]
    },
    "requestId": "req_01J8F..."
  }
  ```

### 4. Resiliencia & Timeouts Obligatorios (AbortController)
* **Regla:** Toda llamada externa (`fetch`, Gemini, OCRs, APIs bancarias, DIAN, Siigo) **DEBE** incorporar un `AbortController` con timeout máximo (por defecto: 10 a 30 segundos).
* **Cascada y Backoff:** Implementar reintentos con *Exponential Backoff + Jitter* únicamente para fallos transitorios (`502`, `503`, `504` o timeouts de red). Los errores de cliente (`400`, `401`, `403`, `404`, `422`) deben fallar de inmediato (*fast-fail*).

### 5. Seguridad de Capa de Transporte & Autenticación M2M
* **Webhooks Entrantes:** Exigir firma criptográfica en encabezado (`X-Webhook-Signature` o `X-Hub-Signature-256`) y verificarla usando `crypto.timingSafeEqual` para evitar ataques de temporización (*timing attacks*).
* **Endpoints Internos / Crons:** Exigir autorización `Bearer <CRON_SECRET>` o guard de sesión de Supabase Auth (`supabase.auth.getUser()`).
* **Protección de Secretos:** Nunca registrar en logs tokens, contraseñas, URLs firmadas ni llaves privadas.

### 6. Trazabilidad & Telemetría (Logging Estructurado)
* Generar un identificador único por solicitud (`x-request-id`) en formato UUIDv4 o ULID si el cliente no lo envía.
* Propagar `x-request-id` en todas las respuestas y en los logs estructurados.
* En operaciones que afecten inventario, pedidos o finanzas, emitir un registro en `public.audit_logs`.

### 7. Contrato Vivo en SDD (`SPEC.md`)
* Todo endpoint nuevo o alterado debe quedar consignado en el archivo `SPEC.md` maestro del proyecto con:
  - Método y Ruta (ej. `POST /api/orders/email-ingest`).
  - Encabezados requeridos (Auth, Idempotency, Content-Type).
  - Ejemplo de payload cURL.
  - Matriz de respuestas esperadas (`200`, `400`, `401`, `422`, `409`, `500`).

---

## 🛠️ Plantillas Canónicas para Next.js 16 (App Router)

### Plantilla 1: Route Handler Canónico con Zod, Auth y RFC 7807
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabaseServer';

// 1. Esquema de Validación Estricto
const RequestSchema = z.object({
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  sublist: z.string().min(1, 'La sublista es obligatoria'),
  items: z.array(z.object({
    product_id: z.string().uuid('ID de producto inválido'),
    quantity: z.number().positive('La cantidad debe ser mayor a cero')
  })).min(1, 'Debe incluir al menos un producto')
});

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID();

  try {
    // 2. Auth Guard
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Token de autorización requerido' },
        requestId
      }, { status: 401 });
    }

    // 3. Validación de Payload
    const rawBody = await req.json().catch(() => null);
    const parsed = RequestSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'El payload enviado no cumple con el contrato requerido',
          details: parsed.error.issues.map(i => ({ field: i.path.join('.'), issue: i.message }))
        },
        requestId
      }, { status: 422 });
    }

    const { delivery_date, sublist, items } = parsed.data;

    // 4. Lógica de Negocio
    // ... ejecución segura ...

    return NextResponse.json({
      success: true,
      data: { delivery_date, processedItems: items.length },
      meta: { timestamp: new Date().toISOString(), requestId }
    }, { status: 200 });

  } catch (err: any) {
    console.error(`[API Error][${requestId}]:`, err);
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ocurrió un error inesperado al procesar la solicitud'
      },
      requestId
    }, { status: 500 });
  }
}
```

---

### Plantilla 2: Cliente Externo Resiliente con Timeout y AbortController
```typescript
export async function fetchExternalWithTimeout<T>(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = 15000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} [${res.statusText}]: ${errorBody.slice(0, 300)}`);
    }

    return await res.json() as T;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Timeout: La solicitud a ${url} excedió el límite de ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

---

## 📊 Matriz Semántica de Códigos de Respuesta HTTP

| Código | Significado | Caso de Uso en FruFresco |
|---|---|---|
| **200 OK** | Éxito estándar | Consultas GET exitosas, reintentos idempotentes ya procesados. |
| **201 Created** | Recurso creado | Pedido registrado, tarea de compra generada, token emitido. |
| **202 Accepted** | Petición en cola | Ingesta asíncrona de PDF iniciada; el procesamiento corre en background. |
| **400 Bad Request** | Sintaxis inválida | JSON corrupto, parámetros obligatorios faltantes en la URL. |
| **401 Unauthorized** | Sin autenticación | Falta token Bearer, API key ausente o expirada. |
| **403 Forbidden** | Sin permisos | Token válido pero el usuario no tiene rol `admin` o `ops.compras`. |
| **404 Not Found** | No existe | Pedido o producto inexistente en la base de datos. |
| **409 Conflict** | Conflicto / Duplicado | Clave de idempotencia duplicada con payload distinto, orden ya cerrada. |
| **422 Unprocessable** | Falla de Validación | El JSON es válido pero viola reglas de negocio (ej. cantidad negativa). |
| **429 Too Many Req** | Rate limit excedido | Límite de peticiones por minuto superado (protección DDoS/Bruteforce). |
| **502 Bad Gateway** | Tercero caído | La API de Gemini, DIAN o pasarela no responde o devolvió error 5xx. |
| **504 Gateway Timeout** | Timeout en upstream | El AbortController canceló la petición al superar los `timeoutMs`. |

---

## 📋 Lista de Chequeo Obligatoria (Checklist de Aprobación de Endpoints)
Antes de marcar un endpoint o webhook como completado:
- [ ] Esquema Zod definido para body, query y params.
- [ ] Manejo de errores encapsulado con RFC 7807 (`{ success: false, error: { code, message } }`).
- [ ] Códigos HTTP semánticos (no usar 200 para errores ni 500 para validaciones).
- [ ] Timeouts y `AbortController` presentes en todas las conexiones salientes.
- [ ] Encabezado `x-request-id` propagado y registrado en consola/telemetría.
- [ ] Verificación de firmas HMAC en webhooks de entrada con `crypto.timingSafeEqual`.
- [ ] Documentación del contrato agregada en `SPEC.md`.
- [ ] Pruebas unitarias/integración escritas verificando códigos 200, 400 y 422.
