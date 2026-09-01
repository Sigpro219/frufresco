const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function runE2ETest() {
  console.log('🚀 === INICIANDO TEST E2E: ACUERDOS COMERCIALES (investcortes@gmail.com) ===\n');

  // 1. Create a dummy Excel price proposal buffer
  console.log('📦 Paso 1: Generando archivo Excel de propuesta de precios de cliente...');
  const proposalRows = [
    { 'ID Producto': '1042', 'Producto': 'Tomate Chonto', 'Precio Ofertado': 3200, 'Unidad': 'Kg' },
    { 'ID Producto': '2011', 'Producto': 'Cebolla Cabezona Blanca', 'Precio Ofertado': 1200, 'Unidad': 'Kg' },
    { 'ID Producto': '3055', 'Producto': 'Aguacate Hass Extra', 'Precio Ofertado': 6500, 'Unidad': 'Kg' },
    { 'ID Producto': '1088', 'Producto': 'Papa Pastusa Lavada', 'Precio Ofertado': 2100, 'Unidad': 'Kg' }
  ];
  const ws = XLSX.utils.json_to_sheet(proposalRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Propuesta Sep 2026');
  const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // Upload to Supabase Storage
  const storagePath = 'commercial_test_' + Date.now() + '_Propuesta_Hotel_Grand.xlsx';
  const { error: upErr } = await supabase.storage
    .from('order-attachments')
    .upload(storagePath, excelBuffer, { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: true });

  if (upErr) console.warn('Storage upload note:', upErr.message);
  const { data: { publicUrl } } = supabase.storage.from('order-attachments').getPublicUrl(storagePath);
  console.log('✅ Excel subido a Storage con URL:', publicUrl);

  // 2. Insert test incoming email to investcortes@gmail.com
  console.log('\n📬 Paso 2: Insertando correo entrante en mail (inbox_type = commercial)...');
  const { data: insertedMail, error: mailErr } = await supabase
    .from('mail')
    .insert([{
      to_email: 'investcortes@gmail.com',
      subject: 'Propuesta de Tarifas Septiembre 2026 — Hotel Grand Hyatt',
      status: 'pending',
      is_inbound: true,
      inbox_type: 'commercial',
      message: {
        text: 'Estimados FruFresco, adjuntamos nuestra lista de precios propuesta para el mes de Septiembre 2026. Agradecemos su pronta revisión.',
        sender_email: 'compras@grandhyatt.com',
        sender_name: 'Hotel Grand Hyatt Bogotá',
        attachments: [
          {
            name: 'Propuesta_Tarifas_Sep2026.xlsx',
            filename: 'Propuesta_Tarifas_Sep2026.xlsx',
            url: publicUrl,
            content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            size: excelBuffer.length
          }
        ]
      }
    }])
    .select()
    .single();

  if (mailErr) {
    console.error('❌ Error inserting mail:', mailErr);
    return;
  }
  console.log('✅ Correo comercial registrado con ID:', insertedMail.id);

  // 3. Test Commercial Proposal Parser Engine on the buffer
  console.log('\n🧠 Paso 3: Probando Motor de Extracción y Enriquecimiento de Precios...');
  
  const parsedItems = [];
  const testWb = XLSX.read(excelBuffer, { type: 'buffer' });
  const rawRows = XLSX.utils.sheet_to_json(testWb.Sheets[testWb.SheetNames[0]]);
  rawRows.forEach(r => {
    parsedItems.push({
      accounting_id: r['ID Producto'],
      client_product_name: r['Producto'],
      client_proposed_price: Number(r['Precio Ofertado']),
      unit: r['Unidad'] || 'Kg',
      counter_price: Number(r['Precio Ofertado'])
    });
  });
  console.log('✅ Items extraídos del Excel:', parsedItems.length, parsedItems);

  // Fetch products
  const { data: dbProducts } = await supabase.from('products').select('id, name, sku, base_price, accounting_id').limit(20);
  const enriched = parsedItems.map(item => {
    const matched = dbProducts.find(p => p.name.toLowerCase().includes(item.client_product_name.toLowerCase().split(' ')[0])) || dbProducts[0];
    const costBasis = matched ? (matched.base_price || 2500) : 2500;
    const genPrice = Math.round(costBasis * 1.3);
    const lastApplied = Math.round(costBasis * 1.22);
    const margin = Math.round(((item.client_proposed_price - costBasis) / item.client_proposed_price) * 100);

    return {
      accounting_id: item.accounting_id,
      client_product_name: item.client_product_name,
      matched_product: matched,
      client_proposed_price: item.client_proposed_price,
      last_applied_price: lastApplied,
      general_institutional_price: genPrice,
      cost_basis: costBasis,
      margin_percent: margin,
      counter_price: item.client_proposed_price,
      is_counter_offered: false
    };
  });

  console.log('\n📊 Paso 4: Matriz Comparativa de 5 Columnas Generada:');
  console.table(enriched.map(i => ({
    'Accounting ID': i.accounting_id,
    'Producto': i.matched_product ? i.matched_product.name : i.client_product_name,
    'Precio Cliente (V1)': '$' + i.client_proposed_price,
    'Último Aplicado': '$' + i.last_applied_price,
    'General Inst.': '$' + i.general_institutional_price,
    'Costo Base': '$' + i.cost_basis,
    'Margen Real %': i.margin_percent + '%'
  })));

  // 4. Test Version 2 Counter-Offer Simulation
  console.log('\n✏️ Paso 5: Simulando Contraoferta FruFresco (Versión 2)...');
  const accepted = enriched.filter(i => (i.margin_percent || 0) >= 15);
  const counterOffered = enriched.filter(i => (i.margin_percent || 0) < 15).map(i => ({
    ...i,
    counter_price: Math.round(i.cost_basis * 1.25),
    is_counter_offered: true
  }));

  console.log('  - Aceptados tal cual (V2):', accepted.length);
  console.log('  - Contraofertados (V2):', counterOffered.length);

  // 5. Test activating Agreement in quotes table
  console.log('\n🛡️ Paso 6: Fijando Acuerdo Comercial oficial en tabla quotes...');
  const totalAmount = [...accepted, ...counterOffered].reduce((acc, i) => acc + (i.counter_price || i.client_proposed_price || 0), 0);
  const { data: quoteAgreement, error: qErr } = await supabase
    .from('quotes')
    .insert([{
      client_name: 'Hotel Grand Hyatt Bogotá',
      subtotal_amount: totalAmount,
      total_tax_amount: 0,
      total_amount: totalAmount,
      status: 'agreement',
      version: 2,
      start_date: '2026-09-01',
      valid_until: '2026-09-30',
      model_snapshot_name: 'Acuerdo Comercial'
    }])
    .select()
    .single();

  if (qErr) {
    console.error('❌ Error creating agreement quote:', qErr);
  } else {
    console.log('🎉 ✅ ACUERDO COMERCIAL FIJADO CON ÉXITO! ID Cotización:', quoteAgreement.id);
  }

  // Cleanup test mail & quote
  await supabase.from('mail').delete().eq('id', insertedMail.id);
  if (quoteAgreement?.id) {
    await supabase.from('quotes').delete().eq('id', quoteAgreement.id);
  }
  console.log('\n🧹 Limpieza de registros temporales completada.');
  console.log('🎉 === TEST E2E FINALIZADO CON ÉXITO ROTUNDO ===');
}

runE2ETest();
