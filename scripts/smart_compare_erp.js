const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const excelPath = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre/Relacion_Diaria_Pedidos_2026-10-30.xlsx';

async function main() {
  const wb = xlsx.readFile(excelPath);
  const data = xlsx.utils.sheet_to_json(wb.Sheets['Informe'], { header: 1 });

  const excelOrders = [];
  for (let i = 2; i < data.length; i++) {
    const r = data[i];
    if (r && typeof r[0] === 'number') {
      excelOrders.push({
        num: r[0],
        tipo: r[1],
        documento: String(r[2] || '').trim(),
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

  // Traer pedidos de hoy
  const startOfDay = '2026-10-29T05:00:00.000Z';
  const { data: dbOrders } = await supabase
    .from('orders')
    .select(`
      id,
      sequence_id,
      profile_id,
      total,
      delivery_date,
      created_at,
      origin_source,
      admin_notes,
      profiles:profile_id (
        id,
        company_name,
        razon_social
      )
    `)
    .gte('created_at', startOfDay);

  // Traer audit logs para saber quién creó qué
  const { data: auditLogs } = await supabase
    .from('audit_logs')
    .select('details, collaborator_name')
    .gte('created_at', startOfDay)
    .eq('action', 'INSERT_orders');

  const julissaOrdersMap = new Set();
  (auditLogs || []).forEach(l => {
    if (l.collaborator_name?.toUpperCase().includes('JULISSA') && l.details?.sequence_id) {
      julissaOrdersMap.add(l.details.sequence_id);
    }
  });

  function norm(str) {
    return (str || '')
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  const matched = [];
  const reallyMissing = [];

  excelOrders.forEach(ex => {
    const exDoc = norm(ex.documento).replace(/^[a-z]+/, ''); // e.g. "68777", "92875"
    const exSuc = norm(ex.sucursal);
    const exCli = norm(ex.cliente);

    let match = null;

    // 1. Coincidencia por número de remisión/factura en admin_notes
    if (exDoc) {
      match = dbOrders.find(db => norm(db.admin_notes || '').includes(exDoc));
    }

    // 2. Coincidencia por nombre de sucursal
    if (!match && exSuc) {
      match = dbOrders.find(db => {
        const dbName = norm(db.profiles?.company_name || db.profiles?.razon_social || '');
        return dbName.includes(exSuc) || exSuc.includes(dbName);
      });
    }

    // 3. Coincidencia por cliente si no tiene sucursal
    if (!match && exCli && !exSuc) {
      match = dbOrders.find(db => {
        const dbName = norm(db.profiles?.company_name || db.profiles?.razon_social || '');
        return dbName.includes(exCli) || exCli.includes(dbName);
      });
    }

    if (match) {
      const isJulissa = julissaOrdersMap.has(match.sequence_id);
      const isPdf = match.admin_notes?.includes('PRUEBA GEMBA') || match.origin_source === 'file_upload';
      matched.push({
        num: ex.num,
        doc: ex.documento,
        sucursal: ex.sucursal || ex.cliente,
        vrExcel: ex.vrPagar,
        dbSeq: match.sequence_id,
        dbTotal: match.total,
        dbDelivery: match.delivery_date,
        creador: isJulissa ? 'Julissa' : (isPdf ? 'PDF' : 'Email/Otro')
      });
    } else {
      reallyMissing.push(ex);
    }
  });

  console.log(`=== CRUCE INTELIGENTE POR SUCURSAL / DOCUMENTO ===`);
  console.log(`Total registros en Excel ERP: ${excelOrders.length}`);
  console.log(`✓ Encontrados en BD FruFresco: ${matched.length}`);
  console.log(`❌ FALTANTES REALES: ${reallyMissing.length}\n`);

  const porCreador = {};
  matched.forEach(m => {
    porCreador[m.creador] = (porCreador[m.creador] || 0) + 1;
  });
  console.log('Desglose de los encontrados:', porCreador);

  console.log(`\n=== LISTA DE LOS ${reallyMissing.length} PEDIDOS FALTANTES ===`);
  if (reallyMissing.length > 0) {
    console.table(reallyMissing.map(r => ({
      num: r.num,
      doc: r.documento,
      cliente: r.cliente,
      sucursal: r.sucursal,
      espacio: r.espacio,
      vrPagar: r.vrPagar,
      zona: r.zona
    })));
  } else {
    console.log('¡No falta ninguno!');
  }

  // Ver si hay pedidos en DB que no correspondan a ninguna fila de este Excel
  const matchedSeqs = new Set(matched.map(m => m.dbSeq));
  const extrasInDb = dbOrders.filter(db => !matchedSeqs.has(db.sequence_id));
  console.log(`\nPedidos en BD creados hoy que no están en este Excel (${extrasInDb.length}):`);
  console.table(extrasInDb.map(e => ({
    sequence_id: e.sequence_id,
    cliente: e.profiles?.company_name || e.profiles?.razon_social,
    total: e.total,
    delivery_date: e.delivery_date,
    origen: julissaOrdersMap.has(e.sequence_id) ? 'Julissa' : 'PDF'
  })));
}

main().catch(err => console.error(err));
