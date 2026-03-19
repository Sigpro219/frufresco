---
description: Sincronización masiva desde el CORE a todos los "hijos" (SHOWCASE y TENANTS)
---

Este flujo asegura que todas las versiones de la plataforma tengan las últimas mejoras técnicas del CORE.
Incluye la rama `main` que es la que Vercel usa para el despliegue automático.

// turbo-all

1. Guardar cambios en CORE: `git add .`
2. Commit: `git commit -m "Sync: auto-save from CORE"`
3. Push CORE: `git push origin CORE`
4. Cambiar a main y fusionar CORE: `git checkout main`
5. Merge: `git merge CORE --no-edit`
6. Push main (dispara deploy en Vercel): `git push origin main`
7. Cambiar a Showcase y fusionar: `git checkout white-label`
8. Merge Showcase: `git merge CORE --no-edit`
9. Resolver conflictos con versión CORE si existen: `git checkout CORE -- src/app/api/fleet/sync/route.ts src/components/EditProductModal.tsx`
10. Commit si hubo conflictos: `git add .; git commit -m "Sync: white-label desde CORE"`
11. Push Showcase: `git push origin white-label`
12. Cambiar a Frufresco y fusionar: `git checkout tenant-frufresco`
13. Merge Frufresco: `git merge CORE --no-edit`
14. Resolver conflictos con versión CORE si existen: `git checkout CORE -- src/app/api/fleet/sync/route.ts src/components/EditProductModal.tsx`
15. Commit si hubo conflictos: `git add .; git commit -m "Sync: tenant-frufresco desde CORE"`
16. Push Frufresco: `git push origin tenant-frufresco`
17. Regresar al CORE: `git checkout CORE`

**Nota:** Si existen más tenants en el futuro, agregar pasos 12-16 con el nombre de su rama.
