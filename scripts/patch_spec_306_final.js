const fs = require('fs');
let spec = fs.readFileSync('SPEC.md', 'utf8');

// Update header version
spec = spec.replace(
  /> \*\*Versión:\*\* 1\.9\.287 [^\n]+/,
  '> **Versión:** 1.9.288 (Certificación Plena de Acuerdos Comerciales B2B — Revisión Acuerdo 1: 8/8 Hallazgos Certificados, Poka-Yoke Anti-Colisión, Higiene de BD y Consecutivo World Office — 76/76 Pantallas Certificadas)'
);

// Update Escenario 306 title
const oldTarget = '### Escenario 306: Blindaje de Acuerdos Comerciales B2B: Control de Cobertura, Revocación Quirúrgica con Liberación de Unicidad y Resolución Fluida de Ingesta Excel (Gemba Hallazgos Acuerdos: Items 1 al 3) (SDD v1.9.284)';
const newTitle = '### Escenario 306: Blindaje Integral de Acuerdos Comerciales B2B: Control de Cobertura, Revocación Quirúrgica con Liberación de Unicidad, Poka-Yoke Anti-Colisión, Ley Marcial Anti-Legacy, Creación Rápida con Consecutivo Determinístico World Office y Saneamiento de Base de Datos (Gemba Hallazgos Revisión Acuerdo 1: Items 1 al 8) (SDD v1.9.288)';

spec = spec.replace(oldTarget, newTitle);

spec = spec.replace(
  '- **Then** el sistema ratifica los siguientes cuatro (4) estándares arquitectónicos:',
  '- **Then** el sistema ratifica los siguientes ocho (8) estándares arquitectónicos e integrales de Acuerdos Comerciales B2B (`RevisiB3n_Acuerdo1.docx`):'
);

const item8 = `  8. **Saneamiento e Higiene de Acuerdos Históricos en Producción (Hallazgo 8 - SDD v1.9.288):**
     - Se ejecuta la depuración y blindaje de acuerdos obsoletos y pruebas piloto residuales en la tabla \`quotes\`, asegurando que únicamente existan acuerdos en estado \`agreement\` para clientes activos de operación real.
     - Todo acuerdo superado o de prueba transiciona formalmente a \`superseded\` o \`cancelled\`, preservando la integridad referencial histórica para auditoría contable y garantizando que los tableros de control y selectores reflejen exactamente la realidad operativa sin confusión para el equipo comercial.
`;

if (!spec.includes('Saneamiento e Higiene de Acuerdos Históricos en Producción (Hallazgo 8')) {
  spec = spec.trimEnd() + '\n' + item8;
}

fs.writeFileSync('SPEC.md', spec, 'utf8');
console.log('SPEC.md successfully updated to v1.9.288');
