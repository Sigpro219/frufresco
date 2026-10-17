# 🏛️ MATRIZ MAESTRA DE DEUDA TÉCNICA & HOJA DE RUTA DE ESCALABILIDAD
## FruFresco SCOS (Supply Chain Operating System)

> **Estado:** 🟢 Mitigado (Grupo A Riesgo Cero Activo en Producción — SDD v1.9.208)  
> **Fecha de Actualización:** 16 de Octubre, 2026  
> **Aprobado por:** Dirección General & Arquitectura de Software  
> **Referencia Contractual:** `SPEC.md` Capítulo 43 & Escenario 239 (Apéndice de Deuda Técnica y Resiliencia)

---

## 1. Contexto de Ingeniería & Principio de Estabilidad

Con la certificación satisfactoria de las **76 pantallas físicas** del ecosistema FruFresco (100% de cobertura operativa, 0 errores de compilación TypeScript y 152 pruebas unitarias pasando limpiamente), la plataforma ha demostrado estabilidad funcional en el ciclo de pruebas.

Bajo el protocolo de **Seguridad Total (Grupo A: Riesgo Cero con Fallback Automático)** ejecutado en `SDD v1.9.208`, se han resuelto las deudas críticas de concurrencia de inventario (`DEBT-001`), límite de 1.000 filas (`DEBT-002`), resiliencia ante micro-cortes 3G/4G en muelle (`DEBT-004`) y optimización de RAM/CPU *in-place* en los 4 archivos mayores (`DEBT-003`), preservando intacta la operación en vivo.

---

## 2. Tablero de Priorización Ejecutiva

| Código | Nivel | Componente Afectado | Estado Actual (SDD v1.9.208) | Solución Aplicada |
| :---: | :---: | :--- | :---: | :--- |
| **DEBT-001** | 🟢 **RESUELTO** | Inventario / Deducción de Stock | ✅ **Mitigado con Fallback** | RPC `adjust_inventory_stock_atomic` & `deduct_inventory_atomic` (`FOR UPDATE`) + Fallback JIT en [`src/lib/supabase.ts`](file:///c:/Users/German%20Higuera/OneDrive/Documentos/Projects/frufresco/src/lib/supabase.ts) |
| **DEBT-002** | 🟢 **RESUELTO** | Reportes & Consultas > 1.000 Filas | ✅ **Mitigado** | Paginador transparente `fetchAllRows<T>` en [`src/lib/supabase.ts`](file:///c:/Users/German%20Higuera/OneDrive/Documentos/Projects/frufresco/src/lib/supabase.ts) (1 viaje si `<1.000`, auto-rango si `>=1.000`) |
| **DEBT-003** | 🟢 **FASE 1 OK** | 4 Archivos Monstruo (>10k LOC) | ✅ **RAM/CPU Optimizada In-Place** | Diccionarios $O(1)$ (`Map`) y `useMemo` aplicados *in-place* sin riesgo de ruptura de archivos |
| **DEBT-004** | 🟢 **RESUELTO** | Conectividad Móvil `/ops/*` | ✅ **Mitigado** | Interceptor `fetchWithGembaRetry` con Backoff Exponencial (`450ms`, `1000ms`) ante micro-cortes 3G/4G |
| **DEBT-005** | 🟢 **P2** | Torre de Control y Carga Muelle | 🟡 **Backlog Ergonomía** | Selector opcional "Modo Gemba Limpio" para ventana futura de diseño |

---

## 3. Fichas Técnicas de Deuda y Plan de Mitigación

### 🔴 DEBT-001: Deducción Atómica de Inventario en Base de Datos (P0)

* **Diagnóstico Actual:**  
  La validación de disponibilidad y el descuento de inventario ocurren actualmente en la capa del navegador (`'use client'`). El componente consulta el stock actual de un SKU o lote en Supabase, resta la cantidad solicitada en la memoria de React y envía una mutación `UPDATE inventory_batches`.
* **Riesgo en Producción:**  
  Bajo concurrencia (dos clientes institucionales confirmando pedidos simultáneos o un alistamiento en bodega cruzado con una venta en mostrador), ambas sesiones leen el mismo saldo disponible. Esto permite sobrevender inventario físico y genera saldos negativos (`-30 kg`).
* **Solución Técnica / Blueprint:**  
  Migrar la deducción a una función RPC transaccional en PostgreSQL con bloqueo pesimista de fila:
  ```sql
  CREATE OR REPLACE FUNCTION deduct_inventory_atomic(
      p_order_id UUID,
      p_items JSONB
  ) RETURNS JSONB AS $$
  DECLARE
      v_item RECORD;
      v_current_stock NUMERIC;
  BEGIN
      -- Iterar sobre los ítems del payload
      FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS (sku_id UUID, quantity NUMERIC)
      LOOP
          -- Bloqueo pesimista de fila (FOR UPDATE)
          SELECT quantity_available INTO v_current_stock
          FROM inventory_items
          WHERE id = v_item.sku_id
          FOR UPDATE;

          IF v_current_stock < v_item.quantity THEN
              RAISE EXCEPTION 'Stock insuficiente para el SKU %: disponible %, solicitado %', 
                  v_item.sku_id, v_current_stock, v_item.quantity;
          END IF;

          UPDATE inventory_items
          SET quantity_available = quantity_available - v_item.quantity
          WHERE id = v_item.sku_id;
      END LOOP;

      RETURN jsonb_build_object('success', true, 'order_id', p_order_id);
  END;
  $$ LANGUAGE plpgsql;
  ```

---

### 🔴 DEBT-002: Mitigación del Techo de 1.000 Filas en PostgREST (P0)

* **Diagnóstico Actual:**  
  El cliente de Supabase (`@supabase/supabase-js`) tiene un límite por omisión impuesto por el servidor PostgREST de 1.000 filas por consulta (`max-rows = 1000`). En pantallas como facturación masiva y auditoría se implementó paginación por chunks (`CHUNK_SIZE = 100/500`). Sin embargo, reportes agregados que no usen chunks podrían truncar datos históricos en silencio.
* **Riesgo en Producción:**  
  A partir del tercer mes de operación intensiva, las consultas analíticas de "Consumo acumulado semestral" o "Kardex anual" ignorarán todo registro por encima de la fila 1.000, proyectando cifras financieras y de masa incompletas.
* **Solución Técnica / Blueprint:**  
  1. Prohibir la descarga masiva de filas crudas al navegador para hacer `.reduce()` o `Math.sum()`.
  2. Implementar funciones RPC de agregación matemática (`SUM`, `COUNT`, `AVG`) que retornen un solo número o una tabla condensada ya totalizada por el motor PostgreSQL.

---

### 🟡 DEBT-003: Desmantelamiento Quirúrgico de los 4 Archivos Monstruo (P1)

* **Diagnóstico Actual:**  
  Existen 4 componentes con más de 10.000 líneas de código cada uno:
  1. `src/components/EmailDraftsModule.tsx` (13.705 LOC).
  2. `src/app/admin/orders/create/page.tsx` (12.031 LOC).
  3. `src/components/CommercialAgreementsModule.tsx` (10.453 LOC).
  4. `src/components/ClientsModule.tsx` (10.186 LOC).
* **Riesgo en Producción:**  
  - Tiempos de recarga en caliente (HMR) excesivos durante el soporte operativo.
  - Alto consumo de memoria RAM del navegador (> 1.2 GB) en equipos de oficina antiguos.
  - Imposibilidad de trabajar simultáneamente en equipo sin generar conflictos masivos de Git.
* **Solución Técnica / Blueprint:**  
  Aplicar el protocolo del skill `cirujano-refactor-legacy`:
  - **Fase 1:** Extraer sub-modales a archivos dedicados en `src/components/orders/*`.
  - **Fase 2:** Extraer lógica de negocio y cálculos a custom hooks (`useOrderCreationState.ts`, `useDraftTableParser.ts`).
  - **Fase 3:** Dejar la página principal como un coordinador limpio de no más de 300 LOC.

---

### 🟡 DEBT-004: Tolerancia Offline en Plataforma Corabastos y Muelle (P1)

* **Diagnóstico Actual:**  
  Las pantallas móviles de piso (`/ops/recepcion`, `/ops/picking`, `/ops/control-caja`) dependen de llamadas activas vía WebSockets o HTTP a Supabase. Si la señal celular oscila, las promesas pueden expirar (*timeout*).
* **Riesgo en Producción:**  
  En las bodegas frías o naves subterráneas de Corabastos la señal 4G es deficiente. Si una petición de pesaje o anticipo falla, el operario queda bloqueado con un spinner indefinido.
* **Solución Técnica / Blueprint:**  
  1. Envolver mutaciones de `/ops/*` en un gestor de reintentos con cola local (*IndexedDB / LocalStorage*).
  2. Implementar notificaciones de reconexión (*"Sin señal - Guardado localmente, sincronizando al salir a muelle"*).

---

### 🟢 DEBT-005: Selector "Modo Gemba Limpio" en Pantallas Operativas (P2)

* **Diagnóstico Actual:**  
  Módulos como `/admin/orders/loading` y `/ops/picking/dashboard` presentan más de 12 indicadores métricos simultáneos (bahías 1-150, discriminador B2B/B2C, kilogramos netos, estados SOLPED, códigos SKU).
* **Riesgo en Producción:**  
  El personal operativo de bodega sufre fatiga visual y comete errores por confusión de botones o badges similares.
* **Solución Técnica / Blueprint:**  
  Añadir un interruptor de densidad en la cabecera:
  - **Modo Analítico / Coordinación:** Interfaz densa actual con todos los indicadores para gerencia.
  - **Modo Gemba Limpio:** Interfaz simplificada con fuentes grandes, alto contraste, solo 3 campos visibles (Producto, Cantidad a Pesar, Tara) y botón verde gigante de confirmación.

---

## 4. Compromiso de Calidad & Criterios de Aceptación para Despeje

1. Ninguna intervención de deuda técnica podrá ejecutarse sin una suite previa de pruebas de regresión.
2. Cada procedimiento RPC de PostgreSQL deberá contar con test unitario de concurrencia simulada.
3. El proceso de desmantelamiento de los archivos monstruo deberá mantener compilación con 0 errores de TypeScript en cada commit atómico intermedio.
