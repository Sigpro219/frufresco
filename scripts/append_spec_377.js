const fs = require('fs');

const specPath = 'C:/Users/German Higuera/OneDrive/Documentos/Projects/frufresco/SPEC.md';
let specContent = fs.readFileSync(specPath, 'utf8');

const escenario377 = `

---

### Escenario 377: Rediseño Ergonómico y Swiss Dark UI del Popover de Filtros de Columna (\`InventoryColumnFilterPopover.tsx\`) en la Sábana Oficial (SDD v1.9.361)

#### 1. Diagnóstico Forense de Usabilidad y Defectos Visuales
En la versión previa del modal/popover de filtrado por columna (\`src/components/InventoryColumnFilterPopover.tsx\`), reportado en captura de pantalla operativa (\`media_1793805209045_fa55cc1a.png\`), se identificaron las siguientes fricciones visuales y de interacción:
1. **Barra de Desplazamiento Vertical Anti-Estética:** La lista de operadores numéricos estaba contenida en un contenedor de 1 columna con altura fija forzada (\`maxHeight: 165px\`), desplegando una barra de scroll gris nativa de Windows con flechas que obstruía el escaneo visual rápido.
2. **Defecto de Doble Paréntesis en Título (\`((-))\`):** Al concatenar \`{colTitle} {colSign ? \`(\${colSign})\` : ''}\`, si el signo ya contenía paréntesis (ej. \`(-)\`), el encabezado renderizaba \`Basura ((-))\`.
3. **Carencia de Micro-Interacciones y Chips Rápidos:** La selección numérica exigía tecleo manual para valores estándar (\`0\`, \`10\`, \`50\`).

#### 2. Especificación del Rediseño Canónico
1. **Rejilla 2D Libre de Scrollbars (Zero-Scroll UX):**
   - Los 6 operadores numéricos canónicos se distribuyen en una **rejilla de 2 columnas simétricas**:
     - Fila 1: \`[ > ] Mayor que\` y \`[ ≥ ] Mayor o igual\`
     - Fila 2: \`[ = ] Igual a\` y \`[ ≠ ] Diferente de\`
     - Fila 3: \`[ < ] Menor que\` y \`[ ≤ ] Menor o igual\`
   - La opción \`[ ⇄ ] En rango de valores (Mín..Máx)\` ocupa el ancho completo inferior.
   - **Resultado:** El 100% de los operadores queda visible de un vistazo en 0ms, eliminando totalmente la barra de desplazamiento.
2. **Sanitización Tipográfica del Encabezado:**
   - Se procesa \`cleanSign = (colSign || '').replace(/^\\(+|\\)+$/g, '').trim()\`.
   - Renderiza \`Col. {key}\` en pastilla azul celeste (\`#38BDF8\`), título limpio \`Basura\` y pastilla de naturaleza contable \`(-)\` con color semántico según entrada (\`#34D399\`) o salida (\`#F87171\`).
3. **Botones de Pre-Filtro Rápido con Iconografía Oficial Lucide:**
   - \`[ ⊘ En blanco ]\` (\`Ban\` icon): Filtra registros en cero o vacíos.
   - \`[ ✦ Con valores ]\` (\`Sparkles\` icon): Filtra registros con movimiento real ($\ne 0$).
4. **Input Numérico de Alta Densidad con Chips Rápidos:**
   - Input estilizado en \`#1E293B\` con borde reactivo y tipografía tabular destacada.
   - Chips rápidos de un clic: \`[ 0 ] [ 1 ] [ 10 ] [ 50 ]\` que asignan el valor y re-enfocan el campo de inmediato.
5. **Botón de Acción Primaria y Footer con Limpieza Rápida:**
   - Botón \`[ Aplicar Filtro → ]\` en degradado esmeralda FruFresco (\`#10B981\` a \`#059669\`) con sombra de elevación.
   - Si existe un filtro activo, el footer despliega un indicador con punto de telemetría \`Activo: {valor}\` y botón de un clic \`[ Quitar filtro ]\` (\`RotateCcw\`) para resetear la columna instantáneamente.
`;

specContent += escenario377;
fs.writeFileSync(specPath, specContent, 'utf8');
console.log('Escenario 377 added successfully to SPEC.md');
