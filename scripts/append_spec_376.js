const fs = require('fs');

const specPath = 'C:/Users/German Higuera/OneDrive/Documentos/Projects/frufresco/SPEC.md';
let specContent = fs.readFileSync(specPath, 'utf8');

const escenario376 = `

---

### Escenario 376: Heredabilidad Canónica de Inventario Inicial desde el Conteo Físico Previo ($T_{D-1} \\to E_D$) en Sábana Oficial (\`/admin/commercial/inventory\`) (SDD v1.9.360)

#### 1. Contexto Operativo y Principio de Continuidad Física
En el Gemba de FruFresco, el inventario con el que amanece la bodega hoy en la **Columna E (Inventario Inicial)** debe reflejar exactamente lo que quedó físicamente contado anoche en estiba en la **Columna T (Conteo Físico / Conteo Agregado)**.

Previamente, si el supervisor u operario no ejecutaba el botón explícito de *«Cierre Diario Oficial»* en \`daily_inventory_closings\`, el sistema no transfería el conteo físico de la jornada anterior, provocando que días futuros o sin congelamiento formal mostraran \`0\` (guiones \`-\`) en el Inventario Inicial.

#### 2. Regla Canónica de Heredabilidad en Cascada
Para garantizar que el balance de masa sea ininterrumpido y resiliente ante omisiones humanas de cierre:

1. **Prioridad 1 — Snapshot de Cierre Oficial:**  
   Si existe un registro formal previo en \`daily_inventory_closings\` para la fecha anterior ($D-1$), hereda su valor oficial congelado (\`bodegaPost10am\` o \`physicalCount\`).
2. **Prioridad 2 — Conteo Físico Auditado en Kardex ($T_{D-1}$):**  
   Si no hubo cierre oficial formal, busca directamente en \`inventory_movements\` el último conteo físico registrado (\`reference_type IN ('blind_count', 'blind_count_shift_close')\` o metadatos \`[BLIND_COUNT_META]\`) previo a la fecha consultada, y asigna dicho valor como la apertura ($E$).
3. **Prioridad 3 — Apertura Operativa de Fecha Activa / Futura:**  
   Si la fecha consultada corresponde a la jornada siguiente ($D+1$, ej: mañana \`2026-11-05\`) y aún no se ha consolidado el conteo de cierre de hoy, el Inventario Inicial hereda el stock físico disponible en bodega (\`inventory_stocks\`), evitando que la pantalla amanezca vacía y permitiendo a Compras y Logística operar sobre existencias reales.
4. **Prioridad 4 — Reconstrucción Retroactiva para Fechas Pasadas:**  
   Para fechas históricas sin cierre ni conteo registrado, el inventario inicial se reconstruye matemáticamente:  
   $$\\text{Inventario Inicial} = \\max(0, \\text{Stock Actual} - \\sum \\Delta_{\\text{posteriores}})$$
`;

specContent += escenario376;
fs.writeFileSync(specPath, specContent, 'utf8');
console.log('Escenario 376 added successfully to SPEC.md');
