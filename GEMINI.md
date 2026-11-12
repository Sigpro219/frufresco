# FruFresco - Reglas Operativas del Espacio de Trabajo

## 1. Política de Sincronización Multi-Rama Git
- FruFresco opera de forma estricta y exclusiva bajo una topología de **2 ramas de producción**: `main` (rama de integración) y `liard` (rama de despliegue en Vercel).
- Queda terminantemente prohibido recrear ramas legadas u obsoletas (`CORE`, `core`, `frufresco-liarversel`, `tenant-frufresco`, `tenant1`, `white-label`).
- Todo push remoto bajo orden explícita del usuario debe dirigirse exclusivamente a: `origin main:main` y `origin main:liard`.

## 2. Guardián Matutino de Cosecha (Session Catch-up Guard)
- Al recibir la primera interacción de una nueva jornada o semana (ej. lunes a cualquier hora o tras el fin de semana):
  - Verifica si la auditoría de avances y aprendizajes de la jornada previa o fin de semana está pendiente.
  - Si la última cosecha no ha cubierto el delta reciente, activa al `/agente-cosechador` bajo su ventana dinámica:
    - **Lunes o post-fin de semana:** Últimas 72 horas (desde el viernes 9:00 AM).
    - **Martes a Viernes:** Últimas 24 horas.
  - Genera o actualiza las refacciones en el Arsenal Global (`~/.gemini/config/skills/arsenal/`) aplicando la **Regla de No-Proliferación y Sobrescritura Evolutiva** (degradar a antipatrón la solución anterior y consagrar el nuevo principio).
  - Entrega el reporte matutino ejecutivo al usuario antes o en conjunto con la resolución del requerimiento.

## 3. Estándares Físicos y Comerciales del Catálogo
- **Libra:** Siempre fija a 0.5 kg (500 gr). Jamás permitir factores residuales o divergentes.
- **Kilo / Kg:** Siempre fijo a 1.0 kg (1000 gr).
