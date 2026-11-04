const fs = require('fs');

const specPath = 'SPEC.md';
let spec = fs.readFileSync(specPath, 'utf8').replace(/\r\n/g, '\n');

const escenario308 = `
---

### Escenario 308: Matriz de Rentabilidad y Margen (%) por Cliente en Torre de Control Estratégico y Cockpit Comercial (Gemba Hallazgos 11 y 17) (SDD v1.9.291)
- **Given** la tabla de Concentración de Facturación por Cliente (Pareto de Cartera) en el Centro Estratégico (\`/admin/strategy\` ➔ *3. Clientes & Conversión*) y la tabla de Consumo por Cliente en el Cockpit Comercial (\`/admin/commercial\`),
- **When** la dirección general y la mesa comercial auditan qué clientes generan verdadero valor y margen neto frente a cuentas de alto volumen pero bajo margen,
- **Then** el sistema ratifica e integra los siguientes estándares de visualización de rentabilidad por cliente:
  1. **Cálculo de Utilidad y Margen por Cuenta Cliente:**
     - A partir de las órdenes y el consumo de ítems valorizados contra la matriz de costos y compras (\`commercial_cost_matrix\`), el sistema calcula para cada cliente:
       - **Costo Total Acumulado ($):** Sumatoria del costo unitario por volumen demandado ($\\sum Q_i \\times C_i$).
       - **Utilidad Bruta ($ COP):** Facturación total menos costo total acumulado ($\\text{Ventas} - \\text{Costos}$).
       - **% Rentabilidad (Margen Ponderado %):** Porcentaje de rentabilidad neta sobre ingresos del cliente ($\\frac{\\text{Utilidad}}{\\text{Ventas}} \\times 100$).
  2. **Columnas de Rentabilidad en Pareto de Cartera (\`StrategyControlTower.tsx\`):**
     - En la tabla *Concentración de Facturación por Cliente (Pareto de Cartera)*, se integran formalmente las columnas:
       - **Utilidad Bruta ($):** Ganancia en pesos con color dinámico (\`#0D7A57\` si positiva, \`#DC2626\` si a pérdida).
       - **% Rentabilidad:** Badge semáforo institucional:
         - $\\ge 25\\%$: Verde éxito (\`#DCFCE7\` / \`#15803D\`).
         - $15\\% \\le \\text{Margen} < 25\\%$: Ámbar equilibrado (\`#FEF3C7\` / \`#B45309\`).
         - $< 15\\%$: Rojo alerta (\`#FEE2E2\` / \`#B91C1C\`).
  3. **Ordenamiento Multidimensional de Clientes Estratégicos:**
     - La tabla permite ordenar el Pareto de clientes no solo por facturación bruta, sino por:
       - *Mayor Utilidad ($ COP)*: Para identificar de inmediato las cuentas ancla más rentables.
       - *Mayor % de Rentabilidad*: Para premiar y proteger las cuentas de alta eficiencia.
       - *Mayor Volumen (Kg)* y *Total Facturado ($)*.
  4. **Paridad Contable en Cockpit Comercial (\`CommercialUnifiedDashboard.tsx\`):**
     - La tabla de *Consumo por Cliente* del Cockpit Comercial integra de forma simétrica las columnas de Utilidad Bruta y % Margen, unificando la lectura financiera de la cartera entre la mesa comercial y la dirección general.
`;

spec = spec.trim() + '\n' + escenario308.trim() + '\n';
fs.writeFileSync(specPath, spec, 'utf8');
console.log('Successfully appended Escenario 308 to SPEC.md!');
