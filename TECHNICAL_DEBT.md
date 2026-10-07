# 🏛️ MATRIZ MAESTRA DE DEUDA TÉCNICA & HOJA DE RUTA DE ESCALABILIDAD
## FruFresco SCOS (Supply Chain Operating System)

> **Estado:** 🟡 Activo & Priorizado para Siguiente Sprint  
> **Fecha de Emisión:** 07 de Octubre, 2026  
> **Aprobado por:** Dirección General & Arquitectura de Software  
> **Referencia Contractual:** `SPEC.md` Capítulo 43 (Apéndice de Deuda Técnica y Resiliencia)

---

## 1. Contexto de Ingeniería & Principio de Estabilidad

Con la certificación satisfactoria de las **76 pantallas físicas** del ecosistema FruFresco (100% de cobertura operativa, 0 errores de compilación TypeScript y 152 pruebas unitarias pasando limpiamente), la plataforma ha demostrado estabilidad funcional en el ciclo de pruebas.

Para **proteger la estabilidad actual de producción** y evitar regresiones prematuras, las áreas de mejora arquitectónica no se intervienen de forma impulsiva; se formalizan en este registro canónico como **Deuda Técnica Priorizada (P0 a P2)** para ser abordadas con ventanas controladas de QA y pruebas de carga.

---

## 2. Tablero de Priorización Ejecutiva

| Código | Nivel | Componente Afectado | Riesgo Operativo | Esfuerzo Estimado | Sprint Objetivo |
| :---: | :---: | :--- | :--- | :---: | :---: |
| **DEBT-001** | 🔴 **P0** | Inventario / Deducción de Stock | **Alto:** Descuadre de stock por colisión de pedidos concurrentes (Race Conditions en cliente). | 1 día | Sprint Hardening 1.1 |
| **DEBT-002** | 🔴 **P0** | Reportes & Facturación Histórica | **Alto:** Truncamiento silencioso de consultas a 1.000 filas en PostgREST (Supabase). | 0.5 días | Sprint Hardening 1.1 |
| **DEBT-003** | 🟡 **P1** | 4 Archivos Monstruo (>10k LOC) | **Medio:** Alto consumo de memoria RAM en cliente y riesgo de merge conflicts en Git. | 3-4 días | Sprint Refactor 1.2 |
| **DEBT-004** | 🟡 **P1** | Conectividad Móvil `/ops/*` | **Medio:** Peticiones congeladas en bodegas o sótanos de Corabastos por caída de 3G/4G. | 2 días | Sprint Gemba 1.3 |
| **DEBT-005** | 🟢 **P2** | Torre de Control y Carga Muelle | **Bajo:** Sobrecarga visual y fatiga cognitiva en operarios de bodega no técnicos. | 1 día | Sprint Gemba 1.3 |

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
