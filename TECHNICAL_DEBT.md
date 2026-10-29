# 🏛️ MATRIZ MAESTRA DE DEUDA TÉCNICA & HOJA DE RUTA DE ESCALABILIDAD
## FruFresco SCOS (Supply Chain Operating System)

> **Estado:** 🟢 Inventario Maestro Unificado (Auditoría Forense Multidisciplinaria SDD v1.9.320)  
> **Fecha de Actualización:** 28 de Octubre, 2026  
> **Aprobado por:** Dirección General & Arquitectura de Software  
> **Referencia Contractual:** `SPEC.md` Capítulo 43 (§43.2 y §43.3)

---

## 1. Contexto de Ingeniería & Principio de Estabilidad

Con la certificación de las **76 pantallas físicas** del ecosistema FruFresco y **337 escenarios BDD** en `SPEC.md`, toda deuda técnica pendiente (tanto histórica como los nuevos hallazgos detectados en la Auditoría Forense Multidisciplinaria No Destructiva) se consolida en este **Tablero Maestro Unificado (`DT-01` a `DT-10`)** con identificadores canónicos, prioridad, archivos clave y esfuerzo estimado para ejecutarse una a una según disponibilidad. **Protocolo de Cola Viva Dinámica (.agents/rules/dynamic_tech_debt_ledger.md & scripts/tech_debt_ledger.js):** (1) Toda nueva deuda técnica detectada que no se resuelva de inmediato se agrega automáticamente a la tabla §2 con el siguiente ID (DT-11, DT-12...); (2) Al solucionarse una DT-XX, se retira de la tabla activa (§2) y pasa automáticamente al Registro Histórico de Deudas Cerradas (§3).

---

## 2. Tablero Maestro Unificado de Deuda Técnica Activa (`DT-01` a `DT-10`)

| ID | Prioridad | Módulo / Dominio | Hallazgo Técnico y Operativo | Archivos / Tablas Clave | Esfuerzo Estimado | Estado |
| :---: | :---: | :--- | :--- | :--- | :---: | :---: |
| **DT-03** | 🟠 **P1** (Rendimiento API) | **Endpoints de Facturación y Pedidos** (`/api/*`) | **Bucles Secuenciales `N+1` (`await supabase` dentro de `for`):**<br>En 4 endpoints críticos se actualizan ítems fila por fila dentro de un bucle `for` secuencial en lugar de ejecutar `Promise.all` por lotes o `upsert` masivo, aumentando la latencia en pedidos de > 40 productos. | `api/commercial/billing/assign-off-agreement-prices/route.ts`, `api/commercial/billing/liquidate-open-order/route.ts`, `api/orders/email-drafts/approve/route.ts`, `api/b2b/quote/route.ts` | **~25 min** | ⏳ Pendiente |
| **DT-05** *(Ex DT-20)* | 🟠 **P1** (Control Muelle-Pagos) | **Supervisor Recepción vs. Tesorería** (`/ops/recepcion/supervisor`) | **Conciliación de Diferencias de Báscula en Muelle vs. Pago a Proveedores:**<br>Cuando el supervisor aprueba un excedente de peso o rechaza parte de un lote en muelle, el inventario físico se ajusta vía RPC, pero Tesorería/Compras carece de una bandeja/alerta que resalte las compras donde `picked_up_quantity !== quantity` antes de desembolsar al proveedor. | `src/app/ops/recepcion/supervisor/page.tsx`, `src/app/admin/procurement/treasury/page.tsx` | **~30 min** | ⏳ Pendiente |
| **DT-06** *(Ex COM-36)* | 🟡 **P2** (Comercial) | **Campañas Comerciales** (`/admin/commercial/campaigns`) | **Fase de Pulido Táctico de Campañas (4 Brechas §7.10.D):**<br>1. Modal de edición in-situ y extensión de fechas (`handleEditCampaign`).<br>2. Botón de pausa/reanudación en 1 clic (`status: 'paused'`).<br>3. Telemetría de ROI cruzando pedidos reales contra `campaign_items` (kg vendidos y margen cedido).<br>4. Duplicación rápida (`duplicateCampaign`). | `src/app/admin/commercial/campaigns/page.tsx` | **~35 min** | ⏳ Pendiente |
| **DT-07** *(Ex DEBT-003)* | 🟡 **P2** (Mantenibilidad) | **6 Archivos Monstruo (> 8.000 LOC)** | **Desmantelamiento Quirúrgico Modular (Fase 2 y 3):**<br>Extraer sub-modales y custom hooks de los 6 archivos mayores sin alterar lógica: `EmailDraftsModule.tsx` (13.877 LOC), `orders/create/page.tsx` (12.894 LOC), `CommercialAgreementsModule.tsx` (11.956 LOC), `ClientsModule.tsx` (11.427 LOC), `orders/loading/page.tsx` (8.912 LOC) y `commercial/billing/page.tsx` (8.599 LOC). | 6 componentes principales (ejecutable por archivo individual) | **~30 min / archivo** | ⏳ Pendiente |
| **DT-08** *(Ex DT-17)* | 🟢 **P3** (Consola / Maps) | **Georreferenciación Google Maps** | **Migración de `google.maps.Marker` a `AdvancedMarkerElement`:**<br>Reemplazar el marcador clásico (que emite *Deprecation Warning* en consola) por `AdvancedMarkerElement` / `<AdvancedMarker>` con `mapId` en los 7 archivos que renderizan mapas. | `ClientsModule.tsx`, `EmailDraftsModule.tsx`, `CommercialUnifiedDashboard.tsx`, `LeadGenBot.tsx`, `GeofencingManager.tsx`, `orders/create`, `orders/loading` | **~25 min** | ⏳ Pendiente |
| **DT-09** *(Ex DEBT-005)* | 🟢 **P3** (Ergonomía Piso) | **Pantallas Operativas Muelle/Picking** | **Selector "Modo Gemba Limpio" vs. "Modo Analítico":**<br>Interruptor en cabecera de `/ops/picking/dashboard` y `/admin/orders/loading` para simplificar la vista del operario de piso a fuentes grandes y 3 datos clave. | `src/app/ops/picking/dashboard/page.tsx`, `src/app/admin/orders/loading/page.tsx` | **~30 min** | ⏳ Pendiente |
| **DT-10** *(Ex DT-18)* | 🟢 **P3** (Ingeniería Lean) | **Cubicaje de Canastillas y Muelle** | **Densidad Volumétrica Botánica por SKU y Alerta de Apilamiento:**<br>Pasar del divisor fijo `12.5 kg/canastilla` al factor botánico (`density_factor_kg_per_crate`: 6-8 kg hojas vs. 18-22 kg tubérculos) y alerta cuando una bahía supere 24 canastillas (4 niveles). | `products`, `src/lib/orderUtils.ts`, `src/app/admin/orders/loading/page.tsx` | **~35 min** | ⏳ Estratégica |

---

## 3. Registro Histórico de Deudas Técnicas Resueltas y Certificadas (`✅`)

- **DT-02 (Consultas PostgREST > 1.000 Filas (`purchases`, `order_items`)):** ✅ Cerrado (2026-10-29) — Paginación transparente fetchAllRows en 6 módulos críticos (commercial/settings, CommercialUnifiedDashboard, api/b2b/quote, ops/compras, commercial/reports) erradicando truncamiento silencioso a 1.000 filas en purchases, order_items y pricing_rules (Escenario 339 — SDD v1.9.322).
- **DT-04 (Bodega vs. Balance Diario 24 Col. (`/ops/inventory` $\to$ Col. T)):** ✅ Cerrado (2026-10-28) — Persistencia determinista [BLIND_COUNT_META] en inventory_movements (incluyendo diff=0) desde /ops/inventory hacia Columna T en InventoryDailyBalanceTab.tsx y badge bimodal de auditoría comercial (Escenario 338 — SDD v1.9.321).
- **DT-01 (Precios & Triggers SQL (`pricing_model_prices`, `pricing_rules`)):** ✅ Cerrado (2026-10-28) — Unificación de motor en pricingUtils.ts y /api/products/sync-prices, piso 25% en General Institucional, blindaje 0% Familia Cortés y sincronización de 475 SKUs activos (3.113 filas) en pricing_model_prices con 0 márgenes negativos (Escenario 338 — SDD v1.9.321).
1. **DEUDA TÉCNICA 1 a 16 (`SPEC.md` §4):** 100% Cerradas y en producción.
2. **DEBT-001 (Deducción Atómica de Stock):** ✅ Mitigado con RPC `adjust_inventory_stock_atomic` & `deduct_inventory_atomic` (`FOR UPDATE`) + Fallback JIT en [`src/lib/supabase.ts`](file:///c:/Users/German%20Higuera/OneDrive/Documentos/Projects/frufresco/src/lib/supabase.ts).
3. **DEBT-002 Fase 1 (Utilidad de Paginación Automática):** ✅ Paginador transparente `fetchAllRows<T>` y conteos agregados PostgreSQL en `quote_templates`.
4. **DEBT-003 Fase 1 (Optimización RAM/CPU In-Place):** ✅ Diccionarios $O(1)$ (`Map`) y `useMemo` aplicados *in-place* en los componentes mayores.
5. **DEBT-004 (Resiliencia Móvil 3G/4G en Muelle `/ops/*`):** ✅ Interceptor `fetchWithGembaRetry` con Backoff Exponencial (`450ms`, `1000ms`).
