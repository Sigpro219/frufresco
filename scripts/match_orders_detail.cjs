const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

if (fs.existsSync('.env.local')) dotenv.config({ path: '.env.local' });
else if (fs.existsSync('.env')) dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const EXCEL_PATH = 'C:/Users/German Higuera/OneDrive/Desktop/relacion_documentos_2026-10-06 (1).xlsx';

async function matchOrders() {
  console.log('--- AUDITORIA EXHAUSTIVA: EXCEL VS PLATAFORMA ---');

  // 1. Cargar Excel
  const wb = xlsx.readFile(EXCEL_PATH);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  const excelRows = [];
  for (let i = 2; i < rawData.length; i++) {
    const r = rawData[i];
    if (!r || r[0] === undefined || r[0] === null) continue;
    excelRows.push({
      rowIdx: i + 1,
      num: Number(r[0]),
      tipo: String(r[1] || '').trim(),
      doc: String(r[2] || '').trim(),
      cliente: String(r[3] || '').trim(),
      sucursal: String(r[4] || '').trim(),
      espacio: r[5],
      total: parseFloat(r[6]) || 0,
      pagar: parseFloat(r[9]) || 0,
      celular: String(r[10] || '').trim(),
      direccion: String(r[11] || '').trim(),
      formaPago: String(r[12] || '').trim(),
      zona: String(r[15] || '').trim(),
    });
  }

  console.log(`Excel: ${excelRows.length} filas (No. 1 al ${excelRows.length})`);

  // 2. Cargar snapshot y órdenes actuales
  const rawSnap = fs.readFileSync('backups/orders_78_oct6_snapshot.json', 'utf-8');
  const snapData = JSON.parse(rawSnap);
  const snapOrders = snapData.orders;

  // Cargar perfiles de Supabase
  const profIds = [...new Set(snapOrders.map(o => o.profile_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, company_name, contact_name, nit, address, phone')
    .in('id', profIds);
  const profMap = new Map();
  profiles.forEach(p => profMap.set(p.id, p));

  const platformOrders = snapOrders.map((o, idx) => {
    const p = profMap.get(o.profile_id) || {};
    return {
      idx,
      id: o.id,
      seq: o.sequence_id,
      company: p.company_name || p.contact_name || '',
      nit: p.nit || '',
      phone: p.phone || '',
      address: o.shipping_address || p.address || '',
      total: Number(o.total) || 0,
      notes: o.admin_notes || '',
      po: o.purchase_order_number || '',
      type: o.type,
      weight: o.total_weight_kg
    };
  });

  console.log(`Plataforma: ${platformOrders.length} pedidos en el snapshot.`);

  // Función para normalizar texto
  const norm = (s) => (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Matriz de similitud y matching
  const matchedExcel = new Map(); // excelIdx -> platformIdx
  const matchedPlatform = new Map(); // platformIdx -> excelIdx

  // Paso 1: Match por Documento / Factura / Remisión si está en notas o PO
  excelRows.forEach((e, eIdx) => {
    const docClean = norm(e.doc);
    platformOrders.forEach((p, pIdx) => {
      if (matchedExcel.has(eIdx) || matchedPlatform.has(pIdx)) return;
      if (p.notes && norm(p.notes).includes(docClean) && docClean.length > 3) {
        matchedExcel.set(eIdx, pIdx);
        matchedPlatform.set(pIdx, eIdx);
      }
    });
  });

  // Paso 2: Match por Cliente / Sucursal y Total exacto o muy cercano (< 100 pesos)
  excelRows.forEach((e, eIdx) => {
    if (matchedExcel.has(eIdx)) return;
    const eName = norm(e.cliente + ' ' + e.sucursal);
    const eWords = eName.split(' ').filter(w => w.length > 3);

    platformOrders.forEach((p, pIdx) => {
      if (matchedExcel.has(eIdx) || matchedPlatform.has(pIdx)) return;
      const pName = norm(p.company);
      const diff = Math.abs(p.total - e.total);

      // Si el valor coincide exactamente
      if (diff < 5) {
        // Verificar coincidencia de palabras
        const matchWords = eWords.filter(w => pName.includes(w) || norm(p.notes).includes(w));
        if (matchWords.length >= 1) {
          matchedExcel.set(eIdx, pIdx);
          matchedPlatform.set(pIdx, eIdx);
        }
      }
    });
  });

  // Paso 3: Match por Cliente / Sucursal con valor cercano o dirección
  excelRows.forEach((e, eIdx) => {
    if (matchedExcel.has(eIdx)) return;
    const eSuc = norm(e.sucursal);
    const eWords = eSuc.split(' ').filter(w => w.length > 3 && !['hotel', 'restaurante', 'sede', 'sas'].includes(w));

    platformOrders.forEach((p, pIdx) => {
      if (matchedExcel.has(eIdx) || matchedPlatform.has(pIdx)) return;
      const pName = norm(p.company);
      const pNotes = norm(p.notes);

      // Si la sucursal coincide claramente
      const strongMatch = eWords.length > 0 && eWords.every(w => pName.includes(w) || pNotes.includes(w));
      if (strongMatch) {
        matchedExcel.set(eIdx, pIdx);
        matchedPlatform.set(pIdx, eIdx);
      }
    });
  });

  // Paso 4: Match por Dirección / Teléfono
  excelRows.forEach((e, eIdx) => {
    if (matchedExcel.has(eIdx)) return;
    const eDir = norm(e.direccion).replace(/bogota|cundinamarca/g, '');
    const eTel = e.celular.replace(/\D/g, '');

    platformOrders.forEach((p, pIdx) => {
      if (matchedExcel.has(eIdx) || matchedPlatform.has(pIdx)) return;
      const pDir = norm(p.address);
      const pTel = p.phone.replace(/\D/g, '');

      if (eTel.length >= 7 && pTel.includes(eTel)) {
        matchedExcel.set(eIdx, pIdx);
        matchedPlatform.set(pIdx, eIdx);
      }
    });
  });

  console.log(`\nResultado de Matching:`);
  console.log(` - Emparejados con éxito: ${matchedExcel.size} de 78`);

  const unMatchedPlat = platformOrders.filter((_, idx) => !matchedPlatform.has(idx));
  const unMatchedExc = excelRows.filter((_, idx) => !matchedExcel.has(idx));

  console.log(` - Órdenes en Plataforma sin match: ${unMatchedPlat.length}`);
  console.log(` - Órdenes en Excel sin match: ${unMatchedExc.length}`);

  if (unMatchedPlat.length > 0) {
    console.log(`\n=== CANDIDATOS A ORDEN SOBRANTE EN PLATAFORMA ===`);
    unMatchedPlat.forEach((p) => {
      console.log(`Plataforma Seq: #${p.seq} | ID: ${p.id}`);
      console.log(`  Empresa: "${p.company}"`);
      console.log(`  Total: $${p.total.toLocaleString('es-CO')} | Peso: ${p.weight} kg`);
      console.log(`  Dirección: "${p.address}"`);
      console.log(`  Notas Breves: ${p.notes.substring(0, 150)}...`);
      console.log('-------------------------------------------------------------');
    });
  }

  if (unMatchedExc.length > 0) {
    console.log(`\n=== ORDENES DEL EXCEL PENDIENTES DE MATCH ===`);
    unMatchedExc.forEach(e => {
      console.log(`Excel No. ${e.num} | Doc: ${e.doc}`);
      console.log(`  Cliente: "${e.cliente}" | Sucursal: "${e.sucursal}"`);
      console.log(`  Total: $${e.total.toLocaleString('es-CO')} | Dir: "${e.direccion}"`);
      console.log('-------------------------------------------------------------');
    });
  }
}

matchOrders().catch(console.error);
