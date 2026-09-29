import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase admin environment variables are missing');
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      orderId, 
      updates, 
      idsToDelete = [], 
      itemsToUpsert = [], 
      auditLog 
    } = body;

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: 'orderId es requerido' }, 
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Ejecutar eliminaciones de ítems si existen
    if (Array.isArray(idsToDelete) && idsToDelete.length > 0) {
      console.log(`[Order Update API] Eliminando ${idsToDelete.length} ítems de la orden ${orderId}...`);
      const { error: delErr } = await supabaseAdmin
        .from('order_items')
        .delete()
        .in('id', idsToDelete);

      if (delErr) {
        console.error('[Order Update API] Error eliminando ítems:', delErr);
        return NextResponse.json(
          { success: false, error: `Error eliminando ítems: ${delErr.message}` }, 
          { status: 500 }
        );
      }
    }

    // 2. Ejecutar inserción / actualización de ítems si existen
    if (Array.isArray(itemsToUpsert) && itemsToUpsert.length > 0) {
      console.log(`[Order Update API] Guardando ${itemsToUpsert.length} ítems en lote...`);
      const { error: upsertErr } = await supabaseAdmin
        .from('order_items')
        .upsert(itemsToUpsert);

      if (upsertErr) {
        console.error('[Order Update API] Error en upsert de ítems:', upsertErr);
        return NextResponse.json(
          { success: false, error: `Error actualizando ítems: ${upsertErr.message}` }, 
          { status: 500 }
        );
      }
    }

    // 3. Actualizar cabecera de la orden
    if (updates && Object.keys(updates).length > 0) {
      const { error: orderErr } = await supabaseAdmin
        .from('orders')
        .update(updates)
        .eq('id', orderId);

      if (orderErr) {
        console.error('[Order Update API] Error actualizando orden:', orderErr);
        return NextResponse.json(
          { success: false, error: `Error en orden: ${orderErr.message}` }, 
          { status: 500 }
        );
      }
    }

    // 4. Inserción de registro de auditoría si se proveyó
    if (auditLog) {
      const { error: auditErr } = await supabaseAdmin
        .from('order_audit_logs')
        .insert([{
          order_id: orderId,
          changed_by: auditLog.changed_by || null,
          change_type: auditLog.change_type || 'modification',
          reason: auditLog.reason || 'Edición desde Control Tower / Detalle de Pedido',
          old_data: auditLog.old_data || null,
          new_data: auditLog.new_data || null
        }]);

      if (auditErr) {
        console.warn('[Order Update API] Advertencia al registrar log de auditoría:', auditErr);
      }
    }

    // 5. Devolver los ítems actualizados y limpios directamente desde la base de datos
    const { data: finalItems, error: fetchErr } = await supabaseAdmin
      .from('order_items')
      .select(`
        *,
        products (
          name, sku, accounting_id, unit_of_measure, weight_kg, image_url, iva_rate
        )
      `)
      .eq('order_id', orderId);

    if (fetchErr) {
      console.warn('[Order Update API] Advertencia al re-consultar ítems actualizados:', fetchErr);
    }

    return NextResponse.json({
      success: true,
      orderId,
      items: finalItems || []
    });

  } catch (err: any) {
    console.error('[Order Update API] Error no controlado:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Error interno del servidor' }, 
      { status: 500 }
    );
  }
}
