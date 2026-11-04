const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const adicionalesDir = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre/Adicionales';

async function inspect() {
  console.log('=== INSPECCIÓN FORENSE DE ARCHIVOS EN ADICIONALES ===\n');

  const files = fs.readdirSync(adicionalesDir).filter(f => f.endsWith('.xlsx'));
  console.log(`Total archivos encontrados: ${files.length}\n`);

  // 1. Cargar todas las plantillas existentes en quote_templates
  const { data: templates } = await supabase.from('quote_templates').select('id, name, description');
  console.log(`Plantillas existentes en quote_templates: ${(templates || []).length}`);

  // 2. Cargar perfiles de clientes B2B
  const { data: profiles } = await supabase.from('profiles').select('id, company_name, razon_social, nit, role').eq('role', 'b2b_client');
  console.log(`Perfiles B2B disponibles: ${(profiles || []).length}\n`);

  // 3. Cargar catálogo de productos para verificar cobertura de IDs
  let allProducts = [];
  let from = 0;
  while (true) {
    const { data } = await supabase.from('products').select('id, name, accounting_id').range(from, from + 999);
    if (!data || data.length === 0) break;
    allProducts.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  const byAccId = new Map();
  allProducts.forEach(p => {
    if (p.accounting_id) byAccId.set(String(p.accounting_id).trim(), p);
  });
  console.log(`Catálogo maestro: ${allProducts.length} productos en base de datos.\n`);

  const fileAnalysis = [];

  for (const f of files) {
    const filePath = path.join(adicionalesDir, f);
    const wb = xlsx.readFile(filePath);
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    const header = rawData[0] || [];
    const rows = rawData.slice(1).filter(r => r && r.length > 0 && r[0] !== undefined);

    let matchedProds = 0;
    let missingProds = 0;
    const sampleMissing = [];

    // Detectar qué columna tiene el id o nombre
    // Típicamente: [ 'idProducto', 'Producto', 'Precio', 'IVA %' ]
    const idIdx = header.findIndex(h => /idproducto|id|codigo/i.test(String(h || '')));
    const nameIdx = header.findIndex(h => /producto|nombre|descripcion/i.test(String(h || '')));
    const priceIdx = header.findIndex(h => /precio/i.test(String(h || '')));

    rows.forEach(r => {
      const accId = idIdx !== -1 ? String(r[idIdx] || '').trim() : '';
      if (accId && byAccId.has(accId)) {
        matchedProds++;
      } else {
        missingProds++;
        if (sampleMissing.length < 2) {
          sampleMissing.push({ id: accId, name: r[nameIdx] });
        }
      }
    });

    // Buscar match en quote_templates
    const cleanFileName = f.replace(/\.xlsx$/i, '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const matchingTemplate = (templates || []).find(t => {
      const tName = (t.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      // Extraer palabra clave principal
      const words = cleanFileName.split(' ').filter(w => !['mensual', 'semanal', 'quincenal', 'semestral', 'contrato'].includes(w));
      return words.some(w => w.length > 3 && tName.includes(w));
    });

    fileAnalysis.push({
      archivo: f,
      sheet: sheetName,
      totalFilas: rows.length,
      columnas: header.slice(0, 4).join(' | '),
      coincidenCat: `${matchedProds}/${rows.length}`,
      templateMatch: matchingTemplate ? matchingTemplate.name.slice(0, 35) : '❌ SIN PLANTILLA',
      templateId: matchingTemplate ? matchingTemplate.id : null,
      missingSample: missingProds > 0 ? sampleMissing : null
    });
  }

  console.log(`=== REPORTE DE VIABILIDAD POR ARCHIVO ===`);
  console.table(fileAnalysis.map(a => ({
    archivo: a.archivo,
    filas: a.totalFilas,
    coberturaCat: a.coincidenCat,
    plantillaEncontrada: a.templateMatch
  })));

  // Reportar cuáles no tienen plantilla aún
  const sinPlantilla = fileAnalysis.filter(a => !a.templateId);
  console.log(`\nArchivos SIN plantilla existente en quote_templates: ${sinPlantilla.length}`);
  sinPlantilla.forEach(s => console.log(`  - ${s.archivo}`));
}

inspect().catch(err => console.error(err));
