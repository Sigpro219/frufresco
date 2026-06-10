import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    const { draftId, deletedItem, sourceEmail, clientName, dbItems, emailItems } = await req.json();

    if (!draftId || !sourceEmail || !deletedItem) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 });
    }

    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    const supabaseAdmin = createAdminClient();

    // 1. Actualizar el borrador en la base de datos con los ítems restantes
    const { error: dbError } = await supabaseAdmin
      .from('order_drafts')
      .update({ extracted_items: dbItems })
      .eq('id', draftId);

    if (dbError) {
      console.error('[Notify Deleted API] Error updating order draft:', dbError);
      return NextResponse.json({ error: `Error actualizando el borrador: ${dbError.message}` }, { status: 500 });
    }

    // 2. Formatear la tabla de productos para el correo
    let totalEstimated = 0;
    const itemsTableRows = emailItems.map((item: any) => {
      const subtotal = (item.unitPrice || 0) * (item.quantity || 0);
      totalEstimated += subtotal;
      
      const formattedPrice = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(item.unitPrice || 0);
      const formattedSubtotal = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(subtotal);

      return `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; font-weight: 600; color: #334155;">${item.productName}</td>
          <td style="padding: 10px 0; text-align: center; color: #475569;">${item.quantity} ${item.unitOfMeasure || 'und'}</td>
          <td style="padding: 10px 0; text-align: right; color: #475569;">${formattedPrice}</td>
          <td style="padding: 10px 0; text-align: right; font-weight: 700; color: #1e293b;">${formattedSubtotal}</td>
        </tr>
      `;
    }).join('');

    const formattedTotal = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(totalEstimated);

    const emailSubject = 'Modificación de tu pedido: Novedad de disponibilidad - FruFresco';
    
    const deletedItemsArray = Array.isArray(deletedItem) ? deletedItem : [deletedItem];
    const isMultiple = deletedItemsArray.length > 1;

    const introText = isMultiple
      ? 'Hemos recibido tu solicitud de pedido enviado por correo electrónico. Queremos informarte que en este momento <strong>no contamos con disponibilidad de los siguientes productos</strong> en nuestro inventario:'
      : 'Hemos recibido tu solicitud de pedido enviado por correo electrónico. Queremos informarte que en este momento <strong>no contamos con disponibilidad del siguiente producto</strong> en nuestro inventario:';

    const deletedItemsHtml = deletedItemsArray.map(item => `
      <div style="background-color: #fef2f2; border: 1px solid #fca5a5; border-radius: 12px; padding: 12px 16px; margin: 8px 0; display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 18px; color: #ef4444;">⚠️</span>
        <span style="font-size: 14px; font-weight: 700; color: #991b1b;">${item} (Agotado / No disponible)</span>
      </div>
    `).join('');

    const removalText = isMultiple
      ? 'Estos productos han sido removidos de tu solicitud para poder proceder con el despacho. A continuación encontrarás el <strong>detalle actualizado de tu pedido</strong> con los productos que sí tenemos disponibles:'
      : 'Este ítem ha sido removido de tu solicitud para poder proceder con el despacho. A continuación encontrarás el <strong>detalle actualizado de tu pedido</strong> con los productos que sí tenemos disponibles:';

    // 3. Crear el HTML premium del correo
    const emailHtml = `
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet">
      <div style="font-family: 'Inter', system-ui, sans-serif; color: #334155; padding: 40px; background-color: #f8fafc; max-width: 600px; margin: auto; border-radius: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
        <center style="margin-bottom: 30px;">
          <img src="https://frufresco-liard.vercel.app/logo-investments.png" width="160" style="margin-bottom: 15px;" alt="Investments Cortés Logo">
          <h1 style="color: #286a36; font-family: 'Playfair Display', Georgia, serif; font-size: 26px; margin: 0 0 10px 0; font-weight: 800;">Novedad en tu Solicitud de Pedido</h1>
          <p style="font-size: 13px; color: #16a34a; margin: 0; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px;">Actualización de Disponibilidad</p>
        </center>
        
        <div style="background: white; padding: 30px; border-radius: 16px; border-top: 4px solid #286a36; box-shadow: 0 4px 12px rgba(0,0,0,0.02); margin-bottom: 25px;">
          <p style="font-size: 15px; color: #334155; font-weight: 700; margin-top: 0;">Estimado/a ${clientName || 'Cliente'},</p>
          <p style="font-size: 14px; line-height: 1.6; color: #475569;">
            ${introText}
          </p>
          
          <div style="margin: 20px 0;">
            ${deletedItemsHtml}
          </div>
          
          <p style="font-size: 14px; line-height: 1.6; color: #475569;">
            ${removalText}
          </p>

          <h3 style="color: #286a36; font-family: 'Playfair Display', Georgia, serif; font-size: 18px; margin: 25px 0 12px 0; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px;">Factura / Detalle del Pedido</h3>
          
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
            <thead>
              <tr style="border-bottom: 2px solid #e2e8f0; color: #64748b;">
                <th style="padding: 8px 0; width: 45%;">Producto</th>
                <th style="padding: 8px 0; text-align: center; width: 20%;">Cant.</th>
                <th style="padding: 8px 0; text-align: right; width: 17%;">Precio U.</th>
                <th style="padding: 8px 0; text-align: right; width: 18%;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemsTableRows || `<tr><td colspan="4" style="padding: 20px 0; text-align: center; color: #94a3b8;">No quedan productos en el pedido</td></tr>`}
            </tbody>
            <tfoot>
              <tr style="border-top: 2px solid #e2e8f0; font-weight: 700; color: #1e293b;">
                <td colspan="3" style="padding: 12px 0;">Total Estimado:</td>
                <td style="padding: 12px 0; text-align: right; color: #16a34a; font-size: 15px;">${formattedTotal}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p style="font-size: 12px; line-height: 1.5; color: #64748b; text-align: center; margin-bottom: 0;">
          Si tienes alguna duda o deseas agregar un producto sustituto, por favor responde directamente a este correo o comunícate con tu asesor de confianza.
        </p>
        
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;">
        <center>
          <p style="font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 2px; font-weight: 700; margin: 0;">Investments Cortés SAS • Del Campo a tu Negocio</p>
        </center>
      </div>
    `;

    const deletedItemsText = deletedItemsArray.join(', ');
    const textAlternative = `Hola. Queremos informarte que en este momento no contamos con disponibilidad de ${isMultiple ? 'los siguientes productos' : 'el siguiente producto'}: "${deletedItemsText}" en nuestro inventario. ${isMultiple ? 'Han' : 'Este ítem ha'} sido removido de tu solicitud de pedido. El valor total estimado de tu pedido es ahora ${formattedTotal}.`;

    console.log('[Notify Deleted API] Sending notification email...');
    const cleanSourceEmail = (sourceEmail || '').toLowerCase().trim();
    const corporateEmails = ['frufrescodigital@gmail.com', 'pedidos@frufresco.com', 'compras@frufresco.com', 'ventas@frufresco.com'];
    const isCorporate = corporateEmails.includes(cleanSourceEmail) || cleanSourceEmail.endsWith('@frufresco.com') || cleanSourceEmail.endsWith('@frufresco.co');

    if (isCorporate) {
      console.log('[Notify Deleted API] Corporate/admin email recipient detected. Simulating mail send to avoid spamming inbox.', cleanSourceEmail);
      await supabaseAdmin.from('mail').insert({
        to_email: sourceEmail,
        subject: `${emailSubject} (Simulado)`,
        message: {
          text: `[SIMULADO] ${textAlternative}`,
          html: emailHtml
        },
        status: 'sent',
        sent_at: new Date().toISOString()
      });
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
          subject: emailSubject,
          html: emailHtml,
          text: textAlternative
        });

        const messageId = info.messageId || 'smtp-id';
        console.log('[Notify Deleted API] Notification email sent successfully:', messageId);
        
        // Registrar en la tabla mail
        await supabaseAdmin.from('mail').insert({
          to_email: sourceEmail,
          subject: emailSubject,
          message: {
            text: textAlternative,
            html: emailHtml
          },
          status: 'sent',
          sent_at: new Date().toISOString()
        });
      } catch (smtpErr: any) {
        console.error('[Notify Deleted API] SMTP send failed:', smtpErr);
        await supabaseAdmin.from('mail').insert({
          to_email: sourceEmail,
          subject: emailSubject,
          message: {
            text: textAlternative,
            html: emailHtml
          },
          status: 'failed',
          error_message: smtpErr.message || 'SMTP Error'
        });
        return NextResponse.json({ 
          error: `Error al enviar el correo por SMTP: ${smtpErr.message || 'SMTP Error'}` 
        }, { status: 500 });
      }
    } else {
      console.warn('[Notify Deleted API] No SMTP credentials found. Simulating mail send.');
      await supabaseAdmin.from('mail').insert({
        to_email: sourceEmail,
        subject: `${emailSubject} (Simulado)`,
        message: {
          text: `[SIMULADO] ${textAlternative}`,
          html: emailHtml
        },
        status: 'sent',
        sent_at: new Date().toISOString()
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Notify Deleted API] Critical Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
