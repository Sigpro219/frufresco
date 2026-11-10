---
name: estandar-galerias-frufresco
description: Especialista en Estandarización de Ancho de Pantalla (1600px), Superbuscador Omnibox Universal y Comportamiento Sticky Magnético Multi-Línea (Ejes X, Y, Z) para FruFresco. Activar cuando el usuario pida estandarizar una galería, mencione fijar encabezados/toolbars o comparta un pantallazo con líneas marcadas para congelar.
---

# 📐 Estándar de Galerías, Superbuscador y Sticky Magnético FruFresco

Este Skill formaliza la arquitectura visual y espacial de las galerías, tablas y consolas operativas de **FruFresco**. Garantiza que el 100% de los módulos compartan el mismo ancho máximo en pantalla (1600px), aprovechen el espacio horizontal sin desbordes, incluyan un **Superbuscador Omnibox Universal** y mantengan una navegación fluida mediante acople magnético en scroll vertical (*Magnetic Stacking*) con tolerancia cero de holguras.

---

## 🎯 Protocolo de Invocación y Checklist Preventiva de Creación

Cuando se construya, refactorice o audite una galería o tabla operativa:
1. **Inspeccionar el contenedor maestro en X**: Exactamente `1600px` (`maxWidth: '1600px'` o `max-w-[1600px] mx-auto`).
2. **Verificar Regla Anti-Secuestro de Scroll**: NINGÚN contenedor padre o intermedio puede tener `overflow: hidden`, `overflow: clip` ni `overflowX: auto` si la tabla depende del scroll de `window`.
3. **Verificar Regla de Tablas Chromium**: `borderCollapse: 'separate', borderSpacing: 0` (o `border-separate border-spacing-0`).
4. **Verificar Regla de Celdas TH Sticky**: Aplicar `position: 'sticky'` y fondo 100% sólido directamente en cada celda `<th>`.
5. **Calcular Fórmula Matemática de Tolerancia Cero (Gap = 0px)** en apilamiento vertical Y y cascada Z.
6. **Integrar el Superbuscador Omnibox Universal** (`GalleryOmnibox.tsx`).
7. **Verificar compilación limpia** (`tsc --noEmit`) y validar visualmente con Playwright mediante scroll vertical de prueba (mínimo 400px).

---

## 1. Reglas Inviolables Anti-Secuestro de Scroll (Scroll Hijacking Traps)

> [!CAUTION]
> **El Error Clásico de CSS Sticky:** En la especificación W3C, cualquier ancestro con `overflow` distinto de `visible` (`hidden`, `clip`, `auto`, `scroll`) crea un *Scroll Container* o un *Clipping Box* local. Si la ventana hace scroll, el elemento sticky queda atrapado en el marco estático de su padre y **se congela a mitad de pantalla o es rebasado por las filas**.

### 🚫 Reglas Prohibitivas Estrictas:
1. **PROHIBIDO `overflow: hidden` o `overflow: clip` en Contenedores Tipo Card:**
   - Si una tarjeta envuelve una tabla con encabezado sticky, el contenedor debe tener obligatoriamente:
     ```tsx
     // CORRECTO
     <div style={{ backgroundColor: 'white', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'visible' }}>
     ```
   - *¿Cómo redondear esquinas sin `overflow: hidden`?* Aplica los radios directamente al primer y último elemento hijo (ej. `borderTopLeftRadius: '14px'`, `borderTopRightRadius: '14px'` en la cabecera o primer `th`/`td`).

2. **PROHIBIDO `overflowX: auto` en Wrappers Directos de Tabla con Sticky de Ventana:**
   - En Chromium, `overflowX: auto` fuerza al navegador a tratar el eje Y como dependiente del contenedor interno, rompiendo el `top: '[offset]'` respecto a `window.scrollY`.
   - En la resolución estándar de escritorio (1600px), la tabla debe tener `width: '100%'` y `overflow: 'visible'`.

---

## 2. Reglas de Renderizado de Tablas en Motores Chromium (Blink)

> [!WARNING]
> **El Bug de `border-collapse: collapse` en Chromium:** Cuando una tabla tiene `border-collapse: collapse`, el motor de renderizado de Chromium desincroniza las capas de composición por GPU de los encabezados sticky. Las filas del `tbody` ignoran el orden de apilamiento y **se deslizan por encima de las celdas del `thead`**.

### 🛠️ Solución Obligatoria:
1. **Configuración de Tabla:**
   ```tsx
   <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left' }}>
   ```
   *(En Tailwind: `className="w-full border-separate border-spacing-0 text-left"`)*

2. **Sticky Directo en Cada Celda `<th>` y Estándar de Contraste Canónico (WCAG AAA):**
   No basta con colocar `position: sticky` en el `<thead>`. Cada elemento `<th>` **debe declarar explícitamente su anclaje sticky, su coordenada `top` exacta, su fondo sólido Slate-100 (`#F1F5F9`) y su tipografía Slate-900 extra-bold (`#0F172A`)**:
   ```tsx
   <th style={{
     position: 'sticky',
     top: '169px', // Offset exacto calculado
     zIndex: 30,
     backgroundColor: '#F1F5F9', // Estándar oficial: Slate-100 sólido (WCAG AAA 9.8:1)
     borderBottom: '2px solid #CBD5E1', // Borde delimitador inferior nítido (Slate-300)
     color: '#0F172A', // Slate-900 extra-bold de máxima legibilidad
     fontWeight: '800',
     fontSize: '0.72rem',
     letterSpacing: '0.04em',
     textTransform: 'uppercase'
   }}>
     # Pedido
   </th>
   ```

---

## 3. Regla Inviolable del Eje X: Ancho Maestro (1600px)

Toda galería o módulo operativo debe estar enmarcado en el contenedor maestro FruFresco, alineado con el Navbar superior:

```tsx
// Contenedor Maestro de Página
<div className="w-full min-h-screen bg-[#F4F7F6]">
  <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '1.25rem 1.75rem 3.5rem 1.75rem' }}>
    {/* Contenido del módulo */}
  </div>
</div>
```

- **Máximo permitido:** `maxWidth: 1600px` (o Tailwind `max-w-[1600px]`).
- **Centrado:** `mx-auto` / `margin: 0 auto`.
- **Padding lateral:** `px-6` a `px-7` (`1.5rem` a `1.75rem`).

---

## 4. El Superbuscador Omnibox Universal (Multi-Criterio)

Toda galería FruFresco debe contar en su línea de herramientas (`Toolbar`) con el componente oficial `GalleryOmnibox`:

### Capacidades del Motor de Búsqueda
1. **Búsqueda Multi-Criterio Simultánea:** Busca en paralelo por Nombre, Razón Social, Contacto, SKU, Código interno, #ID, Célula, Categoría, NIT, Teléfono y Estados.
2. **Soporte de Prefijo `#ID`:** Si inicia con `#` (ej. `#15` o `#1002`), busca coincidencia exacta sobre el identificador primario.
3. **Soporte de Prefijo `@tag`:** Si incluye `@` (ej. `@alerta`, `@critico`, `@fresa`, `@credito`), filtra por etiquetas semánticas.
4. **Multi-Término Inclusivo (AND Espaciado):** Permite escribir `fresa bandeja cali` y valida que **todos** los términos existan en la fila.
5. **Insensibilidad a Acentos y Mayúsculas:** Normalización NFD (`limon` encuentra `Limón`).
6. **Separación por Comas (OR):** Permite consultar términos disjuntos (`tomate, cebolla, papa`).
7. **Atajo Universal de Foco:** Presionar la tecla `/` enfoca inmediatamente el Superbuscador.

### 4.1. Protocolo Canónico de Tolerancia Fonética, Seseo y Variaciones Ortográficas (Fuzzy Matching Industrial)
En la operación agroalimentaria y de pedidos masivos, la digitación humana y los documentos de clientes contienen discrepancias ortográficas habituales del español latinoamericano:

1. **Equivalencia Fonética Z $\leftrightarrow$ S y Seseo:**
   - La búsqueda debe normalizar internamente `z` $\leftrightarrow$ `s`, `ce` $\leftrightarrow$ `se` y `ci` $\leftrightarrow$ `si`.
   - **Caso Canónico:** Escribir `"tusa"` **DEBE** encontrar de inmediato `"Mazorca en tuza institucional"`, erradicando falsos negativos por discrepancia Z/S.
2. **Búsqueda Multi-Token No Contigua:**
   - Queda prohibido exigir coincidencia de subcadena continua estricta (`normName.includes(query)`).
   - El motor divide la consulta en palabras (`queryTokens = cleanQuery.split(/\s+/)`). Si todas las palabras clave consultadas están presentes en el nombre, SKU, accounting ID, apodo o keywords del producto (sin importar el orden ni palabras intermedias), el producto se considera coincidente y se expone al operador.
   - **Ejemplo:** Escribir `"mazorca institucional 992"` encuentra `"Mazorca en tuza institucional"` (Accounting ID: 992).
3. **Manejo de Códigos Contables y SKU entre Paréntesis:**
   - Si la consulta incluye patrones como `(992)`, el motor extrae el ID numérico y prioriza con el puntaje más alto (+8.000 pts) la coincidencia exacta sobre el código contable (`accounting_id`).
4. **Prevalencia Absoluta de Acuerdos Comerciales (+4.000 pts):**
   - Si el cliente tiene un acuerdo comercial (`quotes` con `status = 'agreement'`), los productos pactados en el convenio reciben un bono preferente de relevancia (+4.000 pts).
   - Prohibido ocultar productos del convenio bajo banderas restrictivas de web (`show_on_web`) en las consolas operativas de despacho, mesa de borradores y creación de pedidos.
5. **Resiliencia en Memoria de Apodos:**
   - El motor de búsqueda y el pipeline de digestión IA (`findBestProductMatchDetails`) deben mapear de forma segura tanto `product_nicknames` (`nickname`, `product_id`) como `document_learning_memory` (`normalized_text`, `matched_product_id`), sanitizando siempre los textos con fallback no nulo para impedir excepciones de tipo `undefined.includes()`.

---

## 5. Jerarquía Inviolable del Eje Z

Para evitar colisiones, traslapes y sangrados visuales:

| Capa / Componente | `z-index` | Rol y Comportamiento |
| :--- | :--- | :--- |
| **Modales / Drawers / Dropdowns globales** | `z-[120]` o `z-50` (Portal) | Siempre encima de todo |
| **Navbar Principal FruFresco** | `z-50` o `z-100` (anclado en top 0) | Barra de navegación global |
| **Línea 1 Sticky (Subpestañas / Tabs)** | `z-45` o `z-40` | Primer nivel de cambio de contexto |
| **Línea 2 Sticky (Toolbar / Omnibox / Píldoras)** | `z-40` o `z-30` | Herramientas de filtrado y búsqueda |
| **Línea 3 Sticky (Thead / Celdas TH de Tabla)** | `z-30` o `z-20` | Títulos de columnas congelados |
| **Esquina Sticky 2D (Top-Left intersección)** | `z-70` | Celda fija en vertical y horizontal |
| **Columna Izquierda Sticky 2D (SKU / Nombre)** | `z-25` o `z-15` | Columna congelada al scrollear en X |
| **Cuerpo de Tabla / Celdas / Filas** | `z-0` o `z-10` | Contenido en movimiento |

---

## 6. Fórmulas de Apilamiento en Eje Y (Magnetic Stacking con Tolerancia Cero)

> [!IMPORTANT]
> **Fórmula de Continuidad Matemática (0px Gap):**
> $$\text{top}_{\text{Capa } N+1} = \text{top}_{\text{Capa } N} + \text{height}_{\text{Capa } N}$$
> **Nunca añadir márgenes o gaps arbitrarios entre elementos sticky**, ya que crean huecos transparentes donde el contenido scrolleado queda visible y roto.

### Perfil A: 2 Líneas Fijas (Toolbar con Superbuscador + Thead)
*Aplicable cuando los KPIs scrollean libremente o cuando no hay subpestañas.*

- **Línea 0 (Navbar):** `top: 0px`, `height: 86px` $\rightarrow$ Base inferior en `86px`.
- **Línea 1 (Toolbar con Omnibox):** `top: 86px`, `height: 48px`, `zIndex: 40`, fondo `#FFFFFF` sólido.
- **Línea 2 (Thead / Th):** `top: 134px` (`86 + 48 = 134px`), `zIndex: 30`, fondo `#F8FAFC` sólido.

---

### Perfil B: 3 Líneas Fijas (Subpestañas + Toolbar con Superbuscador + Thead)
*Aplicable en módulos densos (Facturación & Cartera, Matriz de Costos, Clientes, Despachos).*

- **Línea 0 (Navbar Principal):** `top: 0px`, `height: 86px` $\rightarrow$ Base inferior en `86px` (`zIndex: 100` / `z-50`).
- **Línea 1 (Subtabs Bar):** `top: 85px`, `height: 37px` $\rightarrow$ Base inferior en `122px` (`zIndex: 45`, fondo `#FFFFFF` sólido).
- **Línea 2 (Toolbar con Omnibox):** `top: 122px`, `height: 47px` $\rightarrow$ Base inferior en `169px` (`zIndex: 40`, fondo `#FFFFFF` sólido).
- **Línea 3 (Thead / Celdas TH):** `top: 169px` (`122 + 47 = 169px`), `zIndex: 30`, fondo `#F8FAFC` sólido.

---

## 7. Requisitos de Opacidad Sólida (Anti-Bleed)

1. **Prohibición de Fondos Semi-Transparentes:** Prohibido usar `rgba(255, 255, 255, 0.95)` o `bg-white/90` en barras o encabezados sticky. El fondo DEBE ser 100% opaco (`#FFFFFF` o `#F8FAFC`).
2. **Micro-Sombra de Delimitación:** El `thead` y la `toolbar` fijas deben llevar un sutil relieve inferior (`boxShadow: '0 2px 6px rgba(0,0,0,0.03)'` o `shadow-xs`) y borde de contraste (`border-b border-slate-200`).
3. **Sticky 2D (Columnas Laterales):** Si la tabla tiene muchas columnas horizontales, la columna de "Código / Producto" debe ser `sticky left-0 bg-white z-25`. En el encabezado, la esquina debe tener `sticky left-0 top-[offset] z-70`.

---

## 8. Procedimiento de Certificación E2E con Playwright

Antes de dar por completada cualquier galería:
1. **Compilación Limpia:** Ejecutar `node ./node_modules/typescript/bin/tsc --noEmit` (0 errores).
2. **Auditoría de Telemetría:** Ejecutar script Playwright con sesión autenticada que ejecute `window.scrollBy(0, 400)` y verifique las coordenadas rectangulares de cada capa.
3. **Certificación Visual:** Confirmar que `bottom` de la capa $N$ coincide exactamente con `top` de la capa $N+1$ (tolerancia 0px) y que las filas se deslizan por debajo sin sangrados ni flotaciones.

---

## 9. Protocolo Canónico de Ergonomía de Teclado Industrial (Tab vs Enter) en Mesa de Trabajo y Modales

En todas las mesas de trabajo (`EmailDraftsModule`, `/admin/orders/create`, `/admin/orders/loading` e Ingesta PDF/WhatsApp), la interacción por teclado es sagrada y sigue esta regla universal:

### A. La Distinción Estricta entre `Tab` y `Enter`
1. **`Tab` (Navegación / Desplazamiento Secuencial):**
   - **En la tabla:** Presionar `Tab` en la celda de SKU **entra al modal de personalización** si el producto tiene opciones configurables (`options_config.length > 0`).
   - **Dentro del modal:** `Presentación` $\xrightarrow{\text{Tab}}$ `Maduración` $\xrightarrow{\text{Tab}}$ `Cantidad` $\xrightarrow{\text{Tab}}$ `Botón Agregar`.
2. **`Enter` (Aceptación / Confirmación):**
   - **En la tabla:** Presionar `Enter` en la celda de SKU **acepta el producto y match actual por defecto** sin abrir el modal, pasando directo al input de Cantidad.
   - **En la Cantidad del Renglón:** Presionar `Enter` guarda la cantidad y salta automáticamente a la siguiente fila (`sku-input-${i+1}`).
   - **Dentro del modal:** Presionar `Enter` en el campo `Cantidad` o en el botón `[Agregar]` confirma y guarda la personalización, cerrando el modal y retornando el foco a la mesa de trabajo.

### B. Invariante de Unidad de Medida (Cero Desplegables)
- La **Unidad de Medida** en el modal de personalización **NUNCA** es un selector ni desplegable interactivo.
- Es una consecuencia automática y obligatoria de la `Presentación` seleccionada.
- Se renderiza como una caja/pastilla informativa estática con `tabIndex={-1}`, completamente excluida del orden de tabulación.

### C. Invariante de Presentación por Defecto (Siempre Kg)
- Para cualquier producto con opciones de `Presentación` (o `Unidad`), el valor predeterminado al abrir el modal o inicializar el borrador **SIEMPRE ES `Kg`** (o el equivalente en kilogramos), a menos que el cliente tenga una preferencia estructurada explícita guardada (`clientExceptions.preferred_options`).
- Prohibido preseleccionar arbitrariamente unidades de empaque discretas (ej. `Unidad 250 gr`) por encima del estándar base `Kg`.

---

## 10. Protocolo Canónico de Ordenadores de Columna (Tri-State Column Sorting Standard)

En todas las consolas operativas, catálogos y matrices de datos de FruFresco, los encabezados de columna interactivos deben permitir ordenamiento determinista bajo el patrón **Tri-Estado**:

### A. Ciclo Tri-Estado Inviolable
Al hacer clic sobre un encabezado ordenable:
$$\text{Neutral (Orden Natural)} \xrightarrow{\text{1er Clic}} \text{Ascendente (asc)} \xrightarrow{\text{2do Clic}} \text{Descendente (desc)} \xrightarrow{\text{3er Clic}} \text{Neutral (null)}$$

1. **Neutral (`null`):** La tabla respeta el orden natural de ingesta, catálogo o consulta base.
2. **Ascendente (`'asc'`):** De menor a mayor ($A \rightarrow Z$, $0 \rightarrow 9$).
3. **Descendente (`'desc'`):** De mayor a menor ($Z \rightarrow A$, $9 \rightarrow 0$).
4. **Tercer Clic:** Restablece `sortField` a `null` y `sortOrder` a `'asc'`, erradicando el bloqueo visual donde el usuario no podía regresar al orden predeterminado.

### B. Anatomía Visual y Microinteracción en `<th>` (Coexistencia de Ordenador + Filtro Dropdown)
1. **Cursor y Selección:** `cursor: 'pointer'`, `userSelect: 'none'`.
2. **Distribución en Texto (Izquierda):**
   ```tsx
   <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
     <div 
       onClick={() => handleSort('field_name')}
       style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: isSorted ? THEME.colors.primary : '#0F172A', cursor: 'pointer' }}
     >
       <span>{label}</span>
       {isSorted ? (
         sortOrder === 'asc' ? <ArrowUp size={12} strokeWidth={2.5} style={{ color: THEME.colors.primary }} /> : <ArrowDown size={12} strokeWidth={2.5} style={{ color: THEME.colors.primary }} />
       ) : (
         <ArrowUpDown size={11} strokeWidth={2} style={{ color: '#94A3B8' }} />
       )}
     </div>

     {/* Si la columna cuenta con segmentación o filtro rápido: */}
     {hasFilter && (
       <button
         onClick={(e) => { e.stopPropagation(); toggleDropdown('field'); }}
         style={{
           background: isFilterActive ? THEME.colors.primary : '#E2E8F0',
           color: isFilterActive ? 'white' : '#475569',
           border: 'none',
           borderRadius: '4px',
           padding: '2px 4px',
           cursor: 'pointer'
         }}
       >
         <ChevronDown size={12} />
       </button>
     )}
   </div>
   ```
3. **Distribución en Valores Numéricos / Moneda / Porcentajes (Derecha):**
   ```tsx
   <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', width: '100%' }}>
     <div 
       onClick={() => handleSort('numeric_field')}
       style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: isSorted ? THEME.colors.primary : '#0F172A', cursor: 'pointer' }}
     >
       <span>{label}</span>
       {isSorted ? (
         sortOrder === 'asc' ? <ArrowUp size={12} strokeWidth={2.5} style={{ color: THEME.colors.primary }} /> : <ArrowDown size={12} strokeWidth={2.5} style={{ color: THEME.colors.primary }} />
       ) : (
         <ArrowUpDown size={11} strokeWidth={2} style={{ color: '#94A3B8' }} />
       )}
     </div>

     {hasFilter && (
       <button
         onClick={(e) => { e.stopPropagation(); toggleDropdown('numeric'); }}
         style={{
           background: isFilterActive ? THEME.colors.primary : '#E2E8F0',
           color: isFilterActive ? 'white' : '#475569',
           border: 'none',
           borderRadius: '4px',
           padding: '2px 4px',
           cursor: 'pointer'
         }}
       >
         <ChevronDown size={12} />
       </button>
     )}
   </div>
   ```
4. **Íconos Canónicos:** Uso exclusivo de `ArrowUp`, `ArrowDown`, `ArrowUpDown` de `lucide-react`. Prohibido el uso de símbolos unicode o flechas ASCII (`▲`, `▼`, `↑`).

### C. Algoritmo de Ordenamiento Multi-Tipo Resiliente
1. **Textos y Categorías en Español:**
   Usar obligatoriamente `localeCompare` con soporte numérico y normalización:
   ```ts
   valA.localeCompare(valB, 'es', { sensitivity: 'base', numeric: true })
   ```
   *Garantiza que "Tomate 2" se ordene antes que "Tomate 10", y tolera acentos y mayúsculas.*
2. **Identificadores Híbridos (ID ERP / SKU):**
   Conversión segura a `Number`. Si ambos valores son numéricos, restar `numA - numB`. Si contienen letras (ej. `SKU-A12`), recurrir a `localeCompare` natural.
3. **Valores Numéricos, Monedas y Tasas (Costo, Margen, Precios):**
   Diferencia numérica con fallback a 0 ante nulos:
   ```ts
   const numA = Number(valA) || 0;
   const numB = Number(valB) || 0;
   return sortOrder === 'asc' ? numA - numB : numB - numA;
   ```
4. **Invariante de Paginación:**
   El ordenamiento se aplica sobre el conjunto **total filtrado** (`filteredItems`), **NUNCA** sobre la página actual (`paginatedItems`).
5. **Ergonomía de Paginación:**
   Al activar o conmutar el orden de cualquier columna, el paginador debe reiniciar inmediatamente a la primera página (`setPage(1)`).



