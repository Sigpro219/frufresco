import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateOrderConfirmationHtml, generateOrderConfirmationText, OrderEmailItem } from '@/lib/emailTemplates';
import { getFriendlyOrderId } from '@/lib/orderUtils';

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

    // 0. Consultar estado previo de la orden para auditoría y cálculo de diff
    const { data: previousOrder } = await supabaseAdmin
      .from('orders')
      .select(`
        id, created_at, client_id, delivery_date, delivery_slot, shipping_address, source_email,
        total, total_weight_kg, client_po_number,
        profiles (company_name, contact_name, contact_phone, email, nit),
        order_items (id, product_id, quantity, unit_price, nickname, variant_label, products (name, sku, unit_of_measure))
      `)
      .eq('id', orderId)
      .single();

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

    // 6. DETECCIÓN DE CAMBIOS & ENCOLAMIENTO DE REMISIÓN CORREGIDA (DIFF VISUAL)
    try {
      const prevItems: any[] = previousOrder?.order_items || [];
      const hasItemChanges = (Array.isArray(idsToDelete) && idsToDelete.length > 0) || 
                             (Array.isArray(itemsToUpsert) && itemsToUpsert.length > 0);

      const profileObj: any = Array.isArray(previousOrder?.profiles) ? (previousOrder?.profiles[0] || {}) : (previousOrder?.profiles || {});
      const targetEmail = (previousOrder?.source_email || profileObj?.email || '').trim().toLowerCase();

      if (hasItemChanges && targetEmail) {
        const emailItems: OrderEmailItem[] = [];
        let runningSubtotal = 0;

        // A. Ítems vigentes (finalItems)
        (finalItems || []).forEach((fi: any) => {
          const matchingPrev = prevItems.find((pi: any) => pi.id === fi.id || (pi.product_id === fi.product_id && !fi.id));
          const unitPrice = Number(fi.unit_price) || 0;
          const qty = Number(fi.quantity) || 0;
          const lineTotal = unitPrice * qty;
          runningSubtotal += lineTotal;

          const isNew = !matchingPrev;
          const isQtyChanged = matchingPrev && Number(matchingPrev.quantity) !== qty;
          const isPriceChanged = matchingPrev && Number(matchingPrev.unit_price) !== unitPrice;
          const isModified = isQtyChanged || isPriceChanged;

          emailItems.push({
            sku: fi.products?.sku || fi.product_id?.slice(0, 8),
            name: fi.nickname || fi.products?.name || 'Producto',
            quantity: qty,
            unit: fi.products?.unit_of_measure || 'und',
            price: unitPrice,
            total: lineTotal,
            isAdded: isNew,
            isModified: isModified,
            oldQuantity: isModified ? matchingPrev.quantity : undefined,
            oldUnit: isModified ? (matchingPrev.products?.unit_of_measure || 'und') : undefined
          });
        });

        // B. Ítems eliminados (idsToDelete)
        prevItems.forEach((pi: any) => {
          if (idsToDelete.includes(pi.id)) {
            emailItems.push({
              sku: pi.products?.sku || pi.product_id?.slice(0, 8),
              name: pi.nickname || pi.products?.name || 'Producto',
              quantity: pi.quantity,
              unit: pi.products?.unit_of_measure || 'und',
              price: pi.unit_price,
              total: Number(pi.quantity) * Number(pi.unit_price),
              isDeleted: true
            });
          }
        });

        const friendlyOrderNumber = getFriendlyOrderId(previousOrder ? { id: previousOrder.id, created_at: previousOrder.created_at } : { id: orderId, created_at: new Date().toISOString() });
        const emailData = {
          client: profileObj?.company_name || profileObj?.contact_name || 'Cliente FruFresco',
          client_nit: profileObj?.nit || undefined,
          order_number: friendlyOrderNumber,
          client_po_number: previousOrder?.client_po_number || undefined,
          delivery_date: updates?.delivery_date || previousOrder?.delivery_date || 'A programar',
          delivery_slot: updates?.delivery_slot || previousOrder?.delivery_slot || '06:30 AM - 11:00 AM',
          delivery_address: updates?.shipping_address || previousOrder?.shipping_address || profileObj?.address || 'Dirección registrada',
          contact_phone: profileObj?.contact_phone || undefined,
          total_amount: updates?.total !== undefined ? updates.total : runningSubtotal,
          subtotal: runningSubtotal,
          tax: 0,
          items: emailItems,
          is_correction: true
        };

        const emailHtml = generateOrderConfirmationHtml(emailData);
        const emailText = generateOrderConfirmationText(emailData);

        // Cancelar correos pendientes previos de esta misma orden para no enviar duplicados obsoletos
        await supabaseAdmin
          .from('mail')
          .update({ status: 'cancelled', error_message: 'Reemplazado por versión corregida' })
          .eq('to_email', targetEmail)
          .eq('status', 'pending');

        // Encolar con buffer de gracia de 2 minutos
        const graceBufferIso = new Date(Date.now() + 2 * 60 * 1000).toISOString();
        await supabaseAdmin
          .from('mail')
          .insert([{
            to_email: targetEmail,
            subject: `[PEDIDO CORREGIDO] Remisión Nº #${friendlyOrderNumber} - FruFresco`,
            message: { html: emailHtml, text: emailText },
            template: { name: 'order_correction', data: emailData },
            status: 'pending',
            next_retry_at: graceBufferIso
          }]);
          
        console.log(`[Order Update API] Remisión corregida encolada exitosamente para ${targetEmail} con buffer de 2 min.`);
      }
    } catch (mailNotifyErr: any) {
      console.warn('[Order Update API] Advertencia al generar remisión de rectificación:', mailNotifyErr.message);
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
