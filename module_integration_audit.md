# Auditoría de Integración de Módulos - Frubana Express

Este documento detalla el flujo lógico de información a través de los diferentes módulos del sistema y establece una lista de chequeo para verificar la correcta transmisión de datos (inputs/outputs) entre ellos.

## Estructura y Secuencia Lógica

El flujo operativo se divide en las siguientes etapas secuenciales:

1.  **Adquisición y Catálogo (Entrada)**
    - Gestión de Productos (Maestra)
    - Inventario Inicial
    - B2B / E-commerce (Captura de Pedidos)

2.  **Procesamiento de Pedidos (Núcleo)**
    - Cargue y Validación de Pedidos (Ops)
    - Gestión de Clientes (CRM/Admin)

3.  **Operaciones Logísticas (Cumplimiento)**
    - Compras (Abastecimiento)
    - Picking y Packing (Alistamiento)
    - Gestión de Flota y Conductores
    - Enrutamiento y Despacho

4.  **Cierre y Administrativo (Salida)**
    - Entregas y Novedades (Driver App)
    - Facturación y Cartera
    - Reportes y BI

---

## Lista de Chequeo de Integración

### 1. Módulo: Gestión de Productos (Maestra)

**Ruta:** `/admin/products`, `/admin/master`

- **Input:** Creación manual o carga masiva (Excel) de SKUs.
- **Output:** Base de datos de productos disponible para pedidos e inventario.
- **Chequeo:**
  - [ ] ¿Al crear un producto, aparece inmediatamente en el catálogo B2B?
  - [ ] ¿Los cambios de precio se reflejan en los nuevos pedidos?
  - [ ] ¿Las unidades de medida (Kg, Un, Lb) son consistentes en todos los módulos?

### 2. Módulo: Inventario

**Ruta:** `/admin/commercial/inventory`

- **Input:** Ajustes manuales, compras (entradas), pedidos (salidas/reservas).
- **Output:** Disponibilidad para venta (Stock).
- **Chequeo:**
  - [ ] ¿El inventario se debita automáticamente al aprobar un pedido?
  - [ ] ¿Las devoluciones reingresan al inventario o van a merma?
  - [ ] ¿Se actualiza el stock en tiempo real para impedir sobreventa en B2B?

### 3. Módulo: Captura de Pedidos (B2B / Checkout)

**Ruta:** `/checkout`, `/b2b`, `/admin/orders`

- **Input:** Selección de productos por el cliente o vendedor.
- **Output:** Registro de Orden en estado `pending_approval`.
- **Chequeo:**
  - [ ] ¿El pedido guarda correctamente los datos del cliente (ID, Dirección, Zona)?
  - [ ] ¿Se calculan bien los totales (impuestos, domicilios)?
  - [ ] ¿Un pedido B2B se refleja en `admin/orders/loading`?

### 4. Módulo: Cargue y Validación de Pedidos (Cerebro Operativo)

**Ruta:** `/admin/orders/loading`

- **Input:** Pedidos crudos de todas las fuentes (Web, WhatsApp, B2B).
- **Output:** Pedidos aprobados (`para_compra` / `approved`), listos para picking.
- **Chequeo:**
  - [ ] ¿Al aprobar, cambia el estado a `approved` en la tabla `orders`?
  - [ ] ¿Se valida el cupo de crédito del cliente antes de aprobar?
  - [ ] ¿La fecha de entrega se asigna correctamente según la regla de corte (8 PM)?

### 5. Módulo: Compras (Abastecimiento)

**Ruta:** `/ops/compras`

- **Input:** Consolidado de pedidos aprobados (Demanda).
- **Output:** Órdenes de compra a proveedores / Ingreso de mercancía.
- **Chequeo:**
  - [ ] ¿El módulo muestra la cantidad exacta a comprar basada en los pedidos del día?
  - [ ] ¿Se agrupan los productos por proveedor o categoría?

### 6. Módulo: Picking y Packing (Alistamiento)

**Ruta:** `/ops/picking/dashboard`, `/ops/picking/terminal`

- **Input:** Pedidos en estado `approved`.
- **Output:** Pedidos `packed` o con items marcados como "pickeados", listos para enrutar.
- **Chequeo:**
  - [ ] ¿Los items aparecen en la terminal de la célula correcta (Frutas, Verduras...)?
  - [ ] ¿Al marcar "pickeado", se actualiza la cantidad real (pesaje)?
  - [ ] ¿Si no hay producto, permite marcar "faltante" y esto alerta a comercial?

### 7. Módulo: Torre de Control (Logística)

**Ruta:** `/admin/transport`

- **Input:** Pedidos alistados, Flota disponible.
- **Output:** Rutas creadas (`routes`), Pedidos asignados a rutas.
- **Chequeo:**
  - [ ] ¿Se pueden ver todos los pedidos pendientes de despacho?
  - [ ] ¿Al crear una ruta, los pedidos cambian de estado a `in_transit` o `routed`?
  - [ ] ¿Se descuenta la capacidad de carga del vehículo correctamente?

### 8. Módulo: Entrega (Driver View)

**Ruta:** `/ops/driver/route/[id]` (Simulado o App)

- **Input:** Ruta asignada al conductor.
- **Output:** Pedidos `delivered` o `rejected` (Devoluciones).
- **Chequeo:**
  - [ ] ¿El conductor ve la lista ordenada de paradas?
  - [ ] ¿Puede marcar entrega parcial o rechazo (Novedad)?
  - [ ] ¿La prueba de entrega (foto/firma) se guarda en el pedido?

### 9. Módulo: Facturación y Cartera

**Ruta:** `/admin/commercial/billing`

- **Input:** Pedidos entregados (`delivered`) y Devoluciones reportadas.
- **Output:** Facturas electrónicas, Notas crédito, Archivo plano contable.
- **Chequeo:**
  - [ ] ¿Solo se facturan los pedidos `delivered`?
  - [ ] ¿Las devoluciones (`delivery_events`) generan automáticamente la nota crédito o descuento?
  - [ ] ¿El total facturado coincide con lo realmente entregado (Pesos reales)?

---

## Estado Actual de la Auditoría

| Módulo          | Estado Revisión | Hallazgos Críticos |
| :-------------- | :-------------: | :----------------- |
| **Maestra**     |  ⬜ Pendiente   |                    |
| **Inventario**  |  ⬜ Pendiente   |                    |
| **B2B/Pedidos** |  ⬜ Pendiente   |                    |
| **Validación**  |  ⬜ Pendiente   |                    |
| **Compras**     |  ⬜ Pendiente   |                    |
| **Picking**     |  ⬜ Pendiente   |                    |
| **Transporte**  |  ⬜ Pendiente   |                    |
| **Entregas**    |  ⬜ Pendiente   |                    |
| **Facturación** |  ⬜ Pendiente   |                    |

> **Instrucciones:** Utilice esta tabla para marcar el progreso. Detalle cualquier ruptura en el flujo de información en la sección de Hallazgos.
