/**
 * Instrumento 4: Conciliador Transaccional Dual-Agent (Gemini Maker + DeepSeek Checker)
 * Especificación Canónica: SPEC.md Escenario 396 (SDD v1.9.374)
 *
 * Responsabilidad:
 * - Comparar borradores de pedidos entrantes contra los borradores de las últimas 24h del mismo cliente.
 * - Aplicar Fast-Path (0 ms de sobrecosto) si el cliente no tiene actividad reciente.
 * - Invocar a DeepSeek API (`deepseek-chat`) para dirimir si es un duplicado de transición (`IGNORE_DUPLICATE`),
 *   una modificación/adición (`UPDATE_DELTA`) o un pedido nuevo (`INSERT_NEW`).
 * - Garantizar Fail-Open (Cero Pedidos Perdidos) ante timeouts o errores de red.
 */

export type ReconcilerVerdictType = 'IGNORE_DUPLICATE' | 'UPDATE_DELTA' | 'INSERT_NEW';

export interface ReconcilerItemSummary {
  matched_product_id: string | null;
  name: string;
  quantity: number;
  unit: string;
}

export interface IncomingDraftSummary {
  client_detected_name: string;
  source_email: string;
  purchase_order: string | null;
  delivery_date: string | null;
  address: string | null;
  email_subject: string;
  items: ReconcilerItemSummary[];
}

export interface ExistingDraftSummary {
  draft_id: string;
  status: string;
  client_detected_name: string;
  purchase_order: string | null;
  delivery_date: string | null;
  address: string | null;
  email_subject: string;
  items: ReconcilerItemSummary[];
}

export interface DeepSeekReconcilerOutput {
  verdict: ReconcilerVerdictType;
  target_draft_id: string | null;
  reason: string;
}

export interface ReconcilerExecutionResult extends DeepSeekReconcilerOutput {
  fastPath: boolean;
  fallbackUsed: boolean;
}

/**
 * Normaliza cadenas para comparación insensible a acentos, mayúsculas y espacios extras.
 */
export function normalizeTextForReconciler(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrae el resumen ligero de un registro de `order_drafts` para enviarlo a DeepSeek.
 */
export function extractDraftSummary(draftRecord: {
  id: string;
  status?: string;
  client_detected_name?: string | null;
  source_email?: string | null;
  email_subject?: string | null;
  extracted_items?: any;
}): ExistingDraftSummary {
  const rawItems = Array.isArray(draftRecord.extracted_items) ? draftRecord.extracted_items : [];
  const meta = rawItems.find((x: any) => x && x.isMetadata) || {};
  const productItems: ReconcilerItemSummary[] = rawItems
    .filter((x: any) => x && !x.isMetadata)
    .map((item: any) => ({
      matched_product_id: item.matched_product_id || null,
      name: String(item.matched_product_name || item.originalName || item.name || '').trim(),
      quantity: Number(item.quantity) || 0,
      unit: String(item.unit || 'Unidad').trim(),
    }));

  return {
    draft_id: draftRecord.id,
    status: draftRecord.status || 'pending',
    client_detected_name: String(draftRecord.client_detected_name || 'Desconocido').trim(),
    purchase_order: meta.purchaseOrder || meta.purchase_order || meta.poNumber || null,
    delivery_date: meta.deliveryDate || null,
    address: meta.address || meta.addressDetected || null,
    email_subject: String(draftRecord.email_subject || '').trim(),
    items: productItems,
  };
}

/**
 * Filtra de una lista de borradores de las últimas 24h aquellos que pertenecen al mismo cliente.
 */
export function filterCandidateDraftsForClient(
  incomingDraft: {
    id: string;
    profile_id?: string | null;
    source_email?: string | null;
    client_detected_name?: string | null;
  },
  recentDrafts24h: Array<{
    id: string;
    profile_id?: string | null;
    source_email?: string | null;
    client_detected_name?: string | null;
    status?: string;
    email_subject?: string | null;
    extracted_items?: any;
  }>,
  placeholderMailId?: string | null
): ExistingDraftSummary[] {
  const incomingEmail = (incomingDraft.source_email || '').toLowerCase().trim();
  const incomingClientNorm = normalizeTextForReconciler(incomingDraft.client_detected_name);

  return recentDrafts24h
    .filter((d) => {
      if (!d || !d.id) return false;
      if (d.id === incomingDraft.id) return false;
      if (placeholderMailId && d.id === placeholderMailId) return false;
      if (d.status === 'rejected') return false;
      if ((d.email_subject || '').startsWith('[RAW_WEBHOOK]')) return false;

      // Debe tener al menos 1 ítem de producto
      const arr = Array.isArray(d.extracted_items) ? d.extracted_items : [];
      const hasItems = arr.some((x: any) => x && !x.isMetadata);
      if (!hasItems) return false;

      // 1. Coincidencia por profile_id
      if (incomingDraft.profile_id && d.profile_id && incomingDraft.profile_id === d.profile_id) {
        return true;
      }

      // 2. Coincidencia por source_email
      const dEmail = (d.source_email || '').toLowerCase().trim();
      if (incomingEmail && dEmail && incomingEmail !== 'desconocido' && incomingEmail === dEmail) {
        return true;
      }

      // 3. Coincidencia por client_detected_name normalizado
      const dClientNorm = normalizeTextForReconciler(d.client_detected_name);
      if (
        incomingClientNorm &&
        dClientNorm &&
        incomingClientNorm !== 'desconocido' &&
        incomingClientNorm.length > 3 &&
        incomingClientNorm === dClientNorm
      ) {
        return true;
      }

      return false;
    })
    .map(extractDraftSummary);
}

/**
 * Ejecuta el arbitraje lógico con DeepSeek (o Fast-Path si no hay candidatos).
 */
export async function evaluateDraftWithDeepSeekReconciler(
  incoming: IncomingDraftSummary,
  candidates: ExistingDraftSummary[],
  options?: {
    apiKey?: string;
    model?: string;
    timeoutMs?: number;
    customFetch?: typeof fetch;
  }
): Promise<ReconcilerExecutionResult> {
  // 1. FAST-PATH: Sin candidatos previos del mismo cliente en 24h
  if (!candidates || candidates.length === 0) {
    return {
      verdict: 'INSERT_NEW',
      target_draft_id: null,
      reason: 'Fast-Path: Sin borradores previos del cliente en las últimas 24 horas.',
      fastPath: true,
      fallbackUsed: false,
    };
  }

  const apiKey = options?.apiKey ?? process.env.DEEPSEEK_API_KEY;
  const model = options?.model ?? process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';
  const timeoutMs = options?.timeoutMs ?? 4000;
  const fetchFn = options?.customFetch ?? fetch;

  if (!apiKey) {
    return {
      verdict: 'INSERT_NEW',
      target_draft_id: null,
      reason: 'Fallback Fail-Open: DEEPSEEK_API_KEY no configurada.',
      fastPath: false,
      fallbackUsed: true,
    };
  }

  const systemPrompt = `Eres el Juez de Conciliación Transaccional (Instrumento 4) de FruFresco SCOS.
Tu misión es comparar un PEDIDO_ENTRANTE contra los BORRADORES_EXISTENTES_24H del mismo cliente durante una transición de dominios de correo (.com y .co) y emitir un veredicto determinista en JSON.

REGLAS ESTRICTAS DE ARBITRAJE:
1. MULTI-SUCURSAL / MULTI-OC (PROHIBIDO FUSIONAR SEDES DISTINTAS):
   - Si el PEDIDO_ENTRANTE tiene un número de Orden de Compra (purchase_order) explícito y DIFERENTE al del borrador existente, el veredicto DEBE ser "INSERT_NEW".
   - Si la dirección de entrega (address) o el nombre de la sede/sucursal (client_detected_name) corresponden a otra sede diferente (ej. diferentes sedes de Colsubsidio, Aldimark o Monserrate), el veredicto DEBE ser "INSERT_NEW".
2. DUPLICADO DE TRANSICIÓN ("IGNORE_DUPLICATE"):
   - Si el PEDIDO_ENTRANTE corresponde a la misma sede/cliente, misma fecha de entrega (o compatible) y misma OC (o ambos sin OC), y contiene esencialmente la MISMA lista de productos y cantidades que uno de los BORRADORES_EXISTENTES_24H (ej. el mismo pedido enviado simultáneamente a pedidos@frufresco.com y pedidos@frufresco.co, o reenviado por precaución), devuelve:
     "verdict": "IGNORE_DUPLICATE" y en "target_draft_id" coloca el "draft_id" del borrador existente idéntico.
3. MODIFICACIÓN O ADICIÓN ("UPDATE_DELTA"):
   - Si el PEDIDO_ENTRANTE se refiere claramente al MISMO pedido/sede/OC de uno de los BORRADORES_EXISTENTES_24H, pero el cliente cambió cantidades, corrigió unidades o agregó/quitó productos respecto a ese borrador, devuelve:
     "verdict": "UPDATE_DELTA" y en "target_draft_id" coloca el "draft_id" del borrador existente que debe actualizarse.
4. PEDIDO NUEVO INDEPENDIENTE ("INSERT_NEW"):
   - Si es un pedido completamente distinto (diferente mercado para otra fecha, otra OC u otra sucursal), devuelve:
     "verdict": "INSERT_NEW" y "target_draft_id": null.

Responde ÚNICAMENTE con un objeto JSON válido con esta estructura exacta:
{
  "verdict": "IGNORE_DUPLICATE" | "UPDATE_DELTA" | "INSERT_NEW",
  "target_draft_id": "string o null",
  "reason": "Explicación concisa en español"
}`;

  const userPayload = JSON.stringify(
    {
      incoming_draft: incoming,
      existing_drafts: candidates,
    },
    null,
    2
  );

  try {
    const response = await fetchFn('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPayload },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      return {
        verdict: 'INSERT_NEW',
        target_draft_id: null,
        reason: `Fallback Fail-Open: DeepSeek HTTP ${response.status}`,
        fastPath: false,
        fallbackUsed: true,
      };
    }

    const data: any = await response.json();
    const rawContent: string = data?.choices?.[0]?.message?.content || '';
    const cleaned = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const validVerdicts: ReconcilerVerdictType[] = ['IGNORE_DUPLICATE', 'UPDATE_DELTA', 'INSERT_NEW'];
    if (!parsed || !validVerdicts.includes(parsed.verdict)) {
      return {
        verdict: 'INSERT_NEW',
        target_draft_id: null,
        reason: 'Fallback Fail-Open: Veredicto JSON de DeepSeek fuera de contrato.',
        fastPath: false,
        fallbackUsed: true,
      };
    }

    const candidateIds = new Set(candidates.map((c) => c.draft_id));
    const resolvedTargetId =
      parsed.target_draft_id && candidateIds.has(String(parsed.target_draft_id))
        ? String(parsed.target_draft_id)
        : candidates[0]?.draft_id || null;

    if ((parsed.verdict === 'IGNORE_DUPLICATE' || parsed.verdict === 'UPDATE_DELTA') && !resolvedTargetId) {
      return {
        verdict: 'INSERT_NEW',
        target_draft_id: null,
        reason: 'Fallback Fail-Open: target_draft_id no resoluble.',
        fastPath: false,
        fallbackUsed: true,
      };
    }

    return {
      verdict: parsed.verdict as ReconcilerVerdictType,
      target_draft_id: parsed.verdict === 'INSERT_NEW' ? null : resolvedTargetId,
      reason: String(parsed.reason || 'Conciliado por DeepSeek Checker').trim(),
      fastPath: false,
      fallbackUsed: false,
    };
  } catch (err: any) {
    return {
      verdict: 'INSERT_NEW',
      target_draft_id: null,
      reason: `Fallback Fail-Open: ${err?.message || 'Error o timeout en DeepSeek'}`,
      fastPath: false,
      fallbackUsed: true,
    };
  }
}

// ============================================================================
// ESCENARIO 397: CLASIFICACIÓN TRIPARTITA DE CANAL & FUSIÓN POLIMÓRFICA
// ============================================================================

export type IngestChannel = 'channel_3_co' | 'channel_1_2_legacy';

const OFFICIAL_ORDERS_INBOXES = [
  'pedidos@frufresco.co',
  'copia.pedidos@frufresco.co',
  'pedidos@frufresco.com',
  'frufrescodigital@gmail.com',
  'e.copia@frufresco.com',
];

/**
 * Clasifica de forma determinista el canal de entrada de un payload hacia `/api/orders/email-ingest`.
 * Grieta #3 (Goldfish RFC): NUNCA clasificar como `channel_3_co` únicamente por `headers.to`,
 * porque un correo recibido en el puente Gmail (`frufrescodigital@gmail.com`, Canal 2) con
 * `To: pedidos@frufresco.co, pedidos@frufresco.com` proviene físicamente del puente heredado.
 */
export function resolveIngestChannel(payload: any): IngestChannel {
  if (!payload || typeof payload !== 'object') {
    return 'channel_1_2_legacy';
  }
  if (payload.ingestChannel === 'channel_3_co' || Boolean(payload.hostingerUid)) {
    return 'channel_3_co';
  }
  if (payload.ingestChannel === 'channel_1_2_legacy') {
    return 'channel_1_2_legacy';
  }

  const headers = payload.headers || {};
  const physicalDeliveryHeaders = [
    headers['delivered-to'],
    headers['Delivered-To'],
    headers['x-original-to'],
    headers['X-Original-To'],
    headers['envelope-to'],
    headers['Envelope-To'],
  ]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase());

  if (physicalDeliveryHeaders.some((h) => h.includes('@frufresco.co'))) {
    return 'channel_3_co';
  }

  return 'channel_1_2_legacy';
}

/**
 * Grieta #7 (Goldfish RFC): Resuelve el destinatario oficial de órdenes inspeccionando
 * `To`, `Cc`, `Delivered-To`, `X-Original-To` y `envelope.to`, priorizando los buzones oficiales
 * de pedidos cuando hay múltiples destinatarios o cuando el buzón de pedidos fue puesto en `Cc:`.
 */
export function resolvePrimaryRecipientEmail(headers: any, envelope: any, fallbackOrdersInbox?: string): string {
  const rawSources = [
    headers?.['delivered-to'],
    headers?.['Delivered-To'],
    headers?.['x-original-to'],
    headers?.['X-Original-To'],
    envelope?.to,
    headers?.to,
    headers?.To,
    headers?.cc,
    headers?.Cc,
  ]
    .filter(Boolean)
    .map((v) => String(v));

  const extractedEmails: string[] = [];
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

  for (const src of rawSources) {
    const matches = src.match(emailRegex);
    if (matches) {
      for (const m of matches) {
        const clean = m.trim().toLowerCase();
        if (clean && !extractedEmails.includes(clean)) {
          extractedEmails.push(clean);
        }
      }
    }
  }

  const dynamicOrders = fallbackOrdersInbox ? fallbackOrdersInbox.trim().toLowerCase() : '';
  const prioritySet = new Set([
    ...OFFICIAL_ORDERS_INBOXES,
    ...(dynamicOrders ? [dynamicOrders] : []),
  ]);

  const matchedPriority = extractedEmails.find((e) => prioritySet.has(e));
  if (matchedPriority) return matchedPriority;

  return extractedEmails[0] || '';
}

/**
 * Une y deduplica canales vistos (`seenInChannels`) garantizando orden canónico.
 */
export function mergeSeenChannels(
  ...channelSources: Array<IngestChannel | IngestChannel[] | string | string[] | null | undefined>
): IngestChannel[] {
  const set = new Set<IngestChannel>();
  for (const src of channelSources) {
    if (!src) continue;
    const list = Array.isArray(src) ? src : [src];
    for (const item of list) {
      if (item === 'channel_3_co' || item === 'channel_1_2_legacy') {
        set.add(item);
      }
    }
  }
  return Array.from(set);
}

/**
 * Grieta #1 (Goldfish RFC): Fusión polimórfica segura de `seenInChannels` tanto cuando
 * `matchedDraft.extracted_items` ya es un Array (procesado por Gemini) como cuando aún es un
 * Objeto `{ debug_payload }` en estado `[RAW_WEBHOOK]` en vuelo.
 */
export async function appendChannelToDraftRecord(
  supabaseAdmin: any,
  matchedDraft: any,
  incomingChannel: IngestChannel,
  action: string,
  absorbedFrom?: string
): Promise<void> {
  if (!supabaseAdmin || !matchedDraft?.id) return;

  try {
    const rawExtracted = matchedDraft.extracted_items;
    const nowIso = new Date().toISOString();

    // Caso A: `extracted_items` es un Array (borrador ya estructurado por Gemini)
    if (Array.isArray(rawExtracted)) {
      const updatedItems = [...rawExtracted];
      const metaIdx = updatedItems.findIndex((x: any) => x && x.isMetadata);
      if (metaIdx >= 0) {
        const currentMeta = updatedItems[metaIdx] || {};
        const mergedChannels = mergeSeenChannels(
          currentMeta.seenInChannels,
          currentMeta.ingestChannel,
          incomingChannel
        );
        const prevLogs = Array.isArray(currentMeta.reconcilerLog) ? currentMeta.reconcilerLog : [];
        updatedItems[metaIdx] = {
          ...currentMeta,
          ingestChannel: currentMeta.ingestChannel || mergedChannels[0] || incomingChannel,
          seenInChannels: mergedChannels,
          reconcilerLog: [
            ...prevLogs,
            {
              timestamp: nowIso,
              action,
              channel: incomingChannel,
              absorbed_from: absorbedFrom || null,
            },
          ],
        };
      } else {
        updatedItems.unshift({
          isMetadata: true,
          ingestChannel: incomingChannel,
          seenInChannels: [incomingChannel],
          reconcilerLog: [
            {
              timestamp: nowIso,
              action,
              channel: incomingChannel,
              absorbed_from: absorbedFrom || null,
            },
          ],
        });
      }

      await supabaseAdmin
        .from('order_drafts')
        .update({ extracted_items: updatedItems })
        .eq('id', matchedDraft.id);
      return;
    }

    // Caso B: `extracted_items` es un Objeto (`[RAW_WEBHOOK]` en vuelo mientras Gemini procesa)
    if (rawExtracted && typeof rawExtracted === 'object') {
      const mergedChannels = mergeSeenChannels(
        rawExtracted.seenInChannels,
        rawExtracted.ingestChannel,
        incomingChannel
      );
      const prevLogs = Array.isArray(rawExtracted.reconcilerLog) ? rawExtracted.reconcilerLog : [];
      const updatedObj = {
        ...rawExtracted,
        ingestChannel: rawExtracted.ingestChannel || mergedChannels[0] || incomingChannel,
        seenInChannels: mergedChannels,
        reconcilerLog: [
          ...prevLogs,
          {
            timestamp: nowIso,
            action,
            channel: incomingChannel,
            absorbed_from: absorbedFrom || null,
          },
        ],
      };

      await supabaseAdmin
        .from('order_drafts')
        .update({ extracted_items: updatedObj })
        .eq('id', matchedDraft.id);
    }
  } catch (err: any) {
    console.warn(`[Escenario 397] Warning appending channel to draft ${matchedDraft?.id}:`, err?.message || err);
  }
}

