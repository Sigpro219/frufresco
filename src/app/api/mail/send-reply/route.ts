import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  try {
    const supabaseAdmin = createAdminClient();

    // Parse payload
    const { toEmail, subject, message, originalMailId } = await req.json();

    if (!toEmail || !subject || !message) {
      return NextResponse.json({ error: 'Missing required fields: toEmail, subject, message' }, { status: 400 });
    }

    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    let status = 'sent';
    let errorMessage = null;
    let messageId = 'simulated-' + Date.now();

    if (smtpUser && smtpPass) {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });

        const mailOptions = {
          from: `"Investments Cortés (Comercial)" <${smtpUser}>`,
          to: toEmail,
          subject: subject,
          html: message.replace(/\n/g, '<br>'),
          text: message
        };

        const info = await transporter.sendMail(mailOptions);
        messageId = info.messageId || messageId;
        console.log('[Email Inbound] Reply sent successfully:', messageId);
      } catch (smtpErr: any) {
        console.error('[Email Inbound] SMTP Send failed:', smtpErr.message);
        status = 'failed';
        errorMessage = smtpErr.message;
      }
    } else {
      console.warn('[Email Inbound] No SMTP credentials. Simulating reply send.');
    }

    // Insert reply record into mail table
    const { data: replyRecord, error: insertErr } = await supabaseAdmin
      .from('mail')
      .insert([{
        sender_email: smtpUser || 'contacto@investmentscortes.com',
        to_email: toEmail,
        subject: subject,
        message: { text: message, html: message.replace(/\n/g, '<br>') },
        status: status,
        is_inbound: false,
        inbox_type: 'commercial',
        payload: {
          simulated: !smtpUser,
          reply_to_id: originalMailId,
          error: errorMessage,
          message_id: messageId
        }
      }])
      .select()
      .single();

    if (insertErr) {
      console.error('[Email Inbound] Error saving reply record:', insertErr);
    }

    // Update original mail status to 'read' or 'replied'
    if (originalMailId) {
      await supabaseAdmin
        .from('mail')
        .update({ status: 'replied' })
        .eq('id', originalMailId);
    }

    if (status === 'failed') {
      return NextResponse.json({ error: 'Failed to send SMTP email: ' + errorMessage }, { status: 500 });
    }

    return NextResponse.json({ success: true, record: replyRecord });
  } catch (err: any) {
    console.error('[Email Inbound] Error in send-reply:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
