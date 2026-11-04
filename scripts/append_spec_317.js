const fs = require('fs');
const file = 'SPEC.md';
let content = fs.readFileSync(file, 'utf8');

const escenario317 = `
---

### Escenario 317: Ratificación y Armonización del Descuento Escalonado de Colaboradores (5% Base + 5% Adicional Efectivo = 10%) en Landing Page Checkout y Mesa Administrativa (Gemba Detalles Pedidos: Hallazgo 8) (SDD v1.9.299)
- **Given** la directriz operativa de compras de colaboradores (Hogar / B2C) tramitadas canónicamente a través de la Landing Page Web (\`/checkout\`) y el panel administrativo de pedidos (\`/admin/orders/create\`), el directorio de Talento Humano (\`collaborators\` en Supabase) y el módulo de deducciones de nómina (\`/admin/hr\`),
- **When** un colaborador registrado de FruFresco tramita su pedido de mercado personal ingresando su número celular, cédula o correo electrónico:
- **Then** el sistema ratifica y armoniza las siguientes cuatro (4) reglas transaccionales innegociables:
  1. **Reconocimiento Automático en Landing Page y Mesa Administrativa:**
     - El endpoint \`/api/checkout/lookup\` y el módulo de pedidos validan en tiempo real contra la tabla \`collaborators\` de Supabase.
     - Al coincidir documento, teléfono o correo, activa de inmediato la condición de colaborador (\`isCollaborator = true\`), proyectando la insignia esmeralda con el nombre del empleado, su rol (\`role\`) y el beneficio activo.
  2. **Estructura Canónica de Descuento Escalonado:**
     - **Descuento Base (5% Automático):** Aplica un 5% de descuento sobre el total de alimentos frescos en cualquier método de pago no en efectivo (\`payroll_deduction\`, \`wompi\`, transferencia).
     - **Bonificación por Pago en Efectivo (+5% Adicional = 10% Total):** Si el colaborador elige \`Pago Contra Entrega\` (\`contra_entrega\`), el sistema eleva automáticamente el descuento comercial al **10% total**, reflejándolo en tiempo real en la insignia (\`-10% DTO\`), en el desglose del carrito y en la descripción del método de pago.
  3. **Opción Exclusiva de Deducción por Nómina (\`payroll_deduction\`):**
     - Exclusivamente para colaboradores autenticados, se desbloquea el método de pago por libranza/nómina (Columna N).
     - Al elegirlo, el pedido se emite con estado \`payroll_authorized\` ($0 COP a pagar en puerta), se estampa el Poka-Yoke de no cobro en la remisión física de transporte y se registra el movimiento correspondiente en \`inventory_movements\` (\`reference_type = 'employee_sale'\`), consolidándose en \`/admin/hr\` para la liquidación quincenal sin digitación manual.
  4. **Trazabilidad en Observaciones Logísticas:**
     - En el encabezado y metadatos del pedido (\`special_notes\` y \`logistics_data\`) queda grabado el porcentaje exacto aplicado (\`5%\` o \`10%\`), el nombre del empleado y su número de identificación para auditoría comercial y contable.
`;

fs.writeFileSync(file, content.trimEnd() + '\n' + escenario317.trimStart(), 'utf8');
console.log('Appended Escenario 317 to SPEC.md successfully');
