export interface OrderEmailItem {
  sku?: string;
  name: string;
  quantity: number | string;
  unit?: string;
  price: string | number;
  total?: string | number;
  // Diff support para rectificaciones
  isAdded?: boolean;
  isModified?: boolean;
  isDeleted?: boolean;
  oldQuantity?: number | string;
  oldUnit?: string;
}

export interface OrderConfirmationEmailData {
  client: string;
  client_nit?: string;
  order_number: string;
  client_po_number?: string;
  delivery_date?: string;
  delivery_slot?: string;
  delivery_address?: string;
  contact_phone?: string;
  total_amount: string | number;
  subtotal?: string | number;
  tax?: string | number;
  items: OrderEmailItem[];
  is_correction?: boolean;
  correction_reason?: string;
}

const LUCIDE_ICONS = {
  check: `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px; margin-right:3px;"><polyline points="20 6 9 17 4 12"/></svg>`,
  alert: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px; margin-right:4px;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  calendar: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#15803D" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px; margin-right:4px;"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>`,
  clock: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#15803D" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px; margin-right:4px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  mapPin: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#15803D" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px; margin-right:4px;"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>`,
  plus: `<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px; margin-right:2px;"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
  minus: `<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-1px; margin-right:2px;"><path d="M5 12h14"/></svg>`
};

export function generateOrderConfirmationHtml(data: OrderConfirmationEmailData): string {
  const clientName = data.client || 'Estimado Cliente';
  const orderNumber = (data.order_number || 'N/A').toString().toUpperCase().replace(/^#/, '');
  const deliveryDate = data.delivery_date || 'A programar';
  const deliverySlot = data.delivery_slot || '06:30 AM - 11:00 AM';
  const deliveryAddress = data.delivery_address || 'Dirección de despacho registrada';
  const totalAmount = data.total_amount || '0';
  const subtotal = data.subtotal || totalAmount;
  const tax = data.tax || '0';
  const items = data.items || [];
  const isCorrection = Boolean(data.is_correction);
  const clientPo = data.client_po_number ? ` • OC: ${data.client_po_number}` : '';
  const preheaderText = isCorrection 
    ? `Actualización de tu Remisión #${orderNumber} de FruFresco. Total ajustado: $${totalAmount} COP.`
    : `Tu pedido #${orderNumber} ha sido confirmado con éxito. Entrega programada para el ${deliveryDate}. Total: $${totalAmount} COP.`;

  const itemsRowsHtml = items.map((item, idx) => {
    let rowBg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAF9';
    let statusBadgeHtml = '';
    let nameDecoration = '';
    let qtyNoteHtml = '';

    if (item.isAdded) {
      rowBg = '#ECFDF5';
      statusBadgeHtml = `<span style="background-color: #059669; color: #FFFFFF; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; margin-left: 6px; text-transform: uppercase; letter-spacing: 0.5px; display: inline-block;">${LUCIDE_ICONS.plus}AGREGADO</span>`;
    } else if (item.isModified) {
      rowBg = '#FEF3C7';
      statusBadgeHtml = `<span style="background-color: #D97706; color: #FFFFFF; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; margin-left: 6px; text-transform: uppercase; letter-spacing: 0.5px; display: inline-block;">MODIFICADO</span>`;
      if (item.oldQuantity !== undefined) {
        qtyNoteHtml = `<div style="font-size: 10px; color: #B45309; text-decoration: line-through; margin-top: 2px; font-variant-numeric: tabular-nums;">Antes: ${item.oldQuantity} ${item.oldUnit || ''}</div>`;
      }
    } else if (item.isDeleted) {
      rowBg = '#FEF2F2';
      statusBadgeHtml = `<span style="background-color: #DC2626; color: #FFFFFF; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; margin-left: 6px; text-transform: uppercase; letter-spacing: 0.5px; display: inline-block;">${LUCIDE_ICONS.minus}RETIRADO</span>`;
      nameDecoration = 'text-decoration: line-through; color: #991B1B;';
    }

    const qtyStr = item.unit ? (`${item.quantity} ${item.unit}`) : item.quantity;
    const priceStr = typeof item.price === 'number' ? item.price.toLocaleString('es-CO') : item.price;
    const totalStr = typeof item.total === 'number' ? item.total.toLocaleString('es-CO') : (item.total || item.price);

    return `
      <tr style="background-color: ${rowBg}; border-bottom: 1px solid #E2E8F0;">
        <td style="padding: 10px 14px; font-weight: 600; color: #1E293B; font-size: 13px; vertical-align: middle;">
          <span style="${nameDecoration}">${item.name}</span>
          ${statusBadgeHtml}
        </td>
        <td style="padding: 10px 10px; text-align: center; font-weight: 800; color: #0F172A; font-size: 13px; white-space: nowrap; font-variant-numeric: tabular-nums; vertical-align: middle;">
          <span style="${nameDecoration}">${qtyStr}</span>
          ${qtyNoteHtml}
        </td>
        <td style="padding: 10px 10px; text-align: right; color: #64748B; font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; vertical-align: middle;">
          $${priceStr}
        </td>
        <td style="padding: 10px 14px; text-align: right; font-weight: 800; color: ${item.isDeleted ? '#DC2626' : '#0D7A57'}; font-size: 13px; white-space: nowrap; font-variant-numeric: tabular-nums; vertical-align: middle;">
          <span style="${nameDecoration}">$${totalStr}</span>
        </td>
      </tr>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${isCorrection ? 'Remisión Corregida' : 'Confirmación de Pedido'} #${orderNumber}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700;800&family=Outfit:wght@600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      color-scheme: light dark;
      supported-color-schemes: light dark;
    }
    body {
      margin: 0;
      padding: 0;
      width: 100% !important;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table {
      border-collapse: collapse;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
      -ms-interpolation-mode: bicubic;
    }
    @media (prefers-color-scheme: dark) {
      .email-bg { background-color: #0B0F19 !important; }
      .card-bg { background-color: #111827 !important; border-color: #1F2937 !important; color: #F9FAFB !important; }
      .box-bg { background-color: #1F2937 !important; border-color: #374151 !important; color: #F3F4F6 !important; }
      .text-dark { color: #F9FAFB !important; }
      .text-muted { color: #9CA3AF !important; }
    }
  </style>
</head>
<body class="email-bg" style="margin: 0; padding: 25px 10px; background-color: #F1F5F9; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1E293B; -webkit-font-smoothing: antialiased;">

  <!-- PREHEADER INVISIBLE -->
  <div style="display: none; max-height: 0px; overflow: hidden; font-size: 1px; line-height: 1px; max-width: 0px; opacity: 0; mso-hide: all;">
    ${preheaderText} &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
  </div>

  <!--[if mso]>
  <table role="presentation" width="650" cellspacing="0" cellpadding="0" border="0" align="center"><tr><td>
  <![endif]-->

  <!-- Contenedor Principal de Correo -->
  <div class="card-bg" style="max-width: 650px; margin: 0 auto; background-color: #FFFFFF; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(8, 28, 21, 0.08); border: 1px solid #E2E8F0;">
    
    <!-- 1. TOP CORPORATE BAR (Membrete Canónico Oficial Remisión) -->
    <table role="presentation" width="100%" style="background-color: #FFFFFF; border-bottom: 2px solid #F1F5F9; padding: 18px 28px;">
      <tr>
        <td style="vertical-align: middle; text-align: left; width: 170px;">
          <img src="https://frufresco-liard.vercel.app/logo-investments.png" width="160" height="auto" alt="Investments Cortés" style="border: 0; display: block; max-height: 54px; object-fit: contain;">
        </td>
        <td style="vertical-align: middle; text-align: right; font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <div style="font-size: 13px; font-weight: 800; color: #0F172A; text-transform: uppercase; letter-spacing: 0.5px;">
            Investments Cortés S.A.S.
          </div>
          <div style="font-size: 11px; color: #64748B; font-weight: 600; margin-top: 2px;">
            NIT 901.393.217-5 • Régimen Común
          </div>
          <div style="font-size: 10px; color: #0D7A57; font-weight: 700; margin-top: 1px;">
            Operador Agro-Logístico • FruFresco Institucional
          </div>
          <div style="font-size: 10px; color: #64748B; margin-top: 1px;">
            Gestión Pedidos: 301 542 1761 • pedidos@frufresco.com
          </div>
        </td>
      </tr>
    </table>

    <!-- 2. STATUS & ORDER HERO (Franja Editorial Canónica) -->
    <div style="background: ${isCorrection ? 'linear-gradient(135deg, #78350F 0%, #B45309 100%)' : 'linear-gradient(135deg, #081c15 0%, #1a4d2e 100%)'}; padding: 24px 28px 22px; text-align: left; color: white;">
      <table role="presentation" width="100%">
        <tr>
          <td style="vertical-align: top;">
            <div style="margin-bottom: 8px;">
              <span style="display: inline-block; background-color: ${isCorrection ? 'rgba(254, 243, 199, 0.22)' : 'rgba(16, 185, 129, 0.22)'}; border: 1px solid ${isCorrection ? '#FDE68A' : 'rgba(16, 185, 129, 0.5)'}; color: ${isCorrection ? '#FEF3C7' : '#86EFAC'}; font-size: 10.5px; font-weight: 800; padding: 4px 12px; border-radius: 100px; text-transform: uppercase; letter-spacing: 0.8px; font-family: 'Outfit', sans-serif;">
                ${isCorrection ? `${LUCIDE_ICONS.alert}REMISIÓN DE ENTREGA (RECTIFICADA / CORREGIDA)` : `${LUCIDE_ICONS.check}REMISIÓN OFICIAL DE ENTREGA • PEDIDO CONFIRMADO`}
              </span>
            </div>
            <h1 style="font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 22px; font-weight: 900; margin: 0 0 4px 0; color: #FFFFFF; letter-spacing: -0.3px; line-height: 1.2;">
              ${isCorrection ? 'Actualización de Pedido' : '¡Gracias por tu compra!'}, <span style="font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-weight: 400; color: #fde68a;">${clientName}</span>
            </h1>
            <p style="margin: 0; font-size: 12.5px; color: #CBD5E1; font-weight: 500;">
              Orden de Compra: <strong style="color: #FFFFFF; font-family: 'Outfit', sans-serif;">${data.client_po_number || 'N/A'}</strong> • Despacho: <strong style="color: #FFFFFF;">${deliveryDate}</strong>
            </p>
          </td>
          <td style="vertical-align: top; text-align: right; width: 130px;">
            <div style="background-color: rgba(255, 255, 255, 0.12); border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 12px; padding: 8px 12px; text-align: center;">
              <div style="font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: #E2E8F0;">
                REMISIÓN Nº
              </div>
              <div style="font-family: 'Outfit', sans-serif; font-size: 16px; font-weight: 900; color: #FFFFFF; letter-spacing: 0.5px; margin-top: 2px;">
                #${orderNumber}
              </div>
            </div>
          </td>
        </tr>
      </table>
    </div>

    ${isCorrection ? `
    <!-- ALERTA DE RECTIFICACIÓN / DIFF -->
    <div style="margin: 16px 28px 0; background-color: #FFFBEB; border: 1.5px solid #FCD34D; border-radius: 12px; padding: 12px 16px; font-size: 12px; color: #92400E; line-height: 1.4;">
      <strong>${LUCIDE_ICONS.alert}Nota de Rectificación:</strong> Este documento sustituye a la versión anterior de tu remisión. Se han actualizado los ítems resaltados en la tabla a continuación según la coordinación telefónica/operativa.
    </div>
    ` : ''}

    <!-- 2. CUADRÍCULA DE LOGÍSTICA & DESPACHO (Tabla MSO Compliant) -->
    <div style="padding: 18px 28px 10px;">
      <table role="presentation" width="100%" class="box-bg" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 14px; padding: 14px 18px;">
        <tr>
          <td width="50%" style="padding: 4px 10px 8px 4px; vertical-align: top;">
            <span style="font-size: 10px; font-weight: 800; color: #15803D; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 3px;">
              ${LUCIDE_ICONS.calendar}Fecha de Entrega
            </span>
            <strong class="text-dark" style="font-size: 13px; color: #0F172A; font-family: 'Outfit', sans-serif;">${deliveryDate}</strong>
          </td>
          <td width="50%" style="padding: 4px 4px 8px 10px; vertical-align: top;">
            <span style="font-size: 10px; font-weight: 800; color: #15803D; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 3px;">
              ${LUCIDE_ICONS.clock}Horario Estimado
            </span>
            <strong class="text-dark" style="font-size: 13px; color: #0F172A; font-family: 'Outfit', sans-serif;">${deliverySlot}</strong>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="border-top: 1px dashed #CBD5E1; padding-top: 10px; margin-top: 2px;">
            <span style="font-size: 10px; font-weight: 800; color: #15803D; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 3px;">
              ${LUCIDE_ICONS.mapPin}Sede / Dirección de Recepción
            </span>
            <strong class="text-dark" style="font-size: 13px; color: #0F172A;">${deliveryAddress}</strong>
          </td>
        </tr>
      </table>
    </div>

    <!-- 3. TABLA INDUSTRIAL DE REMISIÓN -->
    <div style="padding: 12px 28px;">
      <div style="margin-bottom: 10px;">
        <h3 class="text-dark" style="font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 800; color: #0F172A; text-transform: uppercase; letter-spacing: 0.5px; margin: 0;">
          Detalle de la Remisión (${items.length} ítems)
        </h3>
      </div>

      <table role="presentation" width="100%" style="border-collapse: collapse; font-size: 13px; border: 1px solid #E2E8F0; border-radius: 10px; overflow: hidden;">
        <thead>
          <tr class="box-bg" style="background-color: #F8FAFC; border-bottom: 2px solid #E2E8F0; color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">
            <th style="padding: 10px 14px; text-align: left; font-weight: 800; font-family: 'Outfit', sans-serif;">Producto</th>
            <th style="padding: 10px 10px; text-align: center; font-weight: 800; font-family: 'Outfit', sans-serif;">Cant.</th>
            <th style="padding: 10px 10px; text-align: right; font-weight: 800; font-family: 'Outfit', sans-serif;">V. Unit.</th>
            <th style="padding: 10px 14px; text-align: right; font-weight: 800; font-family: 'Outfit', sans-serif;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRowsHtml}
        </tbody>
      </table>

      <!-- 4. TOTALES FINANCIEROS -->
      <div style="margin-top: 16px; padding-top: 14px; border-top: 2px solid #0D7A57; text-align: right;">
        <div class="text-muted" style="font-size: 12px; color: #64748B; margin-bottom: 4px; font-variant-numeric: tabular-nums;">
          Subtotal: <strong class="text-dark" style="color: #1E293B;">$${subtotal}</strong>
          ${tax !== '0' && tax !== 0 ? `<span style="margin: 0 6px;">•</span> IVA: <strong class="text-dark" style="color: #1E293B;">$${tax}</strong>` : ''}
        </div>
        <div style="font-family: 'Outfit', -apple-system, sans-serif; font-size: 22px; font-weight: 900; color: #0D7A57; letter-spacing: -0.5px; font-variant-numeric: tabular-nums;">
          TOTAL REMISIÓN: $${totalAmount} <span style="font-size: 12px; font-weight: 700; color: #64748B;">COP</span>
        </div>
      </div>
    </div>

    <!-- 5. BANNER DE SOPORTE -->
    <div style="margin: 10px 28px 24px;">
      <table role="presentation" width="100%" class="box-bg" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 14px 18px; font-size: 12px; color: #475569; line-height: 1.5;">
        <tr>
          <td>
            <strong>¿Novedades o cambios antes del cierre operativo?</strong><br>
            Comunícate directamente con la mesa operativa de FruFresco: 
            <strong class="text-dark" style="color: #0F172A;">301 542 1761</strong> o responde a <a href="mailto:pedidos@frufresco.com" style="color: #0D7A57; font-weight: 700; text-decoration: none;">pedidos@frufresco.com</a>.
          </td>
        </tr>
      </table>
    </div>

    <!-- 6. FOOTER CORPORATIVO OFICIAL -->
    <div class="box-bg" style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 20px 28px; text-align: center; font-size: 11px; color: #94A3B8;">
      <p style="margin: 0 0 4px 0; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.8px; font-family: 'Outfit', sans-serif;">
        Investments Cortés S.A.S. • NIT 901.393.217-5 • Régimen Común
      </p>
      <p style="margin: 0; color: #0D7A57; font-weight: 700;">
        Gestión Pedidos: 301 542 1761 • pedidos@frufresco.com • www.frufresco.com
      </p>
      <p style="margin: 6px 0 0 0; font-size: 9.5px; color: #94A3B8;">
        Documento Oficial de Operación y Control Logístico • Sistema Integrado FruFresco
      </p>
    </div>

  </div>

  <!--[if mso]>
  </td></tr></table>
  <![endif]-->

</body>
</html>
  `.trim();
}

export function generateOrderConfirmationText(data: OrderConfirmationEmailData): string {
  const clientName = data.client || 'Cliente';
  const orderNumber = (data.order_number || 'N/A').toString().toUpperCase();
  const deliveryDate = data.delivery_date || 'A programar';
  const totalAmount = data.total_amount || '0';
  const items = data.items || [];
  const isCorrection = Boolean(data.is_correction);

  const itemsList = items.map(it => {
    let prefix = '- ';
    if (it.isAdded) prefix = '[+ AGREGADO] ';
    if (it.isModified) prefix = `[MODIFICADO: antes ${it.oldQuantity || ''}] `;
    if (it.isDeleted) prefix = '[- RETIRADO] ';
    return `${prefix}${it.name} x ${it.quantity} = $${it.total || it.price}`;
  }).join('\n');

  return `${isCorrection ? 'REMISIÓN RECTIFICADA / CORREGIDA' : 'REMISIÓN DE ENTREGA'} - FRUFRESCO

Estimado(a) ${clientName},

Tu orden N° ${orderNumber} ha sido ${isCorrection ? 'actualizada con éxito tras la modificación solicitada' : 'confirmada con éxito'}.
Fecha de Entrega: ${deliveryDate}
Total Remisión: $${totalAmount} COP

Detalle de Ítems:
${itemsList}

Investments Cortés S.A.S. • NIT 901.393.217-5 • Régimen Común
Operador Agro-Logístico • FruFresco Institucional
Gestión Pedidos: 301 542 1761 • pedidos@frufresco.com • www.frufresco.com`;
}

export interface AgreementEmailItem {
  name: string;
  unit?: string;
  price: string | number;
  oldPrice?: string | number;
  isModified?: boolean;
  isAdded?: boolean;
  priceDiff?: number;
  priceDiffPercent?: number;
  justification?: string;
}

export interface AgreementNotificationEmailData {
  mode: 'NEW_AGREEMENT' | 'PRICE_UPDATE_DIFF';
  agreement_name: string;
  agreement_code?: string;
  client_name: string;
  client_nit?: string;
  valid_from: string;
  valid_until: string;
  items: AgreementEmailItem[];
  responsible_agent?: string;
  modified_at?: string;
  notes?: string;
  portal_url?: string;
}

export function generateAgreementNotificationHtml(data: AgreementNotificationEmailData): string {
  const isDiff = data.mode === 'PRICE_UPDATE_DIFF';
  const clientName = data.client_name || 'Estimado Cliente Institucional';
  const agreementCode = (data.agreement_code || data.agreement_name || 'ACU-INSTITUCIONAL').toUpperCase();
  const validFrom = data.valid_from || 'Inmediata';
  const validUntil = data.valid_until || 'Indefinida';
  const responsibleAgent = data.responsible_agent || 'Dirección Comercial FruFresco';
  const modifiedAt = data.modified_at || new Date().toLocaleDateString('es-CO');
  const items = data.items || [];
  const notes = data.notes || '';

  const preheaderText = isDiff
    ? `Actualización de tarifas de precios pactadas para ${clientName}. ${items.length} productos modificados con vigencia al ${validUntil}.`
    : `Activación de nuevo Acuerdo Comercial de Precios para ${clientName}. Vigencia desde ${validFrom} hasta ${validUntil}.`;

  const itemsRowsHtml = items.map((item, idx) => {
    const rowBg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAF9';
    const unitStr = item.unit || 'Und/Kg';
    const currentPriceNum = typeof item.price === 'number' ? item.price : parseFloat(String(item.price).replace(/[^0-9.-]+/g, '')) || 0;
    const currentPriceStr = currentPriceNum.toLocaleString('es-CO');

    if (isDiff) {
      const oldPriceNum = typeof item.oldPrice === 'number' ? item.oldPrice : (item.oldPrice ? parseFloat(String(item.oldPrice).replace(/[^0-9.-]+/g, '')) : undefined);
      const diffVal = oldPriceNum !== undefined ? (currentPriceNum - oldPriceNum) : (item.priceDiff || 0);
      const diffStr = Math.abs(diffVal).toLocaleString('es-CO');
      const isUp = diffVal > 0;
      const isDown = diffVal < 0;
      
      const badgeBg = isUp ? '#FEF2F2' : (isDown ? '#ECFDF5' : '#F1F5F9');
      const badgeColor = isUp ? '#B91C1C' : (isDown ? '#047857' : '#475569');
      const varText = isUp ? `Sube (+${diffStr})` : isDown ? `Baja (-${diffStr})` : 'Estable';

      return `
        <tr style="background-color: ${rowBg}; border-bottom: 1px solid #E2E8F0;">
          <td style="padding: 10px 12px; font-weight: 700; color: #1E293B; font-size: 13px; vertical-align: middle;">
            <div>${item.name}</div>
            <div style="font-size: 10.5px; color: #64748B; font-weight: 500; margin-top: 1px;">Presentación: ${unitStr}</div>
          </td>
          <td style="padding: 10px 8px; text-align: right; color: #94A3B8; font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; vertical-align: middle; text-decoration: line-through;">
            ${oldPriceNum !== undefined ? `$${oldPriceNum.toLocaleString('es-CO')}` : '-'}
          </td>
          <td style="padding: 10px 10px; text-align: right; font-weight: 800; color: #0D7A57; font-size: 13.5px; white-space: nowrap; font-variant-numeric: tabular-nums; vertical-align: middle;">
            $${currentPriceStr}
          </td>
          <td style="padding: 10px 8px; text-align: center; vertical-align: middle; white-space: nowrap;">
            <span style="display: inline-block; background-color: ${badgeBg}; color: ${badgeColor}; font-size: 10.5px; font-weight: 800; padding: 3px 8px; border-radius: 6px; font-variant-numeric: tabular-nums; letter-spacing: 0.3px;">
              ${isUp ? '🔴 ' : isDown ? '🟢 ' : ''}${varText}
            </span>
          </td>
          <td style="padding: 10px 12px; vertical-align: middle; font-size: 11.5px; color: #334155; line-height: 1.35;">
            ${item.justification ? `<span style="font-weight: 600; color: #1E293B;">${item.justification}</span>` : `<span style="color: #64748B; font-style: italic;">Ajuste periódico de cosecha / mercado</span>`}
          </td>
        </tr>
      `;
    }

    // NEW_AGREEMENT row format
    return `
      <tr style="background-color: ${rowBg}; border-bottom: 1px solid #E2E8F0;">
        <td style="padding: 11px 14px; font-weight: 600; color: #1E293B; font-size: 13px; vertical-align: middle;">
          ${item.name}
        </td>
        <td style="padding: 11px 10px; text-align: center; color: #475569; font-size: 12px; font-weight: 600; white-space: nowrap; vertical-align: middle;">
          ${unitStr}
        </td>
        <td style="padding: 11px 14px; text-align: right; font-weight: 800; color: #0D7A57; font-size: 13.5px; white-space: nowrap; font-variant-numeric: tabular-nums; vertical-align: middle;">
          $${currentPriceStr} <span style="font-size: 10.5px; font-weight: 600; color: #64748B;">COP</span>
        </td>
      </tr>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${isDiff ? 'Actualización de Precios' : 'Nuevo Acuerdo Comercial'} - FruFresco</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700;800&family=Outfit:wght@600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      color-scheme: light dark;
      supported-color-schemes: light dark;
    }
    body {
      margin: 0;
      padding: 0;
      width: 100% !important;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table {
      border-collapse: collapse;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
      -ms-interpolation-mode: bicubic;
    }
    @media (prefers-color-scheme: dark) {
      .email-bg { background-color: #0B0F19 !important; }
      .card-bg { background-color: #111827 !important; border-color: #1F2937 !important; color: #F9FAFB !important; }
      .box-bg { background-color: #1F2937 !important; border-color: #374151 !important; color: #F3F4F6 !important; }
      .text-dark { color: #F9FAFB !important; }
      .text-muted { color: #9CA3AF !important; }
    }
  </style>
</head>
<body class="email-bg" style="margin: 0; padding: 25px 10px; background-color: #F1F5F9; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1E293B; -webkit-font-smoothing: antialiased;">

  <!-- PREHEADER INVISIBLE -->
  <div style="display: none; max-height: 0px; overflow: hidden; font-size: 1px; line-height: 1px; max-width: 0px; opacity: 0; mso-hide: all;">
    ${preheaderText} &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
  </div>

  <!--[if mso]>
  <table role="presentation" width="650" cellspacing="0" cellpadding="0" border="0" align="center"><tr><td>
  <![endif]-->

  <!-- Contenedor Principal de Correo -->
  <div class="card-bg" style="max-width: 650px; margin: 0 auto; background-color: #FFFFFF; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(8, 28, 21, 0.08); border: 1px solid #E2E8F0;">
    
    <!-- 1. TOP CORPORATE BAR (Membrete Canónico Oficial Remisión) -->
    <table role="presentation" width="100%" style="background-color: #FFFFFF; border-bottom: 2px solid #F1F5F9; padding: 18px 28px;">
      <tr>
        <td style="vertical-align: middle; text-align: left; width: 170px;">
          <img src="https://frufresco-liard.vercel.app/logo-investments.png" width="160" height="auto" alt="Investments Cortés" style="border: 0; display: block; max-height: 54px; object-fit: contain;">
        </td>
        <td style="vertical-align: middle; text-align: right; font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <div style="font-size: 13px; font-weight: 800; color: #0F172A; text-transform: uppercase; letter-spacing: 0.5px;">
            Investments Cortés S.A.S.
          </div>
          <div style="font-size: 11px; color: #64748B; font-weight: 600; margin-top: 2px;">
            NIT 901.393.217-5 • Régimen Común
          </div>
          <div style="font-size: 10px; color: #0D7A57; font-weight: 700; margin-top: 1px;">
            Operador Agro-Logístico • FruFresco Institucional
          </div>
          <div style="font-size: 10px; color: #64748B; margin-top: 1px;">
            Gestión Comercial: 301 542 1761 • pedidos@frufresco.com
          </div>
        </td>
      </tr>
    </table>

    <!-- 2. HERO BANNER DE ACUERDO -->
    <div style="background: ${isDiff ? 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #064E3B 100%)' : 'linear-gradient(135deg, #064E3B 0%, #047857 50%, #059669 100%)'}; padding: 24px 28px 22px; text-align: left; color: white;">
      <table role="presentation" width="100%">
        <tr>
          <td style="vertical-align: top;">
            <div style="margin-bottom: 8px;">
              <span style="display: inline-block; background-color: rgba(255, 255, 255, 0.16); border: 1px solid rgba(255, 255, 255, 0.3); color: #FDE68A; font-size: 10.5px; font-weight: 800; padding: 4px 12px; border-radius: 100px; text-transform: uppercase; letter-spacing: 0.8px; font-family: 'Outfit', sans-serif;">
                ${isDiff ? 'ACTUALIZACIÓN DE PRECIOS • ACUERDO VIGENTE' : 'ACUERDO INSTITUCIONAL • LISTA DE PRECIOS B2B'}
              </span>
            </div>
            <h1 style="font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 22px; font-weight: 900; margin: 0 0 4px 0; color: #FFFFFF; letter-spacing: -0.3px; line-height: 1.2;">
              ${isDiff ? 'Ajuste de Tarifas Pactadas' : 'Nuevo Modelo de Precios'}, <span style="font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-weight: 400; color: #fde68a;">${clientName}</span>
            </h1>
            <p style="margin: 0; font-size: 12.5px; color: #E2E8F0; font-weight: 500;">
              Convenio: <strong style="color: #FFFFFF; font-family: 'Outfit', sans-serif;">${data.agreement_name}</strong>
            </p>
          </td>
          <td style="vertical-align: top; text-align: right; width: 130px;">
            <div style="background-color: rgba(255, 255, 255, 0.12); border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 12px; padding: 8px 12px; text-align: center;">
              <div style="font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: #E2E8F0;">
                CÓDIGO
              </div>
              <div style="font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 900; color: #FFFFFF; letter-spacing: 0.5px; margin-top: 2px;">
                ${agreementCode}
              </div>
            </div>
          </td>
        </tr>
      </table>
    </div>

    <!-- 3. CUADRÍCULA DE VIGENCIA & ATRIBUTOS -->
    <div style="padding: 18px 28px 10px;">
      <table role="presentation" width="100%" class="box-bg" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 14px; padding: 14px 18px;">
        <tr>
          <td width="50%" style="padding: 4px 10px 8px 4px; vertical-align: top;">
            <span style="font-size: 10px; font-weight: 800; color: #15803D; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 3px;">
              ${LUCIDE_ICONS.calendar}Vigencia de Precios
            </span>
            <strong class="text-dark" style="font-size: 13px; color: #0F172A; font-family: 'Outfit', sans-serif;">${validFrom} al ${validUntil}</strong>
          </td>
          <td width="50%" style="padding: 4px 4px 8px 10px; vertical-align: top;">
            <span style="font-size: 10px; font-weight: 800; color: #15803D; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 3px;">
              ${LUCIDE_ICONS.clock}Gestión / Asesor Comercial
            </span>
            <strong class="text-dark" style="font-size: 13px; color: #0F172A; font-family: 'Outfit', sans-serif;">${responsibleAgent}</strong>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="border-top: 1px dashed #CBD5E1; padding-top: 10px; margin-top: 2px;">
            <span style="font-size: 10px; font-weight: 800; color: #15803D; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 3px;">
              ${LUCIDE_ICONS.check}Alcance Operativo
            </span>
            <div class="text-dark" style="font-size: 12.5px; color: #334155;">
              ${isDiff ? `Se han actualizado las tarifas para <strong>${items.length} productos</strong> con aplicación a partir del <strong>${modifiedAt}</strong>.` : `Lista contractual con <strong>${items.length} productos</strong> formalizados para pedidos directos y programación institucional.`}
            </div>
          </td>
        </tr>
      </table>
    </div>

    <!-- 4. TABLA DE PRECIOS -->
    <div style="padding: 12px 28px;">
      <div style="margin-bottom: 10px;">
        <h3 class="text-dark" style="font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 800; color: #0F172A; text-transform: uppercase; letter-spacing: 0.5px; margin: 0;">
          ${isDiff ? `Resumen de Modificaciones (${items.length} ítems)` : `Catálogo de Precios Pactados (${items.length} ítems)`}
        </h3>
      </div>

      <table role="presentation" width="100%" style="border-collapse: collapse; font-size: 13px; border: 1px solid #E2E8F0; border-radius: 10px; overflow: hidden;">
        <thead>
          <tr class="box-bg" style="background-color: #F8FAFC; border-bottom: 2px solid #E2E8F0; color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">
            <th style="padding: 10px 14px; text-align: left; font-weight: 800; font-family: 'Outfit', sans-serif;">Producto</th>
            ${isDiff ? `
              <th style="padding: 10px 10px; text-align: right; font-weight: 800; font-family: 'Outfit', sans-serif;">Antes</th>
              <th style="padding: 10px 12px; text-align: right; font-weight: 800; font-family: 'Outfit', sans-serif;">Nuevo Precio</th>
              <th style="padding: 10px 14px; text-align: right; font-weight: 800; font-family: 'Outfit', sans-serif;">Variación</th>
            ` : `
              <th style="padding: 10px 10px; text-align: center; font-weight: 800; font-family: 'Outfit', sans-serif;">Presentación</th>
              <th style="padding: 10px 14px; text-align: right; font-weight: 800; font-family: 'Outfit', sans-serif;">Precio Pactado</th>
            `}
          </tr>
        </thead>
        <tbody>
          ${itemsRowsHtml}
        </tbody>
      </table>

      ${notes ? `
      <!-- NOTAS ADICIONALES -->
      <div style="margin-top: 14px; background-color: #F8FAFC; border-left: 3px solid #0D7A57; border-radius: 4px; padding: 10px 14px; font-size: 12px; color: #475569;">
        <strong>Observaciones Comerciales:</strong> ${notes}
      </div>
      ` : ''}
    </div>

    <!-- 5. BANNER DE SOPORTE & CANAL DE PEDIDOS -->
    <div style="margin: 10px 28px 24px;">
      <table role="presentation" width="100%" class="box-bg" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 14px 18px; font-size: 12px; color: #475569; line-height: 1.5;">
        <tr>
          <td>
            <strong>¿Preguntas sobre este acuerdo o necesitas radicar un pedido especial?</strong><br>
            Comunícate directamente con la mesa comercial de FruFresco: 
            <strong class="text-dark" style="color: #0F172A;">301 542 1761</strong> o responde a <a href="mailto:pedidos@frufresco.com" style="color: #0D7A57; font-weight: 700; text-decoration: none;">pedidos@frufresco.com</a>.
          </td>
        </tr>
      </table>
    </div>

    <!-- 6. FOOTER CORPORATIVO OFICIAL -->
    <div class="box-bg" style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 20px 28px; text-align: center; font-size: 11px; color: #94A3B8;">
      <p style="margin: 0 0 4px 0; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.8px; font-family: 'Outfit', sans-serif;">
        Investments Cortés S.A.S. • NIT 901.393.217-5 • Régimen Común
      </p>
      <p style="margin: 0; color: #0D7A57; font-weight: 700;">
        Gestión Comercial: 301 542 1761 • pedidos@frufresco.com • www.frufresco.com
      </p>
      <p style="margin: 6px 0 0 0; font-size: 9.5px; color: #94A3B8;">
        Documento Oficial de Condiciones Comerciales • FruFresco Institucional
      </p>
    </div>

  </div>

  <!--[if mso]>
  </td></tr></table>
  <![endif]-->

</body>
</html>
  `.trim();
}

export function generateAgreementNotificationText(data: AgreementNotificationEmailData): string {
  const isDiff = data.mode === 'PRICE_UPDATE_DIFF';
  const clientName = data.client_name || 'Cliente';
  const agreementName = data.agreement_name || 'Acuerdo Comercial';
  const validFrom = data.valid_from || 'Inmediata';
  const validUntil = data.valid_until || 'Indefinida';
  const items = data.items || [];

  const itemsList = items.map(it => {
    if (isDiff) {
      return `- ${it.name} (${it.unit || 'Und'}): Antes $${it.oldPrice || '-'} -> Nuevo $${it.price} COP`;
    }
    return `- ${it.name} (${it.unit || 'Und'}): $${it.price} COP`;
  }).join('\n');

  return `${isDiff ? 'ACTUALIZACIÓN DE PRECIOS' : 'NUEVO ACUERDO COMERCIAL'} - FRUFRESCO

Estimado(a) ${clientName},

Se ha ${isDiff ? 'actualizado la lista de tarifas' : 'formalizado un nuevo acuerdo de precios'} correspondiente a: "${agreementName}".
Vigencia: ${validFrom} al ${validUntil}

Detalle de Ítems (${items.length} productos):
${itemsList}

Investments Cortés S.A.S. • NIT 901.393.217-5 • Régimen Común
Operador Agro-Logístico • FruFresco Institucional
Gestión Comercial: 301 542 1761 • pedidos@frufresco.com • www.frufresco.com`;
}

