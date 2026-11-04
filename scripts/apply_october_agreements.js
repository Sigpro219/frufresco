const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const dir = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre';
const files = [
  { file: 'COLEGIO SAN JORGE.xlsx', templateId: '9a58514a-a4a8-40a3-b86b-8ff401205782', name: 'COLEGIO SAN JORGE DE INGLATERRA' },
  { file: 'CORFERIAS-OCT.xlsx', templateId: 'd58c8789-219b-4aa5-9658-ae2752af4b71', name: 'CORFERIAS' },
  { file: 'LA MONTAÑA.xlsx', templateId: 'f10f2e31-49b6-4b7c-a396-5d83d39a8197', name: 'GIMNASIO LA MONTAÑA' }
];

function resolveLatestProductCost(ccmEntry, purEntry) {
  const ccmCost = ccmEntry && ccmEntry.cost > 0 ? Math.round(ccmEntry.cost) : 0;
  const purCost = purEntry && purEntry.cost > 0 ? Math.round(purEntry.cost) : 0;

  if (ccmCost > 0 && ccmEntry && ccmEntry.updatedBy === 'MANUAL_OVERRIDE') {
    return { cost: ccmCost, isPurchaseNewer: false, unit: ccmEntry.purchase_unit };
  }

  if (ccmCost > 0 && purCost > 0) {
    const ccmTime = ccmEntry.updatedAt || 0;
    const purTime = purEntry.createdAt || 0;
    if (ccmTime >= purTime) {
      return { cost: ccmCost, isPurchaseNewer: false, unit: ccmEntry.purchase_unit };
    }
    const deltaPct = Math.abs(Math.round(((purCost - ccmCost) / ccmCost) * 100));
    if (deltaPct > 20) {
      return { cost: ccmCost, isPurchaseNewer: false, unit: ccmEntry.purchase_unit };
    }
    return {
      cost: purCost,
      isPurchaseNewer: true,
      unit: purEntry.unit
    };
  }

  if (ccmCost > 0) {
    return { cost: ccmCost, isPurchaseNewer: false, unit: ccmEntry.purchase_unit };
  }

  if (purCost > 0) {
    return {
      cost: purCost,
      isPurchaseNewer: true,
      unit: purEntry.unit
    };
  }

  return { cost: 0, isPurchaseNewer: false };
}

function applyProductUnitConversion(rawCost, productId, sourceUnit, targetUnit, conversions) {
  if (!rawCost || rawCost <= 0 || !sourceUnit || !targetUnit || sourceUnit === targetUnit) {
    return Math.round(rawCost);
  }
  const convAB = conversions.find(
    c => c.product_id === productId && c.from_unit === sourceUnit && c.to_unit === targetUnit
  );
  if (convAB && Number(convAB.conversion_factor) > 0) {
    return Math.round(rawCost / Number(convAB.conversion_factor));
  }
  const convBA = conversions.find(
    c => c.product_id === productId && c.from_unit === targetUnit && c.to_unit === sourceUnit
  );
  if (convBA && Number(convBA.conversion_factor) > 0) {
    return Math.round(rawCost * Number(convBA.conversion_factor));
  }
  return Math.round(rawCost);
}

async function main() {
  console.log('=== INICIANDO APLICACIÓN DE ACUERDOS DE OCTUBRE ===\n');

  // 1. Cargar todos los productos
  console.log('1. Cargando catálogo maestro de productos...');
  let allProducts = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, accounting_id, parent_id, unit_of_measure')
      .range(from, from + 999);
    if (error || !data || data.length === 0) break;
    allProducts.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`-> ${allProducts.length} productos cargados.`);

  const byAccId = new Map();
  const byId = new Map();
  allProducts.forEach(p => {
    if (p.accounting_id) byAccId.set(String(p.accounting_id).trim(), p);
    byId.set(p.id, p);
  });

  // 2. Cargar Matriz Comercial (CCM)
  console.log('2. Cargando Matriz Comercial (commercial_cost_matrix)...');
  const { data: ccmData } = await supabase
    .from('commercial_cost_matrix')
    .select('product_id, base_cost, updated_at, updated_by, purchase_unit');
  const costMap = new Map();
  (ccmData || []).forEach(c => {
    if (c.base_cost > 0) {
      costMap.set(c.product_id, {
        cost: Number(c.base_cost),
        updatedAt: c.updated_at ? new Date(c.updated_at).getTime() : 0,
        updatedBy: c.updated_by || null,
        purchase_unit: c.purchase_unit || null
      });
    }
  });

  // 3. Cargar compras históricas
  console.log('3. Cargando compras e historial normalizado...');
  const { data: phnData } = await supabase
    .from('purchase_history_normalized')
    .select('product_id, normalized_price, unit_price, created_at')
    .order('created_at', { ascending: false });

  const purchasesMap = new Map();
  (phnData || []).forEach(p => {
    const normCost = Number(p.normalized_price || p.unit_price || 0);
    if (!purchasesMap.has(p.product_id) && normCost > 0) {
      purchasesMap.set(p.product_id, {
        cost: normCost,
        createdAt: p.created_at ? new Date(p.created_at).getTime() : 0,
        unit: null
      });
    }
  });

  const { data: purchasesData } = await supabase
    .from('purchases')
    .select('product_id, unit_price, created_at, purchase_unit')
    .order('created_at', { ascending: false });

  (purchasesData || []).forEach(p => {
    if (!purchasesMap.has(p.product_id) && Number(p.unit_price) > 0) {
      purchasesMap.set(p.product_id, {
        cost: Number(p.unit_price),
        createdAt: p.created_at ? new Date(p.created_at).getTime() : 0,
        unit: p.purchase_unit || null
      });
    }
  });

  // 4. Conversiones de unidad
  const { data: convData } = await supabase
    .from('product_conversions')
    .select('product_id, from_unit, to_unit, conversion_factor');
  const conversions = convData || [];

  // Función para resolver el costo base exacto de cualquier producto
  function calculateProductBaseCost(prod) {
    const directResolved = resolveLatestProductCost(
      costMap.get(prod.id),
      purchasesMap.get(prod.id)
    );
    let baseCost = directResolved.cost;
    if (baseCost > 0 && directResolved.unit) {
      baseCost = applyProductUnitConversion(
        baseCost,
        prod.id,
        directResolved.unit,
        prod.unit_of_measure,
        conversions
      );
    } else if ((!baseCost || baseCost <= 0) && prod.parent_id) {
      const parentResolved = resolveLatestProductCost(
        costMap.get(prod.parent_id),
        purchasesMap.get(prod.parent_id)
      );
      if (parentResolved.cost > 0) {
        baseCost = applyProductUnitConversion(
          parentResolved.cost,
          prod.id,
          parentResolved.unit,
          prod.unit_of_measure,
          conversions
        );
      }
    }
    return baseCost > 0 ? Math.round(baseCost) : 0;
  }

  // Precalcular costos base para todos los productos
  const productCosts = new Map();
  allProducts.forEach(p => {
    const c = calculateProductBaseCost(p);
    if (c > 0) productCosts.set(p.id, c);
  });

  console.log(`-> Costos calculados: ${productCosts.size} productos tienen costo base activo.\n`);

  // 5. Procesar cada uno de los 3 clientes
  for (const f of files) {
    console.log(`====================================================`);
    console.log(`PROCESANDO: ${f.name} (Archivo: ${f.file})`);
    console.log(`Template ID: ${f.templateId}`);
    console.log(`====================================================`);

    const wb = xlsx.readFile(path.join(dir, f.file));
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    console.log(`Filas leídas en Excel: ${rows.length}`);

    // Consultar items existentes en la plantilla
    const { data: existingItems } = await supabase
      .from('quote_template_items')
      .select('product_id')
      .eq('template_id', f.templateId);

    const existingProdIds = new Set((existingItems || []).map(i => i.product_id));
    console.log(`Items actuales en plantilla: ${existingProdIds.size}`);

    // Determinar productos a agregar a la canasta
    const itemsToInsert = [];
    const missingInCatalog = [];
    const excelProductMap = new Map(); // prod.id -> excelPrice

    rows.forEach(r => {
      const accId = String(r.idProducto || '').trim();
      const excelPrice = Number(r.Precio || 0);
      const p = byAccId.get(accId);

      if (!p) {
        missingInCatalog.push({ idProducto: accId, name: r.Producto });
      } else {
        excelProductMap.set(p.id, excelPrice);
        if (!existingProdIds.has(p.id)) {
          itemsToInsert.push({
            template_id: f.templateId,
            product_id: p.id
          });
          existingProdIds.add(p.id); // evitar duplicados dentro del mismo loop
        }
      }
    });

    if (missingInCatalog.length > 0) {
      console.warn(`[ALERTA] ${missingInCatalog.length} productos no existen en el catálogo:`, missingInCatalog);
    } else {
      console.log(`✓ Todos los ${rows.length} productos del Excel existen en el catálogo maestro.`);
    }

    // Insertar productos faltantes en quote_template_items
    if (itemsToInsert.length > 0) {
      console.log(`Insertando ${itemsToInsert.length} productos nuevos en quote_template_items...`);
      const { error: insertErr } = await supabase
        .from('quote_template_items')
        .upsert(itemsToInsert, { onConflict: 'template_id,product_id' });
      if (insertErr) {
        console.error('Error insertando en quote_template_items:', insertErr);
      } else {
        console.log(`✓ ${itemsToInsert.length} productos insertados exitosamente en la canasta.`);
      }
    } else {
      console.log('✓ La canasta ya contenía todos los productos del Excel.');
    }

    // Cargar márgenes existentes guardados en app_settings si hubiere
    const { data: existingSetting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', `quote_template_margins:${f.templateId}`)
      .maybeSingle();

    let clientMargins = {};
    if (existingSetting && existingSetting.value) {
      try {
        clientMargins = JSON.parse(existingSetting.value);
      } catch (e) {
        clientMargins = {};
      }
    }

    // Calcular la utilidad para cada producto del Excel
    let updatedCount = 0;
    let withCostCount = 0;
    let zeroCostCount = 0;
    const auditSamples = [];

    excelProductMap.forEach((excelPrice, prodId) => {
      const prod = byId.get(prodId);
      const cost = productCosts.get(prodId) || 0;

      let margin = 0;
      if (cost > 0) {
        // Fórmula exacta: Utilidad % = ((Precio_Excel - Costo) / Costo) * 100
        margin = Number((((excelPrice - cost) / cost) * 100).toFixed(2));
        withCostCount++;
      } else {
        // Si no tiene costo aún, dejamos el margen en 0 o preservamos existente
        margin = clientMargins[prodId] !== undefined ? clientMargins[prodId] : 0;
        zeroCostCount++;
      }

      clientMargins[prodId] = margin;
      updatedCount++;

      if (auditSamples.length < 5) {
        const reconstructedPrice = cost > 0 ? Math.round(cost * (1 + margin / 100)) : 0;
        auditSamples.push({
          idProducto: prod.accounting_id,
          nombre: prod.name,
          costoBase: cost,
          precioExcel: excelPrice,
          utilidadPct: `${margin}%`,
          sugSinIva: reconstructedPrice
        });
      }
    });

    // Guardar los márgenes en app_settings
    console.log(`Guardando ${Object.keys(clientMargins).length} márgenes fijos en app_settings (quote_template_margins:${f.templateId})...`);
    const { error: saveErr } = await supabase
      .from('app_settings')
      .upsert({
        key: `quote_template_margins:${f.templateId}`,
        value: JSON.stringify(clientMargins),
        description: `Márgenes fijados basados en acuerdo comercial de octubre para ${f.name}`
      }, { onConflict: 'key' });

    if (saveErr) {
      console.error('Error guardando márgenes en app_settings:', saveErr);
    } else {
      console.log(`✓ Márgenes guardados exitosamente.`);
    }

    console.log(`Resumen para ${f.name}:`);
    console.log(`- Total productos procesados del Excel: ${updatedCount}`);
    console.log(`- Con costo base calculado: ${withCostCount}`);
    console.log(`- Sin costo base (pendientes de ingreso de costo): ${zeroCostCount}`);
    console.log(`- Muestra de auditoría (primeros 5):`);
    console.table(auditSamples);
    console.log('\n');
  }

  console.log('=== TODOS LOS ACUERDOS DE OCTUBRE FUERON APLICADOS EXITOSAMENTE ===');
}

main().catch(err => {
  console.error('Error general:', err);
});
