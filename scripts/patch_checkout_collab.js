const fs = require('fs');
const file = 'src/app/checkout/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Update discount pct calculation
const oldDiscountCalc = `    // Beneficio Canónico Colaborador FruFresco: 5% de descuento en alimentos frescos (Escenario 229 SDD)
    const collaboratorDiscountAmount = isCollaborator ? Math.round(foodItemsTotalPrice * 0.05) : 0;`;

const newDiscountCalc = `    // Beneficio Canónico Colaborador FruFresco: 5% base + 5% adicional por pago en efectivo contra entrega (Escenarios 228 y 229 SDD)
    const collaboratorDiscountPct = isCollaborator ? (paymentMethod === 'contra_entrega' ? 10 : 5) : 0;
    const collaboratorDiscountAmount = isCollaborator ? Math.round(foodItemsTotalPrice * (collaboratorDiscountPct / 100)) : 0;`;

if (!content.includes(oldDiscountCalc)) {
  // Try CRLF
  const oldDiscountCalcCRLF = oldDiscountCalc.replace(/\n/g, '\r\n');
  const newDiscountCalcCRLF = newDiscountCalc.replace(/\n/g, '\r\n');
  if (content.includes(oldDiscountCalcCRLF)) {
    content = content.replace(oldDiscountCalcCRLF, newDiscountCalcCRLF);
    console.log('Replaced discount calc (CRLF)');
  } else {
    console.error('Could not find oldDiscountCalc');
    process.exit(1);
  }
} else {
  content = content.replace(oldDiscountCalc, newDiscountCalc);
  console.log('Replaced discount calc (LF)');
}

// 2. Update special_notes and logistics_data in orderDataToInsert
const oldSpecialNotes = `special_notes: \`\${paymentMethod === 'payroll_deduction' ? '[NO COBRAR EN PUERTA — VENTA EMPLEADO DEDUCCIÓN NÓMINA PRE-AUTORIZADA]\\n' : ''}\${clientNotesHeader}\${deliveryNoteTag}\${packagingNoteTag}\\n[ORIGIN: web]\${isCollaborator ? \`\\n[COLABORADOR FRUFRESCO: \${collaboratorInfo?.contact_name || name} (Doc: \${collaboratorInfo?.document_id || finalIdentification}) - Beneficio 5% Descuento Aplicado]\` : ''}\${specialNotes ? \`\\n[RECOMENDACIÓN / NOTA DE ENTREGA: \${specialNotes}]\` : ''}\``;

const newSpecialNotes = `special_notes: \`\${paymentMethod === 'payroll_deduction' ? '[NO COBRAR EN PUERTA — VENTA EMPLEADO DEDUCCIÓN NÓMINA PRE-AUTORIZADA]\\n' : ''}\${clientNotesHeader}\${deliveryNoteTag}\${packagingNoteTag}\\n[ORIGIN: web]\${isCollaborator ? \`\\n[COLABORADOR FRUFRESCO: \${collaboratorInfo?.contact_name || name} (Doc: \${collaboratorInfo?.document_id || finalIdentification}) - Beneficio \${collaboratorDiscountPct}% Descuento Aplicado\${paymentMethod === 'contra_entrega' ? ' (5% Base + 5% Efectivo)' : ' (Nómina)'}]\` : ''}\${specialNotes ? \`\\n[RECOMENDACIÓN / NOTA DE ENTREGA: \${specialNotes}]\` : ''}\``;

if (content.includes(oldSpecialNotes)) {
  content = content.replace(oldSpecialNotes, newSpecialNotes);
  console.log('Replaced special notes (LF)');
} else if (content.includes(oldSpecialNotes.replace(/\n/g, '\r\n'))) {
  content = content.replace(oldSpecialNotes.replace(/\n/g, '\r\n'), newSpecialNotes.replace(/\n/g, '\r\n'));
  console.log('Replaced special notes (CRLF)');
} else {
  console.warn('Could not find oldSpecialNotes exactly, doing regex replace');
  content = content.replace(
    /special_notes:\s*`\$\{paymentMethod === 'payroll_deduction'[\s\S]*?ORIGIN: web\]\$\{isCollaborator \? `\\n\[COLABORADOR FRUFRESCO:.*?Beneficio 5% Descuento Aplicado\]` : ''\}\$\{specialNotes \? `\\n\[RECOMENDACIÓN \/ NOTA DE ENTREGA: \$\{specialNotes\}\]` : ''\}`/,
    newSpecialNotes
  );
}

// 3. Update Collaborator Badge
content = content.replace(
  /<strong>5% de descuento directo<\/strong> aplicado en tus alimentos/,
  '<strong>{collaboratorDiscountPct}% de descuento directo</strong> aplicado en tus alimentos{paymentMethod === "contra_entrega" ? " (5% Base + 5% Efectivo)" : ""}'
);

content = content.replace(
  /<span style=\{\{\s*backgroundColor: '#059669',\s*color: '#FFFFFF',\s*fontSize: '0.68rem',\s*fontWeight: '900',\s*padding: '2px 8px',\s*borderRadius: '6px',\s*letterSpacing: '0.03em'\s*\}\}>\s*-5% DTO\s*<\/span>/,
  `<span style={{ backgroundColor: '#059669', color: '#FFFFFF', fontSize: '0.68rem', fontWeight: '900', padding: '2px 8px', borderRadius: '6px', letterSpacing: '0.03em' }}>-{collaboratorDiscountPct}% DTO</span>`
);

// 4. Update Summary Descuento Colaborador (5%) -> (collaboratorDiscountPct%)
content = content.replace(
  /\{locale === 'es' \? 'Descuento Colaborador \(5%\)' : 'Employee Discount \(5%\)'\}/g,
  `{locale === 'es' ? \`Descuento Colaborador (\${collaboratorDiscountPct}%)\` : \`Employee Discount (\${collaboratorDiscountPct}%)\`}`
);

// 5. Update Cash on delivery description for collaborators
content = content.replace(
  /: \(locale === 'es' \? 'Pagas en efectivo o transferencia al recibir en puerta\.' : 'Pay on delivery\.'\)\}/,
  `: isCollaborator ? (locale === 'es' ? '¡Pagas en efectivo al recibir y obtienes +5% de descuento adicional (10% total)!' : 'Pay cash on delivery and get +5% additional discount (10% total)!') : (locale === 'es' ? 'Pagas en efectivo o transferencia al recibir en puerta.' : 'Pay on delivery.')}`
);

fs.writeFileSync(file, content, 'utf8');
console.log('Successfully updated checkout/page.tsx');
