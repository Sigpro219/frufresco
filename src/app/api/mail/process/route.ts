import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

export async function POST(req: Request) {
  let payload: any = null;
  const supabaseAdmin = createAdminClient();
  try {
    payload = await req.json();
    console.log('[Mail Queue Processor] Received webhook:', JSON.stringify(payload));

    // Webhook payload from Supabase has 'record' containing the row values
    const record = payload.record;
    if (!record || !record.id || !record.to_email) {
      return NextResponse.json({ error: 'Invalid record payload' }, { status: 400 });
    }

    const { id, to_email, subject, message, template } = record;

    // 1. Mark mail status as 'processing' to avoid double sends
    await supabaseAdmin
      .from('mail')
      .update({ status: 'processing' })
      .eq('id', id);

    // 2. Render HTML Content
    let htmlContent = '';
    let textContent = '';

    if (message) {
      htmlContent = message.html || '';
      textContent = message.text || '';
    } else if (template) {
      // Basic Template Parser
      const tName = template.name;
      const tData = template.data || {};

      if (tName === 'order_confirmation') {
        const client = tData.client || 'Cliente';
        const orderNum = tData.order_number || 'N/A';
        const total = tData.total_amount || '0';
        const items = tData.items || [];

        const itemsHtml = items.map((it: any) => `
          <tr style="border-bottom: 1px solid #F3F4F6;">
            <td style="padding: 10px 0; font-family: sans-serif; font-size: 14px;">${it.name}</td>
            <td style="padding: 10px 0; text-align: center; font-family: sans-serif; font-size: 14px; font-weight: bold;">${it.quantity}</td>
            <td style="padding: 10px 0; text-align: right; font-family: sans-serif; font-size: 14px;">$${it.price}</td>
            <td style="padding: 10px 0; text-align: right; font-family: sans-serif; font-size: 14px; font-weight: bold;">$${it.total || it.price}</td>
          </tr>
        `).join('');

        htmlContent = `
          <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap" rel="stylesheet">
          <div style="font-family: 'Playfair Display', Georgia, serif; color: #286a36; padding: 40px; background-color: #ffffff; max-width: 600px; margin: auto;">
            <center>
              <img src="https://frufresco-liard.vercel.app/logo-investments.png" width="150" style="margin-bottom: 20px;" alt="Investments Cortés Logo">
              <h1 style="color: #286a36; font-size: 28px; margin-bottom: 10px;">¡Gracias por tu compra, ${client}!</h1>
              <p style="font-size: 16px; color: #555;">Hemos recibido tu pedido con éxito y ya está en preparación.</p>
            </center>
            
            <div style="background: white; padding: 30px; border-radius: 15px; margin-top: 30px; border-left: 5px solid #1f9040; box-shadow: 0 4px 12px rgba(0,0,0,0.02);">
              <h3 style="color: #286a36; margin-top: 0; font-size: 18px; border-bottom: 1px solid #f0f0f0; padding-bottom: 10px;">Resumen del Pedido #${orderNum}</h3>
              <p style="font-size: 13px; color: #666; margin-bottom: 20px;"><b>Fecha:</b> ${new Date().toLocaleDateString('es-CO')}</p>
              
              <table style="width: 100%; border-collapse: collapse; font-family: sans-serif; font-size: 14px;">
                <thead>
                  <tr style="border-bottom: 2px solid #286a36; color: #286a36; text-align: left;">
                    <th style="padding: 10px 5px; font-weight: bold;">Producto</th>
                    <th style="padding: 10px 5px; font-weight: bold; text-align: center;">Cant.</th>
                    <th style="padding: 10px 5px; font-weight: bold; text-align: right;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
              </table>

              <div style="margin-top: 20px; padding-top: 15px; border-top: 2px solid #286a36; text-align: right;">
                <p style="font-size: 16px; color: #286a36; margin: 0;"><b>Total Confirmado: $${total}</b></p>
              </div>
            </div>
            
            <p style="margin-top: 30px; text-align: center; color: #666; font-size: 14px;">
              Te enviaremos otra notificación cuando tu pedido esté en camino.<br>
              Si tienes alguna duda o deseas realizar cambios, puedes responder a este correo.
            </p>
            
            <hr style="border: 0; border-top: 1px solid #1f9040; margin: 40px 0;">
            <center>
              <p style="font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 2px;">Investments Cortés SAS • Del Campo a tu Negocio</p>
            </center>
          </div>
        `;
        textContent = `Hola ${client}, tu orden N° ${orderNum} ha sido confirmada por un total de $${total}.`;
      } else {
        htmlContent = `<p>${JSON.stringify(template)}</p>`;
        textContent = JSON.stringify(template);
      }
    }

    // 3. Send the email
    const resendApiKey = process.env.RESEND_API_KEY;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    let messageId = 'simulated-id';

    if (resendApiKey) {
      console.log('[Mail Queue Processor] Sending via Resend API...');
      const emailPayload = {
        from: 'Investments Cortés (Pedidos) <pedidos@frufresco.com>',
        to: [to_email],
        subject: subject || 'Confirmación de Compra - Investments Cortés',
        html: htmlContent,
        text: textContent
      };

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailPayload)
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Resend API failed: ${errBody}`);
      }

      const resData = await res.json();
      messageId = resData.id;
      console.log('[Mail Queue Processor] Resend response:', resData);

    } else if (smtpUser && smtpPass) {
      console.log('[Mail Queue Processor] Sending via SMTP (Nodemailer)...');
      try {
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });

        const mailOptions = {
          from: `"Investments Cortés (Pedidos)" <${smtpUser}>`,
          to: to_email,
          subject: subject || 'Confirmación de Compra - Investments Cortés',
          html: htmlContent,
          text: textContent
        };

        const info = await transporter.sendMail(mailOptions);
        messageId = info.messageId || 'smtp-id';
        console.log('[Mail Queue Processor] SMTP email sent successfully:', messageId);
      } catch (smtpErr: any) {
        console.error('[Mail Queue Processor] SMTP Send failed, trying fallback log...', smtpErr.message);
        throw smtpErr;
      }
    } else {
      console.warn('[Mail Queue Processor] No email credentials found (RESEND_API_KEY or SMTP_USER/SMTP_PASS). Simulating send in development.');
    }

    // 4. Update status to 'sent' and save the generated template message
    await supabaseAdmin
      .from('mail')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        message: { html: htmlContent, text: textContent }
      })
      .eq('id', id);

    return NextResponse.json({ success: true, messageId });

  } catch (err: any) {
    console.error('[Mail Queue Processor] Critical Error:', err.message);
    
    // Update status to 'failed' in DB
    const recordId = payload?.record?.id;
    if (recordId) {
      await supabaseAdmin
        .from('mail')
        .update({
          status: 'failed',
          error_message: err.message
        })
        .eq('id', recordId);
    }

    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
