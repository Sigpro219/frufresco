const fs = require('fs');
let spec = fs.readFileSync('SPEC.md', 'utf8');

// Update header
spec = spec.replace(
  /> \*\*Versión:\*\* 1\.9\.342[^\n]*/,
  '> **Versión:** 1.9.343 (Capítulo 45: Clon Canónico 1:1 de Exportación Contable World Office Desktop — 76/76 Pantallas Certificadas)'
);
spec = spec.replace(
  /359 Escenarios BDD Ininterrumpidos \(1\.\.359\)/g,
  '360 Escenarios BDD Ininterrumpidos (1..360)'
);

const scenario360 = `

### Escenario 360: Clon Canónico 1:1 de Exportación Contable World Office Desktop y Erradicación de Fallos de Importación Masiva en Facturas de Venta (\`worldOfficeExport.ts\`, \`billing/page.tsx\`, \`app_settings\`) (SDD v1.9.343)

#### 1. Contexto y Justificación del Gemba
En el módulo de Facturación (\`/admin/commercial/billing\`), el equipo de contabilidad y facturación reportó que al exportar el archivo masivo de facturas de venta para World Office Desktop (\`WorldOffice_Pedidos_*.xlsx\`), el software contable rechazaba la lectura del plano de importación arrojando fallas de estructura.
Al confrontar forensemente la plantilla física en producción (\`WorldOffice_Pedidos_2026-10-22_67_pedidos (8).xlsx\`, 930 filas, 57 columnas) contra el motor de exportación, se descubrió:
1. **Columna AE (\`Encab: Clasificación\`):** El sistema inyectaba indebidamente el texto \`"Facturas de Venta"\`. En el estándar oficial de World Office, la columna AE debe estar **estrictamente vacía (\`""\`)\**, ya que World Office asigna automáticamente la clasificación por defecto del tipo de documento (\`FV\`) y rechaza el plano si el texto no coincide con un clasificador personalizado.
2. **Columna AG (\`Detalle: Bodega\`):** El sistema exportaba el texto \`"BODEGA PRINCIPAL"\`. En el maestro de almacenes de World Office, la bodega principal está nombrada exactamente como **\`"Principal"\`** (capitalizada, sin el prefijo "BODEGA").
3. **Columnas F y G (\`Tercero Interno\` y \`Tercero Externo\` / NIT):** Deben persistirse con tipo celda String (\`type: 's'\`) para prevenir que Excel elimine ceros a la izquierda o aplique notación científica en documentos fiscales.
4. **Columna AH (\`Detalle: UnidadDeMedida\`):** Normalización a \`"Kg"\` (con K mayúscula) preservando unidades de medida nativas (\`"Unidad"\`, \`"Atado"\`).

#### 2. Especificación Técnica y Contrato Canónico
1. **Blindaje de Columnas en \`src/lib/worldOfficeExport.ts\`:**
   - \`'Encab: Clasificación': item.clasificacion || ''\` (cadena vacía por defecto).
   - \`'Detalle: Bodega': item.bodega || 'Principal'\` (literal \`"Principal"\` por defecto).
   - \`'Encab: Tercero Interno': String(item.terceroInterno || '456282').trim()\` (tipo texto puro).
   - \`'Encab: Tercero Externo': String(cleanNit).trim()\` (tipo texto puro).
   - \`normalizeWorldOfficeUom\`: \`/^(kg|kilo|kilos|kilogramo|kilogramos)$/i\` mapea canónicamente a \`"Kg"\`.
2. **Sincronización de Estado en Facturación (\`src/app/admin/commercial/billing/page.tsx\`):**
   - Estado inicial \`woClassification = ''\` y \`woWarehouse = 'Principal'\`.
   - Modificación de placeholders para guiar al usuario: *"Dejar vacío para plantilla estándar (recomendado)"* y *"Ej: Principal"*.
3. **Persistencia en Base de Datos (\`app_settings\`):**
   - Llave \`billing_wo_classification\` fijada en \`""\`.
   - Llave \`billing_wo_warehouse\` fijada en \`"Principal"\`.

#### 3. Evidencias y Pruebas Automatizadas
* **Auditoría Forense Celda por Celda (57 Columnas):** Ejecución de \`scripts/test_1to1_sim.cjs\` confirmando \`100% IDENTICAL 1:1 CLONE\` contra el archivo de referencia oficial de 930 registros.
* **TypeScript Compilation:** \`tsc --noEmit\` con código de salida \`0\` (cero errores en todo el proyecto).
`;

spec += scenario360;
fs.writeFileSync('SPEC.md', spec, 'utf8');
console.log('SPEC.md updated with Escenario 360');
