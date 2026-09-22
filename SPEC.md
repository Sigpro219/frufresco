# FruFresco - Especificación de Arquitectura & Contrato de Negocio (SDD)
## Módulo de Pedidos: Pipeline Unificado de Ingesta (Manual vs Automático)

> **Versión:** 1.7.0 (Módulo Comercial: Reingeniería Matriz de Costos — Dos Caminos, Último Precio Real, Circuit Breaker >20% & Pareto de SLAs por Frecuencia)  
> **Fecha:** 22 de Septiembre, 2026  
> **Estado:** 🟢 Aprobado & Activo en Contrato  
> **Área:** Logística, Ventas, Compras & Operaciones (B2B / B2C)

---

## 1. Misión del Sistema & Principio de Equivalencia Operativa

### Propósito del Dominio
El Módulo de Pedidos de FruFresco centraliza la recepción, interpretación, valorización y programación logística de pedidos institucionales (B2B) y de hogares (B2C), independientemente de su canal de entrada.

### Regla de Dominio: Jerarquía Matriz vs Sucursales
> **«En clientes corporativos (HORECA, cadenas y grupos empresariales), el NIT pertenece a la persona jurídica matriz y es heredado por sus diferentes sedes. Sin embargo, los pedidos, la programación de despacho, la georreferenciación y la entrega física SIEMPRE se consignan y ejecutan a nivel de Sucursal. Por diseño, las validaciones de auditoría deben permitir y respetar esta relación sin generar fricción ni bloquear la operación cuando el NIT del documento coincida con la matriz pero la entrega se dirija a una sucursal específica.»**

### Principio Rector de Equivalencia Operativa
> **«Para el operador logístico, procesar una orden de compra recibida por correo electrónico es conceptual, visual y funcionalmente equivalente a procesar un archivo PDF/Excel subido manualmente. El resultado final en ambos mundos es invariable: un pedido oficial en estado `pending_approval` programado para la operación del día siguiente, con la misma fidelidad contable, fiscal y de cubicación física.»**

---

## 2. Mapa de Arquitectura: Pipeline Unificado

```
                             FUENTES DE ENTRADA
           ┌─────────────────────────┴─────────────────────────┐
           ▼                                                   ▼
   [MODO AUTOMÁTICO]                                   [MODO MANUAL]
   Inbound Webhook Email                               Carga de Documento / Formulario
   (/api/orders/email-ingest)                          (/admin/orders/create)
           │                                                   │
           ▼                                                   ▼
   order_drafts (Bandeja Borradores)                   Mesa de Trabajo / Staging Table
           │                                                   │
           └─────────────────────────┬─────────────────────────┘
                                     ▼
                      [CEREBRO LÓGICO COMPARTIDO]
                     src/lib/orders/order-parser-engine.ts
                     ├── Gemini 2.5 Flash / Flash-Lite OCR
                     ├── resolveClientProfile (Multisede/NIT/Emails)
                     ├── findBestProductMatchDetails (Tokens + Catálogo)
                     └── document_learning_memory (Auto-Aprendizaje)
                                     │
                                     ▼
                     [MESA DE TRABAJO & RECONCILIACIÓN]
                     ├── Visor Polimórfico (ExcelTableViewer / PdfCanvas)
                     ├── Validación de Discrepancias Fila por Fila
                     ├── Detección de Tarifas de Contrato / Precios
                     ├── 🔄 Re-analizar con IA sin perder archivo
                     └── ➕ Agregar Ítem Manual en la Mesa de Trabajo
                                     │
                                     ▼
                          [PERSISTENCIA CANÓNICA]
                          orders (Cabecera) + order_items (Detalle)
                          status: 'pending_approval' | delivery_date: D+1
                          ├── Cálculo exacto de IVA (iva_rate por SKU)
                          ├── Cálculo exacto de peso total (total_weight_kg)
                          ├── ⚡ Confirmación Directa en 1 Clic
                          └── Rollback atómico en caso de falla parcial
```

---

## 3. Matriz Comparativa de Capacidades: Email vs Carga por Documento

| Capacidad / Feature | Ingesta por Email (`EmailDraftsModule`) | Carga de Documentos (`create/page.tsx`) | Estado de Paridad |
| :--- | :--- | :--- | :--- |
| **Visor de Archivos** | `ExcelTableViewer` interactivo + PDF Canvas | `ExcelTableViewer` interactivo + PDF Canvas | 🟢 Paridad Total |
| **Motor de Extracción IA** | `order-parser-engine.ts` | `order-parser-engine.ts` | 🟢 Paridad Total |
| **Memoria de Aprendizaje** | Escribe y lee en `document_learning_memory` | Escribe y lee en `document_learning_memory` | 🟢 Paridad Total |
| **Detección de Fecha Entrega** | Auto-asigna `deliveryDate` del documento | Auto-asigna `deliveryDateInDocument` con validación D+1 | 🟢 **Resuelto (Paridad 100%)** |
| **Flujo de Aprobación** | Aprobación en 1 Clic (`approve-draft`) | ⚡ Botón Inmediato en Mesa + opción Inyectar Carrito | 🟢 **Resuelto (Paridad 100%)** |
| **Cálculo Fiscal (IVA)** | Cálculo por ítem según `iva_rate` de cada SKU | Cálculo dinámico por ítem según SKU | 🟢 **Resuelto (Paridad 100%)** |
| **Cálculo de Peso (Kilos)** | Totaliza `total_weight_kg` para cubicación camión | Totaliza `total_weight_kg` para cubicación camión | 🟢 **Resuelto (Paridad 100%)** |
| **Re-parseo / Reintento IA** | Botón para forzar re-extracción con IA | Botón "🔄 Re-analizar con IA" en Mesa de Trabajo | 🟢 **Resuelto (Paridad 100%)** |
| **Agregar Producto Extra** | Botón "Agregar Producto" en la mesa | Botón "+ Agregar Ítem Manual" en Mesa de Trabajo | 🟢 **Resuelto (Paridad 100%)** |
| **Rechazo / Descarte** | Modal de rechazo con notificación email | Botón "Cancelar / Limpiar" | 🟢 Paridad por Diseño |
| **Transaccionalidad ACID** | Rollback de cabecera si falla detalle | Rollback atómico client-side si falla inserción | 🟢 **Resuelto (Paridad 100%)** |
| **Persistencia Documental (`document_url`)** | Vincula adjunto del borrador a `orders.document_url` | Sube a Storage y vincula a `orders.document_url` | 🟢 **Resuelto (Paridad 100%)** |

---

## 4. Resoluciones Técnicas Detalladas (Contratos SDD Cumplidos)

### ✅ DEUDA TÉCNICA 1: Auto-completado de Fecha de Entrega en Carga Manual
- **Implementación:** En `src/app/admin/orders/create/page.tsx` (`parseOrderWithAI`), cuando `data.deliveryDateInDocument` está presente, se normalizan múltiples formatos (`YYYY-MM-DD`, `DD/MM/YYYY`, ISO), se valida contra la fecha mínima de operación (`minDeliveryDate`), y se asigna a `setDeliveryDate` con un feedback visual claro vía `showToast`.
- **Criterio de Aceptación:** Cumplido. La fecha extraída por la IA ya no se pierde y el operador no tiene que seleccionarla manualmente a menos que desee modificarla.

### ✅ DEUDA TÉCNICA 2: Paridad Financiera e IVA en Aprobación de Correos
- **Implementación:** En `src/app/api/orders/email-drafts/approve/route.ts`, se consultan en lote los productos de la orden para obtener su `iva_rate`. Se calcula el impuesto individualmente con la fórmula canónica de FruFresco (`itemTotal * (rate / (100 + rate))`) y se persisten `subtotal`, `tax` y `total` consistentes contablemente con la DIAN y el modo manual.
- **Criterio de Aceptación:** Cumplido. La aprobación de borradores ya no quema `$0` en impuestos y coincide 1:1 con el modo manual.

### ✅ DEUDA TÉCNICA 3: Cubicación y Peso Logístico en Aprobación de Correos
- **Implementación:** En `src/app/api/orders/email-drafts/approve/route.ts`, se totaliza el peso en kilogramos (`total_weight_kg`) considerando la unidad de medida (`unit_of_measure`), factores para libras (0.5 kg) o el peso específico del SKU (`weight_kg`). Este valor se guarda en la cabecera `orders` y permite al módulo de transporte cubicar la capacidad de carga del camión (ej. 2000 kg o canastillas).
- **Criterio de Aceptación:** Cumplido. Los pedidos nacidos de correo ahora tienen cubicaje exacto.

### ✅ DEUDA TÉCNICA 4: Botón de Aprobación Directa en Mesa de Trabajo de Documentos
- **Implementación:** En `src/app/admin/orders/create/page.tsx`, se añadió la función `handleDirectConfirmOrder` y el botón `⚡ Confirmar y Crear Pedido Inmediato` en el footer de la Mesa de Trabajo. Sube silenciosamente el archivo a `order-attachments`, guarda la memoria de aprendizaje, crea la orden con `origin_source: 'document_upload'`, inserta los ítems, encola el correo de confirmación y redirige a `/admin/orders/loading`. Además, se conserva intacto el botón tradicional `Confirmar e Inyectar al Pedido` para no romper flujos previos.
- **Criterio de Aceptación:** Cumplido. Aprobación en un solo clic disponible para operadores experimentados sin sacrificar la inyección tradicional.

### ✅ DEUDA TÉCNICA 5: Resiliencia de IA: Botón de Re-intento de Extracción
- **Implementación:** En `src/app/admin/orders/create/page.tsx`, se incluyó el botón `🔄 Re-analizar con IA` en la cabecera de la Mesa de Trabajo. Si una lectura resultó incompleta o se desea re-ejecutar el análisis multimodal, el operador pulsa el botón y el sistema re-invoca `parseOrderWithAI(uploadedFile)` usando el archivo en memoria sin obligar a recargar la página ni a seleccionar el archivo nuevamente.
- **Criterio de Aceptación:** Cumplido. Resiliencia inmediata en la interfaz.

### ✅ DEUDA TÉCNICA 6: Capacidad de Agregar Productos Faltantes en Mesa de Trabajo
- **Implementación:** En `src/app/admin/orders/create/page.tsx`, se implementó `handleAddStagedRow` y el botón `+ Agregar Ítem Manual a la Mesa de Trabajo` al pie de la tabla de staging. Permite agregar una fila manual de forma inmediata, activar el dropdown de autocompletado y asociar un producto y cantidad sin tener que inyectar al carrito previamente.
- **Criterio de Aceptación:** Cumplido. Paridad ergonómica completa con el módulo de correos.

### ✅ DEUDA TÉCNICA 7: Transaccionalidad Atómica y Rollback de Órdenes Huérfanas
- **Implementación:** Tanto en `handleSubmit` tradicional como en `handleDirectConfirmOrder` en `src/app/admin/orders/create/page.tsx`, si la inserción en `order_items` experimenta un fallo o micro-desconexión, se ejecuta inmediatamente una compensación de rollback eliminando la orden recién creada (`await supabase.from('orders').delete().eq('id', newOrder.id)`), previniendo la proliferación de registros huérfanos en la base de datos.
- **Criterio de Aceptación:** Cumplido. Integridad referencial garantizada.

### ✅ DEUDA TÉCNICA 8: Trazabilidad y Propagación de `document_url` en la Aprobación de Correos
- **Diagnóstico:** Los pedidos creados por carga manual de PDF/Excel subían el documento al bucket `order-attachments` y guardaban la URL en `orders.document_url`, permitiendo que en `/admin/orders/loading` se mostrara el botón interactivo "Ver Anexo ↗". Sin embargo, en la ingesta por correo (`EmailDraftsModule` y `/api/orders/email-drafts/approve`), el archivo se almacenaba en `order_drafts.extracted_items[0].attachmentUrl` pero al momento de confirmar/aprobar el borrador hacia la tabla `orders`, el campo `document_url` se omitía (quedaba `null`), perdiendo el acceso visual al soporte original.
- **Implementación:**
  - En `src/components/EmailDraftsModule.tsx` (tanto en la confirmación directa `handleConfirmOrderDirectly` como en el modal de confirmación `onConfirm`), se extrae `draftAttachmentUrl` de los anexos del borrador (`metadata?.attachments[selectedAttachmentIndex]?.url || metadata?.attachmentUrl || metadata?.attachments?.[0]?.url`) y se asigna a `document_url` al insertar la cabecera en `orders`.
  - En `src/app/api/orders/email-drafts/approve/route.ts`, se recibe `documentUrl` del payload, o de forma reactiva y autónoma se consulta `order_drafts` para extraer el `attachmentUrl` de los metadatos de extracción, insertándolo en `orders.document_url`.
- **Criterio de Aceptación:** Cumplido. Cualquier orden originada por un documento (correo electrónico o carga manual directa) queda enlazada permanentemente a su archivo físico en `orders.document_url`, garantizando auditoría contable y despacho con visualización del anexo en un solo clic.

### ✅ DEUDA TÉCNICA 9: Enlace Directo «Abrir Original ↗» en Adjuntos de Borradores de Correo
- **Diagnóstico:** En los chips de adjuntos de `EmailDraftsModule.tsx`, el operador únicamente disponía de un evento de clic para conmutar el archivo dentro del visor integrado canvas, sin un acceso directo para abrir el PDF/Excel original en una pestaña nueva del navegador (`target="_blank"`), dificultando la impresión o el zoom nativo rápido.
- **Implementación:** Se incorpora en cada chip un botón de acceso directo con el icono `ExternalLink` apuntando a `att.url` con `stopPropagation()`.
- **Criterio de Aceptación:** Cumplido. El operador puede abrir el documento original en pestaña nueva de forma autónoma con 0% de alteración en la lógica de negocio.

### ✅ DEUDA TÉCNICA 10: Herencia Automática de Fecha de Entrega en Nuevas Filas de Mesa de Trabajo
- **Diagnóstico:** Al presionar `+ Agregar Ítem Manual a la Mesa de Trabajo` en `src/app/admin/orders/create/page.tsx`, la fila recién creada inicializaba sus campos de fecha en `null`, obligando al usuario a reingresar o recordar la fecha de entrega asignada en la cabecera.
- **Implementación:** En `handleAddStagedRow`, se inicializan `deliverySchedule` y `deliveryDate` con la fecha activa de la orden (`deliveryDate || minDeliveryDate`).
- **Criterio de Aceptación:** Cumplido. Cualquier ítem manual añadido a la mesa hereda de inmediato la fecha programada.

### ✅ DEUDA TÉCNICA 11: Higiene Estática de Tipos TypeScript en Componentes de Gestión
- **Diagnóstico:** Se identificó en `src/components/FinancialAdjustmentModal.tsx` una propiedad de estilo duplicada (`border: 'none'` y `border: '1px solid #E2E8F0'`) provocando el error de compilación `TS1117`, así como un cast estricto de tipo unión para novedades operativas (`handleItemNoveltyTypeChange`).
- **Implementación:** Se removió la clave redundante y se tipó formalmente el parámetro del select.
- **Criterio de Aceptación:** Cumplido. Build limpio y cero errores estáticos en el módulo.

---

## 5. Verificación & Conclusiones
- **Compilación:** Verificada con TypeScript (`tsc --noEmit`), garantizando cero errores en los componentes y rutas del módulo de pedidos.
- **Arquitectura:** Mantiene compatibilidad total hacia atrás (Non-destructive addition). Ambos métodos de entrada (Email y Carga Manual) operan ahora bajo los mismos estándares contables, operativos y de interfaz.

---

## 6. Gobernanza de Despliegue, Infraestructura Git & Resguardo de Producción

### Principio de Invarianza Operativa y Cero Riesgo
- **Ambiente de Producción Activo:** `https://frufresco-liard.vercel.app/` alimentado por la rama `liard` y sincronizado canónicamente con `main`.
- **Estrategia de Ramificación:** Se determinó mantener activas y sincronizadas al 100% las 7 ramas remotas (`main`, `liard`, `CORE`, `core`, `tenant-frufresco`, `tenant1`, `white-label`), garantizando que:
  1. No exista riesgo de desconexión o desconfiguración de dominios, variables de entorno o webhooks en Vercel.
  2. Todas las ramas apunten al mismo commit de referencia en cada entrega.
  3. No se elimine ninguna rama histórica, asegurando continuidad operativa absoluta.
- **Snapshot Inmutable de Seguridad (Git Tag):**
  - **Tag:** `backup-seguridad-arquitectura-20260921`
  - **Función:** Registro congelado en GitHub con paridad total y cero diferencias (`0 0`), protegiendo la base de código ante cualquier contingencia.

---

## 7. Módulo Comercial: Especificación de Arquitectura & Contrato de Negocio

> **Versión del Módulo:** 1.0.0 (Consolidado post Grill-Me Brownfield)  
> **Fecha de Entrada en Vigor:** 22 de Septiembre, 2026  
> **Estado:** 🟢 Aprobado & Activo en Contrato  
> **Ruta Canónica:** `/admin/commercial` | [http://localhost:3001/admin/commercial](http://localhost:3001/admin/commercial)  
> **Área:** Gestión Comercial, Finanzas, Compras y CRM B2B/B2C

### 7.1 Misión & Principio Rector Comercial
El Módulo Comercial de FruFresco gobierna la fijación estratégica de precios, la protección estricta del margen bruto operativo ante la volatilidad de Corabastos, la emisión de cotizaciones formales para prospectos/clientes y la congelación vinculante de tarifas mediante Acuerdos Comerciales auditables.

### 7.2 Jerarquía Canónica de Precios (6 Niveles de Prevalencia)
Cuando el sistema consulta el precio de un producto para un cliente o sucursal, debe evaluar en estricto orden descendente:
1. **Nivel 1 (Prevalencia Máxima - Acuerdo Sucursal):** Acuerdo Comercial Vigente (`quotes.status = 'agreement'`) asignado directamente a la sucursal (`client_id = sucursal.id`).
2. **Nivel 2 (Acuerdo Matriz):** Acuerdo Comercial Vigente asignado a la empresa matriz (`client_id = sucursal.parent_id`).
3. **Nivel 3 (Campañas Promocionales B2B):** Si el SKU no tiene precio congelado por acuerdo, aplican las campañas activas de precio fijo o ajuste porcentual (`commercial_campaigns`).
4. **Nivel 4 (Modelo Directo de Cliente):** Modelo de Precios asignado al perfil (`profiles.pricing_model_id`).
5. **Nivel 5 (Modelo Heredado Matriz):** Modelo asignado a la matriz (`profiles.parent.pricing_model_id`), o en su defecto `General Institucional` (`d90a91e5-827c-473d-9d4f-3e28c7c91e15`) si es cliente B2B.
6. **Nivel 6 (Base Catálogo / B2C):** Lista `Clientes Hogar` (`f7043ca1-94d5-4d25-bd10-fbf30ce120ee`) reflejada en `products.base_price`.

> **Regla de Inmunidad Contractual de Acuerdos:**  
> Los precios pactados bajo un Acuerdo Comercial formal representan un contrato vinculante. Por seguridad jurídica y protección del margen, **las Campañas Comerciales NUNCA alteran ni perforan los precios de productos que formen parte de un Acuerdo Comercial activo**. Las campañas solo modulan productos de catálogo o modelos no cobijados por dicho acuerdo.

### 7.3 Contratos Matemáticos Canónicos (Reglas Inmutables)

#### A. Fórmula Oficial de Margen de Venta (Gross Margin)
Queda prohibido el markup multiplicador sobre costo en precios de venta institucionales. La fórmula oficial y vinculante es el **Margen Comercial sobre Venta**:
$$\text{Precio Unitario Antes de IVA} = \frac{\text{Costo Neto Efectivo}}{1 - \left(\frac{\text{Margen\%}}{100}\right)}$$
*Ejemplo:* Con Costo Neto Efectivo \$1.000 y Margen del 20%:
$$\text{Precio} = \frac{1000}{1 - 0.20} = \$1.250 \quad (\text{Margen real en P&L: } 20.0\%)$$

#### A.1 Factor de Merma Teórica en Costo Efectivo (GAP-02)
Para evitar pérdidas ocultas de entre 5% y 25% de margen bruto en perecederos de alto desecho (lechugas, fresas, hierbas, frutas delicadas), el costo base de adquisición se infla obligatoriamente por la merma teórica del SKU antes de aplicar el margen comercial:
$$C_{\text{efectivo}} = \frac{C_{\text{base}}}{1 - \left(\frac{\text{theoretical\_shrinkage\_pct}}{100}\right)}$$
*Ejemplo:* Con Costo Base \$1.000 y Merma Teórica del 15%:
$$C_{\text{efectivo}} = \frac{1000}{1 - 0.15} = \$1.176,47$$
$$\text{Precio Antes de IVA (con 20% Margen)} = \frac{1176,47}{1 - 0.20} = \$1.470,59 \longrightarrow \mathbf{\$1.500\text{ COP}}$$

#### B. Redondeo Comercial Colombiano
Todo precio unitario cotizado o tarificado antes de impuestos se redondea hacia arriba al múltiplo de \$50 COP más cercano:
$$\text{Precio Redondeado} = \left\lceil \frac{\text{Precio Unitario Antes de IVA}}{50} \right\rceil \times 50$$

#### C. Presentación Fiscal & Desglose de IVA
1. En cotizaciones (PDF, Excel, WhatsApp) y pantallas de negociación, el **precio unitario por SKU se presenta siempre ANTES de IVA**.
2. Los renglones identifican la tarifa de IVA aplicable (0% excluido para la mayoría de frescos, 5% o 19% para procesados/despensa).
3. El IVA total se calcula individualmente por ítem y se totaliza en el pie de la cotización (`subtotal_amount`, `total_tax_amount`, `total_amount`).

#### D. Vigencia Contractual Canónica de Cotizaciones (GAP-11)
Las cotizaciones institucionales y propuestas B2B poseen una vigencia vinculante estricta de **ocho (8) días calendario**. Queda prohibida la fijación o congelación de precios a 30 días en cotizaciones previas al acuerdo formal para salvaguardar la empresa ante la volatilidad de Corabastos. La vigencia en cabecera y en cláusulas legales debe coincidir exactamente en 8 días.

### 7.4 Reingeniería de la Matriz de Costos: Dos Caminos, Último Precio Real, Circuit Breaker & Pareto de Frescura

#### A. Filosofía de Transparencia y Abandono de Algoritmos Complejos
Queda estrictamente erradicado el uso de fórmulas de alisamiento predictivo o modelos de regresión temporal (Holt-Winters, medias móviles de 8 compras) para fijar el costo base de productos agrícolas. En alimentos perecederos y Corabastos, **el costo base es el último precio real pagado en báscula o cotizado en plaza**.

#### B. Los Dos Caminos Canónicos de Entrada
1. **Camino A (Compras / Operaciones):**
   - Precios registrados en el módulo de compras (`purchases` / `purchase_history_normalized`).
   - Se extrae siempre el **ÚLTIMO PRECIO registrado** de compra como referencia activa.
2. **Camino B (Carga Manual / Directa en Matriz):**
   - Modificación directa por el área comercial o importación masiva de Excel.
   - Genera la versión más reciente del costo y se convierte de inmediato en la **nueva realidad comercial**.

#### C. Poka-Yoke: Circuit Breaker de Volatilidad (+/- > 20%)
1. **Cálculo de Desvío:** Ante cualquier nuevo registro de costo (Camino A o Camino B), el sistema evalúa:
   $$\text{Variación\%} = \frac{|\text{Precio Nuevo} - \text{Costo Vigente Anterior}|}{\text{Costo Vigente Anterior}} \times 100$$
2. **Comportamiento si Variación $\le$ 20%:** El nuevo precio se adopta automáticamente como Costo Base Oficial.
3. **Comportamiento si Variación > 20% (Discrepancia Crítica):**
   - **Congelamiento de Seguridad:** El sistema **mantiene congelado el costo anterior** para proteger las cotizaciones y ventas en curso.
   - **Alerta Andon en Matriz Comercial:** Se levanta una alarma visual prominente de *«Alerta de Volatilidad (+/- X%) - Requiere Validación»*.
   - **Resolución Humana Obligatoria:** Exclusivamente el **Jefe / Dueño del Módulo Comercial** puede pulsar `[Aprobar Precio]` o `[Ingresar Costo Manual]`. La decisión humana queda asentada en `audit_logs` y define la nueva verdad del sistema.

#### D. Pareto de SLAs de Frescura por Frecuencia de Compra/Movimiento (Arazá vs Papa)
Para evitar la distorsión por densidad de masa (donde 70 toneladas de papa opacan 40 kilos de arazá o hierbas de alta rotación), el catálogo activo de 552 SKUs se clasifica dinámicamente en **Terciles de Frecuencia Transaccional** ($\sum$ de órdenes de compra y movimientos de inventario):

1. **Tercil 1 (T1 - Pulso Diario / Críticos):**
   - **Criterio:** Top 33% de productos con mayor frecuencia de compras registradas.
   - **SLA de Frescura:** **4 días calendario**.
   - **Vencimiento:** Pasa a estado `VENCIDO` si no hay compra ni cotización en > 4 días. Constituye una **Tarea Urgente Roja** en la bandeja comercial.
2. **Tercil 2 (T2 - Rotación Media):**
   - **Criterio:** 33% intermedio de recurrencia transaccional.
   - **SLA de Frescura:** **8 días calendario**.
   - **Vencimiento:** Pasa a estado `VENCIDO` en > 8 días. Revisión en la ronda semanal de abastecimiento.
3. **Tercil 3 (T3 - Baja Frecuencia / Catálogo Extendido):**
   - **Criterio:** 34% de menor frecuencia (o productos sin compras recientes).
   - **SLA de Frescura:** **15 días calendario**.
   - **Vencimiento:** Pasa a estado `VENCIDO` en > 15 días. Revisión quincenal de lista.

#### E. Gobernanza de Cotizaciones ante Costos Vencidos
1. El recálculo de precios no se ejecuta en línea de forma descontrolada; se administra de manera periódica.
2. Si un producto con costo vencido es incluido en una cotización comercial:
   - El sistema **utiliza el último costo autorizado vigente** para no paralizar la emisión de propuestas.
   - Genera una alerta interna para que el comercial coordine el cuadre de precio con el **Jefe Comercial**, quien tiene la potestad de autorizar el precio antes del cierre formal del acuerdo.

#### F. Costo Efectivo Inmutable (Factor de Merma Teórica)
Sobre el Costo Base adoptado (sea de Camino A o Camino B), se aplica siempre la fórmula canónica de protección contra merma:
$$C_{\text{efectivo}} = \frac{C_{\text{base}}}{1 - \left(\frac{\text{theoretical\_shrinkage\_pct}}{100}\right)}$$

### 7.5 Ciclo de Vida Canónico de Cotizaciones & Acuerdos

```
[PROSPECTO / CLIENTE] ──> [COTIZACIÓN DRAFT] ──> [SENT]
                                                    │
                   ┌────────────────────────────────┴────────────────────────────────┐
                   ▼                                                                 ▼
              [REJECTED]                                                        [ACCEPTED]
                                                                                     │
                                                                                     ▼
                                                                       [ACUERDO COMERCIAL FORMAL]
                                                                        status: 'agreement'
                                                                        start_date | valid_until
                                                                        ├── Congela precios en CRM
                                                                        └── Se inyecta en Pipeline
                                                                            de Pedidos (D+1)
```

1. **Principio de Acuerdo Obligatorio:** Toda cotización que un cliente aprueba se formaliza como un **Acuerdo Comercial** (`status = 'agreement'`) con fecha de inicio y de vencimiento (`valid_until`).
2. **Consumo Automático:** Al ingresar una orden de compra manual o por correo (`/admin/orders/create` o `/api/orders/email-ingest`), el motor de resolución de precios busca si el cliente o su matriz tiene un acuerdo comercial activo; si existe, sus precios congelados se asignan automáticamente a los ítems del pedido con máxima prioridad.

### 7.6 Matriz de Tareas Atómicas de Alineación (SDD Roadmap)
- [x] **Tarea COM-1:** Actualizar `src/lib/pricingUtils.ts` para que la función `recalculateAndSyncProductPrices` y `batchRecalculateAndSyncPrices` usen la fórmula canónica de margen sobre venta $\frac{\text{Costo}}{1 - M}$ y mantengan el redondeo a $50 COP antes de impuestos.
- [x] **Tarea COM-2:** Estandarizar `src/app/admin/commercial/quotes/create/page.tsx` para aplicar el redondeo a múltiplos superiores de $50 COP en el precio unitario antes de IVA y en variantes.
- [x] **Tarea COM-3:** Asegurar que la acción de aceptación en `quotes/[id]/page.tsx` priorice la formalización canónica hacia Acuerdo Comercial (`status = 'agreement'`) y registre el log de auditoría correspondiente en `audit_logs`.
- [x] **Tarea COM-4:** Verificar y blindar en `orders/create/page.tsx` y `EmailDraftsModule.tsx` la prevalencia estricta de Nivel 1 (Acuerdo Sucursal) sobre Nivel 2 (Acuerdo Matriz).
- [x] **Tarea COM-5 (Brecha 1):** Sustituir IVA hardcodeado en `activate-agreement/route.ts` por cálculo dinámico por producto (`item.matched_product?.iva_rate`), desglose por ítem y trazabilidad en `audit_logs`.
- [x] **Tarea COM-6 (Brecha 2):** Eliminar referencia a columna inexistente `target_price` en `commercial-parser-engine.ts` y aplicar la fórmula canónica de margen sobre venta $\frac{\text{Costo}}{1 - 0.20}$ con redondeo a $50 COP.
- [x] **Tarea COM-7 (Brecha 3):** Blindar la Inmunidad Contractual de Acuerdos: Las campañas comerciales modulan productos de catálogo libre, pero nunca perforan ítems pactados bajo acuerdo comercial activo.
- [x] **Tarea COM-8 (Brecha 4):** Diferenciar visualmente los acuerdos de Sucursal (`<Building />`) vs Matriz (`<Building2 />`) en el panel de Acuerdos Comerciales (`CommercialAgreementsModule.tsx`).
- [x] **Tarea COM-9 (Brecha 5):** Formalizar el contrato operativo del módulo de Facturación Comercial, Cortes AM/PM/ADJ y Cartera en la Sección 7.7.
- [x] **Tarea COM-10 (Brecha 6):** Conectar la acción por lotes en `cost-matrix/page.tsx` para autorizar costos del Motor Adaptativo (`calculateSmartCost` $\to$ `adaptivePricingEngine.ts`) con auditoría en `audit_logs`.
- [x] **Tarea COM-11 (Fase 1 / GAP-01):** Implementar interlock runtime `checkClientCreditStatus` en `orders/create/page.tsx` bloqueando pedidos que excedan `credit_limit` o tengan mora en `billing_invoices`, con excepción autorizada en `audit_logs` (`CREDIT_LIMIT_EXCEPTION_AUTHORIZED`).
- [x] **Tarea COM-12 (Fase 1 / GAP-02):** Incorporar factor de merma teórica (`theoretical_shrinkage_pct`) en `pricingUtils.ts` para costo efectivo $C_{\text{efectivo}} = \frac{C_{\text{base}}}{1 - (\text{Merma\%}/100)}$.
- [x] **Tarea COM-13 (Fase 1 / GAP-03):** Blindar fallback B2B para que SKUs sin acuerdo asignado consuman precios de General Institucional, evitando precios minoristas Hogar B2C.
- [x] **Tarea COM-14 (Fase 1 / GAP-07 & 08):** Corregir error PostgreSQL 42703 en campañas (`is_active`) y en clientes (derivación relacional de órdenes).
- [x] **Tarea COM-15 (Fase 2 / GAP-05):** Migrar `xlsx` a dynamic imports (`await import('xlsx')`) en los 4 módulos cliente, aliviando ~700KB por vista.
- [x] **Tarea COM-16 (Fase 2 / GAP-13):** Convertir inserción secuencial de facturación en lote atómico `supabase.from('billing_invoices').insert(...)`.
- [x] **Tarea COM-17 (Fase 2 / GAP-04 & 12):** Acotar historial de compras a 60 días en `cost-matrix/page.tsx` y memorizar `<Sparkline />` con `React.memo`.
- [x] **Tarea COM-18 (Fase 3 / GAP-09 & 10):** Retirar scrollbox rígido en acuerdos comerciales y corregir `position: fixed` a `position: absolute` en impresión de acuerdos para paginación continua.
- [x] **Tarea COM-19 (Fase 3 / GAP-11 & 14):** Unificar vigencia contractual a 8 días calendario y substituir emojis de texto por iconos Lucide.
- [x] **Tarea COM-20 (Fase 3 / GAP-15, 16, 17 & 18):** Toolbar *Frosted Glass* y cifras tabulares `text-right` en facturación, Sello de Garantía Operativa B2B, sincronización `payment_terms_days` a `profiles.payment_days` y supresión de páginas en blanco en PDF.
- [x] **Tarea COM-21 (Reingeniería Matriz / Dos Caminos):** Erradicar algoritmos de regresión/alisamiento e implementar regla del Último Precio Real (Camino A: Compras vs Camino B: Manual).
- [x] **Tarea COM-22 (Reingeniería Matriz / Circuit Breaker):** Implementar Poka-Yoke de Volatilidad (+/- > 20%) con congelamiento preventivo del costo previo y alerta visual para aprobación del Jefe Comercial.
- [x] **Tarea COM-23 (Reingeniería Matriz / Pareto de Frescura):** Implementar clasificación dinámica en 3 Terciles por frecuencia transaccional (T1: 4d, T2: 8d, T3: 15d).
- [x] **Tarea COM-24 (Reingeniería Matriz / UI & Filtros de Tercil):** Incorporar badges de tercil, chips de filtrado rápido (`[T1: Críticos]`, `[T2: Moderados]`, `[T3: Quincenales]`, `[Alertas >20%]`) y panel Andon priorizado.

### 7.7 Módulo de Facturación Comercial, Remisiones y Cartera (Billing & Portfolio)

#### A. Cortes Operativos de Despacho (`billing_cuts`)
Para sincronizar la facturación con los despachos físicos de bodega, las remisiones y facturas se agrupan en **Cortes Operativos**:
1. **Corte AM (04:00 - 08:00 AM):** Despachos principales matutinos para apertura de restaurantes, clínicas y casinos.
2. **Corte PM (11:00 - 03:00 PM):** Segundo turno de entregas vespertinas y abastecimiento para turnos de cena.
3. **Corte ADJ (Ajustes & Notas):** Corte especial para registrar devoluciones en ruta, diferencias de báscula post-despacho o refacturaciones.
4. **Ciclo de Estados del Corte:**
   $$\text{open} \longrightarrow \text{processing} \longrightarrow \text{closed} \longrightarrow \text{exported (ERP/DIAN)}$$

#### B. Facturas y Remisiones (`billing_invoices`)
1. **Desglose Contable:** Cada factura se genera a partir de las cantidades reales despachadas (`picked_quantity`), desglosando base imponible (`total_base`), impuestos discriminados (`total_tax`) e importe total (`total_final`).
2. **Generación Atómica:** Se ejecuta una inserción en lote única `supabase.from('billing_invoices').insert(invoicesToInsert)` eliminando bloqueos de red y sobrecarga de conexiones concurrentes.
3. **Estados del Documento:** `pending` (generada) $\to$ `printed` (impresa con remisión de despacho) $\to$ `exported` (radicada en software contable) $\to$ `cancelled`.
4. **Estados de Cartera:**
   - `pending`: Documento vigente dentro de los días de crédito pactados (`payment_days`).
   - `paid`: Pago total registrado y conciliado con extracto bancario o caja.
   - `overdue`: Documento cuyo vencimiento (`due_date < now()`) ha caducado sin pago registrado.

#### C. Control de Cupo de Crédito & Bloqueo Comercial Runtime (GAP-01)
1. Todo cliente institucional B2B posee un cupo máximo de crédito (`credit_limit`) y plazo en días (`payment_days`).
2. Al momento de generar o confirmar un pedido en `/admin/orders/create` (tanto por ingesta directa de documentos como por carrito manual), el sistema evalúa en tiempo real:
   - **Deuda Pendiente:** Sumatoria de `total_final` de facturas impagas (`payment_status != 'paid'`) asociadas a los pedidos del cliente.
   - **Validación de Cupo:** Si $\text{Deuda Pendiente} + \text{Total del Pedido} > \text{credit\_limit}$.
   - **Validación de Mora:** Si existe al menos una factura impaga con `due_date < now()`.
3. Si se viola cualquiera de las dos condiciones, el sistema **bloquea la orden** y solicita confirmación de excepción comercial al usuario. Si se autoriza, se escribe un registro inmutable en `audit_logs` con la acción `CREDIT_LIMIT_EXCEPTION_AUTHORIZED`, salvaguardando la gobernanza de caja.
4. **Sincronización de Términos (GAP-17):** Al crear una cotización o formalizar un acuerdo comercial, el plazo `payment_terms_days` se sincroniza automáticamente al campo `payment_days` de la tabla `profiles`.

### 7.8 Estándar de Oro en Impresión PDF & Storytelling B2B (GAP-10, 11, 14, 16, 18)
1. **Paginación Continua:** Se erradica `position: fixed !important` en contenedores de impresión. Los documentos oficiales usan `position: absolute !important` con `@page { size: letter portrait; margin: 1.1cm 1.3cm 1.3cm 1.3cm; }`, repetición de cabeceras de tabla `thead { display: table-header-group; }` y `tfoot { display: table-footer-group; }`.
2. **Supresión de Páginas en Blanco:** Las vistas de impresión aplican `.page-break:last-child { break-after: avoid; }` para evitar hojas vacías al final del documento.
3. **Color Exacto:** Forzado de renderizado con `-webkit-print-color-adjust: exact; print-color-adjust: exact;`.
4. **Sello de Garantía Operativa B2B:** Toda cotización impresa o pública expone el sello institucional:
   - *Cero Intermediarios:* Abastecimiento directo de fincas y Corabastos.
   - *Puntualidad Suiza:* Despachos matutinos en ventana acordada antes de apertura de cocina.
   - *Cero Desperdicio:* Selección y pesaje exacto con merma controlada.

### 7.9 Rendimiento Full-Stack & Arquitectura de Datos (GAP-04, 05, 12, 13)
1. **Dynamic Imports:** Bibliotecas de procesamiento pesado (`xlsx`) se importan dinámicamente con `await import('xlsx')` exclusivamente al invocar funciones de carga o descarga.
2. **Proyección Exacta de Historial:** En la Matriz de Costos (`/admin/commercial/cost-matrix`), la consulta a `purchase_history_normalized` proyecta estrictamente sus 6 columnas canónicas (`id, product_id, unit_price, created_at, purchase_unit, normalized_price`), eliminando el error PostgreSQL 42703 y reduciendo la carga en memoria de ~30MB a ~200KB.
3. **Memorización de Componentes:** Componentes de alta densidad en bucles tabulares como `<Sparkline />` se encapsulan con `React.memo` para evitar re-renderizados durante la escritura en el buscador.

---

## 8. Módulo de Inventario: Balance Diario de Masa (24 Columnas), Kardex & Células de Trabajo

### 8.1 Misión del Sistema & Principio de Masa Cerrada
> **«El inventario de alimentos perecederos y abarrotes en FruFresco no es un conteo estático; es un balance dinámico de masa donde cada gramo que ingresa a bodega debe justificarse matemáticamente en una venta, un producto escaso, una merma documentada o un sobrante físico auditado. Ningún kilogramo desaparece del sistema sin un asiento transaccional en el Kardex.»**

### 8.2 Contrato de Reglas de Negocio (Consenso del Grill-Me Táctico)

#### Regla 1: Deducción de Inventario en Doble Fase (Reserva Comercial + Liquidación en Báscula)
1. **Fase 1 (Reserva al Aprobar):** Cuando una orden de venta pasa a estado `approved` (desde correo, documento o manual), el sistema **bloquea y compromete el stock estimado**. Esto permite a la Torre de Control y a Compras visualizar la demanda consolidada real para la jornada $D+1$.
2. **Fase 2 (Liquidación Física en Picking):** Cuando el operario pesa físicamente el producto en la báscula de picking (`picked_quantity`), se liquida la salida real contra `inventory_stocks`. Si el ítem es una presentación hija (ej. Bolsa 250g con `parent_id`), el descuento se redirige automáticamente al **Padre** mediante el factor de conversión:
   $$\text{Salida al Padre} = -(\text{picked\_quantity} \times \text{web\_conversion\_factor})$$
3. **Excepción de Calidad:** Si en báscula el producto se descarta por calidad (`quality_status = 'red'`), no se descuenta del inventario comercial y se enruta al flujo de merma.

#### Regla 2: Política de Stock Negativo Transitorio
1. Para evitar que la operación logística matutina (04:00 AM - 07:00 AM) se paralice cuando un camión descarga producto físico antes de que contabilidad radique la factura de compra, **el sistema permite transitoriamente existencias negativas**.
2. Los ítems con stock negativo se destacan visualmente con un semáforo rojo/ámbar en el panel directivo y en la Sábana, generando una tarea prioritaria para que Compras registre la entrada correspondiente.

#### Regla 3: La Sábana Oficial de 24 Columnas (Ecuación Canónica)
El balance diario oficial de FruFresco se rige por la **Ecuación Canónica de Balance de Masa**:
$$\mathbf{S} = \mathbf{E} + \mathbf{F} + \mathbf{G} - \mathbf{H} - \mathbf{J} - \mathbf{K} + \mathbf{L} - \mathbf{M} - \mathbf{N} + \mathbf{O} - \mathbf{P} - \mathbf{Q} - \mathbf{R}$$
- Si el Conteo Físico Auditado ($T$) es menor que el Inventario Calculado ($S$):  
  $$\text{Faltante (Col V)} = |T - S| \quad (\text{Pérdida neta de bodega})$$
- Si el Conteo Físico Auditado ($T$) es mayor que el Inventario Calculado ($S$):  
  $$\text{Sobrante (Col W)} = T - S \quad (\text{Mercancía física sin soporte contable})$$

#### Regla 4: Almacén Único Central y División Lógica por Células
Toda la operación converge en la **Bodega Central Única (Bogotá)**. Para efectos de responsabilidad y orden operativo, el catálogo se particiona estrictamente en **6 Células de Trabajo Autónomas**.

#### Regla 5: Gobernanza de Mermas con Evidencia Fotográfica Obligatoria
Cualquier operario o auxiliar puede registrar mermas en Col Q (Desperdicio) y Col R (Basura/Descapote). El descuento en inventario es **inmediato** para mantener el stock físico sincronizado en tiempo real, pero **exige evidencia fotográfica obligatoria (cámara/galería)** para que el Líder de Célula audite o impugne en la Sábana Diaria.

---

### 8.3 Matriz Canónica de las 24 Columnas (Diccionario de Datos Oficial)

| Col | Código / Campo | Título en Pantalla | Naturaleza | Fuente de Datos / Origen |
| :---: | :--- | :--- | :---: | :--- |
| **A** | `colA_date` | **Fecha** | ID | Fecha del corte (`balanceDate`). |
| **B** | `colB_idProducto` | **ID Producto** | Contable | `products.accounting_id` o `sku`. |
| **C** | `colC_inventoryGroup` | **Célula / Grupo** | Clasificación | `products.inventory_group`. |
| **D** | `colD_productName` | **Producto** | Catálogo | `products.name` oficial. |
| **E** | `colE_initialStock` | **Inventario Inicial** | Base | Reconstrucción retroactiva: $\text{Stock Actual} - \sum(\text{Deltas posteriores})$. |
| **F** | `colF_corrections` | **Corrección Inv.** | Ajuste (+/-) | `inventory_movements` con `type = 'adjustment'`. |
| **G** | `colG_purchases` | **Compras del Día** | Entrada (+) | Recepción de proveedores (`ref = 'purchase_reception'`). |
| **H** | `colH_salesKg` | **Ventas Día KG** | Salida (-) | Salidas comerciales de productos tarificados por Kg. |
| **I** | `colI_salesUnits` | **Ventas Día UN** | Salida (-) | Salidas comerciales de productos por unidades/bandejas. |
| **J** | `colJ_weightSalesUnits`| **Peso Ventas UN (KG)**| Salida (-) | Equivalencia o pesaje en báscula de las unidades vendidas. |
| **K** | `colK_shortage` | **Producto Escaso** | Salida (-) | Pedidos no despachados por falta de producto (`ref = 'shortage'`). |
| **L** | `colL_unshipped` | **Prod. Sin Enviar** | Entrada (+) | Pedido empacado que no salió y retorna a stock (`ref = 'unshipped'`). |
| **M** | `colM_additionalSales`| **Venta Adic. Cliente**| Salida (-) | Despachos de última hora no contemplados en corte (`ref = 'additional_sale'`). |
| **N** | `colN_employeeSales` | **Venta Empleado** | Salida (-) | Venta interna al personal con descuento de nómina (`ref = 'employee_sale'`). |
| **O** | `colO_returns` | **Devoluciones** | Entrada (+) | Rechazos en punto de cliente devueltos físicamente (`ref = 'route_return'`). |
| **P** | `colP_weighingWaste` | **Merma por Pesada** | Pérdida (-) | Descuadre acumulado por tolerancia de básculas (`ref = 'waste_weighing'`). |
| **Q** | `colQ_damageWaste` | **Desperdicio / Avería**| Pérdida (-) | Producto descompuesto con foto obligatoria (`ref = 'waste_damage'`). |
| **R** | `colR_cleaningWaste` | **Basura / Descapote** | Pérdida (-) | Limpieza de hojas, tallos o cáscaras con foto (`ref = 'waste_cleaning'`). |
| **S** | `colS_calculated` | **INVENTARIO CALCULADO**| Teórico | **$S = E + F + G - H - J - K + L - M - N + O - P - Q - R$** |
| **T** | `colT_physicalCount` | **Conteo Agregado** | Físico | Conteo físico ciego realizado en bodega (`ref = 'blind_count'`). |
| **U** | `colU_bodegaPost10am` | **Inv. Bodega Post-10AM**| Físico Final | $U = T + O$ (Conteo físico adicionando devoluciones de ruta). |
| **V** | `colV_missing` | **FALTANTE** | Descuadre | Si $T < S \implies \|T - S\|$ |
| **W** | `colW_surplus` | **SOBRANTE** | Descuadre | Si $T > S \implies (T - S)$ |
| **X** | `colX_foodBank` | **Banco de Alimentos** | Salida Social | Donaciones y producto entregado al banco de alimentos (`ref = 'food_bank'`). |

---

### 8.4 Métricas Industriales Lean & Tablero Directivo

1. **Valorización Monetaria:** $\sum (\text{Stock Físico (Kg)} \times \text{Costo Manual de Matriz de Costos})$. Si el ítem es hijo, hereda el costo del padre.
2. **Volumen en Toneladas (`formatVolumeTon`):** Totalización de masa en bodega para cubicación de espacio.
3. **IRA (Inventory Record Accuracy %):**
   $$\text{IRA} = \left(\frac{\text{Conteo Físico con Desvío } \le 2.5\%}{\text{Total de Ítems Auditados}}\right) \times 100 \quad (\text{Estándar de Excelencia} \ge 95.0\%)$$
4. **DOH (Days of Inventory on Hand):** Días de stock disponibles basados en la tasa diaria de consumo de los últimos 7, 15 o 30 días.
5. **Shrinkage Rate (Tasa de Merma Global):**
   $$\text{Tasa de Merma\%} = \frac{\text{Mermas Totales (Cols P + Q + R)}}{\text{Salidas Comerciales} + \text{Mermas Totales}} \times 100$$

---

### 8.5 Matriz de Células de Trabajo & Gobernanza Operativa

| ID Célula | Nombre Oficial | Icono | Grupo de Inventario Contable | Categorías | Líder Responsable |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `cell_abarrotes` | Abarrotes, Frutos Secos, Lácteos & Carnes Frías | `boxes` | INVENTARIO DE ABARROTES, FRUTOS SECOS, LACTEOS Y CARNES FRIAS | ABARROTES, LACTEOS, CARNES | **CORONADO** |
| `cell_fresas` | Fresas & Moras | `apple` | INVENTARIO DE FRESAS Y MORAS | FRUTAS | **FRESAS** |
| `cell_frutas` | Frutas & Otros | `apple` | INVENTARIO DE FRUTAS Y OTROS | FRUTAS | **MENDOZA** |
| `cell_verduras` | Verduras | `carrot` | INVENTARIO DE VERDURAS | VERDURAS | **GALVIS** |
| `cell_hortalizas` | Hortalizas | `sprout` | INVENTARIO DE HORTALIZAS | HORTALIZAS | **LEAL** |
| `cell_papas` | Papas, Plátano, Tomate y Aguacates | `layers` | INVENTARIO DE PAPAS, PLATANO, TOMATE Y AGUACATES | TUBERCULOS | **BAUTISTA** |

---

### 8.6 Contratos Operativos Gemba & Cierre Diario (Resolución Grill-Me)

#### 1. Usabilidad & Navegación por Célula
- **Colapso y Filtro de Células:** Para mitigar la sobrecarga visual de las 24 columnas, la Sábana Diaria debe permitir al auditor/supervisor expandir, colapsar o filtrar de manera exclusiva una Célula de Trabajo a la vez (ej. ver únicamente "cell_fresas" o "cell_hortalizas").

#### 2. Protocolo de Cierre Diario y Congelación Contable
- **Botón Manual de "Cierre Diario Oficial":** La jornada contable no se congela por cron ciego; requiere la ejecución explícita del botón de Cierre Diario por parte del Administrador o Supervisor de Operaciones.
- **Congelación Estricta:** Al ejecutar el cierre, los registros de la fecha quedan en estado `locked` (congelados), bloqueando modificaciones retroactivas no auditadas salvo autorización de superadmin.
- **Traslado Automático de Saldos:** El **Saldo Físico Final (Col T / Col U)** de la fecha cerrada se traslada automáticamente como **Saldo Inicial (Col E)** de la jornada siguiente ($D+1$).
- **Trazabilidad:** Se registra en auditoría: `closed_at`, `closed_by_user_id`, `closed_by_name` y hash de verificación del balance de masa.

#### 3. Política de Desvío en Auditoría Cíclica: Tolerancia Cero (0%)
- Todo desvío entre el saldo teórico ($S$) y el conteo físico ciego ($T$) se computa y visibiliza de inmediato:
  - Sin márgenes ocultos de tolerancia que disfracen pérdidas o mermas.
  - Si $T < S \implies$ Registro transparente en **Faltante (Col V)**.
  - Si $T > S \implies$ Registro transparente en **Sobrante (Col W)**.

#### 4. Exportación a Excel (XLSX) de Grado Fiscal y Contable
- La exportación debe respetar estrictamente la estructura de las 24 columnas canónicas (A a X), agrupadas por Célula de Trabajo.
- Las columnas de balance y descuadre deben exportarse con **fórmulas nativas de Excel** (`=SUMA(...)`, `=E+F...`, etc.), acompañadas de una fila de totales matemáticos al pie para permitir la auditoría de revisoría fiscal y contabilidad.

---

### 8.7 Integración Inter-Módulos: Compras (`/ops`) ➔ Picking ➔ Inventario (Sábana Diaria)

```
       [SUBMÓDULO DE COMPRAS /ops/purchases]
                         │
      Comprador detecta que producto no existe en mercado
      Declara: "NO LO HAY" (Status: 'shortage')
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
 [MÓDULO OPS / PICKING]         [PLANILLA SÁBANA INVENTARIO]
 Flag visual de escasez         Se consigna en COLUMNA K
 Despachador ajusta remisión    (Producto Escaso)
 con picked_quantity real       Equilibra el balance de masa:
 Cliente solo paga lo pesado    S = E + F + G - H - J - K...
```

1. **Génesis de la Escasez en Compras:**
   - La escasez física no se inventa en bodega ni en la sábana; se origina en el **Submódulo de Compras de `/ops`**.
   - Cuando el comprador en central de abastos o proveedor reporta que el SKU está agotado (*"No lo hay"*), marca el estado oficial de escasez.
2. **Propagación a Operaciones (`/ops`):**
   - El estado de escasez se refleja inmediatamente en las listas de picking y alistamiento de pedidos, alertando a los operarios de báscula.
   - El operario liquida el pedido con la cantidad real empacada (`picked_quantity`), ajustando la remisión para que el cliente no pague faltantes.
3. **Imputación Directa en la Sábana:**
   - La cantidad no suministrada por falta de producto se consolida automáticamente en la **Columna K (Producto Escaso)** de la Sábana Diaria de Inventario, garantizando que el inventario teórico ($S$) no descuente ventas ficticias ni genere faltantes falsos en bodega.

---

## 9. Módulo de Operaciones (Ops): Trazabilidad Física End-to-End & Circuito Cerrado con Pedidos, Transporte e Inventario

### 9.1 Misión Operativa & Principio de Sincronía Gemba
El Módulo de Operaciones (`src/app/ops/`) es el ejecutor físico y el brazo logístico en tiempo real de FruFresco. Su misión es orquestar la transformación de las intenciones comerciales (`orders`) en flujos de masa tangibles (kilos, canastillas, vehículos y bahías de piso), alimentando de forma bidireccional y continua tanto el libro mayor de movimientos (`inventory_movements` - Sábana de 24 Columnas) como la liquidación y facturación electrónica oficial (`billing_invoices`).

---

### 9.2 Las 8 Estaciones de la Cadena de Valor Física

```
[PEDIDOS: orders / order_items] (status: 'approved' | 'para_compra')
       │
       ▼  (Corte 17:00 / 18:00 - Lanzamiento de Operación)
1. COMPRAS (/ops/compras)
   ├── Neteo Cross-Docking/JIT con Stock de Seguridad
   ├── Consolidación en procurement_tasks
   └── Declaración de Escasez ──► inventory_movements (ref: 'order_shortage' ──► COL K)
       │
       ▼
2. RECEPCIÓN & CALIDAD DE ENTRADA (/ops/recepcion)
   ├── Báscula de muelle y pesaje contra OC
   ├── Aprobación de entrada ──► inventory_movements (type: 'entry', ref: 'purchase_reception' ──► COL F)
   └── Excedentes no autorizados ──► Cuarentena in_process en weight_discrepancies
       │
       ▼
3. PLANIFICACIÓN DE TRANSPORTE (/api/transport/optimize & /confirm)
   ├── Google Maps Route Optimization API (Cubicación, Ventanas RFC3339, Descansos 45m, Cadena de Frío)
   ├── Asignación temporal de 150 Espacios Físicos (Bahías de Staging 1 a 150) sin traslape horario
   └── Impresión de Remisiones Carta Duplicadas (Original Cliente + Copia Archivo/Contabilidad)
       │
       ▼
4. ALISTAMIENTO EN CÉLULAS (/ops/picking & /terminal)
   ├── 6 Células de Trabajo (Abarrotes, Fresas, Frutas, Verduras, Hortalizas, Papas)
   ├── Pesaje y digitación de order_items.picked_quantity
   └── Rechazo de calidad en mesa (Botón Rojo) ──► Cuarentena in_process (ref: 'order_picking')
       │
       ▼
5. MONITOREO DE PLANTA (/ops/picking/dashboard)
   └── Airport Board en tiempo real: Detección de cuellos de botella y avance porcentual de ruta
       │
       ▼
6. RECTIFICACIÓN & PRECINTO LIFO (/ops/rectificacion/[routeId])
   ├── Checker audita cantidades físicas vs remisiones impresas
   ├── Certificación digital o fotográfica de planilla
   └── Sincronización oficial: routes 'rectified' ──► orders 'ready_for_dispatch'
       │
       ▼
7. TRANSPORTE & ÚLTIMA MILLA (/ops/driver/route & /delivery)
   ├── Conductor confirma cargue LIFO: routes 'in_transit' ──► orders 'in_transit'
   ├── Entrega física, firma digital y balance de canastillas en asset_movements
   ├── Cobro contra-entrega (Efectivo / Transferencia)
   └── Novedades en ruta ──► billing_returns ('pending_review') + customer_service_pqrs (RCA)
       │
       ▼
8. LIQUIDACIÓN DE PATIO & CONTROL DE CALIDAD (/ops/inventory & /admin/customer-service)
   ├── Retornos físicos del camión entran a Cuarentena de Patio en estado 'returned' (COL O)
   ├── Supervisor en /ops/inventory dictamina: Reingreso (available), Merma (waste_damage COL Q) o Donación (food_bank COL X)
   └── Control de Calidad audita remisión firmada con tachaduras ──► Aprueba billing_returns para Facturación
```

---

### 9.3 Contratos Matemáticos & Algoritmos de Operación

#### 1. Algoritmo Canónico de Neteo en Compras (Cross-Docking / JIT)
FruFresco primero vende y de inmediato compra en Corabastos para garantizar frescura de campo, deduciendo el inventario disponible y garantizando amortiguadores de seguridad:

1. **Agrupación Familiar:** Agrupa las tareas por familia padre (`parent_id || product_id`).
2. **Prioridad:** Ordena primero el producto base (sin etiqueta de variante) y luego variantes en orden alfabético.
3. **Amortiguador Asimétrico:** El stock de seguridad (`products.min_inventory_level`) solo se aplica al primer ítem del grupo familiar (`idx === 0`).
4. **Ecuación Canónica:**
   $$\text{Stock Aplicado} = \min\Big(\text{Stock Disponible Bodega},\ \text{Demanda Pedidos} + \text{Stock de Seguridad}\Big)$$
   $$\mathbf{Meta\ de\ Compra\ (meta\_neteo)} = \max\Big(0,\ \text{Demanda Pedidos} - \text{Stock Aplicado} + \text{Stock de Seguridad}\Big)$$

#### 2. Algoritmo de Asignación Temporal de 150 Espacios Físicos (Bahías de Muelle)
La planta cuenta con 150 bahías de piso numeradas. La asignación es temporal y dinámica según la hora de salida del vehículo:
- **Capacidad Estándar:** `space_capacity = 36` canastillas apiladas por espacio.
- **Conversión de Peso:** $\text{Canastillas} = \lceil \frac{\text{total\_weight\_kg}}{12.5\text{ kg}} \rceil$.
- **Espacios Necesarios por Pedido:** $\text{Espacios} = \lceil \frac{\text{Canastillas}}{36} \rceil$.
- **Ventana de Ocupación:** $[\text{salida} - \text{duración}, \text{salida}]$, donde $\text{duración} = 15\text{m} + (\text{total\_crates} \times \frac{5\text{m}}{10}) + 15\text{m buffer}$.
- **Poka-Yoke de Traslape:** Un espacio se asigna solo si para todos sus intervalos ocupados se cumple:
  $$\neg\Big((\text{inicio\_nuevo} < \text{fin\_ocupado}) \land (\text{inicio\_ocupado} < \text{fin\_nuevo})\Big)$$

#### 3. Motor Google Maps Route Optimization API (projects.locations/optimizeTours)
- **Time Windows RFC3339:** Extraídas en lenguaje natural por `logistics-parser.ts` desde el perfil del cliente (`profiles.logistics_data`) y acotadas al turno legal de flota ($04:30\text{ AM} - 19:00\text{ PM}$).
- **Service Duration Dinámico:** $\text{Duración Parada (min)} = \max\Big(5,\ \min\Big(60,\ 4\text{m} + \frac{4\text{m} + 10\text{m}}{10} \times \text{canastillas}\Big)\Big)$.
- **Pausa Activa / Descanso Reglamentario:** Inyección obligatoria de ventana de descanso de 45 minutos (`driver_break_mins`) entre la 4ª y 6ª hora de turno del conductor.
- **Cadena de Frío:** Los pedidos con ítems del grupo `REFRIGERADOS` solo pueden programarse en furgones térmicos con refrigeración activa.

---

### 9.4 Circuito Legal: Remisiones, Calidad y Facturación

1. **Título Valor Legal de Viaje:**
   - Cada pedido genera 2 copias continuas obligatorias: Impar (`[ ORIGINAL - CLIENTE ]`) y Par (`[ COPIA - ARCHIVO Y CONTABILIDAD ]`).
   - Llevan estampado el rótulo de bahía: `Bahía de Piso: ESPACIO [ XX ]`.
2. **Registro de Novedad en Ruta:**
   - Si el cliente rechaza productos o cancela en puerta, el chofer tacha la remisión física, toma fotografía de la remisión firmada con tachaduras y evidencia del producto en `/ops/driver/delivery`.
   - Se crea el registro en `billing_returns` con estado `'pending_review'` y el ticket en `customer_service_pqrs` con taxonomía RCA.
3. **Compuerta de Control de Calidad (Gatekeeper):**
   - El área de Facturación NO aplica deducciones automáticas no verificadas.
   - **Control de Calidad / Servicio al Cliente** revisa la remisión física devuelta y la fotografía en `/admin/customer-service`, dictaminando la resolución (aprobación de Nota Crédito, reposición o cobro).
   - Solo los registros de `billing_returns` en estado `'approved'` son liquidados por Facturación en `/admin/commercial/billing`.
4. **Cuarentena de Devoluciones en Patio:**
   - El producto devuelto ingresa a `inventory_movements` con `reference_type: 'route_return'` y estado `'returned'`.
   - Queda segregado en Columna O y NO se suma al disponible de venta comercial hasta que el supervisor en `/ops/inventory` inspeccione la mercancía y determine:
     - `available`: Reingreso a inventario disponible.
     - `waste_damage`: Baja contable por avería $\rightarrow$ Columna Q.
     - `food_bank`: Baja por donación social $\rightarrow$ Columna X.

---

### 9.5 Máquina de Estados Sincronizada

| Estado `orders` | Evento Detonador en Ops | Actor Responsable | Estado `routes` | Movimiento Inventario |
| :--- | :--- | :--- | :--- | :--- |
| `approved` / `para_compra` | Ingesta aprobada / Lanzamiento | Comercial / Operaciones | - | Stock reservado en Neteo |
| `picking` | Ruta confirmada en RoutePlanner | Despachador | `loading` | Bahía asignada (1-150) |
| `in_preparation` | Célula inicia alistamiento físico | Líder de Célula | `loading` | picked_quantity en order_items |
| `ready_for_dispatch` | Checker certifica cargue LIFO | Rectificador | `rectified` | Manifiesto sellado |
| `in_transit` | Chofer confirma cargue en app | Conductor | `in_transit` | Mercancía en furgón |
| `delivered` | Chofer finaliza entrega en sitio | Conductor | `completed` (si última parada) | Habilita Facturación / Calidad |
| `cancelled` | Rechazo total en puerta del cliente | Conductor | - | Dispara billing_returns & PQRs |

---

### 9.6 Criterios de Aceptación (Gherkin)

#### Escenario 1: Neteo de Compras con Inventario de Seguridad
- **Given** que el cliente solicita 100 kg de Tomate Chonto y el inventario disponible en bodega (`status: 'available'`) es de 40 kg, con un stock mínimo parametrizado de 15 kg.
- **When** se ejecuta el lanzamiento de compras a las 18:00 en `/ops/compras`.
- **Then** el sistema descuenta 40 kg de bodega (`applied_stock: 40`) y genera una meta de compra oficial para Corabastos de exactamente 75 kg ($\max(0, 100 - 40 + 15)$).

#### Escenario 2: Entrega en Ruta con Rechazo Parcial y Compuerta de Calidad
- **Given** un pedido en estado `in_transit` con remisión física impresa por 50 kg de Fresa.
- **When** el conductor entrega 40 kg y el cliente rechaza 10 kg por magulladura, registrando la novedad con foto en `/ops/driver/delivery`.
- **Then**:
  1. El pedido transiciona automáticamente a `orders.status = 'delivered'`.
  2. Se inserta exactamente una fila en `inventory_movements` con `reference_type: 'route_return'`, `status_to: 'returned'` y cantidad 10 kg (alimentando Columna O).
  3. Se genera un registro en `billing_returns` con `status: 'pending_review'`.
  4. Facturación NO aplica la Nota Crédito hasta que Control de Calidad audite la remisión tachada y apruebe el registro en `billing_returns`.
