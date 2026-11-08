---
id: REF-AI-EVALS-GOLDEN-DATASET-HARNESS
version: 1.0
status: CERTIFICADO_EN_PRODUCCION
origin_project: delta-academy / frufresco
author: Agente Cosechador (Delta CoreTech)
speed_multiplier: 15X
---

# 🔩 Refacción: Arnés de Evaluación Sistemática de IA & Tester de Golden Datasets (`REF-AI-EVALS-GOLDEN-DATASET-HARNESS`)

## 1. Dolor Operativo Resuelto
Cuando se construye un módulo con IA (extracción de planillas manuscritas, clasificación de facturas, motores de recomendación, parsers de lenguaje natural) o un motor algorítmico complejo, modificar una sola línea del prompt o cambiar de versión de modelo (ej. `gemini-2.5-flash` a un modelo nuevo) puede arreglar un caso pero romper silenciosamente otros 10 que antes funcionaban (*Prompt Regression*). Esta refacción instala un **Banco de Pruebas Automatizado con Golden Dataset (`tests/golden/` + `scripts/run-evals.mjs`)** que corre una batería de casos reales congelados contra el motor y calcula un **Puntaje de Precisión Determinista (`Accuracy Score %`)** antes de autorizar cualquier pase a producción.

## 2. Multiplicador de Velocidad (Baseline 1X vs. Salto 15X)
- **Baseline 1X (Sin Refacción):** Horas subiendo manualmente una foto o un archivo en el navegador cada vez que se retoca un prompt o algoritmo, rezando para no haber dañado los casos anteriores.
- **Salto 15X (Con Refacción):** **15 segundos en consola** (`node scripts/run-evals.mjs`). Evalúa todos los casos del Golden Dataset en paralelo y bloquea el cambio si la precisión cae un solo punto porcentual respecto al baseline certificado.

## 3. Cuándo Ensamblar (Regla de Aplicación Universal cuando sea Posible)
Esta refacción es **OBLIGATORIA siempre que sea técnicamente posible construir un tester determinista**:
1. **Módulos con IA / LLMs / Visión Multimodal:** Extracción de remisiones manuscritas, lectura de facturas PDF/XML, reconciliación difusa de nombres de productos (`fuzzy matching`), agentes clasificadores.
2. **Motores de Reglas, Parsers y Algoritmos de Planta:** Reconciliadores de catálogo, calculadoras de merma/OEE/TEEP, exportadores contables CSV, balanceadores de línea.
- *(Única excepción donde no aplica: cambios puramente cosméticos de CSS/layout sin lógica de transformación de datos).*

## 4. Secretos Sucios de Producción (Battle-Tested Nuances)
1. **Separación en 2 Niveles (Tier 1 Offline Determinista $0 Tokens vs. Tier 2 Live LLM Eval):**
   - **Tier 1 (Corre en CADA cambio de código en $<2\text{s}$, $0 costo):** Evalúa el post-procesador, normalizador de unidades, reconciliador de alias y validador Zod alimentándolo con respuestas crudas reales pre-grabadas (*recorded fixtures*) del LLM.
   - **Tier 2 (Corre al modificar el Prompt o cambiar de Modelo IA):** Envía las imágenes/textos reales de `tests/golden/cases/` a la API de Gemini y compara la respuesta estructurada contra el `expected.json` certificado.
2. **Métricas Graduales vs. Falla Binaria Enmascarada:** En visión manuscrita o IA, no basta con saber si el JSON compiló. El arnés mide 3 indicadores separados:
   - **Schema Validity Rate (`100%` obligatorio):** ¿Cumple el contrato Zod/TypeScript sin campos `undefined`?
   - **SKU Resolution Accuracy (`>= 95%`):** ¿Mapeó el texto sucio al `canonicalProductId` correcto?
   - **Numeric Exact Match (`100%` en cantidades claras):** ¿Extrajo exactamente los kilos/unidades de la columna de despacho y no de la columna de pedido?
3. **Regla del Trinquete (*Ratchet Rule* — El Hallazgo de Gemba se vuelve Caso Golden):** Cada vez que aparezca un caso borde nuevo en producción (ej. una planilla tachada o un nombre raro de proveedor), se agrega como un caso más al archivo `golden-cases.json`. Así, el sistema **nunca puede volver a cometer dos veces el mismo error**.

## 5. Contrato de Interfaz & Código Base Reutilizable

### A. Estructura de un Caso Golden (`tests/golden/golden-cases.json`)
```json
[
  {
    "caseId": "GOLDEN-001-CALIGRAFIA-UNO-PALITO-LARGO",
    "description": "Operario escribe 15.5 KG con el 1 de trazo inicial largo que parecía un 7",
    "rawInput": {
      "rawProductName": "Tomate Chonto Primera",
      "rawUnit": "Canastilla",
      "orderedQty": 20,
      "dispatchedQty": 15.5
    },
    "expectedOutput": {
      "canonicalSku": "FRU-TOM-001",
      "canonicalUnit": "KG",
      "finalQuantity": 15.5,
      "status": "MATCHED"
    }
  },
  {
    "caseId": "GOLDEN-002-ARBITRAJE-DOBLE-COLUMNA",
    "description": "Planilla con Pedido=10 y Despacho=8.5; jamás debe sumar 18.5",
    "rawInput": {
      "rawProductName": "Cebolla Cabezona Blanca",
      "rawUnit": "Bulto",
      "orderedQty": 10,
      "dispatchedQty": 8.5
    },
    "expectedOutput": {
      "canonicalSku": "FRU-CEB-002",
      "canonicalUnit": "KG",
      "finalQuantity": 8.5,
      "status": "MATCHED"
    }
  }
]
```

### B. Ejecutor Universal de Evaluaciones (`scripts/run-evals.mjs`)
```javascript
#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

/**
 * Arnés Universal de Evaluación (Golden Dataset Tester)
 * Uso: node scripts/run-evals.mjs [--threshold=95]
 */
export async function runGoldenDatasetEval({
  datasetPath = path.resolve(process.cwd(), 'tests/golden/golden-cases.json'),
  evaluatorFn,
  minPassRatePercent = 100,
}) {
  if (!fs.existsSync(datasetPath)) {
    console.error(`❌ Golden Dataset no encontrado en: ${datasetPath}`);
    process.exit(1);
  }

  const cases = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
  let passed = 0;
  const failures = [];
  const startMs = Date.now();

  console.log(`🧪 Ejecutando Golden Dataset Harness (${cases.length} casos canónicos)...`);

  for (const testCase of cases) {
    try {
      const actual = await evaluatorFn(testCase.rawInput);
      const diffs = [];

      for (const [key, expectedVal] of Object.entries(testCase.expectedOutput)) {
        const actualVal = actual?.[key];
        if (typeof expectedVal === 'number' && typeof actualVal === 'number') {
          if (Math.abs(expectedVal - actualVal) > 0.001) {
            diffs.push(`${key}: esperado=${expectedVal}, obtenido=${actualVal}`);
          }
        } else if (actualVal !== expectedVal) {
          diffs.push(`${key}: esperado="${expectedVal}", obtenido="${actualVal}"`);
        }
      }

      if (diffs.length === 0) {
        passed++;
        console.log(`  🟢 [PASS] ${testCase.caseId}`);
      } else {
        failures.push({ caseId: testCase.caseId, description: testCase.description, diffs });
        console.error(`  🔴 [FAIL] ${testCase.caseId} -> ${diffs.join(' | ')}`);
      }
    } catch (err) {
      failures.push({
        caseId: testCase.caseId,
        description: testCase.description,
        diffs: [`Excepción en ejecución: ${err instanceof Error ? err.message : String(err)}`],
      });
      console.error(`  💥 [CRASH] ${testCase.caseId}`);
    }
  }

  const durationMs = Date.now() - startMs;
  const accuracy = cases.length > 0 ? Number(((passed / cases.length) * 100).toFixed(2)) : 0;

  console.log('\n──────────────────────────────────────────────────────────');
  console.log(`📊 RESULTADO GOLDEN EVAL: ${passed}/${cases.length} (${accuracy}%) en ${durationMs}ms`);
  console.log(`🎯 Umbral Mínimo Exigido: ${minPassRatePercent}%`);
  console.log('──────────────────────────────────────────────────────────');

  if (accuracy < minPassRatePercent) {
    console.error(`⛔ VETO DE REGRESIÓN: La precisión (${accuracy}%) cayó por debajo del umbral (${minPassRatePercent}%).`);
    process.exit(1);
  }

  console.log('✅ CERTIFICACIÓN GOLDEN DATASET SUPERADA (EXIT 0).');
}
```

## 6. Protocolo de Ensamble Paso a Paso
1. Al crear o modificar cualquier motor de IA, reconciliador, parser o calculadora de negocio, crear la carpeta `tests/golden/golden-cases.json` con al menos **5 a 10 casos reales representativos** (incluyendo casos borde sucios del Gemba).
2. Conectar el motor puro (`Headless Core`) a `scripts/run-evals.mjs`.
3. Ejecutar `node scripts/run-evals.mjs` antes de dar por cerrada la tarea; cada vez que un usuario de planta reporte un caso nuevo que falló, añadirlo como nuevo ítem en `golden-cases.json` (Efecto Trinquete).
