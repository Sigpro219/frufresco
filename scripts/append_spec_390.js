const fs = require('fs');

const specPath = 'SPEC.md';
const content = `

---

### Escenario 390: Gobernanza de Excedentes de Pesaje en Alistamiento: Bifurcación Botánica entre Columna P (PESADA (-)) y Columna M (VENTA ADICIONAL (-)) Parametrizada por SKU (SDD v1.9.366)

#### 1. Diagnóstico de Gemba y Principio de Indivisibilidad Botánica
- **Given** la operación real de pesaje en muelle y alistamiento de pedidos en \`/ops/picking\`:
  1. En el sector agro-logístico de alimentos perecederos existen dos naturalezas botánicas claramente diferenciadas:
     - **Frutas Indivisibles de Gran Calibre (Papaya, Melón, Patilla, Ahuyama entera):** Por razones biológicas y de inocuidad, el operario de báscula no puede cortar una fruta por la mitad para clavar la balanza en $50,00\\text{ kg}$ exactos. Si el pesaje marca $51\\text{ kg}$ o $52\\text{ kg}$, el diferencial ($+1$ a $+2\\text{ kg}$) constituye una **tolerancia permisible de empaque**. FruFresco asume esa variación operativa y **NO se la cobra al cliente**.
     - **Productos a Granel Divisibles (Plátano, Papa, Tomate, Zanahoria, etc.):** Cada gramo adicional empacado en canastilla **sí se le factura y liquida al cliente** en su remisión conforme al acuerdo de precios pactado.
  2. **Conflicto en la Pantalla de Picking:** El modal de validación de alistamiento bloqueaba al operario con el mensaje *"Cantidad Excede Stock / La cantidad supera el stock disponible en inventario (0 Kg)"* ante stocks digitales en cero y no permitía registrar los kilogramos reales de báscula por encima de lo solicitado.
  3. **Solución Arquitectónica:** Se implementa un conmutador paramétrico en el catálogo maestro por producto que enruta determinísticamente el excedente de báscula hacia la **Columna P (\`PESADA (-)\`)** si no se cobra, o hacia la **Columna M (\`VENTA ADICIONAL (-)\`)** si se factura.

#### 2. Regla Canónica de Parametrización y Bifurcación de Pesaje
- **When** se configura un producto en el Maestro de SKU y se realiza el pesaje en \`/ops/picking\`:
- **Then** el sistema opera bajo las siguientes invariantes innegociables:
  1. **Flag Canónico en Base de Datos (\`products.charge_overweight\`):**
     - \`charge_overweight: boolean\` (por defecto \`true\` para granel estándar; \`false\` para papayas, melones, sandías y ahuyamas).
  2. **Conmutador Visual en Modal de Producto (\`EditProductModal.tsx\` / \`CreateProductModal.tsx\`):**
     - Control tipo Toggle: *«¿Cobrar excedente de pesaje al cliente?»*.
     - *Activado (true):* Todo peso alistado por encima de lo pedido se cobra en la remisión del cliente e impacta la **Columna M (\`VENTA ADICIONAL (-)\`)**.
     - *Desactivado (false):* El cliente paga estrictamente la cantidad pactada; el sobrepeso físico de báscula no se factura y se reporta automáticamente en la **Columna P (\`PESADA (-)\`)** como merma operativa de pesaje.
  3. **Mecánica Transaccional en Alistamiento (\`/ops/picking\`):**
     - Se erradica el bloqueo de stock digital en cero para permitir alistar el pesaje real de la báscula física ($Q_{\\text{pesada}}$).
     - Si $Q_{\\text{pesada}} > Q_{\\text{pedida}}$ con excedente $\\Delta = Q_{\\text{pesada}} - Q_{\\text{pedida}}$:
       * **Caso A (Tolerancia No Cobrada - \`charge_overweight = false\`):**
         - Remisión al cliente: Factura estrictamente $Q_{\\text{pedida}}$ (ej. $50\\text{ kg}$).
         - Kardex: Se inserta un asiento en \`inventory_movements\` con \`type = 'exit'\`, \`reference_type = 'waste_weighing'\`, \`quantity = -\\Delta\`, \`notes = '[MERMA POR PESADA - TOLERANCIA NO FACTURADA] SKU: {sku} (+{\\Delta} kg) | Pedido #{id}'\`.
         - Impacto en Sábana: Consolida en la **Columna P (\`PESADA (-)\`)**.
       * **Caso B (Excedente Facturado - \`charge_overweight = true\`):**
         - Remisión al cliente: Factura $Q_{\\text{pesada}}$ completa (ej. $51\\text{ kg}$, desglosada como base $50\\text{ kg}$ + adición $1\\text{ kg}$).
         - Kardex: El excedente $\\Delta$ se registra con \`reference_type = 'additional_sale'\`.
         - Impacto en Sábana: Consolida en la **Columna M (\`VENTA ADICIONAL (-)\`)**.
  4. **Conservación de Masa Cerrada:**
     En ambos casos, la totalidad de los kilogramos que salieron físicamente de bodega ($50 + 1 = 51\\text{ kg}$) quedan 100% justificados en el Kardex:
     $$S = E + F + G - \\underbrace{H}_{50\\text{ kg}} - \\underbrace{P}_{1\\text{ kg (Tolerancia)}} - \\dots \\quad \\text{ó} \\quad S = E + F + G - \\underbrace{H}_{50\\text{ kg}} - \\underbrace{M}_{1\\text{ kg (Cobrado)}} - \\dots$$
     garantizando que el conteo físico de fin de turno (Columna T) coincida exactamente con el inventario calculado (Columna S).

#### 3. Criterios de Aceptación Contractual (Definition of Done)
1. **Contrato de Datos:** Columna \`charge_overweight\` definida en la arquitectura del catálogo maestro \`products\`.
2. **Toggle en Maestro de SKU:** Presente en la ficha técnica de producto con micro-glosa clara para supervisores.
3. **Flujo de Picking Desbloqueado:** El alistador puede confirmar pesajes reales de báscula sin bloqueos artificiales por inventario digital desfasado.
4. **Alimentación Determinista:** La Columna P consolida exclusivamente mermas de pesaje legítimas no cobradas, erradicando confusiones con ventas adicionales.
`;

fs.appendFileSync(specPath, content, 'utf8');
console.log('Escenario 390 appended successfully to SPEC.md');
