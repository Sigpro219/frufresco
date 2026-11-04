const fs = require('fs');

const path = 'C:/Users/German Higuera/OneDrive/Documentos/Projects/frufresco/SPEC.md';
let spec = fs.readFileSync(path, 'utf8');

// 1. Update Header
spec = spec.replace(
  /> \*\*Versión:\*\* 1\.9\.339 \(.*?\)/,
  '> **Versión:** 1.9.340 (Capítulo 44: Compuerta Poka-Yoke Estricta y Emergencia Condicional del Botón de Avance en Asistente de Despacho Manual — 76/76 Pantallas Certificadas)'
);

spec = spec.replace(
  /> \*\*Cobertura Canónica:\*\* 10 Dominios, 76 Pantallas Físicas, 44 Capítulos Arquitectónicos, 356 Escenarios BDD Ininterrumpidos \(1\.\.356\)/,
  '> **Cobertura Canónica:** 10 Dominios, 76 Pantallas Físicas, 44 Capítulos Arquitectónicos, 357 Escenarios BDD Ininterrumpidos (1..357)'
);

// 2. Append Escenario 357
const escenario357 = `
---

### Escenario 357: Compuerta Poka-Yoke Estricta y Emergencia Condicional de Botones de Avance en el Asistente Guiado de Despacho Manual (\`ManualDispatchWizardModal.tsx\`) (SDD v1.9.340)
- **Given** el flujo secuencial de 4 estaciones del **Asistente Guiado de Despacho Manual (BCP) [Flujo Poka-Yoke]** (\`/admin/orders/loading\`, \`src/components/ManualDispatchWizardModal.tsx\`),
- **When** el operario se encuentra en cualquiera de los pasos operativos del asistente (Paso 1: *Espacios & Bahías*, Paso 2: *Compras & Recibo*, Paso 3: *Remisiones & Manifiesto*, Paso 4: *Rótulos Térmicos*):
- **Then** el sistema impone la compuerta de verificación física innegociable antes de habilitar el avance de la tanda:
  1. **Erradicación de Fugas Lógicas y Avances Prematuros:**
     - Se elimina la condición permisiva del Paso 1 (\`assignedCount === 0\`) que permitía avanzar automáticamente sin marcar la casilla cuando los pedidos ya tenían bahías asignadas en base de datos.
     - En los Pasos 2 y 3 se erradica el auto-marcado encubierto por clic simple en el botón de navegación.
  2. **Emergencia Condicional Estricta del Botón de Avance:**
     - En las cuatro estaciones del asistente, el botón de avance (\`Continuar a...\` o \`FINALIZAR Y ENVIAR A PROCESO LOGÍSTICO\`) **permanece completamente oculto y no se renderiza** mientras la casilla de confirmación física obligatoria esté desmarcada (\`!stepConfirmed\`).
     - En su lugar, el pie de página proyecta una píldora informativa de guía visual: \`[ℹ️ Marca la casilla para habilitar el avance]\`.
  3. **Activación Reactiva Poka-Yoke:**
     - Tan pronto el operario marca físicamente la casilla de verificación tras constatar la emisión de documentos de planta (Sábana de alistamiento en Paso 1, planillas de plaza en Paso 2, remisiones/manifiesto en Paso 3 o rótulos térmicos en Paso 4), el botón de avance emerge al instante con animación suave, permitiendo una transición consciente, deliberada y libre de errores operativos humanos en la nave de alistamiento.
`;

if (!spec.includes('Escenario 357')) {
  spec = spec.trimEnd() + '\n' + escenario357;
  fs.writeFileSync(path, spec, 'utf8');
  console.log('Appended Escenario 357 and updated header to v1.9.340 successfully');
} else {
  console.log('SPEC.md already contains Escenario 357');
}
