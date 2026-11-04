const fs = require('fs');
const file = 'SPEC.md';
let content = fs.readFileSync(file, 'utf8');

const escenario319 = `
---

### Escenario 319: Ergonomía y Legibilidad de Alto Contraste en Sábana de Alistamiento Impresa (Zebra Striping Industrial & Tipografía Lean de Planta) (Gemba Feedback Sábana: Hallazgo 1) (SDD v1.9.301)
- **Given** el módulo de impresión de la Sábana de Alistamiento Nocturno (\`/admin/orders/alistamiento-print\`) utilizado por los líderes de cuadrilla y alistadores en las células de bodega,
- **When** se genera la matriz física para despacho y picking en papel de formato horizontal (Landscape),
- **Then** el sistema garantiza los siguientes cuatro (4) estándares de legibilidad, contraste y ergonomía operativa:
  1. **Zebra Striping Industrial de Alto Contraste:**
     - Se sustituye el sombreado casi invisible previo (\`#FFFFFF\` vs \`#F9FAFB\`) por una alternancia nítida y visible en cualquier condición de iluminación y fotocopiado: filas pares en blanco puro (\`#FFFFFF\`) y filas impares en gris pizarra industrial suave (\`#F1F5F9\`).
     - Las cuadrículas internas se refuerzan con bordes nítidos de 1px en \`#64748B\` para que el operario pueda seguir visualmente la línea de izquierda a derecha sin cruzarse de renglón.
  2. **Escala Tipográfica Operativa Prominente:**
     - **Cantidades a Alistar:** Elevadas a **\`9.5pt\`** con peso ultra-negrita (\`fontWeight: 900\`), asegurando lectura instantánea de kilos o unidades a más de 50 cm de distancia.
     - **Sucursal / Cliente:** Elevado a **\`8.5pt\`** con \`fontWeight: 800\` para identificación inmediata del destino del producto.
     - **Lugar / Bahía en Suelo (\`LUGAR\`):** Elevado a **\`9.5pt\`** centrado con \`fontWeight: 900\` en color \`#0F172A\`.
     - **Encabezados de Tabla:** Elevados a **\`8pt\`** sobre fondo sólido de contraste \`#E2E8F0\` con borde inferior reforzado de 2px.
  3. **Resalte Visual de Notas y Especificaciones Culinarias:**
     - Las observaciones críticas del cliente (ej. *"Maduro"*, *"Pintón"*, *"5 und de 500 gr"*) pasan de ser textos diminutos de 5.5pt a píldoras de alto contraste en **\`6.8pt\`** (\`fontWeight: 700\`, fondo ámbar \`#FEF3C7\` y texto oscuro \`#1E293B\`), erradicando omisiones de calidad durante el alistamiento.
  4. **Ergonomía de Marcación Física:**
     - Las celdas aumentan su altura útil (mínimo 30px) y su padding vertical (3px - 5px), dejando espacio holgado para que el alistador marque físicamente con bolígrafo la casilla Lean \`[  ]\` sin invadir ni tachar las cantidades numéricas.
`;

fs.writeFileSync(file, content.trimEnd() + '\n' + escenario319.trimStart(), 'utf8');
console.log('Appended Escenario 319 to SPEC.md successfully');
