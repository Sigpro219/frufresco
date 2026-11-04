const fs = require('fs');

const path = 'C:/Users/German Higuera/OneDrive/Documentos/Projects/frufresco/SPEC.md';
let spec = fs.readFileSync(path, 'utf8');

// 1. Update Header
spec = spec.replace(
  /> \*\*Versión:\*\* 1\.9\.337 \(.*?\)/,
  '> **Versión:** 1.9.338 (Capítulo 44: Reacomodación Contigua en Cascada de Bahías de Suelo y Erradicación de Agujeros Vacíos en Cross-Docking Nocturno — 76/76 Pantallas Certificadas)'
);

spec = spec.replace(
  /> \*\*Cobertura Canónica:\*\* 10 Dominios, 76 Pantallas Físicas, 44 Capítulos Arquitectónicos, 354 Escenarios BDD Ininterrumpidos \(1\.\.354\)/,
  '> **Cobertura Canónica:** 10 Dominios, 76 Pantallas Físicas, 44 Capítulos Arquitectónicos, 355 Escenarios BDD Ininterrumpidos (1..355)'
);

// 2. Append Escenario 355
const escenario355 = `
---

### Escenario 355: Reacomodación Contigua en Cascada de Bahías de Suelo (\`adjustSpacesWithCascadingShift\`) y Erradicación de Agujeros Vacíos en Cross-Docking Nocturno (\`/admin/logistics/staging-spaces\`) (SDD v1.9.338)
- **Given** el **Centro de Mando de Espacios & Bahías en Suelo (1 a 150)** (\`/admin/logistics/staging-spaces\`, \`src/components/StagingSpacesManagement.tsx\`) y el motor de asignación (\`src/lib/stagingSpaceAllocator.ts\`),
- **When** un operador ajusta individualmente el número de bahías requeridas para un pedido mediante la acción reactiva **\`[Ajustar a N]\`** tras una variación de cubicaje o corrección de parámetros:
- **Then** el sistema erradica la fragmentación del suelo de bodega y garantiza la contigüidad física absoluta del cross-docking:
  1. **Compactación en Cascada ante Reducción de Bahías (\`diff < 0\`, sobra espacio):**
     - Al reducir bahías (ejemplo: de 2 a 1 en clientes como *Aldimark* o *Policía Nacional*, o de 3 a 2 en *Colsubsidio Catering*), el sistema conserva los primeros \`targetSpaces\` del pedido y libera los slots excedentes finales (\`freed\`).
     - En lugar de dejar los slots liberados como espacios vacíos (\`Libre\`) en medio del clúster de cargue, la función canónica \`adjustSpacesWithCascadingShift\` toma automáticamente **todas las órdenes con bahías posteriores (\`slots >= minFreed\`) y las desplaza hacia abajo en \`freedCount\` posiciones (\`slot - freedCount\`)**, sellando de inmediato la brecha de forma compacta y continua.
  2. **Apertura de Hueco Contiguo ante Expansión de Bahías (\`diff > 0\`, falta espacio):**
     - Al ampliar bahías (ejemplo: cuando un cliente aumenta su volumen y pasa de 1 a 2 espacios), el sistema identifica el slot superior actual del pedido (\`maxAssigned\`) y **desplaza primero hacia arriba todas las órdenes posteriores (\`slot + expandCount\`)**, abriendo el espacio contiguo necesario sin generar colisiones ni sobreescrituras en la cuadrícula de 150 bahías.
     - Acto seguido, el pedido incorpora sus nuevos slots contiguos (\`maxAssigned + 1..N\`).
  3. **Preservación de Pedidos No Afectados y Asignación de Huérfanos:**
     - Todas las órdenes ubicadas antes del punto de corte permanecen inmunes e inalteradas.
     - Si un pedido no poseía bahías previas (\`S/A\`), se ubica automáticamente al final del último slot ocupado (\`maxOccupied + 1..N\`).
`;

if (!spec.includes('Escenario 355')) {
  spec = spec.trimEnd() + '\n' + escenario355;
  fs.writeFileSync(path, spec, 'utf8');
  console.log('Appended Escenario 355 and updated header to v1.9.338 successfully');
} else {
  console.log('SPEC.md already contains Escenario 355');
}
