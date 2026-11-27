import type { SupabaseClient } from '@supabase/supabase-js';
import { addBogotaDays, getBogotaDateString } from '@/lib/dateUtils';
import {
  computeFrequencyRadar,
  fetchOrdersWindowPaginated,
  type DraftExtractedItemLike,
  type FrequencyRadarDraftInput,
  type FrequencyRadarOrderInput,
  type FrequencyRadarProfileInput,
  type FrequencyRadarResult,
} from './frequencyEngine';
import {
  hasExplicitNumericDate,
  resolveExplicitRelativeDeliveryDate,
  stripQuotedEmailHistory,
} from './bogotaDateParser';

export interface OrdersCopilotContext {
  targetDate: string;
  generatedAtBogota: string;
  lastDraftReceivedAt: string | null;
  lastDraftReceivedAtBogota: string | null;
  radar: FrequencyRadarResult;
  stats: {
    ordersForTargetDate: number;
    pendingApprovalCount: number;
    paraCompraCount: number;
    zeroSplitCount: number;
    recentOtherDateOrdersCount: number;
    recentDraftsCount: number;
    pendingDraftsCount: number;
    dateDiscrepancyCount: number;
    urgentAnomalies: number;
    totalAnomalies: number;
  };
  promptText: string;
}

interface CopilotDraftRow extends FrequencyRadarDraftInput {
  email_body?: string | null;
  order_id?: string | null;
}

interface JoinedProductRef {
  accounting_id?: number | null;
  name?: string | null;
  unit_of_measure?: string | null;
}

interface OrderItemJoinRow {
  quantity: number;
  unit: string | null;
  unit_price: number;
  variant_label: string | null;
  nickname: string | null;
  products: JoinedProductRef | JoinedProductRef[] | null;
}

function formatBogotaTimestamp(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function getDraftMeta(draft: CopilotDraftRow): DraftExtractedItemLike {
  const items = Array.isArray(draft.extracted_items) ? draft.extracted_items : [];
  return items.find(i => Boolean(i && i.isMetadata)) || {};
}

function resolveDraftOrderId(draft: CopilotDraftRow, meta: DraftExtractedItemLike): string | null {
  if (meta.orderId) return String(meta.orderId);
  if (meta.order_id) return String(meta.order_id);
  if (Array.isArray(meta.attachments)) {
    for (const att of meta.attachments) {
      if (att?.orderId) return String(att.orderId);
      if (att?.order_id) return String(att.order_id);
    }
  }
  return draft.order_id ? String(draft.order_id) : null;
}

function compareOrdersDesc(a: FrequencyRadarOrderInput, b: FrequencyRadarOrderInput): number {
  const dA = String(a.delivery_date || '').slice(0, 10);
  const dB = String(b.delivery_date || '').slice(0, 10);
  if (dA !== dB) return dB.localeCompare(dA);
  return String(b.created_at || '').localeCompare(String(a.created_at || ''));
}

export interface DraftDateDiscrepancy {
  draftId: string;
  clientLabel: string;
  orderTag: string;
  subject: string;
  matchedPhrase: string;
  expectedDate: string;
  savedDate: string;
}

/**
 * Pure deterministic [DISCREPANCIA_FECHA] detector shared by context builder and unit tests.
 */
export function detectDraftDateDiscrepancies(params: {
  recentDrafts: CopilotDraftRow[];
  ordersById: Map<string, FrequencyRadarOrderInput>;
  now?: Date;
}): DraftDateDiscrepancy[] {
  const { recentDrafts, ordersById, now = new Date() } = params;
  const out: DraftDateDiscrepancy[] = [];

  for (const d of recentDrafts) {
    if (String(d.status || '').toLowerCase() === 'rejected') continue;
    const subject = String(d.email_subject || '');
    const cleanBodyFirstBlock = stripQuotedEmailHistory(String(d.email_body || ''));
    if (hasExplicitNumericDate(subject) || hasExplicitNumericDate(cleanBodyFirstBlock)) continue;

    const refDate = d.created_at ? new Date(d.created_at) : now;
    const rel = resolveExplicitRelativeDeliveryDate(`${subject}\n${cleanBodyFirstBlock}`, refDate);
    if (!rel) continue;

    const explicitSameDay = /\b(para\s+hoy|entrega\s+hoy|mismo\s+d[ií]a|hoy\s+mismo|despacho\s+hoy)\b/i.test(
      `${subject}\n${cleanBodyFirstBlock}`
    );
    if (rel.isSameDay && !explicitSameDay) continue;

    const meta = getDraftMeta(d);
    const linkedOrderId = resolveDraftOrderId(d, meta);
    const linkedOrder = linkedOrderId ? ordersById.get(linkedOrderId) : undefined;
    const savedDate = linkedOrder?.delivery_date
      ? String(linkedOrder.delivery_date).slice(0, 10)
      : meta.deliveryDate
      ? String(meta.deliveryDate).slice(0, 10)
      : null;

    if (savedDate && savedDate !== rel.date) {
      const orderTag = linkedOrder
        ? `Pedido #${linkedOrder.sequence_id} [${linkedOrder.status}]`
        : `Borrador [${d.status}]`;
      out.push({
        draftId: d.id,
        clientLabel: d.client_detected_name || d.source_email || 'Cliente',
        orderTag,
        subject,
        matchedPhrase: rel.matchedPhrase,
        expectedDate: rel.date,
        savedDate,
      });
    }
  }

  return out;
}

/**
 * 100% server-side deterministic context assembler for the Orders & Emails AI Copilot (SECOP §62 + Escenario 504 v2).
 * Never trusts client-supplied operational data; reads strictly from Supabase.
 */
export async function buildOrdersCopilotContext(params: {
  supabaseAdmin: SupabaseClient;
  targetDate?: string;
  focusQuery?: string;
}): Promise<OrdersCopilotContext> {
  const { supabaseAdmin, focusQuery = '' } = params;
  const now = new Date();
  const targetDate =
    params.targetDate && /^\d{4}-\d{2}-\d{2}$/.test(params.targetDate)
      ? params.targetDate
      : getBogotaDateString(now);

  const histStart = addBogotaDays(targetDate, -56);
  const cutoff48hIso = new Date(now.getTime() - 48 * 3600 * 1000).toISOString();
  const cutoff36hIso = new Date(now.getTime() - 36 * 3600 * 1000).toISOString();

  const [profilesRes, allOrders, draftsRes, latestDraftRes] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, company_name, contact_name, email, role, is_active, logistics_data')
      .eq('role', 'b2b_client')
      .eq('is_active', true),
    fetchOrdersWindowPaginated(
      supabaseAdmin,
      histStart,
      'id, sequence_id, profile_id, status, delivery_date, created_at, total, total_weight_kg, origin_source, purchase_order_number, warehouse_spaces, logistics_data'
    ),
    supabaseAdmin
      .from('order_drafts')
      .select('id, profile_id, client_detected_name, source_email, email_subject, email_body, status, created_at, extracted_items')
      .gte('created_at', cutoff48hIso)
      .order('created_at', { ascending: false })
      .limit(150),
    supabaseAdmin
      .from('order_drafts')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const profiles = (profilesRes.data || []) as FrequencyRadarProfileInput[];
  const recentDrafts = (draftsRes.data || []) as CopilotDraftRow[];
  const profileMap = new Map<string, FrequencyRadarProfileInput>(profiles.map(p => [p.id, p]));
  const ordersById = new Map<string, FrequencyRadarOrderInput>(allOrders.map(o => [o.id, o]));

  const lastDraftReceivedAt: string | null = latestDraftRes.data?.created_at || null;
  const lastDraftReceivedAtBogota = lastDraftReceivedAt ? formatBogotaTimestamp(lastDraftReceivedAt) : null;

  const radar = computeFrequencyRadar({
    targetDate,
    profiles,
    recentOrders: allOrders,
    recentDrafts,
    now,
  });

  const targetOrders = allOrders.filter(
    o => String(o.delivery_date || '').slice(0, 10) === targetDate
  );

  const byStatus: Record<string, number> = {};
  let zeroSplitCount = 0;
  let missingSpacesCount = 0;
  for (const o of targetOrders) {
    const st = String(o.status || 'unknown');
    byStatus[st] = (byStatus[st] || 0) + 1;
    if (o.logistics_data?.is_off_agreement_split) zeroSplitCount++;
    if (!Array.isArray(o.warehouse_spaces) || o.warehouse_spaces.length === 0) missingSpacesCount++;
  }

  const recentOtherDateOrders = allOrders
    .filter(
      o =>
        (o.created_at || '') >= cutoff36hIso &&
        String(o.delivery_date || '').slice(0, 10) !== targetDate
    )
    .sort(compareOrdersDesc);

  const pendingDrafts = recentDrafts.filter(d => String(d.status || '').toLowerCase() === 'pending');

  // Preload linked orderIds missing from allOrders (e.g. cancelled or outside 56d)
  const missingOrderIdsToFetch: string[] = [];
  for (const d of recentDrafts) {
    if (String(d.status || '').toLowerCase() === 'rejected') continue;
    const meta = getDraftMeta(d);
    const linkedOrderId = resolveDraftOrderId(d, meta);
    if (linkedOrderId && !ordersById.has(linkedOrderId)) {
      missingOrderIdsToFetch.push(linkedOrderId);
    }
  }
  if (missingOrderIdsToFetch.length > 0) {
    const { data: extraOrders } = await supabaseAdmin
      .from('orders')
      .select('id, sequence_id, status, delivery_date')
      .in('id', [...new Set(missingOrderIdsToFetch)]);
    for (const eo of (extraOrders || []) as FrequencyRadarOrderInput[]) {
      ordersById.set(eo.id, eo);
    }
  }

  const dateDiscrepancies = detectDraftDateDiscrepancies({
    recentDrafts,
    ordersById,
    now,
  }).map(
    disc =>
      `- [DISCREPANCIA_FECHA] ${disc.clientLabel} | ${disc.orderTag} | asunto="${disc.subject}" | texto dice "${disc.matchedPhrase}" (esperado ${disc.expectedDate}) pero quedó en ${disc.savedDate}`
  );

  // Dynamic focus matching: STRICT explicit `#` for sequence_id (`/#(\d{3,8})\b/g`) + client name tokens
  const cleanFocus = focusQuery.trim().toLowerCase();
  const seqMatches = [...cleanFocus.matchAll(/#(\d{3,8})\b/g)].map(m => Number(m[1])).slice(0, 2);
  const focusLines: string[] = [];

  if (seqMatches.length > 0) {
    for (const seqNum of seqMatches) {
      let oHit = allOrders.find(o => o.sequence_id === seqNum);
      if (!oHit) {
        const { data: directOrder } = await supabaseAdmin
          .from('orders')
          .select('id, sequence_id, profile_id, status, delivery_date, created_at, total, total_weight_kg, origin_source, purchase_order_number')
          .eq('sequence_id', seqNum)
          .maybeSingle();
        if (directOrder) oHit = directOrder as FrequencyRadarOrderInput;
      }
      if (oHit) {
        const prof = profileMap.get(oHit.profile_id || '');
        focusLines.push(
          `PEDIDO FOCAL #${oHit.sequence_id}: cliente="${prof?.company_name || oHit.profile_id || 'Cliente'}", estado=${oHit.status}, delivery_date=${oHit.delivery_date}, creado=${formatBogotaTimestamp(oHit.created_at)}, origen=${oHit.origin_source}, total=$${oHit.total}, kg=${oHit.total_weight_kg}, OC="${oHit.purchase_order_number || ''}"`
        );
        const { data: items, count } = await supabaseAdmin
          .from('order_items')
          .select('quantity, unit, unit_price, variant_label, nickname, products(accounting_id, name, unit_of_measure)', { count: 'exact' })
          .eq('order_id', oHit.id)
          .limit(40);
        const typedItems = (items || []) as OrderItemJoinRow[];
        if (typedItems.length > 0) {
          const itemStrs = typedItems.map(it => {
            const p = Array.isArray(it.products) ? it.products[0] : it.products;
            const aid = p?.accounting_id ? `#${p.accounting_id}` : '#S/N';
            const name = p?.name || it.nickname || 'Producto';
            const unit = it.unit || p?.unit_of_measure || '';
            return `${aid} ${name} (${it.quantity} ${unit}${it.variant_label ? ` ${it.variant_label}` : ''}) $${it.unit_price}`;
          });
          focusLines.push(
            `  LÍNEAS DE #${oHit.sequence_id} (mostrando ${typedItems.length} de ${count ?? typedItems.length} ítems): ${itemStrs.join(' | ')}`
          );
        }
      }
    }
  }

  if (cleanFocus.length >= 3) {
    const tokens = cleanFocus
      .replace(/[#¿?¡!.,]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 3 && !['para', 'ayer', 'hoy', 'pedido', 'pedidos', 'correo', 'correos', 'quien', 'quienes', 'estado', 'paso', 'que', 'trae', 'tiene'].includes(t));

    const matchedProfiles = profiles.filter(p => {
      const hay = `${p.company_name || ''} ${p.contact_name || ''} ${p.email || ''}`.toLowerCase();
      return tokens.some(t => hay.includes(t));
    });

    for (const mp of matchedProfiles.slice(0, 3)) {
      const mpOrders = allOrders
        .filter(o => o.profile_id === mp.id)
        .sort(compareOrdersDesc)
        .slice(0, 5)
        .map(o => `#${o.sequence_id} [${o.status}] entrega=${o.delivery_date} creado=${formatBogotaTimestamp(o.created_at)} $${o.total}`);
      const mpDrafts = recentDrafts
        .filter(d => d.profile_id === mp.id)
        .slice(0, 5)
        .map(d => {
          const m = getDraftMeta(d);
          const snippet = String(d.email_body || '').replace(/\s+/g, ' ').slice(0, 150);
          return `borrador=${d.id.slice(0, 8)} [${d.status}] asunto="${d.email_subject}" fecha_ext=${m.deliveryDate || 'null'} recibido=${formatBogotaTimestamp(d.created_at)} texto="${snippet}"`;
        });
      focusLines.push(
        `SEDE FOCAL "${mp.company_name}" (email=${mp.email || 'N/A'}, dias_config=${JSON.stringify(mp.logistics_data?.allowed_days || mp.logistics_data?.days || [])}):\n  Pedidos recientes: ${mpOrders.join(' | ') || 'Ninguno'}\n  Borradores 48h: ${mpDrafts.join(' | ') || 'Ninguno'}`
      );
    }
  }

  const lines: string[] = [
    `=== SNAPSHOT OPERATIVO PEDIDOS Y CORREOS (FECHA OBJETIVO: ${targetDate} - ${radar.weekdayName.toUpperCase()}) ===`,
    `Generado (Bogotá): ${formatBogotaTimestamp(now.toISOString())} | Último borrador ingerido en Supabase (Bogotá): ${lastDraftReceivedAtBogota || 'Sin registros'}`,
    `1) PEDIDOS PARA ${targetDate}: total=${targetOrders.length} | por_estado=${JSON.stringify(byStatus)} | splits_$0=${zeroSplitCount} | sin_espacio_bodega=${missingSpacesCount}`,
    `2) RADAR DE FRECUENCIAS v2 (progresivo hasta 8 sem, $0): habituales=${radar.summary.habitualCount} | cubiertos=${radar.summary.coveredCount} | urgentes=${radar.summary.urgentAnomaliesCount} (otra_fecha=${radar.summary.otherDateAnomalyCount}, borrador_atascado=${radar.summary.stuckDraftCount}, vencidos_30m=${radar.summary.overdueSilentMissingCount}) | en_ventana=${radar.summary.inWindowCount}`,
  ];

  if (dateDiscrepancies.length > 0) {
    lines.push(`3) ALERTAS DETERMINÍSTICAS [DISCREPANCIA_FECHA] (${dateDiscrepancies.length}):`);
    lines.push(...dateDiscrepancies.slice(0, 15));
  }

  if (radar.anomalies.length > 0) {
    lines.push('4) DETALLE ANOMALÍAS RADAR (Top 25):');
    for (const a of radar.anomalies.slice(0, 25)) {
      if (a.status === 'other_date_anomaly' && a.otherDateOrder) {
        lines.push(`   - [OTRA_FECHA] ${a.clientName}: habitual=${a.expectedReason}, pero #${a.otherDateOrder.sequenceId} quedó para ${a.otherDateOrder.deliveryDate} [${a.otherDateOrder.status}]`);
      } else if (a.status === 'stuck_draft' && a.pendingDraft) {
        lines.push(`   - [BORRADOR_PENDIENTE] ${a.clientName}: asunto="${a.pendingDraft.subject}" fecha=${a.pendingDraft.extractedDeliveryDate || 'sin_fecha'} recibido=${formatBogotaTimestamp(a.pendingDraft.createdAt)}`);
      } else if (a.isOverdue) {
        lines.push(`   - [FALTA_POR_PEDIR_VENCIDO] ${a.clientName}: ${a.expectedReason} | hora_habitual=${a.avgOrderTimeBogota || 'N/D'}`);
      } else {
        lines.push(`   - [EN_VENTANA] ${a.clientName}: ${a.expectedReason} | hora_habitual=${a.avgOrderTimeBogota || 'N/D'}`);
      }
    }
  }

  if (recentOtherDateOrders.length > 0) {
    lines.push(`5) PEDIDOS CREADOS ÚLTIMAS 36H PARA OTRA FECHA (!= ${targetDate}) [Top 15]:`);
    for (const o of recentOtherDateOrders.slice(0, 15)) {
      const prof = profileMap.get(o.profile_id || '');
      lines.push(`   - #${o.sequence_id} | ${prof?.company_name || prof?.contact_name || 'Cliente'} | entrega=${o.delivery_date} | estado=${o.status} | creado=${formatBogotaTimestamp(o.created_at)} | origen=${o.origin_source}`);
    }
  }

  lines.push(`6) BANDEJA CORREOS ÚLTIMAS 48H (total=${recentDrafts.length}, pendientes=${pendingDrafts.length}) [Top 15]:`);
  for (const d of recentDrafts.slice(0, 15)) {
    const m = getDraftMeta(d);
    const snippet = String(d.email_body || '').replace(/\s+/g, ' ').slice(0, 130);
    lines.push(`   - [${d.status}] ${d.client_detected_name || d.source_email} | asunto="${d.email_subject}" | fecha_ext=${m.deliveryDate || 'null'} | recibido=${formatBogotaTimestamp(d.created_at)} | "${snippet}"`);
  }

  if (focusLines.length > 0) {
    lines.push('7) FOCO DINÁMICO SOLICITADO:');
    lines.push(...focusLines);
  }

  return {
    targetDate,
    generatedAtBogota: formatBogotaTimestamp(now.toISOString()),
    lastDraftReceivedAt,
    lastDraftReceivedAtBogota,
    radar,
    stats: {
      ordersForTargetDate: targetOrders.length,
      pendingApprovalCount: byStatus['pending_approval'] || 0,
      paraCompraCount: byStatus['para_compra'] || 0,
      zeroSplitCount,
      recentOtherDateOrdersCount: recentOtherDateOrders.length,
      recentDraftsCount: recentDrafts.length,
      pendingDraftsCount: pendingDrafts.length,
      dateDiscrepancyCount: dateDiscrepancies.length,
      urgentAnomalies: radar.summary.urgentAnomaliesCount,
      totalAnomalies: radar.summary.totalAnomalies,
    },
    promptText: lines.join('\n'),
  };
}
