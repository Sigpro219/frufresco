const fs = require('fs');

const specPath = 'SPEC.md';
const content = fs.readFileSync(specPath, 'utf8');

const newScenario = `
### Escenario 359: Acuerdos Comerciales de Octubre (22 Clientes/Canastas), Cálculo Paramétrico de Márgenes Fijos por Canasta (\`quote_template_margins\`), Desacople y Aislamiento Jerárquico Matriz vs Sede y Poda de Selector Redundante en Cargue de Pedidos (SDD v1.9.342)

#### 1. Contexto y Justificación del Gemba
En el marco de la operación comercial e industrial de FruFresco para el ciclo de acuerdos de octubre de 2026, la dirección comercial requirió asentar con exactitud milimétrica las listas de precios pactadas para 22 clientes/canastas corporativas provenientes de archivos \`.xlsx\` (\`COLEGIO SAN JORGE\`, \`CORFERIAS\`, \`LA MONTAÑA\`, y 19 clientes de la carpeta \`Adicionales\`). Se identificaron tres necesidades críticas del negocio:
1. **Predominancia del Excel y Reconstrucción Fiel de Precios sin IVA:** La columna \`SUG. SIN IVA\` debía coincidir exactamente con los precios del Excel mediante el cálculo y fijación de la utilidad porcentual específica para cada producto y cliente.
2. **Aislamiento Jerárquico Estricto (Matriz vs. Sede Específica):** La arquitectura debía soportar la herencia en cascada para Casas Matrices (\`ALDIMARK\`, \`YANUBA / MILSEN\`, \`PUERTO PEÑALISA\`, \`CARNICOLAS\`, \`TACOCARDIA\`) sin que las matrices pisaran los acuerdos puntuales de sedes con operaciones diferenciadas (\`WOK FAMILIA\` vs \`WOK RESTAURANTE\`, \`CESAP\` vs \`CESNE\`, \`HOTEL CAPITAL\`, \`DIPLOMAT WYNDHAM\`, \`OXOHOTEL\`, \`TEQUENDAMA SUITES\`).
3. **Optimización de Toolbar en Cargue de Pedidos (\`/admin/orders/loading\`):** Se erradicó el selector redundante de canales en la barra superior para brindar un ancho amplio y desahogado al omnibox buscador en resoluciones medianas y laptops (1366px / 1440px), centralizando el filtro de canal en la cabecera de la tabla y en comandos rápidos (\`@\`).

#### 2. Especificación Técnica y Contrato Canónico
1. **Fórmula Paramétrica de Utilidad Fija:**
   $$\\text{Utilidad \\%} = \\left(\\frac{\\text{Precio Excel (Sin IVA)} - \\text{Costo Base}}{\\text{Costo Base}}\\right) \\times 100$$
   * Redondeo a 2 decimales para compatibilidad visual con los inputs numéricos de la interfaz.
   * Si \`Costo Base <= 0\` (producto pendiente de compra o ingreso en Matriz Comercial), se preserva el margen o se asigna 0% hasta que ingrese el costo.
2. **Persistencia en Base de Datos (\`app_settings\`):**
   * Llave: \`quote_template_margins:\${templateId}\`.
   * Formato: \`Record<productId, number>\` serializado en JSON string en la columna \`value\` (\`TEXT\`).
3. **Alta de 16 SKUs Nuevos en Catálogo Maestro (\`products\`):**
   * Se crearon con \`accounting_id\` oficiales del ERP antiguo (\`1658\` al \`1698\`), llevando el catálogo maestro a 1.378 productos activos.
4. **Nuevas Canastas Creadas en \`quote_templates\`:**
   * \`HOTELES EL SALITRE SAS - HOTEL CAPITAL\`
   * \`OXOHOTEL S.A.S.\`
   * \`FELIPE SANCHEZ - TACOCARDIA\`
   * \`LAO KAO S.A. - WOK FAMILIA\` (Independiente de \`LAO KAO S.A. - RESTAURANTES WOK\`).
5. **Poda de Selector de Canales (\`src/app/admin/orders/loading/page.tsx\`):**
   * Eliminado el bloque estático \`<select value={selectedChannel}>...\` de la toolbar superior.
   * Preservado el filtrado de canal mediante \`filterChannel\` en el encabezado de columna de la tabla y los comandos rápidos del buscador (\`@whatsapp\`, \`@web\`, \`@email\`, etc.).

#### 3. Evidencias y Pruebas Automatizadas
* **TypeScript Compilation:** \`tsc --noEmit\` con código de salida \`0\` (cero errores en todo el proyecto).
* **Capturas E2E:** 
  - \`verify_canastas_san_jorge.png\` (232 SKUs, márgenes fijados en verde).
  - \`verify_canastas_corferias.png\` (392 SKUs, márgenes fijados en verde).
  - \`verify_canastas_montana.png\` (383 SKUs, márgenes fijados en verde).
  - \`verify_cargue_pedidos_no_selector.png\` (Resolución 1366px, toolbar compacta en 1 sola fila).
`;

fs.writeFileSync(specPath, content + newScenario, 'utf8');
console.log('SPEC.md actualizado exitosamente con Escenario 359.');
