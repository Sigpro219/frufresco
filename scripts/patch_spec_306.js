const fs = require('fs');
const path = require('path');

const specPath = path.join('C:', 'Users', 'German Higuera', 'OneDrive', 'Documentos', 'Projects', 'frufresco', 'SPEC.md');
let content = fs.readFileSync(specPath, 'utf8');

// Update header version
content = content.replace(
    /> \*\*Versión:\*\* 1\.9\.283 .*/,
    `> **Versión:** 1.9.284 (Blindaje de Acuerdos Comerciales B2B: Control de Cobertura, Revocación Poka-Yoke, Ordenamiento Multicolumna y Resolución Fluida de Ingesta Excel — 76/76 Pantallas Certificadas)`
);

// Update coverage line
content = content.replace(
    /43 Capítulos Arquitectónicos, 305 Escenarios BDD Ininterrumpidos \(1\.\.305\)/,
    `43 Capítulos Arquitectónicos, 306 Escenarios BDD Ininterrumpidos (1..306)`
);

// Update Domain D7 scenarios
content = content.replace(
    /Escenarios 69, 136 a 140, 142 a 145, 206 a 207, 227, 230 a 234, 237, 245, 251, 252, 253, 254, 261, 264, 265, 266, 268, 269, 270, 271, 274, 275, 276, 277, 301 \(§7\.1 - §7\.19\)/,
    `Escenarios 69, 136 a 140, 142 a 145, 206 a 207, 227, 230 a 234, 237, 245, 251, 252, 253, 254, 261, 264, 265, 266, 268, 269, 270, 271, 274, 275, 276, 277, 301, 306 (§7.1 - §7.20)`
);

const escenario306Text = `

---

### Escenario 306: Blindaje de Acuerdos Comerciales B2B: Control de Cobertura, Revocación Quirúrgica con Liberación de Unicidad y Resolución Fluida de Ingesta Excel (Gemba Hallazgos Acuerdos: Items 1 al 3) (SDD v1.9.284)
- **Given** el módulo de Acuerdos Comerciales Institucionales (\`CommercialAgreementsModule.tsx\`) en \`/admin/commercial?tab=clients&clientTab=agreements\`,
- **When** la mesa comercial audita la cobertura de contratos tarifarios, revoca acuerdos caducos o carga listas masivas de precios desde archivos Excel,
- **Then** el sistema ratifica los siguientes cuatro (4) estándares arquitectónicos:
  1. **Ordenamiento Multicolumna en Drawer de Detalle Tarifario (Hallazgo 1):**
     - Los encabezados de la tabla de precios acordados (\`Producto\`, \`Precio Acordado\`, \`Margen %\`, \`Fecha Vigencia\`, \`ID Contable\`) disponen de flechas interactivas de ordenamiento bidireccional (\`ChevronUp\`, \`ChevronDown\`, \`ChevronsUpDown\`) con ordenamiento tipado (alfabético, numérico y cronológico).
  2. **Tarjeta de Control de Clientes Sin Acuerdo Activo (Hallazgo 2 - Parte A):**
     - Se incorpora una cuarta tarjeta ejecutiva en el resumen de métricas: **"SIN ACUERDO"** (\`textColor="#1D4ED8"\`), contabilizando en tiempo real aquellos clientes institucionales (\`role = 'b2b_client'\`) que no poseen acuerdo directo, ni acuerdo heredado por casa matriz, ni vinculación compartida en \`app_settings\`.
     - Al interactuar con la tarjeta o la píldora colapsada de telemetría, se despliega el modal interactivo \`ClientsWithoutAgreementModal\` con buscador predictivo por razón social o NIT, identificador visual de sede y botón directo \`+ Crear Acuerdo\` con preselección automática del cliente.
  3. **Revocación Quirúrgica de Acuerdos Comerciales (Hallazgo 2 - Parte B):**
     - En la columna de acciones de la galería principal de acuerdos, se incorpora la acción de revocación (\`Trash2\` rojo) protegida por un modal Poka-Yoke (\`RevokeAgreementModal\`).
     - Al confirmar la revocación, el estado de la cotización/acuerdo transiciona a \`status = 'cancelled'\`. Esta mutación libera de forma atómica el índice parcial de unicidad en PostgreSQL (\`idx_single_active_agreement_per_client\` sobre \`quotes (client_id) WHERE status = 'agreement'\`), permitiendo crear o asociar un nuevo acuerdo al cliente sin colisión y preservando la integridad referencial histórica de los pedidos previos.
  4. **Resolución Fluida y Descarte Masivo en Carga de Precios Excel (Hallazgo 3):**
     - Se erradica el bloqueo ciego del botón inferior cuando existen productos sin coincidencia de catálogo (\`unmatchedCount > 0\`).
     - **Acción en Masa:** En el banner rojo Poka-Yoke superior y barra de herramientas se habilita el botón \`[Descartar todos los sin coincidencia ({unmatchedCount})]\` (\`handleDiscardAllUnmatched\`), purgando en un solo clic las filas no comerciales, notas o encabezados residuales y dejando el acuerdo listo para activar de inmediato.
     - **Papelera por Fila Robusta:** En la columna \`Acción\`, la papelera individual cuenta con contención de eventos (\`e.stopPropagation()\`), limpieza reactiva del buscador de celda (\`activeCellSearchRowIdx = null\`) y confirmación por toast informativo.
     - **Botón Inferior Interactivo (\`UnmatchedResolutionModal\`):** El botón de pie de formulario se mantiene interactivo mostrando \`AlertCircle\` \`{unmatchedCount} Sin Coincidencia — Resolver para Activar\`. Al pulsarlo, abre un diálogo modal de decisión rápida con dos caminos:
       - *Opción Primaria (Verde):* Descartar los {unmatchedCount} no coincidentes y formalizar el acuerdo con los {matchedCount} SKUs válidos inmediatamente.
       - *Opción Secundaria (Azul):* Filtrar la tabla de trabajo en los ítems sin coincidencia para su búsqueda o creación manual fila por fila.
`;

content += escenario306Text;
fs.writeFileSync(specPath, content, 'utf8');
console.log('Successfully updated SPEC.md to v1.9.284 (Escenario 306)');
