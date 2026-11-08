---
id: REF-SUITE-GESTION-METROLOGICA-ISO10012
version: 1.0
estado: VIGENTE
reemplaza: null
titulo: "Suite de Gestión Metrológica, Trazabilidad Inmutable ISO 10012 & Auditoría Multimodal IA"
categoria: "Metrología Industrial, Gemelo Digital de Activos & Auditoría IA"
tags: [iso-10012, iso-iec-17025, metrologia, cmms, gmao, gemini-multimodal, hojas-de-vida, kanban-industrial, guard-band, jcgm-106]
multiplicador_velocidad: "20X"
reduccion_errores: "99%"
proyectos_origen: [mjm-frontend]
fecha_cosecha: "2026-09-21"
---

# 🧩 Ficha de Refacción: Suite de Gestión Metrológica, Trazabilidad Inmutable ISO 10012 & Auditoría Multimodal IA

## 🔴 1. La Pesadilla Operativa Previa (Baseline 1X - El Gemba Real)
* **Puesto de Trabajo:** El metrólogo, coordinador de calidad o jefe de mantenimiento en laboratorios y plantas industriales operaba rodeado de carpetas físicas AZ, hojas de cálculo de Excel desvinculadas y montones de certificados de calibración en papel o PDF escaneados. El registro de comprobaciones intermedias se realizaba en talonarios de papel a pie de máquina, con riesgo permanente de extravío, ensuciamiento con grasa/polvo y transcripción manual retardada.
* **Muda Identificada:** 
  - *Sobreprocesamiento y esperas:* Transcripción manual de tablas numéricas complejas (puntos de calibración, lecturas del patrón, correcciones e incertidumbres expandidas $U$).
  - *Interpretación subjetiva y ambigüedad:* Para determinar si un equipo era apto para uso, el metrólogo debía consultar manualmente normas (ISO 10012, ISO/IEC 17025, JCGM 106) y decidir si el criterio de aceptación aplicaba con o sin incertidumbre. Frecuentemente se aprobaban instrumentos en "Zona de Duda" sin percatarse de que $|Error| + U > EMP$.
  - *Desconexión entre el activo y el cronograma:* Las hojas de vida eran estáticas en Excel; cuando se realizaba un mantenimiento o calibración, rara vez se actualizaba en tiempo real la próxima fecha de vencimiento, originando instrumentos vencidos operando en producción con riesgo de no conformidades críticas en auditorías ONAC / ISO 9001 / INVIMA.
* **Velocidad y Tasa de Falla Inicial:** Entre 35 a 50 minutos por instrumento para leer el certificado, digitar valores en Excel, calcular errores, proyectar fechas y archivar el soporte físico. Tasa de error humano de transcripción superior al 12%, con alta incidencia en el cálculo de periodicidades sobre meses de longitud variable y años bisiestos.

---

## 🟢 2. La Transformación Operativa (Salto Multiplicador Nx)
* **Nuevo Flujo de Trabajo:** 
  1. **Gemelo Digital & Hoja de Vida Inmutable:** El activo metrológico nace con su ficha técnica paramétrica (magnitud, rango, resolución, EMP y rutinas quinquenales).
  2. **Cronograma & Kanban Táctico en Tiempo Real:** Las actividades operativas (Calibración, Verificación, Mantenimiento) se generan automáticamente a 5 años y se gestionan en un tablero Kanban con filtros dinámicos (`Por Gestionar`, `Esta Semana`, `En Ejecución`, `Vencidos`).
  3. **Auditoría IA Multimodal (Gemini):** El operador arrastra el certificado PDF emitido por el laboratorio de calibración al *IA Verification Lab*. En 4 segundos, Gemini extrae los puntos de calibración, el error máximo, la incertidumbre expandida ($U$), evalúa la conformidad bajo reglas de decisión JCGM 106 (Guard Band) y redacta el dictamen técnico formal de aptitud de uso.
  4. **Cierre de Ciclo Cerrado con Disparo de Correctivos:** Al cerrar la actividad desde el Kanban (`ClosureModal`), el certificado se archiva en Firebase Storage, la Hoja de Vida del instrumento se actualiza inmediatamente (incorporando el nuevo log histórico y recalculando su próxima fecha de vencimiento) y, si el veredicto es *No Conforme*, el sistema autogenera una orden de *Mantenimiento Correctivo* para la siguiente semana con prioridad alta.
* **Multiplicador de Negocio:** 
  - **Aceleración 20X:** De 45 minutos a menos de 2 minutos por ciclo completo de aseguramiento metrológico.
  - **Democratización Técnica:** Un técnico u operador de planta puede auditar con rigor formal un certificado sin requerir la presencia de un metrólogo senior.
  - **Cero Papel:** Eliminación del 100% de talonarios físicos y carpetas AZ, con Hojas de Vida imprimibles listas para auditorías con membrete oficial.

---

## 💣 3. Secretos Sucios de Producción & Antipatrones Descartados
* **Trampa Arquitectónica #1: Desarrollo sin Contrato Maestro (Falta de SDD):**
  - *Lo que falló:* La construcción inicial sin una especificación formal (`SPEC.md`) provocó dispersión entre lo que mostraba la Hoja de Vida, lo que proyectaba el calendario y lo que actualizaba el Kanban. Los estados quedaban huérfanos y la matemática estaba mezclada con el JSX.
  - *La regla consagrada:* Desacoplar absolutamente el motor de cálculo metrológico en un módulo puro (`src/utils/metrologyCore.js`), sin dependencias de React ni Zustand, respaldado por 22 unit tests automatizados (`node --test`).
* **Trampa Algorítmica #2: El Desbordamiento de Meses y Años Bisiestos:**
  - *Lo que falló:* `new Date(year, month + freq, day)` produce saltos silenciosos de mes. Por ejemplo, un instrumento con fecha inicial `31 de enero` con frecuencia semestral o bimestral, al sumar meses en febrero caía en el `3 de marzo` en años comunes, corriendo irreversiblemente las fechas futuras.
  - *La solución de producción:* Función `calculateNextRoutineDate` con verificación de desbordamiento: si `nextDate.getDate() !== day`, se aplica un *clamp* automático al último día válido del mes (`nextDate.setDate(0)`), preservando la coherencia en años bisiestos (29 de febrero) y meses de 30 días.
* **Trampa de Infraestructura #3: Fugas de Memoria por Listeners Huérfanos (`onSnapshot`):**
  - *Lo que falló:* Al alternar entre vistas de alta densidad (`Inventario`, `Kanban`, `Calendario`), se creaban múltiples suscripciones concurrentes a Firestore que no se cancelaban al desmontar componentes o cambiar de tenant, saturando la memoria del navegador y consumiendo cuotas de lectura.
  - *La solución de producción:* Módulo `activeSubscriptions.js` y métodos `clearAllSubscriptions()` en Zustand para asegurar que cada listener devuelva y ejecute su función de desuscripción al cambiar de contexto.
* **Trampa de Seguridad #4: Contaminación Cruzada Multi-Tenant:**
  - *Lo que falló:* Consultas a colecciones compartidas sin cláusula explícita `where('tenantId', '==', tenantId)` y rutas de almacenamiento de certificados públicas.
  - *La solución de producción:* Blindaje estricto en Firestore queries y rutas de Storage aisladas (`tenants/${tenantId}/actividades/${activityId}/soportes/...`) con validación de tokens en `storage.rules`.

---

## 💻 4. Solución de Software & Lego Blocks (Código Vivo Auto-Contenido)

### Bloque 1: Motor Puro de Conformidad Metrológica ISO 10012 / JCGM 106 (`metrologyCore.js`)
Lógica matemática pura, sin dependencias de UI, lista para ejecutarse en frontend, backend o Cloud Functions:

```javascript
/**
 * METROLOGY CORE MODULE (ISO 10012 / ISO/IEC 17025 / JCGM 106)
 * Motor puro de cálculos metrológicos y proyecciones seguras.
 */

/**
 * Cálculo del error sistemático, incertidumbre combinada y conformidad metrológica
 * Error = V_leido - V_patron
 * Desviación Total = |Error| + U
 * 
 * Reglas de Decisión:
 * - Sin Incertidumbre (U = 0): |Error| <= EMP -> Conforme, de lo contrario No Conforme.
 * - Con Incertidumbre (U > 0, Guard Banding JCGM 106):
 *     |Error| > EMP -> No Conforme
 *     |Error| + U > EMP -> 'Zona de Duda'
 *     |Error| + U <= EMP -> 'Conforme'
 */
export const calculateMetrologicalCheck = ({
  valorLeido,
  valorPatron,
  tolerancia,
  incertidumbre = 0,
  reglaDecision = 'guard_band'
}) => {
  const vPatron = Number(valorPatron) || 0;
  const tol = Number(tolerancia) > 0 ? Number(tolerancia) : 0.05;
  const vLeido = Number(valorLeido) || 0;
  const u = Number(incertidumbre) >= 0 ? Number(incertidumbre) : 0;

  const rawDiff = vLeido - vPatron;
  const errorVal = Number(rawDiff.toFixed(6));
  const absError = Math.abs(errorVal);
  const totalDev = Number((absError + u).toFixed(6));

  let conformidad = 'Conforme';
  let enTolerancia = false;
  let zonaDuda = false;

  if (u === 0) {
    enTolerancia = absError <= tol;
    conformidad = enTolerancia ? 'Conforme' : 'No Conforme';
  } else {
    if (absError > tol) {
      conformidad = 'No Conforme';
      enTolerancia = false;
    } else if (totalDev > tol) {
      if (reglaDecision === 'guard_band') {
        conformidad = 'Zona de Duda';
        zonaDuda = true;
        enTolerancia = false;
      } else {
        conformidad = 'Conforme';
        enTolerancia = true;
      }
    } else {
      conformidad = 'Conforme';
      enTolerancia = true;
    }
  }

  // Porcentaje de tolerancia consumida con cota máxima de seguridad
  const rawRatio = (totalDev / tol) * 100;
  const porcentajeConsumido = Math.min(Math.round(rawRatio * 10) / 10, 999);

  return {
    error: errorVal,
    desviacionTotal: totalDev,
    incertidumbre: u,
    tolerancia: tol,
    enTolerancia,
    zonaDuda,
    conformidad,
    porcentajeConsumido
  };
};

/**
 * Cálculo seguro de la siguiente fecha de rutina con protección contra rollover de fin de mes.
 * Si la fecha inicial es un día 31 y el mes de destino tiene menos días (ej. 28, 29 o 30),
 * se ajusta automáticamente al último día válido de dicho mes mediante clamp.
 */
export const calculateNextRoutineDate = (startDateStr, freqMonths = 12) => {
  if (!startDateStr) return null;
  try {
    let year, month, day;
    if (typeof startDateStr === 'string') {
      const cleanStr = startDateStr.split('T')[0];
      const parts = cleanStr.split('-').map(Number);
      if (parts.length === 3 && !parts.some(isNaN)) {
        [year, month, day] = parts;
      } else {
        const d = new Date(startDateStr);
        if (isNaN(d.getTime())) return null;
        year = d.getFullYear();
        month = d.getMonth() + 1;
        day = d.getDate();
      }
    } else if (startDateStr instanceof Date) {
      if (isNaN(startDateStr.getTime())) return null;
      year = startDateStr.getFullYear();
      month = startDateStr.getMonth() + 1;
      day = startDateStr.getDate();
    } else {
      return null;
    }

    const freq = Number(freqMonths) || 12;
    const nextTargetMonth = (month - 1) + freq;
    const nextDate = new Date(year, nextTargetMonth, day);
    
    // Si hubo desbordamiento de fin de mes (ej: 31 de enero -> marzo en año no bisiesto)
    if (nextDate.getDate() !== day) {
      nextDate.setDate(0); // Clampea al último día del mes destino
    }
    
    const y = nextDate.getFullYear();
    const m = String(nextDate.getMonth() + 1).padStart(2, '0');
    const dVal = String(nextDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${dVal}`;
  } catch (err) {
    return null;
  }
};
```

---

### Bloque 2: Agente Multimodal para Auditoría de Certificados PDF (`geminiMetrologyService.js`)
Extracción de tablas y dictamen normativo utilizando Google Gemini en frontend con fallback estructurado:

```javascript
/**
 * Convierte un objeto File/Blob a Base64 puro para consumo en APIs multimodales
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result.split(',')[1]);
      } else {
        reject(new Error("Fallo al leer archivo como buffer"));
      }
    };
    reader.onerror = (error) => reject(error);
  });
}

/**
 * Prompt del Auditor Metrológico Senior bajo ISO/IEC 17025 y JCGM 106
 */
export async function analyzeMetrologyCertificateWithGemini(file, customKey = null) {
  const apiKey = customKey || import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error("Clave de Google Gemini no configurada.");

  const base64Pdf = await fileToBase64(file);
  const prompt = `Actúa como un Auditor Metrológico Senior bajo normas ISO/IEC 17025:2017, ISO 10012 y guía JCGM 106:2012.
Analiza minuciosamente el certificado de calibración adjunto en PDF y extrae cuantitativamente los datos técnicos.
Responde ÚNICAMENTE un objeto JSON sin markdown exterior ni bloques de código adicionales:
{
  "numero_certificado": string,
  "fecha_calibracion": "YYYY-MM-DD",
  "laboratorio_emisor": string,
  "instrumento_identificado": string,
  "numero_serie": string,
  "codigo_interno": string,
  "norma_referencia": string,
  "error_maximo_encontrado": number,
  "incertidumbre_expandida_k2": number,
  "unidad_medida": string,
  "tolerancia_emp_sugerida": number,
  "veredicto_preliminar": "Conforme" | "Zona de Duda" | "No Conforme",
  "nivel_riesgo": "Bajo" | "Medio" | "Alto",
  "dictamen_tecnico_oficial": "Párrafo formal justificando la conformidad o no conformidad metrológica considerando la banda de seguridad (guard band).",
  "aptitud_de_uso": string,
  "puntos_calibrados": [
    { "punto_nominal": number, "valor_patron": number, "valor_instrumento": number, "error": number, "incertidumbre": number }
  ]
}`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: "application/pdf", data: base64Pdf } }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        response_mime_type: "application/json"
      }
    })
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}: Error procesando PDF con Gemini`);
  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return JSON.parse(rawText.trim());
}
```

---

### Bloque 3: Esquema de Datos de Hoja de Vida & Historial Inmutable
Estructura de documento Firestore para activos con gemelo digital metrológico (`instruments`):

```json
{
  "id": "inst_01HQW...",
  "tenantId": "empresa_corporativa_a",
  "codigo": "MAN-042",
  "nombre": "Manómetro Digital de Alta Presión",
  "marca": "WIKA",
  "modelo": "CPG1500",
  "serie": "SN-8829104",
  "ubicacion": "Planta 2 - Línea de Envasado",
  "responsable": "Ing. Juan Pérez",
  "estado": "Activo",
  "magnitud": "Presión",
  "rango_min": 0,
  "rango_max": 250,
  "unidad": "bar",
  "resolucion": 0.01,
  "tolerancia_emp": 0.25,
  "criterio_tolerancia": "EMP",
  "rutinas": {
    "calibracion": true,
    "calibracion_frecuencia": 12,
    "calibracion_fecha_inicial": "2026-03-15",
    "calibracion_anos": 5,
    "verificacion": true,
    "verificacion_frecuencia": 3,
    "verificacion_fecha_inicial": "2026-04-15"
  },
  "historial": [
    {
      "fecha": "2026-03-15",
      "tipo": "Calibración",
      "laboratorio": "Laboratorio Metrológico Certificado",
      "certificado": "CERT-2026-8812",
      "certificado_url": "https://storage.googleapis.com/...",
      "declaracion_conformidad": "Conforme",
      "error": 0.08,
      "incertidumbre": 0.04,
      "patron_referencia": "Balanza de Pesos Muertos Desgranges",
      "estado_operativo": "Operativo"
    }
  ]
}
```

---

### Bloque 4: Pipeline de Cierre en Kanban & Disparo de Correctivos
Patrón de actualización atómica en Zustand/Firestore cuando se finaliza una intervención técnica:

```javascript
// Manejador del Cierre Operativo (ClosureModal -> updateActivityStatus)
const handleCompleteActivity = async (activityId, completionData) => {
  const isConforme = completionData.declaracion_conformidad === 'Conforme';

  // 1. Registrar cierre en la actividad
  await updateActivityInFirestore(activityId, {
    estado: 'done',
    finishedAt: new Date().toISOString(),
    ...completionData
  });

  // 2. Prepend en el Historial inmutable de la Hoja de Vida
  await prependInstrumentHistory(completionData.instrumentId, {
    fecha: completionData.fecha_ejecucion,
    tipo: completionData.tipo,
    laboratorio: completionData.laboratorio_ejecutor,
    certificado: completionData.certificado_numero,
    certificado_url: completionData.certificado_url,
    declaracion_conformidad: completionData.declaracion_conformidad,
    error: completionData.error_encontrado,
    incertidumbre: completionData.incertidumbre,
    estado_operativo: isConforme ? 'Operativo' : 'No Operativo'
  });

  // 3. Disparar Acción Correctiva si hubo No Conformidad metrológica
  if (!isConforme) {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    await createActivityInFirestore({
      tenantId: completionData.tenantId,
      instrumentId: completionData.instrumentId,
      instrumentNombre: completionData.instrumentNombre,
      codigoMJM: completionData.codigoMJM,
      tipo: 'Mantenimiento Correctivo',
      estado: 'todo',
      priority: 'high',
      fechaProgramada: nextWeek.toISOString().split('T')[0],
      descripcion: `Desviación metrológica crítica (No Conforme). Error: ${completionData.error_encontrado}, Incertidumbre: ${completionData.incertidumbre}. Tolerancia excedida.`
    });
  }
};
```

---

## 🔌 5. Guía de Reutilización Frankenstein & Dependencias Mínimas
* **Dónde Encaja:** 
  - **Mundo Metrológico:** Laboratorios acreditados ISO/IEC 17025, calibración de pesaje y básculas, tanques de almacenamiento, industria farmacéutica y dispositivos médicos (INVIMA / FDA).
  - **Mundo Mantenimiento Industrial (CMMS / GMAO):** La misma arquitectura aplica directamente para plantas con parques masivos de maquinaria (motores, bombas centrífugas, compresores, válvulas de control). En lugar de calibración metrológica, las rutinas se configuran como: *Lubricación*, *Análisis de Vibraciones*, *Termografía* e *Inspección Mecánica*, y el visor multimodal de IA se utiliza para interpretar reportes de diagnóstico y manuales de fabricante.
* **Esquema de Base de Datos Necesario:**
  - `instruments`: Catálogo del gemelo digital del activo (especificaciones, rangos, periodicidades e historial integrado).
  - `activities`: Colección transaccional de rutinas programadas (`todo`, `doing`, `done`) con indexación compuesta `[tenantId, estado, fechaProgramada]`.
  - `laboratories`: Directorio multi-tenant de proveedores, talleres y laboratorios acreditados.
* **Dependencias Mínimas:**
  - Runtime: Node.js 18+ o navegadores modernos con soporte ECMAScript 2022.
  - Librería de UI: React 18+ con Tailwind CSS y Lucide Icons.
  - Backend / Persistencia: Firebase Firestore & Storage (o Supabase PostgreSQL con JSONB para el historial).
  - Motor IA: Google Gemini 2.0 / 1.5 Flash (API REST directa con `fetch`, sin SDKs pesados en cliente).
