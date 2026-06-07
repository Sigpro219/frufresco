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
          <div style="font-family: 'Outfit', sans-serif; color: #111827; padding: 40px; background-color: #F9FAFB; border-radius: 20px; max-width: 600px; margin: auto; border: 1px solid #E5E7EB;">
            <center>
              <img src="https://frufresco.com/logo.png" width="120" style="margin-bottom: 20px;" alt="FruFresco Logo">
              <h2 style="color: #10B981; font-weight: 800; font-size: 24px; margin-bottom: 5px;">¡Pedido Confirmado!</h2>
              <p style="color: #6B7280; font-size: 14px; margin-top: 0;">Orden N° ${orderNum}</p>
            </center>
            
            <div style="background: white; padding: 30px; border-radius: 16px; border-left: 5px solid #10B981; box-shadow: 0 4px 12px rgba(0,0,0,0.02); margin-top: 20px;">
              <p style="margin-top: 0; font-size: 15px; line-height: 1.5;">Hola <b>${client}</b>,</p>
              <p style="font-size: 14px; line-height: 1.5; color: #4B5563;">Tu orden ha sido registrada en el sistema y se encuentra en estado de preparación.</p>
              
              <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                <thead>
                  <tr style="border-bottom: 2px solid #E5E7EB; text-align: left; font-size: 11px; color: #9CA3AF; text-transform: uppercase;">
                    <th style="padding-bottom: 8px;">Producto</th>
                    <th style="padding-bottom: 8px; text-align: center;">Cant.</th>
                    <th style="padding-bottom: 8px; text-align: right;">Unit.</th>
                    <th style="padding-bottom: 8px; text-align: right;">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
              </table>

              <div style="margin-top: 20px; padding-top: 15px; border-top: 2px solid #F3F4F6; display: flex; justify-content: space-between; font-weight: 800; font-size: 16px; color: #111827;">
                <span>Total Confirmado:</span>
                <span style="color: #10B981;">$${total}</span>
              </div>
            </div>
            
            <hr style="border: 0; border-top: 1px solid #E5E7EB; margin: 40px 0;">
            <center>
              <p style="font-size: 11px; color: #9CA3AF; text-transform: uppercase; letter-spacing: 2px;">FruFresco • Del Campo a tu Mesa</p>
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
        from: 'FruFresco <pedidos@frufresco.com>',
        to: [to_email],
        subject: subject || 'Confirmación de Compra - FruFresco',
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
          from: 'FruFresco <pedidos@frufresco.com>',
          to: to_email,
          subject: subject || 'Confirmación de Compra - FruFresco',
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
