---
description: Sincroniza las mejoras del CORE hacia el TENANT_FRUFRESCO (Producción oficial)
---

Este flujo actualiza la versión oficial de FruFresco con las últimas mejoras del motor.

// turbo-all

1. Asegurar que el CORE esté guardado: `git add .`
2. Commit: `git commit -m "Sync point for TENANT_FRUFRESCO"`
3. Push CORE: `git push origin CORE`
4. Cambiar a la rama de producción: `git checkout tenant-frufresco`
5. Fusionar mejoras: `git merge CORE --no-edit`
6. Resolver conflictos conocidos con versión CORE: `git checkout CORE -- src/app/api/fleet/sync/route.ts src/components/EditProductModal.tsx`
7. Confirmar resolución si hubo conflictos: `git add .; git commit -m "Sync: tenant-frufresco desde CORE"`
8. Publicar cambios: `git push origin tenant-frufresco`
9. Regresar al laboratorio: `git checkout CORE`
