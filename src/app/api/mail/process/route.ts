import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

// Helper function to send email for a single mail record
async function sendMailRecord(supabaseAdmin: any, record: any): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { id, to_email, subject, message, template } = record;

  try {
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

    const cleanToEmail = (to_email || '').toLowerCase().trim();
    const corporateEmails = ['frufrescodigital@gmail.com', 'pedidos@frufresco.com', 'compras@frufresco.com', 'ventas@frufresco.com'];
    const isCorporate = corporateEmails.includes(cleanToEmail) || cleanToEmail.endsWith('@frufresco.com') || cleanToEmail.endsWith('@frufresco.co');

    if (isCorporate) {
      console.log('[Mail Queue Processor] Corporate/admin email recipient detected. Simulating mail send to avoid spamming inbox.', cleanToEmail);
      messageId = 'simulated-corporate-id';
    } else if (resendApiKey) {
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
        console.error('[Mail Queue Processor] SMTP Send failed:', smtpErr.message);
        throw smtpErr;
      }
    } else {
      console.warn('[Mail Queue Processor] No email credentials found. Simulating send in development.');
    }

    // 4. Update status to 'sent'
    await supabaseAdmin
      .from('mail')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        message: { html: htmlContent, text: textContent },
        error_message: null
      })
      .eq('id', id);

    return { success: true, messageId };

  } catch (err: any) {
    console.error(`[Mail Queue Processor] Error processing mail ID ${id}:`, err.message);
    
    // Retry Backoff Logic: Max 3 retries
    const retryCount = Number(record.retry_count || 0);
    const maxRetries = 3;

    if (retryCount < maxRetries) {
      const nextCount = retryCount + 1;
      
      // Backoff interval: 1st retry = 1 min, 2nd retry = 5 mins, 3rd retry = 15 mins
      const backoffMinutes = nextCount === 1 ? 1 : nextCount === 2 ? 5 : 15;
      const nextRetryAt = new Date();
      nextRetryAt.setMinutes(nextRetryAt.getMinutes() + backoffMinutes);

      await supabaseAdmin
        .from('mail')
        .update({
          status: 'pending', // Mark back to pending so it can be picked up again
          retry_count: nextCount,
          next_retry_at: nextRetryAt.toISOString(),
          error_message: `Retry ${nextCount}/${maxRetries} scheduled. Error: ${err.message}`
        })
        .eq('id', id);
        
      return { success: false, error: `Retry ${nextCount}/${maxRetries} scheduled: ${err.message}` };
    } else {
      // Mark as failed permanently
      await supabaseAdmin
        .from('mail')
        .update({
          status: 'failed',
          error_message: `Failed after ${maxRetries} retries. Last error: ${err.message}`
        })
        .eq('id', id);
        
      return { success: false, error: `Permanent failure: ${err.message}` };
    }
  }
}

export async function POST(req: Request) {
  const supabaseAdmin = createAdminClient();
  let payload: any = null;

  try {
    // Read payload body if available
    try {
      payload = await req.json();
    } catch {}

    // Mode A: Called by Supabase Webhook for a single record
    if (payload && payload.record && payload.record.id) {
      const record = payload.record;
      console.log('[Mail Queue Processor] Processing single webhook record:', record.id);
      
      const result = await sendMailRecord(supabaseAdmin, record);
      if (result.success) {
        return NextResponse.json({ success: true, messageId: result.messageId });
      } else {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }
    }

    // Mode B: Called by Cron / manual poll to flush the pending retry queue
    console.log('[Mail Queue Processor] Flushing queue (polling pending retries)...');
    const now = new Date().toISOString();
    
    // Find up to 10 records that are due for retry
    const { data: pendingMails, error: queryError } = await supabaseAdmin
      .from('mail')
      .select('*')
      .eq('status', 'pending')
      .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
      .limit(10);

    if (queryError) {
      console.error('[Mail Queue Processor] Queue query failed:', queryError.message);
      return NextResponse.json({ error: queryError.message }, { status: 500 });
    }

    if (!pendingMails || pendingMails.length === 0) {
      return NextResponse.json({ success: true, message: 'Queue is clean, no pending retries' });
    }

    console.log(`[Mail Queue Processor] Found ${pendingMails.length} pending mails to process.`);
    const results = [];

    for (const mail of pendingMails) {
      const res = await sendMailRecord(supabaseAdmin, mail);
      results.push({ id: mail.id, success: res.success, error: res.error });
    }

    return NextResponse.json({ success: true, processed: pendingMails.length, results });

  } catch (err: any) {
    console.error('[Mail Queue Processor] Exception:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
