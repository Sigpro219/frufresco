const fs = require('fs');

const specPath = 'SPEC.md';
const content = `

---

### Escenario 389: Gobernanza Canónica de la Columna M (VENTA ADICIONAL (-)): Desacople Automático entre Venta Ordinaria de Tanda y Pedidos Extemporáneos Post-Corte (SDD v1.9.365)

#### 1. Diagnóstico de Gemba y Principio de Tanda Cerrada
- **Given** la operación diaria de toma de pedidos, abastecimiento y despacho en FruFresco:
  1. La tanda principal de pedidos para la jornada de entrega $D$ se consolida y sella a la **hora de corte oficial** (\`cutoff_hour_admin\`, 20:00 / 8:00 PM del día $D-1$) en \`/admin/orders/loading\`, pasando los pedidos al estado \`para_compra\`.
  2. Los pedidos consolidados dentro de esa ventana legal constituyen la **Venta Ordinaria** y alimentan exclusivamente las columnas **Col H (\`VENTA (KG)\`)** y **Col I (\`VENTA (UND)\`)**.
  3. No obstante, en la realidad comercial, clientes institucionales y restaurantes radican pedidos extemporáneos o ampliaciones de emergencia después del corte (ej. 10:30 PM de la noche o 5:00 AM de la madrugada de entrega).
  4. **Principio Lean de Protección de Tanda (SDD §30.2.1):** Reabrir o regenerar la tanda principal de la madrugada rompería las compras de Corabastos y los albaranes de picking ya impresos. Por ello, todo pedido que ingrese con posterioridad al corte para esa misma fecha de entrega se procesa bajo el concepto canónico de **«Venta Adicional»**.
  5. En la Sábana Oficial de Balance Diario de Inventarios, la salida física de estos pedidos extemporáneos debe descontarse en la **Columna M (\`VENTA ADICIONAL (-)\`)**, manteniéndose estrictamente segregada de la venta ordinaria (Cols H e I).

#### 2. Regla Canónica de Conexión con el Módulo de Pedidos
- **When** la Sábana de Inventario consulta los pedidos activos para la fecha contable \`delivery_date = balanceDate\`:
- **Then** el sistema discrimina automáticamente los ítems demandados según su estampa temporal de radicación respecto a la hora de corte:
  1. **Determinación del Hito de Corte (Cutoff Milestone):**
     Para una fecha de entrega $D$, el límite de la tanda ordinaria es:
     $$\\text{Timestamp Corte} = (D - 1\\text{ día}) \\text{ a las } \\text{cutoff\\_hour\\_admin (ej. 20:00:00)}$$
  2. **Enrutamiento Determinista a Columnas:**
     - **Caso A (Venta Ordinaria en Tanda):**
       $$\\text{orders.created\\_at} \\le \\text{Timestamp Corte} \\implies \\text{Col H (Kg)} \\text{ o } \\text{Col I (Und)}$$
     - **Caso B (Venta Adicional Extemporánea Post-Corte):**
       $$\\text{orders.created\\_at} > \\text{Timestamp Corte} \\implies \\text{Col M (VENTA ADICIONAL)}$$
  3. **Jerarquía y Sumatoria de Masa:**
     - Para cada SKU específico, la Columna M suma la masa en kilogramos de todos los pedidos extemporáneos de esa fecha.
     - Las familias padre consolidan la sumatoria de sus ventas adicionales propias más las de sus calibres hijos.
     - Coexiste con registros manuales en celda M o vía \`InventoryAdditionalSalesModal\` (\`inventory_movements\` con \`reference_type = 'additional_sale'\`).
  4. **Ecuación de Conservación de Masa:**
     La salida por venta adicional descuenta de forma limpia y transparente en la ecuación del inventario calculado:
     $$S = E + F + G - \\underbrace{(H + I)}_{\\text{Venta Ordinaria}} - K + L - \\underbrace{M}_{\\text{Venta Adicional}} - N + O - P - Q - R$$

#### 3. Criterios de Aceptación Contractual (Definition of Done)
1. **Renombrado Oficial:** La columna M asume en cabecera y especificaciones el nombre canónico **\`VENTA ADICIONAL\`** (\`Vta. Adicional\`).
2. **Conexión Transaccional con Pedidos:** La lógica de ingesta clasifica automáticamente las órdenes según el umbral de corte, derivando los pedidos post-corte a la Columna M.
3. **Auditabilidad:** Los despachos de última hora quedan perfectamente trazados sin mezclar la venta programada con las excepciones comerciales.
`;

fs.appendFileSync(specPath, content, 'utf8');
console.log('Escenario 389 appended successfully to SPEC.md');
