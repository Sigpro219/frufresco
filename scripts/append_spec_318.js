const fs = require('fs');
const file = 'SPEC.md';
let content = fs.readFileSync(file, 'utf8');

const escenario318 = `
---

### Escenario 318: Ratificación y Refinamiento Forense del Monitor de Demanda y Precios Facturados por Producto con Exportación Excel (Gemba Detalles Pedidos: Hallazgo 9) (SDD v1.9.300)
- **Given** la necesidad operativa y comercial de auditar qué clientes solicitaron determinado producto en una fecha dada y a qué precio fue facturado (\`DETALLES_PEDIDOS.docx\`, Hallazgo 9),
- **When** el área comercial, mesa de facturación o atención al cliente ingresa a \`/admin/commercial?tab=daily-monitor\` (Monitor Diario BI de Despacho) y consulta un SKU:
- **Then** el sistema ratifica y garantiza los siguientes cuatro (4) estándares de consulta y extracción de datos:
  1. **Disponibilidad Directa en Barra de Navegación y Pestañas:**
     - En el menú principal de operaciones y en la cabecera de \`/admin/commercial\`, se encuentra disponible en 1 clic la pestaña canónica: **\`Monitor Diario BI\`** (\`tab=daily-monitor\`).
  2. **Acceso Dual a la Radiografía de Demanda por Producto:**
     - **Vía Rápida desde Consolidado de Ventas:** En la pestaña *2. Ventas por Producto*, cada fila dispone del botón interactivo **\`Ver quién pidió\`** con flecha Lucide, transfiriendo de inmediato el foco a la radiografía del producto seleccionado.
     - **Vía Directa desde Drill-Down:** En la pestaña *3. ¿Quién pidió este producto? (Drill-down)*, un selector desplegable con conteo de kilos y pedidos permite alternar instantáneamente entre cualquiera de los productos solicitados en el día.
  3. **Tabla Granular Multilínea y Búsqueda Omnibox Reactiva:**
     - La tabla desglosa cada solicitud con: **No. Pedido**, **Cliente (Sucursal Receptora)**, **Zona Logística**, **Cantidad Pedida**, **Precio Facturado ($)**, **Costo Base ($)**, **Total Facturado ($)**, **Utilidad ($)** y **Margen (%)**.
     - Se garantiza el soporte multilínea (si un cliente pidió diferentes presentaciones del mismo SKU en un pedido, ninguna se omite) y filtrado reactivo desde el Omnibox superior por cliente, pedido o zona.
  4. **Exportación Canónica a Excel (.xlsx):**
     - El botón **\`Descargar Excel (.xlsx)\`** genera de forma nativa e instantánea el archivo \`Reporte_Comercial_BI_[FECHA]_drilldown.xlsx\` conteniendo todos los registros visibles con formato numérico y monetario limpio para análisis comercial sin reprocesos.
`;

fs.writeFileSync(file, content.trimEnd() + '\n' + escenario318.trimStart(), 'utf8');
console.log('Appended Escenario 318 to SPEC.md successfully');
