const fs = require('fs');
const path = require('path');

const specPath = 'SPEC.md';
let spec = fs.readFileSync(specPath, 'utf8');

const targetPoint5End = `         - *Vista de Productos:* Nombre, Categoría, Cantidad Total (\`totalQuantity\`), Pedidos (\`ordersCount\`), Precio Promedio, Costo Base, Total Venta (\`totalSales\`), Utilidad (\`grossProfit\`), Margen Ponderado (\`marginPct\`).`;

const newPoints = `         - *Vista de Productos:* Nombre, Categoría, Cantidad Total (\`totalQuantity\`), Pedidos (\`ordersCount\`), Precio Promedio, Costo Base, Total Venta (\`totalSales\`), Utilidad (\`grossProfit\`), Margen Ponderado (\`marginPct\`).
  6. **Paginación PostgREST >1000 Filas, Erradicación de "Producto Agro", Prevalencia de Accounting ID y Categorías Completas (Hallazgo 7 - SDD v1.9.287):**
     - **Causa Raíz de "Producto Agro":** La tabla \`products\` cuenta con 1.362 registros. Supabase PostgREST trunca a 1.000 filas por llamada HTTP. Consultas directas sin paginación truncaban los productos 1.001 a 1.362 (entre ellos *Cebolla cabezona blanca cero sin pelar*, \`accounting_id = 1502\`), provocando que las órdenes del día cayeran en el fallback defensivo \`'Producto Agro'\`. Se implementó la utilidad \`fetchAll\` con paginación secuencial en bloques de 1.000 para \`products\`, \`profiles\` y \`commercial_cost_matrix\`, asegurando el 100% de match de catálogo con datos reales en vivo.
     - **Prevalencia de Código Contable World Office:** Se consagra la visualización de \`accounting_id\` contable sobre el SKU interno: \`{p.accountingId ? \`Cód: #\${p.accountingId}\` : \`SKU: \${p.sku}\`}\`.
     - **Categorías Completas:** Se sustituyen las abreviaturas crípticas (\`HO\`, \`VE\`, \`FR\`, etc.) por nombres institucionales canónicos (\`Hortalizas\`, \`Verduras\`, \`Frutas\`, etc.) mediante \`CATEGORY_MAP\`.`;

if (!spec.includes(targetPoint5End)) {
    console.error('Target not found in SPEC.md');
    process.exit(1);
}

spec = spec.replace(targetPoint5End, newPoints);
fs.writeFileSync(specPath, spec, 'utf8');
console.log('Successfully updated SPEC.md with Hallazgo 7!');
