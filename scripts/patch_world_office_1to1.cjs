const fs = require('fs');

// 1. Patch src/lib/worldOfficeExport.ts
let exportFile = fs.readFileSync('src/lib/worldOfficeExport.ts', 'utf8');

// Replace normalizeWorldOfficeUom
exportFile = exportFile.replace(
  /export function normalizeWorldOfficeUom\(rawUom: string \| null \| undefined\): string \{[\s\S]*?\n\}/,
  `export function normalizeWorldOfficeUom(rawUom: string | null | undefined): string {
    const clean = String(rawUom || 'Kg').trim();
    if (/^(lb|lbs|libra|libras)$/i.test(clean)) return 'LB';
    if (/^(kg|kilo|kilos|kilogramo|kilogramos)$/i.test(clean)) return 'Kg';
    if (/^unid/i.test(clean)) return 'Unidad';
    return clean || 'Kg';
}`
);

// Replace numericTerceroInterno and numericTerceroExterno and Clasificacion & Bodega
exportFile = exportFile.replace(
  /const numericTerceroInterno = Number\(String\(item\.terceroInterno \|\| '456282'\)\.replace\(\/\\D\/g, ''\)\) \|\| 456282;/,
  `const cleanTerceroInterno = String(item.terceroInterno || '456282').trim();`
);

exportFile = exportFile.replace(
  /const numericTerceroExterno = \/\^\\d\+\$\/\.test\(cleanNit\) \? Number\(cleanNit\) : cleanNit;/,
  `const cleanTerceroExterno = String(cleanNit).trim();`
);

exportFile = exportFile.replace(
  /'Encab: Tercero Interno': numericTerceroInterno,/,
  `'Encab: Tercero Interno': cleanTerceroInterno,`
);

exportFile = exportFile.replace(
  /'Encab: Tercero Externo': numericTerceroExterno,/,
  `'Encab: Tercero Externo': cleanTerceroExterno,`
);

exportFile = exportFile.replace(
  /'Encab: Clasificación': item\.clasificacion \|\| 'Facturas de Venta',/,
  `'Encab: Clasificación': item.clasificacion || '',`
);

exportFile = exportFile.replace(
  /'Detalle: Bodega': item\.bodega \|\| 'BODEGA PRINCIPAL',/,
  `'Detalle: Bodega': item.bodega || 'Principal',`
);

fs.writeFileSync('src/lib/worldOfficeExport.ts', exportFile, 'utf8');
console.log('src/lib/worldOfficeExport.ts patched successfully');

// 2. Patch src/app/admin/commercial/billing/page.tsx
let billingPage = fs.readFileSync('src/app/admin/commercial/billing/page.tsx', 'utf8');

// Replace state defaults
billingPage = billingPage.replace(
  /const \[woClassification, setWoClassification\] = useState\('Facturas de Venta'\);/,
  `const [woClassification, setWoClassification] = useState('');`
);

billingPage = billingPage.replace(
  /const \[woWarehouse, setWoWarehouse\] = useState\('BODEGA PRINCIPAL'\);/,
  `const [woWarehouse, setWoWarehouse] = useState('Principal');`
);

// Replace export mappings
billingPage = billingPage.replace(
  /bodega: woWarehouse \|\| 'BODEGA PRINCIPAL',/g,
  `bodega: woWarehouse || 'Principal',`
);

billingPage = billingPage.replace(
  /clasificacion: woClassification \|\| 'Facturas de Venta',/g,
  `clasificacion: woClassification || '',`
);

// Replace save settings default values
billingPage = billingPage.replace(
  /\{ key: 'billing_wo_classification', value: String\(woClassification \|\| 'Facturas de Venta'\), description: 'Clasificación oficial contable en World Office Desktop \(Columna AE\)' \},/,
  `{ key: 'billing_wo_classification', value: String(woClassification || ''), description: 'Clasificación oficial contable en World Office Desktop (Columna AE) - Dejar vacío para importación estándar' },`
);

billingPage = billingPage.replace(
  /\{ key: 'billing_wo_warehouse', value: String\(woWarehouse \|\| 'BODEGA PRINCIPAL'\), description: 'Nombre exacto de la bodega física en World Office Desktop \(Columna AG\)' \},/,
  `{ key: 'billing_wo_warehouse', value: String(woWarehouse || 'Principal'), description: 'Nombre exacto de la bodega física en World Office Desktop (Columna AG)' },`
);

// Replace UI inputs
billingPage = billingPage.replace(
  /placeholder="Ej: Facturas de Venta"/,
  `placeholder="Dejar vacío para plantilla estándar (recomendado)"`
);

billingPage = billingPage.replace(
  /placeholder="Ej: BODEGA PRINCIPAL"/,
  `placeholder="Ej: Principal"`
);

fs.writeFileSync('src/app/admin/commercial/billing/page.tsx', billingPage, 'utf8');
console.log('src/app/admin/commercial/billing/page.tsx patched successfully');
