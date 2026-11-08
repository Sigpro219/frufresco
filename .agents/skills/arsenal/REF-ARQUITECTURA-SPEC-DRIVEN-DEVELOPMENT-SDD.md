---
id: REF-ARQUITECTURA-SPEC-DRIVEN-DEVELOPMENT-SDD
version: 1.0
estado: VIGENTE
reemplaza: null
titulo: "Arquitectura Spec-Driven Development (SDD): Metodología de Ingeniería por Contratos Canónicos, Escenarios Gherkin y Blindaje Anti-Regresiones"
categoria: "Arquitectura de Software & Metodología de Ingeniería"
tags: [spec-driven-development, sdd, gherkin, contracts, clean-architecture, zero-regressions, one-person-firm, prompt-engineering]
multiplicador_velocidad: "7X"
reduccion_errores: "95%"
proyectos_origen: [delta_academy, frufresco, secop_centinela, delta_coretech]
fecha_cosecha: "2026-09-21"
---

# 🧩 Ficha de Refacción: Arquitectura Spec-Driven Development (SDD) & Diseño por Contrato

## 🔴 1. La Pesadilla Operativa Previa (Baseline 1X — El Gemba del Programador)
* **Puesto de Trabajo & Flujo Mental:** El desarrollador/CTO se sienta frente al editor en modo *Vibe Coding* (generación impulsiva de código guiada por el chat). A medida que el proyecto escala de 3 a más de 15 módulos acoplados (logística, kioscos OEE, ingesta IA, facturación, pasarelas de pago), la memoria de contexto se fragmenta.
* **Muda Identificada (Reprocesamiento Ciego, Fricción de Alineación y Errores Ocultos):**
  1. *Reprocesamiento Ciego y Desgaste Cognitivo:* Sin una lógica previamente estructurada, el programador procesa una enorme cantidad de código disperso que no coincide entre la UI, los modelos de datos y las APIs, obligando a reescribir módulos enteros una y otra vez.
  2. *El Ocultamiento de Errores por Improvisación:* De tanto improvisar y parchar sobre la marcha, los errores sutiles de contrato (cambios de nombres de campos, tipos `null/undefined`, rutas inexistentes) quedan enterrados bajo capas de código parcheado, detonando en producción como fallos en cascada (>90% de probabilidad de regresión oculta).
  3. *Incertidumbre en la Verdad del Sistema:* Ni la IA ni el desarrollador humano tienen un ancla de verdad (*Ground Truth*); cualquier refactorización rompe componentes que ya estaban probados.
* **Velocidad Inicial:** Velocidad 1X con ciclos de desarrollo de días enteros por módulo, 60% del tiempo perdido en depuración reactiva y fatiga mental severa.

---

## 🟢 2. La Transformación Operativa (Salto Multiplicador 7X)
* **Nuevo Flujo de Trabajo (Spec First, Code Second):**
  1. **La Regla de Oro:** **SDD ES LA REINA OBLIGATORIA** para cualquier proyecto estructurado o de producción. Se suspende exclusivamente para *Spikes* (borradores efímeros y pruebas de concepto de un solo archivo).
  2. **Contrato Canónico Centralizado (`SPEC.md`):** Todo proyecto estructurado inicia redactando su `SPEC.md` maestro antes de escribir una sola línea de TypeScript o CSS.
  3. **Escenarios Gherkin Inquebrantables (`Given-When-Then`):** Cada módulo declara formalmente su comportamiento funcional con datos deterministas y casos límite.
  4. **Matriz de Tareas Atómicas `[x]`:** El roadmap se divide en pasos atómicos secuenciales y auditables.
  5. **Dogmas Operativos Inviolables:** Reglas inmutables (puertos asignados de desarrollo para evitar colisiones, clientes REST nativos sin SDKs frágiles, diseño visual de lujo).
* **Multiplicador de Negocio:** **Aceleración de 7X en velocidad de entrega**. Reducción del 95% en regresiones ocultas. Compilaciones limpias de 11/11 rutas en Next.js App Router Turbopack en menos de 2 segundos en el primer intento.

---

## 💣 3. Secretos Sucios de Producción & Antipatrones Descartados

* ❌ **Antipatrón 1 (Vibe Coding en Sistemas de Más de 3 Módulos):** Programar sin contrato genera una curva de entropía exponencial. A partir de 10 módulos, la probabilidad de romper un módulo existente al editar otro supera el 90%.
* ❌ **Antipatrón 2 (SDKs Externos Monolíticos y Frágiles):** Depender de SDKs oficiales pesados de proveedores (como `@google/genai` o librerías de IA monolíticas) causa colisiones de empaquetado y fallos de build en Next.js App Router / Turbopack. **Solución adoptada:** *Cliente REST nativo con `fetch` puro, tipos estrictos y failover automático entre modelos prioritarios (`gemini-3.7-flash` -> `3.6` -> `2.5`)*.
* ❌ **Antipatrón 3 (Documentar Después de Programar):** El código es efímero y miente; el contrato manda. La documentación post-facto siempre queda desactualizada y omite las decisiones arquitectónicas clave.
* ❌ **Antipatrón 4 (Especificaciones en Prosa Vaga):** Textos narrativos largos sin criterios de aceptación Gherkin provocan que la IA alucine estructuras de datos y nombres de endpoints.
* 💣 **El Secreto Sucio del Checkpoint Atómico:** Marcar con `[x]` cada tarea en el `SPEC.md` inmediatamente después de verificarla con el compilador de producción (`npm run build`). Si la compilación falla, el cambio se revierte de inmediato antes de avanzar a la siguiente tarea.
* 💣 **El Secreto del Aislamiento de Puertos (Dogma de Red):** Asignar puertos únicos e inmutables por proyecto en `.env.local` y `package.json` (`3001/3002` Frufresco, `3005` Ingyemel, `3008` Centinela, `3050` Academy) previene la sobreescritura de cookies y variables de sesión entre proyectos locales concurrentes.

---

## 💻 4. Solución de Software & Lego Blocks (Código Vivo Auto-Contenido)

### A. Plantilla Canónica del Contrato Maestro (`SPEC.md`)
```markdown
# [NOMBRE_DEL_SISTEMA] — ESPECIFICACIÓN TÉCNICA MAESTRA (SPEC.md)
> Versión Canónica: 1.0.0 | Estado: VIGENTE | Puerto Local: [PUERTO]

## 1. Visión & Propósito del Negocio
[Descripción concisa del problema que resuelve y el valor que entrega]

## 2. Pila Tecnológica & Convenciones
- **Framework:** Next.js 16 (App Router + Turbopack)
- **Lenguaje:** TypeScript 5 (Strict Mode, 0 'any')
- **Estilos:** Tailwind CSS (Tokens Frontier Luxury / Swiss Monograph)
- **Motor IA / Backend:** Cliente REST nativo desacoplado

## 3. Modelo de Dominio & Contratos TypeScript
\`\`\`typescript
export interface EntidadDominio {
  id: string;
  nombre: string;
  estado: "activo" | "procesando" | "completado";
  metricas: Record<string, number>;
}
\`\`\`

## 4. Módulos Operativos & Escenarios Gherkin
### Módulo N: [Nombre del Módulo]
- **Ruta UI / Endpoint:** \`/modulo-n\`, \`/api/modulo-n\`
- **Escenario Gherkin: [Nombre del Flujo Principal]**
  - *Given* que el usuario tiene el estado X inicial.
  - *When* ejecuta la acción Y con la carga útil Z.
  - *Then* el sistema produce la respuesta W y actualiza el estado a completado.

## 5. Dogmas de Operación del Claustro
1. **Dogma del Puerto [N]:** Ejecución exclusiva en el puerto asignado para evitar colisiones.
2. **Dogma "Spec First, Code Second":** Ningún cambio de código sin actualización previa de este SPEC.md.
3. **Dogma de la Cosecha Mandatoria:** Todo hito resuelto debe archivarse en el Arsenal Global.
4. **Dogma de la Refacción Viva:** Reutilizar piezas existentes del Arsenal antes de crear desde cero.

## 6. Matriz de Tareas Atómicas (Implementation Roadmap)
- [x] **Tarea 1.0:** Configuración de entorno y contrato canónico.
- [ ] **Tarea 1.1:** Implementación de modelos y Route Handlers.
- [ ] **Tarea 1.2:** Verificación de compilación limpia (npm run build).
```

---

### B. Cliente REST Nativo de IA Desacoplado con Failover Multimodelo
*(Extraído y validado en `secop_centinela` y `delta-academy` — cero dependencias externas de SDKs frágiles)*

```typescript
// src/services/geminiApi.ts
export interface GeminiPingResult {
  operational: boolean;
  model: string;
  latencyMs: number;
  error?: string;
}

const GEMINI_ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const GEMINI_MODELS_PRIORITY = ["gemini-3.7-flash", "gemini-3.6-flash", "gemini-2.5-flash"];

export function getGeminiApiKey(): string {
  return (process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "").trim();
}

export function isRealGeminiKey(key?: string): boolean {
  const k = key || getGeminiApiKey();
  return Boolean(k && !k.includes("MOCK") && (k.startsWith("AIzaSy") || k.startsWith("AQ.")));
}

/**
 * Consulta resiliente a Gemini con conmutación automática por error (failover)
 */
export async function queryGeminiREST({
  prompt,
  systemInstruction,
  files = [],
  temperature = 0.2,
  maxOutputTokens = 4096,
  thinkingBudget,
}: {
  prompt: string;
  systemInstruction: string;
  files?: Array<{ base64: string; mimeType: string }>;
  temperature?: number;
  maxOutputTokens?: number;
  thinkingBudget?: number;
}): Promise<{ reply: string; modelUsed: string }> {
  const key = getGeminiApiKey();
  if (!isRealGeminiKey(key)) {
    throw new Error("Clave de Gemini API no configurada o inválida.");
  }

  const parts: any[] = [];
  if (files.length > 0) {
    files.forEach((f) => {
      parts.push({
        inline_data: {
          mime_type: f.mimeType || "application/octet-stream",
          data: f.base64,
        },
      });
    });
  }
  parts.push({ text: prompt });

  let lastError = "Error desconocido";

  for (const model of GEMINI_MODELS_PRIORITY) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);

      const generationConfig: Record<string, any> = { temperature, maxOutputTokens };
      if (thinkingBudget && model.includes("3.7")) {
        generationConfig.thinkingConfig = { thinkingBudget };
      }

      const requestPayload: Record<string, any> = {
        contents: [{ role: "user", parts }],
        generationConfig,
      };

      if (systemInstruction) {
        requestPayload.system_instruction = { parts: [{ text: systemInstruction }] };
      }

      const response = await fetch(`${GEMINI_ENDPOINT_BASE}/${model}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(requestPayload),
      });

      clearTimeout(timeout);

      if (!response.ok) {
        lastError = `HTTP ${response.status}: ${await response.text()}`;
        continue;
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("");
      if (text) return { reply: text, modelUsed: model };
    } catch (err: any) {
      lastError = err.message || String(err);
    }
  }

  throw new Error(`Fallo en todos los modelos Gemini (${GEMINI_MODELS_PRIORITY.join(", ")}): ${lastError}`);
}
```

---

## 🔌 5. Guía de Reutilización Frankenstein & Dependencias Mínimas

* **Dónde encaja:**
  - En **TODO proyecto nuevo o refactorización estructurada** de la firma (plataformas industriales, sistemas de ruteo, motores de debriefing, dashboards OEE, plataformas GovTech/B2B).
  - No aplica para scripts desechables de una sola ejecución o pruebas de concepto aisladas (*Spikes*).
* **Dependencias Mínimas:**
  - Cero dependencias npm para la metodología (solo requiere el archivo `SPEC.md` en la raíz del repositorio).
  - `fetch` nativo de Node.js 18+ o navegadores modernos para el cliente REST de IA.
* **Comando de Verificación Continua:**
  ```bash
  # En Windows (CMD):
  cmd /c "npm run build"
  # En Linux / MacOS:
  npm run build
  ```
