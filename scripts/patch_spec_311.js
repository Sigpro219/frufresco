const fs = require('fs');
let spec = fs.readFileSync('SPEC.md', 'utf8');

// Update header
spec = spec.replace(
  /> \*\*Versión:\*\* [^\n]+/,
  '> **Versión:** 1.9.294 (Formato Universal de Obsequio B2B/B2C con Registro de Precio Interno y Remisión sin Precios en Puerta — 76/76 Pantallas Certificadas)'
);

spec = spec.replace(
  '310 Escenarios BDD Ininterrumpidos (1..310)',
  '311 Escenarios BDD Ininterrumpidos (1..311)'
);

const escenario311 = `

---

### Escenario 311: Formato Universal de Obsequio con Registro de Precio Interno Real y Remisión de Entrega sin Precios Visibles para Pedidos Institucionales y Hogares (Gemba Detalles Pedidos: Hallazgo 2) (SDD v1.9.294)
- **Given** el módulo administrativo de creación de pedidos (\`/admin/orders/create\`), el checkout público de hogares (\`/checkout\`) y el motor de impresión documental (\`contingency-print\`),
- **When** se registra un pedido en modalidad de obsequio tanto para un cliente institucional (B2B) como para un cliente de hogar (B2C), ya sea por configuración fija del cliente (\`document_type = 'gift_remission'\`) o mediante activación puntual del pedido,
- **Then** el sistema certifica los siguientes cuatro (4) estándares operativos y contables:
  1. **Selector Rápido de "Formato Obsequio" en Creación Administrativa (\`/admin/orders/create\`):**
     - En la barra superior de naturaleza del pedido (\`orderNature\`), se incorpora el tercer botón con ícono \`lucide-react\` (\`Gift\`): **\`Formato Obsequio\`**, disponible tanto en pestaña *Institucional (B2B)* como en *Hogar (B2C)*.
     - Al activarse, despliega el panel de datos de entrega del obsequio: *Destinatario (Quien recibe en puerta)*, *Teléfono del Destinatario* y *Nota / Dedicatoria de Obsequio*.
  2. **Persistencia Obligatoria del Precio Interno Real en Base de Datos:**
     - Se erradica el vaciado a \`$0 COP\` en la base de datos para los pedidos de obsequio (\`isGiftOrder\`). Únicamente las *Reposiciones por Garantía de Calidad* (\`orderNature === 'replacement'\`) se liquidan internamente a \`$0\`.
     - En los pedidos con *Formato Obsequio*, tanto \`orders\` (\`subtotal\`, \`tax\`, \`total\`) como \`order_items\` (\`unit_price\`) registran y conservan el precio real de acuerdo comercial o lista vigente. Esto garantiza la trazabilidad financiera del costo/venta del obsequio y el cobro exacto al comprador que envía el regalo.
  3. **Remisión de Entrega sin Precios Visibles en Puerta (\`$0\` al Destinatario):**
     - Al imprimir o generar el PDF del documento de entrega (\`contingency-print?mode=remissions\`), el sistema detecta \`logistics_data.is_gift_remission = true\` y emite el formato oficial **\`REMISIÓN DE OBSEQUIO #...\`**, ocultando la totalidad de los precios unitarios y totales en el papel físico para que el destinatario reciba su obsequio sin visualizar valores monetarios.
  4. **Estándar Puro de Iconografía Lucide React:**
     - Todos los selectores, insignias (\`Remisión Obsequio ($0 en puerta)\`) y paneles utilizan exclusivamente componentes vectoriales de \`lucide-react\` (\`Gift\`, \`CheckCircle2\`, \`User\`, \`Phone\`, \`MessageSquare\`), erradicando cualquier emoji unicode en la interfaz.
`;

if (!spec.includes('### Escenario 311:')) {
    spec = spec.trimEnd() + escenario311;
    fs.writeFileSync('SPEC.md', spec, 'utf8');
    console.log('Successfully appended Escenario 311 to SPEC.md');
} else {
    console.log('Escenario 311 already present in SPEC.md');
}
