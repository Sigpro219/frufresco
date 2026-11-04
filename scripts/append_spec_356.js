const fs = require('fs');

const path = 'C:/Users/German Higuera/OneDrive/Documentos/Projects/frufresco/SPEC.md';
let spec = fs.readFileSync(path, 'utf8');

// 1. Update Header
spec = spec.replace(
  /> \*\*Versión:\*\* 1\.9\.338 \(.*?\)/,
  '> **Versión:** 1.9.339 (Capítulo 44: Poda Canónica de Subtotales de ERP mediante Estilos de Celda (`cellStyles.fgColor !== \\\'FFFF00\\\'`) y Consolidación de Familias sin Doble Imputación en Carga de Inventario Diaria — 76/76 Pantallas Certificadas)'
);

spec = spec.replace(
  /> \*\*Cobertura Canónica:\*\* 10 Dominios, 76 Pantallas Físicas, 44 Capítulos Arquitectónicos, 355 Escenarios BDD Ininterrumpidos \(1\.\.355\)/,
  '> **Cobertura Canónica:** 10 Dominios, 76 Pantallas Físicas, 44 Capítulos Arquitectónicos, 356 Escenarios BDD Ininterrumpidos (1..356)'
);

// 2. Append Escenario 356
const escenario356 = `
---

### Escenario 356: Poda Canónica de Subtotales de ERP mediante Estilos de Celda (\`cellStyles.fgColor !== 'FFFF00'\`) y Consolidación de Familias sin Doble Imputación en Carga de Inventario Diaria (\`daily_inventory_closings\`, \`inventory_stocks\`) (SDD v1.9.339)
- **Given** los reportes consolidados de inventario físico exportados desde ERPs contables (ej. \`INVENTARIO 2810.xlsx\`), la tabla oficial de congelamiento (\`daily_inventory_closings\`), las existencias en bodega (\`inventory_stocks\`) y la Sábana Diaria de Control Operativo (\`/admin/inventory/daily-monitor\`, \`src/components/InventoryDailyBalanceTab.tsx\`),
- **When** se procesa la carga oficial de inventario para establecer el saldo inicial inmutable de la jornada y sincronizar el inventario físico en suelo:
- **Then** el motor de ingesta y des-duplicación garantiza la diferenciación estricta entre referencias de detalle físico y filas de subtotal de familia:
  1. **Aislamiento Determinístico por Estilo de Relleno (\`fgColor === 'FFFF00'\`):**
     - El pipeline analiza la metadata nativa de estilos de celda (\`cellStyles: true\`), identificando que el ERP exporta las líneas de subtotal y resumen de familia con relleno amarillo sólido (\`fgColor: { rgb: 'FFFF00' }\`), mientras que las referencias físicas contadas en bodega son filas blancas sin relleno.
     - Se establece la regla canónica de ingesta: **se excluyen al 100% las filas amarillas de subtotal (\`56 filas\`) y se cargan exclusivamente las filas blancas de detalle real (\`119 SKUs únicos\`)**, totalizando una masa física exacta de **\`12.387,40 kg/und\`** (erradicando la inflación artificial del reporte bruto a 23.563 kg).
  2. **Prevención de Duplicación en Familias con Códigos Asimétricos Padre-Hijo:**
     - En familias donde la existencia física correspondía a una sub-referencia hija sin existencia de la base estándar (ejemplo: *Cebolla Cabezona Roja Sin Pelar* \`#1196\` con 765 kg y *Cebolla Cabezona Roja Base* \`#107\` con 0 kg), el subtotal amarillo del ERP imprimía el código del padre (\`#107\` por 765 kg).
     - Al ignorar la fila amarilla \`#107\`, el sistema asigna 765 kg únicamente a \`#1196\` y 0 kg a \`#107\`, evitando que la familia consolide $765 + 765 = 1.530$ kg (eliminando los 765 kg duplicados).
  3. **Reseteo Atómico de Subtotales Fantasma en \`inventory_stocks\`:**
     - El pipeline actualiza en caliente los 119 productos contados en la *Bodega Principal FruFresco* y resetea a \`quantity = 0\` de forma atómica cualquier SKU padre que haya quedado inflado por cargas previas (\`#107\`, \`#110\`, \`#154\`, \`#158\`, \`#191\`, \`#866\`, \`#844\`, \`#1202\`), sincronizando la disponibilidad viva del WMS y TMS con la realidad física del Gemba.
`;

if (!spec.includes('Escenario 356')) {
  spec = spec.trimEnd() + '\n' + escenario356;
  fs.writeFileSync(path, spec, 'utf8');
  console.log('Appended Escenario 356 and updated header to v1.9.339 successfully');
} else {
  console.log('SPEC.md already contains Escenario 356');
}
