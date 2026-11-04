const fs = require('fs');
const file = 'SPEC.md';
let content = fs.readFileSync(file, 'utf8');

// Renumber scenario 12446 from 319 to 320
content = content.replace(
  '### Escenario 319: Ergonomía y Legibilidad de Alto Contraste en Sábana de Alistamiento Impresa (Zebra Striping Industrial & Tipografía Lean de Planta) (Gemba Feedback Sábana: Hallazgo 1) (SDD v1.9.301)',
  '### Escenario 320: Ergonomía y Legibilidad de Alto Contraste en Sábana de Alistamiento Impresa (Zebra Striping Industrial & Tipografía Lean de Planta) (Gemba Feedback Sábana: Hallazgo 1) (SDD v1.9.301)'
);

// Renumber scenario 12465 from 320 to 321
content = content.replace(
  '### Escenario 320: Estandarización de Matriz de Rentabilidad en Torre de Control — Encabezados Sticky Docked, Superbuscador Omnibox y Ordenadores Dinámicos en Columnas (Gemba Galería 4) (SDD v1.9.298)',
  '### Escenario 321: Estandarización de Matriz de Rentabilidad en Torre de Control — Encabezados Sticky Docked, Superbuscador Omnibox y Ordenadores Dinámicos en Columnas (Gemba Galería 4) (SDD v1.9.302)'
);

// Add Escenario 322 for Hallazgo 2
const escenario322 = `
---

### Escenario 322: Garantía Universal de Asignación y Orden Físico Secuencial de Bahías de Muelle en Sábana de Alistamiento (Gemba Feedback Sábana: Hallazgo 2) (SDD v1.9.303)
- **Given** el reporte de la mesa de operaciones de bodega donde los pedidos se imprimían en la sábana de alistamiento con el identificador de muelle vacío (\`S/A\` - Sin Asignar) y en orden no coincidente con el recorrido físico en suelo (\`Feedback_sabana_alistamiento.docx\`, Hallazgo 2),
- **When** se compila y genera la matriz de alistamiento para cualquier jornada de despacho en \`/admin/orders/alistamiento-print\`:
- **Then** el sistema ratifica e impone los siguientes tres (3) estándares operativos:
  1. **Asignación Universal Automática de Bahías (\`ensureUniversalStagingSpaces\`):**
     - Toda orden que arribe a la sábana de alistamiento sin bahía física previa ejecuta el motor de asignación volumétrica por cubicaje de canastillas (\`calculateCratesAndSpaces\`) y clúster geográfico de ruta (\`deduceGeographicZone\`), asignando slots contiguos (del 1 al 150).
     - Queda estrictamente erradicada la presencia de leyendas \`S/A\` (Sin Asignar) en la columna \`LUGAR\` para pedidos activos en jornada de despacho.
  2. **Ordenamiento Ascendente Secuencial por Bahía en Suelo:**
     - La sábana de alistamiento nocturno organiza todos los pedidos de forma estrictamente ascendente según su primera bahía física (\`first_space\`: 1, 2, 3, 4, 5...), permitiendo que los operarios alisten en línea recta por el pasillo de muelle sin retrocesos ni cruces entre cuadrillas.
  3. **Inmunidad en Hojas Multicélula:**
     - En cada hoja (\`printableSheets\`), los pedidos filtrados con demanda activa preservan idéntica secuencia física de muelle, garantizando que el alistador de aguacates, hortalizas o frutas recorra exactamente las mismas bahías en idéntico orden que el alistador de secos y procesados.
`;

content = content.trimEnd() + '\n' + escenario322.trimStart();
fs.writeFileSync(file, content, 'utf8');
console.log('Successfully updated SPEC.md with Escenarios 320, 321 and 322');
