const fs = require('fs');
const path = require('path');

const specPath = path.join('C:', 'Users', 'German Higuera', 'OneDrive', 'Documentos', 'Projects', 'frufresco', 'SPEC.md');
let content = fs.readFileSync(specPath, 'utf8');

// Update header version
content = content.replace(
    /> \*\*Versión:\*\* 1\.9\.284 .*/,
    `> **Versión:** 1.9.285 (Ley Marcial Global: Prohibición Estricta de 'base_price' y 'sku' en Desarrollo, y Erradicación de Costo Base en Ingesta Comercial — 76/76 Pantallas Certificadas)`
);

// Add the Global Martial Mandate right before §7.2 or inside §7.2
const mandateInsertTarget = `> [!IMPORTANT]\n> **Deprecación y Obsolescencia de \`products.base_price\`:**`;

const mandateText = `> [!CAUTION]
> ### MANDATO ARQUITECTÓNICO MARCIAL: PROHIBICIÓN ESTRICTA DE \`products.base_price\` Y \`products.sku\` EN DESARROLLO
> 1. **Prohibición Total de \`products.base_price\`:**
>    - La columna \`base_price\` en la tabla maestra \`products\` es un residuo estático de la fase prototipo. Queda **ESTRICTAMENTE PROHIBIDO** en cualquier desarrollo nuevo, endpoint, hook o componente leer, escribir o utilizar \`products.base_price\` como precio de venta, fallback o costo de insumo.
>    - **Fuente de Verdad Única:** Los precios provienen exclusivamente de \`quote_items\` (Acuerdos Comerciales) o de \`pricing_model_prices\` (Modelos Dinámicos de Precios). Los costos provienen exclusivamente de \`commercial_cost_matrix\` (Corabastos) o \`purchase_history_normalized\` (Muelle). En la tabla \`products\` no existen costos.
> 2. **Prohibición de \`products.sku\` en UI y Lógica de Negocio:**
>    - El \`accounting_id\` (ID contable numérico oficial de World Office, ej: #1138, #1701) es el **ÚNICO IDENTIFICADOR SOBERANO** del ecosistema para remisiones, báscula, facturación DIAN y alistamiento.
>    - La columna \`sku\` (\`VE-01701\`) en Supabase se degrada a llave técnica muda (Silent Shadow Key) exclusivamente para no violar el constraint \`NOT NULL UNIQUE\` de PostgreSQL en Supabase.
>    - Queda terminantemente vetado proyectar \`sku\` al usuario, ordenar tablas/catálogos por él, o basar filtros de negocio en dicho campo.

> [!IMPORTANT]
> **Deprecación y Obsolescencia de \`products.base_price\`:**`;

if (content.includes(mandateInsertTarget)) {
    content = content.replace(mandateInsertTarget, mandateText);
}

// Add Item 5 to Escenario 306
const escenario306Target = `       - *Opción Secundaria (Azul):* Filtrar la tabla de trabajo en los ítems sin coincidencia para su búsqueda o creación manual fila por fila.`;

const item5Text = `       - *Opción Secundaria (Azul):* Filtrar la tabla de trabajo en los ítems sin coincidencia para su búsqueda o creación manual fila por fila.
  5. **Erradicación de Costo Base en Creación Rápida de SKUs (Hallazgo 4 - SDD v1.9.285):**
     - En el modal de creación de productos al vuelo (\`QuickProductModal\` en \`CommercialAgreementsModule.tsx\`), se elimina definitivamente el campo de "Costo Base Estimado (COP)".
     - El comercial pacta el precio de venta acordado con el cliente institucional; la creación del SKU nace con costo pasivo $0 y margen \`—\`, transfiriendo la calibración del costo real a la Dirección de Compras y Abastecimiento en la Matriz de Costos (\`/admin/pricing\`), sin detener ni burocratizar la formalización del contrato comercial.`;

if (content.includes(escenario306Target)) {
    content = content.replace(escenario306Target, item5Text);
}

fs.writeFileSync(specPath, content, 'utf8');
console.log('Successfully updated SPEC.md to v1.9.285 with Global Martial Mandate');
