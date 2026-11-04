const fs = require('fs');

const content = `
---

### Escenario 385: Consolidación Ergonómica de Ventas en Unidades: Supresión de Columna Redundante \`PESO (UND)\` (Col J) e Integración de Peso y Micro-Badges en \`Col I\` (Opción 1 Lean / SpaceX)

#### 1. Diagnóstico de Redundancia y Optimización de Ancho de Pantalla
En el diseño original heredado de planillas de cálculo de escritorio (Excel), existía una duplicidad obligada:
- Columna I: \`VENTA (UND)\` (cantidad entera de unidades formuladas).
- Columna J: \`PESO (UND)\` (kilogramos equivalentes que restan al balance físico $S$).

Esta duplicación obedecía a una limitación técnica de Excel, donde no era posible operar algebraicamente celdas que mezclaran texto/unidades y cifras en kilogramos para la fórmula de stock ($S = E + F + G - H - J - ...$). En una aplicación web de alta densidad operativa (1600px standard), dedicar 95px a una columna exclusivamente para repetir el peso correspondiente a las unidades vendidas representa desperdicio visual y horizontal (Muda).

#### 2. Regla Canónica de Consolidación (Opción 1)
Bajo los principios de ingeniería Lean y el algoritmo de simplificación de SpaceX (*"The best part is no part"*):
1. **Supresión de Columna J en Pantalla:**
   - Se retira \`J\` de \`DEFAULT_COLUMN_ORDER\` y del almacenamiento local (\`localStorage\`).
   - La sábana operativa se optimiza de 24 a 23 columnas activas en interfaz, ganando 95px de amplitud para las columnas de excepciones y cierres.
2. **Consolidación en Columna I (\`VENTA (UND)\`):**
   - **Valor Numérico Principal:** Despliega directamente el **peso físico equivalente en kilogramos** (\`colJ_weightSalesUnits\`, ej. \`12,80\` kg para 80 bananos, \`8,40\` kg para 60 mandarinas, \`5,85\` kg para 3 cubetas de huevos), con 2 decimales y tipografía tabular destacada.
   - **Micro-Badges de Presentación e Instrucción:** Renderiza directamente bajo la cifra el desglose físico consolidado (ej. \`80 und de 160 gr\`), garantizando que la jefatura de inventarios y bodega tengan en un solo bloque visual tanto la masa a descargar como la especificación de empaque.
   - **Borde Separador de Sección:** Al ser ahora la última columna del bloque comercial/ventas, \`Col I\` adquiere el borde derecho reforzado (\`borderRight: '2px solid #334155'\`).
3. **Integridad del Balance Kardex:**
   - La ecuación de balance contable de masa se preserva idéntica y exacta:
     $$S = E + F + G - H - J - K + L - M - N + O - P - Q - R$$
   - En el pie de totales de la sábana, la columna \`I\` totaliza la masa total en kilogramos correspondiente a las unidades vendidas (ej. \`27,05 Kg\`).
4. **Resguardo de Compatibilidad Contable (World Office / Excel Export):**
   - En el exportador formal a Excel, se mantienen las 24 columnas separadas para preservar 100% de compatibilidad con auditorías externas y sistemas ERP legacy.
`;

fs.appendFileSync('SPEC.md', content, 'utf8');
console.log('SPEC.md successfully updated with Escenario 385.');
