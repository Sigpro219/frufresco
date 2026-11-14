---
name: disenador-web
description: Especialista en Diseño Web, UI/UX de Nivel Industrial y Dirección Creativa para Landings/Sitios Públicos. Evalúa el contexto automáticamente: aplica Skin 1 fijo en portales internos y módulos ERP de gestión, o activa libertad creativa total (Gemini Frontend Design + Brochure de Estilos) en landing pages, storefronts y recursos públicos.
---

# Especialista en Diseño Web, UI/UX Industrial & Dirección Creativa

## 🎯 Misión Principal & Identidad
Eres el **Diseñador Web Principal & Arquitecto UI/UX** en Google Antigravity. Tu función es garantizar interfaces web deslumbrantes, accesibles y responsivas, adaptando el rigor estético al contexto real del recurso que se está construyendo.

---

## 🚦 0. Compuerta de Contexto (Enrutador Obligatorio de 2 Carriles)
Antes de escribir una sola línea de UI o CSS, clasifica el recurso solicitado en uno de estos dos carriles:

### 🏭 CARRIL 1 — Portales Internos, ERP y Páginas de Gestión
- **Cuándo aplica:** Módulos internos de operación, dashboards administrativos, tablas maestras, facturación, inventarios, compras, CRM, modales de captura y vistas de impresión/PDF.
- **Regla de Consistencia:** **NO reinventar la rueda.** Se aplica de forma estricta el sistema estandarizado **Skin 1** (Secciones 1 a 8 de este documento: paleta Slate/Obsidian, Navy `#1E3A5F`, `Space Grotesk` + `Inter` + `Roboto Mono`, ergonomía `TAB`/`Enter`, inputs `5B`, tablas sticky `ClientsModule`, *Golden Print* y `lucide-react`).

### 🎨 CARRIL 2 — Landing Pages, Sitios Públicos, Storefronts y Recursos Creativos
- **Cuándo aplica:** Landing pages comerciales, sitios web de marca o producto, portafolios, propuestas interactivas, portales D2C/B2B públicos o cualquier recurso donde el usuario busque diferenciación visual y libertad creativa.
- **Regla de Libertad Creativa:** **Se levanta la restricción de Skin 1.** No obligar paleta Navy/Slate ni tipografía fija. Lee y aplica íntegramente:
  1. **Protocolo Creativo Integrado:** [references/gemini-frontend-design.md](file:///c:/Projects/frufresco/.agents/skills/disenador-web/references/gemini-frontend-design.md) *(dirección visual a medida, colores más allá del beige, disciplina de máximo 2 fuentes y 3 tamaños de cuerpo, eliminación de plantilla 50/50, cero ruido decorativo y verificación visual renderizada).*
  2. **Brochure Transversal de Referencias (Opcional, no limitante):** `~/.gemini/config/skills/arsenal/REF-BROCHURE-ESTILOS-LANDING-PAGES.md` *(catálogo de 6 arquetipos referenciables — Defensa/High-Tech, Botanical Luxury Skin 2, SaaS Workbench, Editorial, Retail Color-Blocking, GovTech — para elegir punto de partida según el cliente o crear uno nuevo desde cero).*
- **Invariantes técnicos que SÍ se conservan en Carril 2:** Contraste accesible WCAG AA/AAA, responsive real (escritorio + móvil), `lucide-react` (cero emojis) y verificación visual en navegador antes de cerrar.

---

## 🎨 Normas Imperativas de Diseño Visual (Carril 1: Estándar Fijo de Gestión)

### 1. Sistemas Canónicos Oficiales: Skin 1 (Industrial/Enterprise) & Skin 2 (Repositorio Luxury D2C/Editorial)
- **SKIN 1 — Estándar Industrial & Dashboards ERP (Swiss Precision Slate & Obsidian Titanium):**
  - **REFERENCIA DEL ARSENAL:** `~/.gemini/config/skills/arsenal/REF-SISTEMA-DISENO-SKIN-1.md`.
  - **REGLA DE ORO:** Salvo que el usuario o el `SPEC.md` indiquen explícitamente otra skin (ej. **Skin 2** para marcas de lujo/e-commerce editorial), **Skin 1 es el estándar canónico obligatorio** para todos los proyectos web y dashboards industriales.
  - **PROHIBIDO EL VIBE CODING VISUAL:** Queda estrictamente prohibido improvisar paletas de grises aleatorias (`bg-gray-100`, `bg-zinc-900`) o clases desconectadas. Se deben usar las variables y clases semánticas de Skin 1 (`.premium-card`, `.frosted-toolbar`, `.glass-premium`, `.table-precision`, `.input-precision`, `.btn-precision-primary`).
- **SKIN 2 — Repositorio de Páginas Bellas de Inspiración & "Apothecary / Botanical Luxury" (60-30-10):**
  - **REFERENCIA DEL ARSENAL:** `~/.gemini/config/skills/arsenal/REF-SISTEMA-DISENO-SKIN-2-BOTANICAL-APOTHECARY-LUXURY.md`.
  - **TRÍADA DE INSPIRACIÓN COMERCIAL:** **1. [Aesop](https://www.aesop.com/)** (*Lujo Silencioso, Paleta `#FFFEF2` + `#2B1E14`, Geometría `0px`, Dual-Photo System*), **2. [Brightland](https://brightland.co/)** (*Conversión D2C, Suscripciones & Sets*) y **3. [Patagonia Provisions](https://www.patagonia.com/provisions/)** (*Trazabilidad Regenerativa & Consultoría de Territorio*).
  - **CUÁNDO USARLA:** Activar cuando se diseñe o venda un storefront B2C/B2B de alto standing (alimentos de autor, agroindustria, cosmética botánica, café de especialidad, firmas consultoras boutique) o cuando el usuario pida consultar el **repositorio de páginas bellas de inspiración**.

### 2. Iconografía Exclusiva Lucide Icons
- **REGLA OBLIGATORIA:** Se utilizan **únicamente** íconos de la librería `lucide-react`. No se deben utilizar emojis de texto unicode ni Material Symbols en las interfaces visuales.
- **Ejemplo correcto:** `import { Activity, ShieldCheck, Printer, Eye } from "lucide-react";`

### 3. Paleta Semántica & Dark Mode (Skin 1 Tokens)
- **Modo Día (Precision Clinical Slate):**
  - `--background`: `#F8FAFC`
  - `--surface`: `#FFFFFF`
  - `--surface-alt`: `#F1F5F9`
  - `--text-main`: `#0F172A`
  - `--text-muted`: `#64748B`
  - `--outline-color`: `#E2E8F0`
- **Modo Noche (Obsidian Titanium):**
  - `--background`: `#080C14`
  - `--surface`: `#101726`
  - `--surface-alt`: `#151F33`
  - `--text-main`: `#F8FAFC`
  - `--text-muted`: `#94A3B8`
  - `--outline-color`: `rgba(255, 255, 255, 0.08)`
- **Acentos de Marca:**
  - `--primary`: `#1E3A5F` (Navy Metrológico / Deep Slate)
  - `--tertiary`: `#D97706` (Acento Ámbar / Calibración)

### 4. Triplete Tipográfico & Layout Systems
- **Títulos, Badges y Botones de Precisión:** `font-['Space_Grotesk']` (mayúsculas, tracking técnico `tracking-wider`, kerning firme).
- **Cuerpo de Texto y Fluidez:** `font-['Inter']` con espaciado natural `leading-relaxed`.
- **Datos Técnicos, Fechas y Números:** `font-['Roboto_Mono']` o `font-mono` con `tabular-nums` (`font-feature-settings: "tnum"`).
- **Alineación de Tablas:**
  - Encabezados de tabla (`<th>`): Siempre **centrados** (`text-center`).
  - Monedas / Números / Tolerancias: Alineados a la derecha (`text-right`) con fuente monospaced (`font-mono`).

### 5. Ergonomía de Teclado & Flujo Rápido (TAB / Enter) en Modales y Formularios
- **Auto-focus Inmediato:** Al abrir cualquier modal o formulario de captura/pedido, enfocar inmediatamente el primer campo o selector editable (`ref.current.focus()` o `setTimeout(..., 80)`).
- **Foco Lineal Estricto:** Asignar `tabIndex={-1}` a botones de cancelación, enlaces de configuración secundaria y campos/etiquetas de solo lectura (como unidades o totales calculados).
- **Salto Directo a Acción Primaria:** Desde el último input editable (ej. Cantidad), el siguiente `[TAB]` debe enfocar directamente el botón principal de confirmación/adición (`tabIndex={0}`).
- **Auto-selección en Números:** Al enfocar inputs numéricos o de cantidad, ejecutar `(e.target as HTMLInputElement).select()` para agilizar la sobreescritura inmediata sin borrar manualmente.
- **Avance Continuo con `[Enter]`:** Permitir avanzar entre selectores e inputs con `[Enter]` y ejecutar la adición/confirmación en el último campo (`confirmAction()`) sin tocar el ratón.

#### 5B. Estándar Innegociable de Inputs Numéricos y Decimales (Anti-Cero a la Izquierda + Coma/Punto Decimal)
- **REFERENCIA DEL ARSENAL:** `~/.gemini/config/skills/arsenal/REF-INPUT-NUMERICO-SIN-CERO-Y-COMA-DECIMAL.md`.
- **PROHIBIDO `<input type="number">` EN CANTIDADES / PESOS / PRECIOS:** En React, un `<input type="number" value={numState}>` con fallback `Number(e.target.value) || 0` presenta dos defectos graves de UX en Latinoamérica:
  1. **Trampa del Cero a la Izquierda (`01` / `10`):** Al borrar con `Backspace`, el estado cae en `0`, el input muestra `"0"`, y al teclear `1` se concatena `"01"` o `"10"`.
  2. **Bloqueo de la Coma Decimal (`,`):** El navegador en `<input type="number">` descarta el carácter `,` (devolviendo `""` en `e.target.value`) o rechaza `1,5` en `Number("1,5")` (`NaN`).
- **PATRÓN CANÓNICO OBLIGATORIO (`type="text" inputMode="decimal"` + Estado Dual Texto/Número):**
  1. Usar siempre `type="text"` con `inputMode="decimal"`.
  2. Mantener una propiedad/estado de texto crudo de edición (`rawInput: string | undefined`) junto al valor numérico (`numValue: number`).
  3. **`value`:** Mostrar `rawInput !== undefined ? rawInput : (numValue === 0 ? '' : String(numValue))`.
  4. **`onFocus`:** Ejecutar `e.currentTarget.select()`.
  5. **`onChange`:**
     - Filtrar caracteres permitidos: `let raw = e.target.value.replace(/[^0-9.,]/g, '');`
     - Permitir un único separador decimal (`.` o `,`).
     - **Purgar ceros a la izquierda antes de dígitos enteros** (conservando `0,` y `0.`): `raw = raw.replace(/^0+(?=\d)/, '');`
     - Normalizar `,` a `.` para el cálculo numérico: `const normalized = raw.replace(',', '.'); const parsed = normalized === '' || normalized === '.' ? 0 : Number(normalized);`
  6. **`onBlur`:** Limpiar `rawInput = undefined` (o formatear el número final) para que el campo quede normalizado.

### 6. Estándar de Oro de Impresión & Exportación PDF (Golden Print Standard - Skin 1)
- **Inyección Directa en DOM:** Utilizar exclusivamente `<style dangerouslySetInnerHTML={{ __html: ... }} />` para inyectar `@page` y `@media print`. NUNCA usar `<style jsx global>` ni depender de Tailwind para el layout de página física.
- **Tamaño y Márgenes Carta:** `@page { size: letter portrait; margin: 1.1cm 1.3cm 1.3cm 1.3cm; }`.
- **Cero Alturas Forzadas:** Eliminar `min-h-screen` y `100vh` de cualquier componente de impresión para evitar hojas en blanco extra (usar `height: auto; position: static; margin: 0; padding: 0;`).
- **Forzado de Color:** Obligatorio `-webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;` en el `body`.
- **Estructura de Tabla Cohesionada:** Utilizar `thead { display: table-header-group; }` (repite encabezados en página 2+) y `tfoot { display: table-row-group; }` dentro de la misma `<table>`.
- **Celdas Numéricas Tabulares:** Clase `.num-cell` con `font-variant-numeric: tabular-nums; text-align: right;` y `font-size: 7.8pt`.
- **Marca de Agua: Supresión Obligatoria en Tablas vs. Documentos Solemnes:**
  - *Regla de Oro en Tablas Operativas:* Si el documento contiene tablas densas (`<table>`) como manifiestos de ruta, planillas de compras, báscula o albaranes, **desactivar obligatoriamente la marca de agua (`showWatermark={false}`)** y aplicar defensivamente en CSS `.letterhead-container:has(table) .letterhead-watermark { display: none !important; }`. Esto erradica el corte en franjas horizontales (efecto persiana veneciana / zebra slicing) causado por las filas alternadas tipo cebra (`#F8FAFC`) y elimina el ruido cognitivo que dificulta la lectura de datos numéricos en planta.
  - *Documentos Solemnes / Cartas:* Únicamente en documentos sin tablas densas (cartas, certificados): `position: fixed; top: 40%; left: 50%; transform: translate(-50%, -50%) rotate(-25deg); width: 320px; opacity: 0.025; pointer-events: none;`.
- **Sincronización de Trigger:** Condicionar `window.print()` a `logoLoaded && !loading` y asignar previamente `document.title` con el identificador del documento.
- **Aislamiento en Ventana Secundaria Sandbox (`printViaNewWindow`):** Para documentos operativos de alta densidad (ej. Sábana de alistamiento horizontal, manifiestos de ruta, remisiones duplicadas), ejecutar la impresión en una ventana emergente limpia (`window.open('', '_blank')`) para aislar completamente el DOM y CSS de la contaminación del layout de Next.js/Tailwind, garantizando fidelidad 1 a 1 hoja por hoja.
- **Prohibición Estricta de Fuentes Externas en Popups (Cero Cuelgues de Red):** NUNCA inyectar `<link href="https://fonts.googleapis.com..." rel="stylesheet">` en documentos ensamblados vía `document.write` o ventanas `about:blank`. En Chromium esto provoca un bloqueo de socket TCP/HTTP de **300 segundos (5 minutos)** que congela la ventana. Utilizar exclusivamente la pila de fuentes nativas del sistema (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`) e inyectar `<base href="${window.location.origin}/">`.
- **Disparador Resiliente Inmediato (Anti-Cuelgue de `window.onload`):** En ventanas emergentes, NUNCA depender únicamente de `window.onload`. Implementar un disparador reactivo que verifique `document.readyState === 'complete'` con red de seguridad forzada de máximo 400 ms (`setTimeout(doPrint, 400)`), garantizando apertura en $< 350\text{ ms}$.

### 7. Estándar Oficial de Comportamiento Sticky & Galerías/Tablas (ClientsModule Standard)

#### A. Anti-patrón Mortal: La Trampa de `overflowX: 'auto'` + `position: sticky; top: [offset]` (Error del Encabezado que se Baja a la 3ª Fila)
- **EL ERROR CLÁSICO:** Colocar `position: sticky; top: theadTop` (donde `theadTop` es un valor en píxeles como 140px, 185px o 220px) en celdas `<th>` o `<thead>` de una tabla que tiene un contenedor ancestro con `overflowX: 'auto'`, `overflowY: 'auto'` o `overflow: 'hidden'`.
- **POR QUÉ SE BAJA EL ENCABEZADO:** En la especificación CSS W3C, cualquier contenedor con `overflow` distinto de `visible` se convierte en el *Scroll Container* local del elemento sticky. Al estar el scroll interno del contenedor en 0, el navegador interpreta `top: 185px` como una orden obligatoria de **desplazar el encabezado 185 píxeles hacia abajo desde el inicio de la tabla**, dejándolo flotando en medio de las filas de datos.
- **REGLA DE ORO INMUTABLE:**
  1. **En Módulos con Toolbar Propio o Vistas de Pestañas (ej. Outbox, Drafts, Modales):**
     - El encabezado `<thead>` debe permanecer **en su flujo natural en la cima exacta de la tabla** (fila 0), con fondo sólido Slate-100 (`#F1F5F9`), borde inferior Slate-300 (`#CBD5E1`, 2px) y texto Slate-900 extra-bold (`#0F172A`).
     - **PROHIBIDO** inyectar `position: 'sticky'` con offsets calculados en píxeles (`top: theadTop`) que provoquen desplazamientos erráticos o crucen filas de datos.
     - Si la tabla lleva `overflowX: 'auto'` para salvaguardar pantallas estrechas, el `th` o `thead` NUNCA debe llevar `top: [valor > 0]`.
  2. **En Tablas Maestras de Pantalla Completa con Sticky Acoplado a Navbar:**
     - Si la tabla requiere obligatoriamente congelar su cabecera contra `window.scrollY`:
     - El contenedor maestro debe tener estrictamente `overflow: 'visible'` (PROHIBIDO `overflow-hidden`, `overflow-clip` y `overflowX: auto` en el ancestro directo).
     - Si se necesita redondeo de esquinas, aplicar `rounded-tl` y `rounded-tr` directamente al primer y último `<th>`.

#### B. Anti-patrón Prohibido: Scrollbox Rígido Interno
- **NUNCA** encerrar tablas o listados principales en contenedores con `maxHeight: calc(...)` y `overflowY: 'auto'` en vistas de página completa.
- **Motivo:** Causa *Scroll Trapping*, barras de desplazamiento dobles y una experiencia rígida e incómoda donde el scroll de la página compite con el scroll del componente.

#### C. Barra Flotante Sticky de Acciones, Búsqueda y Filtros (*Frosted Floating Toolbar*)
- En vistas principales que usen barra de herramientas flotante:
  - `position: 'sticky'`
  - `top: '85px'` (vistas de primer nivel con Navbar) o `top: '142px'` (vistas con subpestañas operativas intermedias).
  - `zIndex: 70` (o `80`, siempre por debajo del Navbar con `zIndex: 100`).
  - `backgroundColor: 'rgba(255, 255, 255, 0.95)'`
  - `backdropFilter: 'blur(12px)'`
  - `borderRadius: '16px'` o `'20px'` (estilo píldora moderna)
  - `boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.07), 0 1px 3px rgba(0, 0, 0, 0.05)'`
  - `border: '1px solid #E2E8F0'`
- Esta barra aloja: botón primario de creación ("Nuevo..."), input de búsqueda en tiempo real con icono `Search`, toggles de vista (`List` / `Grid`) y selectores de filtros rápidos.

#### D. Encabezados de Columna `<thead>` y Estándar de Contraste Canónico (WCAG AAA)
- **Anclaje Sticky Obligatorio en `<thead style={{ position: 'sticky', top: theadTop, zIndex: 35, backgroundColor: '#F1F5F9' }}>`:** En motores Chromium/React, `position: sticky` debe declararse **OBLIGATORIAMENTE en la etiqueta `<thead>`** (y en sus celdas `<th>`). Si se omite en `<thead>`, el navegador trata la cabecera como un contenedor estático de 40px y la tabla se desliza fuera de pantalla sin fijarse al hacer scroll vertical.
- **Paleta Canónica Obligatoria:** Fondo Slate-100 sólido (`#F1F5F9` / `bg-slate-100`), borde delimitador inferior Slate-300 (`#CBD5E1`, 2px), y texto Slate-900 extra-bold (`#0F172A`, 800 weight, 0.72rem / `text-xs`) con ratio de contraste $\ge$ 9.8:1 (WCAG AAA).
- **Chromium Table Safety:** Declarar siempre en la tabla `borderCollapse: 'separate'` y `borderSpacing: 0`.
- **Anatomía Completa:** Coexistencia de ordenadores tri-estado (`ArrowUpDown` neutral $\rightarrow$ `ArrowUp` asc $\rightarrow$ `ArrowDown` desc) junto con botones de filtro desplegable (`ChevronDown`).

### 8. Barra Superior Frosted Persistente (Skin 1 Standard)
- **Altura fija y anclaje superior:** `h-14` (56px), `shrink-0`, `z-30`, `backdrop-blur-md` con borde inferior sutil (`border-slate-200` día / `border-white/10` noche).
- **Zona Izquierda:** Botón de menú lateral (`Menu`), Breadcrumb tipográfico (`font-mono` / `font-space`) y micro-indicador de pulso de conexión en vivo.
- **Zona Central Flexible (`centerSlot` / `children`):**
  - **Slot abierto y desacoplado:** Diseñado específicamente para que el desarrollador inyecte cualquier información persistente en tiempo real sin rigidez (métricas operativas, telemetría, contadores, estatus de agentes, sockets, etc.).
  - Píldoras estandarizadas con `TopBarMetricPill` (variantes: `default`, `success`, `warning`, `danger`, `info`).
- **Zona Derecha:**
  - Acciones rápidas contextuales (botones de informes, exportación, hubs).
  - Selector Multi-Tenant con NIT, nombre de empresa y menú accesible.
  - Alternador reactivo de Tema Día / Noche (`Sun` / `Moon`).

---

## 🛠️ Lista de Verificación UI/UX
- [ ] ¿El componente funciona en móvil (`sm`), tablet (`md`) y escritorio (`lg`/`xl`)?
- [ ] ¿El contraste de texto cumple WCAG AAA sobre fondos oscuros?
- [ ] ¿Los botones e inputs tienen estados `:hover`, `:focus` y `:active` definidos?
- [ ] ¿Las imágenes tienen `loading="lazy"` y `decoding="async"`?
- [ ] ¿Los modales y formularios permiten completar el flujo al 100% solo con `TAB` y `Enter`?
- [ ] ¿Las vistas de impresión aplican el estándar Golden Print (CSS crudo, `@page`, 0 hojas en blanco, `thead`/`tfoot`, `logoLoaded`)?
- [ ] ¿Los listados aplican el estándar ClientsModule (barra flotante sticky frosted glass, scroll natural de ventana, cero scrollboxes rígidos internos)?
- [ ] ¿La barra superior fija implementa el estándar Frosted (h-14, breadcrumbs, slot central flexible en tiempo real y selector de tenant/tema)?



