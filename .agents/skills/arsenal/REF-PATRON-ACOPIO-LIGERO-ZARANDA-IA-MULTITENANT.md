---
id: REF-PATRON-ACOPIO-LIGERO-ZARANDA-IA-MULTITENANT
version: 2.0
estado: VIGENTE
reemplaza: "v1.0 - Volqueta Corta (limit=100) y Filtrado Prematuro en Lectura de API"
titulo: "El Pulpo en la Oficina de Correos: Captura Bruta Masiva de Big Data desde API Externa a RAM, Cribado Lento/Determinista en Casa y Persistencia Exclusiva de Casilleros Limpios con Auto-Evicción"
categoria: "Arquitectura de Ingesta Big Data & Cribado Inteligente In-Memory"
tags: [big-data-api, pulpo-oficina-correos, captura-bruta-bloque, cribado-in-memory, zero-trash-db, auto-eviccion, multi-tenant, secop-ii, soda-api, word-boundary-regex]
multiplicador_velocidad: "De 0% Lecturas Correctas -> 100% Fidelidad del Universo Abierto"
reduccion_errores: "100% (Cero Amputación por Ventana Corta, Cero Timeouts por Filtros en API)"
proyectos_origen: [secop_centinela, delta_coretech]
fecha_cosecha: "2026-10-13"
---

# 🧩 Ficha de Refacción: El Pulpo en la Oficina de Correos (Captura Bruta Big Data + Cribado en Casa)

## 🔴 1. La Pesadilla Operativa Previa (Baseline 0X — Tratar de Pasar un Camello por el Ojo de una Aguja)
* **El Error de Raíz en el Diseño:** Tratar de ganarle al reloj colocando el filtro de negocio **adentro de la lectura de la API externa** (consultas complejas con decenas de `LIKE '%...%'`, `OR` anidados y códigos específicos en la URL) o combinándolo con **ventanas de captura diminutas (`$limit=100` o `150`)**.
* **Muda Identificada (Lecturas Incorrectas e Incompletas):**
  1. **El Camello por el Ojo de la Aguja:** Pedirle al servidor de un tercero (Socrata/SODA, ERP externo, API gubernamental o de Big Data) que ejecute nuestro filtrado fino durante el `GET` de lectura estrangula el endpoint remoto, dispara errores HTTP 400 por longitud de URL o aborta la conexión por timeout (`>8-15s`).
  2. **La Amputación por Ventanas Pequeñas (`limit=100`):** Cuando para evitar el timeout se recurrió a traer una muestra pequeña (`limit=100` o `150` registros recientes), el sistema amputó el **94% del universo activo** antes siquiera de que nuestro motor de cribado pudiera verlo.
  3. **Resultado Real antes de la v2.0:** **Ninguna de las lecturas anteriores era correcta.** Los tests pasaban en verde pero las capturas reales estaban tuertas (aparecían solo 2 registros de un universo real de 12 oportunidades activas porque los otros 10 estaban más atrás en la cola o tenían `codigo_principal_de_categoria = "UNSPECIFIED"`).

---

## 🟢 2. La Transformación Operativa (De Lecturas Fallidas a Fidelidad Total del Universo)
* **El Axioma del Product Owner («El Pulpo en la Oficina de Correos»):**
  > *"No intentes filtrar mientras lees la API ni corras contra el reloj con ventanas diminutas. Trae toda la masa de datos junta en un solo bloque bruto a tu propia memoria RAM; una vez que la información ya está en tu poder, tienes todo el tiempo del mundo para separar el trigo de la paja con calma, repartir cada carta al casillero de su destinatario y guardar en base de datos únicamente lo que sirve."*

* **Las 4 Leyes Físicas de la Arquitectura v2.0:**
  1. **Captura Bruta en Bloque Amplio (El Saco Central en RAM):**
     Una sola petición HTTP con una ventana amplia (`$limit=5000`) que descarga el **100% del universo abierto** (`~2.226` registros = `~1.5 MB` en RAM en `~3.7 segundos`). El único filtro en la API es el corte físico indexado del universo vivo (ej. `fecha_de_recepcion_de >= 'hoy'` y `estado = 'Publicado'`).
  2. **Clasificación Sin Prisa en Nuestro Poder (El Pulpo In-Memory):**
     Con el bloque completo ya alojado en la RAM de Node.js (`1.5 MB` es insignificante para cualquier servidor moderno), el clasificador recorre los `2.226` registros en `<40 ms` sin presión de red y reparte cada ítem en los casilleros de cada destinatario (`K-Air`, `Ingyemel`, `Tenant N`).
  3. **Base de Datos Zero-Trash (Solo Entra el Trigo Clasificado):**
     Jamás se vuelcan los `2.226` registros crudos a la base de datos. Solo se persisten los casilleros ya cribados y ordenados de mayor a menor valor (`TIER_1_DIRECT` $\rightarrow$ `TIER_2_ALLIANCE`).
  4. **Evicción y Purga Automática de Rechazados y Vencidos:**
     La base de datos se mantiene limpia expulsando hacia afuera lo que deja de servir:
     - Si la fecha de cierre vence (`isProcessExpired(closingDate)`), el proceso es expulsado del casillero.
     - Si un analista rechaza/descarta un registro (`stage === "DISCARDED"`), es expulsado inmediatamente del casillero y su ID queda en lista negra para no re-ingresar en futuros barridos del Pulpo.

---

## 💣 3. Secretos Sucios de Producción & Antipatrones Descartados

* ❌ **Antipatrón 1 (Meter un Camello por el Ojo de una Aguja — Filtrar en el `GET` de la API):**
  Nunca armes cláusulas `WHERE` con decenas de palabras clave o reglas de negocio dentro de la petición a una API de Big Data. La API externa solo sirve para **entregar el bloque bruto**. El filtrado inteligente siempre se hace en casa.
* ❌ **Antipatrón 2 (Degradado de v1.0 — Ventanas de Captura Microscópicas `limit=100`):**
  En fuentes de Big Data donde entran cientos de registros por hora, capturar solo `limit=100` impide hacer un buen cribado porque el clasificador jamás llega a ver el 90% del universo vigente. La ventana de captura debe cubrir el universo activo completo (`limit=5000`).
* 💣 **Secreto Sucio #1 — El 97.75% de las Filas Vienen con Categoría `"UNSPECIFIED"`:**
  En auditoría real sobre los `2.226` procesos competitivos abiertos en `datos.gov.co`, **2.176 (`97.75%`)** tenían `codigo_principal_de_categoria = "UNSPECIFIED"`. Si hubiéramos filtrado por código UNSPSC en la API, habríamos perdido casi todo el mercado. Al traer todo el bloque a RAM, la **Criba 2 (Sabueso Semántico)** rescata procesos millonarios leyendo el objeto y la entidad aunque el código venga vacío.
* 💣 **Secreto Sucio #2 — Colisión de Siglas Cortas con Topónimos (`Guaviare` $\rightarrow$ `uav`, `gaviones` $\rightarrow$ `avion`, `carpas` $\rightarrow$ `rpas`):**
  Al cribar miles de registros en RAM, usar `.includes("uav")` o `.includes("avion")` contamina el casillero con obras civiles en el departamento del **Guaviare** (`g-uav-iare`), muros de **gaviones** (`g-avion-es`) o alquiler de **carpas** (`ca-rpas`). Toda sigla o raíz corta exige expresiones regulares con frontera de palabra (`\b(uav|rpas|mro|dji)\b`, `\b(avión|avion)(es)?\b`).
* 💣 **Secreto Sucio #3 — Falsa Alerta por Truncamiento de Placeholders (`"Familia UNSPEC00"`):**
  Las APIs públicas devuelven literales basura como `"UNSPECIFIED"`, `"No Definido"` o `"N/A"`. Si un motor de reglas trunca los primeros 6 caracteres (`code.slice(0, 6) + "00"`), fabrica códigos falsos como `"UNSPEC00"`. Todo normalizador debe devolver `""` ante cualquier valor que no cumpla `/^\d{6,8}$/`.

---

## 💻 4. Solución de Software & Lego Blocks (Código Vivo Auto-Contenido)

### A. Captura Bruta en Bloque Amplio del Universo Abierto (`limit=5000` a RAM)
```typescript
// src/services/secopApi.ts
export interface RawSodaActiveProcessRecord {
  id_del_proceso: string;
  referencia_del_proceso?: string;
  nombre_del_procedimiento?: string;
  descripci_n_del_procedimiento?: string;
  entidad?: string;
  precio_base?: string | number;
  fecha_de_publicacion_del?: string;
  fecha_de_recepcion_de?: string;
  modalidad_de_contratacion?: string;
  codigo_principal_de_categoria?: string;
  estado_del_procedimiento?: string;
  urlproceso?: { url: string };
}

const SODA_ACTIVE_ENDPOINT = "https://www.datos.gov.co/resource/p6dx-8zbt.json";

/**
 * Normalizador blindado contra placeholders basura de SODA ("UNSPECIFIED", "No Definido")
 */
export function normalizeUnspsc(code: string): string {
  if (!code) return "";
  const trimmed = code.trim();
  if (/^(no\s*definido|unspecified|undefined|null|n\/a|sin\s*codigo)$/i.test(trimmed)) {
    return "";
  }
  const digits = trimmed.replace(/^V1\./i, "").replace(/[^0-9]/g, "");
  return digits.length >= 4 ? digits : "";
}

/**
 * Descarga en una sola petición SoQL ($limit=5000) el 100% del universo competitivo vigente
 * (~2.226 registros, ~1.5 MB en RAM) sin estrangular la API con filtros semánticos.
 */
export async function fetchOpenCompetitiveUniverseSoda(
  limit: number = 5000,
  options?: { forceRefresh?: boolean; signal?: AbortSignal }
): Promise<RawSodaActiveProcessRecord[]> {
  const todayIso = new Date().toISOString().split("T")[0] + "T00:00:00.000";
  const whereClauses: string[] = [
    `fecha_de_recepcion_de >= '${todayIso}'`,
    "estado_del_procedimiento = 'Publicado'",
    "modalidad_de_contratacion in ('Mínima cuantía', 'Selección Abreviada de Menor Cuantía', 'Seleccion Abreviada Menor Cuantia Sin Manifestacion Interes', 'Selección abreviada subasta inversa', 'Licitación pública', 'Licitación pública Obra Publica', 'Concurso de méritos abierto')",
  ];

  const queryParams = new URLSearchParams();
  queryParams.set("$where", whereClauses.join(" AND "));
  queryParams.set("$order", "fecha_de_publicacion_del DESC");
  queryParams.set("$limit", String(Math.max(limit, 5000)));

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 14000);

  try {
    const res = await fetch(`${SODA_ACTIVE_ENDPOINT}?${queryParams.toString()}`, {
      headers: { Accept: "application/json" },
      signal: options?.signal || timeoutController.signal,
    });
    if (!res.ok) throw new Error(`SODA HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? (data as RawSodaActiveProcessRecord[]).slice(0, limit) : [];
  } finally {
    clearTimeout(timeoutId);
  }
}
```

### B. Cribado en Casa con Frontera de Palabra (`\b...\b`) y Compuerta Física Unificada
```typescript
// src/services/parallelDoubleSifter.ts
/**
 * Evita que "Guaviare" coincida con "uav", "gaviones" con "avion" o "carpas" con "rpas".
 */
export function matchesKeywordSafely(textLower: string, keywordLower: string): boolean {
  if (!keywordLower) return false;
  if (keywordLower.length <= 5 || keywordLower === "avion" || keywordLower === "avión") {
    const escaped = keywordLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(^|[^a-záéíóúñ0-9])(${escaped})(es)?($|[^a-záéíóúñ0-9])`, "i");
    return regex.test(textLower);
  }
  return textLower.includes(keywordLower);
}
```

### C. Motor «El Pulpo en la Oficina de Correos» con Auto-Evicción de Vencidos y Rechazados
```typescript
// src/services/octopusMailboxService.ts
export interface TenantMailboxState<TProcess> {
  tenantId: string;
  tenantName: string;
  updatedAt: string;
  rawUniverseCount: number;
  tier1Count: number;
  tier2Count: number;
  purgedExpiredCount: number;
  purgedDiscardedCount: number;
  candidates: TProcess[];
}

/**
 * Purga automática de registros vencidos (closingDate < ahora) y rechazados (stage === "DISCARDED")
 * manteniendo la Base de Datos libre de basura histórica.
 */
export function purgeExpiredAndDiscardedFromMailbox<T extends { id: string; closingDate: string }>(
  candidates: T[],
  discardedIds: Set<string>,
  isExpiredFn: (closingDate: string) => boolean
): { surviving: T[]; purgedExpired: number; purgedDiscarded: number } {
  let purgedExpired = 0;
  let purgedDiscarded = 0;
  const surviving: T[] = [];

  for (const proc of candidates) {
    if (discardedIds.has(proc.id)) {
      purgedDiscarded++;
      continue;
    }
    if (isExpiredFn(proc.closingDate)) {
      purgedExpired++;
      continue;
    }
    surviving.push(proc);
  }

  return { surviving, purgedExpired, purgedDiscarded };
}
```

---

## 🔌 5. Guía de Reutilización Universal (Cualquier Captura de Big Data desde API)
* **Dónde encaja este Lego Block:**
  - **Cualquier sistema que requiera capturar Big Data desde una API externa para ejecutar un filtrado inteligente posterior:**
    1. **GovTech / Contratación Pública y Regulatoria:** SECOP II, COMPRANET, SAM.gov, boletines judiciales, registros sanitarios INVIMA/FDA.
    2. **Integraciones ERP / Catálogos B2B Masivos:** Sincronización de inventarios, listas de precios o movimientos contables desde SAP, Oracle, Netsuite o APIs bancarias donde filtrar en el endpoint remoto es lento o incompleto.
    3. **Bolsas Logísticas, Inmobiliarias o Financieras:** Captura de lotes completos de cargas disponibles, propiedades o transacciones para cruzarlos en memoria contra las reglas de riesgo o preferencias de múltiples clientes.
    4. **Telemetría Industrial e IoT:** Descarga de ventanas completas de eventos de planta para detección de anomalías en memoria antes de persistir únicamente los hallazgos accionables en la base de datos.
* **Regla de Dimensionamiento en RAM:**
  - `5.000` registros JSON típicos (`~500–700 bytes` c/u) ocupan apenas **`~2.5 a 3.5 MB` de RAM**, se transfieren por red en `2–4 segundos` y se criban en Node.js en `<50 ms`. Hasta `25.000` registros caben holgadamente en memoria estándar sin necesidad de paginación compleja ni bases de datos intermedias de staging.
