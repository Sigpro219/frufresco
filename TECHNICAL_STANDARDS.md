# Estándares Técnicos - Frubana Express

Este documento define las reglas de negocio y estándares técnicos para mantener la integridad del sistema a medida que el inventario crece.

## 1. Arquitectura de Productos

El sistema utiliza una separación de responsabilidades entre la data técnica y la gestión comercial:

- **Maestro SKU**: Definición técnica (Nombre oficial, Categoría, Unidad Base, Código Único). Solo editable desde el Módulo Maestro. Bloqueado para el perfil comercial.
- **Catálogo B2C (Frontend)**: Gestión comercial (Precios de Venta, Imágenes comerciales, Visibilidad). Estos datos pueden divergir del maestro por razones de marketing, pero dependen del SKU para la trazabilidad.

## 2. Estándar de Nomenclatura SKU (Opción Compacta)

Para asegurar rapidez en bodega y legibilidad técnica, se utiliza el estándar **`C-CON-U`**.

### Maestro SKU: `[C]-[CON]-[U]`

- **C** (Categoría): Una letra inicial (`F`=Fruta, `V`=Verdura, `L`=Lácteo, `T`=Tubérculo, `D`=Despensa).
- **CON** (Consonantes): 3 consonantes representativas del nombre del producto.
- **U** (Unidad): Inicial de la unidad de medida base (`K`=Kilo, `L`=Litro, `U`=Unidad, `B`=Bulto).

**Ejemplos:**

- Manzana Roja por Kilo: `F-MNZ-K`
- Cebolla Cabezona por Kilo: `V-CBL-K`
- Leche Entera por Litro: `L-LCH-L`

### SKU Hijo (Variantes): `[MAESTRO].[ATRIBUTOS]`

Se utiliza un **punto** como separador para indicar que el producto hereda del maestro pero tiene atributos específicos.

- Sufijos de Madurez: `.M` (Maduro), `.P` (Pintón), `.V` (Verde).
- Sufijos de Tamaño: `.G` (Grande), `.M` (Mediano), `.P` (Pequeño).
- Sufijos de Calidad: `.1` (Primera), `.2` (Segunda).

**Ejemplos:**

- Tomate Maduro Grande: `V-TMT-K.MG`
- Papa Sabanera de Primera: `T-PPA-K.1`

## 3. Estándar de Descripciones (B2B/B2C)

Para mantener un catálogo profesional y persuasivo, las descripciones generadas siguen el formato:
`[Nombre] + [Calidad] + [Origen/Frescura] + [Uso Sugerido] + [Canal]`.

- **Calidad**: Siempre resaltar "Premium Seleccionado".
- **Uso Sugerido**: Dinámico según categoría (Frutas -> Jugos/Postres, Verduras -> Cocina Gourmet, etc.).
- **Canal**: Mencionar explícitamente "Apto para canal B2B (Horeca) y B2C (Hogares)".

## 5. Gestión de Infraestructura y Despliegue (Sync & SQL)

Para asegurar la consistencia entre el código y las bases de datos de los distintos Tenants (especialmente cuando están en cuentas de Supabase separadas):

- **RLS Obligatorio**: Al agregar nuevas tablas o columnas que requieran escritura desde el frontend, se DEBE adjuntar el script SQL para habilitar las políticas de Row Level Security (RLS) correspondientes.
- **Principio de Doble Validación**: Antes de dar por terminada una tarea en Tenant 1, se debe verificar que el esquema de base de datos coincida con las expectativas del código.
- **Manejo de Errores**: El código debe utilizar las utilidades de diagnóstico (`diagnoseDatabaseError`) para alertar al administrador si una operación falló por falta de permisos en el Tenant.

---

_Documento actualizado al 18 de Marzo, 2026._
