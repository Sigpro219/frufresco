const fs = require('fs');

const specPath = 'SPEC.md';
const content = `

---

### Escenario 388: Clean Boundary Harness (Cable Pelado): Origen Exclusivo de Columna O (DEVOLUCIONES (+)) desde el Módulo de Gestión de Calidad (Angie Rivas) (SDD v1.9.364)

#### 1. Diagnóstico de Gemba y Principio de Inocuidad
- **Given** la operación de entregas y devoluciones de ruta en FruFresco:
  1. Cuando un cliente institucional o restaurante rechaza mercancía en punto de entrega (por calibre, sobremaduración, rotura o cancelación), el conductor reembarca el producto en el furgón.
  2. Al arribar el vehículo a bodega, dicho producto **NO puede reingresar automáticamente al stock vendible ni ser digitado a discreción en la sábana**.
  3. **Riesgo Sanitario y Operativo:** Reingresar producto devuelto sin inspección de inocuidad corre el riesgo de mezclar producto contaminado o dañado con fruta fresca de primera calidad, generando quejas en cascada en las rutas de la tarde o del día siguiente.
  4. Por control interno y aseguramiento de calidad, la **Columna O (\`DEVOLUCIONES (+)\`)** debe nutrirse de forma **exclusiva y vinculante** desde el **Módulo de Gestión de Calidad** (liderado por **Angied Rivas / Angie**).

#### 2. Arquitectura de "Cable Pelado" (Clean Boundary Harness)
- **When** se formalice y diseñe el flujo de inspección de patio con Angie en Gestión de Calidad:
- **Then** el sistema deja preparado y congelado el arnés de integración (**Clean Boundary Harness**) bajo las siguientes invariantes contractuales:
  1. **Bifurcación Determinista de Calidad en Cuarentena:**
     Toda devolución que arriba del furgón entra a estado transitorio de *Cuarentena*. El inspector de calidad (Angie / equipo de calidad) ejecuta la inspección física y emite uno de dos dictámenes:
     - **Dictamen Apto (Reingreso a Stock Vendible):** El producto está fresco, íntegro y apto $\\to$ Se emite registro en el arnés de **Columna O (\`DEVOLUCIONES (+)\`)**, sumando al balance de masa ($S$).
     - **Dictamen No Conforme (Baja / Merma):** El producto está averiado, golpeado o inservible $\\to$ Se desvía hacia **Columna Q (\`DESPERDICIO / AVERÍA (-)\`)**, soportado con evidencia fotográfica obligatoria.
  2. **Contrato de Integración del Arnés (Payload Inmutable):**
     El módulo de Gestión de Calidad disparará la inserción en \`inventory_movements\` con la siguiente firma canónica:
     \`\`\`typescript
     interface QualityReturnHarnessPayload {
       product_id: string;              // SKU específico inspeccionado
       warehouse_id: string;            // Bodega principal de recepción
       quantity: number;                // Kilos o unidades netas aprobadas
       type: 'entry';                   // Entrada al Kardex
       reference_type: 'route_return';  // Subtipo canónico de devolución de ruta
       reference_id: string;            // ID de la PQR, RNC o Acta de Calidad
       evidence_url?: string;           // Registro fotográfico del estado del producto
       notes: string;                   // '[DICTAMEN CALIDAD - Angie Rivas] Reingreso Conforme PQR #{pqr_number}: {motivo}'
       created_at: string;              // Timestamp de la jornada de auditoría
     }
     \`\`\`
  3. **Blindaje en la Sábana de Inventario (\`InventoryDailyBalanceTab.tsx\`):**
     - La celda de la Columna O en la sábana queda configurada como un receptor del arnés de Calidad.
     - Su lectura ya está implementada y lista:
       $$\\text{Col O} = \\sum \\text{inventory\\_movements}(\\text{ref} \\in ('route\\_return', 'return', 'devolucion'))$$
     - Cuando el módulo de Angie emita los dictámenes, la Columna O se poblará automáticamente sin requerir cirugías adicionales en la sábana.

#### 3. Criterios de Aceptación Contractual (Definition of Done)
1. **Cable Pelado Documentado:** Contrato de payload y reglas de bifurcación (Apto $\\to$ Col O vs Avería $\\to$ Col Q) congelados en SPEC.md y manual_inventory_pipeline_guide.md.
2. **Alineación con Angie:** El equipo técnico y de negocio dispone de la especificación lista para la sesión de codiseño con Angie Rivas.
3. **Integridad de Masa:** Los kilogramos aprobados en Columna O suman exactamente al cálculo de bodega ($S$ y $U$), manteniendo la ecuación de conservación de masa estricta.
`;

fs.appendFileSync(specPath, content, 'utf8');
console.log('Escenario 388 appended successfully to SPEC.md');
