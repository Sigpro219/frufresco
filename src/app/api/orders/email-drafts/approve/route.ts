import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { draftId, clientId, clientType, deliveryDate, deliverySlot, address, notes, items, channel, originSource } = body;

    if (!clientId) {
      return NextResponse.json({ error: 'Cliente es requerido para aprobar la orden' }, { status: 400 });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'La orden debe contener al menos un producto' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Fetch client details to ensure profile exists
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', clientId)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ error: `Cliente con ID ${clientId} no encontrado` }, { status: 404 });
    }

    // Calculate subtotal and totals
    let subtotal = 0;
    const formattedItems = items.map((item: any) => {
      const unitPrice = Number(item.unitPrice || item.price || item.base_price || 0);
      const qty = Number(item.quantity || item.qty || 1);
      const totalItemPrice = unitPrice * qty;
      subtotal += totalItemPrice;

      return {
        product_id: item.productId || item.product_id || item.id,
        quantity: qty,
        unit: item.unit || item.unit_of_measure || 'Kg',
        unit_price: unitPrice,
        variant_label: item.observations || item.notes || item.variant_label || null
      };
    });

    const taxes = 0;
    const shippingFee = 0;
    const totalAmount = subtotal + taxes + shippingFee;

    // 2. Insert order header into 'orders' table
    const orderData: any = {
      profile_id: clientId,
      type: (clientType === 'b2c_client' || profile.role === 'b2c') ? 'b2c' : 'b2b',
      status: 'pending_approval',
      subtotal: subtotal,
      tax: taxes,
      total: totalAmount,
      delivery_date: deliveryDate || new Date().toISOString().split('T')[0],
      delivery_slot: deliverySlot || 'AM',
      shipping_address: address || profile.address || 'Bogotá',
      admin_notes: notes || `Pedido ingresado desde Borrador de Correo ID: ${draftId || 'N/A'}`,
      origin_source: originSource || 'email'
    };

    const { data: newOrder, error: orderErr } = await supabaseAdmin
      .from('orders')
      .insert([orderData])
      .select()
      .single();

    if (orderErr) {
      console.error('[Approve Email Draft] Error inserting order header:', orderErr);
      return NextResponse.json({ error: `Error al crear cabecera de orden: ${orderErr.message}` }, { status: 500 });
    }

    // 3. Insert order items into 'order_items' table
    const orderItemsToInsert = formattedItems.map((itm: any) => ({
      order_id: newOrder.id,
      ...itm
    }));

    const { error: itemsErr } = await supabaseAdmin
      .from('order_items')
      .insert(orderItemsToInsert);

    if (itemsErr) {
      console.error('[Approve Email Draft] Error inserting order items:', itemsErr);
      // Clean up order if items insertion failed
      await supabaseAdmin.from('orders').delete().eq('id', newOrder.id);
      return NextResponse.json({ error: `Error al guardar ítems del pedido: ${itemsErr.message}` }, { status: 500 });
    }

    // 4. Registrar memoria de aprendizaje en document_learning_memory para cada ítem verificado
    try {
      const { recordLearningMemory } = require('@/lib/orders/order-parser-engine');
      for (const rawItm of items) {
        const prodId = rawItm.productId || rawItm.product_id || rawItm.id;
        const textToSave = rawItm.originalName || rawItm.productName || rawItm.product_name || rawItm.name;
        const unitToSave = rawItm.unit || rawItm.unit_of_measure || 'Kg';
        if (clientId && prodId && textToSave) {
          await recordLearningMemory(supabaseAdmin, clientId, textToSave, prodId, unitToSave);
        }
      }
    } catch (memErr) {
      console.warn('[Approve Email Draft] Notice updating learning memory:', memErr);
    }

    // 5. Mark draft / inbound email record as processed
    if (draftId) {
      try {
        await supabaseAdmin
          .from('order_drafts')
          .update({ status: 'approved', processed_order_id: newOrder.id })
          .eq('id', draftId);
      } catch (e) {
        console.warn('[Approve Email Draft] Notice updating order_drafts:', e);
      }

      try {
        await supabaseAdmin
          .from('mail')
          .update({ status: 'approved' })
          .eq('id', draftId);
      } catch (e) {
        console.warn('[Approve Email Draft] Notice updating mail table:', e);
      }
    }

    return NextResponse.json({
      success: true,
      orderId: newOrder.id,
      orderNumber: newOrder.order_number || newOrder.id,
      message: 'Pedido creado exitosamente desde borrador de correo'
    });

  } catch (error: any) {
    console.error('[Approve Email Draft API] Internal error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
