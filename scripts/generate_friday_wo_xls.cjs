require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const path = require('path');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DESKTOP_DIR = 'C:\\Users\\German Higuera\\OneDrive\\Desktop';
const TARGET_DATE = '2026-11-13';
const SHEET_NAME = 'Encab + Movim.Inven LOTES';

const COLUMNS_44 = [
  'Encab: Empresa',
  'Encab: Tipo Documento',
  'Encab: Prefijo',
  'Encab: Documento Número',
  'Encab: Fecha',
  'Encab: Tercero Interno',
  'Encab: Tercero Externo',
  'Encab: Nota',
  'Encab: FormaPago',
  'Encab: Fecha Entrega',
  'Encab: Prefijo Documento Externo',
  'Encab: Número_Documento_Externo',
  'Encab: Verificado',
  'Encab: Anulado',
  'Encab: Personalizado 1',
  'Encab: Personalizado 2',
  'Encab: Personalizado 3',
  'Encab: Personalizado 4',
  'Encab: Personalizado 5',
  'Encab: Personalizado 6',
  'Encab: Personalizado 7',
  'Encab: Personalizado 8',
  'Encab: Personalizado 9',
  'Encab: Personalizado 10',
  'Encab: Personalizado 11',
  'Encab: Personalizado 12',
  'Encab: Personalizado 13',
  'Encab: Personalizado 14',
  'Encab: Personalizado 15',
  'Encab: Sucursal',
  'Encab: Clasificación',
  'Detalle: Producto',
  'Detalle: Bodega',
  'Detalle: UnidadDeMedida',
  'Detalle: Cantidad',
  'Detalle: IVA',
  'Detalle: Valor Unitario',
  'Detalle: Descuento',
  'Detalle: Vencimiento',
  'Detalle: Nota',
  'Detalle: Centro costos',
  'Detalle: Personalizado1',
  'Detalle: Lote',
  'Detalle: Código Centro Costos'
];

function formatDateDDMMYYYY(dateInput) {
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateInput.trim())) {
    const [y, m, d] = dateInput.trim().substring(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  const dObj = new Date(dateInput || Date.now());
  return `${String(dObj.getDate()).padStart(2, '0')}/${String(dObj.getMonth() + 1).padStart(2, '0')}/${dObj.getFullYear()}`;
}

function calculateDueDate(baseDateInput, days = 0) {
  const [y, m, d] = String(baseDateInput || TARGET_DATE).substring(0, 10).split('-').map(Number);
  const dObj = new Date(y, m - 1, d);
  dObj.setDate(dObj.getDate() + (Number(days) || 0));
  return `${String(dObj.getDate()).padStart(2, '0')}/${String(dObj.getMonth() + 1).padStart(2, '0')}/${dObj.getFullYear()}`;
}

function normalizeUom(rawUom) {
  const clean = String(rawUom || 'kg').trim().toLowerCase();
  if (/^(lb|lbs|libra|libras)$/i.test(clean)) return 'LB';
  if (
    /^(und|und\.|unidad|unidades|un|pz|pza|paquete|atado|bulto|caja|bandeja|canastilla|malla|sobre)/i.test(clean) ||
    clean.includes('unidad') ||
    clean.includes('und') ||
    clean.includes('paquete')
  ) {
    return 'Und.';
  }
  return 'kg';
}

function resolveBranch(prof, parentProf) {
  const c = prof?.logistics_data?.world_office_branch || prof?.billing_razon_social;
  if (typeof c === 'string' && c.trim().length > 0) return c;
  if (!prof?.parent_id && parentProf) {
    const pc = parentProf?.logistics_data?.world_office_branch || parentProf?.billing_razon_social;
    if (typeof pc === 'string' && pc.trim().length > 0) return pc;
  }
  return (prof?.razon_social || prof?.company_name || prof?.contact_name || '').trim();
}

function resolveNote(order, prof, branchName, parentProf) {
  const rawOc = (order?.purchase_order_number || '').trim();
  const cleanOc = rawOc
    .replace(/^(?:fv\s*)?(?:seg[uú]n\s*)?(?:orden\s*de\s*compra\s*[:#-]?\s*|solped\s*[:#-]?\s*|oc\b\s*[:#-]?\s+)/i, '')
    .trim();
  const digitCount = (cleanOc.match(/\d/g) || []).length;
  const isNoise =
    /^(?:calle|cll|carrera|cra|kr|av|avenida|transversal|tv|diagonal|dg|piso|sede|bulevar|homecenter|cafam|corferias|n\/a|na|sin\s*oc|ningun[ao]?|pendiente|no\s*aplica)\b/i.test(cleanOc) ||
    /^carrera\s*\d+$/i.test(cleanOc);
  const isExplicit = /\b(?:oc|solped|pedido|semana)\b/i.test(rawOc);
  if (cleanOc && digitCount > 0 && !isNoise && (digitCount >= 3 || isExplicit)) {
    return cleanOc;
  }
  return branchName || resolveBranch(prof, parentProf);
}

async function run() {
  const { data: orders, error } = await supabase
    .from('orders')
    .select(`
      id, sequence_id, delivery_date, type, total, admin_notes, logistics_data, purchase_order_number,
      billing_invoices!billing_invoices_order_id_fkey(invoice_number),
      profiles (
        id, nit, billing_nit, billing_razon_social, company_name, razon_social, contact_name, payment_days, iva_responsible, parent_id, role, logistics_data
      ),
      order_items (
        id, quantity, picked_quantity, unit_price, nickname, unit, selected_options, product_id,
        products (
          id, accounting_id, sku, name, unit_of_measure, iva_rate
        )
      ),
      billing_returns (
        id, product_id, quantity_returned, status, reason,
        products:product_id ( id, name )
      )
    `)
    .eq('delivery_date', TARGET_DATE)
    .neq('status', 'cancelled')
    .order('sequence_id', { ascending: true });

  if (error) {
    console.error('Error consultando pedidos del viernes:', error);
    process.exit(1);
  }

  const parentIds = Array.from(new Set((orders || []).map(o => o.profiles?.parent_id).filter(Boolean)));
  const parentsMap = new Map();
  if (parentIds.length > 0) {
    const { data: parents } = await supabase
      .from('profiles')
      .select('id, nit, billing_nit, billing_razon_social, company_name, razon_social, payment_days, iva_responsible, logistics_data')
      .in('id', parentIds);
    (parents || []).forEach(p => parentsMap.set(p.id, p));
  }

  const rows = [];
  let exportedOrders = 0;

  for (const order of orders || []) {
    const isGiftOrReplacement = Boolean(
      order.logistics_data?.is_gift_remission ||
      order.logistics_data?.is_replacement ||
      (order.admin_notes || '').includes('REMISIÓN DE OBSEQUIO') ||
      (order.admin_notes || '').includes('REPOSICIÓN')
    );
    if (Number(order.total || 0) <= 0 || isGiftOrReplacement) continue;

    const prof = order.profiles || {};
    const parentProf = prof.parent_id ? parentsMap.get(prof.parent_id) : null;
    const nitStr = (prof.billing_nit || parentProf?.billing_nit || parentProf?.nit || prof.nit || '222222222222').trim();
    const numericNit = Number(nitStr.replace(/\D/g, '')) || 222222222222;
    const isIva = !!(parentProf?.iva_responsible ?? prof.iva_responsible);
    const isB2B = prof.role === 'b2b_client' || order.type === 'b2b' || !!prof.parent_id || !!parentProf;
    const paymentDays = Number(parentProf?.payment_days) || Number(prof.payment_days) || (isB2B ? 30 : 0);
    const formaPago = isB2B ? 'Credito' : 'Contado';

    const invObj = Array.isArray(order.billing_invoices) ? order.billing_invoices[0] : order.billing_invoices;
    const rawInv = invObj?.invoice_number || order.sequence_id;
    const invNum = parseInt(String(rawInv).replace(/\D/g, ''), 10) || order.sequence_id;

    const isClientInLb = (prof.logistics_data?.billing_weight_unit === 'lb') || (order.logistics_data?.billing_weight_unit === 'lb') || (parentProf?.logistics_data?.billing_weight_unit === 'lb');
    const discountPct = Number(order.logistics_data?.agreement_discount_pct || prof.logistics_data?.agreement_discount_pct || 0);
    const discountDecimal = discountPct > 0 ? (discountPct / 100) : 0;

    const branchName = resolveBranch(prof, parentProf);
    const noteStr = resolveNote(order, prof, branchName, parentProf);
    const fechaStr = formatDateDDMMYYYY(order.delivery_date || TARGET_DATE);
    const dueStr = calculateDueDate(order.delivery_date || TARGET_DATE, formaPago === 'Credito' ? (paymentDays > 0 ? paymentDays : 30) : 0);

    let hasLines = false;
    for (const item of order.order_items || []) {
      const baseItemQty = (item.selected_options?._charge_overweight === true && Number(item.picked_quantity) > Number(item.quantity))
        ? Number(item.picked_quantity)
        : (Number(item.quantity) || 0);

      const matchedReturn = (order.billing_returns || []).find(r =>
        (r.product_id === item.product_id || (r.products?.name && r.products.name.toLowerCase() === item.products?.name?.toLowerCase())) &&
        (r.status === 'approved' || (r.reason && (r.reason.includes('AJUSTE FACTURA') || r.reason.includes('NOTA CRÉDITO')))) &&
        !(r.reason && (r.reason.includes('Reprogramado en Pedido') || r.reason.toLowerCase().includes('reposición') || r.reason.toLowerCase().includes('reposicion')))
      );
      const deductionQty = matchedReturn ? Number(matchedReturn.quantity_returned || 0) : 0;
      const rawQty = Math.max(0, baseItemQty - deductionQty);
      if (rawQty <= 0) continue;

      const rawUnitPrice = Number(item.unit_price) || 0;
      const rawUom = item.products?.unit_of_measure || item.unit || 'KG';
      const isKg = /^(kg|kilo|kilos|kilogramo|kilogramos)$/i.test(rawUom.trim());

      const qty = (isClientInLb && isKg) ? rawQty * 2 : rawQty;
      const unitPrice = (isClientInLb && isKg && rawUnitPrice > 0) ? rawUnitPrice / 2 : rawUnitPrice;
      const uom = (isClientInLb && isKg) ? 'LB' : rawUom;
      const prodCode = item.products?.accounting_id ?? item.products?.sku ?? `FRU-${item.id?.slice(0, 4) || 'ITEM'}`;
      const cleanProd = typeof prodCode === 'number' ? prodCode : (/^\d+$/.test(String(prodCode).trim()) ? Number(String(prodCode).trim()) : prodCode);

      hasLines = true;
      rows.push({
        'Encab: Empresa': 'INVESTMENTS CORTES SAS',
        'Encab: Tipo Documento': 'FV',
        'Encab: Prefijo': undefined,
        'Encab: Documento Número': invNum,
        'Encab: Fecha': fechaStr,
        'Encab: Tercero Interno': 456282,
        'Encab: Tercero Externo': numericNit,
        'Encab: Nota': noteStr || branchName || undefined,
        'Encab: FormaPago': formaPago,
        'Encab: Fecha Entrega': fechaStr,
        'Encab: Prefijo Documento Externo': undefined,
        'Encab: Número_Documento_Externo': undefined,
        'Encab: Verificado': undefined,
        'Encab: Anulado': undefined,
        'Encab: Personalizado 1': undefined,
        'Encab: Personalizado 2': undefined,
        'Encab: Personalizado 3': undefined,
        'Encab: Personalizado 4': undefined,
        'Encab: Personalizado 5': undefined,
        'Encab: Personalizado 6': undefined,
        'Encab: Personalizado 7': undefined,
        'Encab: Personalizado 8': undefined,
        'Encab: Personalizado 9': undefined,
        'Encab: Personalizado 10': undefined,
        'Encab: Personalizado 11': undefined,
        'Encab: Personalizado 12': undefined,
        'Encab: Personalizado 13': undefined,
        'Encab: Personalizado 14': undefined,
        'Encab: Personalizado 15': undefined,
        'Encab: Sucursal': branchName || undefined,
        'Encab: Clasificación': undefined,
        'Detalle: Producto': cleanProd,
        'Detalle: Bodega': 'Principal',
        'Detalle: UnidadDeMedida': normalizeUom(uom),
        'Detalle: Cantidad': Number(qty) || 0,
        'Detalle: IVA': isIva ? 0.19 : 0,
        'Detalle: Valor Unitario': Number(unitPrice) || 0,
        'Detalle: Descuento': discountDecimal,
        'Detalle: Vencimiento': dueStr,
        'Detalle: Nota': undefined,
        'Detalle: Centro costos': undefined,
        'Detalle: Personalizado1': undefined,
        'Detalle: Lote': undefined,
        'Detalle: Código Centro Costos': undefined
      });
    }
    if (hasLines) exportedOrders++;
  }

  const ddmmyyyyToExcelSerial = (val) => {
    const m = String(val || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const utc = Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    const epoch = Date.UTC(1899, 11, 30);
    return Math.round((utc - epoch) / 86400000);
  };

  const ws = XLSX.utils.json_to_sheet(rows, { header: [...COLUMNS_44] });
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:AR1');
  for (let R = 1; R <= range.e.r; ++R) {
    const aiAddr = XLSX.utils.encode_cell({ r: R, c: 34 });
    if (ws[aiAddr] && ws[aiAddr].t === 'n') {
      ws[aiAddr].z = '0.00';
    }
    for (const cIdx of [4, 9, 38]) {
      const addr = XLSX.utils.encode_cell({ r: R, c: cIdx });
      const cell = ws[addr];
      if (cell && typeof cell.v === 'string') {
        const serial = ddmmyyyyToExcelSerial(cell.v);
        if (serial !== null) {
          ws[addr] = { t: 'n', v: serial, z: 'dd/mm/yyyy' };
        }
      }
    }
  }
  ws['!cols'] = COLUMNS_44.map(col => ({ wch: Math.max(col.length + 2, 14) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);

  const outPath = path.join(DESKTOP_DIR, `WorldOffice_Pedidos_Viernes_${TARGET_DATE}.xls`);
  XLSX.writeFile(wb, outPath, { bookType: 'biff8' });

  console.log(`Generado: ${outPath}`);
  console.log({ exportedOrders, totalLines: rows.length });
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
