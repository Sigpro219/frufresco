const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const adicionalesDir = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre/Adicionales';

// Función para resolver el costo base más reciente según lógica canónica de FruFresco
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
  console.log('=== INICIANDO CARGA MASIVA DE ACUERDOS DE OCTUBRE (ADICIONALES) ===\n');

  // PASO 1: Crear los 16 productos nuevos en catálogo si no existen
  console.log('PASO 1: Creando productos nuevos del ERP que no existían en catálogo...');
  const newProductsDefs = [
    { accounting_id: 1676, name: 'Arracacha Selecta', category: 'VE', iva_rate: 0 },
    { accounting_id: 1698, name: 'Bok Choy', category: 'VE', iva_rate: 0 },
    { accounting_id: 1677, name: 'Pepino Europeo Grueso', category: 'VE', iva_rate: 0 },
    { accounting_id: 1678, name: 'Mazorca Desgranada Blanca Empaque Kg', category: 'VE', iva_rate: 0 },
    { accounting_id: 1686, name: 'Pitahaya Dragon', category: 'FR', iva_rate: 0 },
    { accounting_id: 1685, name: 'Zukini Amarillo Baby', category: 'VE', iva_rate: 0 },
    { accounting_id: 1669, name: 'Aji Amarillo - Rojo', category: 'VE', iva_rate: 0 },
    { accounting_id: 1670, name: 'Brotes de Alfalfa x 100Grs', category: 'VE', iva_rate: 0 },
    { accounting_id: 1659, name: 'Esparragos Frescos', category: 'VE', iva_rate: 0 },
    { accounting_id: 1674, name: 'Fresa', category: 'FR', iva_rate: 0 },
    { accounting_id: 1658, name: 'Hongo Champiñon', category: 'VE', iva_rate: 0 },
    { accounting_id: 1671, name: 'Hongo Orellana', category: 'VE', iva_rate: 0 },
    { accounting_id: 1672, name: 'Kiwi', category: 'FR', iva_rate: 0 },
    { accounting_id: 1673, name: 'Raices Chinas', category: 'VE', iva_rate: 0 },
    { accounting_id: 1668, name: 'Yuca Armenia', category: 'VE', iva_rate: 0 },
    { accounting_id: 1690, name: 'Cebolla Ocañera Pelada', category: 'VE', iva_rate: 0 }
  ];

  for (const np of newProductsDefs) {
    const { data: existing } = await supabase.from('products').select('id').eq('accounting_id', np.accounting_id).maybeSingle();
    if (!existing) {
      const { error: insErr } = await supabase.from('products').insert({
        accounting_id: np.accounting_id,
        sku: `ERP-${np.accounting_id}`,
        name: np.name,
        display_name: np.name,
        category: np.category,
        unit_of_measure: 'Kg',
        is_active: true,
        iva_rate: np.iva_rate,
        weight_kg: 1
      });
      if (insErr) console.error(`Error creando producto ${np.accounting_id}:`, insErr);
      else console.log(`✓ Creado producto nuevo: [ID ERP: ${np.accounting_id}] ${np.name}`);
    }
  }

  // PASO 2: Asegurar la existencia de las plantillas en quote_templates
  console.log('\nPASO 2: Asegurando existencia de plantillas en quote_templates...');
  const templatesToEnsure = [
    { name: 'HOTELES EL SALITRE SAS - HOTEL CAPITAL', desc: 'Canasta institucional para Hotel Capital' },
    { name: 'OXOHOTEL S.A.S.', desc: 'Canasta institucional para cadena OxoHotel' },
    { name: 'FELIPE SANCHEZ - TACOCARDIA', desc: 'Canasta institucional para cadena Tacocardia' },
    { name: 'LAO KAO S.A. - WOK FAMILIA', desc: 'Canasta institucional para WOK Familia (Comedor de colaboradores)' }
  ];

  const templateMapByName = new Map();
  const { data: allExistingTpls } = await supabase.from('quote_templates').select('id, name, description');
  (allExistingTpls || []).forEach(t => templateMapByName.set(t.name.trim().toUpperCase(), t.id));

  for (const t of templatesToEnsure) {
    const key = t.name.trim().toUpperCase();
    if (!templateMapByName.has(key)) {
      const { data: created, error: crErr } = await supabase
        .from('quote_templates')
        .insert({ name: t.name, description: t.desc })
        .select()
        .single();
      if (crErr) console.error(`Error creando plantilla ${t.name}:`, crErr);
      else {
        console.log(`✓ Creada nueva plantilla: ${created.name} (ID: ${created.id})`);
        templateMapByName.set(key, created.id);
      }
    }
  }

  // PASO 3: Cargar catálogo maestro de productos actualizado
  console.log('\nPASO 3: Cargando catálogo maestro de productos...');
  let allProducts = [];
  let from = 0;
  while (true) {
    const { data } = await supabase.from('products').select('id, name, accounting_id, parent_id, unit_of_measure').range(from, from + 999);
    if (!data || data.length === 0) break;
    allProducts.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  const byAccId = new Map();
  const byId = new Map();
  allProducts.forEach(p => {
    if (p.accounting_id) byAccId.set(String(p.accounting_id).trim(), p);
    byId.set(p.id, p);
  });
  console.log(`-> ${allProducts.length} productos listos en catálogo.`);

  // PASO 4: Cargar costos base y conversiones
  console.log('PASO 4: Cargando Matriz Comercial y compras históricas...');
  const { data: ccmData } = await supabase.from('commercial_cost_matrix').select('product_id, base_cost, updated_at, updated_by, purchase_unit');
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

  const { data: phnData } = await supabase.from('purchase_history_normalized').select('product_id, normalized_price, unit_price, created_at').order('created_at', { ascending: false });
  const purchasesMap = new Map();
  (phnData || []).forEach(p => {
    const normCost = Number(p.normalized_price || p.unit_price || 0);
    if (!purchasesMap.has(p.product_id) && normCost > 0) {
      purchasesMap.set(p.product_id, { cost: normCost, createdAt: p.created_at ? new Date(p.created_at).getTime() : 0, unit: null });
    }
  });

  const { data: purchasesData } = await supabase.from('purchases').select('product_id, unit_price, created_at, purchase_unit').order('created_at', { ascending: false });
  (purchasesData || []).forEach(p => {
    if (!purchasesMap.has(p.product_id) && Number(p.unit_price) > 0) {
      purchasesMap.set(p.product_id, { cost: Number(p.unit_price), createdAt: p.created_at ? new Date(p.created_at).getTime() : 0, unit: p.purchase_unit || null });
    }
  });

  const { data: convData } = await supabase.from('product_conversions').select('product_id, from_unit, to_unit, conversion_factor');
  const conversions = convData || [];

  function calculateProductBaseCost(prod) {
    const directResolved = resolveLatestProductCost(costMap.get(prod.id), purchasesMap.get(prod.id));
    let baseCost = directResolved.cost;
    if (baseCost > 0 && directResolved.unit) {
      baseCost = applyProductUnitConversion(baseCost, prod.id, directResolved.unit, prod.unit_of_measure, conversions);
    } else if ((!baseCost || baseCost <= 0) && prod.parent_id) {
      const parentResolved = resolveLatestProductCost(costMap.get(prod.parent_id), purchasesMap.get(prod.parent_id));
      if (parentResolved.cost > 0) {
        baseCost = applyProductUnitConversion(parentResolved.cost, prod.id, parentResolved.unit, prod.unit_of_measure, conversions);
      }
    }
    return baseCost > 0 ? Math.round(baseCost) : 0;
  }

  const productCosts = new Map();
  allProducts.forEach(p => {
    const c = calculateProductBaseCost(p);
    if (c > 0) productCosts.set(p.id, c);
  });
  console.log(`-> Costos calculados: ${productCosts.size} productos tienen costo base activo.\n`);

  // PASO 5: Mapeo exacto archivo -> nombre plantilla en quote_templates
  const fileToTemplateConfig = [
    { file: 'aldimar mensual.xlsx', templateName: 'SERVICIOS ALIMENTICIOS ALDIMARK SAS', tipo: 'Matriz (Cascada)' },
    { file: 'ama tu mascota semanal.xlsx', templateName: 'AMATU - AMA TU MASCOTA SAS', tipo: 'Matriz' },
    { file: 'anglo colombiano mensual.xlsx', templateName: 'FUNDACION COLEGIO ANGLO COLOMBIANO', tipo: 'Matriz' },
    { file: 'capital mensual.xlsx', templateName: 'HOTELES EL SALITRE SAS - HOTEL CAPITAL', tipo: 'Sede Específica' },
    { file: 'carnal semanal.xlsx', templateName: 'EL CARNAL', tipo: 'Matriz' },
    { file: 'carnicolas quincenal.xlsx', templateName: 'CARNICOLAS SAS', tipo: 'Matriz (Cascada)' },
    { file: 'cesap mensual.xlsx', templateName: 'CENTRO SOCIAL DE AGENTES Y PATRULLEROS POLICIA NACIONAL', tipo: 'Sede Específica' },
    { file: 'cesne contrato.xlsx', templateName: 'CENTRO SOCIAL DE SUBOFICIALES Y NIVEL EJECUTIVO DE LA POLICIA NACIONAL', tipo: 'Sede Específica' },
    { file: 'crepes mensual.xlsx', templateName: 'CREPES Y WAFFLES S A', tipo: 'Matriz' },
    { file: 'diplomat semestral.xlsx', templateName: 'DIPLOMAT WYNDHAM BOGOTA', tipo: 'Sede Específica' },
    { file: 'inverleoka mensual.xlsx', templateName: 'INVERLEOKA S A', tipo: 'Matriz' },
    { file: 'oxo quincenal.xlsx', templateName: 'OXOHOTEL S.A.S.', tipo: 'Sede / Cadena Hotelera' },
    { file: 'puerto peñalisa mensual.xlsx', templateName: 'CORPORACION CLUB PUERTO PENALISA', tipo: 'Matriz (Cascada)' },
    { file: 'tacocardia semanal.xlsx', templateName: 'FELIPE SANCHEZ - TACOCARDIA', tipo: 'Matriz (Cascada)' },
    { file: 'tequendama mensual.xlsx', templateName: 'TEQUENDAMA SUITES SAS', tipo: 'Sede Hotelera' },
    { file: 'termocity semanal.xlsx', templateName: 'TERMOCITY SAS', tipo: 'Matriz' },
    { file: 'wok familia mensual.xlsx', templateName: 'LAO KAO S.A. - WOK FAMILIA', tipo: 'Sede Específica (Comedor)' },
    { file: 'wok restaurante mensual.xlsx', templateName: 'LAO KAO S.A. - RESTAURANTES WOK', tipo: 'Sede Específica (Restaurantes)' },
    { file: 'yanuba semanal.xlsx', templateName: 'MILSEN SAS', tipo: 'Matriz (Cascada)' }
  ];

  // Refrescar plantillas para obtener todos los IDs actualizados
  const { data: refreshedTpls } = await supabase.from('quote_templates').select('id, name');
  const tplIdMap = new Map();
  (refreshedTpls || []).forEach(t => tplIdMap.set(t.name.trim().toUpperCase(), t.id));

  const summary = [];

  for (const cfg of fileToTemplateConfig) {
    const templateId = tplIdMap.get(cfg.templateName.trim().toUpperCase());
    if (!templateId) {
      console.error(`[ERROR] No se encontró el templateId para ${cfg.templateName}`);
      continue;
    }

    const filePath = path.join(adicionalesDir, cfg.file);
    const wb = xlsx.readFile(filePath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    const rows = rawData.slice(1).filter(r => r && r[0] !== undefined);

    // Obtener items existentes en la plantilla
    const { data: existingItems } = await supabase.from('quote_template_items').select('product_id').eq('template_id', templateId);
    const existingSet = new Set((existingItems || []).map(i => i.product_id));

    const itemsToInsert = [];
    const excelProductMap = new Map();

    rows.forEach(r => {
      const accId = String(r[0] || '').trim();
      const excelPrice = Number(r[2] || 0);
      const prod = byAccId.get(accId);

      if (prod) {
        excelProductMap.set(prod.id, excelPrice);
        if (!existingSet.has(prod.id)) {
          itemsToInsert.push({ template_id: templateId, product_id: prod.id });
          existingSet.add(prod.id);
        }
      }
    });

    // Insertar items faltantes en quote_template_items
    if (itemsToInsert.length > 0) {
      await supabase.from('quote_template_items').upsert(itemsToInsert, { onConflict: 'template_id,product_id' });
    }

    // Cargar márgenes previos si hubiere
    const { data: sData } = await supabase.from('app_settings').select('value').eq('key', `quote_template_margins:${templateId}`).maybeSingle();
    let marginsObj = {};
    if (sData?.value) {
      try { marginsObj = JSON.parse(sData.value); } catch (e) { marginsObj = {}; }
    }

    // Calcular márgenes exactos
    let withCost = 0;
    let withoutCost = 0;
    excelProductMap.forEach((excelPrice, prodId) => {
      const cost = productCosts.get(prodId) || 0;
      let margin = 0;
      if (cost > 0) {
        margin = Number((((excelPrice - cost) / cost) * 100).toFixed(2));
        withCost++;
      } else {
        margin = marginsObj[prodId] !== undefined ? marginsObj[prodId] : 0;
        withoutCost++;
      }
      marginsObj[prodId] = margin;
    });

    // Guardar en app_settings
    await supabase.from('app_settings').upsert({
      key: `quote_template_margins:${templateId}`,
      value: JSON.stringify(marginsObj),
      description: `Márgenes fijados basados en acuerdo de octubre para ${cfg.templateName}`
    }, { onConflict: 'key' });

    console.log(`✓ Procesado: ${cfg.file} -> ${cfg.templateName} (${rows.length} SKUs, +${itemsToInsert.length} agregados)`);

    summary.push({
      archivo: cfg.file,
      cliente: cfg.templateName.slice(0, 35),
      tipo: cfg.tipo,
      skusExcel: rows.length,
      skusAgregados: `+${itemsToInsert.length}`,
      totalEnCanasta: existingSet.size,
      conCosto: withCost,
      sinCosto: withoutCost
    });
  }

  console.log('\n=== REPORTE CONSOLIDADO DE APLICACIÓN DE ACUERDOS ADICIONALES ===');
  console.table(summary);
  console.log('\n🎉 ¡TODOS LOS ACUERDOS ADICIONALES FUERON PROCESADOS Y FIJADOS EXITOSAMENTE!');
}

main().catch(console.error);
