# Estándar de Selectores y Modales para el Módulo de Pedidos

Este estándar define los patrones obligatorios de interfaz, lógica y experiencia de usuario (UX) para la búsqueda de productos y parametrización de variantes en el **Módulo de Pedidos** (`/admin/orders/create`, `/admin/orders/loading`, `EmailDraftsModule.tsx`, `VariantModal.tsx`).

---

## 1. Desplegable de Búsqueda Inteligente (El Pareto de Pedidos)

1. **Priorización Pareto / Hábitos de Cliente:**
   - Si el cliente tiene histórico de compra del producto, desplegar la insignia destacada: `⭐ Habitual`.
   - Mostrar el **Alias Comercial del Cliente** (`exc.nickname`) si difiere del nombre canónico en catálogo.
2. **Atributos Pre-fijados Visibles:**
   - Mostrar en la fila del desplegable la combinación fija activa del cliente (ej. `• Pintón • Kg`).
3. **Control de Escasez y Stock:**
   - Si el producto tiene bloqueo nacional por abastecimiento (`is_scarcity_locked === true`), renderizar la etiqueta roja `AGOTADO POR ESCASEZ` y restringir su adición.
4. **Identificación Contable & Tarifa en Vivo:**
   - Mostrar siempre el `ID Contable` (`accounting_id` o `sku`) junto al nombre del producto para evitar errores de facturación.
   - Reflejar el precio resuelto específicamente para el cliente y fecha de entrega activa (`contractPrices[p.id]`).
5. **Navegación 100% por Teclado:**
   - Las flechas `ArrowUp` y `ArrowDown` deben navegar fluidamente entre los resultados del desplegable.
   - `Tab` o `Enter` abren el modal de personalización o agregan el producto sin requerir el mouse.

---

## 2. Modal de Personalización Avanzada (Variant / Customizing Modal)

1. **Banner de Reglas Fijas y Notas:**
   - Si el cliente tiene una regla configurada (`exc.preferred_options`), mostrar el banner verde: `PREFERENCIA ESTRUCTURADA ACTIVA` junto a la nota de origen (`exc.picking_note`).
   - Proveer botones de acción inmediata: `[ Actualizar regla fija ]` y `[ Desfijar ]`.
   - Si el cliente cuenta únicamente con una nota informal en texto, mostrar el botón: `[ Fijar combinación para {Cliente} ]`.
2. **Control de Venta Mínima:**
   - Si el producto tiene política de volumen mínimo (`getProductMinSaleKg`), destacar la insignia de advertencia: `Mínimo: X kg`.
3. **Cálculo de Gramaje Dinámico:**
   - Al seleccionar cualquier empaque, presentación o calibre, computar automáticamente en tiempo real el factor multiplicador (`dynamicUnitFactor`) y proyectar el total en `Kg` netos para cubicaje, inventario y facturación.
4. **Accesos Directos de Mantenimiento:**
   - Proveer enlaces discretos superiores a `[ ⚙️ Editar Variantes ]` y `[ 🔄 Editar Equivalencias ]` para parametrización rápida sin abandonar el pedido.
5. **Ergonomía de Entrada Rápida:**
   - Auto-focus en el primer selector o en la cantidad (`modal-qty-input`).
   - Al pulsar `Enter`, guardar y cerrar el modal insertando el producto en el carrito en menos de 1 segundo.
