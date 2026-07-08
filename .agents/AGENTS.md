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
