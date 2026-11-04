const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const excelPath = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre/Relacion_Diaria_Pedidos_2026-10-30.xlsx';

async function main() {
  console.log('=== AUDITORÍA FORENSE DE PEDIDOS DE HOY (29 OCTUBRE 2026) ===\n');

  // 1. Leer el archivo Excel
  const wb = xlsx.readFile(excelPath);
  const sheetName = wb.SheetNames[0];
  const excelRows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName]);
  console.log(`1. Archivo Excel (${path.basename(excelPath)}):`);
  console.log(`   Total filas/pedidos en el Excel: ${excelRows.length}`);

  const excelSequences = new Set();
  const excelOrdersBySeq = new Map();
  excelRows.forEach(r => {
    const seq = Number(r['No. Sistema'] || (r['Consecutivo Planta'] ? String(r['Consecutivo Planta']).replace(/^[0-9]+_/, '') : 0));
    if (seq > 0) {
      excelSequences.add(seq);
      excelOrdersBySeq.set(seq, r);
    }
  });

  // 2. Traer todos los pedidos creados hoy (hora Colombia UTC-5)
  // 2026-10-29T00:00:00-05:00 = 2026-10-29T05:00:00Z
  const startOfDay = '2026-10-29T05:00:00.000Z';
  const { data: dbOrders, error: ordersErr } = await supabase
    .from('orders')
    .select(`
      id,
      sequence_id,
      profile_id,
      total,
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
    .gte('created_at', startOfDay)
    .order('sequence_id', { ascending: true });

  if (ordersErr) return console.error('Error cargando orders:', ordersErr);

  console.log(`\n2. Pedidos en Base de Datos creados hoy: ${dbOrders.length}`);

  // 3. Traer audit_logs de hoy para identificar a los creadores de cada pedido
  const { data: auditLogs, error: auditErr } = await supabase
    .from('audit_logs')
    .select('*')
    .gte('created_at', startOfDay)
    .in('action', ['INSERT_orders', 'DELETE_orders'])
    .order('created_at', { ascending: true });

  if (auditErr) return console.error('Error cargando audit_logs:', auditErr);

  // Mapear qué colaborador insertó cada order_id
  const insertedByCollab = new Map(); // order_id -> collaborator_name
  const julissaInsertedIds = new Set();
  const julissaSequences = new Set();

  (auditLogs || []).forEach(l => {
    if (l.action === 'INSERT_orders' && l.details?.id) {
      const colName = l.collaborator_name || 'Desconocido';
      insertedByCollab.set(l.details.id, colName);
      if (colName.toUpperCase().includes('JULISSA')) {
        julissaInsertedIds.add(l.details.id);
        if (l.details.sequence_id) julissaSequences.add(l.details.sequence_id);
      }
    }
  });

  console.log(`\n3. Auditoría de creación en audit_logs:`);
  console.log(`   Total inserts registrados hoy: ${(auditLogs || []).filter(l => l.action === 'INSERT_orders').length}`);
  console.log(`   Pedidos insertados por Julissa (registrados en audit): ${julissaInsertedIds.size}`);

  // 4. Clasificación de los pedidos de hoy
  let pdfCount = 0;
  let julissaCount = 0;
  let emailCount = 0;
  let othersCount = 0;

  const pdfOrders = [];
  const julissaOrders = [];
  const emailOrders = [];
  const otherOrders = [];

  dbOrders.forEach(o => {
    const creator = insertedByCollab.get(o.id) || '';
    const isJulissa = creator.toUpperCase().includes('JULISSA') || julissaSequences.has(o.sequence_id);

    // Detección de carga masiva de PDF
    const isAdminNotesPdf = o.admin_notes && (
      o.admin_notes.includes('PRUEBA GEMBA ERP ANTIGUO') ||
      o.admin_notes.includes('Orig PDF') ||
      o.admin_notes.includes('REMISION I') ||
      o.admin_notes.includes('REMISION H')
    );
    const isFileUpload = o.origin_source === 'file_upload';

    if (isJulissa) {
      julissaCount++;
      julissaOrders.push(o);
    } else if (isAdminNotesPdf || isFileUpload) {
      pdfCount++;
      pdfOrders.push(o);
    } else if (o.origin_source === 'email' || (o.admin_notes && o.admin_notes.includes('[PEDIDO CORREO]'))) {
      emailCount++;
      emailOrders.push(o);
    } else {
      othersCount++;
      otherOrders.push(o);
    }
  });

  console.log(`\n=== DESGLOSE DE PEDIDOS CREADOS HOY ===`);
  console.log(`- TOTAL PEDIDOS HOY: ${dbOrders.length}`);
  console.log(`  * Subidos del archivo de PDF (Carga masiva ERP): ${pdfCount}`);
  console.log(`  * Ingresados por Julissa (en vivo desde UI): ${julissaCount}`);
  console.log(`  * Ingestados por Correo electrónico (Email Ingest): ${emailCount}`);
  console.log(`  * Otros / No identificados: ${othersCount}`);

  // 5. Cruce con el archivo Excel de Relación Diaria (Relacion_Diaria_Pedidos_2026-10-30.xlsx)
  const dbSequences = new Set(dbOrders.map(o => o.sequence_id));

  // Traer también pedidos con delivery_date = 2026-10-30 aunque se hayan creado antes
  const { data: tomorrowAll } = await supabase
    .from('orders')
    .select('id, sequence_id, status, total, delivery_date')
    .eq('delivery_date', '2026-10-30');

  const allTomorrowSequences = new Set((tomorrowAll || []).map(o => o.sequence_id));

  console.log(`\n=== CRUCE CON EL EXCEL DE RELACIÓN DIARIA (Relacion_Diaria_Pedidos_2026-10-30.xlsx) ===`);
  console.log(`Total pedidos en el Excel: ${excelSequences.size}`);
  console.log(`Total pedidos en DB para entrega mañana (2026-10-30): ${allTomorrowSequences.size}`);

  const missingFromExcelInDb = [];
  const inExcelAndInDb = [];
  excelOrdersBySeq.forEach((row, seq) => {
    if (allTomorrowSequences.has(seq)) {
      inExcelAndInDb.push(seq);
    } else {
      missingFromExcelInDb.push({
        sequence_id: seq,
        consecutivo: row['Consecutivo Planta'],
        cliente: row['Cliente / Sucursal'],
        razon_social: row['Razón Social'],
        valor: row['Total Pedido ($)'],
        kilos: row['Total Kilos (Kg)']
      });
    }
  });

  const inDbNotInExcel = [];
  (tomorrowAll || []).forEach(o => {
    if (!excelSequences.has(o.sequence_id)) {
      inDbNotInExcel.push(o.sequence_id);
    }
  });

  console.log(`\nResultados del Cruce:`);
  console.log(`✓ Coincidentes en Excel y Base de Datos: ${inExcelAndInDb.length}`);
  console.log(`❌ Pedidos del Excel que NO están en la Base de Datos (FALTANTES): ${missingFromExcelInDb.length}`);
  if (missingFromExcelInDb.length > 0) {
    console.log(`\nDetalle de pedidos faltantes del Excel:`);
    console.table(missingFromExcelInDb);
  }

  console.log(`ℹ️ Pedidos en Base de Datos para mañana que NO están en este Excel: ${inDbNotInExcel.length}`);
  if (inDbNotInExcel.length > 0) {
    console.log('Secuencias extras en DB:', inDbNotInExcel);
  }

  // 6. Lista de pedidos creados por Julissa
  console.log(`\n=== DETALLE DE PEDIDOS INGRESADOS POR JULISSA ===`);
  if (julissaOrders.length > 0) {
    console.table(julissaOrders.map(o => ({
      sequence_id: o.sequence_id,
      cliente: o.profiles?.company_name || o.profiles?.razon_social || 'N/A',
      total: o.total,
      canal: o.origin_source,
      creado_hora: new Date(o.created_at).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota' }),
      estado: o.status
    })));
  } else {
    console.log('No se encontraron pedidos atribuidos a Julissa en la clasificación directa.');
  }
}

main().catch(err => console.error(err));
