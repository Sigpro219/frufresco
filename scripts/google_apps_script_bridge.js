/**
 * ============================================================================
 * PUENTE DE INGESTA ILIMITADA DE PEDIDOS - FRUFRESCO
 * ============================================================================
 * Este script se ejecuta en Google Apps Script (script.google.com) en la cuenta:
 * frufrescodigital@gmail.com (o la cuenta puente de Google).
 * 
 * Función:
 * 1. Monitorea los correos entrantes de pedidos no leídos.
 * 2. Extrae el emisor original, asunto, cuerpo y archivos adjuntos (PDFs, Excel, fotos).
 * 3. Envía el paquete directamente a la API de FruFresco sin pasar por CloudMailin.
 * 4. Marca el correo como leído y le asigna la etiqueta [PROCESADO_FRUFRESCO].
 * ============================================================================
 */

// URL oficial de producción de FruFresco en Vercel
const FRUFRESCO_WEBHOOK_URL = 'https://frufresco-liard.vercel.app/api/orders/email-ingest';

// Etiqueta para marcar los correos ya tramitados en Gmail
const LABEL_PROCESSED = 'PROCESADO_FRUFRESCO';

function procesarPedidosEntrantes() {
  console.log('Iniciando escaneo de pedidos en bandeja de entrada...');

  // 1. Obtener o crear etiqueta de control
  let label = GmailApp.getUserLabelByName(LABEL_PROCESSED);
  if (!label) {
    label = GmailApp.createLabel(LABEL_PROCESSED);
  }

  // 2. Buscar correos no leídos en la bandeja de entrada
  // Filtra correos no leídos que NO tengan aún la etiqueta de procesado
  const searchQuery = 'label:inbox is:unread -label:' + LABEL_PROCESSED;
  const threads = GmailApp.search(searchQuery, 0, 15);

  if (threads.length === 0) {
    console.log('No hay correos nuevos pendientes por procesar.');
    return;
  }

  console.log('Se encontraron ' + threads.length + ' conversaciones con correos nuevos.');

  for (let t = 0; t < threads.length; t++) {
    const thread = threads[t];
    const messages = thread.getMessages();

    for (let m = 0; m < messages.length; m++) {
      const message = messages[m];

      // Procesar solo mensajes no leídos
      if (!message.isUnread()) {
        continue;
      }

      const subject = message.getSubject() || 'Sin Asunto';
      const from = message.getFrom();
      const to = message.getTo();
      const plainBody = message.getPlainBody() || '';
      const htmlBody = message.getBody() || '';
      const rawAttachments = message.getAttachments();

      console.log('Procesando correo de: ' + from + ' | Asunto: "' + subject + '" | Adjuntos: ' + rawAttachments.length);

      // 3. Ignorar automáticamente spam técnico o newsletters antes de gastar recursos
      const ignorePattern = /noreply|no-reply|mailer-daemon|github|vercel|supabase|googleplay|googleone|resend\.com/i;
      if (ignorePattern.test(from) || ignorePattern.test(subject)) {
        console.log('Ignorando correo de notificación/sistema: ' + from);
        message.markRead();
        thread.addLabel(label);
        continue;
      }

      // 4. Convertir archivos adjuntos (PDFs, Excels, imágenes) a Base64
      const attachments = [];
      for (let a = 0; a < rawAttachments.length; a++) {
        const att = rawAttachments[a];
        try {
          const base64Content = Utilities.base64Encode(att.getBytes());
          attachments.push({
            filename: att.getName(),
            file_name: att.getName(),
            content_type: att.getContentType(),
            content: base64Content
          });
          console.log(' - Adjunto codificado: ' + att.getName() + ' (' + Math.round(att.getSize() / 1024) + ' KB)');
        } catch (attErr) {
          console.error('Error codificando adjunto ' + att.getName() + ': ' + attErr.message);
        }
      }

      // 5. Estructurar payload en formato compatible con /api/orders/email-ingest
      const payload = {
        headers: {
          subject: subject,
          from: from,
          to: to,
          date: message.getDate().toISOString()
        },
        envelope: {
          from: from,
          to: to
        },
        plain: plainBody,
        html: htmlBody,
        attachments: attachments
      };

      // 6. Enviar HTTP POST a FruFresco
      try {
        const options = {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        };

        const response = UrlFetchApp.fetch(FRUFRESCO_WEBHOOK_URL, options);
        const statusCode = response.getResponseCode();
        const responseText = response.getContentText();

        console.log('Respuesta de FruFresco: HTTP ' + statusCode);

        if (statusCode >= 200 && statusCode < 300) {
          console.log('✅ Pedido procesado exitosamente por FruFresco.');
          message.markRead();
          thread.addLabel(label);
        } else {
          console.error('⚠️ FruFresco devolvió error ' + statusCode + ': ' + responseText);
        }
      } catch (postErr) {
        console.error('Error enviando petición a FruFresco: ' + postErr.message);
      }
    }
  }
}

/**
 * Función para instalar el temporizador automático cada 1 minuto.
 * Solo se ejecuta UNA VEZ desde la consola de Apps Script.
 */
function instalarDisparadorAutomatico() {
  // Eliminar disparadores anteriores para evitar duplicados
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }

  // Crear disparador que corre cada 1 minuto
  ScriptApp.newTrigger('procesarPedidosEntrantes')
    .timeBased()
    .everyMinutes(1)
    .create();

  console.log('✅ Disparador automático instalado: revisará correos cada 1 minuto.');
}
