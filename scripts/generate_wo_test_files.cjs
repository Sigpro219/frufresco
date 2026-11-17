require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Faltan variables NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

const DESKTOP_DIR = 'C:\\Users\\German Higuera\\OneDrive\\Desktop';
const WO_EXCEL_PATH = path.join(DESKTOP_DIR, 'CLIENTES INVESTMENTS NOMBRE Y NIT O CC.xlsx');

const WORLD_OFFICE_SHEET_NAME = 'Encab + Movim.Inven LOTES';
const WORLD_OFFICE_44_COLUMNS = [
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

function formatDateDDMMYYYY(d) {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function buildWoRow({ docNum, nit, sucursal, formaPago, diasCredito }) {
  const today = new Date();
  const dueDate = new Date(today);
  dueDate.setDate(dueDate.getDate() + (formaPago === 'Credito' ? (diasCredito > 0 ? diasCredito : 30) : 0));

  const fechaStr = formatDateDDMMYYYY(today);
  const dueStr = formatDateDDMMYYYY(dueDate);
  const numericNit = Number(String(nit).replace(/\D/g, '')) || 222222222222;

  return {
    'Encab: Empresa': 'INVESTMENTS CORTES SAS',
    'Encab: Tipo Documento': 'FV',
    'Encab: Prefijo': undefined,
    'Encab: Documento Número': docNum,
    'Encab: Fecha': fechaStr,
    'Encab: Tercero Interno': 456282,
    'Encab: Tercero Externo': numericNit,
    'Encab: Nota': sucursal || undefined,
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
    'Encab: Sucursal': sucursal || undefined,
    'Encab: Clasificación': undefined,
    'Detalle: Producto': 1504,
    'Detalle: Bodega': 'Principal',
    'Detalle: UnidadDeMedida': 'kg',
    'Detalle: Cantidad': 1,
    'Detalle: IVA': 0,
    'Detalle: Valor Unitario': 100,
    'Detalle: Descuento': 0,
    'Detalle: Vencimiento': dueStr,
    'Detalle: Nota': undefined,
    'Detalle: Centro costos': undefined,
    'Detalle: Personalizado1': undefined,
    'Detalle: Lote': undefined,
    'Detalle: Código Centro Costos': undefined
  };
}

function ddmmyyyyToExcelSerial(val) {
  const m = String(val || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const utc = Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const epoch = Date.UTC(1899, 11, 30);
  return Math.round((utc - epoch) / 86400000);
}

function writeWoWorkbook(rows, outPath) {
  const ws = XLSX.utils.json_to_sheet(rows, { header: [...WORLD_OFFICE_44_COLUMNS] });
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
  ws['!cols'] = WORLD_OFFICE_44_COLUMNS.map(col => ({ wch: Math.max(col.length + 2, 14) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, WORLD_OFFICE_SHEET_NAME);
  XLSX.writeFile(wb, outPath, { bookType: 'biff8' });
}

async function run() {
  // 1. Leer Excel Maestro de Terceros WO
  const woWb = XLSX.readFile(WO_EXCEL_PATH);
  const woSheetRows = XLSX.utils.sheet_to_json(woWb.Sheets[woWb.SheetNames[0]], { header: 1, defval: '' });
  const woByNit = new Map();
  for (let i = 3; i < woSheetRows.length; i++) {
    const r = woSheetRows[i];
    const nombreRaw = String(r[1] || '');
    const clasif = String(r[2] || '').trim();
    const cleanId = String(r[3] || '').trim().replace(/\D/g, '');
    const dv = String(r[4] || '').trim();
    if (!nombreRaw.trim() && !cleanId) continue;
    woByNit.set(cleanId, { nombreRaw, clasif, cleanId, dv });
  }

  // 2. Leer todos los perfiles cliente activos de Supabase
  const { data: allProfiles, error } = await supabase
    .from('profiles')
    .select('id, role, company_name, razon_social, contact_name, nit, billing_nit, billing_razon_social, parent_id, is_corporate_parent, is_active, payment_days, logistics_data');

  if (error) {
    console.error('Error consultando Supabase:', error);
    process.exit(1);
  }

  const profilesMap = new Map(allProfiles.map(p => [p.id, p]));
  const activeClients = allProfiles.filter(
    p => (p.role === 'b2b_client' || p.role === 'b2c_client' || Boolean(p.parent_id) || Boolean(p.is_corporate_parent)) && p.is_active !== false
  );

  // Archivo 1: WorldOffice_Prueba_Sucursales_B2B.xlsx (solo terceros verificados en WO)
  const EXCLUDED_INTERNAL_NITS = new Set(['901393217', '456282', '80236370']);
  const isVerifiedInWo = (p, parent) => {
    const cleanNit = String(p.billing_nit || parent?.billing_nit || p.nit || '').replace(/\D/g, '');
    return Boolean(p.logistics_data?.world_office_verified) && !EXCLUDED_INTERNAL_NITS.has(cleanNit);
  };

  const b2bTargets = activeClients.filter(p => {
    const isB2BBranch = Boolean(p.parent_id);
    const isB2BStandalone = !p.parent_id && !p.is_corporate_parent && p.role === 'b2b_client';
    if (!isB2BBranch && !isB2BStandalone) return false;
    const parent = p.parent_id ? profilesMap.get(p.parent_id) : null;
    return isVerifiedInWo(p, parent);
  });

  const b2bRows = b2bTargets.map((p, idx) => {
    const parent = p.parent_id ? profilesMap.get(p.parent_id) : null;
    const nit = p.billing_nit || parent?.billing_nit || p.nit || '222222222222';
    const sucursal = p.logistics_data?.world_office_branch || p.billing_razon_social || p.company_name || '';
    const days = Number(parent?.payment_days) || Number(p.payment_days) || 30;
    return buildWoRow({
      docNum: 990001 + idx,
      nit,
      sucursal,
      formaPago: 'Credito',
      diasCredito: days
    });
  });

  const b2bOutPath = path.join(DESKTOP_DIR, 'WorldOffice_Prueba_Sucursales_B2B.xls');
  writeWoWorkbook(b2bRows, b2bOutPath);

  // Archivo 2: WorldOffice_Prueba_Clientes_Hogar_B2C.xlsx (solo clientes Hogar con CC existente en WO)
  const b2cTargets = activeClients.filter(p => p.role === 'b2c_client' && isVerifiedInWo(p, null));
  const b2cRows = b2cTargets.map((p, idx) => {
    const nit = p.billing_nit || p.nit || '222222222222';
    const sucursal = p.logistics_data?.world_office_branch || p.billing_razon_social || p.company_name || p.contact_name || '';
    return buildWoRow({
      docNum: 991001 + idx,
      nit,
      sucursal,
      formaPago: 'Contado',
      diasCredito: 0
    });
  });

  const b2cOutPath = path.join(DESKTOP_DIR, 'WorldOffice_Prueba_Clientes_Hogar_B2C.xls');
  writeWoWorkbook(b2cRows, b2cOutPath);

  // Archivo Consolidado Sandbox: WorldOffice_SANDBOX_Todas_Las_Sucursales.xlsx (B2B + B2C verificados)
  const sandboxTargets = [...b2bTargets, ...b2cTargets];
  const sandboxDocMap = {};
  const sandboxRows = sandboxTargets.map((p, idx) => {
    const parent = p.parent_id ? profilesMap.get(p.parent_id) : null;
    const nit = p.billing_nit || parent?.billing_nit || p.nit || '222222222222';
    const sucursal = p.logistics_data?.world_office_branch || p.billing_razon_social || p.company_name || p.contact_name || '';
    const isB2B = p.role === 'b2b_client' || Boolean(p.parent_id);
    const days = isB2B ? (Number(parent?.payment_days) || Number(p.payment_days) || 30) : 0;
    const docNum = 990001 + idx;

    sandboxDocMap[String(docNum)] = {
      docNum,
      excelRow: idx + 2,
      profile_id: p.id,
      role: p.role,
      is_branch: Boolean(p.parent_id),
      nit: String(nit),
      company_name: p.company_name || p.contact_name || '',
      sucursal_enviada: sucursal,
      tercero_wo: p.logistics_data?.world_office_tercero_name || woByNit.get(String(nit).replace(/\D/g, ''))?.nombreRaw || ''
    };

    return buildWoRow({
      docNum,
      nit,
      sucursal,
      formaPago: isB2B ? 'Credito' : 'Contado',
      diasCredito: days
    });
  });

  const sandboxOutPath = path.join(DESKTOP_DIR, 'WorldOffice_SANDBOX_Todas_Las_Sucursales.xls');
  writeWoWorkbook(sandboxRows, sandboxOutPath);

  const docMapOutPath = path.join(__dirname, 'wo_sandbox_doc_map.json');
  fs.writeFileSync(docMapOutPath, JSON.stringify(sandboxDocMap, null, 2), 'utf8');

  // Archivo 3: Auditoria_Apareamiento_WorldOffice_FruFresco.xlsx (3 pestañas)
  const tab1Data = activeClients.map(p => {
    const parent = p.parent_id ? profilesMap.get(p.parent_id) : null;
    const nit = p.billing_nit || parent?.billing_nit || '';
    const woMatch = woByNit.get(nit);
    const tipo = p.parent_id
      ? 'SUCURSAL B2B'
      : (p.is_corporate_parent ? 'CASA MATRIZ B2B' : (p.role === 'b2c_client' ? 'HOGAR B2C' : 'B2B INDIVIDUAL'));
    return {
      ID: p.id,
      Rol: p.role,
      Estructura: tipo,
      Nombre_FruFresco: p.company_name || p.razon_social || p.contact_name || '',
      NIT_WorldOffice: nit,
      Tercero_WorldOffice: p.logistics_data?.world_office_tercero_name || woMatch?.nombreRaw || '',
      Sucursal_Exacta_WorldOffice: p.billing_razon_social || p.logistics_data?.world_office_branch || '',
      Verificado_En_Maestro_WO: p.logistics_data?.world_office_verified ? 'SI' : 'NO'
    };
  });

  const tab2Data = activeClients
    .filter(p => !p.logistics_data?.world_office_verified)
    .map(p => ({
      ID: p.id,
      Rol: p.role,
      Nombre_FruFresco: p.company_name || p.razon_social || p.contact_name || '',
      NIT_o_Cedula_Actual: p.billing_nit || p.nit || '',
      Sucursal_Exportada: p.billing_razon_social || '',
      Accion_Requerida_Contabilidad: EXCLUDED_INTERNAL_NITS.has(String(p.billing_nit || ''))
        ? 'Perfil interno / Obsequios (no facturar como FV)'
        : 'Crear Tercero en World Office o validar NIT/Cédula correcta'
    }));

  const hardcodedFixes = [
    { id: '59eaffaa-fec1-4b2e-a57c-f291ad0aa3b2', tipo: 'Corrección Cédula', detalle: 'PAOLA SOLER: 123465879 -> 52453404' },
    { id: '0195b02e-7213-439f-a374-295b4b82e16b', tipo: 'Corrección Cédula', detalle: 'MONICA BELEÑO: 5296909 -> 52969094' },
    { id: '8e433e3d-e91c-488b-a030-058a3e9ecee6', tipo: 'Corrección Cédula', detalle: 'DIANA HIGUERA: 5214265 -> 52695710' },
    { id: '9e08e229-0476-4842-84e9-1fb79a346e07', tipo: 'Corrección Cédula', detalle: 'CLAUDIA VARGAS: 52227594 -> 51959925' },
    { id: '327d3723-68c6-4fa4-90ab-46407ba2d48c', tipo: 'Corrección NIT', detalle: 'Colsubsidio: "No detectado" -> 860007336' },
    { id: 'c40e6c07-f2e1-43f7-898c-df9ccbb6c0a9', tipo: 'Corrección Override Sucursal', detalle: 'EL CORRAL CAFAM L 3° PISO -> EL CORRAL CAFAM l 3° Piso' },
    { id: '0f1f4f31-9102-464b-807d-bb6ca7f017e9', tipo: 'Corrección Override Sucursal', detalle: 'ALDIMARK ABRASIVOS -> ALDIMARK-ABRASIVOS' }
  ];
  const fixedIds = new Set(hardcodedFixes.map(f => f.id));

  const tab3Data = [
    ...hardcodedFixes.map(f => {
      const p = profilesMap.get(f.id);
      return {
        ID: f.id,
        Tipo_Correccion: f.tipo,
        Nombre_FruFresco: p?.company_name || '',
        NIT_Final: p?.billing_nit || '',
        Sucursal_Final_WO: p?.billing_razon_social || '',
        Detalle: f.detalle
      };
    }),
    ...activeClients
      .filter(p => !fixedIds.has(p.id) && !p.parent_id && !p.is_corporate_parent && p.logistics_data?.world_office_verified && (p.billing_razon_social || '') !== (p.company_name || '').trim())
      .map(p => ({
        ID: p.id,
        Tipo_Correccion: 'Homologación Individual Maestro WO',
        Nombre_FruFresco: p.company_name || p.contact_name || '',
        NIT_Final: p.billing_nit || '',
        Sucursal_Final_WO: p.billing_razon_social || '',
        Detalle: `"${(p.company_name || '').trim()}" -> "${p.billing_razon_social}"`
      }))
  ];

  const auditWb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet(tab1Data);
  const ws2 = XLSX.utils.json_to_sheet(tab2Data);
  const ws3 = XLSX.utils.json_to_sheet(tab3Data);
  ws1['!cols'] = [{ wch: 38 }, { wch: 14 }, { wch: 16 }, { wch: 45 }, { wch: 16 }, { wch: 42 }, { wch: 42 }, { wch: 18 }];
  ws2['!cols'] = [{ wch: 38 }, { wch: 14 }, { wch: 38 }, { wch: 20 }, { wch: 38 }, { wch: 52 }];
  ws3['!cols'] = [{ wch: 38 }, { wch: 30 }, { wch: 40 }, { wch: 16 }, { wch: 40 }, { wch: 55 }];

  XLSX.utils.book_append_sheet(auditWb, ws1, 'Apareamiento_Completo');
  XLSX.utils.book_append_sheet(auditWb, ws2, 'Faltantes_Crear_En_WO');
  XLSX.utils.book_append_sheet(auditWb, ws3, 'Correcciones_Aplicadas_BD');

  const auditOutPath = path.join(DESKTOP_DIR, 'Auditoria_Apareamiento_WorldOffice_FruFresco.xlsx');
  XLSX.writeFile(auditWb, auditOutPath);

  console.log('=== ARCHIVOS DE PRUEBA Y AUDITORIA GENERADOS ===');
  console.log(`1. ${sandboxOutPath} (${sandboxRows.length} facturas ficticias FV 990001..${990000 + sandboxRows.length})`);
  console.log(`2. ${b2bOutPath} (${b2bRows.length} facturas ficticias FV 990001..${990000 + b2bRows.length})`);
  console.log(`3. ${b2cOutPath} (${b2cRows.length} facturas ficticias FV 991001..${991000 + b2cRows.length})`);
  console.log(`4. ${auditOutPath} (Tab1: ${tab1Data.length}, Tab2: ${tab2Data.length}, Tab3: ${tab3Data.length})`);
  console.log(`5. ${docMapOutPath} (${Object.keys(sandboxDocMap).length} documentos mapeados)`);
}

run().catch(err => {
  console.error('Error generando archivos de prueba:', err);
  process.exit(1);
});
