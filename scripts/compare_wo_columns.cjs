const fs = require('fs');
const xlsx = require('xlsx');

const filePath = 'C:/Users/German Higuera/OneDrive/Desktop/Solicitudes frufresco/Acuerdos octubre/Adicionales/WorldOffice_Pedidos_2026-10-22_67_pedidos (8).xlsx';
const wb = xlsx.readFile(filePath);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(ws, { header: 1 });
const goldHeaders = rows[0];

// Read src/lib/worldOfficeExport.ts
const code = fs.readFileSync('src/lib/worldOfficeExport.ts', 'utf8');
const match = code.match(/export const WORLD_OFFICE_57_COLUMNS = \[([\s\S]*?)\] as const;/);
if (!match) {
  console.error('Could not find WORLD_OFFICE_57_COLUMNS');
  process.exit(1);
}

const codeColumns = match[1]
  .split('\n')
  .map(l => l.trim().replace(/^['"]|['"],?$/g, ''))
  .filter(l => l.length > 0);

console.log(`Gold columns count: ${goldHeaders.length}`);
console.log(`Code columns count: ${codeColumns.length}`);

let mismatches = 0;
for (let i = 0; i < Math.max(goldHeaders.length, codeColumns.length); i++) {
  const g = goldHeaders[i];
  const c = codeColumns[i];
  if (g !== c) {
    console.log(`MISMATCH at index ${i}: Gold="${g}" vs Code="${c}"`);
    mismatches++;
  }
}

if (mismatches === 0) {
  console.log('✅ ALL 57 COLUMN HEADERS MATCH EXACTLY CHARACTER BY CHARACTER!');
} else {
  console.log(`❌ Found ${mismatches} header mismatches!`);
}

// Compare 10 sample rows from Gold to check types and formatting
console.log('\n--- DETAILED COMPARISON OF POPULATED COLUMNS ---');
const colAnalysis = [];
for (let c = 0; c < 57; c++) {
  const gHeader = goldHeaders[c];
  const distinctVals = new Set();
  const distinctTypes = new Set();
  for (let r = 1; r < rows.length; r++) {
    const val = rows[r][c];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      distinctVals.add(val);
      distinctTypes.add(typeof val);
    }
  }
  colAnalysis.push({
    index: c,
    header: gHeader,
    populated: distinctVals.size > 0,
    types: Array.from(distinctTypes),
    sampleCount: distinctVals.size,
    samples: Array.from(distinctVals).slice(0, 3)
  });
}

colAnalysis.forEach(col => {
  if (col.populated) {
    console.log(`[Col ${col.index}] ${col.header}`);
    console.log(`   Type: ${col.types.join(', ')} | Distinct: ${col.sampleCount} | Samples: ${JSON.stringify(col.samples)}`);
  } else {
    console.log(`[Col ${col.index}] ${col.header} -> ALWAYS EMPTY ("")`);
  }
});
