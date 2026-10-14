const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.resolve('.env.local');
const envFile = fs.readFileSync(envPath, 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let val = match[2] || '';
    val = val.trim().replace(/^['"]|['"]$/g, '');
    env[match[1]] = val;
  }
});

const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, supabaseKey);

async function cloneOrdersAndSetInventory() {
  console.log('--- INICIANDO PROTOCOLO DE CLONACIÓN DE 10 PEDIDOS PARA 2026-10-15 ---');

  const targetSequenceIds = [1050, 1002, 983, 1025, 1040, 1023, 1074, 1001, 1069, 1062];
  const targetDeliveryDate = '2026-10-15';

  // 1. Obtener los 10 pedidos maestros y sus ítems
  const { data: sourceOrders, error: fetchErr } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (*)
    `)
    .in('sequence_id', targetSequenceIds)
    .eq('delivery_date', '2026-10-08');

  console.log('fetchErr:', fetchErr);
  console.log('sourceOrders length:', sourceOrders ? sourceOrders.length : null);
  if (fetchErr || !sourceOrders || sourceOrders.length === 0) {
    console.error('Error al obtener pedidos fuente:', fetchErr);
    process.exit(1);
  }

  // Desduplicar por sequence_id por seguridad
  const uniqueSourceOrders = Array.from(new Map(sourceOrders.map(o => [o.sequence_id, o])).values());
  console.log(`Se procesarán ${uniqueSourceOrders.length} pedidos únicos.`);

  const clonedSummary = [];

  for (const src of uniqueSourceOrders) {
    const newOrderId = crypto.randomUUID();
    const originalSeq = src.sequence_id;

    // Preparar cabecera clonada
    const {
      id,
      sequence_id,
      created_at,
      updated_at,
      order_items,
      billing_cut_id,
      is_invoiced,
      invoice_number,
      ...cleanFields
    } = src;

    const clonedOrder = {
      ...cleanFields,
      id: newOrderId,
      delivery_date: targetDeliveryDate,
      status: 'pending_approval', // "POR PROCESAR"
      created_at: new Date().toISOString(),
      billing_cut_id: null,
      admin_notes: `[SIMULACIÓN PIPELINE E2E - 2026-10-15] Clon de #${originalSeq}. ${src.admin_notes || ''}`.trim()
    };

    // Insertar cabecera
    const { data: insertedOrder, error: insOrderErr } = await supabase
      .from('orders')
      .insert(clonedOrder)
      .select('id, sequence_id, total, delivery_date, status')
      .single();

    if (insOrderErr) {
      console.error(`Error al insertar orden clon de #${originalSeq}:`, insOrderErr);
      continue;
    }

    // Preparar e insertar ítems
    const srcItems = src.order_items || [];
    if (srcItems.length > 0) {
      const clonedItems = srcItems.map(item => {
        const { id: itemId, order_id, ...itemFields } = item;
        return {
          ...itemFields,
          id: crypto.randomUUID(),
          order_id: newOrderId
        };
      });

      const { error: insItemsErr } = await supabase
        .from('order_items')
        .insert(clonedItems);

      if (insItemsErr) {
        console.error(`Error insertando ítems para la orden #${insertedOrder.sequence_id}:`, insItemsErr);
      }
    }

    clonedSummary.push({
      originalSeq,
      newSeq: insertedOrder.sequence_id,
      newId: insertedOrder.id,
      total: insertedOrder.total,
      itemsCount: srcItems.length,
      status: insertedOrder.status
    });
  }

  console.log('\n--- PEDIDOS CLONADOS EXITOSAMENTE ---');
  console.table(clonedSummary);

  // 2. Establecer Cierre Oficial D-1 (2026-10-14) para inventario inicial
  console.log('\n--- CONFIGURANDO SALDO INICIAL DE INVENTARIO D-1 (2026-10-14) ---');
  
  const d1Date = '2026-10-14';
  const { data: existingD1 } = await supabase
    .from('daily_inventory_closings')
    .select('id, closing_date')
    .eq('closing_date', d1Date)
    .maybeSingle();

  if (existingD1) {
    console.log(`El cierre para ${d1Date} ya existe (ID: ${existingD1.id}). Está listo como saldo inicial.`);
  } else {
    // Tomar snapshot del último cierre oficial
    const { data: lastClosing } = await supabase
      .from('daily_inventory_closings')
      .select('*')
      .order('closing_date', { ascending: false })
      .limit(1)
      .single();

    if (lastClosing) {
      const newClosing = {
        id: crypto.randomUUID(),
        closing_date: d1Date,
        closed_at: `${d1Date}T23:59:59+00:00`,
        closed_by_name: 'Supervisor de Operaciones (Línea Base D-1 Simulación)',
        notes: `Cierre D-1 automático para fijar Saldo Inicial (Col E) para la jornada de simulación ${targetDeliveryDate}`,
        total_calculated: lastClosing.total_calculated,
        total_physical: lastClosing.total_physical,
        total_missing: 0,
        total_surplus: 0,
        is_locked: true,
        snapshot_items: lastClosing.snapshot_items,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: insClosing, error: closingErr } = await supabase
        .from('daily_inventory_closings')
        .insert(newClosing)
        .select('id, closing_date, total_physical')
        .single();

      if (closingErr) {
        console.error('Error creando cierre D-1:', closingErr);
      } else {
        console.log(`Cierre D-1 creado con éxito para ${insClosing.closing_date} con ${insClosing.total_physical} kg de saldo inicial.`);
      }
    }
  }

  console.log('\n--- PROTOCOLO COMPLETADO SATISFACTORIAMENTE ---');
}

cloneOrdersAndSetInventory().catch(console.error);
