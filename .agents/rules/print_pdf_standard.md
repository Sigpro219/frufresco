---
description: Estándar universal de impresión y exportación de documentos PDF (cotizaciones, facturas, actas, hojas de vida y reportes) en React / Next.js.
globs: src/**/print/**/*.tsx, src/**/print.tsx, src/**/*Print*.tsx, src/**/reports/**/*.tsx
---

# Regla: Estándar Universal de Impresión y Generación de PDF (FruFresco Standard)

Al crear o modificar vistas de impresión, reportes, cotizaciones, facturas o generadores de PDF:

1. **Inyección de CSS Crudo:** Inyectar siempre `<style dangerouslySetInnerHTML={{ __html: ... }} />` con `@page { size: letter portrait; margin: 1.1cm 1.3cm 1.3cm 1.3cm; }`, `html, body { margin: 0 !important; padding: 0 !important; background: white !important; }` y `print-color-adjust: exact !important`. NUNCA usar `<style jsx global>`.
2. **Prohibido `min-h-screen` / `100vh`:** Los contenedores de impresión deben tener altura automática (`height: auto; position: static; margin: 0; padding: 0;`) para garantizar exactamente 0 páginas en blanco al final.
3. **Tablas con Cabeceras Repetitivas:** Usar `thead { display: table-header-group; }` (repite encabezados de columna en la página 2+), `tfoot { display: table-row-group; }` (para totales cohesionados) y `tr { page-break-inside: avoid; }`.
4. **Celdas Numéricas Tabulares:** Formatear números y monedas con `font-variant-numeric: tabular-nums` y alineación a la derecha (`text-align: right`) con tipografía compacta de `7.8pt`.
5. **Marca de Agua Central Calibrada:** Opacidad máxima del 2.5% (`opacity: 0.025`), `position: fixed`, rotación `-30deg` y dimensiones controladas (`380px`).
6. **Sincronización de Logo y Título:** Pre-cargar imágenes con `new Image()`, asignar `document.title` con el consecutivo formateado del documento y disparar `window.print()` condicionado a `logoLoaded && !loading` con 500ms de gracia.
