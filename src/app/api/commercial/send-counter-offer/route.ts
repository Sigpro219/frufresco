import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  try {
    const supabaseAdmin = createAdminClient();
    const {
      mailId,
      toEmail,
      clientName,
      validityStart,
      validityEnd,
      acceptedItems = [],
      counterOfferedItems = [],
      customMessage = ''
    } = await req.json();

    if (!toEmail) {
      return NextResponse.json({ error: 'Falta el correo destinatario (toEmail)' }, { status: 400 });
    }

    const formatCop = (val: number) => {
      return '$' + new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val || 0);
    };

    // 1. Build Email HTML
    const acceptedRowsHtml = acceptedItems.map((item: any) => `
      <tr style="border-bottom: 1px solid #E2E8F0; font-size: 13px;">
        <td style="padding: 10px 14px; font-weight: 600; color: #1E293B;">${item.client_product_name || item.name}</td>
        <td style="padding: 10px 10px; text-align: center; color: #64748B;">${item.unit || 'Kg'}</td>
        <td style="padding: 10px 14px; text-align: right; font-weight: 800; color: #16A34A;">${formatCop(item.client_proposed_price)}</td>
        <td style="padding: 10px 14px; text-align: center;">
          <span style="background-color: #DCFCE7; color: #15803D; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 800;">✓ ACEPTADO</span>
        </td>
      </tr>
    `).join('');

    const counterRowsHtml = counterOfferedItems.map((item: any) => `
      <tr style="border-bottom: 1px solid #FED7AA; background-color: #FFF7ED; font-size: 13px;">
        <td style="padding: 10px 14px; font-weight: 700; color: #9A3412;">${item.client_product_name || item.name}</td>
        <td style="padding: 10px 10px; text-align: center; color: #7C2D12;">${item.unit || 'Kg'}</td>
        <td style="padding: 10px 14px; text-align: right; color: #94A3B8; text-decoration: line-through;">${formatCop(item.client_proposed_price)}</td>
        <td style="padding: 10px 14px; text-align: right; font-weight: 900; color: #C2410C; font-size: 14px;">
          ${formatCop(item.counter_price)}
        </td>
      </tr>
    `).join('');

    const emailSubject = `Propuesta de Acuerdo Comercial — Investments Cortés / FruFresco — ${clientName || 'Cliente'}`;

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; margin: 0; padding: 20px; }
    .container { max-width: 680px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { background: #111827; padding: 28px 32px; color: #FFFFFF; }
    .content { padding: 32px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th { background-color: #F1F5F9; padding: 10px 14px; text-align: left; font-size: 11px; text-transform: uppercase; color: #475569; letter-spacing: 0.05em; }
    .footer { padding: 24px 32px; background-color: #F8FAFC; border-top: 1px solid #E2E8F0; text-align: center; font-size: 12px; color: #94A3B8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.02em;">Investments Cortés S.A.S • FruFresco</h2>
      <p style="margin: 6px 0 0 0; font-size: 13px; color: #94A3B8;">Respuesta y Negociación de Propuesta Comercial</p>
    </div>

    <div class="content">
      <p style="font-size: 15px; color: #1E293B; line-height: 1.6; margin-top: 0;">
        Estimado(a) <strong>${clientName || 'Cliente'}</strong>,
      </p>
      <p style="font-size: 14px; color: #475569; line-height: 1.6;">
        Hemos analizado detalladamente su propuesta de tarifas y nos complace comunicarle que <strong>nos ajustamos a la gran mayoría de los precios solicitados</strong>.
      </p>

      ${customMessage ? `
        <div style="background-color: #F8FAFC; border-left: 4px solid #16A34A; padding: 14px 18px; border-radius: 8px; margin: 20px 0; font-size: 14px; color: #334155;">
          ${customMessage.replace(/\n/g, '<br>')}
        </div>
      ` : ''}

      ${validityStart ? `
        <div style="background-color: #EFF6FF; border: 1px solid #BFDBFE; padding: 10px 16px; border-radius: 10px; margin: 16px 0; font-size: 13px; color: #1E40AF; display: flex; justify-content: space-between;">
          <span><strong>Vigencia Propuesta:</strong> Desde ${validityStart} ${validityEnd ? 'hasta ' + validityEnd : ''}</span>
        </div>
      ` : ''}

      ${counterOfferedItems.length > 0 ? `
        <h3 style="font-size: 15px; color: #9A3412; margin: 28px 0 8px 0; font-weight: 800;">
          ⚠️ Contrapropuesta de Precios en ${counterOfferedItems.length} Producto(s)
        </h3>
        <p style="font-size: 13px; color: #64748B; margin: 0 0 10px 0;">
          Para los siguientes ítems, debido a las condiciones y costos de abastecimiento en campo, nos permitimos presentarle nuestra mejor tarifa posible:
        </p>
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th style="text-align: center;">Unidad</th>
              <th style="text-align: right;">Su Oferta</th>
              <th style="text-align: right;">Nuestra Contrapropuesta</th>
            </tr>
          </thead>
          <tbody>
            ${counterRowsHtml}
          </tbody>
        </table>
      ` : ''}

      ${acceptedItems.length > 0 ? `
        <h3 style="font-size: 15px; color: #15803D; margin: 28px 0 8px 0; font-weight: 800;">
          ✓ Productos Aceptados al 100% (${acceptedItems.length} ítems)
        </h3>
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th style="text-align: center;">Unidad</th>
              <th style="text-align: right;">Tarifa Acordada</th>
              <th style="text-align: center;">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${acceptedRowsHtml}
          </tbody>
        </table>
      ` : ''}

      <div style="margin-top: 32px; padding: 20px; background-color: #F8FAFC; border-radius: 12px; border: 1px dashed #CBD5E1; text-align: center;">
        <p style="margin: 0; font-size: 14px; font-weight: 700; color: #1E293B;">
          ¿Está de acuerdo con estas tarifas para fijar su Acuerdo Comercial?
        </p>
        <p style="margin: 6px 0 0 0; font-size: 13px; color: #64748B;">
          Puede responder directamente a este correo autorizando las condiciones para activar inmediatamente su lista de precios en nuestro sistema.
        </p>
      </div>

    </div>

    <div class="footer">
      Investments Cortés S.A.S • NIT 901.393.217<br>
      Del Campo a tu Negocio • Tel: +57 320 814 3557 • contacto@investmentscortes.com
    </div>
  </div>
</body>
</html>
    `;

    // 2. Send via SMTP / Nodemailer
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    let sentSuccess = false;

    if (smtpUser && smtpPass) {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: smtpUser, pass: smtpPass }
        });

        await transporter.sendMail({
          from: `"Investments Cortés (Comercial)" <${smtpUser}>`,
          to: toEmail,
          subject: emailSubject,
          html: htmlBody,
          text: `Propuesta de Acuerdo Comercial para ${clientName}. Por favor revise el desglose en el correo adjunto.`
        });
        sentSuccess = true;
      } catch (sendErr: any) {
        console.error('[Send Counter Offer] SMTP Send error:', sendErr.message);
      }
    } else {
      console.warn('[Send Counter Offer] No SMTP credentials, simulating send.');
      sentSuccess = true;
    }

    // 3. Save Outbound Mail Record
    await supabaseAdmin
      .from('mail')
      .insert([{
        to_email: toEmail,
        subject: emailSubject,
        status: 'sent',
        is_inbound: false,
        inbox_type: 'commercial',
        message: {
          html: htmlBody,
          text: `Contrapropuesta enviada a ${clientName}`,
          sender_email: smtpUser || 'investcortes@gmail.com',
          reply_to_id: mailId
        }
      }]);

    // 4. Save Version 2 Quote Record in DB
    const allItems = [...acceptedItems, ...counterOfferedItems];
    const totalAmount = allItems.reduce((acc, i) => acc + (i.counter_price || i.client_proposed_price || 0), 0);

    const { data: quoteV2 } = await supabaseAdmin
      .from('quotes')
      .insert([{
        client_name: clientName || 'Cliente',
        subtotal_amount: totalAmount,
        total_tax_amount: 0,
        total_amount: totalAmount,
        status: 'counter_offer_v2',
        version: 2,
        start_date: validityStart || new Date().toISOString().split('T')[0],
        valid_until: validityEnd || null,
        model_snapshot_name: 'Acuerdo Comercial (Contraoferta)',
        
      }])
      .select()
      .single();

    if (quoteV2 && allItems.length > 0) {
      const quoteItemsPayload = allItems.map((item: any) => ({
        quote_id: quoteV2.id,
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

      await supabaseAdmin.from('quote_items').insert(quoteItemsPayload);
    }

    return NextResponse.json({
      success: true,
      message: 'Contraoferta enviada con éxito',
      quoteId: quoteV2?.id
    });

  } catch (err: any) {
    console.error('[Send Counter Offer API] Error:', err);
    return NextResponse.json({ error: err.message || 'Error sending counter offer' }, { status: 500 });
  }
}
