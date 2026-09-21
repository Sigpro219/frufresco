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
    const { draftId, clientId, clientType, deliveryDate, deliverySlot, address, notes, items, channel, originSource, documentUrl } = body;

    const supabaseAdmin = getSupabaseAdmin();

    let finalDocumentUrl = documentUrl || body.attachmentUrl || null;
    if (!finalDocumentUrl && draftId) {
      try {
        const { data: draftData } = await supabaseAdmin
          .from('order_drafts')
          .select('extracted_items')
          .eq('id', draftId)
          .single();

        if (draftData?.extracted_items && Array.isArray(draftData.extracted_items)) {
          const meta = draftData.extracted_items.find((i: any) => i.isMetadata);
          finalDocumentUrl = meta?.attachmentUrl || meta?.attachments?.[0]?.url || null;
        }
      } catch (docErr) {
        console.warn('[Approve Email Draft] Notice extracting attachment url from draft:', docErr);
      }
    }

    if (!clientId) {
      return NextResponse.json({ error: 'Cliente es requerido para aprobar la orden' }, { status: 400 });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'La orden debe contener al menos un producto' }, { status: 400 });
    }

    // 1. Fetch client details to ensure profile exists
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', clientId)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ error: `Cliente con ID ${clientId} no encontrado` }, { status: 404 });
    }

    // Consultar metadatos de los productos para paridad fiscal (IVA) y logística (Peso Kilos)
    const productIds = items.map((i: any) => i.productId || i.product_id || i.id).filter(Boolean);
    const { data: dbProducts } = await supabaseAdmin
      .from('products')
      .select('id, name, base_price, unit_of_measure, weight_kg, iva_rate')
      .in('id', productIds);
    const productsMap = new Map((dbProducts || []).map((p: any) => [p.id, p]));

    // Calcular subtotales, IVA y Peso acumulado idéntico a create/page.tsx
    let totalTax = 0;
    let totalWeightKg = 0;
    let totalGross = 0;

    const formattedItems = items.map((item: any) => {
      const pId = item.productId || item.product_id || item.id;
      const dbProd = productsMap.get(pId);
      const unitPrice = Number(item.unitPrice || item.price || dbProd?.base_price || 0);
      const qty = Number(item.quantity || item.qty || 1);
      const itemTotal = unitPrice * qty;
      totalGross += itemTotal;

      // Paridad Fiscal: IVA según tarifa del producto (19%, 5% o exento 0%)
      const rate = dbProd?.iva_rate !== null && dbProd?.iva_rate !== undefined ? Number(dbProd.iva_rate) : 0;
      if (rate > 0) {
        totalTax += itemTotal * (rate / (100 + rate));
      }

      // Paridad Logística: Cubicación de peso en Kilos para transporte
      const unit = (item.unit || item.unit_of_measure || dbProd?.unit_of_measure || 'Kg').toLowerCase().trim();
      const isKgUnit = ['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos', 'kg.'].includes(unit);
      const isLibraUnit = ['libra', 'libras', 'lb', 'lbs', '500g'].includes(unit);
      let weightFactor = 1.0;
      if (isKgUnit) {
        weightFactor = 1.0;
      } else if (isLibraUnit) {
        weightFactor = 0.5;
      } else if (dbProd?.weight_kg && Number(dbProd.weight_kg) > 0) {
        weightFactor = Number(dbProd.weight_kg);
      } else {
        weightFactor = 1.0;
      }
      totalWeightKg += qty * weightFactor;

      return {
        product_id: pId,
        quantity: qty,
        unit: item.unit || item.unit_of_measure || dbProd?.unit_of_measure || 'Kg',
        unit_price: unitPrice,
        variant_label: item.observations || item.notes || item.variant_label || null
      };
    });

    const taxes = Math.round(totalTax * 100) / 100;
    const subtotal = Math.round((totalGross - taxes) * 100) / 100;
    const shippingFee = 0;
    const totalAmount = totalGross + shippingFee;
    const roundedWeight = Math.round(totalWeightKg * 100) / 100;

    // 2. Insert order header into 'orders' table
    const orderData: any = {
      profile_id: clientId,
      type: (clientType === 'b2c_client' || profile.role === 'b2c') ? 'b2c' : 'b2b',
      status: 'pending_approval',
      subtotal: subtotal,
      tax: taxes,
      total: totalAmount,
      total_weight_kg: roundedWeight,
      delivery_date: deliveryDate || new Date().toISOString().split('T')[0],
      delivery_slot: deliverySlot || 'AM',
      shipping_address: address || profile.address || 'Bogotá',
      admin_notes: notes || `Pedido ingresado desde Borrador de Correo ID: ${draftId || 'N/A'}`,
      origin_source: originSource || 'email',
      document_url: finalDocumentUrl
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
