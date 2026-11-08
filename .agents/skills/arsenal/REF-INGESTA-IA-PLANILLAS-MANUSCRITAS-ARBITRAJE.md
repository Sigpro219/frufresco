---
id: REF-INGESTA-IA-PLANILLAS-MANUSCRITAS-ARBITRAJE
version: 1.0
estado: VIGENTE
reemplaza: null
titulo: "Motor Multimodal de Ingesta de Planillas Físicas Manuscritas en Bodega (Cero Recálculos) y Mesa de Arbitraje Anti-Colisión contra Operaciones Digitales (OPS vs Papel)"
categoria: "Ingesta IA & UI/UX Industrial"
tags: [ocr-manuscrito, planillas-bodega, arbitraje-ops, anti-colision, unidad-directa, bicolumna-desperdicio, homologacion-fuzzy, idempotencia-kardex]
multiplicador_velocidad: "8X"
reduccion_errores: "97%"
proyectos_origen: [frufresco]
fecha_cosecha: "2026-11-06"
---

# 🧩 Ficha de Refacción: Lector IA de Planillas Físicas Manuscritas y Mesa de Arbitraje Anti-Colisión (`OPS vs Papel`)

## 🔴 1. La Pesadilla Operativa Previa (Baseline 1X - El Gemba Real)
* **Puesto de Trabajo:** En operaciones híbridas de bodega, parte de la información se registra en terminales digitales (`/ops`) y parte llega en planillas físicas escritas a mano con esfero (`Entrada/`, `Inv manual/`, formato bicolumna de `Desperdicio/Basura` y actas de `Donaciones`). El supervisor tardaba 45 minutos transcribiendo hojas manchadas con sumas manuscritas (`408 + 70`), fracciones (`15 1/2`) y apodos de plaza (`brocoly`, `zukiny`, `habichuelin`).
* **Muda Identificada:** Colisión y duplicidad contable (sumar dos veces una entrada que ya había sido pesada en `/ops/recepcion`), e inflación artificial de inventario cuando la IA intentaba multiplicar bultos o canastillas por kilos.
* **Velocidad y Tasa de Falla Inicial:** 45 minutos por lote de planillas con riesgo constante de doble asiento en el Kardex.

---

## 🟢 2. La Transformación Operativa (Salto Multiplicador 8X)
* **Nuevo Flujo de Trabajo:** El supervisor fotografía las planillas desde `PhysicalSheetIngestModal.tsx`. El motor extrae exclusivamente la cantidad en **unidad de compra directa** (cero recálculos por bultos), evalúa sumas explícitas escritas en la misma celda, homologa contra 663 SKUs del catálogo y despliega una **Mesa de Arbitraje Semafórica** comparando el papel contra el valor vivo de `OPS` antes de escribir en base de datos.
* **Multiplicador de Negocio:** **Aceleración 8X (de 45 min a menos de 3 minutos)** con 0% de colisión entre la operación digital y el respaldo en papel.

---

## 💣 3. Secretos Sucios de Producción & Antipatrones Descartados
* ❌ **Permitir que el LLM multiplique Bultos/Canastillas por Kilos en `Entrada/`:** En las planillas de muelle el operario ya anota el total en su unidad de compra (`Kg` o `Unidad`), aunque al lado escriba "2 bultos" como nota. Si el prompt permitía multiplicar, duplicaba las compras en la Columna G. **Regla de Oro:** Prohibido hacer recálculos; solo se suman expresiones explícitas con signo `+` en la misma celda (`408 + 70 = 478`).
* ❌ **Inyectar Lecturas de Papel sin Contrastar contra `OPS`:** Si un recibidor pesó $50\text{ kg}$ en `/ops/recepcion` y luego suben la foto de la planilla con los mismos $50\text{ kg}$, un `INSERT` ciego generaba $100\text{ kg}$. **Solución:** Semáforo de 3 estados (`new_entry`, `matched_ops`, `discrepancy`) y trazabilidad por `origin_source` (`'ops_system'` vs `'physical_sheet_ocr'` vs `'manual_override'`).
* ❌ **Formatos de Mermas sin Separar Avería (`Col Q`) de Cáscara (`Col R`):** Se creó un formato impreso desde Pedidos filtrado por los 109 productos susceptibles a desperdicio (`app_settings.waste_susceptible_products`) con 2 columnas manuscritas que el lector IA separa automáticamente hacia `Col Q` y `Col R`.

---

## 💻 4. Solución de Software & Lego Blocks (Código Vivo Auto-Contenido)

### Motor Headless de Parsing Manuscrito, Homologación Fuzzy y Arbitraje `OPS vs Papel`
```typescript
// src/lib/inventory/physical-sheet-parser.ts
export type PhysicalSheetType = 'entrada' | 'inv_manual' | 'desperdicio' | 'pedidos_desperdicio' | 'donaciones';
export type TargetBalanceColumn = 'G' | 'T' | 'Q' | 'R' | 'X';
export type ConciliationStatus = 'new_entry' | 'matched_ops' | 'discrepancy';
export type ArbitrationResolution = 'use_sheet' | 'keep_ops';

const CLEANING_KEYWORDS = [
  'cascara', 'cascaras', 'descapote', 'rama', 'ramas', 'hoja', 'hojas',
  'tallo', 'tallos', 'pelada', 'pelado', 'limpieza', 'arreglo', 'corona', 'capote', 'tusa', 'ameros'
];

const SYNONYM_MAP: Record<string, string> = {
  brocoly: 'brocoli', zukiny: 'zukini', zuquini: 'zukini',
  habichuelin: 'habichuela', ceboll: 'cebolla', yerbabuena: 'hierbabuena', huevos: 'cubeta huevos'
};

// 1. EVALUADOR DETERMINISTA DE CANTIDADES MANUSCRITAS (Cero recálculos de bultos; soporta "408 + 70" y "15 1/2")
export function parseHandwrittenQuantity(rawText: string | number | null | undefined): number {
  if (rawText === null || rawText === undefined) return 0;
  if (typeof rawText === 'number') return Number.isFinite(rawText) && rawText > 0 ? Math.round(rawText * 100) / 100 : 0;
  const str = String(rawText).trim();
  if (!str || /^[-—–_/\s]+$/.test(str)) return 0;
  const expr = str
    .replace(/,/g, '.')
    .replace(/(\d+)\s+1\/2\b/g, '$1.5').replace(/\b1\/2\b/g, '0.5')
    .replace(/(\d+)\s+1\/4\b/g, '$1.25').replace(/\b1\/4\b/g, '0.25')
    .replace(/(\d+)\s+3\/4\b/g, '$1.75').replace(/\b3\/4\b/g, '0.75')
    .replace(/[^0-9.+]/g, '');
  const parts = expr.split('+').map(s => parseFloat(s.trim())).filter(n => Number.isFinite(n) && n > 0);
  const numericSum = parts.length > 0 ? parts.reduce((acc, v) => acc + v, 0) : 0;
  return numericSum > 0 ? Math.round(numericSum * 100) / 100 : 0;
}

// 2. CLASIFICADOR AUTOMÁTICO BICOLUMNA: DESPERDICIO (Col Q) vs BASURA/CÁSCARA (Col R)
export function classifyWasteTargetColumn(rawProductName: string, wasteTypeHint?: 'damage' | 'cleaning' | null): 'Q' | 'R' {
  if (wasteTypeHint === 'cleaning') return 'R';
  if (wasteTypeHint === 'damage') return 'Q';
  const normalized = rawProductName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const tokens = normalized.split(/\s+/);
  return CLEANING_KEYWORDS.some(kw => tokens.includes(kw) || normalized.includes(kw)) ? 'R' : 'Q';
}

// 3. MESA DE ARBITRAJE Y SEMÁFORO DE CONTRASTE CONTRA VALORES VIVOS DE OPS
export function evaluateOpsConciliationStatus(opsCurrentVal: number, sheetQty: number): ConciliationStatus {
  if (opsCurrentVal <= 0.001) return 'new_entry';               // Caso 2.1: Celda vacía en OPS -> Poblar limpio
  if (Math.abs(opsCurrentVal - sheetQty) <= 0.05) return 'matched_ops'; // Caso 2.2: Coincide con OPS -> No duplicar
  return 'discrepancy';                                         // Caso 2.3: Discrepancia -> Exigir decisión humana
}
```

---

## 🔌 5. Guía de Reutilización Frankenstein & Dependencias Mínimas
* **Dónde encaja:** Cualquier planta industrial, bodega logística o centro de acopio en transición digital donde convivan terminales móviles con planillas de papel en muelles húmedos o sin cobertura temporal.
* **Esquema de Base de Datos Necesario:**
  - `inventory_movements` con columna o metadato de linaje `origin_source` (`'ops_system' | 'physical_sheet_ocr' | 'manual_override'`).
  - `app_settings` (`key = 'waste_susceptible_products'`) para gobernar sin migraciones SQL la lista de SKUs susceptibles a merma.
* **Dependencias Mínimas:** API REST de Gemini (`gemini-2.5-flash` / `gemini-3.8-flash`), React 19, `@supabase/supabase-js`.
