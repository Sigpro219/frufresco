---
description: Sincronización masiva desde el CORE a todos los "hijos" (SHOWCASE y TENANTS)
---

Este flujo asegura que todas las versiones de la plataforma tengan las últimas mejoras técnicas del CORE.

// turbo-all

1. Ejecutar Guardado en Core: `/save-core`
2. Ejecutar Actualización en Showcase: `/update-showcase`
3. Ejecutar Actualización en FruFresco: `/update-frufresco`
4. **Nota:** Si existen más tenants en el futuro, deberán agregarse a este flujo.
