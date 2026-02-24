---
description: Sincroniza las mejoras del CORE hacia el SHOWCASE (Logistics Pro)
---

Este flujo lleva las nuevas funciones a la versión de demostración pública, manteniendo la marca Logistics Pro.

// turbo-all

1. Asegurar que el CORE esté guardado: `git add .` y `git commit -m "Sync point for SHOWCASE"`
2. Cambiar a la rama de marca blanca: `git checkout main`
3. Traer las mejoras del motor: `git merge core`
4. **Verificación de Branding:** El branding ahora es automático. Asegúrate de que las variables `NEXT_PUBLIC_APP_NAME`, etc., estén configuradas en Vercel para este proyecto.
5. Publicar en Vercel: `git push origin main`
6. Regresar al laboratorio: `git checkout core`
