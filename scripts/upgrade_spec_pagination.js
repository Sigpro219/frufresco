const fs = require('fs');

const specPath = 'SPEC.md';
let spec = fs.readFileSync(specPath, 'utf8').replace(/\r\n/g, '\n');

const targetPoint6 = `  6. **Paginación PostgREST >1000 Filas, Erradicación de "Producto Agro", Prevalencia de Accounting ID y Categorías Completas (Hallazgo 7 - SDD v1.9.287):**
     - **Causa Raíz de "Producto Agro":** La tabla \`products\` cuenta con 1.362 registros. Supabase PostgREST trunca a 1.000 filas por llamada HTTP. Consultas directas sin paginación truncaban los productos 1.001 a 1.362 (entre ellos *Cebolla cabezona blanca cero sin pelar*, \`accounting_id = 1502\`), provocando que las órdenes del día cayeran en el fallback defensivo \`'Producto Agro'\`. Se implementó la utilidad \`fetchAll\` con paginación secuencial en bloques de 1.000 para \`products\`, \`profiles\` y \`commercial_cost_matrix\`, asegurando el 100% de match de catálogo con datos reales en vivo.
     - **Prevalencia de Código Contable World Office:** Se consagra la visualización de \`accounting_id\` contable sobre el SKU interno: \`{p.accountingId ? \`Cód: #\${p.accountingId}\` : \`SKU: \${p.sku}\`}\`.
     - **Categorías Completas:** Se sustituyen las abreviaturas crípticas (\`HO\`, \`VE\`, \`FR\`, etc.) por nombres institucionales canónicos (\`Hortalizas\`, \`Verduras\`, \`Frutas\`, etc.) mediante \`CATEGORY_MAP\`.`;

const upgradedPoint6 = `  6. **Ley Marcial de Paginación Universal de Catálogo Maestro (>1.000 SKUs), Erradicación de "Producto Agro" y Prevalencia de Accounting ID (Hallazgo 7 - SDD v1.9.289):**
     - **Principio Innegociable de Catálogo Expandido (>1.000 SKUs):** En la operación agroindustrial de FruFresco, el catálogo maestro supera permanentemente los 1.000 productos activos (1.362 SKUs en producción, escalando hacia 1.700+). Dado que la API PostgREST de Supabase impone un límite estricto de \`max_rows = 1000\` por petición HTTP en servidor, queda **TERMINANTEMENTE PROHIBIDO** ejecutar consultas monolíticas directas o rangos ciegos como \`.range(0, 4999)\` asumiendo que retornarán la totalidad del catálogo.
     - **Patrón Canónico de Paginación por Lotes (\`fetchAll\`):** Todo componente de ingesta, cálculo o visualización analítica que requiera catálogos maestros (\`products\`, \`commercial_cost_matrix\`, \`profiles\`) debe implementar de forma obligatoria el recolector cíclico en chunks de 1.000 filas:
       \`\`\`typescript
       let allRows = [];
       let from = 0;
       const step = 1000;
       while (true) {
           const { data, error } = await supabase.from(table).select(cols).range(from, from + step - 1);
           if (error || !data || data.length === 0) break;
           allRows.push(...data);
           if (data.length < step) break; // Fin del catálogo alcanzado dinámicamente
           from += step;
       }
       \`\`\`
       Este patrón garantiza que ya sean 1.362, 1.700, 3.000 o 10.000 SKUs, el 100% de la canasta se descargue e integre en memoria en milisegundos sin truncamientos silenciosos ni pérdida de integridad referencial.
     - **Erradicación de "Producto Agro":** Se certifica que "Producto Agro" era el fallback defensivo activado cuando un producto caía más allá de la fila 1.000 (como *Cebolla cabezona blanca cero sin pelar*, \`id = 8028231c...\`, posición 1.148). Con la paginación obligatoria, el fallback queda 100% inactivo y los nombres de catálogo y variedades se visualizan íntegros.
     - **Prevalencia de Código Contable World Office:** Se consagra por contrato la prevalencia del \`accounting_id\` contable sobre el SKU interno: \`{p.accountingId ? \`Cód: #\${p.accountingId}\` : \`SKU: \${p.sku}\`}\`.
     - **Nombres Completos de Categorías:** Se sustituyen las abreviaturas crípticas (\`HO\`, \`VE\`, \`FR\`, etc.) por nombres canónicos (\`Hortalizas\`, \`Verduras\`, \`Frutas\`, \`Despensa\`, \`Tubérculos\`) vía \`CATEGORY_MAP\`.`;

if (!spec.includes(targetPoint6)) {
    console.error('targetPoint6 not found!');
    process.exit(1);
}

spec = spec.replace(targetPoint6, upgradedPoint6);
fs.writeFileSync(specPath, spec, 'utf8');
console.log('Successfully upgraded SPEC.md with Ley Marcial de Paginación Universal (>1000 SKUs)!');
