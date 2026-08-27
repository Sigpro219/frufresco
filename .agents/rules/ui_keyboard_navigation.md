---
description: Regla de ergonomía de navegación por teclado (TAB y Enter) en modales, formularios y captura de datos en React/Next.js.
globs: src/components/**/*.tsx, src/app/**/*.tsx
---

# Regla: Ergonomía de Teclado en Modales y Formularios

Al crear o modificar componentes de captura de datos, modales de producto, formularios de pedidos o terminales operativas:

1. **Auto-focus Inicial:** Todo modal o formulario de captura debe enfocar su primer control editable al abrirse (`ref.current.focus()` o `setTimeout(..., 80)`).
2. **Exclusión de Elementos No Esenciales (`tabIndex={-1}`):** Asignar `tabIndex={-1}` a:
   - Botones "Cancelar" o de cierre secundario.
   - Enlaces secundarios de edición o configuración rápida.
   - Inputs, badges o labels de solo lectura (como unidades calculadas, factores o totales).
3. **Flujo Lineal hacia Acción Principal:** El flujo de `TAB` debe ser estrictamente secuencial a través de los inputs necesarios hasta llegar directamente al botón de confirmación/adición (`tabIndex={0}`).
4. **Auto-select en Cantidades:** Todo input de cantidad o numérico debe seleccionar su texto al recibir foco (`onFocus={e => e.target.select()}`).
5. **Doble Flujo con Enter:** Soportar tanto la navegación por `[TAB]` como el avance/confirmación instantánea con `[Enter]` entre controles.
