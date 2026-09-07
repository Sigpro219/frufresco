---
description: Guardrail estricto para directiva 'use client', compilación Turbopack y prevención de despliegues congelados en Vercel.
globs: src/**/*.tsx, src/**/*.ts
---

# Regla: Invariante Estricto de 'use client' y Verificación de Build (Next.js / Vercel)

Al crear o editar cualquier archivo en el proyecto Next.js:

1. **Ubicación Obligatoria de 'use client':**
   - Si un archivo es un Client Component, la directiva `'use client';` DEBE colocarse en la **LÍNEA 1 ABSOLUTA**, antes de cualquier sentencia `import`, comentario o expresión.
   - NUNCA colocar imports antes de `'use client';` (Turbopack falla la compilación de producción con error fatal).

2. **Auditoría de Build Previa a Concluir Tareas de Despliegue:**
   - Antes de dar por finalizada una tarea que implique cambios estructurales o después de corregir errores de build, ejecutar `npm run build` para validar que `next build` genere 91/91 páginas con código de salida 0.

3. **Diagnóstico de Despliegues en Vercel:**
   - Si la URL pública (`frufresco-liard.vercel.app`) muestra una versión antigua en la pastilla del Navbar (`process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`), la causa raíz es un fallo en `next build` en el pipeline de CI/CD de Vercel. La solución inmediata es correr `npm run build` localmente para aislar el error de sintaxis que bloquea el despliegue.
