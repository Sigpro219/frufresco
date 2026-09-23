# FruFresco - Especificación de Arquitectura & Contrato de Negocio (SDD)
## Módulo de Pedidos: Pipeline Unificado de Ingesta (Manual vs Automático)

> **Versión:** 1.8.5 (Contrato Canónico de Trazabilidad Dual: Unidades Nominales y Peso Logístico en Ciclo de Vida de Pedido)  
> **Fecha:** 23 de Septiembre, 2026  
> **Estado:** 🟢 Aprobado & Activo en Contrato  
> **Área:** Dirección General, IT/SaaS Infraestructura, Comercial, Operaciones & Gobernanza ERP

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

#### 7.5.1 Nomenclatura Canónica & Acompañamiento Visual de Acuerdos Comerciales / Listas de Precios
Para asegurar que todo acuerdo comercial cuente con una identidad explícita e inequívoca tanto para el equipo comercial como para el cliente institucional:
1. **Regla de Nomenclatura Automática Dinámica (`computeDefaultAgreementName`):**
   $$\text{Nombre del Acuerdo} = \text{[Razón Social / Nombre Comercial]} - \text{[DD-MM-AA]}$$
   *Ejemplo:* `Restaurante El Portal - 22-09-26` o `Acuerdo Multicliente - 22-09-26`.
   - El sistema autocalcula y autocompleta este valor en el formulario de creación en tiempo real al seleccionar el cliente o modificar la fecha de inicio del acuerdo.
   - Si el comercial desea un nombre personalizado, puede editar el campo de texto libremente; en caso contrario, se preserva el estándar corporativo.
2. **Persistencia Estructurada:**
   El nombre acordado se almacena de forma persistente en `quotes.model_snapshot_name` bajo el registro con `status = 'agreement'`.
3. **Omnipresencia en la Visualización:**
   El nombre resultante acompaña obligatoriamente todas las interfaces y documentos:
   - **Tabla Principal de Acuerdos:** Badge verde esmeralda junto a la razón social (`[Restaurante El Portal - 22-09-26]`).
   - **Drawer de Inspección Rápida:** Cabecera de la lista de tarifas congeladas.
   - **Documento Formal de Precios:** Encabezado unificado `Lista de precios [Nombre del Acuerdo] (X productos)`.
   - **Exportación e Impresión PDF (`AgreementDocumentModal`):** Título principal del documento contractual de tarifas.
   - **Ficha del Cliente (`ClientsModule`):** Indicador de `Modelo Base: [Nombre del Acuerdo]` con vigencia.
   - **Portal B2B del Cliente (`/b2b/dashboard`):** Título de la tarjeta de convenio vigente en la pestaña de Acuerdos cuando el cliente accede a realizar sus pedidos.

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
- [x] **Tarea COM-25 (Acuerdos Comerciales / Nomenclatura & Visualización):** Implementar función `computeDefaultAgreementName` con formato `[Empresa] - [DD-MM-AA]`, persistencia en `quotes.model_snapshot_name` y visualización omnipresente en tabla principal, drawer lateral, documento de precios, PDF formal, ficha de cliente y portal B2B.

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

### 8.8 Gobernanza de Acceso, Segregación de Funciones (SoD) & Protocolo Poka-Yoke Single-Write

#### 8.8.1 Principio de Inmutabilidad y Segregación de Funciones (Jefatura: Yina Cortés)
1. **La Sábana como Balance Oficial:** La pestaña de Balance Diario de 24 Columnas (`/admin/commercial/inventory`) representa el balance maestro contable, financiero y de masa de FruFresco. Por control interno (Segregation of Duties - SoD), **no es una hoja libremente editable**.
2. **Modo Estricto de Solo Lectura:** Para el 99% de los usuarios del sistema (comerciales, choferes, auxiliares de bodega, compras y visualizadores), la sábana opera en modo de **Solo Lectura** inviolable (cursor predeterminado, sin inputs interactivos ni capacidad de alteración directa de celdas).
3. **Poder de Edición Exclusivo de Yina Cortés / Superadmins:** Únicamente los usuarios con rol de administrador (`admin`, `sys_admin`) o específicamente la encargada de inventarios (**Yina Cortés**, identificada por credencial, correo o rol `inventory_manager`) disponen de permisos activos para:
   - Modificar celdas individuales en la sábana.
   - Realizar o reabrir el Cierre Diario Oficial de la jornada contable.
   - Registrar novedades directas (+ Merma, Nómina, Venta Extra).
4. **Huella Forense Obligatoria:** Todo ajuste manual autorizado en la sábana estampa en la bitácora transaccional (`inventory_movements`) el nombre del supervisor, la fecha/hora y la nota de auditoría: `[AJUSTE AUTORIZADO - Yina Cortés / Admin]`.

#### 8.8.2 Protocolo Single-Write Poka-Yoke en Piso (`/ops/inventory`)
1. **Captura Fisiológica Única (Conteo a Ciegas):** Para preservar la veracidad del inventario en piso, cuando un operario mide una estiba física e ingresa el dato en `/ops/inventory`, el sistema implementa **escritura única inmutable (Single-Write)**.
2. **Bloqueo Inmediato post-Guardado:** En cuanto se presiona `Enter` o `Guardar` (sea individual o en lote):
   - El SKU transiciona automáticamente a estado **`[Registrado y Bloqueado]`** con badge verde.
   - El input numérico pasa a `readOnly={true}` y `disabled={true}`, impidiendo que el operario altere o borre el dato para disimular discrepancias.
3. **Persistencia Transaccional Intradía:** El bloqueo persiste ante recargas de navegador o cambios de turno mediante consulta activa a `inventory_movements` con `reference_type = 'blind_count_shift_close'`.
4. **Desbloqueo Exclusivo por Supervisión:** Si existió un error tipográfico humano legítimo en piso, el operario no puede corregirlo de forma autónoma. Requiere la presencia de la supervisora de inventario (**Yina Cortés** o Administrador), quien dispone del botón exclusivo de `Desbloquear` para habilitar un re-conteo formal.

#### 8.8.3 Blindaje Inviolable de Fuentes Automáticas
1. Los cálculos de Compras (Col G), Ventas (Cols H, I, J) y Devoluciones de Ruta (Col O) se calculan por **agregación determinista SQL** a partir de los eventos operativos reales generados en `/ops/compras`, `/admin/commercial/billing` y `/ops/driver/delivery/[id]`.
2. Queda terminantemente prohibido que una modificación manual sobreescriba o destruya las transacciones originales del motor operativo.

#### 8.8.4 Arquitectura Dual: Sábana Oficial (Modo Vista) vs Hoja Manual (Modo Edición / Contingencia) & Toolbar Enterprise
1. **Segregación Estricta de Modos de Operación:**
   - **🔒 Sábana Oficial (Modo Vista / Auditoría):**
     - Destinado a consulta directiva, gerencial, comercial y de auditoría general.
     - **Inmutabilidad Absoluta:** Todas las celdas de las 24 columnas se comportan como estado de cuenta financiero estrictamente de solo lectura.
     - **Limpieza Visual Total:** Se ocultan todos los controles de taller o contingencia (`+ Merma`, `Nómina`, `Extra`, `Carga Masiva Excel`).
     - **Acciones Disponibles:** Selector de fecha, switch de modo, buscador, filtro de movimiento, `Exportar Excel` y `Cierre Diario` (o indicador `Cerrado`).
   - **📝 Hoja Manual (Modo Edición / Contingencia):**
     - Destinado exclusivamente a la Jefatura de Inventario (**Yina Cortés**) y Administradores para contingencias operacionales, ajustes masivos y correcciones de balance.
     - **Desbloqueo de Herramientas de Ajuste Operativo:** La barra superior activa el kit de recursos:
       - `+ Merma` (Cols P, Q, R): Registro de mermas por pesaje, desperdicio y descapote.
       - `Nómina` (Col N): Descuento de ventas a colaboradores para Talento Humano.
       - `Extra` (Col M): Registro de ventas mostrador no programadas.
       - `Carga Masiva Excel`: Simulación o ingesta por archivo `.xlsx`.
     - **Edición Inline de Celdas:** Permite afinar números fila por fila con navegación por teclado (`Enter`, `Tab`, `Escape`) y auto-selección de texto.
2. **Consolidación Ergonómica en 2 Líneas (Toolbar Enterprise):**
   - **Línea 1 (Master Bar - 38px):** Fecha con botón "Hoy", Switch de Modo (`Sábana Oficial` vs `Hoja Manual`), Buscador (#ID, @tag, texto), Filtro "Con Mov. / Todos", y acciones contextuales por modo.
   - **Línea 2 (Cell & Navigation Bar - 30px):** Filtros rápidos de células de trabajo (única fuente con conteos en tiempo real), toggle de densidad (`Expandir/Colapsar`, `A-D Compacto`), selector desplegable de navegación (`⚓ Ir a Bloque...`) y flechas de desplazamiento horizontal paso a paso.

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

### 9.7 Contrato Canónico de Trazabilidad Dual: Unidades Nominales y Peso Logístico (Dual-Unit Lifecycle)

#### 9.7.1 Principio de Dualidad Físico-Comercial
En la operación agroindustrial y HORECA, existen productos cuya unidad de costeo, facturación y capacidad de transporte es el **Kilogramo (Kg)**, pero cuya manipulación física por parte del cliente y del operario en planta se realiza por **Unidades Discretas con Peso Nominal** (ej. Papaya institucional 2000 gr, Sandía 4000 gr, Melón 1500 gr, Piña Gold 1200 gr).

> **Regla de Oro Contractual (Prohibición Léxica):**  
> Queda **estrictamente prohibido** utilizar la palabra `"estándar"` en cualquier badge, interfaz gráfica, comando de terminal o documento de remisión/facturación. El conteo físico debe expresarse con claridad meridiana usando la sintaxis canónica:  
> `"${qty} ${unit} ${weightGr} gr"` (ej. `"1 Unidad 2000 gr"`, `"3 Unidades 2000 gr"`).

#### 9.7.2 Contrato Matemático de Recálculo y Equivalencia
Para cualquier producto cuya unidad maestra contable sea `Kg` y cuente con una presentación o variante ponderada en gramos ($P_{\text{gr}}$):

1. **Factor de Conversión:**
   $$F_{\text{kg}} = \frac{P_{\text{gr}}}{1000}$$
2. **Derivación de Masa Logística y Facturación:**
   Si el cliente o comercial ingresa $U$ unidades:
   $$Q_{\text{kg}} = U \times F_{\text{kg}}$$
   - `order_items.quantity` = $Q_{\text{kg}}$
   - `order_items.unit` = `'Kg'`
   - `orders.total_weight_kg` acumula $Q_{\text{kg}}$ para cubicaje de furgón.
   - Subtotal comercial = $Q_{\text{kg}} \times \text{Precio por Kg}$.
3. **Derivación Inversa (Resiliencia para Pedidos Históricos):**
   Si una orden previa registra $Q_{\text{kg}}$ con variante de presentación $P_{\text{gr}}$, el sistema deduce automáticamente las unidades:
   $$U = \frac{Q_{\text{kg}}}{F_{\text{kg}}}$$

#### 9.7.3 Estructura Canónica de Metadatos en `order_items.selected_options` (JSONB)
Todo ítem configurado con unidad dual debe persistir en su payload JSONB:
```json
{
  "_original_qty": 1,
  "_original_unit": "Unidad",
  "_unit_weight_gr": 2000,
  "_conversion_factor": 2.0,
  "_physical_instruction": "1 Unidad 2000 gr"
}
```

#### 9.7.4 Cadena de Custodia en las 7 Estaciones Operativas
1. **Estación 1 - Ingesta Comercial (`EmailDraftsModule` y `orders/create`):**
   Al asociar la presentación con peso nominal, se calcula la masa en Kg y se inyecta `_physical_instruction` canónico sin la palabra "estándar".
2. **Estación 2 - Monitoreo & Torre de Control (`admin/orders/loading`):**
   El modal de pedidos visualiza concurrentemente la masa total `2,0 Kg` y el badge verde `'1 Unidad 2000 gr'`. Si un pedido histórico carece de la llave `_physical_instruction`, un parser heurístico deduce el badge desde `selected_options.Presentación` o `variant_label`.
3. **Estación 3 - Planilla de Alistamiento Físico (`alistamiento-print`):**
   La hoja impresa de alistamiento incluye la instrucción física para que el bodeguero extraiga las unidades físicas exactas antes de llevar a báscula.
4. **Estación 4 - Células de Trabajo & Terminal Rápido (`ops/picking` y `terminal`):**
   La terminal de pesaje presenta al operario: "Alistar: 1 Unidad 2000 gr | Peso esperado: 2,0 Kg". El operario coloca la unidad física sobre la báscula y confirma el pesaje real (`picked_quantity`).
5. **Estación 5 - Rectificación LIFO (`ops/rectificacion`):**
   El checker de muelle valida visualmente que la canastilla contenga el conteo de frutos correspondiente antes del sellado del manifiesto.
6. **Estación 6 - Aplicación Móvil del Conductor (`driver/delivery`):**
   El chofer visualiza: `2,0 Kg | 1 Unidad 2000 gr`, permitiéndole entregar en el piso del cliente la unidad exacta sin generar discusiones por diferencias entre kilos y unidades.
7. **Estación 7 - Remisión Oficial de Despacho & Facturación (`billing/print`):**
   El documento legal impreso desglosa: `Papaya institucional - Maduro [1 Unidad 2000 gr]` con cantidad facturada `2,0 Kg`, garantizando transparencia jurídica y contable ante el cliente corporativo.

#### 9.7.5 Criterios de Aceptación BDD (Gherkin)
##### Escenario 1: Ingesta de Papaya con Presentación Unitaria de 2000 gr
- **Given** un borrador de correo o creación manual de pedido para un cliente B2B.
- **When** el usuario selecciona "Papaya institucional" con presentación "Unidad 2000 gr" y cantidad 1 Unidad.
- **Then**:
  1. `order_items.quantity` se fija en exactamente `2.0` con `unit = 'Kg'`.
  2. `order_items.selected_options._physical_instruction` se registra como `"1 Unidad 2000 gr"`.
  3. No figura en ningún registro la palabra `"estándar"`.
  4. En el modal de detalle del pedido se visualizan ambos datos: `2,0 Kg` y el badge `"1 Unidad 2000 gr"`.

##### Escenario 2: Resiliencia Retroactiva en Pedidos Existentes sin Metadatos Explícitos
- **Given** el pedido histórico `2309_0887` en base de datos con `quantity: 2`, `unit: "Kg"` y `selected_options: { "Presentación": "Unidad 2000 gr" }`.
- **When** el usuario abre el modal de auditoría de pedidos en `/admin/orders/loading`.
- **Then** el parser resuelve automáticamente $2\text{ Kg} / 2.0 = 1\text{ Unidad}$ y renderiza el badge `"1 Unidad 2000 gr"` junto a `2,0 Kg`.

---

## 10. Módulo de Autenticación, Seguridad Multi-Rol & Gobernanza de Idioma (SDD v1.8.0)

### 10.1 Principios Rectores del Ciclo de Vida de Identidad

1. **Gobernanza Incondicional de Idioma (Español Canónico):**
   - La plataforma FruFresco es un sistema de origen y operación nacional colombiana. **El idioma por defecto en todas las rutas es inalterablemente Español (`es`)**.
   - Bajo ninguna circunstancia el sistema debe conmutar a inglés por variables de entorno, configuración regional del navegador o fallbacks vacíos.
   - El idioma Inglés (`en`) se activa **única y exclusivamente** si el usuario presiona de manera explícita el botón `[EN]` en el conmutador de la barra de navegación.

2. **Autoservicio Seguro de Recuperación de Contraseña (Self-Service Password Reset):**
   - Todo usuario (colaborador o cliente) tiene derecho a restablecer su credencial de acceso de forma 100% autónoma sin recurrir a soporte técnico ni a administradores de base de datos.
   - El flujo se canaliza vía `supabase.auth.resetPasswordForEmail()` con un token temporal de un solo uso despachado al correo registrado (ej. Gmail).
   - Al abrir el enlace seguro, el sistema expone el formulario de actualización de clave (`supabase.auth.updateUser({ password })`), restablece la sesión y redirige al usuario según su rol.

3. **Arquitectura Multi-Rol: Selector de Espacio de Trabajo (Identity Switcher):**
   - Cuando un correo electrónico está asociado a más de un perfil en la tabla `profiles` (ej. colaboradores internos que a su vez son clientes corporativos B2B o administran múltiples razones sociales/sucursales):
     - El login autentica las credenciales maestras y detecta la multiplicidad de perfiles.
     - En lugar de forzar una redirección arbitraria, despliega el **Selector de Espacio de Trabajo ("Workspace Switcher")**:
       - `[ 🏢 FruFresco Operaciones ]` $\rightarrow$ Enruta a `/admin/dashboard` y habilita exclusivamente los módulos del ERP permitidos por su rol de colaborador.
       - `[ 🛒 Portal Institucional (Razón Social) ]` $\rightarrow$ Enruta a `/b2b/dashboard` y restringe la vista estrictamente a los precios, pedidos y facturas de la empresa seleccionada.
   - Si el correo posee un único perfil (comportamiento estándar), el enrutamiento es instantáneo sin pasos intermedios.

4. **Aislamiento Categórico de Permisos (RBAC):**
   - Los clientes (`role IN ('b2b_client', 'b2c_client', 'client')`) **NUNCA** tienen acceso a la barra de herramientas de "Operaciones", rutas administrativas (`/admin/*`) ni operativas (`/ops/*`), independientemente del valor del campo legacy `profile_type`.
   - Su experiencia está confinada al **Portal Institucional** (`/b2b/dashboard`), donde los datos se filtran estrictamente por su `profile.id` y `parent_id`.

### 10.2 Criterios de Aceptación Gherkin

#### Escenario 1: Olvido de Contraseña con Recuperación Autónoma
- **Given** que un colaborador o cliente introduce su correo en `/login` pero no recuerda su contraseña.
- **When** hace clic en *"¿Olvidaste tu contraseña?"*, digita su correo y presiona *"Enviar enlace de recuperación"*.
- **Then**:
  1. Supabase Auth despacha un correo con enlace seguro a la bandeja del usuario.
  2. Al pulsar el enlace, la interfaz muestra el modal de *Nueva Contraseña* en perfecto español.
  3. El usuario define su clave y el sistema actualiza su perfil sin intervención humana de soporte.

#### Escenario 2: Ingreso de Usuario con Doble Identidad (Yina / Camilo)
- **Given** un usuario autenticado cuyo correo posee un perfil de colaborador (`LIDER DE INVENTARIO`) y dos perfiles de cliente B2B (`YINA CORTES AMAYA`).
- **When** completa exitosamente su usuario y contraseña.
- **Then**:
  1. El sistema no lo redirige de golpe; despliega la tarjeta interactiva de selección de rol.
  2. Si elige *FruFresco Operaciones*, ingresa al ERP con acceso restringido a su módulo de inventarios.
  3. Si elige *Portal Institucional (Yina Cortes Amaya)*, ingresa al `/b2b/dashboard` viendo únicamente la cartera, pedidos y acuerdos de dicha sucursal.

---

## 11. Módulo Comercial: Gobernanza de Acuerdos Comerciales & Alertas de Vencimiento (SDD v1.8.1)

### 11.1 Principios Rectores y Regla de Negocio de Alertas Preventivas

1. **Umbral Preventivo Canónico de 5 Días:**
   - Todo acuerdo comercial formalizado (`quotes.status = 'agreement'`) cuya fecha de vigencia (`quotes.valid_until`) reste **5 días o menos** para expirar entra automáticamente en estado de advertencia (`warning`).
   - El objetivo operativo es conceder a la mesa comercial un margen proactivo de negociación para renovar o actualizar precios de contrato antes de que el acuerdo expire y bloquee o altere la rentabilidad de los pedidos D+1.

2. **Formato Dinámico de la Alerta:**
   - La alerta debe comunicar con precisión cuántos días exactos restan de vigencia, empleando un formato estándar y legible:
     - Si $\text{diffDays} = 0$: `POR VENCER (HOY)` o `Vence hoy`.
     - Si $\text{diffDays} = 1$: `POR VENCER (1 DÍA)` o `Por vencer (1 día)`.
     - Si $2 \le \text{diffDays} \le 5$: `POR VENCER (n DÍAS)` o `Por vencer (n días)`.
     - Si $\text{diffDays} < 0$: `ACUERDO VENCIDO` / `Vencido` (Badge crítico rojo).
     - Si $\text{diffDays} > 5$: `ACUERDO ACTIVO` / `Vigente` (Badge verde institucional).

3. **Normalización Cronológica Multi-Zona Horaria:**
   - Para prevenir falsos vencimientos prematuros o desfasajes ocasionados por la interpretación UTC en servidores/navegadores locales (Colombia UTC-5), la fecha límite de vigencia se normaliza siempre a las **23:59:59 del día de expiración**.
   - Ningún acuerdo se clasifica como vencido mientras transcurra el día calendario de su fecha de vencimiento.

4. **Omnipresencia y Consistencia Transversal:**
   - La regla de los 5 días aplica con idéntica lógica visual y de datos en:
     - **Core de Clientes (`ClientsModule.tsx`):** Vista de tabla (`ACUERDO / GPS`) y vista de tarjetas de clientes (acuerdos propios y heredados).
     - **Módulo de Acuerdos Institucionales (`CommercialAgreementsModule.tsx`):** Tarjetas KPI consolidadas (*Próximos a Vencer: Expira en 5 días o menos*) y badges de estado por contrato.
     - **Dashboard Unificado Comercial (`CommercialUnifiedDashboard.tsx`):** Feed de alertas operativas automáticas para el equipo de ventas y dirección de cuentas.

### 11.2 Criterios de Aceptación Gherkin

#### Escenario 1: Acuerdo Comercial Faltando 5 Días para Expirar
- **Given** un cliente corporativo que tiene un acuerdo comercial activo con `valid_until` fijado exactamente a 5 días del calendario actual.
- **When** el equipo comercial consulta el Core de Clientes en `/admin/commercial?tab=clients`.
- **Then**:
  1. La columna `ACUERDO / GPS` muestra un badge ámbar preventivo con el texto exacto `POR VENCER (5 DÍAS)`.
  2. En el panel de Acuerdos Comerciales, el KPI de *Próximos a Vencer* contabiliza dicho contrato.
  3. En el Dashboard Comercial, se genera una alerta con título `Acuerdo #... por Vencer (5 días)`.

#### Escenario 2: Acuerdo en su Último Día de Vigencia
- **Given** un acuerdo cuya fecha `valid_until` coincide con la fecha de hoy.
- **When** se evalúa el estado del acuerdo en cualquier vista comercial.
- **Then**:
  1. El estado no es `Vencido` sino `warning` con etiqueta `POR VENCER (HOY)` o `Vence hoy`.
  2. El acuerdo transiciona a `ACUERDO VENCIDO` recién a las 00:00:00 del día siguiente.

### 11.3 Motor Resiliente de Ingesta de Listas de Precios Excel (`extractRowsFromExcelSheet`)

1. **Tolerancia a Desplazamiento de Encabezados (Header Offset):**
   - El sistema no asume rígidamente que la primera fila (`A1`) contiene los encabezados.
   - Escanea las primeras 25 filas de la hoja en formato matriz 2D buscando la fila que maximice la correspondencia con las columnas críticas de negocio (Precio + Código o Nombre de Producto).

2. **Detección Polimórfica de Columnas:**
   - **Código / ID:** Identifica `ID Producto`, `Accounting ID`, `Código`, `Codigo`, `Cod Contable`, `SKU`, `Ref`, `Item` o `#`.
   - **Nombre / Descripción:** Identifica `Nombre del Producto`, `Producto`, `Descripción`, `Descripcion`, `Detalle` o `Artículo`.
   - **Precio:** Identifica `Precio Acordado`, `Precio`, `Precio Unitario`, `Tarifa`, `Valor`, `Precio Venta`, `Price` o `Costo`.

3. **Cruce Bidireccional Inteligente con el Catálogo (`findProductInMap`):**
   - Si el archivo carece de columna de código contable pero posee nombres de producto, el motor no bloquea la carga: cruza fonética y textualmente contra el catálogo de FruFresco normalizando acentos, diacríticos y espacios (`normalizeExcelText`).
   - El catálogo maestro se indexa por `id`, `accounting_id`, `sku` y `normName` para garantizar una tasa de reconocimiento superior al 95%.

4. **Parser Numérico de Moneda y Formato Colombiano:**
   - Sanitiza automáticamente símbolos monetarios (`$`, `COP`), espacios y separadores de miles/decimales (`15.000` $\rightarrow 15000$, `15,500.00` $\rightarrow 15500$, `12.500,50` $\rightarrow 12500.5$).

#### Escenario 3: Carga de Excel con Título en Fila 1 y Variación de Cabeceras
- **Given** un archivo Excel suministrado por el cliente cuya Fila 1 es un título ("LISTA PRECIOS INSTITUCIONAL") y los encabezados están en la Fila 3 con columnas "Código de producto", "Nombre" y "Precio acordado".
- **When** el usuario arrastra o sube el archivo en el modal de Acuerdos Comerciales.
- **Then**:
  1. El sistema no arroja error de *"No se encontraron las columnas Código de producto y Precio acordado"*.
  2. Detecta la fila 3 como cabecera válida, procesa todas las filas con precio $> 0$ y realiza el match inmediato con el catálogo de FruFresco.

### 11.4 Nomenclatura Canónica y Visualización en Estructura Comercial del Cliente (`ClientsModule`)

1. **Persistencia del Nombre Canónico (`quotes.model_snapshot_name`):**
   - Todo acuerdo comercial creado mediante carga de Excel o asignación manual calcula y persiste el nombre canónico del acuerdo compuesto por el nombre del cliente y la fecha de vigencia inicial (`[Razón Social / Contacto] - DD-MM-AA`).
   - Al convertir leads a B2B con acuerdo inicial, se genera y persiste de forma análoga.

2. **Visualización en Perfil del Cliente (`ESTRUCTURA COMERCIAL -> MODELO DE PRECIOS`):**
   - La tarjeta de Modelo de Precios del cliente prioriza en tipografía seminegrita destacada el nombre del acuerdo (`model_snapshot_name` o fallback estructurado `${company_name} - ${fecha}`).
   - El código técnico correlativo (`ACI DDMM ####`) se muestra de forma complementaria como badge monospace distintivo.
   - En el modal de consulta de precios congelados (`AgreementDetailsModal`), la cabecera principal adopta el nombre comercial del acuerdo con subtítulo del código ACI y estado activo.

#### Escenario 5: Identificación Inequívoca del Acuerdo Comercial en Estructura de Cliente
- **Given** un cliente B2B ("MILSEN SAS" / "Restaurante Yanuba") con acuerdo cargado vía Excel el 22-09-2026 bajo el código técnico `ACI 2209 0103`.
- **When** el ejecutivo comercial o administrador consulta la pestaña "Estructura Comercial" en la ficha del cliente.
- **Then**:
  1. La tarjeta de "Modelo de Precios" exhibe en texto principal destacado: `MILSEN SAS - 23-09-26` (nombre canónico).
  2. Exhibe en badge secundario estilizado: `ACI 2209 0103` (identificador técnico).
  3. Al dar clic en "Ver Precios →", el modal titula con el nombre comercial `MILSEN SAS - 23-09-26` y lista los productos congelados sin reemplazar el nombre por el correlativo numérico.


### 11.5 Aislamiento de Trazabilidad Granular por Ítem & Supresión de Identificadores Técnicos

1. **Aislamiento Estricto de Auditoría por Producto:**
   - La modificación del precio de un ítem en particular (ej. Ahuyama) genera un registro individual en `audit_logs` con `action: 'UPDATE_quote_item_price'`.
   - **Regla de Inmunidad:** Dicha modificación actualiza la fecha global de la cabecera del acuerdo, pero **NO altera** la trazabilidad de los demás 105+ productos de la lista. Los ítems no modificados preservan su autor original de carga y su marca temporal inicial sin ser contaminados por `latestAgreementLog`.
   - Únicamente el ítem modificado despliega el badge azul `Modificado` con la fecha/hora reciente y el nombre del colaborador que ejecutó la edición.

2. **Supresión de UUIDs y Legibilidad Humana de Identidad:**
   - Queda formalmente prohibida la exposición de identificadores técnicos o UUIDs (`ID: 77ef7895-cc19-4d3d...`) en la interfaz de usuario y en los reportes imprimibles.
   - La columna de usuario muestra exclusivamente el nombre corporativo o correo del colaborador (ej. `admin@frufresco.com` o `Julissa Arévalo Ramirez`).

#### Escenario 4: Modificación Unitaria de Precio sin Contaminación de Autor
- **Given** una lista de precios de 106 productos creada por `Julissa Arévalo Ramirez`.
- **When** el usuario `admin@frufresco.com` edita únicamente el precio del producto "Ahuyama".
- **Then**:
  1. En la cabecera de la lista, se actualiza: `Actualizada por admin@frufresco.com (Fecha - Hora)`.
  2. En la tabla de productos, "Ahuyama" muestra: fecha reciente, badge `Modificado` y usuario `admin@frufresco.com`.
  3. Todos los demás 105 productos continúan mostrando su fecha de carga original y su autor `Julissa Arévalo Ramirez`.
  4. Ningún producto expone el UUID interno del usuario.
### 11.6 Ergonomía de Búsqueda Rápida y Fijación Sticky en Acuerdos Comerciales

1. **Botón de Limpieza Inmediata `[X]` en Input de Búsqueda:**
   - Todo campo de búsqueda en la galería de acuerdos y en el visor de precios congelados cuenta con un botón de limpieza rápida `[X]` anclado a la derecha del input.
   - El botón se muestra dinámicamente cuando el término de búsqueda no está vacío (`searchTerm.length > 0`) y restablece el filtro a vacío en un solo clic, devolviendo el foco visual de forma instantánea.
   - El input cuenta con `paddingRight` adaptativo para evitar cualquier superposición visual entre el texto ingresado y el ícono de borrado.

2. **Fijación Sticky de la Barra de Herramientas y Encabezados de Tabla:**
   - **Barra Superior de Herramientas (`TOP TOOLBAR CONTROLS`):** Se mantiene fija (`position: sticky; top: 0px; zIndex: 30; background-color: #FFFFFF;`) al desplazarse verticalmente sobre el listado de acuerdos, permitiendo al usuario cambiar filtros de estado ("Todos", "Vigentes", "Por Vencer", "Vencidos"), buscar clientes o crear acuerdos sin perder el contexto visual.
   - **Encabezados de la Tabla (`thead`):** Se mantienen fijos inmediatamente debajo de la barra de controles (`position: sticky; top: 65px; zIndex: 25; background-color: #F8FAFC;`), garantizando que los nombres de las columnas ("Código", "Cliente B2B", "Vigencia", "Duración", "Estado", "Margen Promedio", "Acciones") permanezcan siempre visibles durante el scroll de largas listas de contratos.
   - **Visor Lateral de Productos Congelados (Drawer):** Los encabezados de la tabla de productos del acuerdo también adoptan fijación sticky (`position: sticky; top: 0px; zIndex: 10; background-color: #F8FAFC;`) dentro de su contenedor de scroll, facilitando la auditoría de catálogos extensos (100+ SKUs).

#### Escenario 6: Navegación y Búsqueda Ágil en Galería de Acuerdos
- **Given** un operador comercial navegando en la pestaña "Acuerdos Institucionales" con más de 20 acuerdos listados.
- **When** escribe "milse" en el buscador y luego desea consultar toda la lista nuevamente.
- **Then**:
  1. Aparece el botón `[X]` dentro del campo de texto.
  2. Al pulsar `[X]`, el buscador se limpia inmediatamente mostrando todos los acuerdos sin requerir borrar letra por letra.
  3. Al desplazarse hacia abajo mediante scroll, la barra con el buscador, botones de filtro y los encabezados de las columnas permanecen permanentemente visibles y anclados en la parte superior.

---

## 12. Panel Admin Ejecutivo, Delta Command Center & Ecosistema de Módulos Maestros (SDD v1.8.3)

### 12.1 Torre de Control Ejecutiva (`/admin/dashboard`)

El Panel de Control Principal de FruFresco (`/admin/dashboard`) opera como la torre de mando ejecutiva y el portal central de enrutamiento RBAC para la dirección general y operaciones:

1. **Cuadrante Superior de KPIs en Tiempo Real (D+0):**
   - **Ventas Hoy:** Sumatoria consolidada de la columna `orders.total` para todos los pedidos registrados desde las `00:00:00` del día corriente.
   - **Pedidos Pendientes:** Conteo exacto de órdenes en estados operativos no despachados (`draft`, `pending_approval`).
   - **Leads Nuevos:** Conteo de prospectos comerciales en estado inicial `new`.
   - **Ticket Promedio:** Media aritmética calculada sobre la totalidad de pedidos históricos registrados en el sistema.

2. **Inteligencia de Ventas & Mix de Presentación (Mes en Curso):**
   - **Distribución de Presentación (Unidades vs Granel):**
     - **Granel/Volumen:** Identificado por unidades de medida de masa y peso (`libra`, `libras`, `kg`, `kilo`, `kilos`, `lb`, `lbs`).
     - **Unidades/Empaque:** Cualquier otra unidad discreta (paquetes, bandejas, mallas, unidades).
     - **Visualizador Donut:** Gráfico vectorial dinámico que refleja el porcentaje de facturación y volumen físico acumulado de cada categoría durante el mes.
   - **Despacho Logístico & Carga Promedio:**
     - Computa el promedio de `total_weight_kg` por pedido despachado en el mes.
     - Indicador visual de cubicaje proyectado frente a una capacidad estándar de camión de 300 kg.
   - **Top Variantes con Mayor Margen Extra:**
     - Cruce algorítmico entre `order_items.selected_options` y la matriz de `product_variants`.
     - Identifica y ranquea las 5 opciones/variantes que mayor rentabilidad marginal han aportado a la operación.

3. **Radar de Ventas Hogar (B2C) en Tiempo Real:**
   - Suscripción bidireccional mediante Supabase Realtime (`postgres_changes` sobre la tabla `orders`).
   - Actualización reactiva instantánea ante nuevas compras sin recargar la página.

4. **Matriz de Seguridad & Accesos Gobernados (RBAC Gateway):**
   - La visibilidad de los accesos directos (*Catálogo Web, Maestro SKU, Clientes CRM, Proveedores, Ajustes del Sistema, Gobernanza*) está supeditada estrictamente a la matriz de permisos `system_roles` evaluada mediante `checkUserPermission(profile, permission, roles)`:
     - `admin.products.catalog` $\rightarrow$ Catálogo Web (`/admin/products`)
     - `admin.products.master` $\rightarrow$ Maestro SKU (`/admin/master/products`)
     - `admin.clients` $\rightarrow$ Clientes CRM (`/admin/clients`)
     - `admin.procurement.providers` $\rightarrow$ Proveedores (`/admin/procurement/providers`)
     - `admin.dashboard.audit` $\rightarrow$ Gobernanza & Auditoría (`/admin/audit`)
     - `admin.dashboard.settings` $\rightarrow$ Ajustes del Sistema (`/admin/settings`)
   - El acceso al **Centro de Comando Delta** está reservado exclusivamente para roles de máxima jerarquía técnica (`sys_admin`, `admin` o el superusuario institucional `admin@frufresco.com`).

---

### 12.2 Delta Command Center: Consola de Alta Gobernanza & Orquestación SaaS (`/admin/command-center`)

El **Delta Command Center** es el núcleo de ingeniería y control de infraestructura de la plataforma, diseñado con aislamiento de seguridad Nivel 3. Se estructura en 6 consolas especializadas:

1. **Pestaña 1: Gobernanza del Sistema (`governance`):**
   - **Estandarización de Unidades de Medida (`standard_units`, `suspended_units`):** Gestión del catálogo canónico de unidades (kg, lb, g, atado, caja, bandeja). Permite activar, suspender o reactivar unidades, impidiendo que el catálogo comercial introduzca unidades corruptas.
   - **Matriz de Roles Técnicos & Permisos (`system_roles`):** Asignación granular de capacidades por rol (`admin`, `commercial`, `logistics`, `procurement`, `driver`, `customer`) con control de switches booleanos por módulo. Incluye control simétrico para submódulos administrativos satélites (`admin.products.catalog`, `admin.products.master`, `admin.clients`, `admin.procurement.providers`, `admin.dashboard.audit`, `admin.dashboard.settings`).
   - **Atributos Maestros de Catálogo (`ManageAttributesModal`):** Configuración de atributos globales dinámicos (calibres, maduración, procedencia, certificaciones) para el Maestro SKU.
   - **Enrutamiento de Webhooks de Correo Inbound:** Inspección y configuración de las casillas de entrada para ingesta automática (`inbox_email_orders` para pedidos B2B y `inbox_email_commercial` para cotizaciones).

2. **Pestaña 2: Aprobaciones & Usuarios Técnicos (`approvals` / `TechUserGovernance`):**
   - Panel de auditoría y autorización previa para operadores técnicos, desarrolladores y personal con privilegios elevados.
   - Restricción de doble factor y validación de correo corporativo para mitigar escalamiento de privilegios no autorizados.

3. **Pestaña 3: Mesa de Ayuda & SLAs Operativos (`helpdesk`):**
   - Indicadores de rendimiento de soporte (`support_tickets_metrics`): Tickets abiertos, tickets cerrados hoy, tiempo promedio de primera respuesta (MTTR) y tasa de resolución en primer contacto.
   - Flujo de estados normativo: `open` $\rightarrow$ `in_progress` $\rightarrow$ `waiting_user` $\rightarrow$ `resolved` $\rightarrow$ `closed`.

4. **Pestaña 4: Geocercas Operativas (`geofencing` / `GeofencingManager`):**
   - Integración visual de alta precisión con Google Maps API (`@vis.gl/react-google-maps`).
   - Definición de polígonos geoespaciales para delimitar:
     - **Zonas B2B Institucionales:** Cobertura para camiones refrigerados de carga pesada.
     - **Zonas B2C Hogares:** Radios de reparto exprés con ventanas horarias y tarifas de flete diferenciadas.
     - Bloqueo preventivo de checkout para direcciones fuera de polígono habilitado.

5. **Pestaña 5: Control de Flota SaaS & Despliegue Multi-Tenant (`fleet`):**
   - Gestión de instancias cliente (`fleet_tenants`) conectadas al repositorio Core.
   - **Pipeline de Despliegue en Dos Fases:**
     - **Fase 1 (Sincronización de Código Git):** Ejecuta `/api/maintenance/update-all` propagando los cambios aprobados desde la rama `main`/`CORE` hacia las 7 ramas remotas activas (`main`, `liard`, `CORE`, `core`, `tenant-frufresco`, `tenant1`, `white-label`).
     - **Fase 2 (Sincronización de Base de Datos y Marca):** Ejecuta `/api/fleet/sync` actualizando llaves de entorno, esquemas SQL y metadatos de configuración en Supabase por cada inquilino.
   - Diagnóstico visual de salud (Healthcheck HTTP 200) y versión de commit desplegado en cada tenant.

6. **Pestaña 6: Auditoría Irrestricta (`audit`):**
   - Consola forense de máxima visibilidad que omite la restricción temporal de 90 días del módulo de gobernanza estándar, permitiendo búsquedas históricas ilimitadas con filtrado multidimensional por UUID de usuario, IP, módulo y acción.
   - **Exportación Resiliente & Dynamic Import:** Exporta a formato `.xlsx` cargando la librería `xlsx` bajo demanda (`await import('xlsx')`), protegiendo celdas masivas con `sanitizeJsonForExcel` (tope de 3.000 caracteres por celda) en paridad exacta con la regla de 32K del módulo estándar.

---

### 12.3 Ecosistema de Módulos Maestros Satélite

El Admin Dashboard coordina 5 módulos satélite esenciales que alimentan la operación diaria:

1. **Maestro de SKU (`/admin/master/products`):**
   - **Fuente Única de Verdad (Single Source of Truth):** Define el producto técnico base, su código contable único, su descripción oficial y sus parámetros fiscales (IVA).
   - **Matriz de Conversión Multi-Nivel:** Establece los factores de conversión matemática entre la unidad base de compra/almacenamiento (`from_unit`) y las unidades de venta o fraccionamiento (`to_unit`), garantizando el balance de masa estricto en inventario.
   - **Costo Base Oficial:** Almacena el costo estándar de referencia utilizado por el cotizador comercial para garantizar los márgenes mínimos de rentabilidad.

2. **Maestro de Proveedores (`/admin/procurement/providers`):**
   - Directorio institucional de fuentes de abastecimiento, cooperativas agrícolas y productores locales.
   - Registro de plazos de pago (contado, 8, 15, 30, 45 días), cupos de crédito, contacto comercial y categorías autorizadas de suministro.
   - Trazabilidad de órdenes de compra emitidas y evaluación de cumplimiento en entregas.

3. **Catálogo Web B2C (`/admin/products`):**
   - Módulo de comercialización directa al consumidor final (Hogares).
   - Gestión de precios minoristas, promociones temporales, destacados de portada y activación/desactivación inmediata en vitrina digital.
   - Carga de fotografía de producto y etiquetas de búsqueda (Tags).

4. **CRM de Clientes Institucionales (`/admin/clients` - `ClientsModule`):**
   - Gestión de la relación B2B bajo el principio estricto de jerarquía Matriz vs Sucursales (Sección 1).
   - Administración de acuerdos comerciales vigentes, plazos de crédito institucional, direcciones de entrega georreferenciadas y contactos operativos por sede.
   - Puntos de contacto WhatsApp estandarizados bajo norma E.164.

5. **Ajustes del Sistema (`/admin/settings`):**
   - Configuración global de identidad corporativa y branding (nombre de empresa, NIT, logos e isotipos).
   - Integración con bucket de almacenamiento seguro Supabase Storage (`branding`).
   - Parámetros operativos generales: costos de envío base, umbrales de flete gratuito y plantillas de notificación.

---

### 12.4 Módulo de Gobernanza, Auditoría & Trazabilidad Forense (`/admin/audit`)

El subsistema de auditoría garantiza la trazabilidad inalterable de cada evento transaccional, administrativo y de seguridad ocurrido en el ERP.

1. **Ventana Temporal Máxima de Consulta:**
   - El motor de consulta impone un límite estricto de **90 días (3 meses)** hacia atrás (`created_at >= NOW() - 90 días`) para optimizar el rendimiento y evitar bloqueos en base de datos.
   - Paginación continua por lotes de 50 registros (`PAGE_SIZE = 50`).

2. **Estándar de Descarga Masiva Resiliente a Excel (Regla 32K):**
   - **Restricción Física del Motor Excel (OpenXML / BIFF8):** Una celda en un archivo Excel no puede superar bajo ninguna circunstancia los **32.767 caracteres** (`Text length must not exceed 32767 characters`).
   - **Saneamiento Preventivo (`sanitizeJsonForExcel`):**
     - La exportación a `.xlsx` analiza la columna `details` (JSON de auditoría). Si la carga serializada de cambios masivos supera los 3.000 caracteres, el exportador trunca el texto de forma segura con sufijo `... [TRUNCADO_POR_TAMAÑO]`, impidiendo el desbordamiento y el bloqueo de la descarga.
   - **Resumen en Lenguaje Natural (`formatDetailsSummaryText`):**
     - Se genera una columna complementaria en español legible que sintetiza los cambios esenciales (Células creadas, líder asignado, costos modificados, correo de sesión, SKU o estado) sin obligar al usuario a descifrar estructuras JSON crudas.
   - **Capacidad de Exportación:** Carga paginada en lotes de 1.000 registros con un techo seguro de hasta 2.500 eventos por reporte descargado.

---

### 12.5 Criterios de Aceptación & Escenarios BDD

#### Escenario 7: Descarga Masiva de Auditoría con Matrices Extensas de Gobernanza
- **Given** un administrador en `/admin/audit` con eventos de modificación masiva de células de trabajo y permisos de roles cuyos objetos JSON superan los 40.000 caracteres.
- **When** pulsa el botón "Descargar Reporte (XLSX)".
- **Then**:
  1. El sistema no arroja error emergente de *"Text length must not exceed 32767 characters"*.
  2. Genera y descarga el archivo `Reporte_Auditoria_YYYY-MM-DD.xlsx` de forma transparente.
  3. Las celdas complejas preservan su resumen legible en lenguaje humano y el campo técnico queda delimitado dentro de los estándares de Excel.

#### Escenario 8: Despliegue Multi-Tenant Seguro desde Delta Command Center
- **Given** un usuario autenticado con rol `sys_admin` ubicado en la pestaña "Flota SaaS" de `/admin/command-center`.
- **When** activa la sincronización general pulsando "Actualizar Todas las Instancias".
- **Then**:
  1. El backend ejecuta de forma secuencial Fase 1 (`/api/maintenance/update-all`) asegurando la paridad Git en las 7 ramas del ecosistema.
  2. Ejecuta Fase 2 (`/api/fleet/sync`) refrescando la parametrización de bases de datos de cada cliente SaaS.
  3. Despliega en pantalla el estado individual de salud de cada tenant con su versión de commit confirmada.
  4. Ningún usuario con roles inferiores (`commercial`, `logistics`, `procurement`) tiene visibilidad o acceso a dicha consola.

#### Escenario 9: Gobernanza Integral de SKU desde Maestro hasta Catálogo Web y Acuerdos
- **Given** la creación o modificación de un producto en el Maestro de SKU (`/admin/master/products`) con código contable `SKU-MANZ-01`, costo base \$3.200 y unidad base `kg`.
- **When** el producto es consultado en el cotizador de Acuerdos Comerciales B2B o publicado en el Catálogo Web B2C.
- **Then**:
  1. El cotizador comercial adopta de forma inmediata el costo base oficial (\$3.200) para calcular el margen objetivo.
  2. En caso de venta por unidades o bandejas, el factor de conversión estipulado en el Maestro rige la deducción física en el balance de inventario (Sección 8).
  3. Los cambios en el Maestro generan un registro inmutable en `audit_logs` trazable tanto en Gobernanza (`/admin/audit`) como en la consola forense de Delta Command Center.

