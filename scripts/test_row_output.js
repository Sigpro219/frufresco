const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l => l.includes('=')).map(l => {
  const [k, ...v] = l.split('=');
  return [k.trim(), v.join('=').trim().replace(/^['"]|['"]$/g, '')];
}));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function testRowOutput(date) {
  console.log(`\n=================== DATE: ${date} ===================`);
  const { data: launchedOrders } = await supabase
    .from('orders')
    .select('id, sequence_id')
    .eq('delivery_date', date)
    .in('status', ['para_compra', 'approved', 'picking', 'shipped', 'delivered']);

  const orderIds = (launchedOrders || []).map(o => o.id);
  const { data: items } = await supabase
    .from('order_items')
    .select('id, product_id, quantity, unit, variant_label, selected_options')
    .in('order_id', orderIds);

  const bananoId = 'a744edee-13e0-4fbe-a033-c4eea8224e1c';

  // Process salesMap as in code
  const salesMap = new Map();
  (items || []).forEach(it => {
    if (!it.product_id) return;
    const rawQty = Number(it.quantity) || 0;
    const unitStr = (it.unit || '').toLowerCase();
    const sel = it.selected_options;
    const vl = it.variant_label ? String(it.variant_label).trim() : '';

    let isUnit = false;
    let extractedUnits = 0;
    let grammageOrDesc = '';

    if (sel && typeof sel === 'object') {
      if (sel._original_unit && ['un', 'und', 'unidad'].includes(String(sel._original_unit).toLowerCase())) {
        isUnit = true;
        extractedUnits = Number(sel._original_qty) || 0;
      } else if (sel._original_qty && (sel['Presentación'] || sel._conversion_factor)) {
        isUnit = true;
        extractedUnits = Number(sel._original_qty) || 0;
      }
      if (sel._physical_instruction) {
        const m = String(sel._physical_instruction).match(/(?:de\s*)?([0-9.,]+\s*(?:gr|g|kg|ml))/i);
        if (m) grammageOrDesc = m[1];
      } else if (sel['Presentación']) {
        grammageOrDesc = String(sel['Presentación']).replace(/unidad\s*/i, '').trim();
      }
    }

    if (!isUnit && vl) {
      const match = vl.match(/(\d+)\s*(?:unidades|unds?|und)\b/i);
      if (match) {
        isUnit = true;
        extractedUnits = parseInt(match[1], 10);
        const mGram = vl.match(/(?:de\s*)?([0-9.,]+\s*(?:gr|g|kg|ml))/i);
        if (mGram) grammageOrDesc = mGram[1];
      }
    }

    if (!isUnit && ['un', 'und', 'unidad', 'bandeja', 'atado', 'paquete'].includes(unitStr)) {
      isUnit = true;
      extractedUnits = rawQty;
    }

    if (vl && !grammageOrDesc) {
      const mGram = vl.match(/([0-9.,]+\s*(?:gr|g|kg|ml))/i);
      if (mGram) grammageOrDesc = mGram[1];
    }

    const prev = salesMap.get(it.product_id) || {
      pureKg: 0,
      totalUnits: 0,
      totalUnitWeightKg: 0,
      unitGroups: new Map()
    };

    if (isUnit) {
      const u = extractedUnits > 0 ? extractedUnits : rawQty;
      const w = (unitStr === 'kg' && rawQty > 0) ? rawQty : 0;
      const keyDesc = grammageOrDesc || (vl ? vl : 'und');

      const gPrev = prev.unitGroups.get(keyDesc) || { units: 0, weightKg: 0 };
      prev.unitGroups.set(keyDesc, {
        units: gPrev.units + u,
        weightKg: gPrev.weightKg + w
      });

      prev.totalUnits += u;
      prev.totalUnitWeightKg += w;
    } else {
      prev.pureKg += rawQty;
    }

    salesMap.set(it.product_id, prev);
  });

  const saleData = salesMap.get(bananoId);
  console.log('Banano saleData:', {
    pureKg: saleData?.pureKg,
    totalUnits: saleData?.totalUnits,
    totalUnitWeightKg: saleData?.totalUnitWeightKg,
    unitGroups: Array.from(saleData?.unitGroups?.entries() || [])
  });

  const badges = [];
  saleData?.unitGroups.forEach((val, desc) => {
    badges.push(`${val.units} und de ${desc}`);
  });

  console.log('--- COLUMNS RENDERED IN ROW ---');
  console.log(`Col H (VENTA KG) : ${saleData?.pureKg > 0 ? saleData.pureKg.toFixed(2) : '-'}`);
  console.log(`Col I (VENTA UND): ${saleData?.totalUnits > 0 ? saleData.totalUnits : '-'}`);
  console.log(`  -> Badges in Col I:`, badges);
  console.log(`Col J (PESO UND) : ${saleData?.totalUnitWeightKg > 0 ? saleData.totalUnitWeightKg.toFixed(2) : '-'}`);
}

async function run() {
  await testRowOutput('2026-11-04');
  await testRowOutput('2026-11-05');
}
run();
