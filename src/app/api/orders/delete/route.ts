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
    const { orderId, reason, deletedBy, friendlyId } = body;

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: 'orderId es requerido' }, 
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Audit log previo a la eliminación
    try {
      const { data: currentOrder } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      const { data: currentItems } = await supabaseAdmin
        .from('order_items')
        .select('*')
        .eq('order_id', orderId);

      await supabaseAdmin.from('order_audit_logs').insert([{
        order_id: orderId,
        changed_by: deletedBy || null,
        change_type: 'cancellation',
        reason: reason || 'Eliminación completa desde Control Tower',
        old_data: { order: currentOrder, items: currentItems },
        new_data: { status: 'deleted', friendlyId }
      }]);
    } catch (auditErr) {
      console.warn('[Order Delete API] Advertencia al registrar log de auditoría:', auditErr);
    }

    // 2. Eliminar ítems asociados
    const { error: itemsErr } = await supabaseAdmin
      .from('order_items')
      .delete()
      .eq('order_id', orderId);

    if (itemsErr) {
      console.error('[Order Delete API] Error eliminando ítems asociados:', itemsErr);
      return NextResponse.json(
        { success: false, error: `Error eliminando ítems: ${itemsErr.message}` }, 
        { status: 500 }
      );
    }

    // 3. Eliminar pedido de la tabla orders
    const { error: orderErr } = await supabaseAdmin
      .from('orders')
      .delete()
      .eq('id', orderId);

    if (orderErr) {
      console.error('[Order Delete API] Error eliminando pedido:', orderErr);
      return NextResponse.json(
        { success: false, error: `Error eliminando pedido: ${orderErr.message}` }, 
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      orderId,
      message: `Pedido ${friendlyId || orderId} eliminado completamente.`
    });

  } catch (err: any) {
    console.error('[Order Delete API] Error no controlado:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Error interno del servidor' }, 
      { status: 500 }
    );
  }
}
