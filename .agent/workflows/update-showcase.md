---
description: Sincroniza las mejoras del CORE hacia el SHOWCASE (Logistics Pro)
---

Este flujo lleva las nuevas funciones a la versión de demostración pública, manteniendo la marca Logistics Pro.
El Showcase usa la rama `white-label`. Vercel también escucha `main`, que se actualiza aquí.

// turbo-all

1. Asegurar que el CORE esté guardado: `git add .`
2. Commit: `git commit -m "Sync point for SHOWCASE"`
3. Push CORE: `git push origin CORE`
4. Cambiar a main (rama de despliegue Vercel): `git checkout main`
5. Fusionar CORE en main: `git merge CORE --no-edit`
6. Resolver conflictos conocidos con versión CORE: `git checkout CORE -- src/app/api/fleet/sync/route.ts src/components/EditProductModal.tsx`
7. Confirmar resolución si hubo conflictos: `git add .; git commit -m "Sync: main desde CORE"`
8. Publicar en Vercel: `git push origin main`
9. Cambiar a la rama de marca blanca: `git checkout white-label`
10. Traer las mejoras del motor: `git merge CORE --no-edit`
11. Resolver conflictos conocidos: `git checkout CORE -- src/app/api/fleet/sync/route.ts src/components/EditProductModal.tsx`
12. Confirmar si hubo conflictos: `git add .; git commit -m "Sync: white-label desde CORE"`
13. Push Showcase: `git push origin white-label`
14. Regresar al laboratorio: `git checkout CORE`
