const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.resolve('.env.local');
const envFile = fs.readFileSync(envPath, 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let val = match[2] || '';
    val = val.trim().replace(/^['"]|['"]$/g, '');
    env[match[1]] = val;
  }
});

const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, supabaseKey);

// Fotos de prueba de productos agrícolas de alta resolución para el visor de evidencias
const EVIDENCE_PHOTOS = {
  zanahoria: 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?auto=format&fit=crop&w=800&q=80',
  tomate: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=800&q=80',
  aguacate: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=800&q=80',
  cebolla: 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?auto=format&fit=crop&w=800&q=80',
  lechuga: 'https://images.unsplash.com/photo-1622206151226-18ca2c9ab4a1?auto=format&fit=crop&w=800&q=80',
  fresa: 'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?auto=format&fit=crop&w=800&q=80',
  yuca: 'https://images.unsplash.com/photo-1590165482129-1b8b27698780?auto=format&fit=crop&w=800&q=80',
  platano: 'https://images.unsplash.com/photo-1603833665858-e61d17a86224?auto=format&fit=crop&w=800&q=80',
  uchuva: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&w=800&q=80',
  melon: 'https://images.unsplash.com/photo-1571575173700-afb9492e6a50?auto=format&fit=crop&w=800&q=80',
  general: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=800&q=80'
};

// Configuración de los 10 escenarios con voz real de cada cliente
const SCENARIOS_BY_SEQ = {
  1079: {
    persona: 'Hernando Gómez (Jefe de Almacén Zoológico Piscilago)',
    phone: '3142894510',
    keyword: 'zanahoria',
    reason: 'Faltante de kilos en pesaje',
    priority: 'high',
    qtyRatio: 0.08, // ~10 kg
    fixedQty: 8.5,
    photo: EVIDENCE_PHOTOS.zanahoria,
    narrative: 'Buen día equipo FruFresco. Al realizar la recepción en la báscula electrónica del almacén central de Piscilago, las lonas de zanahoria cero arrojaron 121.5 kg físicos frente a los 130 kg facturados en remisión. Nos hacen falta 8.5 kg. Adjunto foto del tiquete de báscula para el descuento en factura o nota crédito.'
  },
  1080: {
    persona: 'Mauricio Beltrán (Ecónomo Club Puerto Peñalisa)',
    phone: '3104558921',
    keyword: 'plátano',
    fallbackKeyword: 'papa',
    reason: 'Avería / Producto magullado o golpeado',
    priority: 'normal',
    fixedQty: 3,
    photo: EVIDENCE_PHOTOS.platano,
    narrative: 'Cordial saludo. Durante el descargue en la plataforma del Club Puerto Peñalisa, una de las canastillas de la base venía sobrecargada y 3 kg del producto llegaron partidos y aplastados. El resto del pedido entró conforme.'
  },
  1081: {
    persona: 'Andrés Villamizar (Jefe de Compras BARUS SAS)',
    phone: '3158901234',
    keyword: 'lechuga',
    fallbackKeyword: 'zukini',
    reason: 'Cadena de frío / Daño térmico o deshidratación',
    priority: 'high',
    fixedQty: 1.5,
    photo: EVIDENCE_PHOTOS.lechuga,
    narrative: 'Hola equipo de calidad. Las hojas de lechuga para nuestra línea de ensaladas frescas llegaron deshidratadas y con los bordes quemados por temperatura en el furgón. No pasan el filtro de barra fría del restaurante. Solicitamos reposición o descuento.'
  },
  1082: {
    persona: 'Claudia Patricia Rincón (Supervisora Eventos Colsubsidio Catering)',
    phone: '3144083862',
    keyword: 'melon',
    fallbackKeyword: 'fresa',
    reason: 'Calibre o especificación incorrecta',
    priority: 'high',
    fixedQty: 4,
    photo: EVIDENCE_PHOTOS.melon,
    narrative: 'Buenos días. Para el servicio de catering corporativo de hoy solicitamos fruta extra seleccionada de calibre uniforme para decoración de postres, pero nos llegaron 4 kg de calibre muy pequeño y desparejo que no podemos montar en mesa.'
  },
  1083: {
    persona: 'Inés Pombo (Cliente Hogar B2C)',
    phone: '3106746786',
    keyword: 'aguacate',
    fallbackKeyword: 'tomate',
    reason: 'Avería / Producto magullado o golpeado',
    priority: 'normal',
    fixedQty: 1,
    photo: EVIDENCE_PHOTOS.aguacate,
    narrative: '¡Hola! Acabo de recibir mi mercado en el apartamento. Todo muy bonito, pero al abrir la bolsa vi que me llegaron unidades muy magulladas y blanditas por encima, parece que les pusieron algo pesado encima. Les envío la foto para que me ayuden por favor.'
  },
  1084: {
    persona: 'Jorge Eliécer Pinto (Recepción Sótano 1 - Colsubsidio El Cubo)',
    phone: '3224279471',
    keyword: 'uchuva',
    fallbackKeyword: 'zanahoria',
    reason: 'Faltante de kilos en pesaje',
    priority: 'urgent',
    fixedQty: 2,
    photo: EVIDENCE_PHOTOS.uchuva,
    narrative: 'Señores FruFresco, en la remisión #1084 aparece relacionada la uchuva desgranada (2 kg), pero al revisar canastilla por canastilla con el conductor en el sótano de El Cubo, el producto físicamente no vino en el camión. El conductor firmó la observación en la hoja.'
  },
  1085: {
    persona: 'Katherinne Gasca / Chef Ejecutivo (GHL Hotel Capital)',
    phone: '3112553355',
    keyword: 'tomate',
    fallbackKeyword: 'zukini',
    reason: 'Avería / Producto magullado o golpeado',
    priority: 'high',
    fixedQty: 5,
    photo: EVIDENCE_PHOTOS.tomate,
    narrative: 'Buen día. En el recibo de cocina principal del Hotel Capital (OC 80648) rechazamos 5 kg porque venían en el fondo de la canastilla reventados y soltando líquido. Por estándar BPM de GHL no podemos ingresar producto fisurado a cava. Favor aplicar Nota Crédito para cuadrar factura electrónica.'
  },
  1086: {
    persona: 'Chef Carlos Salamanca (Diplomat Hotel TRYP Embajada)',
    phone: '3235102079',
    keyword: 'yuca',
    fallbackKeyword: 'zanahoria',
    reason: 'Error en montaje / Producto no solicitado en orden',
    priority: 'normal',
    fixedQty: 3,
    photo: EVIDENCE_PHOTOS.yuca,
    narrative: 'Equipo FruFresco, solicitamos 3 kg de yuca pelada lista para cocción del buffet de mañana, y en el alistamiento nos enviaron el producto con corteza/sin procesar o trocado. Requerimos el cambio o el ajuste del ítem en la cuenta.'
  },
  1087: {
    persona: 'Jefe de Cocina Turno AM (Lao Kao S.A. - Restaurantes WOK)',
    phone: '3176549081',
    keyword: 'cebolla',
    fallbackKeyword: 'pimenton',
    reason: 'Fitopatología / Pudrición o moho',
    priority: 'high',
    fixedQty: 4,
    photo: EVIDENCE_PHOTOS.cebolla,
    narrative: 'Hola equipo calidad. Al cortar el lote recibido hoy con la OC 001-OC-00074549 para preparación de mise en place de Wok, encontramos 4 kg con daño interno de humedad y presencia de moho en el corazón. Separamos el lote afectado y adjuntamos evidencia.'
  },
  1088: {
    persona: 'Jaime Lizcano (Almacén Hotel Colsubsidio Peñalisa)',
    phone: '3183409122',
    keyword: 'aguacate',
    fallbackKeyword: 'mango',
    reason: 'Fisiología / Sobremaduro o pasado',
    priority: 'high',
    fixedQty: 6,
    photo: EVIDENCE_PHOTOS.aguacate,
    narrative: 'Buenos días. Según especificación técnica de la orden SAP 7900341505, el aguacate extra debía llegar al 80% de maduración (pintón firme). Nos llegaron 6 kg completamente pasados de maduración y negros por dentro. Adjunto registro fotográfico de almacén Peñalisa.'
  }
};

async function runCascadeAndPqrs() {
  console.log('=== INICIANDO CASCADA OPERATIVA Y RADICACIÓN DE 10 PQRS ===\n');

  const { data: orders, error: fetchErr } = await supabase
    .from('orders')
    .select(`
      id,
      sequence_id,
      delivery_date,
      status,
      total,
      profile_id,
      profiles:profile_id (id, company_name, contact_name, phone, contact_phone),
      order_items (
        id,
        product_id,
        quantity,
        unit_price,
        products (id, name, unit_of_measure)
      )
    `)
    .eq('delivery_date', '2026-10-16')
    .order('sequence_id', { ascending: true });

  if (fetchErr || !orders || orders.length === 0) {
    console.error('Error cargando los 10 pedidos:', fetchErr);
    process.exit(1);
  }

  console.log(`Pedidos encontrados para cascada: ${orders.length}\n`);

  // Limpiar PQRS o devoluciones previas sobre estos 10 pedidos por idempotencia
  const orderIds = orders.map(o => o.id);
  await supabase.from('billing_returns').delete().in('order_id', orderIds);
  await supabase.from('customer_service_pqrs').delete().in('order_id', orderIds);

  const summary = [];

  for (const order of orders) {
    const seq = order.sequence_id;
    const clientName = order.profiles?.company_name || order.profiles?.contact_name || `Cliente #${seq}`;
    console.log(`▶ Procesando Pedido #${seq} (${clientName})...`);

    // 1. Cascada de Estados: para_compra -> picking -> shipped -> delivered
    const cascadeSteps = ['picking', 'shipped', 'delivered'];
    for (const stepStatus of cascadeSteps) {
      const { error: stepErr } = await supabase
        .from('orders')
        .update({ status: stepStatus })
        .eq('id', order.id);

      if (stepErr) {
        console.error(`  ❌ Error pasando #${seq} a ${stepStatus}:`, stepErr.message);
      } else {
        console.log(`  ✓ Estado actualizado: -> [${stepStatus.toUpperCase()}]`);
      }
    }

    // 2. Seleccionar el ítem de producto correspondiente al escenario
    const config = SCENARIOS_BY_SEQ[seq] || {
      persona: clientName,
      phone: order.profiles?.contact_phone || order.profiles?.phone || '3100000000',
      keyword: '',
      reason: 'Avería / Producto magullado o golpeado',
      priority: 'normal',
      fixedQty: 1,
      photo: EVIDENCE_PHOTOS.general,
      narrative: 'Reportamos novedad de calidad en la entrega recibida hoy.'
    };

    const items = order.order_items || [];
    const normalize = (str) => (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    let targetItem = items.find(it => normalize(it.products?.name).includes(normalize(config.keyword)));
    if (!targetItem && config.fallbackKeyword) {
      targetItem = items.find(it => normalize(it.products?.name).includes(normalize(config.fallbackKeyword)));
    }
    if (!targetItem) {
      // Escoger el ítem de mayor cantidad
      targetItem = [...items].sort((a, b) => Number(b.quantity) - Number(a.quantity))[0];
    }

    const prodName = targetItem?.products?.name || 'Producto Agrícola';
    const prodUnit = targetItem?.products?.unit_of_measure || 'Kg';
    const maxQty = Number(targetItem?.quantity || 1);
    const affectedQty = Math.min(config.fixedQty || 1, maxQty > 1 ? Math.max(1, Math.round(maxQty * 0.2 * 10) / 10) : maxQty);
    const finalQty = config.fixedQty <= maxQty ? config.fixedQty : affectedQty;

    // 3. Insertar en billing_returns (para que impacte Facturación y Novedades QA)
    if (targetItem) {
      const { error: retErr } = await supabase
        .from('billing_returns')
        .insert({
          order_id: order.id,
          product_id: targetItem.product_id,
          quantity_returned: finalQty,
          reason: `[PQRS Cliente] ${config.reason}: ${config.narrative}`,
          photo_url: config.photo,
          status: 'pending_review'
        });

      if (retErr) {
        console.error(`  ❌ Error creando billing_return en #${seq}:`, retErr.message);
      } else {
        console.log(`  ✓ Devolución QA registrada: ${finalQty} ${prodUnit} de ${prodName}`);
      }
    }

    // 4. Insertar en customer_service_pqrs (para la bandeja de Atención al Cliente)
    const subject = `[Garantía Cliente] Reclamo en ${prodName} - Pedido #REM-${seq}`;
    const fullDescription =
      `Radicado vía Portal Móvil / QR de Remisión.\n` +
      `• Contacto de radicación: ${config.persona} (Tel: ${config.phone})\n` +
      `• Producto: ${prodName}\n` +
      `• Motivo: ${config.reason}\n` +
      `• Cantidad: ${finalQty} ${prodUnit} (de ${maxQty} ${prodUnit} despachados)\n` +
      `• Detalle: ${config.narrative}`;

    const { data: pqrRow, error: pqrErr } = await supabase
      .from('customer_service_pqrs')
      .insert({
        client_id: order.profile_id,
        order_id: order.id,
        type: 'reclamo',
        category: 'producto',
        priority: config.priority,
        subject: subject,
        description: fullDescription,
        primary_photo_url: config.photo,
        status: 'pending'
      })
      .select('id')
      .single();

    if (pqrErr) {
      console.error(`  ❌ Error creando PQR en #${seq}:`, pqrErr.message);
    } else {
      console.log(`  ✓ Ticket PQRS creado exitosamente (ID: ${pqrRow.id.slice(0, 8)})\n`);
    }

    summary.push({
      pedido: `#${seq}`,
      cliente: clientName.slice(0, 32),
      estado: 'DELIVERED',
      producto_afectado: `${prodName} (${finalQty} ${prodUnit})`,
      motivo_pqr: config.reason.slice(0, 28),
      prioridad: config.priority.toUpperCase()
    });
  }

  console.log('=== RESUMEN FINAL DE LA CASCADA Y PQRS INYECTADAS ===');
  console.table(summary);
}

runCascadeAndPqrs().catch(console.error);
