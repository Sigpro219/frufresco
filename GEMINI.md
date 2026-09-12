# FruFresco - Reglas Operativas del Espacio de Trabajo

## 1. Política de Sincronización Multi-Rama Git
- Cada cambio confirmado o corregido en el repositorio DEBE ser empujado (`git push`) estrictamente a las 8 ramas activas:
  `main`, `CORE`, `core`, `frufresco-liarversel`, `liard`, `tenant-frufresco`, `tenant1`, `white-label`.

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
