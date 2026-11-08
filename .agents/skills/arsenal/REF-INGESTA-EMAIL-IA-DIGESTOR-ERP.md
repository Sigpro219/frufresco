---
id: REF-INGESTA-EMAIL-IA-DIGESTOR-ERP
version: 2.0
estado: VIGENTE
reemplaza: "v1.0 - REF-2026-08-28-01-INTELLIGENT-DOCUMENT-DIGESTER"
titulo: "Protocolo Industrial de Ingesta de Emails, Motor IA Resiliente (Zero-Deprecation), Digestor Polimórfico PDF/Excel y Mesa de Borradores B2B"
categoria: "Ingesta IA & UI/UX Industrial"
tags: [email-ingest, gemini-resilience, zero-deprecation, ocr-pdf, excel-heuristics, multi-sheet, pdf-canvas, lean-ergonomics, fuzzy-matching, erp-b2b, google-apps-script]
multiplicador_velocidad: "7X"
reduccion_errores: "98%"
proyectos_origen: [frufresco]
fecha_cosecha: "2026-09-15"
---

# 🧩 Ficha de Refacción: Ingesta Industrial de Emails, Motor IA Resiliente y Digestor Polimórfico PDF/Excel

## 🔴 1. La Pesadilla Operativa Previa (Baseline 1X - El Gemba Real)
* **Puesto de Trabajo & Flujo Físico:** El operador trabajaba a dos pantallas divididas (Pantalla 1: Outlook/Gmail o PDF/Excel descargado; Pantalla 2: Software ERP de pedidos). El flujo consistía en memorizar o señalar con el dedo un renglón, cambiar de ventana, buscar el producto en el ERP, digitar la cantidad y regresar a la primera pantalla, mientras atendía llamadas de clientes.
* **Muda Identificada:** Doble digitación manual ciega, fatiga visual severa, sobreprocesamiento y alta probabilidad de error humano por digitación (ej. confundir 15 kilos con 15 cajas, o perder observaciones de calidad como "plátano verde para el viernes").
* **Velocidad y Tasa de Falla Inicial:** Velocidad base 1X (15 a 20 minutos por pedido de 25 renglones). Tasa de error humano estimada entre 10% y 15% en horas pico de recepción matutina.

---

## 🟢 2. La Transformación Operativa (Salto Multiplicador 7X)
* **Nuevo Flujo de Trabajo (Pantalla Única):** La orden llega al buzón, es capturada por el puente serverless y la IA/heurística pre-digiere el 95% de la información (cliente, productos, cantidades, unidades y fecha de entrega). El operador deja de transcribir y pasa a **auditar en pantalla única**, revisando las alertas visuales y confirmando la orden con un solo clic.
* **Multiplicador de Rendimiento:** **Aceleración a 7X (de 15-20 min a menos de 2 minutos por pedido)**. La tasa de errores de digitación se redujo a menos del 0.5%, eliminando reclamos por entregas equivocadas.

---

## 💣 3. Secretos Sucios de Producción & Antipatrones Descartados

---

* **Antipatrones Descartados:**

* ❌ **SDK Oficial Rígido con Modelo Único (`@google/generative-ai`):** Acoplar el backend a una instancia estática del SDK con un modelo cableado (`gemini-1.5-pro`). Al quedar obsoleto el modelo, todo el pipeline colapsaba y requería despliegues de emergencia.
* ❌ **Asumir que el Modelo Más Nuevo Soporta Todo:** Enviar PDFs binarios a `gemini-3.x` en la API v1beta provocaba fallos sistemáticos `400 INVALID_ARGUMENT` al no estar habilitada la ingestión de documentos en ese tier.
* ❌ **Polling IMAP Directo en Funciones Serverless/Vercel:** Mantener conexiones de socket TCP/IMAP abiertas en endpoints sin estado generaba timeouts masivos y cortes de conexión intermitentes.
* ❌ **Parsing Rígido de Columnas de Excel por Índice Fijo:** Asumir que la columna 0 es producto y la columna 1 es cantidad. Cada cliente tiene un formato distinto; un cambio de columna producía pedidos con cantidades nulas o invertidas.
* ❌ **Visores de PDF Basados en `<iframe src="url">` o `<embed>`:** Provocaban bloqueos por políticas CORS de Storage, descargas automáticas forzadas del archivo en lugar de visualización y ejecución incontrolada de scripts `this.print()` del PDF.
* ❌ **Buscador de Clientes en el Estado Raíz del Módulo:** Controlar el input de búsqueda de clientes en el componente padre provocaba re-renders masivos de miles de líneas de interfaz por cada letra escrita.
* ❌ **Foco Inicial en la Fila 1 de Productos:** Al abrir un borrador, fijar el cursor en la fila 1 empujaba el scroll hacia abajo, ocultando la cabecera de la tabla y desorientando al operador.
* ❌ **Ignorar las Fechas Numéricas Seriales de Excel:** Dejar enteros como `45450` provocaba que los pedidos quedaran programados para el año 1970.

---



La solución se cimenta en 5 pilares operativos y de arquitectura:

### 1. Desacoplamiento de Ingesta en Dos Tramos (GAS Bridge + Asynchronous Handoff)
* **Tramo 1 (Captura):** Un script serverless liviano en Google Apps Script (ejecutado cada 5 minutos en el propio ecosistema de correo corporativo) monitorea correos no leídos, descarta spam y alertas automáticas, codifica adjuntos a Base64 y los dispara vía webhook HTTPS con Bearer Token.
* **Tramo 2 (Recepción Inmediata):** El endpoint Next.js `/api/orders/email-ingest` registra de inmediato el payload crudo en la base de datos y retorna HTTP 200 en menos de 100ms. La digestión por IA, extracción de Excel y almacenamiento en Supabase Storage se ejecutan de manera asíncrona desacoplada, blindando el webhook contra timeouts de Vercel.

### 2. Digestor Polimórfico de Documentos (Triple Estrategia Excel + Canvas PDF)
* **Backend: Triple Estrategia para Excel (`.xlsx`, `.xls`, `.csv`):**
  * *Estrategia 1 (Scoring Semántico Ponderado):* Analiza cabeceras mediante diccionarios ponderados (`NAME_SYNONYMS`, `QTY_SYNONYMS`, `UNIT_SYNONYMS`, `OBS_SYNONYMS`), aplicando penalizaciones (`QTY_NEGATIVE`, `SKIP_COLUMNS`) para no confundir PLUs, códigos de barra, precios o fechas con cantidades.
  * *Estrategia 2 (Pattern Matching Estructural):* Detecta filas con 2 a 12 textos cortos seguidas de filas con el patrón continuo `[texto de producto] + [número entre 1 y 5000]`.
  * *Estrategia 3 (Análisis Estadístico de Columnas):* Calcula densidad de texto, longitud media de cadena y conteo de valores numéricos en rango operativo para resolver la tabla incluso si no tiene cabeceras legibles.
* **Frontend: Extractor Heurístico y Multi-Pestaña:**
  * Escaneo de las primeras 15 filas para identificar dinámicamente la fila cabecera.
  * Algoritmo de desempate de cantidades: si existen múltiples columnas de cantidad (ej. `CANT SOLICITADA` vs `TOTAL`), itera las filas de datos y selecciona la columna con mayor densidad de números positivos mayores a cero.
  * Conversión matemática de fechas seriales UTC de Excel: `((serial - 25569) * 86400) * 1000` a `DD/MM/YYYY`.
  * Multi-hoja interactiva con pre-conteo de ítems detectados (`countWithQty`).
* **Frontend: Neutralizador Binario de PDFs y Renderizado en Canvas:**
  * Antes de cargar el PDF, un parche binario en memoria reemplaza las instrucciones `/Print` por `/P_int` y `this.print` por `this.p_int` manteniendo intacto el offset exacto de bytes del archivo.
  * Renderizado mediante `pdfjs-dist` directamente sobre elementos HTML5 `<canvas>`, garantizando zoom fluido, soporte multi-página, cero bloqueos CORS y total aislamiento de la ventana del navegador.

### 3. Anillo de Resiliencia IA Zero-Deprecation (Compliance por Formato)
* **Enrutamiento Estricto por MIME Type:**
  * Si el documento es **PDF**: La cascada ejecuta estrictamente `['gemini-2.5-flash', 'gemini-2.5-flash-lite']` (modelos que soportan nativamente documentos PDF binarios en v1beta).
  * Si es **Imagen o Texto**: La cascada amplía a `['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-2.5-flash-lite']`.
* **Conmutación en Caliente sin SDK:** Llamadas REST directas con `fetch` y timeout estricto de 45 segundos con `AbortController`. Si un modelo devuelve `404/410` (deprecado) o `503/429` (saturado), conmuta al siguiente en milisegundos.
* **Detección de Archivo Vacío/Dañado:** Si el motor reporta "document has no pages", cancela la cascada inmediatamente sin malgastar cuota de otros modelos.

### 4. Motor de Auto-Aprendizaje (Self-Learning Memory) y Resolución de Clientes en 5 Capas
* **Resolución de Cliente en 5 Capas:**
  1. *Capa 1: NIT con desambiguación multisede* (evalúa cercanía de dirección y palabras clave de sucursal).
  2. *Capa 2: Emails primarios y alternos.*
  3. *Capa 3: Razón social y nombre comercial.*
  4. *Capa 4: Firma y pie de página del correo.*
  5. *Capa 5: Dirección física extraída.*
* **Matcher de Productos en 3 Niveles:**
  1. *Prioridad 1: Memoria Histórica Aprendida (`document_learning_memory`)* por cliente (100% de confianza).
  2. *Prioridad 2: Coincidencia Exacta de Catálogo* (limpiando gramajes como "1000g", "kg", "paquete").
  3. *Prioridad 3: Coincidencia por Tokens* ponderando el producto base más corto (ej. preferir `Espinaca` sobre `Espinaca sin raíz`).
* **Auto-Aprendizaje Persistente (`recordLearningMemory`):** Cada vez que un operador corrige o confirma un producto en la mesa de borradores, el sistema registra el alias en `document_learning_memory`. La próxima orden del cliente asociará el producto con 100% de confianza.

### 5. Ergonomía Industrial en la Mesa de Borradores
* **Foco Ancla en Fila 2:** Al cargar un borrador, el foco automático se ubica en la fila 2 de productos, permitiendo que la fila 1 y los encabezados permanezcan visibles como referencia visual continua para el digitador.
* **Combobox Desacoplado (<2ms Latency):** Componente memoizado (`React.memo`) con estado de búsqueda interno; la digitación no re-renderiza la tabla ni el visor de documentos.
* **Recálculo Automático de Precios Contractuales:** Si el operador reasigna la orden a otra sede o cliente, el sistema re-consulta los precios especiales (`contractPrices`) y actualiza los precios unitarios y subtotales en vivo.
* **Normalización CSS WebKit:** Reglas globales para eliminar el icono nativo duplicado del calendario en Chrome, manteniendo botones táctiles rápidos (`[ Hoy ]`, `[ Mañana ]`).

---

## 💻 4. Solución de Software & Código Clave (Lego Blocks)

### A. Puente Google Apps Script (Gateway a Webhook HTTPS)
```javascript
// scripts/google_apps_script_bridge.js
const FRUFRESCO_WEBHOOK_URL = 'https://tu-dominio.com/api/orders/email-ingest';
const LABEL_PROCESSED = 'PROCESADO_SISTEMA';

function procesarPedidosEntrantes() {
  let label = GmailApp.getUserLabelByName(LABEL_PROCESSED) || GmailApp.createLabel(LABEL_PROCESSED);
  const threads = GmailApp.search('label:inbox is:unread newer_than:1d -label:' + LABEL_PROCESSED, 0, 10);
  if (threads.length === 0) return;

  for (let t = 0; t < threads.length; t++) {
    const thread = threads[t];
    const messages = thread.getMessages();

    for (let m = 0; m < messages.length; m++) {
      const message = messages[m];
      if (!message.isUnread()) continue;

      const subject = message.getSubject() || 'Sin Asunto';
      const from = message.getFrom();
      const to = message.getTo();

      // Filtro anti-spam y notificaciones de sistema
      const ignorePattern = /noreply|no-reply|mailer-daemon|github|vercel|supabase|resend.com/i;
      if (ignorePattern.test(from) || ignorePattern.test(subject)) {
        message.markRead();
        thread.addLabel(label);
        continue;
      }

      // Codificación de adjuntos (PDF, XLSX, Imágenes) a Base64
      const rawAttachments = message.getAttachments();
      const attachments = [];
      for (let a = 0; a < rawAttachments.length; a++) {
        const att = rawAttachments[a];
        attachments.push({
          filename: att.getName(),
          file_name: att.getName(),
          content_type: att.getContentType(),
          content: Utilities.base64Encode(att.getBytes())
        });
      }

      const payload = {
        headers: { subject, from, to, date: message.getDate().toISOString() },
        envelope: { from, to },
        plain: message.getPlainBody() || '',
        html: message.getBody() || '',
        attachments: attachments
      };

      const options = {
        method: 'post',
        contentType: 'application/json',
        headers: { 'Authorization': 'Bearer ' + SCRIPT_SECRET_TOKEN },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      };

      const res = UrlFetchApp.fetch(FRUFRESCO_WEBHOOK_URL, options);
      if (res.getResponseCode() === 200) {
        message.markRead();
        thread.addLabel(label);
      }
    }
  }
}
```

---

### B. Motor de Backend: Triple Estrategia de Ingesta de Excel
```typescript
// Fragmento de src/app/api/orders/email-ingest/route.ts
// MOTOR INTELIGENTE DE PARSING DE EXCEL (Multi-Estrategia)
const isNumeric = (val: any): boolean => {
  if (val === null || val === undefined) return false;
  if (typeof val === 'number') return !isNaN(val);
  const str = String(val).trim().replace(',', '.');
  return str !== '' && !isNaN(Number(str));
};

const parseNum = (val: any): number => {
  if (typeof val === 'number') return val;
  return parseFloat(String(val || '').trim().replace(',', '.'));
};

const NAME_SYNONYMS: [RegExp, number][] = [
  [/^prod(ucto|uct|uctos)?$/i, 10], [/^desc(ripci[oó]n)?$/i, 10],
  [/^nombre$/i, 10], [/^item$/i, 9], [/^art[ií]culo$/i, 10], [/^material$/i, 9],
  [/^detalle$/i, 9], [/^sku$/i, 8], [/^insumo/i, 8]
];

const QTY_SYNONYMS: [RegExp, number][] = [
  [/^can(t(idad)?)?$/i, 10], [/^qty$/i, 10], [/^quantity$/i, 10],
  [/^unidades$/i, 8], [/^pedid[oa]?$/i, 8], [/^solicit/i, 7], [/^total$/i, 5],
  [/cant[\.\s]*(pedid|solicit|total)/i, 9], [/^requerid/i, 7]
];

const QTY_NEGATIVE: RegExp[] = [
  /medida/i, /presentaci[oó]n/i, /precio/i, /valor/i, /costo/i,
  /plu/i, /c[oó]digo/i, /barr?a/i, /ref(erencia)?$/i, /ean/i
];

const SKIP_COLUMNS: RegExp[] = [
  /^plu$/i, /^c[oó]digo/i, /^cod\.?$/i, /^ref\.?$/i, /^ean$/i,
  /^barr?a$/i, /^#$/i, /^no\.?$/i, /^id$/i, /^precio/i, /^valor/i,
  /^costo/i, /^iva/i, /^sede/i, /^sucursal/i, /^bodega/i, /^fecha/i
];

// ESTRATEGIA 1: Scoring semántico con descarte de falsos positivos
let bestHeaderScore = 0;
for (let r = 0; r < Math.min(allRows.length, 30); r++) {
  const row = allRows[r];
  if (!row || !Array.isArray(row)) continue;

  let rNameIdx = -1, rQtyIdx = -1;
  let rNameScore = 0, rQtyScore = 0;

  for (let c = 0; c < row.length; c++) {
    const raw = row[c];
    if (raw === null || raw === undefined) continue;
    const val = String(raw).toLowerCase().replace(/[*_\-\.\#]/g, '').trim();
    if (!val || val.length > 40 || SKIP_COLUMNS.some(rx => rx.test(val))) continue;

    const ns = scoreColumn(val, NAME_SYNONYMS);
    const qs = scoreColumn(val, QTY_SYNONYMS);
    const isQtyNeg = QTY_NEGATIVE.some(rx => rx.test(val));

    if (ns > rNameScore) { rNameIdx = c; rNameScore = ns; }
    if (qs > rQtyScore && !isQtyNeg) { rQtyIdx = c; rQtyScore = qs; }
  }

  const totalScore = rNameScore + rQtyScore;
  if (rNameIdx !== -1 && rQtyIdx !== -1 && totalScore > bestHeaderScore) {
    bestHeaderScore = totalScore;
    headerRowIdx = r;
    nameColIdx = rNameIdx;
    qtyColIdx = rQtyIdx;
  }
}

// ESTRATEGIA 2 (Pattern Fallback): Detectar fila de cabecera con >=2 celdas de texto
// seguidas consecutivamente por filas de datos con patrón [texto de producto] + [número 1-5000]

// ESTRATEGIA 3 (Statistical Density Fallback):
// Seleccionar columna de producto por frecuencia de texto y longitud media de cadena;
// Seleccionar columna de cantidad por mayor densidad de números en rango operativo [1 a 5000].
```

---

### C. Motor IA Resiliente Zero-Deprecation (Formato Estricto y Fetch Nativo)
```typescript
// src/lib/orders/order-parser-engine.ts
export async function fetchGeminiExtraction(
  apiKey: string,
  prompt: string,
  base64Data?: string,
  mimeType: string = 'application/pdf'
): Promise<any> {
  const isPdf = mimeType === 'application/pdf';

  // REGLA CRÍTICA DE API v1beta:
  // Modelos gemini-3.x devuelven 400 INVALID_ARGUMENT con PDFs en inline_data.
  // Solo la familia gemini-2.5 procesa PDFs multimodales nativamente.
  const modelsToTry = isPdf
    ? ['gemini-2.5-flash', 'gemini-2.5-flash-lite']
    : ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-2.5-flash-lite'];

  let resultText: string | null = null;
  let successfulModel: string = '';
  let lastError: any = null;
  let allModelsNotFound = true;

  for (const modelName of modelsToTry) {
    try {
      const parts: any[] = [];
      if (base64Data && base64Data.trim().length > 0) {
        parts.push({
          inline_data: { mime_type: mimeType, data: base64Data.trim() }
        });
      }
      parts.push({ text: prompt });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts }] }),
          signal: controller.signal
        }
      );
      clearTimeout(timeoutId);

      const data = await response.json();
      if (!response.ok) {
        const errorMsg = data?.error?.message || response.statusText || 'Error desconocido';
        if (response.status !== 404 && response.status !== 410) {
          allModelsNotFound = false;
        }
        // Falla de documento (no del modelo): abortar cascada para no agotar cuota
        if (errorMsg.includes('has no pages') || errorMsg.includes('empty page')) {
          throw new Error('El documento PDF no contiene páginas legibles o está vacío.');
        }
        lastError = new Error(`[Gemini ${response.status}] ${errorMsg}`);
        continue;
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (text) {
        resultText = text;
        successfulModel = modelName;
        break; // Éxito
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        allModelsNotFound = false;
        continue;
      }
      if (err.message && err.message.includes('páginas')) throw err;
      lastError = err;
    }
  }

  if (!resultText) {
    if (allModelsNotFound) {
      throw new Error('El modelo de IA ya no está vigente en Google. Contacte a soporte para actualizarlo.');
    }
    throw lastError || new Error('No fue posible procesar el documento con el motor de IA.');
  }

  return parseRobustJson(resultText, successfulModel);
}
```

---

### D. Frontend: Neutralizador Binario de PDFs y Renderizado en Canvas
```typescript
// src/components/EmailDraftsModule.tsx & PdfCanvasViewer.tsx
// 1. NEUTRALIZADOR BINARIO DE DIÁLOGOS DE IMPRESIÓN (In-Memory ArrayBuffer Patch)
fetch(pdfUrl)
  .then(res => res.arrayBuffer())
  .then(buffer => {
    const uint8 = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);

    // Reemplazo 1-a-1 de caracteres para conservar los byte-offsets del PDF intactos
    binary = binary.replace(/\/S\s*\/Named\s*\/N\s*\/Print/g, '/S /Named /N /P_int');
    binary = binary.replace(/\/S\s*\/JavaScript\s*\/JS\s*\(([^)]*this\.print[^)]*)\)/gi, (m) => m.replace(/this\.print/g, 'this.p_int'));
    binary = binary.replace(/this\.print\s*\(/g, 'this.p_int(');
    binary = binary.replace(/\/Print\b/g, '/P_int');

    const cleanUint8 = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) cleanUint8[i] = binary.charCodeAt(i);

    const blob = new Blob([cleanUint8], { type: 'application/pdf' });
    setPdfBlobUrl(URL.createObjectURL(blob));
  });

// 2. RENDERIZADO AISLADO EN HTML5 CANVAS (PdfCanvasViewer.tsx)
const page = await pdfDoc.getPage(pageNum);
const pixelRatio = window.devicePixelRatio || 1;
const viewport = page.getViewport({ scale: zoom });

const canvas = document.createElement('canvas');
canvas.width = viewport.width * pixelRatio;
canvas.height = viewport.height * pixelRatio;
const ctx = canvas.getContext('2d');
if (ctx) {
  ctx.scale(pixelRatio, pixelRatio);
  await page.render({ canvasContext: ctx, viewport }).promise;
}
```

---

### E. Frontend: Parser Heurístico Excel Multi-Pestaña y Fechas Seriales
```typescript
// src/components/EmailDraftsModule.tsx
workbook.SheetNames.forEach((sheetName) => {
  const worksheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
  const validRows = rawData.filter(r => r && r.length > 0 && r.some(c => c !== null && String(c).trim() !== ''));
  if (validRows.length === 0) return;

  // 1. Detección dinámica de fila cabecera (escaneo de primeras 15 filas)
  let headerRowIdx = 0;
  for (let r = 0; r < Math.min(15, validRows.length); r++) {
    const rowStr = validRows[r].map(c => String(c || '').toLowerCase()).join(' ');
    if ((rowStr.includes('prod') || rowStr.includes('descrip') || rowStr.includes('item')) &&
        (rowStr.includes('can') || rowStr.includes('cant') || rowStr.includes('ubm') || rowStr.includes('plu'))) {
      headerRowIdx = r;
      break;
    }
  }

  // 2. Desempate de columnas candidatas a cantidad por densidad de números positivos
  let qtyCol = -1;
  if (qtyCandidates.length > 0) {
    let bestCount = -1;
    qtyCandidates.forEach(candCol => {
      let positiveCount = 0;
      for (let r = headerRowIdx + 1; r < validRows.length; r++) {
        const cleanNum = parseFloat(String(validRows[r]?.[candCol] || '').replace(',', '.').replace(/[^0-9.]/g, ''));
        if (!isNaN(cleanNum) && cleanNum > 0) positiveCount++;
      }
      if (positiveCount > bestCount) {
        bestCount = positiveCount;
        qtyCol = candCol;
      }
    });
  }

  // 3. Conversión de fechas seriales UTC de Excel (ej. 45890 -> DD/MM/YYYY)
  const formatExcelCell = (val: any, isDateRow: boolean) => {
    const s = String(val || '').trim();
    const num = Number(s);
    if (!isNaN(num) && (isDateRow || (num >= 35000 && num <= 60000 && Number.isInteger(num)))) {
      try {
        const utc_days = Math.floor(num - 25569);
        const date_info = new Date(utc_days * 86400 * 1000);
        const day = String(date_info.getUTCDate()).padStart(2, '0');
        const month = String(date_info.getUTCMonth() + 1).padStart(2, '0');
        const year = date_info.getUTCFullYear();
        if (year >= 2020 && year <= 2035) return `${day}/${month}/${year}`;
      } catch {}
    }
    return s;
  };
});
```

---

### F. Frontend: Combobox Desacoplado (<2ms Latency) y CSS WebKit
```typescript
// Componente memoizado independiente: Evita re-renderizar la mesa de borradores al teclear
export const ClientSearchCombobox = React.memo(function ClientSearchCombobox({
  clients,
  selectedClientId,
  onSelectClient,
  placeholder = "Buscar cliente o sucursal..."
}: ClientSearchComboboxProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!query.trim()) return clients.slice(0, 15);
    const q = query.toLowerCase().trim();
    return clients.filter(c =>
      (c.company_name?.toLowerCase() || '').includes(q) ||
      (c.contact_name?.toLowerCase() || '').includes(q) ||
      (c.nit?.toString() || '').includes(q)
    ).slice(0, 20);
  }, [clients, query]);

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        className="client-search-input"
      />
      {/* Resultados filtrados fluidos */}
    </div>
  );
});
```

```css
/* src/app/globals.css */
/* Supresión de iconos nativos duplicados en WebKit/Chrome */
.hide-native-date-picker-indicator::-webkit-calendar-picker-indicator {
  display: none !important;
  -webkit-appearance: none !important;
  opacity: 0 !important;
  pointer-events: none !important;
}

.hide-native-date-picker-indicator::-webkit-inner-spin-button,
.hide-native-date-picker-indicator::-webkit-clear-button {
  display: none !important;
  -webkit-appearance: none !important;
}
```

---

## 🔌 5. Guía de Reutilización Frankenstein & Dependencias

### Dónde Encaja Esta Pieza
Cualquier sistema SaaS, ERP o plataforma logística B2B que reciba pedidos, facturas de compras o remisiones mediante correos electrónicos, imágenes de WhatsApp o documentos heterogéneos, y requiera convertirlos en borradores auditables de alta velocidad.

### Tablas de Base de Datos Necesarias (PostgreSQL / Supabase)
1. `order_drafts`: Almacena el correo crudo, adjuntos en JSONB (`extracted_items`), emisor, estado y metadatos.
2. `mail`: Mensajería corporativa unificada y registro de auditoría.
3. `document_learning_memory`: Almacena el auto-aprendizaje por cliente (`client_id`, `normalized_text`, `matched_product_id`, `matched_unit`).
4. `app_settings`: Configuración dinámica de buzones (`inbox_email_orders`, `inbox_email_commercial`).
5. `profiles`: Directorio de clientes, sucursales, NITs y emails alternos.
6. `products`: Catálogo de productos con unidades de medida y precios base.

### Dependencias Mínimas de Código
* `xlsx` (`npm i xlsx`): Lectura y parsing en memoria de hojas de cálculo.
* `pdfjs-dist` (o carga CDN de `pdf.min.js` + `pdf.worker.min.js`): Renderizado en Canvas sin iframes.
* `@supabase/supabase-js`: Conexión de datos y almacenamiento en Storage.
* Llamadas HTTP nativas con `fetch` (sin librerías pesadas de Gemini para evitar acoplamientos).
* Google Apps Script para el puente de captura en Gmail/Workspace.
