import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { generateOrderConfirmationHtml, generateOrderConfirmationText } from '@/lib/emailTemplates';

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

    if (message && message.html) {
      htmlContent = message.html;
      textContent = message.text || '';
    } else if (template) {
      const tName = template.name;
      const tData = template.data || {};

      if (tName === 'order_confirmation') {
        htmlContent = generateOrderConfirmationHtml(tData);
        textContent = generateOrderConfirmationText(tData);
      } else {
        htmlContent = `<p>${JSON.stringify(template)}</p>`;
        textContent = JSON.stringify(template);
      }
    }

    // 3. Check App Settings for Email Notifications Mode
    const { data: settingsRows } = await supabaseAdmin
      .from('app_settings')
      .select('key, value')
      .in('key', ['email_notifications_mode', 'email_sandbox_recipient']);

    const settingsMap: Record<string, string> = {};
    (settingsRows || []).forEach((r: any) => { settingsMap[r.key] = r.value; });

    const notificationMode = settingsMap['email_notifications_mode'] || 'sandbox'; // Defaults to 'sandbox'
    const sandboxRecipient = settingsMap['email_sandbox_recipient'] || 'auditoria.investment@gmail.com';

    // 4. Handle Modes
    if (notificationMode === 'disabled') {
      console.log(`[Mail Queue Processor] Notifications disabled by switch. Marking mail ${id} as simulated.`);
      await supabaseAdmin
        .from('mail')
        .update({
          status: 'simulated',
          sent_at: new Date().toISOString(),
          message: { html: htmlContent, text: textContent },
          error_message: 'Modo Silencioso (Notificaciones desactivadas en /admin/settings)'
        })
        .eq('id', id);

      return { success: true, messageId: 'simulated-disabled' };
    }

    // Determine final recipient and subject based on Sandbox vs Live
    const isSandbox = notificationMode === 'sandbox';
    const effectiveToEmail = isSandbox ? sandboxRecipient : (to_email || '').toLowerCase().trim();
    const effectiveSubject = isSandbox ? `[PRUEBAS - Para: ${to_email}] ${subject || 'Confirmación de Pedido FruFresco'}` : (subject || 'Confirmación de Compra - Investments Cortés');

    // 5. Send the email via Resend or SMTP
    const resendApiKey = process.env.RESEND_API_KEY;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    let messageId = 'simulated-id';

    const corporateEmails = ['frufrescodigital@gmail.com', 'pedidos@frufresco.com', 'compras@frufresco.com', 'ventas@frufresco.com'];
    const isCorporate = corporateEmails.includes(effectiveToEmail) || effectiveToEmail.endsWith('@frufresco.com') || effectiveToEmail.endsWith('@frufresco.co');

    if (isCorporate && !isSandbox) {
      console.log('[Mail Queue Processor] Corporate/admin email recipient detected. Simulating mail send to avoid spamming inbox.', effectiveToEmail);
      messageId = 'simulated-corporate-id';
    } else if (resendApiKey) {
      console.log(`[Mail Queue Processor] Sending via Resend API (${isSandbox ? 'SANDBOX' : 'LIVE'})... to: ${effectiveToEmail}`);
      const emailPayload = {
        from: 'Investments Cortés (Pedidos) <pedidos@frufresco.com>',
        to: [effectiveToEmail],
        subject: effectiveSubject,
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
      console.log(`[Mail Queue Processor] Sending via SMTP (Nodemailer) (${isSandbox ? 'SANDBOX' : 'LIVE'})... to: ${effectiveToEmail}`);
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
          to: effectiveToEmail,
          subject: effectiveSubject,
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
      console.warn(`[Mail Queue Processor] No email credentials found. Simulating send in development (${isSandbox ? 'SANDBOX' : 'LIVE'}).`);
      messageId = `simulated-${Date.now()}`;
    }

    // 6. Update status in database
    const finalStatus = isSandbox ? 'sandbox_sent' : 'sent';
    await supabaseAdmin
      .from('mail')
      .update({
        status: finalStatus,
        sent_at: new Date().toISOString(),
        message: { html: htmlContent, text: textContent },
        error_message: isSandbox ? `Redirigido a buzón de pruebas: ${sandboxRecipient}` : null
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
