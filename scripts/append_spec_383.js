const fs = require('fs');

const specContent = `
---

### Escenario 383: Desagregación Dual de Ventas: Restricción Canónica Kg vs Unidades y Micro-Badges de Presentación Física (\`Col H\` vs \`Col I/J\`)

#### 1. Principio de Gobernanza Operativa y Separación Estricta de Unidades
En la Sábana Oficial de Balance Diario de 24 Columnas (\`src/components/InventoryDailyBalanceTab.tsx\`), los productos frutihortícolas conviven en dos regímenes de compra y venta:
1. **Régimen de Compra por Kilogramos (\`unit_of_measure === 'kg'\`):**
   - Productos como Banano urabá, Mandarina arrayana, Mango tommy, Apio, etc.
   - **Gobernanza Columna H (\`VENTA (KG)\`):** Registra el peso total consolidado en Kilogramos (ej. \`11,20\` kg).
   - **Restricción Canónica Columna I (\`VENTA (UND)\`) y Columna J (\`PESO (UND)\`):** Se restringen estrictamente a guión neutro (\`-\`), impidiendo contaminación o duplicidad en las columnas de unidades.
   - **Micro-Badges de Presentación Física:** Cuando el pedido fue formulado por unidades de calibre/gramaje específico (ej. 70 unidades de 160 gr = 11.2 Kg), la Columna H renderiza directamente bajo la cifra numérica un micro-badge compacto en tono amarillo cálido (\`#FEF08A\` / texto \`#854D0E\`, borde \`#FDE047\`) con la instrucción física exacta (ej. \`70 und de 160 gr\`).
2. **Régimen de Compra por Unidades (\`unit_of_measure === 'Unidad'\`):**
   - Productos como Cubeta de huevos, Flores, Bandejas, etc.
   - **Gobernanza Columna H (\`VENTA (KG)\`):** Permanece estrictamente en guión neutro (\`-\`).
   - **Gobernanza Columna I (\`VENTA (UND)\`):** Registra la cantidad entera en unidades despachadas (ej. \`3\` unidades).
   - **Gobernanza Columna J (\`PESO (UND)\`):** Registra la equivalencia de peso en kilogramos calculada a partir del peso unitario del catálogo (\`units * weight_kg\`, ej. \`5,85\` kg), restando dicho peso de la ecuación de balance $S = E + F + G - H - J - ...$.

#### 2. Transducción de Datos Estructurados desde \`order_items\`
El pipeline de carga (\`loadDailyData\`) consulta en tiempo real los registros de \`order_items\` vinculados a pedidos en estado operativo (\`para_compra\`, \`approved\`, \`picking\`, \`shipped\`, \`delivered\`):
- Extrae \`selected_options._physical_instruction\` o deriva automáticamente la instrucción a partir de \`_original_qty\` + \`Presentación\` (ej. \`"70 und de 160 gr"\`).
- Mapea de forma reactiva hacia \`committedSalesMap\` y genera el agregado \`CommittedSaleData\` con \`totalKg\`, \`totalUnits\` y \`unitNotes: string[]\`.
- En el agrupamiento jerárquico de familias padre-hijo, las micro-notas de las presentaciones hijas se enrollan limpiamente al registro consolidado de la familia sin duplicados.
`;

fs.appendFileSync('SPEC.md', specContent, 'utf8');
console.log('SPEC.md updated with Escenario 383 successfully.');
