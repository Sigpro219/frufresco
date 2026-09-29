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

  const itemsRowsHtml = items.map((item, idx) => {
    let rowBg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAF9';
    let statusBadgeHtml = '';
    let nameDecoration = '';
    let qtyNoteHtml = '';

    if (item.isAdded) {
      rowBg = '#ECFDF5';
      statusBadgeHtml = `<span style="background-color: #059669; color: #FFFFFF; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; margin-left: 6px; text-transform: uppercase; letter-spacing: 0.5px;">+ AGREGADO</span>`;
    } else if (item.isModified) {
      rowBg = '#FEF3C7';
      statusBadgeHtml = `<span style="background-color: #D97706; color: #FFFFFF; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; margin-left: 6px; text-transform: uppercase; letter-spacing: 0.5px;">MODIFICADO</span>`;
      if (item.oldQuantity !== undefined) {
        qtyNoteHtml = `<div style="font-size: 10px; color: #B45309; text-decoration: line-through; margin-top: 2px;">Antes: ${item.oldQuantity} ${item.oldUnit || ''}</div>`;
      }
    } else if (item.isDeleted) {
      rowBg = '#FEF2F2';
      statusBadgeHtml = `<span style="background-color: #DC2626; color: #FFFFFF; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; margin-left: 6px; text-transform: uppercase; letter-spacing: 0.5px;">- RETIRADO</span>`;
      nameDecoration = 'text-decoration: line-through; color: #991B1B;';
    }

    const qtyStr = item.unit ? (`${item.quantity} ${item.unit}`) : item.quantity;
    const priceStr = typeof item.price === 'number' ? item.price.toLocaleString('es-CO') : item.price;
    const totalStr = typeof item.total === 'number' ? item.total.toLocaleString('es-CO') : (item.total || item.price);
    const skuCode = item.sku ? `<span style="font-size: 10px; color: #64748B; font-weight: 700; display: block; margin-bottom: 2px;">${item.sku}</span>` : '';

    return `
      <tr style="background-color: ${rowBg}; border-bottom: 1px solid #E2E8F0;">
        <td style="padding: 10px 14px; font-weight: 600; color: #1E293B; font-size: 13px;">
          ${skuCode}
          <span style="${nameDecoration}">${item.name}</span>
          ${statusBadgeHtml}
        </td>
        <td style="padding: 10px 10px; text-align: center; font-weight: 800; color: #0F172A; font-size: 13px; white-space: nowrap;">
          <span style="${nameDecoration}">${qtyStr}</span>
          ${qtyNoteHtml}
        </td>
        <td style="padding: 10px 10px; text-align: right; color: #64748B; font-size: 12px; white-space: nowrap;">
          $${priceStr}
        </td>
        <td style="padding: 10px 14px; text-align: right; font-weight: 800; color: ${item.isDeleted ? '#DC2626' : '#0D7A57'}; font-size: 13px; white-space: nowrap;">
          <span style="${nameDecoration}">$${totalStr}</span>
        </td>
      </tr>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isCorrection ? 'Remisión Corregida' : 'Confirmación de Pedido'} #${orderNumber}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700;800&family=Outfit:wght@600;700;800;900&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 25px 10px; background-color: #F1F5F9; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1E293B; -webkit-font-smoothing: antialiased;">

  <!-- Contenedor Principal de Correo -->
  <div style="max-width: 650px; margin: 0 auto; background-color: #FFFFFF; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(8, 28, 21, 0.08); border: 1px solid #E2E8F0;">
    
    <!-- 1. HEADER HERO (Remisión Oficial Editorial) -->
    <div style="background: ${isCorrection ? 'linear-gradient(135deg, #78350F 0%, #B45309 100%)' : 'linear-gradient(135deg, #081c15 0%, #1a4d2e 100%)'}; padding: 34px 28px 28px; text-align: center; color: white;">
      <div style="margin-bottom: 14px; display: inline-block;">
        <div style="background-color: #FFFFFF; border-radius: 14px; padding: 10px 18px; display: inline-block; box-shadow: 0 4px 15px rgba(0,0,0,0.15);">
          <img src="https://frufresco-liard.vercel.app/logo-investments.png" width="130" height="auto" alt="Investments Cortés" style="border: 0; display: block; max-height: 70px; object-fit: contain;">
        </div>
      </div>
      
      <div style="display: block; margin-bottom: 10px;">
        <span style="display: inline-flex; align-items: center; gap: 5px; background-color: ${isCorrection ? 'rgba(254, 243, 199, 0.25)' : 'rgba(16, 185, 129, 0.18)'}; border: 1px solid ${isCorrection ? '#FDE68A' : 'rgba(16, 185, 129, 0.4)'}; color: ${isCorrection ? '#FEF3C7' : '#86EFAC'}; font-size: 11px; font-weight: 800; padding: 4px 14px; border-radius: 100px; text-transform: uppercase; letter-spacing: 0.8px;">
          ${isCorrection ? '⚠️ REMISIÓN DE ENTREGA (RECTIFICADA / CORREGIDA)' : 'REMISIÓN DE ENTREGA • PEDIDO CONFIRMADO'}
        </span>
      </div>

      <h1 style="font-family: 'Outfit', -apple-system, sans-serif; font-size: 24px; font-weight: 900; margin: 0 0 6px 0; color: #FFFFFF; letter-spacing: -0.5px; line-height: 1.2;">
        ${isCorrection ? 'Actualización de Pedido' : '¡Gracias por tu compra!'}, <span style="font-family: 'Instrument Serif', Georgia, 'Playfair Display', serif; font-style: italic; font-weight: 400; color: #fde68a;">${clientName}</span>
      </h1>
      <p style="margin: 0; font-size: 13px; color: #CBD5E1; font-weight: 500;">
        Remisión N° <strong style="color: #FFFFFF; font-family: 'Outfit', sans-serif; letter-spacing: 0.5px;">#${orderNumber}</strong>${clientPo} • Del campo directamente a tu negocio
      </p>
    </div>

    ${isCorrection ? `
    <!-- ALERTA DE RECTIFICACIÓN / DIFF -->
    <div style="margin: 16px 28px 0; background-color: #FFFBEB; border: 1.5px solid #FCD34D; border-radius: 12px; padding: 12px 16px; font-size: 12px; color: #92400E; line-height: 1.4;">
      <strong>⚠️ Nota de Rectificación:</strong> Este documento sustituye a la versión anterior de tu remisión. Se han actualizado los ítems resaltados en la tabla a continuación según la coordinación telefónica/operativa.
    </div>
    ` : ''}

    <!-- 2. CUADRÍCULA DE LOGÍSTICA & DESPACHO -->
    <div style="padding: 18px 28px 10px;">
      <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 14px; padding: 16px 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div>
          <span style="font-size: 10px; font-weight: 800; color: #15803D; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 3px;">
            📅 Fecha de Entrega
          </span>
          <strong style="font-size: 13px; color: #0F172A; font-family: 'Outfit', sans-serif;">${deliveryDate}</strong>
        </div>
        <div>
          <span style="font-size: 10px; font-weight: 800; color: #15803D; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 3px;">
            ⏰ Horario Estimado
          </span>
          <strong style="font-size: 13px; color: #0F172A; font-family: 'Outfit', sans-serif;">${deliverySlot}</strong>
        </div>
        <div style="grid-column: span 2; border-top: 1px dashed #CBD5E1; padding-top: 10px; margin-top: 2px;">
          <span style="font-size: 10px; font-weight: 800; color: #15803D; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 3px;">
            📍 Sede / Dirección de Recepción
          </span>
          <strong style="font-size: 13px; color: #0F172A;">${deliveryAddress}</strong>
        </div>
      </div>
    </div>

    <!-- 3. TABLA INDUSTRIAL DE REMISIÓN -->
    <div style="padding: 12px 28px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <h3 style="font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 800; color: #0F172A; text-transform: uppercase; letter-spacing: 0.5px; margin: 0;">
          Detalle de la Remisión (${items.length} ítems)
        </h3>
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 13px; border: 1px solid #E2E8F0; border-radius: 10px; overflow: hidden;">
        <thead>
          <tr style="background-color: #F8FAFC; border-bottom: 2px solid #E2E8F0; color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">
            <th style="padding: 10px 14px; text-align: left; font-weight: 800;">Producto / SKU</th>
            <th style="padding: 10px 10px; text-align: center; font-weight: 800;">Cant.</th>
            <th style="padding: 10px 10px; text-align: right; font-weight: 800;">V. Unit.</th>
            <th style="padding: 10px 14px; text-align: right; font-weight: 800;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRowsHtml}
        </tbody>
      </table>

      <!-- 4. TOTALES FINANCIEROS -->
      <div style="margin-top: 16px; padding-top: 14px; border-top: 2px solid #0D7A57; text-align: right;">
        <div style="font-size: 12px; color: #64748B; margin-bottom: 4px;">
          Subtotal: <strong style="color: #1E293B;">$${subtotal}</strong>
          ${tax !== '0' && tax !== 0 ? `<span style="margin: 0 6px;">•</span> IVA: <strong style="color: #1E293B;">$${tax}</strong>` : ''}
        </div>
        <div style="font-family: 'Outfit', sans-serif; font-size: 22px; font-weight: 900; color: #0D7A57; letter-spacing: -0.5px;">
          TOTAL REMISIÓN: $${totalAmount} <span style="font-size: 12px; font-weight: 700; color: #64748B;">COP</span>
        </div>
      </div>
    </div>

    <!-- 5. BANNER DE SOPORTE -->
    <div style="margin: 10px 28px 24px; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 14px 18px; font-size: 12px; color: #475569; line-height: 1.5;">
      <div>
        <strong>¿Novedades con tu pedido antes del cierre de corte?</strong><br>
        Comunícate directamente con la torre de operaciones FruFresco: 
        <strong style="color: #0F172A;">(601) 683 8640</strong> o responde a este correo electrónico.
      </div>
    </div>

    <!-- 6. FOOTER CORPORATIVO -->
    <div style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 20px 28px; text-align: center; font-size: 11px; color: #94A3B8;">
      <p style="margin: 0 0 4px 0; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 1px;">
        Investments Cortés S.A.S • NIT 901.393.217
      </p>
      <p style="margin: 0; color: #94A3B8;">
        CL 12 B # 71 D - 31 TO 4 AP 101 • Bogotá D.C., Colombia • Del Campo a tu Negocio
      </p>
    </div>

  </div>
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

Investments Cortés S.A.S • NIT 901.393.217
Del Campo a tu Negocio`;
}
