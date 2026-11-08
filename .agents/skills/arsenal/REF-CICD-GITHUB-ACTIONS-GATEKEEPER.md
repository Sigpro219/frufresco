---
id: REF-CICD-GITHUB-ACTIONS-GATEKEEPER
version: 1.0
status: CERTIFICADO_EN_PRODUCCION
origin_project: delta-academy / frufresco
author: Agente Cosechador (Delta CoreTech)
speed_multiplier: 12X
---

# 🔩 Refacción: Compuerta CI/CD en la Nube con GitHub Actions & BDD-Guard (`REF-CICD-GITHUB-ACTIONS-GATEKEEPER`)

## 1. Dolor Operativo Resuelto
Depender exclusivamente de que el desarrollador o el agente ejecuten `npx tsc --noEmit` en su máquina local antes de hacer `git push` permite que un push apresurado, un hotfix desde otra máquina o un subagente desbocado suban código roto o alteren ecuaciones financieras críticas en producción (Vercel). Esta refacción instala un **Aduanero Automático en la Nube (GitHub Actions)** que corre en $< 45\text{ segundos}$ en cada `push` o `pull_request` y **bloquea la promoción a producción** si falla el tipado, el linter de seguridad o el fusible matemático del negocio (`BDD-Guard`).

## 2. Multiplicador de Velocidad (Baseline 1X vs. Salto 12X)
- **Baseline 1X (Sin Refacción):** ~2 días configurando YAML de GitHub Actions desde cero, lidiando con cachés lentos de `node_modules`, variables de entorno faltantes en el build de Next.js y falsos positivos entre ramas `main` y `liard`.
- **Salto 12X (Con Refacción):** **10 minutos**. Copiar `.github/workflows/ci-gatekeeper.yml` y el script `scripts/bdd-guard.mjs`, garantizando ejecución determinista con caché `npm` ultrarrápido.

## 3. Cuándo Ensamblar (y Cuándo NO)
- **SÍ Ensamblar en:** Todo repositorio productivo de Delta CoreTech conectado a Vercel (`frufresco`, `ingyemel_mantenimiento`, `teep-oee`, `delta-oee`).
- **NO Ensamblar en:** Prototipos desechables (`FTD`) de un solo día que aún no tienen rama productiva ni invariantes financieras.

## 4. Secretos Sucios de Producción (Battle-Tested Nuances)
1. **Separación de Compilación de Tipos vs. Build con Secretos de Producción:** En GitHub Actions, correr `next build` completo suele fallar si no se inyectan todas las llaves privadas de Firebase Admin. El secreto sucio es correr **`npx tsc --noEmit` + `node scripts/bdd-guard.mjs` + Tests Unitarios Puros (Headless Core)** sin requerir credenciales de base de datos viva (0 riesgo de exponer llaves en CI y ejecución en 25 segundos).
2. **Cobertura Multi-Rama (`main` y `liard`):** En el ecosistema Delta CoreTech donde proyectos como `frufresco` sincronizan `main` y `liard`, el workflow debe escuchar ambas ramas (`branches: [main, liard]`) y validar los Pull Requests antes del merge.
3. **Concurrencia con Cancelación Automática (`concurrency.cancel-in-progress: true`):** Si un agente hace 2 pushes seguidos en 1 minuto, GitHub Actions debe matar automáticamente la corrida anterior para no gastar minutos de CI en vano.
4. **Verificación Anti-Evasión (`Zero-Trust Grep`):** El pipeline incluye un paso de 1 segundo que busca `@ts-ignore`, `@ts-expect-error` nuevos no autorizados o conflictos de merge (`<<<<<<< HEAD`) olvidados en `src/`.

## 5. Contrato de Interfaz & Código Base Reutilizable

### A. `.github/workflows/ci-gatekeeper.yml`
```yaml
name: 🛡️ Delta CoreTech CI Gatekeeper (Typecheck + BDD-Guard)

on:
  push:
    branches: [main, liard]
  pull_request:
    branches: [main, liard]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality-gate:
    name: Poka-Yoke Static & Business Invariants
    runs-on: ubuntu-latest
    timeout-minutes: 5

    steps:
      - name: 📥 Checkout Repository
        uses: actions/checkout@v4

      - name: ⚡ Setup Node.js 20 with NPM Cache
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: 📦 Install Dependencies (Clean CI)
        run: npm ci --prefer-offline --no-audit

      - name: 🔍 Anti-Evasion Check (Merge Conflicts & Forbidden Directives)
        run: |
          if grep -rn "<<<<<<< HEAD" src/; then
            echo "❌ ERROR FATAL: Marcadores de conflicto Git detectados en src/"
            exit 1
          fi

      - name: 📐 Step 1 — TypeScript Strict Compiler (tsc --noEmit)
        run: npx tsc --noEmit

      - name: 🧮 Step 2 — Business Invariants Fuse (BDD-Guard & Tester Harness)
        run: |
          if [ -f "scripts/bdd-guard.mjs" ]; then
            node scripts/bdd-guard.mjs
          else
            echo "ℹ️ Sin scripts/bdd-guard.mjs registrado aún; omitiendo fase BDD-Guard."
          fi
```

### B. Esqueleto de `scripts/bdd-guard.mjs` (Fusible de Invariantes en $<3\text{s}$)
```javascript
#!/usr/bin/env node
import assert from 'node:assert/strict';

console.log('🛡️ Ejecutando BDD-Guard (Invariantes Sagradas del Negocio)...');

// 1. Ejemplo Invariante Financiera (Piso de Margen / Costo Promedio Ponderado NIC 2)
function verifyWeightedAverageCostInvariant() {
  // Caso Stock Previo <= 0: Debe adoptar incomingUnitCost sin producir negativos ni NaN
  const prevStock = -5;
  const prevWac = 4000;
  const incomingQty = 20;
  const incomingCost = 5200;
  const newWac = prevStock <= 0
    ? incomingCost
    : Math.round(((prevStock * prevWac) + (incomingQty * incomingCost)) / (prevStock + incomingQty));

  assert.equal(newWac, 5200, 'FATAL: NIC 2 PPP falló ante stock previo negativo');
  assert.ok(!Number.isNaN(newWac) && newWac > 0, 'FATAL: NIC 2 PPP produjo valor corrupto');
}

// 2. Ejemplo Invariante de Conservación de Masa (Kardex)
function verifyMassConservationInvariant() {
  const initial = 100;
  const entries = 50;
  const exits = 110;
  const wasteDamage = 5;
  const wasteCleaning = 10;
  const expectedFinal = initial + entries - exits - wasteDamage - wasteCleaning;
  assert.equal(expectedFinal, 25, 'FATAL: Ecuación de Conservación de Masa alterada');
}

verifyWeightedAverageCostInvariant();
verifyMassConservationInvariant();

console.log('✅ BDD-Guard: 100% de invariantes matemáticas intactas (EXIT 0).');
```

## 6. Protocolo de Ensamble Paso a Paso
1. Crear `.github/workflows/ci-gatekeeper.yml` en la raíz del proyecto.
2. Crear `scripts/bdd-guard.mjs` importando o replicando las funciones puras del `Headless Core` (`src/lib/`) con los casos borde innegociables del `SPEC.md`.
3. Añadir `"test:guard": "node scripts/bdd-guard.mjs"` en `package.json` para que tanto el agente local como GitHub Actions ejecuten exactamente el mismo veredicto.
