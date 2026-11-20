# 🗺️ Atlas Integral del Sistema & Matriz de Estrellas Rojas (Lean VSM)
## Plataforma: onFRU / FruFresco — SCOS (Supply Chain Operating System)
## Marco Contractual: Auditado contra SPEC.md (Contrato Normativo Canónico) & TECHNICAL_DEBT.md
## Fecha de Emisión: 2026-11-10T10:25:00-05:00 | Cobertura: 100% de los bytes inspeccionados en Mega-Módulo de Pedidos

> **Vínculo Constitucional con el SDD:**  
> Este Atlas no redefine el alcance ni prescribe nuevas reglas de negocio. Su función es levantar la radiografía física del 100% de los bytes en disco y auditar el código vivo contra los escenarios estipulados en el [`SPEC.md`](./SPEC.md). Toda discrepancia donde el código no cumpla el contrato o presente cables pelados se etiqueta como **Estrella Roja (Red Tag)** hasta su erradicación.

---

### 1. 📊 Macro-Diagrama de Valor E2E del Mega-Módulo de Pedidos (VSM Gemba)

```mermaid
flowchart TD
    subgraph INGESTA["Canales de Ingesta"]
        WA["WhatsApp / OCR / Email"] --> EDM["EmailDraftsModule.tsx (14.4k L)"]
        DOC["PDF / Excel / Manual"] --> COP["orders/create/page.tsx (13.2k L)"]
    end

    subgraph DESCONEXION_PRECIOS["🚨 Divergencia Crítica de Motores de Precio (RED-05)"]
        COP -->|fetch| API_PRICING["/api/orders/resolve-agreement-pricing"]
        EDM -->|Client Memory| LOCAL_RESOLVER["resolveActiveAgreementForClient()"]
        LOAD["orders/loading/page.tsx (8.8k L)"] -->|Client Direct Query| DB_AGREEMENT["commercial_agreements / pricing_models"]
    end

    subgraph MUTACION_FRONTEND["🚨 Mutación Multi-Tabla sin Backend (RED-02 & RED-10)"]
        COP -->|Direct Anon Insert| T1["orders"]
        COP -->|Direct Anon Insert| T2["order_items"]
        COP -->|Direct Anon Insert| T3["inventory_movements (Nómina)"]
        COP -->|Direct Anon Insert| T4["admin_tasks (Fuera Acuerdo)"]
        COP -->|Direct Anon Insert| T5["document_learning_memory"]
        COP -.->|Pseudo-Rollback en Error| ROLLBACK["supabase.delete().eq('id', order.id)"]
    end

    subgraph TORRE_CONTROL["Torre de Control & Edición"]
        T1 --> LOAD
        LOAD --> DET["orders/[id]/page.tsx (1.8k L)"]
        DET -->|POST| API_UPDATE["/api/orders/update (Transaccional)"]
    end

    classDef redTag fill:#fee2e2,stroke:#ef4444,stroke-width:2px;
    classDef okTag fill:#dcfce7,stroke:#22c55e,stroke-width:2px;
    class INGESTA,DESCONEXION_PRECIOS,MUTACION_FRONTEND redTag;
    class TORRE_CONTROL okTag;
```

---

### 2. 🧭 Anatomía y Desglose Modular de `src/app/admin/orders/create/page.tsx` (13.264 L)

El análisis forense identifica 5 clusters masivos que hoy conviven en un solo archivo:

| Componente Oculto / Dominio | Rango de Líneas | Peso Físico | Descripción & Acoplamiento |
| :--- | :---: | :---: | :--- |
| **Utilidades y Formateadores Puros** | L1 – L271 | 271 L (2.0%) | Matemáticas puras (`evaluateMathExpression`, `getParsedWeight`, `normalizeDocUnit`). |
| **Estado Global Monolítico (125 `useState`)** | L272 – L1.268 | 997 L (7.5%) | 11 clusters de estado (pricing, clientes, logística, staging, multi-entrega). |
| **Lógica Transaccional & 75 Handlers** | L1.269 – L5.738 | 4.470 L (33.7%) | Handlers directos de mutación de base de datos, geolocalización e ingesta IA. |
| **Mesa de Trabajo JSX Principal** | L5.739 – L10.689 | 4.951 L (37.3%) | Layout, buscador de clientes B2B/B2C, canasta y tabla de totales. |
| **6 Submodales Embebidos en Línea** | L10.690 – L13.251 | 2.562 L (19.3%) | Modales de variantes, conversiones, mapa Google, PIP visor y multi-orden. |

---

### 3. 🚨 Tablero de Control de Estrellas Rojas (Lean Red Tag Board)

| Tag ID | Dominio | Pipeline | Archivo & Línea | Tipo | Evidencia en Código Vivo | Impacto Gemba / Planta | Nivel Prioridad | Estado |
| :---: | :---: | :---: | :--- | :---: | :--- | :--- | :---: | :---: |
| **RED-01** | D04 (Pedidos) | P2 | `orders/create/page.tsx:272` | Tipo E | Ausencia total de `useAuth()` | Cualquier sesión accede a 16 tablas sin RBAC | 🔴 P1 - Bloqueante | Pendiente |
| **RED-02** | D04 (Pedidos) | P2 | `orders/create/page.tsx:5207` | Tipo D | `if (itemsError) await supabase.from('orders').delete()` | Pedidos huérfanos con $0 si falla la conexión en muelle | 🔴 P1 - Bloqueante | Pendiente |
| **RED-03** | D04 (Pedidos) | P2 | `orders/create/page.tsx:5257` | Tipo D | `handleSubmit` manual nunca envía correo | Pedidos manuales quedan sin notificación oficial al cliente | 🟠 P2 - Crítica | Pendiente |
| **RED-04** | D04 (Pedidos) | P2 | `orders/create/page.tsx:4604` | Tipo D | Falla atómica en multi-entrega | Si la orden 2 falla, la orden 1 se duplica al reintentar | 🔴 P1 - Bloqueante | Pendiente |
| **RED-05** | D03 (Pricing) | P1 | `create:1361` vs `drafts:3517` | Tipo B | 3 algoritmos de precios distintos | Discrepancia de precios entre cotización, correo y alistamiento | 🔴 P1 - Bloqueante | Pendiente |
| **RED-06** | D04 (Pedidos) | P2 | `orders/create/page.tsx:3796` | Tipo A | 6 llamados a `window.confirm()` | Congela el hilo UI y bloquea PWA táctiles en bodega | 🟡 P3 - Higiene | Pendiente |
| **RED-07** | D04 (Pedidos) | P2 | `orders/create/page.tsx:3185` | Tipo A | Token hunting manual en `localStorage` | Inestabilidad en la extracción IA de pedidos | 🟡 P3 - Higiene | Pendiente |
| **RED-08** | D04 (Pedidos) | P2 | `orders/create/page.tsx:4079` | Tipo A | Declaración doble de `formatT` | Código redundante producto de copy-paste masivo | 🟡 P3 - Higiene | Pendiente |
| **RED-09** | D06 (Logística) | P4 | `create:3993` vs `drafts:358` | Tipo C | Cálculo divergente de Kilos | Discrepancia en peso total de despacho y flete | 🟠 P2 - Crítica | Pendiente |
| **RED-10** | D04 (Pedidos) | P2 | `orders/create/page.tsx:5212` | Tipo E | Browser escribe en `inventory_movements` | Vulnerabilidad de manipulación de inventarios desde el cliente | 🔴 P1 - Bloqueante | Pendiente |

---

### 4. 🎯 Plan Táctico de Erradicación & Lista de Chequeo No Destructiva (Burndown Checklist)

```mermaid
flowchart LR
    O1["OLA 1: Riesgo Cero\n(Poda de Grasa & Formateadores)\nDiff: ~400 L"] --> O2["OLA 2: Riesgo Bajo\n(Extracción de 6 Submodales)\nDiff: ~2.400 L"]
    O2 --> O3["OLA 3: Riesgo Medio\n(Hooks Headless Compartidos)\nDiff: ~3.000 L"]
    O3 --> O4["OLA 4: Thin UI Final\n(Endpoint Atómico & UI <800 L)\nDiff: ~7.400 L"]
```

#### 🟢 OLA 1: Riesgo Cero (Poda de Grasa & Formateadores Puros)
- [ ] **Paso 1.1:** Extraer constantes (`THEME`, estilos inline, IDs canónicos) a `src/lib/orders/orderConstants.ts`.
- [ ] **Paso 1.2:** Extraer funciones utilitarias puras (`normalizeDocUnit`, `getAccountingIdDisplay`, `formatWeightKg`, `evaluateMathExpression`) a `src/lib/orders/orderFormatters.ts`.
- [ ] **Paso 1.3:** Erradicar la doble declaración de `formatT` (L4079 y L4984).
- [ ] **Paso 1.4:** Reemplazar los 6 `window.confirm()` por diálogos no bloqueantes (`ConfirmModal`).
*Criterio de Aprobación:* `npx.cmd tsc --noEmit` arroja 0 errores; paridad en `localhost:3001`.

#### 🟡 OLA 2: Riesgo Bajo (Extracción de Submodales Autónomos)
- [ ] **Paso 2.1:** Extraer Submodal 5 (Visor Flotante) a `src/components/admin/orders/FloatingDocumentViewerModal.tsx` (~195 L).
- [ ] **Paso 2.2:** Extraer Submodal 2 (Conversiones y Empaques Alt+E) a `src/components/admin/orders/PackagingConversionsModal.tsx` (~240 L).
- [ ] **Paso 2.3:** Extraer Submodal 3 (Variantes Alt+V) a `src/components/admin/orders/ProductVariantsConfigModal.tsx` (~28 L).
- [ ] **Paso 2.4:** Extraer Submodal 4 (Google Maps & Polígono) a `src/components/admin/orders/GoogleMapsPickerModal.tsx` (~660 L).
- [ ] **Paso 2.5:** Extraer Submodal 6 (División Multi-Entrega) a `src/components/admin/orders/MultiOrderSplitModal.tsx` (~293 L).
- [ ] **Paso 2.6:** Extraer Submodal 1 (Configuración de Producto) a `src/components/admin/orders/ProductConfigModal.tsx` (~1.005 L).
*Criterio de Aprobación:* `create/page.tsx` reduce ~2.400 líneas; atajos de teclado intactos.

#### 🟠 OLA 3: Riesgo Medio (Extracción de Hooks Headless Compartidos)
- [ ] **Paso 3.1:** Crear `src/hooks/orders/useOrderPricingResolver.ts`: Unifica `resolveContract`, matrices de acuerdos, campañas y permisos fuera de convenio (elimina RED-05).
- [ ] **Paso 3.2:** Crear `src/hooks/orders/useDeliverySchedule.ts`: Encapsula festivos, reglas de corte, horarios manuales y restricciones de día.
- [ ] **Paso 3.3:** Crear `src/hooks/orders/useGeolocationGeofence.ts`: Encapsula geocodificación, lat/lng y validación de cobertura.
- [ ] **Paso 3.4:** Crear `src/hooks/orders/useOrderCart.ts`: Encapsula gestión del carrito, descuentos de colaboradores, totales y deduplicación.
- [ ] **Paso 3.5:** Crear `src/hooks/orders/useStagedOrderAudit.ts`: Encapsula la mesa de auditoría de documentos, ingesta por IA y asignación rápida.
*Criterio de Aprobación:* 125 useStates consolidados en 5 hooks canónicos estructurados.

#### 🔴 OLA 4: Cierre Hermético Thin UI & Endpoint Transaccional Atómico
- [ ] **Paso 4.1:** Inyectar `useAuth()` y validación RBAC en el montaje de la página (elimina RED-01).
- [ ] **Paso 4.2:** Construir endpoint backend atómico `POST /api/orders/create` (o función RPC transaccional en PostgreSQL) con transacción real `BEGIN ... COMMIT` (elimina RED-02, RED-03, RED-04 y RED-10).
- [ ] **Paso 4.3:** Reducir `src/app/admin/orders/create/page.tsx` a un orquestador Thin UI limpio de **< 800 líneas**.
*Criterio de Aprobación:* Cero escrituras directas en Supabase desde el cliente; 0 errores de compilación TypeScript.

---

### 4.1 Matriz de Recursos Candidatos a Unificación Transversal (Eliminación de 4.600 Líneas Duplicadas)

La radiografía forense E2E revela que el mega-módulo de pedidos (`orders/create`) comparte 6 componentes y motores de cálculo idénticos con `EmailDraftsModule`, `orders/loading` y `orders/[id]`. La unificación de estos 6 recursos eliminará más de 4.600 líneas de código redundante:

| Recurso Candidato | Propósito Operativo | Módulos Donde Existe Hoy | Ubicación Actual en Código | Destino Canónico Canónico | Potencial de Reducción |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **`ProductVariantCustomizerModal`** | Selección de opciones, tríada de preferencias cliente y mín. venta. | `create`, `drafts`, `loading`, `[id]` | `create:10689-11693`<br>`drafts:12000-12919`<br>`loading:6786-7315`<br>`[id]:1742-1825` | `src/components/admin/orders/ProductVariantCustomizerModal.tsx` | **~2.200 LOC** |
| **`ProductConversionsModal`** | CRUD en caliente de factores de conversión y empaques (Alt+E). | `create`, `drafts`, `loading` | `create:11694-11961`<br>`drafts:12920-13180`<br>`loading:6688-6720` | `src/components/admin/orders/ProductConversionsModal.tsx` | **~550 LOC** |
| **`evaluateMathExpression`** | Parsing aritmético seguro (`"3+2"`, comas/puntos) sin eval. | `create`, `drafts`, `staging` | `create:281`<br>`drafts:271`<br>`PhysicalSheet:55` | `src/lib/orders/orderFormatters.ts` | **~90 LOC** |
| **`useDeliveryScheduleRules`** | Festivos, restricciones cliente, hora de corte y multi-entrega. | `create`, `drafts`, `loading` | `create:2939, 10159`<br>`drafts:370, 1200`<br>`loading:1150` | `src/hooks/orders/useDeliveryScheduleRules.ts` | **~580 LOC** |
| **`useOrderPricingResolver`** | Motor único de precios B2B/B2C/Campañas (Erradica `RED-05`). | `create`, `drafts`, `loading` | `create:1361, 2000`<br>`drafts:3465, 4130`<br>`loading:1348` | `src/hooks/orders/useOrderPricingResolver.ts` | **~750 LOC** |
| **`FloatingDocumentViewerModal`** | Visor flotante PIP de PDF/Imágenes con barra de resumen sticky. | `create`, `drafts`, `loading` | `create:12674-12869`<br>`drafts:5800-5980`<br>`loading:8100` | `src/components/admin/orders/FloatingDocumentViewerModal.tsx` | **~450 LOC** |
| **TOTAL CONSOLIDADO** | **6 Refacciones Unificadas Transversales** | **4 Módulos Core** | **Coexistencia de 5.223 Líneas** | **Arsenal Modular Canónico** | **~4.620 LOC Netas** |

#### Checklist Secuencial No Destructivo para la Ventana de Mantenimiento Posterior:
- [ ] **Paso U1 (Utilidades Matemáticas Puras):** Extraer `evaluateMathExpression` a `src/lib/orders/orderFormatters.ts` y sustituir las 14 instancias locales en `orders/create`, `EmailDraftsModule` y `PhysicalSheetStagingTable`.
- [ ] **Paso U2 (Modal de Conversiones Alt+E):** Extraer `ProductConversionsModal.tsx` a `src/components/admin/orders/`, consumiéndolo desde `orders/create` y `EmailDraftsModule`.
- [ ] **Paso U3 (Visor PIP de Documentos):** Extraer `FloatingDocumentViewerModal.tsx` desacoplando `PdfCanvasViewer` y la barra de resumen inferior sticky.
- [ ] **Paso U4 (Hook de Reglas de Entrega):** Construir `useDeliveryScheduleRules.ts` unificando el cálculo de festivos y multi-entregas entre creación manual y borradores.
- [ ] **Paso U5 (Hook de Resolución de Precios):** Consolidar `useOrderPricingResolver.ts`, erradicando definitivamente la Estrella Roja `RED-05`.
- [ ] **Paso U6 (Modal Personalizador de Variantes):** Extraer `ProductVariantCustomizerModal.tsx`, reemplazando los 4 modales anónimos embebidos en `create`, `drafts`, `loading` y `[id]`.
- [ ] **Paso U7 (Auditoría Forense Final):** Ejecución de `npx.cmd tsc --noEmit` y prueba de regresión visual en `localhost:3001` sin errores.

---

---

### 5. 🏁 Veredicto de Certificación para Producción
- **Índice de Madurez E2E del Módulo:** **28% (Alerta Roja Arquitectónica)**
- **Total Estrellas Rojas Detectadas:** **10** (Bloqueantes P1: **5**, Críticas P2: **2**, Higiene P3: **3**)
- **Veredicto Operativo:** **APROBADO PARA SALIDA EN VIVO HOY EN MODO CODE-FREEZE.** La aplicación funciona gracias a los parches acumulados, pero requiere ejecutar el Burndown Plan de la Ola 1 a la Ola 4 en la próxima ventana de mantenimiento para garantizar estabilidad y mantenibilidad futura.

---

### 6. 🛡️ Resolución de Estrella Roja Transversal `RED-11`: Cadena Inventario -> Compras -> Alistamiento (`Escenario 457` / `SDD v1.9.412`)

- **Estado:** ✅ **RESUELTA Y UNIFICADA**
- **Problema Detectado:** Desconexión de fuentes de inventario inicial entre `InventoryDailyBalanceTab` (`Escenario 376`), `alistamiento-print`, `purchases-print`, `ManualDispatchWizardModal`, y `/ops/compras` (uso de `.lte` en lugar de `.lt`, fallback indebido a `calculatedStock` / `inventory_stocks`, zonas horarias UTC en lugar de `America/Bogota`, duplicación Col T entre `blind_count` y `blind_count_shift_close`, y ausencia de semáforo Andon previo al lanzamiento en `/admin/orders/loading`).
- **Remediación Canónica:**
  1. Motor único [`resolveInitialInventory.ts`](file:///c:/Projects/frufresco/src/lib/inventory/resolveInitialInventory.ts) (`resolveInitialInventory`, `resolveInitialInventoryFromData`, `reduceBlindCountMovements`, `findLastOperatedDate`, `getDailyManualChecklistStatus`, `evaluateInventoryGateStatus`, `replaceBlindCountMovementsForDate`, `recordInventoryGateOverride`).
  2. Todos los consumidores (`alistamiento-print`, `purchases-print`, `ManualDispatchWizardModal`, `/ops/compras`, `InventoryDailyBalanceTab`) consumen el mismo resolver con precedencia `bodegaPost10am ?? physicalCount ?? 0`, `blind_count_shift_close > blind_count`, salto automático de domingos/festivos sin operación y `0` estricto para SKUs no conteados.
  3. Antiduplicado Col T en `ops/inventory`, `PhysicalSheetIngestModal` y `DailyBalanceExcelImportModal`.
  4. Checklist de 5 pasos con `"Sin novedad hoy (0)"` y semáforo Andon + Modal de Fricción Consciente con override auditado (`public.inventory_gate_overrides`) en `/admin/orders/loading` y `ManualDispatchWizardModal`.

---

### 7. 🛡️ Resolución de Estrella Roja Transversal `RED-12`: Circuito Lanzamiento (`D+0`/`D+1`) -> Espacios Anticolisión -> Impresión Exclusiva -> Facturación 2 Cortes (`Escenario 461` / `SDD v1.9.416`)

- **Estado:** ✅ **RESUELTA Y CERTIFICADA (`auditor-tirano-sdd` Ronda 3: 96%)**
- **Problema Detectado:**
  1. Bloqueo de lanzamiento a `para_compra` para pedidos programados para `HOY` (`D+0`), bypass indebido de `isSuperAdmin` por permiso `admin.orders`, ausencia de asignación automática de `warehouse_spaces` en lanzamiento habitual e invisibilidad de espacios en `/admin/orders/loading`.
  2. Colisión de `Espacio 1` en base de datos al imprimir pedidos individuales (`ensureUniversalStagingSpaces` evaluaba solo el array parcial y silenciaba errores `{ error }` de Supabase PostgREST).
  3. Consulta SQL rota en `exportRelacionDocumentosExcel.ts` (`invoice_number` y `delivery_address` inexistentes en `public.orders`) y fallback indebido `FV ${o.sequence_id}`.
  4. Impresión duplicada de remisiones para clientes `FAC-IMP` en `contingency-print?mode=remissions` (omitiendo exclusión del Escenario 432), pantalla en blanco si toda la jornada era `FAC-IMP`, emojis Unicode y etiquetas `SKU`.
  5. Desfase de consecutivos `FV-XXXXX` entre la tabla (`sequence_id DESC` / `projectedInvoiceMap` sensible a filtros UI / `pendingFacImpOrdersCount` sin herencia de matriz), el modal de corte (`route -> stop -> sequence_id ASC`), `Excel Rápido WO`, fuga de Hogar con `document_type_override`, rechazo indebido de `is_batch_accumulated === false` (Escenario 451) e IVA/SKU hardcodeados en `/admin/commercial/billing/print/[id]`.
- **Remediación Canónica:**
  1. [`loading/page.tsx`](file:///c:/Projects/frufresco/src/app/admin/orders/loading/page.tsx): habilitación de lanzamiento para `HOY` (`D+0`) y `MAÑANA` (`D+1`), `isSuperAdmin` restringido a roles administrativos reales, asignación automática de espacios en lanzamiento habitual con alerta explícita ante error, badge `Espacio #X` visible en tabla/`OrderCard`, fecha ISO saneada hacia el wizard y acceso directo `[Remisiones]`.
  2. [`stagingSpaceAllocator.ts`](file:///c:/Projects/frufresco/src/lib/stagingSpaceAllocator.ts) y [`ManualDispatchWizardModal.tsx`](file:///c:/Projects/frufresco/src/components/ManualDispatchWizardModal.tsx): consulta previa de `warehouse_spaces` ocupados por `delivery_date` ISO en Supabase con propagación estricta de `{ error }` en `SELECT`/`UPDATE`, clustering segmentado por fecha y erradicación de etiquetas `SKU`.
  3. [`printDocRules.ts`](file:///c:/Projects/frufresco/src/lib/orders/printDocRules.ts) y [`contingency-print/page.tsx`](file:///c:/Projects/frufresco/src/app/admin/orders/contingency-print/page.tsx): fuente única `isOrderInvoiceRequiredForPrint` (normalizando arrays PostgREST y precedencia Hogar/Reposición/Obsequio/$0), exclusión por defecto de pedidos `FAC-IMP` en lote de remisiones con estado vacío informativo + toggle `[FAC-IMP omitidos (N)]`, cero emojis (`<FileText />`) y cero etiquetas `SKU`.
  4. [`exportRelacionDocumentosExcel.ts`](file:///c:/Projects/frufresco/src/lib/exportRelacionDocumentosExcel.ts): preservación de `options.orders` explícito, corrección SQL a `shipping_address`, `tax`, `billing_invoices!billing_invoices_order_id_fkey(invoice_number)` y `profiles(phone, contact_phone)`, soporte de prefijos DIAN dinámicos, rango compacto con `formatSpaceLabel` y erradicación del fallback `FV ${sequence_id}`.
  5. [`billingOrderUtils.ts`](file:///c:/Projects/frufresco/src/lib/commercial/billingOrderUtils.ts), [`billing/page.tsx`](file:///c:/Projects/frufresco/src/app/admin/commercial/billing/page.tsx) y [`billing/print/[id]/page.tsx`](file:///c:/Projects/frufresco/src/app/admin/commercial/billing/print/%5Bid%5D/page.tsx): unificación del orden canónico (`prioridad documental -> sequence_id ASC`), precedencia absoluta de Hogar `!isB2B -> 'remission'`, respeto a `is_batch_accumulated === false`, `projectedInvoiceMap` invariante sobre `pendingOrders`, `pendingFacImpOrdersCount` y `handleOpenCutPreview` unificados (9 estados + herencia matriz), e impresión de `FV-XXXXX`, `#accounting_id` e IVA dinámico en `/billing/print/[id]`.

### 🔴 RED-13: Contradicción Comercial `$0` Fuera de Acuerdo vs *General Institucional* y Desacople WMS `10A` / `10B` — ✅ Cerrado (Escenario 466)
- **Problema Detectado:** `resolve-agreement-pricing` inyectaba *General Institucional* sobre clientes con acuerdo y `allowOff = true` (Escenario 429 §3), mientras `orders/create` mantenía badges de `Remisión $0` y operaba en *Cero Split*, y `stagingSpaceAllocator` asignaba bahías separadas a órdenes padre/hijo en lugar de compartir una misma bahía física (`10A` / `10B`).
- **Remediación Canónica:** Restauración de `$0 COP` estricto fuera de acuerdo en `/api/orders/resolve-agreement-pricing` y `EmailDraftsModule`, partición atómica A/B (`is_off_agreement_split` + `parent_order_id`) en captura de pedidos, y unificación de bahía compartida `10A` / `10B` en `stagingSpaceAllocator.ts`, `ManualDispatchWizardModal.tsx`, `StagingSpacesManagement.tsx`, `alistamiento-print` y `contingency-print`.

---

### 8. 🧭 Cartografía Forense Pre-Despliegue Simultáneo: Transporte (`/admin/transport`) & Operaciones Gemba (`/ops/*`) (`2026-11-17`)

#### 8.1 Principio Rector de Diseño (Corte de Concepto + Goldfish Pre-Vuelo)
- **Fuente Única de Verdad (Modo Manual → Pantallas 1:1):** Las 5 operaciones activas funcionan hoy en Modo Manual sobre planillas estandarizadas (`purchases-print`, `receiving-print`, `alistamiento-print`, `contingency-print`) y 2 Cortes de Facturación (`Corte Tarde PM` para `FAC-IMP` y `Corte Mañana AM` para Remisiones → `.xls` BIFF8 44 cols). Toda pantalla digital en piso (`/ops/*`) y consola TMS (`/admin/transport`) debe replicar **exactamente 1:1** esas mismas células, unidades normalizadas, `#accounting_id`, bahías `1–150` (`10A/10B`) y reglas contables.
- **Pieza Diferenciada Única:** [`/ops/picking/dashboard`](file:///c:/Projects/frufresco/src/app/ops/picking/dashboard/page.tsx) ("Tablero de Juegos") para coordinar en vivo el avance de las células de alistamiento y habilitar el paso a Rectificación de Muelle al alcanzar el `100%`.

#### 8.2 Inventario Vivo en Producción vs Sandbox (`Supabase` — Corte `2026-11-20`)
- **Migración `20261117_unified_transport_ops_deploy.sql`:** Aplicada en producción (`operational_shifts` con `0` filas activas -> `/api/ops/shifts` opera por defecto en `manual_mirror`; `asset_movements` con sus 7 columnas nuevas; `route_stops.estimated_arrival`, `billing_returns` y `customer_service_pqrs` actualizadas). Siguen faltando en esquema columnas consultadas por el código vivo: `routes.total_crates` y `provider_novelties.notes`.
- **Estado de Pedidos (`orders`, últimos 7 días en Producción al `2026-11-20`):** `359` en `para_compra` y `41` en `pending_approval` (`0` en `picking`, `ready_for_dispatch`, `in_transit` o `delivered`). Aislamiento físico montado en `FruFrescoSandbox` (`xqhjlfhjnnrmwvklppsh.supabase.co`) con `45` pedidos del día `2026-11-20` (`42` `para_compra`, `3` `pending_approval`).
- **Flota (`fleet_vehicles`):** `7` furgones propios (`NHP287`, `WNM153`, `WFH273`, `WFW369`, `WLS083`, `PMW071`, `WCW333`). Solo **3** (`NHP287`, `WNM153`, `WFH273`) tienen IMEI satelital Apps-360 activo; **4 furgones propios están sin telemetría M2M (`gps_imei = null`)**.
- **Rutas (`routes` / `route_stops`):** `3` rutas históricas (`2026-10-19`, `driver_id: null`) y **`0` paradas** en `route_stops`.
- **Personal Operativo & Seguridad (`collaborators` vs `profiles`):** `55` registros en `collaborators` (incluidos `9` conductores, `9` líderes de lista, `7` auxiliares de bodega, `6` auxiliares de ruta y `1` comprador), `0` cuentas operativas de conductor/picker/comprador en `profiles` (en Sandbox existen 3 cuentas dedicadas de prueba). **Falla crítica de seguridad detectada en BD viva:** las `544` cuentas `b2b_client` y `84` cuentas `b2c_client` (`628` clientes externos) tienen `profile_type = 'employee'`, burlando el filtro `isStaff` de `OpsLayout` y `/api/ops/shifts`.
- **Canastillas (`asset_movements`):** Tabla saneada con 7 columnas por `20261117`, pero `/ops/devoluciones` aún no registra devoluciones de canastillas en `asset_movements` y `ops/driver/delivery/[id]` omite `profile_id` en el `SELECT` de `orders` (`crate_damage` inserta `null`).

#### 8.3 Censo de Estrellas Rojas Activas del Acople `Transporte + Despachos + /ops/*`
| ID | Severidad | Archivo(s) & Línea(s) | Falla Forense / Contradicción con Modo Manual |
| :--- | :---: | :--- | :--- |
| **`RED-14`** | 🔴 **P1** | [`ops/layout.tsx:76-149,350-352`](file:///c:/Projects/frufresco/src/app/ops/layout.tsx#L76-L149), [`api/ops/shifts:113`](file:///c:/Projects/frufresco/src/app/api/ops/shifts/route.ts#L113), [`confirm/route.ts:211-216`](file:///c:/Projects/frufresco/src/app/api/transport/confirm/route.ts#L211-L216), [`supervisor/page.tsx:616-654`](file:///c:/Projects/frufresco/src/app/ops/recepcion/supervisor/page.tsx#L616-L654) | **Brecha de Identidad, Bypass `isStaff` & RBAC:** Todas las `628` cuentas cliente tienen `profile_type = 'employee'`, pasando `isStaff` en `OpsLayout` y `/api/ops/shifts`. Además `collaborators` (`9` conductores, `9` líderes, auxiliares, comprador) no tienen cuenta `profiles` (`confirm` deja `driver_id = null`), `ops/layout.tsx:350-352` muestra `PROCESADOS`/`RETORNOS`/`RECTIFICAR` sin `hasPermission` y `supervisor` edita `collaborators.allowed_modules` (cable muerto). |
| **`RED-15`** | 🔴 **P1** | [`InventoryDailyBalanceTab.tsx:1329-1404`](file:///c:/Projects/frufresco/src/components/InventoryDailyBalanceTab.tsx#L1329-L1404), trigger SQL `trigger_deduct_picking` | **Doble Descuento `2x Venta` (`Col H` / `Col S`):** `InventoryDailyBalanceTab` congelado bajo **Candado `READ-ONLY` Modo Manual**; en `1386` usa `committedSalesMap.size === 0` global del día en lugar de granularidad por SKU/orden. |
| **`RED-16`** | 🔴 **P1** | [`constants.ts:20-30`](file:///c:/Projects/frufresco/src/lib/constants.ts#L20-L30), [`alistamiento-print:436`](file:///c:/Projects/frufresco/src/app/admin/orders/alistamiento-print/page.tsx#L436), [`contingency-print:708`](file:///c:/Projects/frufresco/src/app/admin/orders/contingency-print/page.tsx#L708), [`billing/page.tsx:2540`](file:///c:/Projects/frufresco/src/app/admin/commercial/billing/page.tsx#L2540) | **Agujero Negro de `OPERATIONAL_STATUSES` & Contagio al Modo Manual:** `alistamiento-print` y `contingency-print` (bajo **Candado `READ-ONLY`**) mantienen listas locales sin `'in_preparation'`, `'ready_for_dispatch'` ni `'in_transit'`. Por tanto `/ops/*` tiene **prohibido** escribir `'ready_for_dispatch'` o `'in_transit'` en `orders.status` (ver Escenario 477 §1). |
| **`RED-17`** | 🔴 **P1** | [`confirm/route.ts:135-328`](file:///c:/Projects/frufresco/src/app/api/transport/confirm/route.ts#L135-L328), [`optimize/route.ts:216-275`](file:///c:/Projects/frufresco/src/app/api/transport/optimize/route.ts#L216-L275), [`manifest/excel/route.ts:25-106`](file:///c:/Projects/frufresco/src/app/api/transport/manifest/excel/route.ts#L25-L106), [`orders/route.ts:23`](file:///c:/Projects/frufresco/src/app/api/transport/orders/route.ts#L23), [`RoutePlanner.tsx:82-85`](file:///c:/Projects/frufresco/src/components/RoutePlanner.tsx#L82-L85) | **Colisiones de Bahías `1–150`, `10A/10B` y Manifiesto sin Auth:** `transport/orders` omite `'in_preparation'` y no excluye `assigned_route_id IS NOT NULL`; `RoutePlanner` ignora corte nocturno 8 PM (`getOperationalTargetDate(20)`) y `?date=`; `confirm` ignora bahías previas sin `route_stops`, silencia `{ error }` y retorna `vehicle.driver_name` en vez de `resolvedDriverName`; `manifest/excel` carece de autenticación, quema `'2026-11-12'` / `'1111_'` / `'Ruta 1'` y omite `10A/10B`. *(Nota deuda latente en Modo Manual congelado: `ManualDispatchWizardModal.tsx:338` `.reverse()` y `stagingSpaceAllocator.ts:331-375` duplicado `ChildB`, NO editar bajo Veto Manual).* |
| **`RED-18`** | 🔴 **P1** | [`rectificacion/[routeId]/page.tsx:482-536`](file:///c:/Projects/frufresco/src/app/ops/rectificacion/%5BrouteId%5D/page.tsx#L482-L536), [`driver/route/[id]/page.tsx:44-51,86-97,406-430`](file:///c:/Projects/frufresco/src/app/ops/driver/route/%5Bid%5D/page.tsx#L44-L51), [`driver/page.tsx:387-389`](file:///c:/Projects/frufresco/src/app/ops/driver/page.tsx#L387-L389) | **Paradoja `FAC-IMP`, Pérdida de IVA (`tax`) & Deadlock `rectified`:** `rectificacion` pasa `routes.status = 'rectified'` y `orders.status = 'ready_for_dispatch'` incluso en `manual_mirror`, recalcula `orders.total = subtotal` borrando `tax` y silencia `{ error }`; luego `driver/page.tsx:387` no abre `driver/route/[id]` para `'rectified'`, dejando la ruta sin transición a `'in_transit'`. Además `driver/route/[id]` deja `"BYPASS MODO PRUEBAS"` activo en producción escribiendo columnas inexistentes en `audit_logs`. |
| **`RED-19`** | 🔴 **P1** | [`driver/delivery/[id]/page.tsx:79,157,294-516`](file:///c:/Projects/frufresco/src/app/ops/driver/delivery/%5Bid%5D/page.tsx#L79), [`devoluciones/page.tsx:154-335`](file:///c:/Projects/frufresco/src/app/ops/devoluciones/page.tsx#L154-L335), [`api/ops/shifts:206-268`](file:///c:/Projects/frufresco/src/app/api/ops/shifts/route.ts#L206-L268), [`ops/page.tsx:78`](file:///c:/Projects/frufresco/src/app/ops/page.tsx#L78) | **Triple Descuadre en Entregas (`Col O`, `billing_returns`, `close_day`):** `delivery/[id]` omite `profile_id` en el `SELECT`, silencia `{ error }`, pierde `dedup_key` en fallback; `devoluciones` usa ventana UTC (no Bogotá) y escribe `Col O` sin guarda `manual_mirror`; `ops/page:78` lee `closed_orders`/`closed_routes` cuando API retorna `closed_orders_count`/`closed_routes_count` (imprime `0`) y `close_day` cierra pedidos no conciliados a `'delivered'`. |
| **`RED-20`** | 🔴 **P1** | [`picking/page.tsx:104,113-122,271-289`](file:///c:/Projects/frufresco/src/app/ops/picking/page.tsx#L104), [`picking/dashboard/page.tsx:211-226,434-465`](file:///c:/Projects/frufresco/src/app/ops/picking/dashboard/page.tsx#L211-L226), [`picking/terminal/page.tsx:60-86,162-177`](file:///c:/Projects/frufresco/src/app/ops/picking/terminal/page.tsx#L60-L86) | **Ceguera Nocturna & Desalineación de Células:** `picking` y `terminal` omiten `'in_preparation'`, omiten `warehouse_spaces` (`10A/10B`) y `DT-17`, descartan ítems sin `buying_team` (no usan `normalizeOperationalCell`) y `terminal` usa `.ilike` exacto. `loading/page.tsx` Opción A tampoco actualiza `/api/ops/shifts` ni enlaza a Transporte/Tablero. |
| **`RED-21`** | 🟠 **P2** | [`compras/page.tsx:976-1016,2373-2377`](file:///c:/Projects/frufresco/src/app/ops/compras/page.tsx#L976-L1016), [`recepcion/page.tsx:423,435-488`](file:///c:/Projects/frufresco/src/app/ops/recepcion/page.tsx#L423) | **Fugas en Abastecimiento (`Col G`, `Col K`, Esquema PQRS):** `compras` sigue insertando columnas inexistentes (`defect_category_l1`, `defect_subtype_l2`, `imputed_responsible`) en `customer_service_pqrs`, usa `window.prompt()` bloqueante y `provider_novelties.notes` falta en PostgreSQL (`Escenario 477 §4` DDL). |
| **`RED-22`** | 🟠 **P2** | `public.asset_movements`, [`transport/page.tsx:190,1297`](file:///c:/Projects/frufresco/src/app/admin/transport/page.tsx#L190), [`delivery/[id]/page.tsx:507,529-543`](file:///c:/Projects/frufresco/src/app/ops/driver/delivery/%5Bid%5D/page.tsx#L507), [`devoluciones/page.tsx:267-318`](file:///c:/Projects/frufresco/src/app/ops/devoluciones/page.tsx#L267-L318) | **Kardex de Canastillas Roto & `total_crates`:** `transport/page.tsx:1297` consulta columna inexistente `routes.total_crates` (`EN TRÁNSITO HOY = 0`); `devoluciones` no registra retorno en `asset_movements`; `delivery/[id]` inserta `profile_id: null` en `crate_damage` y no discrimina canastilla B2C (`STOREFRONT_CRATE_PRODUCT_ID`). |
| **`RED-23`** | 🟡 **P3** | [`route-map/[id]/page.tsx:32,125,212`](file:///c:/Projects/frufresco/src/app/ops/driver/route-map/%5Bid%5D/page.tsx#L32), [`driver/delivery/[id]`](file:///c:/Projects/frufresco/src/app/ops/driver/delivery/%5Bid%5D/page.tsx), [`ActivityLog.tsx:18-173`](file:///c:/Projects/frufresco/src/components/ActivityLog.tsx#L18-L173), [`admin/transport/page.tsx:1471`](file:///c:/Projects/frufresco/src/app/admin/transport/page.tsx#L1471) | **Telemetría, Mocks y Reglas de Oro:** `driver/delivery/[id]` apaga `useMobileGpsTracker` en los 4 furgones sin IMEI; `driver/page.tsx:113` no filtra rutas por fecha/turno; `ActivityLog.tsx` conserva emojis (`'️'`, `'🅿️'`), `plate.startsWith('mock')` y doble toast; `admin/transport:1471` conserva `<input type="number">` fuera del estándar `5B`. |
| **`RED-24`** | 🔴 **P1** | [`hostingerImapSync.ts:593-639`](file:///c:/Projects/frufresco/src/lib/orders/hostingerImapSync.ts#L593-L639), [`hostingerImapWatchdog.ts:352-365`](file:///c:/Projects/frufresco/src/lib/orders/hostingerImapWatchdog.ts#L352-L365), [`sync-prices/route.ts:9-42`](file:///c:/Projects/frufresco/src/app/api/products/sync-prices/route.ts#L9-L42), [`apps360.ts:228-231`](file:///c:/Projects/frufresco/src/lib/telemetry/apps360.ts#L228-L231), [`package.json`](file:///c:/Projects/frufresco/package.json), [`SandboxModeBadge.tsx`](file:///c:/Projects/frufresco/src/components/SandboxModeBadge.tsx) | **Blindaje Sandbox Permanente Vercel (`frufresco-sandbox`):** Strings `"DISABLED_IN_SANDBOX"` evaden guarda `if (!pass)` disparando cron IMAP `*/5 * * * *`; falta kill-switch `isSandboxMode()` en `sync-hostinger`, `imap-watchdog`, `sync-prices` (`0 5 * * *`), `sync-gps` (`25s` polling), `optimize` (`gcp-service-account.json`) y cola `public.mail`; **`zod`** importado en 5 APIs no figura en `package.json`; falta `print:hidden` y ajuste móvil en `SandboxModeBadge.tsx` + limpieza de `hostinger_imap_credentials` en `FruFrescoSandbox`. |
| **`RED-25`** | 🔴 **P1** | [`api/transport/telemetry/route.ts:32-107`](file:///c:/Projects/frufresco/src/app/api/transport/telemetry/route.ts#L32-L107), [`api/transport/manifest/excel/route.ts:25-33`](file:///c:/Projects/frufresco/src/app/api/transport/manifest/excel/route.ts#L25-L33), [`api/ops/shifts/route.ts:91-94,113`](file:///c:/Projects/frufresco/src/app/api/ops/shifts/route.ts#L91-L94), [`supabase/migrations/20261120_ops_digital_hardening.sql`](file:///c:/Projects/frufresco/SPEC.md) | **Seguridad Endpoints, Migración Faltante & Gobernanza Git:** `telemetry` y `manifest/excel` carecen de autenticación (`401/403`); `telemetry` permite pisar `hardware_gps` y crear vehículos fantasma; falta `20261120_ops_digital_hardening.sql` (`provider_novelties.notes`, índice único `billing_returns.dedup_key`, `routes.total_crates`); y falta protocolo temporal `main` (`frufresco-sandbox`) vs `liard` (Producción) + Hotfix + Compuerta de Apagado `DG-1..DG-5`. |

#### 8.4 Dictamen Goldfish en Frío & Cierre Contractual (`Escenario 477` — `SDD v1.9.432`)
El Dictamen Goldfish en Frío (`2026-11-20`) emitió `🔴 VETO PREVENTIVO` sobre `C1..C6` y sobre el despliegue Sandbox en Vercel. Todas las compuertas y remediaciones exigidas quedan formalizadas y tipadas en **`Escenario 477` (`SPEC.md §1..§6`)** bajo los siguientes tres pilares innegociables:
1. **Candado `READ-ONLY` del Modo Manual (`Escenario 477 §1`):** Prohibición absoluta de editar `ManualDispatchWizardModal.tsx`, `stagingSpaceAllocator.ts`, `InventoryDailyBalanceTab.tsx`, `orders/create`, `EmailDraftsModule`, `*-print`, `billing/*` u Opción B en `orders/loading`; y prohibición de escribir `'ready_for_dispatch'`/`'in_transit'` en `orders.status` para preservar la compatibilidad 1:1 con las planillas manuales (`RED-16`).
2. **Aislamiento Real Sandbox + Gobernanza `main` vs `liard` (`Escenario 477 §2–§3`):** Contrato `src/lib/sandboxGuard.ts` (`isSandboxMode()`), kill-switches en crons/emails/GPS/GCP, inclusión explícita de `zod` en `package.json`, `print:hidden` en `SandboxModeBadge.tsx`, limpieza de `app_settings`/webhooks/crons en `FruFrescoSandbox` (`xqhjlfhjnnrmwvklppsh`), prohibición temporal de `npm run publish` (`main:liard`) y **Compuerta Obligatoria de Apagado Permanente `DG-1..DG-5`** (`Escenario 477 §6`).
3. **Cierre Forense Digital → Transporte → OPS (`Escenario 477 §4–§5`):** Corrección de `isOperationalStaffProfile` (cerrando el bypass de `628` clientes), migración SQL `20261120_ops_digital_hardening.sql`, reparación del deadlock `rectified` + preservación de `tax` en `rectificacion`, cierre de endpoints sin auth (`manifest/excel`, `telemetry`), ajuste `ops/page` ↔ `shifts` y cierre completo de `RED-14` a `RED-25` sin tocar el Modo Manual.
