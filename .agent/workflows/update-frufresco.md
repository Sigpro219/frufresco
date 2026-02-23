---
description: Sincroniza las mejoras del CORE hacia el TENANT_FRUFRESCO (Producción oficial)
---

Este flujo actualiza la versión oficial de FruFresco con las últimas mejoras del motor.

// turbo-all

1. Asegurar que el CORE esté guardado: `git add .` y `git commit -m "Sync point for TENANT_FRUFRESCO"`
2. Cambiar a la rama de producción: `git checkout tenant-frufresco`
3. Fusionar mejoras: `git merge core`
4. Publicar cambios: `git push origin tenant-frufresco`
5. Regresar al laboratorio: `git checkout core`
