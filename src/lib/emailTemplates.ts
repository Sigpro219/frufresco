export interface OrderEmailItem {
  name: string;
  quantity: number | string;
  unit?: string;
  price: string | number;
  total?: string | number;
}

export interface OrderConfirmationEmailData {
  client: string;
  order_number: string;
  delivery_date?: string;
  delivery_slot?: string;
  delivery_address?: string;
  total_amount: string | number;
  subtotal?: string | number;
  tax?: string | number;
  items: OrderEmailItem[];
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

  const itemsRowsHtml = items.map((item, idx) => {
    const isEven = idx % 2 === 0;
    const qtyStr = item.unit ? (item.quantity + ' ' + item.unit) : item.quantity;
    const priceStr = typeof item.price === 'number' ? item.price.toLocaleString('es-CO') : item.price;
    const totalStr = typeof item.total === 'number' ? item.total.toLocaleString('es-CO') : (item.total || item.price);

    return `
      <tr style="background-color: ${isEven ? '#FFFFFF' : '#F8FAF9'}; border-bottom: 1px solid #E2E8F0;">
        <td style="padding: 10px 12px; font-weight: 600; color: #1E293B; font-size: 13px;">
          ${item.name}
        </td>
        <td style="padding: 10px 8px; text-align: center; font-weight: 800; color: #0F172A; font-size: 13px; white-space: nowrap;">
          ${qtyStr}
        </td>
        <td style="padding: 10px 8px; text-align: right; color: #64748B; font-size: 12px; white-space: nowrap;">
          $${priceStr}
        </td>
        <td style="padding: 10px 12px; text-align: right; font-weight: 800; color: #0D7A57; font-size: 13px; white-space: nowrap;">
          $${totalStr}
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
  <title>Confirmación de Pedido #${orderNumber}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700;800&family=Outfit:wght@600;700;800;900&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 25px 10px; background-color: #F1F5F9; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1E293B; -webkit-font-smoothing: antialiased;">

  <!-- Contenedor Principal de Correo -->
  <div style="max-width: 620px; margin: 0 auto; background-color: #FFFFFF; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(8, 28, 21, 0.08); border: 1px solid #E2E8F0;">
    
    <!-- 1. HEADER HERO (Diseño Editorial Verde Bosque y Ámbar) -->
    <div style="background: linear-gradient(135deg, #081c15 0%, #1a4d2e 100%); padding: 36px 28px 30px; text-align: center; color: white;">
      <img src="https://frufresco-liard.vercel.app/logo-investments.png" width="160" alt="Investments Cortés" style="margin-bottom: 16px; filter: drop-shadow(0 2px 8px rgba(0,0,0,0.3)); border: 0; display: inline-block;">
      
      <div style="display: inline-block; background-color: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #86EFAC; font-size: 11px; font-weight: 800; padding: 4px 14px; border-radius: 100px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;">
        ✓ Pedido Confirmado & En Alistamiento
      </div>

      <h1 style="font-family: 'Outfit', -apple-system, sans-serif; font-size: 25px; font-weight: 900; margin: 0 0 6px 0; color: #FFFFFF; letter-spacing: -0.5px; line-height: 1.2;">
        ¡Gracias por tu compra, <span style="font-family: 'Instrument Serif', Georgia, 'Playfair Display', serif; font-style: italic; font-weight: 400; color: #d4a373;">${clientName}</span>!
      </h1>
      <p style="margin: 0; font-size: 13px; color: #CBD5E1; font-weight: 500;">
        Orden <strong style="color: #FFFFFF; font-family: 'Outfit', sans-serif;">#${orderNumber}</strong> • Del campo directamente a tu negocio
      </p>
    </div>

    <!-- 2. CUADRÍCULA DE LOGÍSTICA & DESPACHO -->
    <div style="padding: 22px 28px 10px;">
      <div style="background-color: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 14px; padding: 16px 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div>
          <span style="font-size: 10px; font-weight: 800; color: #15803D; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">📅 Fecha de Entrega</span>
          <strong style="font-size: 13px; color: #0F172A; font-family: 'Outfit', sans-serif;">${deliveryDate}</strong>
        </div>
        <div>
          <span style="font-size: 10px; font-weight: 800; color: #15803D; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">⏰ Horario Estimado</span>
          <strong style="font-size: 13px; color: #0F172A; font-family: 'Outfit', sans-serif;">${deliverySlot}</strong>
        </div>
        <div style="grid-column: span 2; border-top: 1px dashed #86EFAC; padding-top: 10px; margin-top: 2px;">
          <span style="font-size: 10px; font-weight: 800; color: #15803D; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">📍 Dirección de Recepción</span>
          <strong style="font-size: 13px; color: #0F172A;">${deliveryAddress}</strong>
        </div>
      </div>
    </div>

    <!-- 3. TABLA INDUSTRIAL DE PRODUCTOS -->
    <div style="padding: 15px 28px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <h3 style="font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 800; color: #0F172A; text-transform: uppercase; letter-spacing: 0.5px; margin: 0;">
          Resumen de Productos (${items.length} ítems)
        </h3>
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 13px; border: 1px solid #E2E8F0; border-radius: 10px; overflow: hidden;">
        <thead>
          <tr style="background-color: #F8FAFC; border-bottom: 2px solid #E2E8F0; color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">
            <th style="padding: 10px 12px; text-align: left; font-weight: 800;">Producto</th>
            <th style="padding: 10px 8px; text-align: center; font-weight: 800;">Cant.</th>
            <th style="padding: 10px 8px; text-align: right; font-weight: 800;">V. Unit.</th>
            <th style="padding: 10px 12px; text-align: right; font-weight: 800;">Total</th>
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
          TOTAL CONFIRMADO: $${totalAmount} <span style="font-size: 12px; font-weight: 700; color: #64748B;">COP</span>
        </div>
      </div>
    </div>

    <!-- 5. BANNER DE SOPORTE & ATENCIÓN AL CLIENTE -->
    <div style="margin: 10px 28px 24px; background-color: #FFFBEB; border: 1px solid #FDE68A; border-radius: 12px; padding: 14px 18px; font-size: 12px; color: #92400E; line-height: 1.5;">
      <strong>¿Necesitas modificar o adicionar algún producto antes de la hora de corte?</strong><br>
      Puedes responder directamente a este correo o escribir a nuestra línea de operaciones: 
      <strong style="color: #B45309;">(601) 683 8640</strong>.
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

  const itemsList = items.map(it => `- ${it.name} x ${it.quantity} = $${it.total || it.price}`).join('\n');

  return `¡Gracias por tu compra, ${clientName}!

Tu orden N° ${orderNumber} ha sido confirmada con éxito y se encuentra en alistamiento.
Fecha de Entrega: ${deliveryDate}
Total Confirmado: $${totalAmount} COP

Resumen de Productos:
${itemsList}

Investments Cortés S.A.S • NIT 901.393.217
Del Campo a tu Negocio`;
}
