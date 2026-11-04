const fs = require('fs');
let spec = fs.readFileSync('SPEC.md', 'utf8');

// Update header
spec = spec.replace(
  /> \*\*Versión:\*\* 1\.9\.343[^\n]*/,
  '> **Versión:** 1.9.344 (Capítulo 45: Aislamiento Asimétrico en Denegación Jerárquica RBAC — 76/76 Pantallas Certificadas)'
);
spec = spec.replace(
  /360 Escenarios BDD Ininterrumpidos \(1\.\.360\)/g,
  '361 Escenarios BDD Ininterrumpidos (1..361)'
);

const scenario361 = `

### Escenario 361: Aislamiento Asimétrico en Denegación Jerárquica RBAC y Erradicación del Bloqueo Colateral de Módulos Padres por Denegación de Submódulos Hijos (\`authContext.tsx\`, \`auth.ts\`) (SDD v1.9.344)

#### 1. Contexto y Justificación del Gemba
En el marco de la operación comercial y de cartera, el usuario Nicolás Álvarez (\`gestion.cartera@frufresco.com\`, rol \`LIDER DE CARTERA\`) reportó que la barra de navegación del sistema le ocultaba por completo el acceso al área Comercial (\`/admin/commercial\`), a pesar de tener explícitamente configurados permisos de acceso comercial (\`+admin.commercial\`, \`+admin.commercial.quotes\`, \`+admin.commercial.billing\`).
Al auditar forensemente el motor de permisos RBAC (\`src/lib/authContext.tsx\` y \`src/lib/auth.ts\`), se descubrió un defecto crítico de inversión lógica en la función de evaluación jerárquica (\`matches\`):
* El perfil del usuario incluía la regla de denegación específica \`-admin.commercial.inventory\` (para impedir que el líder de cartera accediera a la toma física de inventario).
* La función \`matches\` contenía la evaluación bidireccional: \`if (cleanRule.startsWith(target + '.') || cleanRule.startsWith(target + ':')) return true;\`.
* Al consultar la barra de navegación si el usuario tenía acceso al módulo contenedor padre (\`target = 'admin.commercial'\`), la regla de denegación (\`cleanRule = 'admin.commercial.inventory'\`) evaluaba \`cleanRule.startsWith('admin.commercial.')\` como verdadero (\`true\`).
* Como resultado colateral, el evaluador interpretaba que denegar el submódulo hijo (Inventario) implicaba **denegar todo el módulo padre contenedor (Comercial)**, bloqueando el acceso legítimo a Cotizaciones, Facturación y Cartera.

#### 2. Especificación Técnica y Contrato Canónico
1. **Asimetría Estricta entre Denegaciones (\`hasDeny\`) y Permisiones (\`hasAllow\`):**
   - **Regla de Denegación (Descendente Estricta):** Un permiso denegado (\`-\`) solo puede propagarse hacia abajo (de padre a hijos). Una regla \`-admin.commercial\` deniega \`admin.commercial.billing\`, pero una regla \`-admin.commercial.inventory\` **NUNCA** puede denegar al padre contenedor \`admin.commercial\`. Se erradica la coincidencia hijo-a-padre dentro de \`matches\`.
   - **Regla de Permisión (Ascendente para Contenedores):** Si un usuario tiene permiso sobre un hijo (\`+admin.commercial.billing\`), el sistema le permite ver el contenedor padre (\`admin.commercial\`) en el menú de navegación para poder acceder a su submódulo autorizado (\`cleanP.startsWith(target + '.')\`).
2. **Sincronización Cliente-Servidor:**
   - Aplicado en el motor de frontend (\`src/lib/authContext.tsx\`, función \`checkUserPermission\`).
   - Aplicado en el motor de backend (\`src/lib/auth.ts\`, función \`checkUserPermissionBackend\`).

#### 3. Evidencias y Pruebas Automatizadas
* **Matriz de Pruebas Unitarias:** Ejecución de pruebas con perfiles reales de Supabase confirmando:
  - \`check('admin.commercial')\` $\rightarrow$ \`true\`.
  - \`check('admin.commercial.billing')\` $\rightarrow$ \`true\`.
  - \`check('admin.commercial.inventory')\` $\rightarrow$ \`false\`.
  - \`check('admin.commercial.inventory.counts')\` $\rightarrow$ \`false\`.
* **TypeScript Compilation:** \`tsc --noEmit\` con código de salida \`0\` (cero errores en todo el proyecto).
`;

spec += scenario361;
fs.writeFileSync('SPEC.md', spec, 'utf8');
console.log('SPEC.md updated with Escenario 361');
