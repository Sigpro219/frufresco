# Plan de Trabajo - Frubana Express

## Estructura del Proyecto

El proyecto se divide estrictamente en dos fases macro:

### FASE 1: Página Web (Cliente Externo)

- **Objetivo:** Venta, Catálogo y Captura de Pedidos.
- **Usuarios:** Clientes Hogar (B2C) e Institucionales (B2B).
- **Estado:** Catálogo visual implementado. Integración de pagos Wompi (Backend).

### FASE 2: App Operativa (Procesos Internos)

- **Objetivo:** Gestión, Logística y Administración.
- **Usuarios:** Administrador, Compradores, Operarios de Bodega, Transportadores.
- **Módulos:**
  - [x] 3.2 Compras (Dashboard de Compras)
  - [x] 3.3 Recogida (Picking de Proveedores)
  - [x] 3.4 Recepción (Bodega y Calidad)
  - [ ] 3.7 Cargue de Pedidos (Control Tower) **<-- EN PROCESO**
  - [ ] 3.5 Alistamiento (Picking Interno)
  - [ ] 3.6 Despacho
  - [ ] 3.9 Inventarios

---

## Módulo 3.7: Cargue de Pedidos (Control Tower)

**Uso:** Exclusivo PC (Administrador).
**Función:** Centralizar entradas de todos los canales (Web, WhatsApp, Email, Teléfono).

### Tareas Inmediatas

1.  **Base de Datos:**
    - [ ] Unificar tabla `orders` con campos de origen (`origin_source`).
    - [ ] Implementar estados del flujo completo (`approved`, `processing`, `dispatching`).
2.  **Interfaz Admin (/admin/orders):**
    - [ ] Grid de Pedidos con filtros por estado y canal.
    - [ ] Formulario de "Nuevo Pedido Manual" (para Teléfono/WhatsApp).
    - [ ] Visualización de Pedidos Web.
3.  **Lógica de Negocio:**
    - [ ] Restricción horaria de edición (6pm - 8pm) para pedidos web.
    - [ ] Cálculo de totales para Compras.

### Pendientes Futuros (Automatización)

Estas tareas se ejecutarán una vez el Módulo 3.7 esté estable y probado.

- [ ] **Lectura Automática de OC (PDF):**
  - Implementar servicio de OCR/IA para leer PDFs enviados por correo.
  - Crear pedidos en estado "Borrador" automáticamente.
- [ ] **Data Maestra:**
  - Crear generación de las variables en data maestra sku.
- [ ] **Bot de Pedidos WhatsApp:**
  - Implementar agente conversacional (LLM) que estructure pedidos desde chat.
- [ ] **Modelo de Pricing Nutresa (SIPSA):**
  - Consumo mensual de boletín DANE (Excel Anexos).
  - Filtrado automático por ciudad (Bogotá).
  - Tabla de márgenes/prima de servicio por SKU.
  - Visualización comparativa: Precio DANE + Prima vs. Último precio Colsubsidio.
  - Cálculo de desviación de precios para toma de decisiones.

---

### FASE 3: CCM & Ecosistema (SaaS)

- **Objetivo:** Centralizar la gobernanza de múltiples instancias (FruFresco, Cliente B, etc.) en un solo panel maestro.
- **Funcionalidades:**
  - [ ] **Tablero Maestro de Solicitudes:** Recepción de cambios geo-estratégicos y actualizaciones de SEO de todos los clientes.
  - [ ] **Gobernanza Proactiva:** Sistema de "Solicitud y Validación" para cambios críticos (Geocercas y Perfiles).
  - [ ] **Economía de Escala:** Sincronización de mejoras de código y SEO entre todas las instancias.
  - [ ] **Analytics Global:** Mapa de calor logístico y comparativa de rendimiento inter-clientes.

### FASE 4: Infraestructura y Migración

- **Objetivo:** Desplegar la arquitectura definitiva y asegurar la redundancia de datos.
- **Tareas:**
  - [ ] **Despliegue en Hosting Cliente:** Configuración de entorno de producción final para FruFresco.
  - [ ] **Mirroring en Hosting Propio:** Creación de una copia exacta (Reflejo/Brochure Vivo) para demostraciones y respaldo.
  - [ ] **Migración de Base de Datos:** Paso de datos de Supabase de prueba a los Supabase definitivos (Cliente y Propio).
  - [ ] **Interconexión con CCM:** Vincular ambas instancias (Producción y Demo) al Centro de Control Maestro.
