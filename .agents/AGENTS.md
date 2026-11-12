# Reglas de Comportamiento y Estándares - Frubana Express (FruFresco)

Este archivo define las reglas de negocio, estándares de desarrollo y mitigación de fallas críticas aprendidas para el proyecto FruFresco. Debe ser respetado por todos los agentes de codificación en este espacio de trabajo.

---

## 1. Procesamiento de Pedidos por Correo (Email Ingestion)

### 1.1. Extracción y Limpieza de Direcciones (Address Parsing)
* **Regla:** La dirección física debe extraerse de forma completamente limpia (únicamente la nomenclatura geográfica como calles, carreras, apartamentos y barrios).
* **Parada Crítica:** Para evitar que texto de comentarios, despedidas, saludos o solicitudes de cotización del cuerpo del correo se concatenen a la dirección, la recolección de líneas subsiguientes debe detenerse inmediatamente cuando se detecte cualquiera de las siguientes palabras clave:
  * `favor`, `confirmar`, `disponibilidad`, `productos`, `valor`, `total`, `pedido`, `saludo`, `gracias`, `atentamente`, `cordialmente`, `celular`, `teléfono`.
* **Prompt de IA:** El prompt de extracción de Gemini debe contener instrucciones explícitas para recortar cualquier mensaje adicional e ignorar comentarios del correo.

### 1.2. Mapeo de Fecha de Entrega (Delivery Date)
* **Regla:** El asunto (`subject`) del correo electrónico es una fuente primaria de información y debe ser provisto a los modelos de Gemini junto con el cuerpo del correo.
* **Regex Fallback (Prioridad):** Si el asunto del correo contiene una fecha explícita en formato `DD/MM/YYYY` o `YYYY-MM-DD`, esta debe tener precedencia absoluta y sobreescribir cualquier estimación o valor nulo calculado por la IA.

### 1.3. Identificación del Cliente (NIT vs. CC)
* **Regla:** En todas las pantallas de visualización de borradores y órdenes (`EmailDraftsModule` y relacionados), la etiqueta del documento de identidad del cliente debe ser dinámica:
  * Si el cliente es de tipo comercial (`b2b_client`), mostrar **NIT**.
  * Si el cliente es de tipo hogar/individual (`b2c_client`), mostrar **CC** (Cédula de Ciudadanía).

---

## 2. Equivalencias y Normalización de Unidades
* **Unidades Soportadas:** El sistema mapea estrictamente unidades de medida a los siguientes valores normalizados:
  * `Lb` (Libras), `Litro` (Litros), `Unidad` (Unidades/Huevos/Lechugas), `Paquete 250 gramos`, `Paquete 500 gramos`, `Kg` (Kilogramos), `Atado`, `Bulto`, `Canastilla`.
* **Regla de Conversión por Defecto:** Si un producto no tiene descripción de unidades en la orden o correo (ej. "12 huevos" o "1 lechuga crespa"), se debe asumir obligatoriamente la unidad de medida como **`Unidad`**.

---

## 3. Reglas de Git y Despliegue
* **Push a Remoto:** Queda estrictamente prohibido realizar `git push` a cualquier rama remota a menos que el usuario lo solicite expresamente. Las tareas deben completarse únicamente con commits locales.
* **Invariante 'use client':** En cualquier componente cliente, `'use client';` debe ser estrictamente la primera línea del archivo antes de cualquier import para evitar abortos silenciosos en el build de Vercel.
* **Verificación de Despliegues Vercel:** Ante reportes de versiones congeladas en producción, auditar de inmediato la compilación con `npm run build` para detectar bloqueos de Turbopack y verificar que el hash del commit en el Navbar coincida con el último commit de `main`.

---

## 4. Identificadores de Producto y Denominación de Categorías
* **Error Histórico SKU vs. Prevalencia Absoluta de `accounting_id` (Exclusivo FruFresco):** El campo `sku` en la base de datos de FruFresco fue un error del inicio del proyecto que no se pudo erradicar a tiempo y cuya eliminación física es peligrosa por dependencias relacionales históricas; por tanto, se convive con él exclusivamente en la capa de persistencia interna.
* **Prohibición Estricta en UI, Gráficas y Reportes:** En cualquier gráfica (ej. Pareto, barras, tendencias), galería, tarjeta de producto, modal, ranking, planilla Excel (.xlsx) o informe nuevo o modificado dentro de FruFresco, **DEBE PREVALECER de forma absoluta el `accounting_id` (ID Contable, renderizado como `#ID`)**. Queda terminantemente prohibido mostrar, etiquetar o requerir el campo `SKU` en la capa visual o de cara al usuario.
* **Nombres Completos de Categoría:** En toda la interfaz de usuario queda prohibido mostrar códigos abreviados de categoría (`VE`, `TU`, `FR`, `HO`, `DE`, `LA`, `CO`, `PR`). Se deben mapear siempre a sus nombres completos en español: **Verdura**, **Tubérculo**, **Fruta**, **Hortaliza**, **Despensa**, **Lácteo**, **Congelado**, **Procesado**.

---

## 5. Iconografía Exclusiva: Lucide Icons (Cero Emojis en UI)
* **Regla Invariable:** Todas las interfaces, tarjetas, tablas, modales, botones y badges deben utilizar exclusivamente componentes SVG vectoriales de `lucide-react`.
* **Cero Emojis:** Queda terminantemente prohibido el uso de emojis unicode (🥬, 🥦, 📦, 🍎, etc.) en cualquier capa visual o interactiva de la aplicación.
* **Transformación de Datos de BD:** Si registros de base de datos heredados contienen emojis o cadenas de texto en campos como `icon`, el código debe mapearlos obligatoriamente a componentes Lucide antes de renderizarlos.
* **Selectores de Iconos:** En modales donde el usuario elija un icono para un registro (como "Nueva Célula"), el selector debe componerse exclusivamente de opciones vectoriales de `lucide-react`.

---

## 6. Prohibición Perentoria de `products.base_price` (Artefacto Legado Zombi)
* **Regla Inmutable:** La columna `products.base_price` en PostgreSQL es un artefacto obsoleto de los inicios del sistema que **NO SE USA NUNCA PARA NADA**.
* **Prohibición Total:** Queda terminantemente prohibido utilizar, leer, auditar o justificar tarifas comerciales con base en `products.base_price`.
* **Fuentes Únicas y Soberanas de Tarificación:** Toda tarifa en FruFresco emana exclusivamente de:
  1. Acuerdos Comerciales Vigentes del Cliente (`quotes` / `quote_items` en estado `'agreement'`).
  2. Modelos Dinámicos de Precios (`pricing_models` y `pricing_model_prices`, ej. General Institucional, Clientes Hogar).
  3. Matriz de Costos + Reglas de Margen Comercial (`commercial_cost_matrix` + `pricing_rules`).
* **Poka-Yoke Anti-Falso Positivo:** Si un cliente B2B tiene acuerdo y `allow_off_agreement_purchases = true`, y pide un producto fuera del acuerdo que liquida tarifa en el modelo General Institucional, el ítem nace formalmente valorizado y queda estrictamente prohibido marcarlo como "despachado sin precio".

