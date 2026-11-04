const fs = require('fs');

const specPath = 'C:/Users/German Higuera/OneDrive/Documentos/Projects/frufresco/SPEC.md';
let specContent = fs.readFileSync(specPath, 'utf8');

const escenario375 = `

---

### Escenario 375: Sincronización Reactiva de Ventas en Tiempo Real por Lanzamiento Operativo (\`para_compra\`) en la Sábana Oficial (\`/admin/commercial/inventory\`) (SDD v1.9.359)

#### 1. Contexto Operativo y Causa Raíz
Previamente, la **Sábana Oficial de Balance Diario de 24 Columnas** (\`src/components/InventoryDailyBalanceTab.tsx\`) poblaba las columnas de ventas únicamente si existían asientos previos en la tabla \`inventory_movements\` con \`reference_type = 'order_item'\`. En consecuencia, al confirmarse el lanzamiento de la tanda en \`/admin/orders/loading\` (transición masiva de pedidos a \`para_compra\`), las columnas **VENTA (KG)** (Col H) y **VENTA (UND)** (Cols I/J) permanecían en guiones (\`-\`), obligando al usuario a digitar manualmente o importar archivos externos.

#### 2. Contrato de Ingesta Reactiva en Tiempo Real
1. **Trigger Vinculante de Demanda:**
   - En el instante en que los pedidos de una fecha de entrega (\`delivery_date\`) son enviados a compras y bodega (\`orders.status IN ('para_compra', 'approved', 'picking', 'shipped', 'delivered')\`), la totalidad de sus líneas de detalle (\`order_items\`) queda consolidada como la **demanda comercial oficial** de esa jornada.
2. **Motor de Agregación Determinista (\`committedSalesMap\`):**
   - Durante la carga del balance (\`loadDailyData\`), el sistema consulta los pedidos con \`delivery_date = balanceDate\` en estado operativo activo.
   - En lotes controlados (batch size 100), extrae \`order_items (product_id, quantity)\` y totaliza la demanda física en un mapa indexado $O(1)$ por \`product_id\`.
3. **Distribución Canónica en las Columnas de Venta:**
   - **Productos por Peso (Kg):** La cantidad total se suma a la **Columna H (\`colH_salesKg\`)**.
   - **Productos por Unidades/Bandejas/Atados (\`isUnit\`):** 
     - La cantidad de piezas se suma a la **Columna I (\`colI_salesUnits\`)**.
     - La masa equivalente en kilogramos se calcula multiplicando por el peso parametrizado del SKU (\`p.weight_kg || 1\`) y se suma a la **Columna J (\`colJ_weightSalesUnits\`)**.
4. **Ecuación de Balance Inmediata:**
   - El **Inventario Calculado (Columna S)** descuenta automáticamente las ventas agregadas:
     $$\\mathbf{S} = \\mathbf{E} + \\mathbf{F} + \\mathbf{G} - \\mathbf{H} - \\mathbf{J} - \\mathbf{K} + \\mathbf{L} - \\mathbf{M} - \\mathbf{N} + \\mathbf{O} - \\mathbf{P} - \\mathbf{Q} - \\mathbf{R}$$
   - Si el Inventario Inicial ($E$) es inferior a la demanda ($H + J$), la Columna S refleja de inmediato la necesidad neta de compra o déficit operativo, sincronizando las decisiones de abastecimiento en Corabastos.
5. **Convivencia con el Modo Edición Manual:**
   - Si el supervisor activa el **\`[ Modo Edición ]\`** y digita un ajuste extraordinario en las columnas de venta, el sistema preserva la venta comprometida de órdenes y le suma/ajusta el diferencial registrado por el supervisor con auditoría en \`inventory_movements\`.
`;

specContent += escenario375;
fs.writeFileSync(specPath, specContent, 'utf8');
console.log('Escenario 375 added successfully to SPEC.md');
