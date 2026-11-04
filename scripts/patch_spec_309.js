const fs = require('fs');

const specPath = 'C:/Users/German Higuera/OneDrive/Documentos/Projects/frufresco/SPEC.md';
let content = fs.readFileSync(specPath, 'utf8');

// Update header version
content = content.replace(/Versión:\s*1\.9\.\d+/, 'Versión: 1.9.292');
content = content.replace(/Version:\s*1\.9\.\d+/, 'Version: 1.9.292');

const scenario309 = `
---

### Escenario 309: Rediseño de Alta Densidad y Matriz Dual de Rentabilidad por Canal en Torre de Control Estratégico (SDD v1.9.292)
- **Given** el módulo de Centro Estratégico (\`/admin/strategy\` -> *1. Comercial & Finanzas*) donde la tarjeta de *Participación por Canal de Venta* presentaba más de 55% de espacio vacío y carecía de lectura de rentabilidad operativa,
- **When** la dirección audita la contribución de los canales B2B Institucional y Hogar B2C tanto en facturación bruta como en utilidad neta,
- **Then** el sistema ratifica e implementa el estándar visual de alta densidad \`BIChannelPerformanceMatrix\`:
  1. **Barras Duales de Participación (Mix Venta vs Mix Utilidad):**
     - Barra horizontal 1: **Mix Facturación ($ COP)** con proporciones porcentuales exactas de B2B y B2C sobre el total de ventas.
     - Barra horizontal 2: **Mix Utilidad Bruta ($ COP)** con desglose proporcional de la ganancia generada por cada canal.
  2. **Tarjetas de Desglose Financiero y Operativo por Canal:**
     - Tarjeta Institucional B2B y Tarjeta Hogar B2C con visualización simétrica:
       - Facturación total ($) y badge de % Venta.
       - Utilidad Bruta real ($) y badge de % Utilidad.
       - % Margen Bruto Operativo con semáforo de coloración según umbrales de salud financiera.
       - Micro-KPIs operativos: Cantidad de órdenes despachadas, Kilaje total movilizado y Ticket promedio por pedido.
  3. **Insight Táctico de Canales:**
     - Cintillo dinámico de lectura estratégica que sintetiza en una sola frase el aporte porcentual del canal preponderante a la utilidad operativa y el margen comparado.
  4. **Erradicación de Espacio Muerto:**
     - Ajuste milimétrico de altura que empareja armoniosamente con la tarjeta de *Top Productos Más Consumidos & Margen*, garantizando una interfaz industrial de alta densidad sin áreas vacías.
`;

content += scenario309;
fs.writeFileSync(specPath, content, 'utf8');
console.log('Successfully updated SPEC.md with Escenario 309 (v1.9.292)!');
