const fs = require('fs');

const specPath = 'C:/Users/German Higuera/OneDrive/Documentos/Projects/frufresco/SPEC.md';
let content = fs.readFileSync(specPath, 'utf8');

content = content.replace(/Versión:\s*1\.9\.\d+/, 'Versión: 1.9.293');
content = content.replace(/Version:\s*1\.9\.\d+/, 'Version: 1.9.293');

const scenario310 = `
---

### Escenario 310: Estandarización de Cadena & Inventario en Torre de Control — Grupos de Inventario (Kg + Costo $), Mínimos Reales sin SKUs, Reposiciones SAC y Paleta Oficial FruFresco (Gemba Hallazgos 12, 13, 14, 15 y 16) (SDD v1.9.293)
- **Given** la subpestaña *2. Cadena & Inventario* de la Torre de Control Estratégico (\`/admin/strategy\`), donde previamente se agrupaba por códigos cortos de categoría (\`HO\`, \`VE\`, \`FR\`), se truncaban consultas a 1.000 registros, se imponía un mínimo ficticio (\`|| 10\`) con códigos legacy \`SKU: V-...\` y se utilizaban colores ajenos al sistema de diseño,
- **When** la dirección audita las existencias físicas valorizadas, las alertas tempranas de abastecimiento y las garantías de calidad,
- **Then** el sistema ratifica e implementa los siguientes estándares canónicos:
  1. **Paginación Universal de Productos y Saldos de Inventario (>1.000 Registros):**
     - La Torre de Control consulta \`products\` e \`inventory_stocks\` mediante bloques paginados (\`range(0, 999)\` y \`range(1000, 2999)\`), garantizando la lectura del 100% del catálogo activo (>1.148 productos) y evitando omisiones de stock físico.
  2. **Distribución por Grupo / Lista de Inventario en Kilos y Valor en Costo ($ COP) (Hallazgos 13, 15 y 16):**
     - La tarjeta izquierda reemplaza las siglas de categoría por los **Grupos Oficiales de Inventario** (\`products.inventory_group\`: *INVENTARIO DE HORTALIZAS*, *INVENTARIO DE PAPAS, PLATANO, TOMATE Y AGUACATES*, *INVENTARIO DE FRUTAS Y OTROS*, *INVENTARIO DE VERDURAS*, *INVENTARIO DE ABARROTES, FRUTOS SECOS, LACTEOS Y CARNES FRIAS*, *INVENTARIO DE FRESAS Y MORAS*).
     - Para cada grupo exhibe simultáneamente:
       - **Kilaje físico disponible (\`Kg\`)** y su porcentaje de participación volumétrica.
       - **Valorización en Costo (\`$ COP\`)** calculada contra \`commercial_cost_matrix\` (con herencia de costo padre para variantes) y su porcentaje sobre el capital en bodega.
       - Conteo de productos con existencia física activa frente al total de la lista.
  3. **Alerta Temprana de Abastecimiento Conectada a Mínimos Reales sin SKUs Legacy (Hallazgo 14):**
     - Se erradica el valor mockeado \`|| 10\`. El radar filtra única y exclusivamente los productos que poseen \`min_inventory_level > 0\` configurado realmente en el catálogo maestro.
     - Se elimina la visualización del código \`SKU: V-MZR-...\` en las tarjetas de alerta, mostrando únicamente el nombre del producto, su \`Cód: {accounting_id}\` contable y su \`Grupo de Inventario\`.
  4. **Reposiciones y Garantías Conectado a SAC (Hallazgo 12):**
     - El KPI *Reposiciones & Garantías* integra en vivo las órdenes hijas de reposición a \`$0 COP\` generadas desde Servicio al Cliente (\`origin_source = 'customer_service'\` / \`[REPOSICIÓN DE GARANTÍA $0 COP]\`) junto con los movimientos de kardex de reposición y retorno.
  5. **Apego Estricto al Manual de Diseño FruFresco (\`DESIGN_SYSTEM_MANUAL.md\`):**
     - Se erradican los colores neón/arcoíris improvisados (\`#10B981\`, \`#2563EB\`, \`#EA580C\`) y se aplican los tokens semánticos oficiales: Verde Bosque Primario \`#0D7A57\`, Verde Clínico \`#ECFDF5\`/\`#065F46\`, Ámbar Preventivo \`#FFFBEB\`/\`#92400E\`, Rojo Crítico \`#FEF2F2\`/\`#DC2626\` y Carbón Slate \`#0F172A\`/\`#475569\` con tipografía \`tabular-nums\`.
`;

content += scenario310;
fs.writeFileSync(specPath, content, 'utf8');
console.log('Successfully updated SPEC.md with Escenario 310 (v1.9.293)!');
