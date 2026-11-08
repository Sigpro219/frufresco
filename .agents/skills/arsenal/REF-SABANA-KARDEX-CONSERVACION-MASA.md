---
id: REF-SABANA-KARDEX-CONSERVACION-MASA
version: 1.0
estado: VIGENTE
reemplaza: null
titulo: "Sábana Oficial de Balance Diario de Inventarios (24 Columnas A-X), Ecuación de Conservación de Masa Cerrada, Cascada Resiliente de Apertura y Ciclo Post-Cierre D+1"
categoria: "Logística & Ruteo"
tags: [kardex, conservacion-masa, sabana-24-columnas, inventario-fisico, cascada-apertura, post-cutoff, devoluciones-d1, merma-pesada, donaciones, padre-hijo]
multiplicador_velocidad: "10X"
reduccion_errores: "99%"
proyectos_origen: [frufresco]
fecha_cosecha: "2026-11-06"
---

# 🧩 Ficha de Refacción: Sábana Oficial de Balance Diario de Inventarios (24 Columnas) y Motor de Conservación de Masa Cerrada

## 🔴 1. La Pesadilla Operativa Previa (Baseline 1X - El Gemba Real)
* **Puesto de Trabajo:** El jefe de inventarios y el contador operaban sobre una sábana en Excel desconectada de los módulos de piso (`/ops`). El inventario inicial se copiaba a mano cada mañana, las ventas extemporáneas post-corte se mezclaban con la tanda principal rompiendo el picking, y las devoluciones de camión que llegaban después de las 7:00 PM no diferenciaban entre lo que nunca bajó del camión y lo que llegó dañado.
* **Muda Identificada:** Pérdidas ocultas disfrazadas de "merma general", doble descuento cuando Compras y Picking reportaban el mismo agotado (`Col K`), y falsos faltantes nocturnos cuando el Supervisor entregaba donaciones al Banco de Alimentos sin descontarlas del cálculo teórico.
* **Velocidad y Tasa de Falla Inicial:** Velocidad 1X (2 a 3 horas diarias cuadrando Excels cruzados con diferencias inexplicables de masa entre el 8% y el 15%).

---

## 🟢 2. La Transformación Operativa (Salto Multiplicador 10X)
* **Nuevo Flujo de Trabajo:** Estación central de auditoría en tiempo real de 24 columnas canónicas (`A` hasta `X`, con `Col O2` para Faltante de Devoluciones y `Col J` / `Col U` optimizadas en UI pero preservadas en exportación ERP). Todo gramo que entra a bodega por `/ops/recepcion` queda encadenado hasta el Conteo Físico Ciego (`Col T`) de las 7:00 PM.
* **Multiplicador de Negocio:** **Aceleración 10X (cierre contable instantáneo)** y trazabilidad del 100% de la masa física mediante jerarquía Padre `[P]` $\to$ Hijo `[H]`, fórmulas aritméticas inline estilo Excel (`=15+2.5*3`) en Modo Edición y segregación por Hora de Corte.

---

## 💣 3. Secretos Sucios de Producción & Antipatrones Descartados
* ❌ **Alimentar Columna G (`COMPRAS`) desde la Negociación en Plaza (`/ops/compras`):** Lo que el comprador negocia en Corabastos no siempre es lo que entra al muelle. Alimentar `Col G` desde `purchases` inflaba el inventario teórico con mercancía que aún venía en camión. **Solución:** `Col G` se alimenta exclusivamente de `/ops/recepcion` (`reference_type = 'purchase_reception'`).
* ❌ **Doble Autoridad de Escritura en Producto Escaso (`Col K`):** Si Compras declaraba escasez y Picking también marcaba faltante, la Columna K restaba el doble. **Solución:** *Single-Write Authority* exclusiva para `/ops/compras`.
* ❌ **Devoluciones de Ruta Mezcladas en el Mismo Día $D$:** Como el cierre físico ocurre a las 7:00 PM y los camiones regresan al final de la jornada, meter la devolución en $D$ descuadraba el conteo nocturno. **Solución:** Ciclo Post-Cierre hacia $D+1$ con 3 componentes exactos: $\Delta S_{D+1} = +\text{Col O (Reportado)} - \text{Col O2 (Faltante Camión)} - \text{Col Q (Desperdicio)} = \text{Reingreso Neto Apto}$.
* ❌ **Atar el Cobro de Sobrepeso de Báscula a un Switch Estático del SKU:** En la vida real, si se cobra o no un excedente de pesaje ($\Delta = Q_{\text{pesada}} - Q_{\text{pedida}} > 0$) depende del cliente y del pedido puntual en Facturación (`SÍ` $\to$ `Col M Venta Adicional` / `NO` $\to$ `Col P Merma por Pesada`).

---

## 💻 4. Solución de Software & Lego Blocks (Código Vivo Auto-Contenido)

### A. Motor de Cálculo de las 24 Columnas, Cascada Resiliente $E_D = T_{D-1}$ y Ecuación de Masa ($S$)
```typescript
// Fragmento canónico de src/components/InventoryDailyBalanceTab.tsx
export interface InventoryDailyRow {
    productId: string;
    sku: string;
    parent_id?: string | null;
    is_active: boolean;
    isP: boolean;
    isH: boolean;
    colA_date: string;
    colB_idProducto: string | number;
    colC_inventoryGroup: string;
    colD_productName: string;
    unit_of_measure: string;
    base_price: number;
    colE_initialStock: number;      // (+) Solo lectura: Hereda Conteo Físico T de D-1
    colF_corrections: number;       // (+/-) Ajuste firmado por supervisor
    colG_purchases: number;         // (+) Exclusivo desde /ops/recepcion (purchase_reception)
    colH_salesKg: number;           // (-) Pedidos en para_compra antes de hora de corte (Kg)
    colI_salesUnits: number;        // (-) Pedidos en para_compra antes de hora de corte (Und)
    colJ_weightSalesUnits: number;  // (-) Masa en Kg equivalente de las unidades vendidas en Col I
    colK_shortage: number;          // (-) Producto escaso declarado en /ops/compras
    colL_unshipped: number;         // (+) Producto alistado que no subió al camión y retorna a stock
    colM_additionalSales: number;   // (-) Pedidos post-corte + Sobrepesos cobrados en Facturación
    colN_employeeSales: number;     // (-) Venta interna a colaboradores -> Deducción en /admin/hr
    colO_returns: number;           // (+) Devolución reportada en ruta (procesada post-7 PM en D+1)
    colO2_returnShortage: number;   // (-) Diferencia que nunca llegó en el camión a bodega
    colP_weighingWaste: number;     // (-) Sobrepeso en báscula NO cobrado en Facturación
    colQ_damageWaste: number;       // (-) Avería / Producto dañado (Devoluciones D+1 o Procesados)
    colR_cleaningWaste: number;     // (-) Basura / Cáscara / Descapote en limpieza o procesados
    colS_calculated: number;        // (=) Ecuación Canónica de Conservación de Masa
    colT_physicalCount: number | null; // Conteo Físico Ciego a las 7:00 PM (/ops/inventory)
    hasPhysicalCount: boolean;
    colU_bodegaPost10am: number;    // (=) Unificada con Col T para compatibilidad ERP
    colV_missing: number;           // (-) Descuadre negativo: Si T < S => |T - S|
    colW_surplus: number;           // (+) Descuadre positivo: Si T > S => T - S
    colX_foodBank: number;          // (-) Donaciones autorizadas por Supervisor con acta + fotos
}

// 1. CASCADA RESILIENTE DE APERTURA (Columna E: E_D = T_{D-1})
let initialStock = 0;
if (previousClosingMap[p.id] !== undefined) {
    initialStock = previousClosingMap[p.id];
} else if (previousClosingMap['__HAS_BASELINE__'] !== undefined) {
    // Si existe corte previo (Cierre Oficial o Conteo Físico D-1), los SKUs sin conteo en D-1 inician en 0
    initialStock = 0;
} else if (balanceDate > todayStr) {
    // Apertura de jornada futura (D+1): hereda el stock vivo disponible en bodega
    initialStock = Math.max(0, currentStock);
} else if (balanceDate === todayStr) {
    const todayDeltas = dayMovs.reduce((acc, m) => acc + (Number(m.quantity) || 0), 0);
    initialStock = Math.max(0, currentStock - todayDeltas);
} else {
    const hasAnyMovements = dayMovs.length > 0 || laterMovs.length > 0;
    initialStock = hasAnyMovements ? Math.max(0, currentStock - sumDeltasSinceStart) : 0;
}

// 2. DESACOPLE POR HORA DE CORTE (Venta Adicional Post-Corte -> Columna M)
m_additionalSales += (postCutoffSalesMap.get(p.id) || 0);

// 3. ECUACIÓN CANÓNICA DE CONSERVACIÓN DE MASA CERRADA (Columna S)
// S = E + F + G - H - J - K + L - M - N + O - O2 - P - Q - R - X
const calculatedStock =
    initialStock +
    f_corrections +
    g_purchases -
    h_salesKg -
    j_weightSalesUnits -
    k_shortage +
    l_unshipped -
    m_additionalSales -
    n_employeeSales +
    o_returns -
    o2_returnShortage -
    p_weighingWaste -
    q_damageWaste -
    r_cleaningWaste -
    x_foodBank;

// 4. CONCILIACIÓN FÍSICA CIEGA (Col T vs Col S -> Faltantes V y Sobrantes W)
let missing = 0;
let surplus = 0;
if (physicalCount !== null) {
    const diff = physicalCount - calculatedStock;
    if (diff < -0.001) missing = Math.abs(diff);
    else if (diff > 0.001) surplus = diff;
}
```

### B. Evaluador Seguro de Expresiones Aritméticas Inline Estilo Excel (Modo Edición)
```typescript
// Permite escribir "=15+2.5*3" o "20x4" directamente en cualquier celda editable de la Sábana
export function evaluateExcelExpression(rawInput: string): number | null {
    const clean = String(rawInput || '')
        .trim()
        .replace(/^[=+]/, '')
        .replace(/[xX]/g, '*')
        .replace(/,/g, '.');

    if (!clean || !/^[\d\s.+\-*/()]+$/.test(clean)) return null;

    try {
        const result = Function(`"use strict"; return (${clean})`)();
        return typeof result === 'number' && Number.isFinite(result)
            ? Math.round(result * 100) / 100
            : null;
    } catch {
        return null;
    }
}
```

---

## 🔌 5. Guía de Reutilización Frankenstein & Dependencias Mínimas
* **Dónde encaja:** Distribuidoras mayoristas B2B, centrales de abastos, frigoríficos, plantas de producción de alimentos, droguerías o ferreterías industriales que requieran control diario de masa/unidades con tolerancia cero a pérdidas ocultas.
* **Esquema de Base de Datos Necesario:**
  - `products` (`id`, `name`, `sku`, `accounting_id`, `parent_id`, `inventory_group`, `unit_of_measure`, `weight_kg`).
  - `inventory_movements` (`id`, `product_id`, `type`, `reference_type`, `quantity`, `origin_source`, `notes`, `evidence_url`, `created_at`).
  - `daily_inventory_closings` (`closing_date`, `is_locked`, `snapshot_data`).
* **Dependencias Mínimas:** React 19, `@supabase/supabase-js`, `lucide-react`, `xlsx`.
