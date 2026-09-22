import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    const supabaseAdmin = createAdminClient();
    const {
      quoteId,
      clientId,
      clientName,
      validityStart,
      validityEnd,
      agreementItems = []
    } = await req.json();

    if (!quoteId && !agreementItems.length) {
      return NextResponse.json({ error: 'Faltan parámetros del acuerdo' }, { status: 400 });
    }

    let activeQuoteId = quoteId;

    // 1. If no quoteId provided, create a finalized quote record
    if (!activeQuoteId) {
      let subtotalAmount = 0;
      let totalTaxAmount = 0;

      const itemsPayload = agreementItems.map((item: any) => {
        const unitPrice = Number(item.counter_price || item.client_proposed_price || 0);
        const ivaRate = Number(item.matched_product?.iva_rate || item.iva_rate || 0);
        const ivaAmount = unitPrice * (ivaRate / 100);
        const totalPrice = unitPrice + ivaAmount;

        subtotalAmount += unitPrice;
        totalTaxAmount += ivaAmount;

        return {
          product_id: item.matched_product?.id || null,
          product_name: item.matched_product?.name || item.client_product_name,
          quantity: 1,
          cost_basis: Number(item.cost_basis || 0),
          margin_percent: Number(item.margin_percent || 0),
          unit_price: unitPrice,
          iva_rate: ivaRate,
          iva_amount: ivaAmount,
          total_price: totalPrice
        };
      });

      const totalAmount = subtotalAmount + totalTaxAmount;

      const { data: newQuote, error: qErr } = await supabaseAdmin
        .from('quotes')
        .insert([{
          client_id: clientId || null,
          client_name: clientName || 'Cliente',
          subtotal_amount: subtotalAmount,
          total_tax_amount: totalTaxAmount,
          total_amount: totalAmount,
          status: 'agreement',
          version: 2,
          start_date: validityStart || new Date().toISOString().split('T')[0],
          valid_until: validityEnd || null,
          model_snapshot_name: 'Acuerdo Comercial',
        }])
        .select()
        .single();

      if (qErr) throw qErr;
      activeQuoteId = newQuote.id;

      if (itemsPayload.length > 0) {
        const itemsWithQuoteId = itemsPayload.map(i => ({ ...i, quote_id: activeQuoteId }));
        await supabaseAdmin.from('quote_items').insert(itemsWithQuoteId);
      }
    } else {
      // Update existing quote to 'agreement'
      await supabaseAdmin
        .from('quotes')
        .update({
          status: 'agreement',
          client_id: clientId || null,
          start_date: validityStart || new Date().toISOString().split('T')[0],
          valid_until: validityEnd || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', activeQuoteId);
    }

    // Registrar evento en audit_logs según SPEC.md Secc. 7.4 y 7.5
    try {
      await supabaseAdmin.from('audit_logs').insert({
        action: 'ACTIVATE_commercial_agreement',
        module: 'COMMERCIAL',
        details: {
          quote_id: activeQuoteId,
          client_id: clientId || null,
          client_name: clientName || 'Cliente',
          valid_until: validityEnd || null,
          items_count: agreementItems.length,
          timestamp: new Date().toISOString()
        }
      });
    } catch (auditErr) {
      console.warn('[Activate Agreement API] Notice inserting audit_logs:', auditErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Acuerdo Comercial fijado y activado exitosamente',
      quoteId: activeQuoteId,
      validUntil: validityEnd
    });

  } catch (err: any) {
    console.error('[Activate Agreement API] Error:', err);
    return NextResponse.json({ error: err.message || 'Error activating agreement' }, { status: 500 });
  }
}
