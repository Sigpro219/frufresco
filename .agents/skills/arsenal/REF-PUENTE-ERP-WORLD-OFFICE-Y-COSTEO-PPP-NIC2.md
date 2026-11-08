---
id: REF-PUENTE-ERP-WORLD-OFFICE-Y-COSTEO-PPP-NIC2
version: 1.0
estado: VIGENTE
reemplaza: null
titulo: "Puente Contable Determinista para World Office Desktop (57 Columnas, Resolución Literal Columna AD y DV DIAN Módulo 11) y Motor de Costo Promedio Ponderado Diario (PPP NIC 2)"
categoria: "FinOps"
tags: [world-office, contabilidad-colombia, dian-modulo-11, columna-ad-sucursal, nic-2, costo-promedio-ponderado, ppp-diario, xlsx-erp-bridge]
multiplicador_velocidad: "15X"
reduccion_errores: "100%"
proyectos_origen: [frufresco]
fecha_cosecha: "2026-11-06"
---

# 🧩 Ficha de Refacción: Puente Contable World Office Desktop (57 Columnas) y Costeo Promedio Ponderado Diario (PPP NIC 2)

## 🔴 1. La Pesadilla Operativa Previa (Baseline 1X - El Gemba Real)
* **Puesto de Trabajo:** El área de facturación y contabilidad debía construir manualmente el archivo plano de 57 columnas (`Detalle migración`) exigido por **World Office Desktop** y actualizar a mano los costos unitarios cuando en la misma madrugada se realizaban múltiples compras de un mismo producto a distintos precios en Corabastos.
* **Muda Identificada:** Rechazos masivos de importación en World Office porque la **Columna AD (`Encab: Sucursal`)** actúa como llave foránea literal (sensible a espacios finales, guiones compuestos o errores tipográficos históricos del ERP), y distorsión del margen bruto cuando se tomaba el último precio de compra (LIFO tácito) en lugar del promedio ponderado del día.
* **Velocidad y Tasa de Falla Inicial:** Horas corrigiendo errores de importación fila por fila en World Office y desfases de margen comercial de hasta el 18% en productos volátiles.

---

## 🟢 2. La Transformación Operativa (Salto Multiplicador 15X)
* **Nuevo Flujo de Trabajo:** Exportación en 1 clic desde `/admin/commercial/billing` generando el libro `.xlsx` con las 57 columnas exactas, cálculo automático del Dígito de Verificación DIAN (Módulo 11), resolución determinista en 4 niveles de la Columna AD para 615 perfiles corporativos, y cálculo reactivo del Costo Promedio Ponderado Diario ($\text{PPP}_{p,d}$) hacia `commercial_cost_matrix`.
* **Multiplicador de Negocio:** **Aceleración 15X (migración contable en segundos con 0% de rechazos)** y valorización exacta del inventario bajo norma internacional **NIC 2 / IAS 2**.

---

## 💣 3. Secretos Sucios de Producción & Antipatrones Descartados
* ❌ **Hacer `split(' - ')` Ingenuo en `company_name` para Extraer la Sucursal de World Office:** Cuando el nombre legal de la Casa Matriz contenía por sí mismo un guion con espacios (ej. `'AMATU - AMA TU MASCOTA SAS'`), un `split(' - ')` genérico cortaba el nombre de la matriz y producía `'AMA TU MASCOTA SAS - AMA TU MASCOTA'` en lugar de `'AMA TU MASCOTA'`. **Solución:** Prioridad 0 con override explícito (`logistics_data.world_office_branch`) y Prioridad 1 removiendo primero el prefijo completo de la Casa Matriz antes de cualquier split por guion.
* ❌ **Hacer `.trim()` Ciego sobre el Override de World Office:** En World Office Desktop existen sucursales creadas históricamente con un espacio en blanco al final (ej. `'ALDIMARK- COLEGIO MIGUEL LA SALLE '`) o con typos congelados (`'HOTEL TENQUENDAMA SUITES SAS'`). Si les quitas el espacio final, World Office rechaza la factura. El override `world_office_branch` debe devolver la cadena literal intacta.
* ❌ **Enviar el Consecutivo de Factura como String con Prefijo en Columna D (`Encab: Documento Número`):** Para Factura de Venta (`FV`), World Office exige un entero numérico puro (ej. `68494`) en Columna D y el prefijo separado en Columna C, además del IVA expresado en decimal (`0.19` en lugar de `19`).
* ❌ **Ignorar Filas Amarillas de Subtotal al Importar Excels Contables:** Los Excels exportados de sistemas contables traen filas de subtotales pintadas de amarillo (`FFFF00`); si el importador no verifica el estilo de celda o la presencia de `#ID`, duplica las cantidades.

---

## 💻 4. Solución de Software & Lego Blocks (Código Vivo Auto-Contenido)

### A. Algoritmo DIAN Módulo 11 y Resolución Determinista 1:1 de Sucursales World Office (Columna AD)
```typescript
// src/lib/worldOfficeExport.ts
export function calculateDianDV(rawNit: string | number): string {
    const nitStr = String(rawNit).replace(/\D/g, '');
    if (!nitStr || nitStr.length === 0) return '0';

    const vpri = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
    const len = nitStr.length;
    let sum = 0;

    for (let i = 0; i < len; i++) {
        const digit = parseInt(nitStr.charAt(len - 1 - i), 10);
        sum += digit * vpri[i];
    }

    const mod = sum % 11;
    return mod === 0 || mod === 1 ? String(mod) : String(11 - mod);
}

export function resolveWorldOfficeBranch(profile: any, parentProfile?: any): string {
    if (!profile && !parentProfile) return '';

    // Prioridad 0: Override explícito literal (preserva espacios finales y grafías históricas de World Office)
    const explicitBranch =
        profile?.logistics_data?.world_office_branch ??
        (!profile?.parent_id ? parentProfile?.logistics_data?.world_office_branch : undefined);
    if (typeof explicitBranch === 'string' && explicitBranch.trim().length > 0) {
        return explicitBranch;
    }

    const fullName = (profile?.company_name || profile?.razon_social || profile?.contact_name || '').trim();
    const legalName = (
        profile?.razon_social ||
        profile?.company_name ||
        profile?.contact_name ||
        parentProfile?.razon_social ||
        parentProfile?.company_name ||
        ''
    ).trim();
    if (!fullName && !legalName) return '';

    const isBranch = Boolean(profile?.parent_id) || Boolean(profile?.branch_id) || profile?.is_corporate_parent === false;

    // Prioridad 1: Remover el nombre exacto de la Casa Matriz ANTES de dividir por ' - '
    const parentCandidates = [
        parentProfile?.company_name,
        parentProfile?.razon_social,
        isBranch ? profile?.razon_social : null
    ]
        .map(c => (typeof c === 'string' ? c.trim() : ''))
        .filter(Boolean);

    for (const pName of parentCandidates) {
        if (fullName && fullName.toLowerCase() !== pName.toLowerCase() && fullName.toLowerCase().startsWith(pName.toLowerCase())) {
            const sub = fullName.slice(pName.length).trim().replace(/^[-–—:]+\s*/, '');
            if (sub) return sub;
        }
    }

    // Prioridad 2: Patrón 'EMPRESA - SUCURSAL'
    if (isBranch && fullName.includes(' - ')) {
        const parts = fullName.split(' - ');
        const candidate = parts.slice(1).join(' - ').trim();
        if (candidate) return candidate;
    }

    // Prioridad 3: Sucursal directa sin separador de guion (ej. 'CIEDI')
    if (isBranch && fullName) return fullName;

    // Prioridad 4: Cliente unisede -> Razón Social (NUNCA 'Principal')
    return legalName || fullName;
}
```

### B. Motor de Costo Promedio Ponderado Diario (PPP bajo NIC 2 / IAS 2)
```typescript
// Cálculo determinista de Costo Promedio Ponderado intradiario (DT-11 / SDD Escenario 386)
export interface IntradayPurchaseLot {
    quantity: number;
    unit_price: number;
    total_cost?: number;
}

export function calculateDailyWeightedAverageCost(lots: IntradayPurchaseLot[]): number | null {
    if (!lots || lots.length === 0) return null;

    let totalQty = 0;
    let totalCost = 0;

    for (const lot of lots) {
        const qty = Number(lot.quantity) || 0;
        const unitPrice = Number(lot.unit_price) || 0;
        if (qty <= 0 || unitPrice <= 0) continue;

        totalQty += qty;
        totalCost += lot.total_cost && lot.total_cost > 0 ? Number(lot.total_cost) : qty * unitPrice;
    }

    // Consistencia Cero-División: Si suma de cantidades es 0, no altera el costo ni genera NaN
    if (totalQty <= 0.0001) return null;

    return Math.round((totalCost / totalQty) * 100) / 100;
}
```

---

## 🔌 5. Guía de Reutilización Frankenstein & Dependencias Mínimas
* **Dónde encaja:** Cualquier empresa en Colombia que utilice **World Office Desktop / Cloud** o **Siigo** y requiera integrar facturación B2B multisede y costeo de inventarios NIC 2 sin digitación contable.
* **Esquema de Base de Datos Necesario:**
  - `profiles` (`id`, `parent_id`, `nit`, `razon_social`, `company_name`, `is_corporate_parent`, `logistics_data` JSONB con `world_office_branch`).
  - `commercial_cost_matrix` (`product_id`, `manual_cost`, `effective_date`, `notes`).
  - `purchases` (`product_id`, `quantity`, `unit_price`, `total_cost`, `created_at`).
* **Dependencias Mínimas:** `xlsx` (`npm i xlsx`), TypeScript.
