const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let val = (match[2] || '').trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    env[match[1]] = val;
  }
});

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

async function cleanNov4() {
  console.log('=== INICIANDO LIMPIEZA DEL INVENTARIO DEL 4 DE NOVIEMBRE 2026 ===\n');

  // 1. Respaldar estado previo en scratch
  const backup = {};

  const { data: novMovs } = await supabase
    .from('inventory_movements')
    .select('*')
    .gte('created_at', '2026-11-04T00:00:00')
    .lte('created_at', '2026-11-04T23:59:59.999Z');
  backup.inventory_movements = novMovs;

  const { data: order1380 } = await supabase.from('orders').select('*').eq('sequence_id', 1380);
  const { data: order1380Items } = order1380?.[0] ? await supabase.from('order_items').select('*').eq('order_id', order1380[0].id) : { data: [] };
  backup.order_1380 = { order: order1380, items: order1380Items };

  const { data: order1349 } = await supabase.from('orders').select('*').eq('sequence_id', 1349);
  const { data: order1349Items } = order1349?.[0] ? await supabase.from('order_items').select('*').eq('order_id', order1349[0].id) : { data: [] };
  backup.order_1349 = { order: order1349, items: order1349Items };

  const backupDir = path.join(__dirname, '..', 'scratch');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `backup_nov4_before_cleaning_${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2), 'utf8');
  console.log(`[PASO 1] Respaldo de seguridad guardado en: ${backupFile}`);

  // 2. Eliminar movimientos de inventario del 4 de noviembre
  if (novMovs && novMovs.length > 0) {
    const movIds = novMovs.map(m => m.id);
    const { error: delMovErr } = await supabase
      .from('inventory_movements')
      .delete()
      .in('id', movIds);
    if (delMovErr) {
      console.error('Error eliminando inventory_movements:', delMovErr);
    } else {
      console.log(`[PASO 2] Eliminados ${movIds.length} movimiento(s) de inventario del 2026-11-04.`);
    }
  } else {
    console.log('[PASO 2] No se encontraron movimientos de inventario en 2026-11-04.');
  }

  // 3. Eliminar orden de prueba #1380 (INVESTMENTS CORTES) y sus items
  if (order1380 && order1380.length > 0) {
    const oId = order1380[0].id;
    await supabase.from('order_items').delete().eq('order_id', oId);
    const { error: delOrdErr } = await supabase.from('orders').delete().eq('id', oId);
    if (delOrdErr) {
      console.error('Error eliminando orden 1380:', delOrdErr);
    } else {
      console.log('[PASO 3] Eliminada la orden de prueba #1380 y sus items asociados.');
    }
  }

  // 4. Limpiar los 3 items inyectados para pruebas de unidades en Orden #1349
  // Los 3 items de prueba inyectados en add_unit_sales_to_today.js fueron:
  // - Banano uraba (70 Unidades 160 gr)
  // - Mandarina arrayana (60 Unidades 140 gr)
  // - Cubeta huevos tipo aa x 30 unds.
  const testProductIds = [
    'a744edee-13e0-4fbe-a033-c4eea8224e1c', // Banano uraba
    '726ff8f1-13e3-4427-8979-9d9ded523ed2', // Mandarina arrayana
    'b9ee84ba-fdaa-4e53-9a09-0ed6ac48ce33'  // Cubeta huevos
  ];
  if (order1349 && order1349.length > 0) {
    const o1349Id = order1349[0].id;
    const { error: delItemsErr } = await supabase
      .from('order_items')
      .delete()
      .eq('order_id', o1349Id)
      .in('product_id', testProductIds);
    if (delItemsErr) {
      console.error('Error retirando items de prueba de Orden 1349:', delItemsErr);
    } else {
      console.log('[PASO 4] Retirados items de prueba inyectados en Orden #1349.');
    }

    // Regresar Orden #1349 a 'pending_approval' (como las demás 38 órdenes de Nov 4)
    const { error: updOrdErr } = await supabase
      .from('orders')
      .update({ status: 'pending_approval' })
      .eq('id', o1349Id);
    if (updOrdErr) {
      console.error('Error regresando Orden 1349 a pending_approval:', updOrdErr);
    } else {
      console.log('[PASO 4b] Orden #1349 regresada a status: pending_approval.');
    }
  }

  // 5. Eliminar cualquier daily_inventory_closings de 2026-11-04 si existiera
  const { data: closings } = await supabase
    .from('daily_inventory_closings')
    .select('id')
    .eq('closing_date', '2026-11-04');
  if (closings && closings.length > 0) {
    await supabase.from('daily_inventory_closings').delete().in('id', closings.map(c => c.id));
    console.log(`[PASO 5] Eliminados ${closings.length} cierres de inventario del 2026-11-04.`);
  } else {
    console.log('[PASO 5] Cierres diarios para 2026-11-04: ya estaban en 0.');
  }

  // 6. Verificación Final de Estado Limpio para 2026-11-04
  console.log('\n--- VERIFICACIÓN POST-LIMPIEZA PARA 2026-11-04 ---');
  const { data: checkMovs } = await supabase
    .from('inventory_movements')
    .select('id')
    .gte('created_at', '2026-11-04T00:00:00')
    .lte('created_at', '2026-11-04T23:59:59.999Z');
  console.log('Movimientos en inventario:', checkMovs?.length || 0);

  const { data: checkLaunched } = await supabase
    .from('orders')
    .select('id, sequence_id, status')
    .eq('delivery_date', '2026-11-04')
    .in('status', ['para_compra', 'approved', 'picking', 'shipped', 'delivered']);
  console.log('Órdenes lanzadas a operación (para_compra/picking/etc):', checkLaunched?.length || 0);

  const { data: checkClosings } = await supabase
    .from('daily_inventory_closings')
    .select('id')
    .eq('closing_date', '2026-11-04');
  console.log('Cierres oficiales en daily_inventory_closings:', checkClosings?.length || 0);

  console.log('\n¡Limpieza completada con éxito!');
}

cleanNov4().catch(console.error);
