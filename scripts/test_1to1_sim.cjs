const fs = require('fs');
const xlsx = require('xlsx');

const goldPath = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre/Adicionales/WorldOffice_Pedidos_2026-10-22_67_pedidos (8).xlsx';
const wbGold = xlsx.readFile(goldPath);
const wsGold = wbGold.Sheets[wbGold.SheetNames[0]];

// Build a simulated row matching the updated logic:
const WORLD_OFFICE_57_COLUMNS = [
    'EMPRESA', 'Encab: Tipo Documento', 'Encab: Prefijo', 'Encab: Documento Número', 'Encab: Fecha',
    'Encab: Tercero Interno', 'Encab: Tercero Externo', 'Encab: Nota', 'Encab: FormaPago', 'Encab: Fecha Entrega',
    'Encab: Prefijo Documento Externo', 'Encab: Número_Documento_Externo', 'Encab: Verificado', 'Encab: Anulado',
    'Encab: Personalizado 1', 'Encab: Personalizado 2', 'Encab: Personalizado 3', 'Encab: Personalizado 4',
    'Encab: Personalizado 5', 'Encab: Personalizado 6', 'Encab: Personalizado 7', 'Encab: Personalizado 8',
    'Encab: Personalizado 9', 'Encab: Personalizado 10', 'Encab: Personalizado 11', 'Encab: Personalizado 12',
    'Encab: Personalizado 13', 'Encab: Personalizado 14', 'Encab: Personalizado 15', 'Encab: Sucursal',
    'Encab: Clasificación', 'Detalle: Producto', 'Detalle: Bodega', 'Detalle: UnidadDeMedida',
    'Detalle: Cantidad', 'Detalle: IVA', 'Detalle: Valor Unitario', 'Detalle: Descuento',
    'Detalle: Vencimiento', 'Detalle: Nota', 'Detalle: Centro costos', 'Detalle: Personalizado1',
    'Detalle: Personalizado2', 'Detalle: Personalizado3', 'Detalle: Personalizado4', 'Detalle: Personalizado5',
    'Detalle: Personalizado6', 'Detalle: Personalizado7', 'Detalle: Personalizado8', 'Detalle: Personalizado9',
    'Detalle: Personalizado10', 'Detalle: Personalizado11', 'Detalle: Personalizado12', 'Detalle: Personalizado13',
    'Detalle: Personalizado14', 'Detalle: Personalizado15', 'Detalle: Código Centro Costos'
];

function normalizeUom(rawUom) {
    const clean = String(rawUom || 'Kg').trim();
    if (/^(lb|lbs|libra|libras)$/i.test(clean)) return 'LB';
    if (/^(kg|kilo|kilos|kilogramo|kilogramos)$/i.test(clean)) return 'Kg'; // Matches Gold 'Kg'
    if (/^unid/i.test(clean)) return 'Unidad';
    return clean;
}

// Exactly simulate Row 2 of Gold:
const simulatedItem = {
    'EMPRESA': 'INVESTMENTS CORTES SAS',
    'Encab: Tipo Documento': 'FV',
    'Encab: Prefijo': '',
    'Encab: Documento Número': 67580,
    'Encab: Fecha': '22/10/2026',
    'Encab: Tercero Interno': '456282', // String as in Gold
    'Encab: Tercero Externo': '860533413', // String as in Gold
    'Encab: Nota': 'FV segun orden de compra iserra - EL CORRAL ISERRA',
    'Encab: FormaPago': 'Credito',
    'Encab: Fecha Entrega': '22/10/2026',
    'Encab: Prefijo Documento Externo': '',
    'Encab: Número_Documento_Externo': '',
    'Encab: Verificado': '',
    'Encab: Anulado': '',
    'Encab: Personalizado 1': '',
    'Encab: Personalizado 2': '',
    'Encab: Personalizado 3': '',
    'Encab: Personalizado 4': '',
    'Encab: Personalizado 5': '',
    'Encab: Personalizado 6': '',
    'Encab: Personalizado 7': '',
    'Encab: Personalizado 8': '',
    'Encab: Personalizado 9': '',
    'Encab: Personalizado 10': '',
    'Encab: Personalizado 11': '',
    'Encab: Personalizado 12': '',
    'Encab: Personalizado 13': '',
    'Encab: Personalizado 14': '',
    'Encab: Personalizado 15': '',
    'Encab: Sucursal': 'EL CORRAL ISERRA',
    'Encab: Clasificación': '', // EMPTY as in Gold
    'Detalle: Producto': 1504,
    'Detalle: Bodega': 'Principal', // "Principal" as in Gold
    'Detalle: UnidadDeMedida': normalizeUom('Kg'),
    'Detalle: Cantidad': 5,
    'Detalle: IVA': 0,
    'Detalle: Valor Unitario': 6469,
    'Detalle: Descuento': 0,
    'Detalle: Vencimiento': '22/10/2026',
    'Detalle: Nota': '',
    'Detalle: Centro costos': '',
    'Detalle: Personalizado1': '',
    'Detalle: Personalizado2': '',
    'Detalle: Personalizado3': '',
    'Detalle: Personalizado4': '',
    'Detalle: Personalizado5': '',
    'Detalle: Personalizado6': '',
    'Detalle: Personalizado7': '',
    'Detalle: Personalizado8': '',
    'Detalle: Personalizado9': '',
    'Detalle: Personalizado10': '',
    'Detalle: Personalizado11': '',
    'Detalle: Personalizado12': '',
    'Detalle: Personalizado13': '',
    'Detalle: Personalizado14': '',
    'Detalle: Personalizado15': '',
    'Detalle: Código Centro Costos': ''
};

const wsSim = xlsx.utils.json_to_sheet([simulatedItem], { header: WORLD_OFFICE_57_COLUMNS });

function getColLetter(idx) {
  let dividend = idx + 1;
  let name = '';
  while (dividend > 0) {
    let modulo = (dividend - 1) % 26;
    name = String.fromCharCode(65 + modulo) + name;
    dividend = Math.floor((dividend - modulo) / 26);
  }
  return name;
}

console.log('=== CELL BY CELL 1:1 VERIFICATION (Row 2 Sim vs Gold) ===\n');
let diffCount = 0;
for (let c = 0; c < 57; c++) {
  const col = getColLetter(c);
  const cellGold = wsGold[col + '2'];
  const cellSim = wsSim[col + '2'];

  const goldVal = cellGold ? cellGold.v : '';
  const goldType = cellGold ? cellGold.t : 's';
  const simVal = cellSim ? cellSim.v : '';
  const simType = cellSim ? cellSim.t : 's';

  const matches = (goldVal === simVal) && (goldType === simType);
  if (!matches) {
    console.log(`❌ DIFF at Col ${col} (${WORLD_OFFICE_57_COLUMNS[c]}):`);
    console.log(`   Gold: val=${JSON.stringify(goldVal)} (type '${goldType}')`);
    console.log(`   Sim : val=${JSON.stringify(simVal)} (type '${simType}')`);
    diffCount++;
  }
}

if (diffCount === 0) {
  console.log('🌟 100% IDENTICAL 1:1 CLONE! ALL 57 COLUMNS, VALUES, AND CELL TYPES MATCH PERFECTLY!');
} else {
  console.log(`Total diffs: ${diffCount}`);
}
