const fs = require('fs');

const rfcContent = `
---

### Escenario 384: [PENDIENTE / RFC] Ingesta Inteligente Multimodal (WhatsApp, PDF y Fotos) de "Precios del Día" en Modo Edición de Inventarios

#### 1. Justificación Operativa del Gemba y Propósito del Backlog
En la dinámica operativa real de FruFresco y la central de abastos (Corabastos), los precios de referencia y costos diarios de adquisición cambian constantemente en la madrugada (4:00 AM - 7:00 AM). Los supervisores de compras y jefatura de bodega reciben esta información a través de:
1. **Mensajes informales y listas rápidas de WhatsApp** enviadas por los intermediarios y proveedores de plaza (ej. *"Papa pastusa bulto a 90mil, tomate chonto primera 3.200 kg, mandarina arrayana canastilla 48mil"*).
2. **Facturas y remisiones de compra en PDF** expedidas por proveedores institucionalizados.
3. **Fotografías de comprobantes y tirillas físicas de báscula** tomadas desde teléfonos celulares en el muelle de recepción.

Actualmente, la digitación manual de estos costos en la Matriz de Costos o en el modo edición de la sábana oficial es un proceso lento, propenso a errores tipográficos y que retrasa el cálculo oportuno de la valorización del inventario y las mermas.

#### 2. Reutilización de Infraestructura Existente de IA de Pedidos
El módulo de pedidos ya cuenta con un motor maduro y probado en producción:
- **Sanitización de Texto Inteligente y Normalización:** \`sanitizeDocText\` en \`src/lib/orders/order-parser-engine.ts\`, con corrección de caracteres homóglifos, tildes, colapso de kerning y jerga agrícola colombiana.
- **Motor Multimodal Gemini Flash / Pro:** Endpoint \`src/app/api/ai/extract-order/route.ts\` que procesa indistintamente archivos (PDFs, planillas Excel, imágenes JPG/PNG) y texto libre / transcripciones de WhatsApp.
- **Cascada Anti-Obsolescencia:** \`CANONICAL_MODEL_CASCADE\` que conmuta automáticamente entre modelos de Gemini sin interrupción de servicio.

#### 3. Especificación Técnica de la Adaptación a Inventarios
Se extenderá la arquitectura del balance diario (\`src/components/InventoryDailyBalanceTab.tsx\`) y la gestión de costos (\`cost_matrix\`):

1. **Nuevo Endpoint Especializado:**
   - \`POST /api/commercial/cost-matrix/extract-prices\`
   - Recibe:
     - \`file\`: Archivo opcional (PDF, imagen escaneada, factura, remisión).
     - \`text\`: Texto plano opcional (copiado y pegado directo desde WhatsApp / chat).
     - \`balanceDate\`: Fecha de vigencia del costo (\`YYYY-MM-DD\`).
   - Prompt de Extracción Especializado en Costos Agrícolas:
     - Identifica producto, variedad/calibre, precio total, unidad base reportada (Kilo, Bulto de 50 kg, Canastilla de 20 kg, Caja, Atado, Unidad).
     - Convierte automáticamente al costo unitario canónico por Kg o Unidad aplicando los factores estándar de empaque mayorista de Corabastos.
2. **Componente de Interfaz de Usuario (Modal Ergonómico):**
   - Nuevo componente: \`src/components/DailyCostIngestModal.tsx\`.
   - **Gatillo de Apertura:** En la barra superior de la Sábana Oficial de Inventarios, cuando el usuario activa el **Modo Edición** (\`sheetMode === 'manual_edit'\`), se despliega el botón de acción destacada:  
     \`[ ⚡ Cargar Precios del Día (IA WhatsApp/PDF) ]\` (con icono \`Sparkles\` y \`FileText\` de Lucide).
   - **Vistas del Modal:**
     - **Pestaña 1: WhatsApp / Mensaje de Texto:** Área de pegado rápido (\`textarea\`) con placeholder ejemplificativo y botón directo de análisis.
     - **Pestaña 2: Archivo PDF / Foto Remisión:** Zona drag-and-drop para arrastrar cotizaciones en PDF o fotos de remisión.
     - **Pestaña 3: Staging de Homologación y Auditoría:**
       - Tabla interactiva que contrasta los precios extraídos contra el catálogo activo de 516 familias / 663 SKUs.
       - Algoritmo de similitud fuzzy / trigram para autocompletar el \`productId\`.
       - Semáforo de Coincidencia:
         - **Verde:** Coincidencia exacta de SKU (confianza > 90%).
         - **Amarillo:** Coincidencia sugerida (requiere aprobación con un clic).
         - **Rojo:** Producto no reconocido en catálogo (permite asociar manualmente mediante \`SearchableSelect\`).
       - Telemetría de Variación: Compara el precio del día anterior vs. el precio nuevo extraído (\`+X%\` o \`-Y%\`), alertando variaciones bruscas mayores al 25%.
3. **Persistencia Atómica e Impacto en Sábana:**
   - Botón de confirmación: \`[ Aplicar Precios a la Jornada ]\`.
   - Inserta o actualiza en la tabla \`cost_matrix\` para la fecha seleccionada.
   - Refresca de inmediato el estado local \`costMatrixMap\` en \`InventoryDailyBalanceTab.tsx\`, actualizando en tiempo real la columna \`base_price\` de todas las filas y revalorizando el valor monetario de mermas, compras y cierre diario sin requerir recargar la página.

#### 4. Criterios de Aceptación Contractual (DoD)
- [ ] Soporte completo de pegado de WhatsApp con jerga de Corabastos (bulto, arroba, canastilla, atado, caja).
- [ ] Ingesta de PDFs de proveedores y fotos de remisiones mediante Gemini multimodal.
- [ ] Staging de homologación con semáforo de confianza antes de guardar en base de datos.
- [ ] Actualización reactiva instantánea del costo base en la Sábana Oficial de Inventarios en Modo Edición.
`;

fs.appendFileSync('SPEC.md', rfcContent, 'utf8');
console.log('SPEC.md successfully updated with Escenario 384 (RFC).');
