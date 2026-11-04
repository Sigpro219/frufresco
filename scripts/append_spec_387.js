const fs = require('fs');

const specPath = 'SPEC.md';
const content = `

---

### Escenario 387: Deuda Técnica DT-12: Consolidación Reactiva de Compras Intradiarias por SKU Específico en Columna G (COMPRAS (+)) de la Sábana de Balance Diario (SDD v1.9.363)

#### 1. Diagnóstico de Gemba y Brecha Operativa
- **Given** la operación real de abastecimiento en Corabastos y proveedores directos capturada a través del submódulo de compras en \`/ops/compras\`:
  1. El comprador de plaza registra cada adquisición física (ej. $50\\text{ kg}$ de Papaya / Plátano a $\$6.500/\\text{kg}$), insertando un registro en la tabla transaccional \`purchases\` vinculado a la tarea del día (\`procurement_tasks\` con \`delivery_date = balanceDate\`).
  2. En la Sábana Oficial de Balance Diario de Inventarios (\`src/components/InventoryDailyBalanceTab.tsx\`), la **Columna G (\`COMPRAS (+)\`)** actualmente consulta únicamente la tabla \`inventory_movements\` con \`reference_type in ('purchase_reception', 'purchase', 'entry')\`.
  3. Al no existir un puente de sincronización automática entre \`purchases\` y la sábana, la Columna G permanece en guión neutro (\`-\`), desconectada de las compras reales de plaza.
  4. **Consecuencia en Conservación de Masa:** El inventario calculado final (Columna S: $S = E + F + G - H - I - \\dots$) descuenta las ventas de los pedidos pero ignora los kilos que entraron físicamente por compras, arrojando stocks teóricos negativos o descuadres irreales ante la supervisión de planta.

#### 2. Regla Canónica de Consolidación por SKU Específico
- **When** se cargan los datos de la jornada contable (\`balanceDate\`) en la Sábana de Balance Diario:
- **Then** el sistema define como deuda técnica contractual (**DT-12**) la consolidación de la Columna G bajo los siguientes principios innegociables:
  1. **Sumatoria Multi-Lote Intradiaria:**
     Para un producto específico $p$ (SKU hijo o padre independiente) y fecha de balance $d$, el valor canónico de Compras es la suma de todos los lotes adquiridos durante esa jornada:
     $$G_{p, d} = \\sum_{i=1}^{n} \\text{quantity}_{i} \\quad \\forall \\, i \\in \\text{purchases}(p, d)$$
     *Ejemplo Gemba:* Si un comprador adquiere $30\\text{ kg}$ de Plátano a las 4:00 AM (Lote 1) y $20\\text{ kg}$ de refuerzo a las 6:30 AM (Lote 2), la celda de la Columna G debe consolidar exactamente $50\\text{ kg}$.
  2. **Agregación Jerárquica Padre-Hijo:**
     - **Fila de SKU Específico (Hijo):** Desagrega la compra exacta de ese calibre, variedad o presentación.
     - **Fila de Familia (Padre):** Totaliza automáticamente sus compras directas más la sumatoria de las compras de todos sus calibres hijos:
       $$G_{\\text{Padre}} = G_{\\text{propio}} + \\sum_{c \\in \\text{hijos}} G_{c}$$
  3. **Coexistencia con Entradas y Ajustes Manuales:**
     Si en muelle de recepción o mediante el Modo Edición de la sábana se ingresan recepciones directas en \`inventory_movements\` (\`purchase_reception\`), la Columna G suma ambas fuentes sin duplicar:
     $$G_{\\text{total}} = \\sum \\text{purchases}(p, d) + \\sum \\text{inventory\\_movements}_{\\text{entry}}(p, d)$$

#### 3. Criterios de Aceptación Contractual (Definition of Done DT-12)
1. **Ingesta Transaccional en Sábana:** \`InventoryDailyBalanceTab.tsx\` consulta en \`fetchData()\` las compras de la tabla \`purchases\` asociadas a las tareas de \`procurement_tasks\` de esa \`delivery_date\` (o timestamp \`created_at\` dentro del rango del día).
2. **Despliegue Visual Ergonómico:** Se formatea con 2 decimales estándar (\`50,00\`), tipografía oscura destacada (\`#0F172A\`) y guión neutro (\`-\`) si no hubo compras.
3. **Totales del Pie de Tabla:** La celda de pie \`totalG\` totaliza la masa global de todas las compras del día.
4. **Conservación de Masa:** La ecuación de la Columna S ($S = E + F + G - H - I - \\dots$) absorbe la entrada física de compras, equilibrando el balance teórico con la realidad de bodega.
`;

fs.appendFileSync(specPath, content, 'utf8');
console.log('Escenario 387 appended successfully to SPEC.md');
