---
name: galeria-sticky-industrial
description: Especialista en Estandarización de Galerías y Tablas con Protocolo Sticky Docked de 3 Niveles (Swiss Precision Industrial UI) para Ingyemel Mantenimiento. Aplica buscador omnibox, píldoras de filtro con telemetría reactiva, barra sticky docked con backdrop-blur y thead congelado de alta densidad.
---

# Protocolo Sticky Docked de 3 Niveles: Estandarización de Galerías Industriales

Este estándar documenta y sistematiza el patrón de diseño y arquitectura de interfaz implementado exitosamente en el módulo de **Clientes & Contratos (`/tenants`)**, diseñado para dotar a cualquier galería o tabla del sistema de:
1. **Fijación sticky multicapa** sin colisiones de `z-index` ni solapamientos.
2. **Alta densidad de información y cero desperdicio en el eje vertical (Y)**.
3. **Omnibox reactivo multi-criterio** con botón de limpieza instantáneo.
4. **Píldoras de filtrado con conteo telemétrico en tiempo real**.
5. **Estética Suiza de Precisión:** Bordes sutiles, translúcidos con `backdrop-blur-md`, tipografía monoespaciada para metadatos y acentos corporativos controlados.

---

## 1. Arquitectura de las 3 Capas Sticky (Z-Index Hierarchy)

```
┌────────────────────────────────────────────────────────────────────────┐
│  CAPA 1 (Línea 1): SUBPESTAÑAS DE CONTEXTO OPERATIVO                   │  sticky top-0 z-30
│  [ Directorio de Clientes (87) ]  [ Contratos & Vigencias (7/9) ]      │  backdrop-blur-md
├────────────────────────────────────────────────────────────────────────┤
│  CAPA 2 (Línea 2): BARRA FLOTANTE OMNIBOX & TOOLBAR DE ACCIONES        │  sticky top-0 z-30
│  [ 🔍 Superbuscador... (X) ]  [ Todos (87) | Con Contrato (6) ] [📊] [+]│  (Dentro del mismo
├────────────────────────────────────────────────────────────────────────┤   contenedor z-30)
│  CAPA 3 (Línea 3): ENCABEZADOS DE COLUMNA DE TABLA CONGELADOS          │  sticky top-[offset] z-20
│  EMPRESA/RAZÓN SOCIAL  │  NIT  │  DIRECCIÓN  │  CIUDAD  │  ESTADO...   │  (Scroll natural de ventana
└────────────────────────────────────────────────────────────────────────┘   fondo 100% sólido en th)
```

---

## 2. Especificación Técnica de Clases Tailwind

### A. Contenedor Maestro Sticky (Capas 1 y 2)
Debe encapsular tanto las subpestañas como la barra de búsqueda y filtros. Se ancla al borde superior del viewport:

```tsx
<div 
  className="sticky top-0 z-30 bg-[var(--background)]/95 backdrop-blur-md pt-1.5 pb-2 space-y-2 -mx-4 md:-mx-6 px-4 md:px-6 border-b border-slate-200/80 dark:border-white/10 shadow-xs"
>
  {/* LÍNEA 1: SUBPESTAÑAS OPERATIVAS */}
  <div className="flex border-b border-slate-200/70 dark:border-zinc-800 pb-0.5">
    <div className="flex gap-4">
      <button 
        onClick={() => setActiveTab('tab1')}
        className={`pb-1 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
          activeTab === 'tab1'
            ? "border-[#FBD007] text-slate-900 dark:text-white"
            : "border-transparent text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300"
        }`}
      >
        {tab1Label} ({filteredCount !== totalCount ? `${filteredCount}/${totalCount}` : totalCount})
      </button>
      {/* Pestaña 2... */}
    </div>
  </div>

  {/* LÍNEA 2: BARRA FLOTANTE OMNIBOX Y TOOLBAR COMPACTA */}
  <div className="bg-white/95 dark:bg-[#121216]/95 backdrop-blur-md p-1.5 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-2.5">
    
    {/* SUPERBUSCADOR OMNIBOX */}
    <div className="relative flex-1 w-full max-w-xl">
      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
      <input 
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Superbuscador..."
        className="w-full pl-8.5 pr-8 py-1.5 text-xs border rounded-lg outline-none bg-slate-50 dark:bg-zinc-900/80 border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-white focus:border-[#FBD007] transition-all placeholder:text-slate-400 dark:placeholder:text-zinc-500 font-medium"
      />
      {searchQuery && (
        <button
          onClick={() => setSearchQuery("")}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 rounded-full cursor-pointer transition-colors"
          title="Limpiar búsqueda"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>

    {/* TOOLBAR DE ACCIONES Y FILTROS RÁPIDOS */}
    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
      {/* Píldoras de Segmentación */}
      <div className="flex bg-slate-100 dark:bg-zinc-900 p-0.5 rounded-lg border border-slate-200 dark:border-zinc-800 text-xs font-mono shrink-0">
        <button 
          onClick={() => setFilter('ALL')}
          className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
            filter === 'ALL' 
              ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-xs' 
              : 'text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200'
          }`}
        >
          Todos ({totalItems})
        </button>
        <button 
          onClick={() => setFilter('FILTERED')}
          className={`px-2.5 py-1 rounded-md font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            filter === 'FILTERED' 
              ? 'bg-emerald-600 text-white shadow-xs' 
              : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Destacados ({filteredItemsCount})</span>
        </button>
      </div>

      {/* Botón Solo Ícono (Exportar Excel con Microinteracción) */}
      <button 
        onClick={handleExportExcel}
        title="Descargar datos a Excel (.xlsx)"
        aria-label="Descargar a Excel"
        className="p-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 rounded-lg transition-all flex items-center justify-center shadow-xs cursor-pointer hover:scale-105 active:scale-95 shrink-0"
      >
        <FileSpreadsheet className="w-4 h-4 stroke-[2.2]" />
      </button>

      {/* Botón Acción Primaria CTA */}
      <button 
        onClick={handleCreate}
        className="px-3 py-1.5 bg-[#FBD007] text-zinc-950 font-bold uppercase text-xs tracking-wider rounded-lg hover:brightness-110 transition-all flex items-center gap-1.5 shadow-sm whitespace-nowrap cursor-pointer shrink-0"
      >
        <Plus className="w-3.5 h-3.5 text-zinc-950 stroke-[2.5]" />
        <span>+ Nuevo Registro</span>
      </button>
    </div>
  </div>
</div>
```

---

### B. Contenedor de Tabla con Scroll Natural de Ventana y Encabezados Sticky (Capa 3)

El contenedor de la tabla **NO debe usar scrollbox rígido interno** (`max-h-[calc(...)]` con `overflow-y: auto`), sino permitir que el documento fluya naturalmente con el scroll de la ventana (`window.scrollY`), usando `border-separate border-spacing-0` y fondo **100% sólido** en cada `<th>` para erradicar el sangrado visual en Chromium:

```tsx
<div className="bg-white dark:bg-[#121214] border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm dark:shadow-2xl overflow-visible">
  <table className="w-full text-left border-separate border-spacing-0">
    <thead className="sticky top-[134px] z-20">
      <tr className="bg-slate-50 dark:bg-[#0c101a] text-slate-600 dark:text-zinc-300 font-mono uppercase text-[10px] tracking-wider shadow-xs">
        <th className="sticky top-[134px] z-20 px-5 py-2 font-semibold border-b border-slate-200 dark:border-white/10 first:rounded-tl-2xl bg-slate-50 dark:bg-[#0c101a]">
          Columna Principal
        </th>
        {/* Resto de columnas con sticky top-[134px] z-20 y fondo 100% sólido... */}
      </tr>
    </thead>
    <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04] text-xs">
      {/* Filas de datos... */}
    </tbody>
  </table>
</div>
```

---

## 3. Reglas Inviolables de Estandarización

1. **Uso Exclusivo de Íconos Lucide:**
   - Prohibido terminantemente el uso de emojis unicode (`🏢`, `🔍`, `📊`, etc.).
   - Utilizar únicamente componentes de `lucide-react` (`Search`, `X`, `FileSpreadsheet`, `Plus`, `ShieldCheck`, `Building2`, `Users`, etc.).
2. **Jerarquía Z-Index Estricta:**
   - Contenedor flotante superior: `z-30`.
   - Encabezados de tabla (`thead` y `th`): `z-20`.
   - Menús desplegables / tooltips: `z-40`.
   - Modales y Drawers: `z-[120]` o superior.
3. **Telemetría Dinámica en Tiempo Real:**
   - Si no hay búsqueda activa, mostrar el conteo total: `(87)`.
   - Si el usuario escribe en el superbuscador y filtra resultados, el conteo debe transformarse inmediatamente en `(${filtrados}/${total})`, por ejemplo `(6/87)`.
4. **Cero Salto de Línea en Acciones (Eje Y Compacto):**
   - La barra de búsqueda y filtros debe ser de perfil bajo (`py-1.5`, texto `text-xs`).
   - Todos los botones de la toolbar deben llevar `shrink-0` y `whitespace-nowrap`.
5. **Botón Exportar Excel Solo-Ícono:**
   - No consumir espacio horizontal con texto largo "Descargar a Excel". Utilizar el botón compacto `p-2` con el ícono `FileSpreadsheet` verde esmeralda y atributo `title` descriptivo.

---

## 4. Cuándo Activar esta Habilidad

Esta habilidad debe ejecutarse cuando el usuario indique:
- *"Aplica la lógica sticky a la galería de equipos / cotizaciones / repuestos..."*
- *"Estandariza esta tabla como hicimos en clientes y contratos"*
- *"Ponle el buscador omnibox y encabezados fijos a esta pantalla"*
- *"Adapta esta galería al protocolo sticky"*
