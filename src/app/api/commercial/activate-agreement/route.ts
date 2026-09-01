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
      const totalAmount = agreementItems.reduce((acc: number, i: any) => acc + (i.counter_price || i.client_proposed_price || 0), 0);
      const { data: newQuote, error: qErr } = await supabaseAdmin
        .from('quotes')
        .insert([{
          client_id: clientId || null,
          client_name: clientName || 'Cliente',
          subtotal_amount: totalAmount,
          total_tax_amount: 0,
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

      if (agreementItems.length > 0) {
        const itemsPayload = agreementItems.map((item: any) => ({
          quote_id: activeQuoteId,
          product_id: item.matched_product?.id || null,
          product_name: item.matched_product?.name || item.client_product_name,
          quantity: 1,
          cost_basis: item.cost_basis || 0,
          margin_percent: item.margin_percent || 0,
          unit_price: item.counter_price || item.client_proposed_price,
          iva_rate: 0,
          iva_amount: 0,
          total_price: item.counter_price || item.client_proposed_price,
          
          
        }));

        await supabaseAdmin.from('quote_items').insert(itemsPayload);
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
