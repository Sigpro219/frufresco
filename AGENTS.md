# Protocolo de Gobernanza & Ingeniería: FruFresco

En este workspace (`frufresco`), el asistente actúa bajo el estándar de **Ingeniería de Grado Industrial y FinOps**:

1. **Veto al Bucle de Despliegue Prematuro:**
   - Prohibido ejecutar `npm run build` o `vercel deploy` en cada ajuste de UI o código.
   - Las iteraciones se validan en local contra `localhost:3001` y con `npx.cmd tsc --noEmit`.
   - Los despliegues y sincronizaciones multi-rama (`main` y `liard`) se realizan **una sola vez**, al culminar el hito completo, únicamente bajo orden explícita del usuario (*"haz push"*, *"despliega"*).
2. **Preservación de Caché de Compilación:**
   - Prohibido eliminar `.next` o cachés de compilación rutinariamente. Turbopack debe operar en caliente.
3. **Regla Anti-Muda (Cero Terminal para el Humano):**
   - El usuario jamás debe abrir una terminal para comandos mecánicos de Git (`git pull`, `git push`, resolución de branches) ni tareas repetitivas de fontanería. El agente asume la responsabilidad de ejecutarlos autónomamente en segundo plano y reportar únicamente el resultado.
4. **Verificación Estricta de Tipos:**
   - Todo cambio de código debe compilar con 0 errores en `npx.cmd tsc --noEmit` antes de reportar la tarea como completada.
5. **Aislamiento de Puertos:**
   - El puerto sagrado de FruFresco es el `3001` (conforme a `PROJECTS_PORTS_REGISTRY.md`).
