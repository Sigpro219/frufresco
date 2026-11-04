const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const excelPath = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre/Relacion_Diaria_Pedidos_2026-10-30.xlsx';

async function main() {
  console.log('=== COMPARATIVO INFORME ERP VS BASE DE DATOS FRUFRESCO ===\n');

  // 1. Leer el archivo Excel
  const wb = xlsx.readFile(excelPath);
  const data = xlsx.utils.sheet_to_json(wb.Sheets['Informe'], { header: 1 });
  
  // Extraer las filas de pedidos (filas donde data[i][0] es un número del 1 al 68)
  const excelOrders = [];
  for (let i = 2; i < data.length; i++) {
    const r = data[i];
    if (r && typeof r[0] === 'number') {
      excelOrders.push({
        num: r[0],
        tipo: r[1],
        documento: String(r[2] || '').trim(), // e.g. "FV 68777", "REM 92875", "OBS 92915"
        cliente: String(r[3] || '').trim(),
        sucursal: String(r[4] || '').trim(),
        espacio: String(r[5] || '').trim(),
        vrTotal: Number(r[6] || 0),
        vrPagar: Number(r[9] || 0),
        direccion: String(r[11] || '').trim(),
        zona: String(r[15] || '').trim()
      });
    }
  }

  console.log(`Total registros en Informe ERP: ${excelOrders.length}`);

  // 2. Traer todos los pedidos de la base de datos para entrega hoy y mañana (o creados hoy)
  const { data: dbOrders, error: dbErr } = await supabase
    .from('orders')
    .select(`
      id,
      sequence_id,
      profile_id,
      total,
      subtotal,
      status,
      delivery_date,
      created_at,
      origin,
      origin_source,
      admin_notes,
      special_notes,
      logistics_data,
      profiles:profile_id (
        id,
        company_name,
        razon_social,
        nit
      )
    `)
    .or('delivery_date.eq.2026-10-30,delivery_date.eq.2026-10-29,created_at.gte.2026-10-29T05:00:00Z');

  if (dbErr) return console.error('Error DB:', dbErr);
  console.log(`Total pedidos consultados en DB (entregas 29-30 oct / creados hoy): ${dbOrders.length}\n`);

  // 3. Traer audit_logs para saber quién creó qué
  const { data: auditLogs } = await supabase
    .from('audit_logs')
    .select('*')
    .gte('created_at', '2026-10-29T05:00:00Z')
    .eq('action', 'INSERT_orders');

  const creatorMap = new Map(); // order_id -> collaborator_name
  (auditLogs || []).forEach(l => {
    if (l.details?.id) {
      creatorMap.set(l.details.id, l.collaborator_name || 'Desconocido');
    }
  });

  // 4. Mapear DB orders para búsqueda rápida
  // Muchos pedidos tienen en admin_notes o logistics_data la remisión del ERP
  // ej. "REMISION I 92881", "REM 92881", "92881", "FV 68777", etc.
  function normalizeDoc(str) {
    if (!str) return '';
    return str.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function matchesOrder(excelOrd, dbOrd) {
    const docClean = normalizeDoc(excelOrd.documento); // e.g. "FV68777", "REM92875", "OBS92915"
    const docNumOnly = docClean.replace(/^[A-Z]+/, ''); // e.g. "68777", "92875"

    const adminNotesClean = normalizeDoc(dbOrd.admin_notes || '');
    const logistClean = normalizeDoc(JSON.stringify(dbOrd.logistics_data || {}));

    // Coincidencia exacta por número de documento en notas o logistics
    if (docNumOnly && (adminNotesClean.includes(docNumOnly) || logistClean.includes(docNumOnly))) {
      return true;
    }

    // Coincidencia por cliente y sucursal y total
    const dbClient = normalizeDoc(dbOrd.profiles?.company_name || dbOrd.profiles?.razon_social || '');
    const exClient = normalizeDoc(excelOrd.cliente);
    const exSucursal = normalizeDoc(excelOrd.sucursal);

    if (exSucursal && dbClient.includes(exSucursal)) {
      // Misma sucursal
      const diff = Math.abs((dbOrd.total || 0) - excelOrd.vrPagar);
      if (diff < 1000) return true;
    }

    return false;
  }

  const matchedResults = [];
  const missingInDb = [];

  excelOrders.forEach(ex => {
    // Buscar en dbOrders
    const found = dbOrders.find(db => matchesOrder(ex, db));
    if (found) {
      const creator = creatorMap.get(found.id) || (found.admin_notes?.includes('PRUEBA GEMBA') ? 'Carga Masiva PDF' : 'Email/Sistema');
      const isJulissa = creator.toUpperCase().includes('JULISSA');
      matchedResults.push({
        num: ex.num,
        documento: ex.documento,
        cliente: ex.cliente,
        sucursal: ex.sucursal || ex.cliente,
        espacio: ex.espacio,
        vrExcel: ex.vrPagar,
        dbSeq: found.sequence_id,
        dbTotal: found.total,
        dbStatus: found.status,
        dbDelivery: found.delivery_date,
        ingresadoPor: isJulissa ? 'Julissa Arévalo' : (found.admin_notes?.includes('PRUEBA GEMBA') ? 'Carga PDF (Gemba)' : creator)
      });
    } else {
      missingInDb.push({
        num: ex.num,
        tipo: ex.tipo,
        documento: ex.documento,
        cliente: ex.cliente,
        sucursal: ex.sucursal || ex.cliente,
        espacio: ex.espacio,
        vrPagar: ex.vrPagar,
        zona: ex.zona
      });
    }
  });

  console.log(`=== RESULTADO DEL COMPARATIVO ===`);
  console.log(`Total registros en el Informe Excel: ${excelOrders.length}`);
  console.log(`✓ Coincidentes en FruFresco (Ya cargados): ${matchedResults.length}`);
  console.log(`❌ FALTANTES en FruFresco: ${missingInDb.length}\n`);

  // Desglose de los encontrados por quién los subió
  let porPdf = 0, porJulissa = 0, otros = 0;
  matchedResults.forEach(m => {
    if (m.ingresadoPor.includes('PDF')) porPdf++;
    else if (m.ingresadoPor.includes('Julissa')) porJulissa++;
    else otros++;
  });

  console.log(`De los ${matchedResults.length} pedidos encontrados en FruFresco:`);
  console.log(`  - Subidos del PDF (Gemba ERP): ${porPdf}`);
  console.log(`  - Ingresados por Julissa: ${porJulissa}`);
  console.log(`  - Otros orígenes: ${otros}\n`);

  if (missingInDb.length > 0) {
    console.log(`=== DETALLE EXACTO DE LOS PEDIDOS FALTANTES (${missingInDb.length}) ===`);
    console.table(missingInDb);
  } else {
    console.log('¡TODOS LOS PEDIDOS DEL INFORME YA ESTÁN EN EL SISTEMA!');
  }
}

main().catch(err => console.error(err));
