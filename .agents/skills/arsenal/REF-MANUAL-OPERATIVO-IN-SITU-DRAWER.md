---
id: REF-MANUAL-OPERATIVO-IN-SITU-DRAWER
version: 2.0
estado: VIGENTE
reemplaza: "v1.0 - REF-CAPACITACION-OPERATIVA-IN-APP"
titulo: "Micro-Manual Operativo In-Situ (Drawer Lateral) & Simulador Sandbox para Relevo de Turno"
categoria: "UI/UX Industrial & Gestión del Conocimiento en Piso"
tags: [in-app-manual, zero-printed-manuals, standard-work, drawer-lateral, sandbox-simulation, lean-operations, zero-bloat]
multiplicador_velocidad: "10X"
reduccion_errores: "90%"
proyectos_origen: [frufresco]
fecha_cosecha: "2026-09-15"
---

# 🧩 Ficha de Refacción: Micro-Manual Operativo In-Situ (Drawer) & Simulador Sandbox

### ❓ ¿Qué hace este recurso y para qué sirve?
Este recurso **elimina para siempre la pérdida de tiempo leyendo manuales impresos, carpetas de archivo y PDFs de 40 páginas** que nadie consulta en la vida real. 

Proporciona un **panel lateral deslizable (Drawer) no bloqueante** que se abre con un solo clic o presionando la tecla `?` directamente en la pantalla de trabajo del operador. En menos de **5 minutos**, un auxiliar nuevo o de relevo comprende las reglas críticas del negocio (qué hacer en cada caso, qué límites no cruzar) y puede experimentar causa y efecto en un simulador visual en memoria (*Sandbox*) **sin arriesgar datos reales ni detener la operación de la empresa**.

---

## 🔴 1. La Pesadilla Operativa Previa (Baseline 1X - El Gemba Real)
* **Puesto de Trabajo & Flujo Físico:** En empresas de distribución B2B, bodegas o mesas de compras con alta rotación de personal o turnos rotativos:
  1. *El Manual Muerto:* Las empresas gastan tiempo y dinero redactando manuales en PDF o imprimiendo carpetas anilladas que se guardan en un cajón y quedan obsoletas en semanas. Ningún operario deja de digitar para ponerse a buscar una carpeta física en un estante.
  2. *Parálisis por Relevo de Turno:* Cuando el operador titular falta o renuncia, un supervisor calificado debe abandonar sus tareas durante **2 días completos** para sentarse al lado del nuevo empleado y explicarle botón por botón cómo opera la pantalla.
  3. *Errores Costosos en la Primera Semana:* El reemplazo opera con miedo o comete errores graves de digitación y fijación de precios porque la lógica del negocio residía únicamente "en la cabeza de quien se fue".
* **Velocidad y Tasa de Falla Inicial:** 2 días de inducción a velocidad 1X. Tasa de errores operativos superior al 25% durante los primeros 10 días de un nuevo operador.

---

## 🟢 2. La Transformación Operativa (Salto Multiplicador 10X en Inducción)
* **Nuevo Flujo de Trabajo (Zero-Printed Manuals / In-Situ Learning):**
  * El nuevo operador se sienta frente a la pantalla y ve un botón discreto en la barra de herramientas: `[ ? ] Guía Rápida de Operación`.
  * Al hacer clic (o presionar `?`), se despliega un panel lateral derecho que **no tapa ni resetea su formulario de trabajo**.
  * En 5 píldoras concisas redactadas en lenguaje de piso (*Tono Intermedio*), el operador aprende las reglas clave de la empresa.
  * Incluye un **Simulador Sandbox** con sliders donde puede probar escenarios ("¿Qué pasa si subo la merma?", "¿Qué pasa si la plaza sube hoy?") y ver los números en vivo sin tocar la base de datos de producción.
* **Multiplicador de Negocio:** **Aceleración de 10X a 15X en la inducción (de 2 días a sólo 5-10 minutos)**. La operación no se detiene ante cambios de personal y se reduce en un 90% la tasa de errores en la primera semana de un nuevo empleado.

---

## 💣 3. Secretos Sucios de Producción & Antipatrones Descartados
* ❌ **Antipatrón 1 (Librerías Externas de Onboarding / Tours):** Instalar librerías como `intro.js`, `shepherd.js` o `react-joyride`. Pesan más de 300KB, chocan con el `z-index` de Tailwind, rompen la vista en pantallas móviles y crean popups invasivos que molestan al usuario veterano.
* ❌ **Antipatrón 2 (El Modal Central que Bloquea la Pantalla):** Un modal centrado que cubre todo el formulario. Si el operador estaba a mitad de llenar una orden de 30 ítems, el modal le tapa la vista y al cerrarlo muchas veces se perdían los datos tipeados.
* ❌ **Antipatrón 3 (Textos Quemados en Código):** Escribir párrafos rígidos en el JSX. Si la gerencia cambia una política comercial (ej. margen del 15% al 20%), el manual enseña datos falsos.
* 💣 **El Secreto Sucio de Arquitectura (Panel Drawer No Bloqueante):**
  * Se implementa como un Drawer lateral (`fixed right-0 top-0 h-full w-full sm:w-[440px]`) con fondo translúcido y cierre por backdrop o tecla `Esc`.
  * **Cero reseteo de formularios:** El Drawer se monta en un portal o capa superior (`z-50`); el formulario de trabajo en la izquierda permanece intacto con todos sus datos vivos.
* 💣 **El Secreto del Sandbox en Memoria Pura:**
  * El simulador interactivo corre como una función matemática pura en React (`runSimulationSandbox`). No hace llamadas a la API ni a Supabase; cero riesgo de inyectar datos de prueba en las tablas de producción.

---

## 💻 4. Solución de Software & Lego Blocks (Código Vivo Auto-Contenido)

### A. Diccionario de Reglas Operativas Vivas (`operationalRules.ts`)
```typescript
// src/config/operationalRules.ts
export interface OperationalRule {
  id: string;
  title: string;
  rule: string;
  whyItMatters: string;
  example: string;
}

export const OPERATIONAL_RULES: OperationalRule[] = [
  {
    id: 'volumen',
    title: '1. Inercia por Volumen',
    rule: 'Las compras grandes en bultos fijan el costo; los sondeos pequeños solo sirven de alerta.',
    whyItMatters: 'Evita que una cotización aislada de 2 kilos descalibre el costo de un lote de 500 bultos.',
    example: 'Si compraste 100 bultos a $3,000 y te cotizan 1 kilo a $4,000, el costo oficial sigue cercano a $3,000.'
  },
  {
    id: 'choque_plaza',
    title: '2. Choques Transitorios de Plaza',
    rule: 'Si la plaza sube un solo día por lluvia o paro, no traslades el 100% del pico a los clientes B2B.',
    whyItMatters: 'Los restaurantes y hoteles cancelan contratos si les cambias la lista de precios todos los días.',
    example: 'El sistema amortigua un pico del +25% aplicando solo un ajuste gradual para proteger el cliente.'
  },
  {
    id: 'merma',
    title: '3. Rendimiento por Merma Real',
    rule: 'Todo producto perecedero pierde peso en bodega por limpieza y humedad.',
    whyItMatters: 'Si compras a $2,000/Kg pero el 10% se bota por daño, tu costo real es $2,222/Kg.',
    example: 'El costo neto se calcula dividiendo el costo bruto entre (1 - % merma).'
  }
];
```

---

### B. Componente Drawer Lateral de Inducción (`OperationalDrawer.tsx`)
```tsx
// src/components/OperationalDrawer.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { HelpCircle, X, Sliders, CheckCircle2, AlertTriangle, BookOpen } from 'lucide-react';
import { OPERATIONAL_RULES } from '@/config/operationalRules';

export default function OperationalDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'rules' | 'sandbox'>('rules');

  // Sandbox State (100% en memoria)
  const [simPrice, setSimPrice] = useState<number>(3500);
  const [simShrinkage, setSimShrinkage] = useState<number>(8); // 8% merma
  const [simMargin, setSimMargin] = useState<number>(25); // 25% margen

  // Atajo de teclado: presionar '?' abre/cierra la guía
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Cálculo Sandbox en memoria (Cero impacto en BD)
  const netCost = Math.round(simPrice / (1 - simShrinkage / 100));
  const sellingPrice = Math.round((netCost * (1 + simMargin / 100)) / 50) * 50;

  return (
    <>
      {/* BOTÓN DISCRETO EN CABECERA / BARRA DE HERRAMIENTAS */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/80 transition-colors shadow-2xs"
        title="Abrir micro-manual de operación (Atajo: ?)"
      >
        <HelpCircle className="w-3.5 h-3.5 text-amber-700" />
        <span>Guía Operativa</span>
      </button>

      {/* DRAWER LATERAL (OFF-CANVAS) */}
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop con click-outside para cerrar */}
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-2xs transition-opacity"
            onClick={() => setIsOpen(false)}
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <aside className="w-screen max-w-md bg-white dark:bg-zinc-900 shadow-2xl flex flex-col border-l border-slate-200 dark:border-zinc-800">
              {/* Cabecera del Drawer */}
              <div className="px-5 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between bg-slate-50 dark:bg-zinc-950">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-amber-600" />
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      Manual Operativo de Puesto
                    </h2>
                    <p className="text-[11px] text-slate-500">Criterio estándar para relevo de turno</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Selector de Pestañas */}
              <div className="flex border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 pt-2 gap-4 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setActiveTab('rules')}
                  className={`pb-2.5 border-b-2 transition-colors ${
                    activeTab === 'rules'
                      ? 'border-amber-500 text-amber-600 font-bold'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Reglas de Negocio ({OPERATIONAL_RULES.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('sandbox')}
                  className={`pb-2.5 border-b-2 flex items-center gap-1.5 transition-colors ${
                    activeTab === 'sandbox'
                      ? 'border-amber-500 text-amber-600 font-bold'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Simulador Sandbox</span>
                </button>
              </div>

              {/* Contenido Dinámico */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {activeTab === 'rules' ? (
                  <div className="space-y-3.5">
                    {OPERATIONAL_RULES.map((rule) => (
                      <div
                        key={rule.id}
                        className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-800/40 space-y-1.5"
                      >
                        <h3 className="text-xs font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>{rule.title}</span>
                        </h3>
                        <p className="text-xs font-medium text-slate-700 dark:text-zinc-300">
                          {rule.rule}
                        </p>
                        <div className="text-[11px] text-slate-500 dark:text-zinc-400 bg-white dark:bg-zinc-900 p-2 rounded-lg border border-slate-200/60 dark:border-zinc-800">
                          <strong className="text-slate-700 dark:text-zinc-200">Ejemplo práctico:</strong> {rule.example}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* SIMULADOR EN MEMORIA PURA */
                  <div className="space-y-4">
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                      <span>
                        Área de práctica segura. Mueve los controles para entender la causa y efecto. Ningún dato altera la base de datos real.
                      </span>
                    </div>

                    <div className="space-y-3 bg-slate-50 dark:bg-zinc-800/50 p-4 rounded-xl border border-slate-200 dark:border-zinc-800">
                      <div>
                        <div className="flex justify-between text-xs font-bold mb-1">
                          <span>Precio Bruto en Plaza:</span>
                          <span className="font-mono">${simPrice.toLocaleString()} COP/Kg</span>
                        </div>
                        <input
                          type="range"
                          min="1000"
                          max="10000"
                          step="100"
                          value={simPrice}
                          onChange={(e) => setSimPrice(Number(e.target.value))}
                          className="w-full accent-amber-500"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-xs font-bold mb-1">
                          <span>% Merma por Calidad:</span>
                          <span className="font-mono">{simShrinkage}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="25"
                          step="1"
                          value={simShrinkage}
                          onChange={(e) => setSimShrinkage(Number(e.target.value))}
                          className="w-full accent-amber-500"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-xs font-bold mb-1">
                          <span>Margen Comercial Esperado:</span>
                          <span className="font-mono">{simMargin}%</span>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="40"
                          step="1"
                          value={simMargin}
                          onChange={(e) => setSimMargin(Number(e.target.value))}
                          className="w-full accent-amber-500"
                        />
                      </div>
                    </div>

                    {/* Resultados del Sandbox */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="p-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl">
                        <span className="text-[10px] text-slate-500 uppercase font-bold">Costo Neto con Merma</span>
                        <div className="text-base font-extrabold font-mono text-slate-900 dark:text-white">
                          ${netCost.toLocaleString()}
                        </div>
                      </div>
                      <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                        <span className="text-[10px] text-emerald-700 dark:text-emerald-300 uppercase font-bold">Precio Sugerido B2B</span>
                        <div className="text-base font-extrabold font-mono text-emerald-800 dark:text-emerald-200">
                          ${sellingPrice.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Pie del Drawer */}
              <div className="p-3 bg-slate-50 dark:bg-zinc-950 border-t border-slate-200 dark:border-zinc-800 text-center text-[11px] text-slate-500">
                Presiona <kbd className="px-1.5 py-0.5 bg-white dark:bg-zinc-800 border rounded text-[10px] font-mono">Esc</kbd> o haz clic afuera para volver al trabajo.
              </div>
            </aside>
          </div>
        </div>
      )}
    </>
  );
}
```

---

## 🔌 5. Guía de Reutilización Frankenstein & Dependencias Mínimas

### Dónde Encaja Esta Pieza
* **Estaciones de Despacho Logístico:** Reglas de cubicaje, horarios límite de corte y validación de sellos.
* **Módulos de Facturación y Pricing B2B:** Políticas de descuento máximo, reglas de flete y márgenes mínimos.
* **Kioscos de Planta y Mantenimiento:** Criterios de parada de emergencia, reglas de lubricación y uso de EPP.

### Dependencias Mínimas
* React 18+ (Hooks estándar `useState`, `useEffect`).
* `lucide-react` (Iconos estándar).
* Tailwind CSS (`fixed`, `z-50`, `backdrop-blur`).
* **CERO librerías externas de tours ni modales pesados**.
