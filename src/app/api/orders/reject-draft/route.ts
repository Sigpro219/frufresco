import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    const { draftId, address, sourceEmail, reason } = await req.json();
    if (!draftId || !sourceEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    const supabaseAdmin = createAdminClient();

    // 1. Fetch draft items first to update metadata
    const { data: draftRecord } = await supabaseAdmin
      .from('order_drafts')
      .select('extracted_items')
      .eq('id', draftId)
      .single();

    let updatedExtractedItems = draftRecord?.extracted_items || [];
    if (Array.isArray(updatedExtractedItems)) {
      const metaIdx = updatedExtractedItems.findIndex((itm: any) => itm.isMetadata);
      if (metaIdx > -1) {
        updatedExtractedItems[metaIdx] = {
          ...updatedExtractedItems[metaIdx],
          rejectReason: reason || 'cobertura'
        };
      } else {
        updatedExtractedItems.unshift({
          isMetadata: true,
          rejectReason: reason || 'cobertura'
        });
      }
    }

    // 2. Update draft status to 'rejected' and save metadata
    const { error: draftError } = await supabaseAdmin
      .from('order_drafts')
      .update({ 
        status: 'rejected',
        extracted_items: updatedExtractedItems
      })
      .eq('id', draftId);

    if (draftError) {
      console.error('[Reject Draft API] Error updating draft:', draftError);
      return NextResponse.json({ error: `Error al actualizar borrador: ${draftError.message}` }, { status: 500 });
    }

    // 2. Trigger email sending in the background without awaiting it
    const addressStr = address || 'No especificada';
    const isMontoMinimo = reason === 'monto_minimo';
    const isNoComercializado = reason === 'no_comercializado';
    const isDatosIncompletos = reason === 'datos_incompletos';
    const isPedidoDuplicado = reason === 'pedido_duplicado';
    const isBloqueoCartera = reason === 'bloqueo_cartera';
    const isSinStock = reason === 'sin_stock';
    const isFueraDeHorario = reason === 'fuera_de_horario';
    
    let title = 'Pedido Recibido - Cobertura';
    let subtitle = 'Información sobre el estado de cobertura de tu solicitud.';
    let messageContent = `<p style="font-size: 14px; line-height: 1.5; color: #4B5563;">Queremos informarte sobre el estado de cobertura de tu solicitud de pedido enviado por correo electrónico.</p>
         <p style="font-size: 14px; line-height: 1.5; color: #4B5563;">La dirección proporcionada (<b>${addressStr}</b>) se encuentra <b>fuera de nuestra zona de cobertura actual</b> en Bogotá.</p>
         <p style="font-size: 14px; line-height: 1.5; color: #4B5563;">Agradecemos mucho tu interés y esperamos poder ampliar nuestra cobertura muy pronto para poder atenderte.</p>`;
    let textAlternative = `Hola. Queremos informarte que tu solicitud de pedido se encuentra fuera de nuestra zona de cobertura en Bogotá para la dirección proporcionada (${addressStr}).`;

    if (isMontoMinimo) {
      title = 'Pedido Recibido - Monto Mínimo';
      subtitle = 'Información sobre el monto mínimo requerido para tu solicitud.';
      messageContent = `<p style="font-size: 14px; line-height: 1.5; color: #4B5563;">Queremos informarte que tu solicitud de pedido enviado por correo electrónico no cumple con nuestro <b>monto mínimo de entrega de $100.000 COP</b>.</p>
         <p style="font-size: 14px; line-height: 1.5; color: #4B5563;">Por esta razón, lamentablemente no podemos procesar tu pedido en esta ocasión.</p>
         <p style="font-size: 14px; line-height: 1.5; color: #4B5563;">Te invitamos a realizar un nuevo pedido agregando más productos para alcanzar el monto mínimo y poder brindarte nuestro servicio.</p>`;
      textAlternative = `Hola. Queremos informarte que tu solicitud de pedido no cumple con el monto mínimo de entrega de $100.000 COP.`;
    } else if (isNoComercializado) {
      title = 'Pedido Recibido - Productos no Comercializados';
      subtitle = 'Información sobre la disponibilidad de productos en tu solicitud.';
      messageContent = `<p style="font-size: 14px; line-height: 1.5; color: #4B5563;">Queremos informarte sobre los productos incluidos en tu solicitud de pedido enviado por correo electrónico.</p>
         <p style="font-size: 14px; line-height: 1.5; color: #4B5563;">En FruFresco somos una comercializadora de <b>alimentos y productos del campo</b> y lamentablemente <b>no vendemos ni comercializamos materiales de construcción, ferretería o productos afines</b>.</p>
         <p style="font-size: 14px; line-height: 1.5; color: #4B5563;">Por esta razón, no nos es posible cotizar ni procesar tu solicitud de pedido en esta ocasión.</p>
         <p style="font-size: 14px; line-height: 1.5; color: #4B5563;">Si en el futuro requieres abastecerte de frutas, verduras, abarrotes u otros alimentos, estaremos encantados de servirte.</p>`;
      textAlternative = `Hola. Queremos informarte que en FruFresco somos una comercializadora de alimentos y no vendemos materiales de construcción, por lo que no es posible procesar tu pedido.`;
    } else if (isDatosIncompletos) {
      title = 'Pedido Recibido - Datos Incompletos';
      subtitle = 'Información requerida para procesar tu solicitud.';
      messageContent = `<p style="font-size: 14px; line-height: 1.5; color: #4B5563;">Queremos informarte que tu solicitud de pedido enviado por correo electrónico presenta <b>datos de contacto o dirección de entrega incompletos o insuficientes</b>.</p>
         <p style="font-size: 14px; line-height: 1.5; color: #4B5563;">Para poder procesar, facturar y despachar tus productos de forma correcta, requerimos datos de ubicación precisos y un número de contacto activo.</p>
         <p style="font-size: 14px; line-height: 1.5; color: #4B5563;">Por favor, reenvía tu solicitud incluyendo tu dirección exacta en Bogotá y un número celular de contacto.</p>`;
      textAlternative = `Hola. Queremos informarte que tu solicitud de pedido presenta datos de contacto o dirección de entrega insuficientes. Por favor, envíanos la información completa.`;
    } else if (isPedidoDuplicado) {
      title = 'Solicitud de Pedido - Ya Procesada';
      subtitle = 'Validación de pedidos duplicados.';
      messageContent = `<p style="font-size: 14px; line-height: 1.5; color: #4B5563;">Queremos informarte que hemos recibido tu correo electrónico, pero detectamos que <b>esta solicitud ya ha sido procesada anteriormente</b> o se encuentra duplicada en nuestro sistema.</p>
         <p style="font-size: 14px; line-height: 1.5; color: #4B5563;">Para evitar cobros dobles o despachos incorrectos, hemos descartado este duplicado.</p>
         <p style="font-size: 14px; line-height: 1.5; color: #4B5563;">Si consideras que esto es un error o deseas programar un nuevo despacho independiente, por favor ponte en contacto con nosotros.</p>`;
      textAlternative = `Hola. Queremos informarte que tu solicitud de pedido ya ha sido procesada previamente o está duplicada, por lo que fue descartada para evitar cobros dobles.`;
    } else if (isBloqueoCartera) {
      title = 'Novedad de Cuenta - Pedido Retenido';
      subtitle = 'Información sobre el estado de cartera de tu cuenta comercial.';
      messageContent = `<p style="font-size: 14px; line-height: 1.5; color: #4B5563;">Queremos informarte que tu solicitud de pedido comercial ha sido retenida debido a que tu cuenta presenta un <b>bloqueo de cartera o saldos en mora pendientes de pago</b>.</p>
         <p style="font-size: 14px; line-height: 1.5; color: #4B5563;">De acuerdo con nuestras políticas comerciales, no es posible despachar nuevos pedidos hasta que la cuenta se encuentre al día.</p>
         <p style="font-size: 14px; line-height: 1.5; color: #4B5563;">Por favor, comunícate con el área de cartera para conciliar tu saldo y reactivar tus despachos.</p>`;
      textAlternative = `Hola. Queremos informarte que tu solicitud de pedido ha sido retenida debido a saldos pendientes de pago en cartera. Ponte en contacto con nosotros.`;
    } else if (isSinStock) {
      title = 'Pedido Recibido - Novedad de Inventario';
      subtitle = 'Información sobre disponibilidad de stock para tu pedido.';
      messageContent = `<p style="font-size: 14px; line-height: 1.5; color: #4B5563;">Queremos informarte que lamentablemente <b>no contamos con disponibilidad de inventario suficiente</b> de los productos principales solicitados en tu correo.</p>
         <p style="font-size: 14px; line-height: 1.5; color: #4B5563;">Debido a esta falta de stock imprevista, nos vemos obligados a cancelar el despacho de tu pedido en esta ocasión.</p>
         <p style="font-size: 14px; line-height: 1.5; color: #4B5563;">Nos esforzamos por reabastecernos rápidamente. Te invitamos a consultar la disponibilidad de nuestros productos del campo en los próximos días.</p>`;
      textAlternative = `Hola. Queremos informarte que debido a la falta de stock en los productos principales solicitados, no nos es posible procesar tu pedido en esta ocasión.`;
    } else if (isFueraDeHorario) {
      title = 'Pedido Recibido - Fuera de Horario';
      subtitle = 'Información sobre la programación de tu solicitud.';
      messageContent = `<p style="font-size: 14px; line-height: 1.5; color: #4B5563;">Queremos informarte que tu solicitud de pedido fue recibida <b>fuera del horario límite establecido para la programación de entregas del día de mañana</b>.</p>
         <p style="font-size: 14px; line-height: 1.5; color: #4B5563;">Para garantizar la calidad de la cadena de alistamiento y despacho, contamos con horarios de corte estrictos.</p>
         <p style="font-size: 14px; line-height: 1.5; color: #4B5563;">Te invitamos a realizar tu pedido con mayor anticipación o a programar la entrega para una fecha posterior.</p>`;
      textAlternative = `Hola. Queremos informarte que tu solicitud de pedido fue recibida fuera del horario límite para entregas del día siguiente.`;
    }

    const emailHtml = `
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap" rel="stylesheet">
      <div style="font-family: 'Playfair Display', Georgia, serif; color: #286a36; padding: 40px; background-color: #ffffff; max-width: 600px; margin: auto;">
        <center>
          <img src="https://frufresco-liard.vercel.app/logo-investments.png" width="150" style="margin-bottom: 20px;" alt="Investments Cortés Logo">
          <h1 style="color: #286a36; font-size: 28px; margin-bottom: 10px;">${title}</h1>
          <p style="font-size: 16px; color: #555;">${subtitle}</p>
        </center>
        
        <div style="background: white; padding: 30px; border-radius: 15px; margin-top: 30px; border-left: 5px solid #1f9040; box-shadow: 0 4px 12px rgba(0,0,0,0.02);">
          <h3 style="color: #286a36; margin-top: 0; font-size: 18px; border-bottom: 1px solid #f0f0f0; padding-bottom: 10px;">Novedad sobre tu pedido</h3>
          <p style="font-size: 15px; line-height: 1.5; color: #111827;">Hola,</p>
          ${messageContent}
        </div>
        
        <hr style="border: 0; border-top: 1px solid #1f9040; margin: 40px 0;">
        <center>
          <p style="font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 2px;">Investments Cortés SAS • Del Campo a tu Negocio</p>
        </center>
      </div>
    `;

    console.log('[Reject Draft API] Sending rejection email...');
    const cleanSourceEmail = (sourceEmail || '').toLowerCase().trim();
    const corporateEmails = ['frufrescodigital@gmail.com', 'pedidos@frufresco.com', 'compras@frufresco.com', 'ventas@frufresco.com'];
    const isCorporate = corporateEmails.includes(cleanSourceEmail) || cleanSourceEmail.endsWith('@frufresco.com') || cleanSourceEmail.endsWith('@frufresco.co');

    if (isCorporate) {
      console.log('[Reject Draft API] Corporate/admin email recipient detected. Simulating mail send to avoid spamming inbox.', cleanSourceEmail);
      const { error: insertError } = await supabaseAdmin.from('mail').insert({
        to_email: sourceEmail,
        subject: 'Novedad sobre tu pedido - FruFresco (Simulado)',
        message: {
          text: `[SIMULADO] ${textAlternative}`,
          html: emailHtml
        },
        status: 'sent',
        sent_at: new Date().toISOString()
      });
      if (insertError) {
        console.error('[Reject Draft API] Failed to log simulated mail in database:', insertError);
      }
    } else if (smtpUser && smtpPass) {
      try {
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });

        const info = await transporter.sendMail({
          from: `"Investments Cortés (Pedidos)" <${smtpUser}>`,
          to: sourceEmail,
          subject: 'Novedad sobre tu pedido - FruFresco',
          html: emailHtml,
          text: textAlternative
        });

        const messageId = info.messageId || 'smtp-id';
        console.log('[Reject Draft API] Rejection email sent successfully:', messageId);
        console.log('[Reject Draft API] SMTP response details:', info.response);
        
        // Insert mail copy for history
        const { error: insertError } = await supabaseAdmin.from('mail').insert({
          to_email: sourceEmail,
          subject: 'Novedad sobre tu pedido - FruFresco',
          message: {
            text: textAlternative,
            html: emailHtml
          },
          status: 'sent',
          sent_at: new Date().toISOString()
        });
        if (insertError) {
          console.error('[Reject Draft API] Failed to log sent mail in database:', insertError);
        }
      } catch (smtpErr: any) {
        console.error('[Reject Draft API] SMTP send failed:', smtpErr);
        const { error: insertError } = await supabaseAdmin.from('mail').insert({
          to_email: sourceEmail,
          subject: 'Novedad sobre tu pedido - FruFresco',
          message: {
            text: textAlternative,
            html: emailHtml
          },
          status: 'failed',
          error_message: smtpErr.message || 'SMTP Error'
        });
        if (insertError) {
          console.error('[Reject Draft API] Failed to log failed mail in database:', insertError);
        }
        return NextResponse.json({ 
          error: `Error al enviar el correo por SMTP: ${smtpErr.message || 'SMTP Error'}` 
        }, { status: 500 });
      }
    } else {
      console.warn('[Reject Draft API] No SMTP credentials found (SMTP_USER/SMTP_PASS). Simulating mail send in development.');
      // Insert mail copy for history in simulation mode
      const { error: insertError } = await supabaseAdmin.from('mail').insert({
        to_email: sourceEmail,
        subject: 'Novedad sobre tu pedido - FruFresco (Simulado)',
        message: {
          text: `[SIMULADO] ${textAlternative}`,
          html: emailHtml
        },
        status: 'sent',
        sent_at: new Date().toISOString()
      });
      if (insertError) {
        console.error('[Reject Draft API] Failed to log simulated mail in database:', insertError);
      }
    }

    // Return success
    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error('[Reject Draft API] Critical Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
