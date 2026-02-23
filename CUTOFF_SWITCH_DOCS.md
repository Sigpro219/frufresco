# 🎛️ Interruptor de Reglas de Corte (Cutoff Switch)

## 📋 Resumen

El **Interruptor de Reglas de Corte** es un control global que permite activar o desactivar la lógica basada en la hora de corte de las 5 PM en todo el sistema. Esta funcionalidad es esencial para:

- **Pruebas End-to-End (E2E)**: Permite realizar pruebas sin restricciones de tiempo
- **Validación de Sistema**: Facilita la validación completa del flujo sin esperar horarios específicos
- **Desarrollo**: Simplifica el testing durante el desarrollo de nuevas funcionalidades

## 🔧 Implementación

### 1. Base de Datos

El setting se almacena en la tabla `app_settings`:

```sql
-- Clave: enable_cutoff_rules
-- Valores posibles:
--   'true'  -> Reglas activadas (comportamiento normal de producción)
--   'false' -> Reglas desactivadas (modo de pruebas)
```

**Instalación**: Ejecutar el archivo `seed_cutoff_switch.sql` para crear/actualizar el setting.

### 2. Interfaz de Usuario

El interruptor está disponible en:

**🌐 Ruta**: `/admin/settings`

**📍 Ubicación**: Sección "Operación de Tienda" (primera sección)

**🎨 Control**: Dropdown con opciones "ACTIVADA" / "DESACTIVADA"

### 3. Módulos Afectados

El interruptor controla el comportamiento de los siguientes módulos:

#### ✅ Módulos Implementados

1. **Procurement / Compras** (`/ops/compras/page.tsx`)
   - **Con switch activo**: Consolida pedidos según la regla de 5 PM
   - **Con switch desactivado**: Siempre consolida para el día siguiente

2. **Picking** (`/ops/picking/page.tsx`)
   - **Con switch activo**: Filtra órdenes según regla de 5 PM
   - **Con switch desactivado**: Muestra todas las órdenes activas

3. **Checkout / B2C** (`/checkout/page.tsx`)
   - **Con switch activo**: Aplica "Entrega pasado mañana" si es después de 5 PM
   - **Con switch desactivado**: Siempre permite entrega "mañana"

4. **B2B Dashboard** (`/b2b/dashboard/page.tsx`)
   - **Con switch activo**: Muestra contador de tiempo hasta las 5 PM
   - **Con switch desactivado**: Muestra "🛑 Reglas Desactivadas"

## 📊 Comportamiento Detallado

### Cuando las Reglas están ACTIVADAS (true)

```
Hora actual < 5 PM  → Entrega MAÑANA
Hora actual >= 5 PM → Entrega PASADO MAÑANA
```

**Ejemplo**:

- Si haces un pedido a las 4:30 PM → Entrega mañana
- Si haces un pedido a las 5:15 PM → Entrega pasado mañana

### Cuando las Reglas están DESACTIVADAS (false)

```
Cualquier hora → Entrega MAÑANA (siempre)
```

**Ejemplo**:

- Pedido a las 4:30 PM → Entrega mañana
- Pedido a las 5:15 PM → Entrega mañana ✅ (ignora la regla de 5 PM)
- Pedido a las 11:00 PM → Entrega mañana ✅ (ignora la regla de 5 PM)

## 🧪 Casos de Uso

### Caso 1: Pruebas E2E Nocturnas

**Problema**: El equipo QA necesita probar el flujo completo a las 8 PM, pero la regla de 5 PM impide pedidos para el día siguiente.

**Solución**:

1. Ir a `/admin/settings`
2. Desactivar "⏱️ Reglas Hora de Corte (5 PM)"
3. Ejecutar las pruebas E2E
4. Re-activar las reglas al finalizar

### Caso 2: Demo para Cliente

**Problema**: Necesitas mostrar el sistema completo un sábado por la noche, pero las entregas se programan 2 días después.

**Solución**: Desactivar temporalmente las reglas para mostrar entregas "al día siguiente"

### Caso 3: Desarrollo de Nuevas Features

**Problema**: Durante el desarrollo de un nuevo módulo, necesitas probar la lógica de pedidos sin depender de la hora.

**Solución**: Mantener las reglas desactivadas en tu entorno de desarrollo local

## 🔍 Logs y Debugging

Cuando el interruptor está activo, los módulos registran logs en consola:

```javascript
// Reglas ACTIVADAS
⏱️ Cutoff Rules ENABLED: It's 18:00. Min delivery in 2 day(s).

// Reglas DESACTIVADAS
🛑 Cutoff Rules DISABLED: Delivery set for TOMORROW regardless of time.
```

Estos logs aparecen en:

- Consola del navegador (Frontend)
- Inspeccionar elemento > Console (durante navegación)

## ⚠️ Advertencias y Mejores Prácticas

### ⚙️ Producción

- **SIEMPRE** mantener las reglas ACTIVADAS en producción
- El valor por defecto es `true` (activado)
- Si el setting no existe o hay error, el sistema defaultea a activado

### 🧪 Testing

- Desactivar solo durante sesiones de prueba específicas
- **RE-ACTIVAR** inmediatamente después de las pruebas
- Documentar en el reporte de pruebas si se desactivaron las reglas

### 👨‍💻 Desarrollo

- En entornos locales, puedes dejar desactivado permanentemente
- En staging/pre-producción, mantener activado para simular producción

## 🔐 Seguridad y Permisos

Actualmente, cualquier usuario con acceso a `/admin/settings` puede modificar el interruptor.

**Recomendación futura**: Implementar control de roles para restringir modificación solo a:

- Administradores
- DevOps
- QA Leads

## 📝 Historial de Cambios

- **2026-02-11**: Implementación inicial del interruptor
  - Agregado a settings UI
  - Integrado en módulos: Checkout, B2B Dashboard, Procurement, Picking
  - Documentación creada

## 🚀 Próximos Pasos Recomendados

1. **Audit Log**: Registrar en base de datos quién cambia el setting y cuándo
2. **Notificaciones**: Alertar cuando las reglas están desactivadas por más de X horas
3. **Auto-reactivación**: Opción para programar auto-reactivación después de N minutos
4. **Dashboard Widget**: Indicador visual en el dashboard admin si las reglas están desactivadas

---

**Última actualización**: 2026-02-11  
**Mantenido por**: Equipo de Desarrollo Frubana Express
