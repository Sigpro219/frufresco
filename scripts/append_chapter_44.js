const fs = require("fs");
const path = require("path");

const specPath = path.resolve(__dirname, "../SPEC.md");
let content = fs.readFileSync(specPath, "utf8");

const chapter44 = `
---

## 44. Protocolo Canónico de Apagado del ERP Legado & Radar de Foco Láser (Cutover Runbook & Rhythm Keeper)

> **Misión Estratégica Suprema:** Sustituir al 100% el ERP anterior de FruFresco mediante el sistema operativo onFRU (SCOS), garantizando paridad funcional absoluta en los 7 dominios clave hasta lograr el **Switch-Off definitivo** (apagado total de licencias y servidores del sistema legado).

---

### 44.1 🎯 El Radar de Foco Láser (Active Focus Beam & Chamber)

Para erradicar la dispersión, la pérdida de contexto entre sesiones y la apertura de frentes paralelos desordenados, el sistema y los agentes operan bajo un **Radar de Foco Activo**:

\`\`\`
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 RADAR DE FOCO LÁSER ACTIVO                                    │
├──────────────────────┬────────────────────────────────────────────────────────────────────────┤
│ OBJETIVO ESTRATÉGICO │ Apagado Definitivo del ERP Legado (Legacy Cutover).                   │
│ DOMINIO EN LA MIRA   │ Dominio 5 (WMS Bodega) & Dominio 3 (Alistamiento & Inventarios).      │
│ EXPEDIENTE GEMBA     │ "Feedback_sabana_alistamiento.docx" (Resolución quirúrgica 1 a 1).    │
│ FOCO LÁSER ACTUAL    │ Hallazgo 5: Gobernanza Dual de Inventario (Modo Transición vs Estricto)│
├──────────────────────┼────────────────────────────────────────────────────────────────────────┤
│ EN LA CÁMARA (NEXT)  │ • Hallazgo 6: Visibilidad de características en Batavia ([P19]).       │
│                      │ • Hallazgo 7: Restricción estricta de catálogo a productos del acuerdo.│
│                      │ • Hallazgo 8: Impresión de características fijas en moras/empaque.     │
│ COLA POST-DOCUMENTO  │ • Switch-Off Gate: Activación de Modo Estricto de Inventarios.         │
└──────────────────────┴────────────────────────────────────────────────────────────────────────┘
\`\`\`

---

### 44.2 🛡️ Protocolo Anti-Pérdida de Ritmo (Anti-Drift Guardrails)

1. **Flujo de Pieza Única Innegociable (Single-Piece Flow):**
   - Se toma estrictamente **un hallazgo del Gemba a la vez**.
   - Queda terminantemente prohibido abrir un nuevo frente o editar código de otros problemas hasta que el hallazgo activo cuente con:
     1. Diagnóstico forense en base de datos/código.
     2. Decisión explícita del usuario.
     3. Código editado quirúrgicamente sin emojis (Ley Marcial #8).
     4. Verificación mecánica determinística (\`tsc --noEmit\` y pruebas unitarias en EXIT 0).
     5. Ratificación en \`SPEC.md\` con escenario BDD formal.
     6. Sincronización multi-rama (\`git push origin main\` y \`git push origin main:liard\`).
2. **Cámara Fría para Ideas Secundarias (No Scope Creep):**
   - Cualquier sugerencia de mejora estética, refactorización periférica o microservicio que no sea indispensable para apagar el ERP legado se archiva en la *Cámara Fría Post-Switch-Off*, protegiendo la velocidad de crucero del equipo.
3. **Conciencia de Estado Inmediata:**
   - Ante cualquier interrupción o reinicio de contexto, el sistema consulta esta sección para reanudar de inmediato el objetivo en la mira sin titubeos ni rodeos explicativos.

---

### 44.3 📋 Matriz de Paridad y Checklist de Desconexión del ERP por Dominios

| Dominio Operativo | Reemplaza del ERP Viejo | Estado Paridad | Criterio de Apagado (Switch-Off Gate) |
| :--- | :--- | :---: | :--- |
| **1. Comercial & Pedidos** | Toma de pedidos manual y digitación ciega | 🟢 **95%** | [x] 100% pedidos ingresan por Checkout B2B, landing o admin con modelos corporativos y descuentos automatizados. |
| **2. Bodega & Alistamiento (WMS)** | Planillas planas desordenadas | 🟢 **92%** | [x] Sábana con bahías secuenciales 1..150, zebra striping, supresión de 'Maduro' y gramajes reales. |
| **3. Abastecimiento (JIT)** | Cálculo manual de compras | 🟢 **88%** | [ ] Planilla de compras neteada contra inventario en marcha blanca fluida. |
| **4. Inventarios (Masa)** | Kardex tradicional en diferido | 🟡 **En Pilotaje** | [ ] Operación dual en Modo Transición $\\rightarrow$ Listo para candado obligatorio diario en Modo Estricto. |
| **5. Facturación & Cartera** | Facturación externa desincronizada | 🟢 **90%** | [x] Prefijo FV DIAN, Dock de Comprobantes, notas crédito por PQR y cruce de deducciones de nómina. |
| **6. Calidad & SAC (PQRs)** | Quejas informales en chats de WhatsApp | 🟢 **100%** | [x] Consola centralizada con temporizador SLA 2h, reposiciones D+1 trazables y actas RNC. |
| **7. Finanzas & Estrategia** | Reportes estáticos a mes vencido | 🟢 **95%** | [x] Torre de Control con matriz de rentabilidad Top 20, histogramas de garantías y mix multicanal. |

---

### Escenario 325: Gobernanza Dual de Inventario para Marcha Blanca y Switch-Off Imperativo (Gemba Feedback Sábana: Hallazgo 5) (SDD v1.9.306)
- **Given** el ecosistema de operaciones agro-logísticas de FruFresco donde coexiste temporalmente el ERP legado con el nuevo sistema onFRU, y donde durante la fase de pilotaje el equipo monta archivos de balance de masa de prueba que pueden tener desfases de fechas o SKUs no contados físicamente,
- **When** se imprime la Sábana de Alistamiento (\`/admin/orders/alistamiento-print\`) o la Planilla de Compras (\`/admin/procurement/purchases-print\`) al momento del corte operativo (5:00 PM - 8:00 PM):
- **Then** el sistema obedece la directriz de gobernanza parametrizada en \`app_settings\` (\`inventory_governance_mode\`):
  1. **Modo Transición / Pilotaje Suave (\`transicion_pilotaje\` — Activo en Pruebas):**
     - **Lookback Flexible de Cierre:** Si para la fecha operativa consultada (\`selectedDate\`) no existe un cierre cerrado en \`daily_inventory_closings\` previo a la hora de corte, el sistema hereda el **último balance disponible en la base de datos** (\`order by closing_date desc limit 1\`), evitando que la hoja arroje \`INV[0]\` por desfase horario.
     - **Respaldo de Stock Teórico:** Si en el archivo de prueba un SKU tiene \`physicalCount = null\` pero registra stock disponible en \`calculatedStock\` o en \`inventory_stocks\`, el sistema rescata ese saldo para permitir que la cuadrilla de alistamiento y compras evalúe cifras lógicas de planta.
     - **Telemetría Transparente:** La columna imprime el inventario de referencia con la etiqueta canónica (ej. \`INV[277]\`), permitiendo a la operación verificar el flujo sin interrupciones.
  2. **Modo Régimen Estricto / Switch-Off (\`estricto_produccion\` — Día del Go-Live Definitivo):**
     - **Cierre Diario Obligatorio:** Se activa el candado formal que exige que el turno tarde registre el balance físico del día antes de emitir la sábana.
     - **Inmutabilidad de Báscula:** Solo se reconoce como saldo inicial el conteo físico verificado (\`bodegaPost10am ?? physicalCount ?? 0\`). Lo que no fue contado en suelo se clasifica estrictamente como inventario cero (\`INV[0]\`).
     - **Alerta de Bloqueo de Alistamiento:** Si se intenta generar la sábana sin el cierre formal de la jornada, la mesa de operaciones bloquea la emisión con advertencia perentoria de gobernanza.
`;

if (!content.includes("## 44. Protocolo Canónico de Apagado")) {
  content += chapter44;
  fs.writeFileSync(specPath, content, "utf8");
  console.log("Capítulo 44 y Escenario 325 agregados con éxito a SPEC.md");
} else {
  console.log("Capítulo 44 ya presente en SPEC.md");
}
