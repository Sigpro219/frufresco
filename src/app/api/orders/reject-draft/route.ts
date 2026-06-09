import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    const { draftId, address, sourceEmail } = await req.json();
    if (!draftId || !sourceEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabaseAdmin = createAdminClient();

    // 1. Update draft status to 'rejected'
    const { error: draftError } = await supabaseAdmin
      .from('order_drafts')
      .update({ status: 'rejected' })
      .eq('id', draftId);

    if (draftError) {
      console.error('[Reject Draft API] Error updating draft:', draftError);
      return NextResponse.json({ error: draftError.message }, { status: 500 });
    }

    // 2. Insert mail to queue
    const addressStr = address || 'No especificada';
    const { data: insertedMail, error: mailError } = await supabaseAdmin
      .from('mail')
      .insert({
        to_email: sourceEmail,
        subject: 'Rechazo de Pedido - Fuera de Zona de Cobertura',
        message: {
          text: `Hola. Lamentamos informarte que tu solicitud de pedido ha sido rechazada debido a que la dirección proporcionada (${addressStr}) se encuentra fuera de nuestra zona de cobertura en Bogotá.`,
          html: `
            <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap" rel="stylesheet">
            <div style="font-family: 'Playfair Display', Georgia, serif; color: #286a36; padding: 40px; background-color: #ffffff; max-width: 600px; margin: auto;">
              <center>
                <img src="https://frufresco-liard.vercel.app/logo-investments.png" width="150" style="margin-bottom: 20px;" alt="Investments Cortés Logo">
                <h1 style="color: #286a36; font-size: 28px; margin-bottom: 10px;">Pedido Recibido - Cobertura</h1>
                <p style="font-size: 16px; color: #555;">Información sobre el estado de cobertura de tu solicitud.</p>
              </center>
              
              <div style="background: white; padding: 30px; border-radius: 15px; margin-top: 30px; border-left: 5px solid #1f9040; box-shadow: 0 4px 12px rgba(0,0,0,0.02);">
                <h3 style="color: #286a36; margin-top: 0; font-size: 18px; border-bottom: 1px solid #f0f0f0; padding-bottom: 10px;">Novedad sobre tu pedido</h3>
                <p style="font-size: 15px; line-height: 1.5; color: #111827;">Hola,</p>
                <p style="font-size: 14px; line-height: 1.5; color: #4B5563;">Lamentamos informarte que hemos tenido que rechazar tu solicitud de pedido enviado por correo electrónico.</p>
                <p style="font-size: 14px; line-height: 1.5; color: #4B5563;">La dirección proporcionada (<b>${addressStr}</b>) se encuentra <b>fuera de nuestra zona de cobertura actual</b> en Bogotá.</p>
                <p style="font-size: 14px; line-height: 1.5; color: #4B5563;">Agradecemos mucho tu interés y esperamos poder ampliar nuestra cobertura muy pronto para poder atenderte.</p>
              </div>
              
              <hr style="border: 0; border-top: 1px solid #1f9040; margin: 40px 0;">
              <center>
                <p style="font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 2px;">Investments Cortés SAS • Del Campo a tu Negocio</p>
              </center>
            </div>
          `
        }
      })
      .select();

    if (mailError) {
      console.error('[Reject Draft API] Error inserting mail:', mailError);
      return NextResponse.json({ error: mailError.message }, { status: 500 });
    }

    // 3. Trigger queue processor immediately using local fetch
    if (insertedMail && insertedMail.length > 0) {
      try {
        const processUrl = `${new URL(req.url).origin}/api/mail/process`;
        console.log('[Reject Draft API] Triggering mail processor at:', processUrl);
        const res = await fetch(processUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ record: insertedMail[0] })
        });
        if (!res.ok) {
          const errMsg = await res.text();
          console.error('[Reject Draft API] Mail processor returned error:', errMsg);
        } else {
          console.log('[Reject Draft API] Mail processor triggered successfully');
        }
      } catch (processErr) {
        console.error('[Reject Draft API] Error triggering mail process:', processErr);
      }
    }

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error('[Reject Draft API] Critical Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
