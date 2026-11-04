const fs = require('fs');

const specPath = 'SPEC.md';
let spec = fs.readFileSync(specPath, 'utf8').replace(/\r\n/g, '\n');

const escenario307 = `
---

### Escenario 307: Matriz de Participación Mixta de Venta y Utilidad por Canal Comercial (Acuerdos Especiales/Cadenas, B2B Estándar y Hogar/B2C) (SDD v1.9.290)
- **Given** el panel de indicadores ejecutivos del Dashboard Comercial (\`CommercialUnifiedDashboard.tsx\`) en \`/admin/commercial\`,
- **When** la dirección general y la mesa comercial auditan el rendimiento financiero, la contribución real de ingresos y el margen operativo por segmento de mercado,
- **Then** el sistema calcula y proyecta la **Matriz de Participación Mixta de Canales**:
  1. **Segmentación Canónica de los Tres (3) Canales Operativos de FruFresco:**
     - **Canal 1 - Acuerdos Especiales / Cadenas Macro:** Clientes adscritos a convenios macro y acuerdos especiales (\`special_agreement_models\` y padrones \`agreement_clients:\` en \`app_settings\`, ej. Grupo Nutresa/IRCC - El Corral, Corral Gourmet, Beer Station, Leños & Carbón, Colsubsidio).
     - **Canal 2 - B2B Institucional Estándar:** Clientes corporativos, hoteles, restaurantes y casinos independientes con \`role = 'b2b_client'\` o razón social mercantil, sin acuerdo macro multisede.
     - **Canal 3 - Hogar / B2C Directo:** Consumidores finales y compras al detal (\`role = 'b2c_client'\` o compras individuales directas).
  2. **Doble Métrica de Contribución Financiera (Mix Venta vs Mix Utilidad):**
     - Para cada canal, el sistema procesa en tiempo real sobre las órdenes del periodo:
       - **Pedidos:** Número total de órdenes despachadas/confirmadas.
       - **Total Venta ($ COP):** Facturación bruta acumulada y porcentaje de participación sobre los ingresos totales ($\\% \\text{Mix Venta} = \\frac{\\text{Ventas Canal}}{\\text{Ventas Totales}} \\times 100$).
       - **Utilidad Bruta ($ COP):** Ganancia real calculada a partir del precio de venta menos el costo real de matriz/compras, y porcentaje de contribución a la ganancia total ($\\% \\text{Mix Utilidad} = \\frac{\\text{Utilidad Canal}}{\\text{Utilidad Total}} \\times 100$).
       - **Margen Ponderado (%):** Rentabilidad efectiva sobre ingresos del canal ($\\text{Margen \\%} = \\frac{\\text{Utilidad Canal}}{\\text{Ventas Canal}} \\times 100$).
  3. **Visualización Ejecutiva de Alto Impacto (Barras Duales de Mix y Píldoras de Telemetría):**
     - Barra de progreso segmentada proporcional con paleta institucional:
       - *Acuerdos Especiales / Cadenas:* \`#059669\` (Esmeralda).
       - *B2B Institucional Estándar:* \`#2563EB\` (Azul corporativo).
       - *Hogar / B2C:* \`#D97706\` (Ámbar).
     - Tabla comparativa ejecutiva de alta densidad con desglose de pedidos, facturación, utilidad y margen por canal.
`;

spec = spec.trim() + '\n' + escenario307.trim() + '\n';
fs.writeFileSync(specPath, spec, 'utf8');
console.log('Successfully appended Escenario 307 to SPEC.md!');
