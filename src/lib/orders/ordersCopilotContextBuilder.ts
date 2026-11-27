import type { SupabaseClient } from '@supabase/supabase-js';
import {
  addBogotaDays,
  diffBogotaDays,
  getBogotaDateString,
  getBogotaDayRangeUtcIso,
  parseBogotaDate,
} from '@/lib/dateUtils';
import {
  computeFrequencyRadar,
  fetchOrdersWindowPaginated,
  type DraftExtractedItemLike,
  type FrequencyRadarDraftInput,
  type FrequencyRadarEntry,
  type FrequencyRadarOrderInput,
  type FrequencyRadarProfileInput,
  type FrequencyRadarResult,
} from './frequencyEngine';
import {
  hasExplicitNumericDate,
  resolveExplicitRelativeDeliveryDate,
  stripQuotedEmailHistory,
} from './bogotaDateParser';

const GENERAL_INSTITUCIONAL_ID = 'd90a91e5-827c-473d-9d4f-3e28c7c91e15';
const CLIENTES_HOGAR_ID = 'f7043ca1-94d5-4d25-bd10-fbf30ce120ee';
const HEADER_CACHE_TTL_MS = 120_000;
const MAX_PROMPT_CHARS = 22_000;

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
    // Additive v3 KPIs
    todayOrdersCount?: number;
    todayDraftsTotal?: number;
    todayDraftsApproved?: number;
    todayDraftsPending?: number;
    todayDraftsRejected?: number;
    duplicateAlertsCount?: number;
    futureOrdersCount?: number;
  };
  promptText: string;
}

interface ExtendedProfileInput extends FrequencyRadarProfileInput {
  parent_id?: string | null;
  pricing_model_id?: string | null;
}

interface ExtendedOrderInput extends FrequencyRadarOrderInput {}

interface CopilotDraftRow extends FrequencyRadarDraftInput {
  email_body?: string | null;
}

interface JoinedProductRef {
  accounting_id?: number | null;
  name?: string | null;
  unit_of_measure?: string | null;
}

interface OrderItemJoinRow {
  product_id?: string | null;
  quantity: number;
  unit: string | null;
  unit_price: number;
  variant_label: string | null;
  nickname: string | null;
  products: JoinedProductRef | JoinedProductRef[] | null;
}

interface QuoteHeaderRow {
  id: string;
  client_id: string | null;
  client_name: string | null;
  quote_number: string | null;
  start_date: string | null;
  valid_until: string | null;
  model_snapshot_name: string | null;
  status: string;
}

interface SpecialModelRow {
  id: string;
  name: string | null;
  master_quote_id: string | null;
  start_date: string | null;
  valid_until: string | null;
}

interface SpecialModelClientRow {
  model_id: string;
  client_id: string;
}

interface PricingModelRow {
  id: string;
  name: string;
  start_date?: string | null;
  end_date?: string | null;
}

interface AgreementsHeaderSnapshot {
  quotes: QuoteHeaderRow[];
  specialModels: SpecialModelRow[];
  modelClients: SpecialModelClientRow[];
  pricingModels: PricingModelRow[];
  fetchedAt: number;
}

let cachedAgreementsHeader: AgreementsHeaderSnapshot | null = null;

async function getAgreementsHeaderSnapshot(supabaseAdmin: SupabaseClient): Promise<AgreementsHeaderSnapshot> {
  const nowMs = Date.now();
  if (cachedAgreementsHeader && nowMs - cachedAgreementsHeader.fetchedAt < HEADER_CACHE_TTL_MS) {
    return cachedAgreementsHeader;
  }

  const [qRes, smRes, smcRes, pmRes] = await Promise.all([
    supabaseAdmin
      .from('quotes')
      .select('id, client_id, client_name, quote_number, start_date, valid_until, model_snapshot_name, status')
      .in('status', ['agreement', 'expired']),
    supabaseAdmin
      .from('special_agreement_models')
      .select('id, name, master_quote_id, start_date, valid_until'),
    supabaseAdmin
      .from('special_agreement_model_clients')
      .select('model_id, client_id'),
    supabaseAdmin
      .from('pricing_models')
      .select('id, name, start_date, end_date'),
  ]);

  cachedAgreementsHeader = {
    quotes: (qRes.data || []) as QuoteHeaderRow[],
    specialModels: (smRes.data || []) as SpecialModelRow[],
    modelClients: (smcRes.data || []) as SpecialModelClientRow[],
    pricingModels: (pmRes.data || []) as PricingModelRow[],
    fetchedAt: nowMs,
  };
  return cachedAgreementsHeader;
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

function formatCop(amount: number | null | undefined): string {
  return `$${Math.round(Number(amount || 0)).toLocaleString('es-CO')}`;
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
  return null;
}

function compareOrdersDesc(a: FrequencyRadarOrderInput, b: FrequencyRadarOrderInput): number {
  const dA = String(a.delivery_date || '').slice(0, 10);
  const dB = String(b.delivery_date || '').slice(0, 10);
  if (dA !== dB) return dB.localeCompare(dA);
  return String(b.created_at || '').localeCompare(String(a.created_at || ''));
}

function getNextOperationalDate(dateStr: string): string {
  const next1 = addBogotaDays(dateStr, 1);
  if (parseBogotaDate(next1).getDay() === 0) {
    return addBogotaDays(next1, 1);
  }
  return next1;
}

function getOrderClientLabel(
  order: ExtendedOrderInput,
  profileMap: Map<string, ExtendedProfileInput>
): string {
  const prof = order.profile_id ? profileMap.get(order.profile_id) : undefined;
  return (
    prof?.company_name ||
    prof?.contact_name ||
    (order.profile_id ? order.profile_id.slice(0, 8) : 'Cliente Hogar')
  );
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

interface ResolvedAgreementInfo {
  quote: QuoteHeaderRow;
  level: 'SEDE' | 'MATRIZ' | 'MAESTRO';
  effectiveStart: string | null;
  effectiveUntil: string | null;
  lifecycleState: 'VIGENTE' | 'POR_VENCER' | 'VENCIDO_GRACIA' | 'VENCIDO_CRITICO';
  daysRemaining: number | null;
}

function buildAgreementResolver(headerSnap: AgreementsHeaderSnapshot, todayBogota: string) {
  const modelByMasterQuote = new Map<string, SpecialModelRow>();
  const modelById = new Map<string, SpecialModelRow>();
  for (const sm of headerSnap.specialModels) {
    modelById.set(sm.id, sm);
    if (sm.master_quote_id) modelByMasterQuote.set(sm.master_quote_id, sm);
  }

  const clientToMasterQuotes = new Map<string, string[]>();
  for (const link of headerSnap.modelClients) {
    const m = modelById.get(link.model_id);
    if (!m?.master_quote_id) continue;
    const arr = clientToMasterQuotes.get(link.client_id) || [];
    arr.push(m.master_quote_id);
    clientToMasterQuotes.set(link.client_id, arr);
  }

  const quoteById = new Map<string, QuoteHeaderRow>(headerSnap.quotes.map(q => [q.id, q]));
  const quoteByClient = new Map<string, QuoteHeaderRow>();
  // Prefer 'agreement' over 'expired'
  const sortedQuotes = [...headerSnap.quotes].sort((a, b) => {
    if (a.status === b.status) return String(b.valid_until || '').localeCompare(String(a.valid_until || ''));
    return a.status === 'agreement' ? -1 : 1;
  });
  for (const q of sortedQuotes) {
    if (q.client_id && !quoteByClient.has(q.client_id)) {
      quoteByClient.set(q.client_id, q);
    }
  }

  function enrichDates(q: QuoteHeaderRow): { effectiveStart: string | null; effectiveUntil: string | null } {
    const sm = modelByMasterQuote.get(q.id);
    const effectiveStart = sm?.start_date || q.start_date || null;
    let effectiveUntil = q.valid_until || null;
    if (sm?.valid_until && (!effectiveUntil || sm.valid_until >= effectiveUntil)) {
      effectiveUntil = sm.valid_until;
    }
    return { effectiveStart, effectiveUntil };
  }

  function classify(q: QuoteHeaderRow, level: 'SEDE' | 'MATRIZ' | 'MAESTRO'): ResolvedAgreementInfo {
    const { effectiveStart, effectiveUntil } = enrichDates(q);
    let daysRemaining: number | null = null;
    let lifecycleState: ResolvedAgreementInfo['lifecycleState'] = 'VIGENTE';

    if (effectiveUntil && /^\d{4}-\d{2}-\d{2}$/.test(effectiveUntil)) {
      daysRemaining = diffBogotaDays(todayBogota, effectiveUntil);
      if (daysRemaining < -30) {
        lifecycleState = 'VENCIDO_CRITICO';
      } else if (daysRemaining < 0) {
        lifecycleState = 'VENCIDO_GRACIA';
      } else if (daysRemaining <= 5) {
        lifecycleState = 'POR_VENCER';
      }
    } else if (q.status === 'expired') {
      lifecycleState = 'VENCIDO_CRITICO';
    }

    return { quote: q, level, effectiveStart, effectiveUntil, lifecycleState, daysRemaining };
  }

  function resolveForProfile(
    profileId: string | null | undefined,
    profileMap: Map<string, ExtendedProfileInput>
  ): ResolvedAgreementInfo | null {
    if (!profileId) return null;
    const prof = profileMap.get(profileId);
    const parentProf = prof?.parent_id ? profileMap.get(prof.parent_id) : undefined;

    if (quoteByClient.has(profileId)) {
      return classify(quoteByClient.get(profileId)!, 'SEDE');
    }
    if (prof?.parent_id && quoteByClient.has(prof.parent_id)) {
      return classify(quoteByClient.get(prof.parent_id)!, 'MATRIZ');
    }

    const masterCandidates = [
      typeof prof?.logistics_data?.active_master_agreement_id === 'string'
        ? prof.logistics_data.active_master_agreement_id
        : null,
      typeof parentProf?.logistics_data?.active_master_agreement_id === 'string'
        ? parentProf.logistics_data.active_master_agreement_id
        : null,
      ...(clientToMasterQuotes.get(profileId) || []),
      ...(prof?.parent_id ? clientToMasterQuotes.get(prof.parent_id) || [] : []),
    ].filter((v): v is string => Boolean(v));

    for (const mqId of masterCandidates) {
      const mq = quoteById.get(mqId);
      if (mq) return classify(mq, 'MAESTRO');
    }
    return null;
  }

  return { resolveForProfile, classify, quoteById };
}

/**
 * 100% server-side deterministic context assembler for Orders, Emails & Agreements Copilot v3.
 * Never trusts client-supplied operational data; reads strictly from Supabase.
 */
export async function buildOrdersCopilotContext(params: {
  supabaseAdmin: SupabaseClient;
  targetDate?: string;
  focusQuery?: string;
}): Promise<OrdersCopilotContext> {
  const { supabaseAdmin, focusQuery = '' } = params;
  const now = new Date();
  const todayBogota = getBogotaDateString(now);
  const yesterdayBogota = addBogotaDays(todayBogota, -1);

  const targetDate =
    params.targetDate && /^\d{4}-\d{2}-\d{2}$/.test(params.targetDate)
      ? params.targetDate
      : todayBogota;

  const nextOperationalDate = getNextOperationalDate(targetDate);
  const baseHistDate = todayBogota < targetDate ? todayBogota : targetDate;
  const histStart = addBogotaDays(baseHistDate, -56);

  const draftsWindowStartUtc = getBogotaDayRangeUtcIso(yesterdayBogota).startUtcIso;
  const draftsWindowEndUtc = getBogotaDayRangeUtcIso(todayBogota).endUtcIso;
  const cutoff36hIso = new Date(now.getTime() - 36 * 3600 * 1000).toISOString();

  const [profilesRes, allOrdersRaw, draftsRes, latestDraftRes, headerSnap] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, company_name, contact_name, email, role, is_active, logistics_data, parent_id, pricing_model_id'),
    fetchOrdersWindowPaginated(
      supabaseAdmin,
      histStart,
      'id, sequence_id, profile_id, status, delivery_date, created_at, total, total_weight_kg, origin_source, purchase_order_number, warehouse_spaces, logistics_data'
    ),
    supabaseAdmin
      .from('order_drafts')
      .select('id, profile_id, client_detected_name, source_email, email_subject, email_body, status, created_at, extracted_items')
      .gte('created_at', draftsWindowStartUtc)
      .lte('created_at', draftsWindowEndUtc)
      .order('created_at', { ascending: false })
      .limit(300),
    supabaseAdmin
      .from('order_drafts')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    getAgreementsHeaderSnapshot(supabaseAdmin),
  ]);

  const allProfiles = (profilesRes.data || []) as ExtendedProfileInput[];
  const b2bActiveProfiles = allProfiles.filter(p => p.role === 'b2b_client' && p.is_active === true);
  const allOrders = allOrdersRaw as ExtendedOrderInput[];
  const recentDrafts = (draftsRes.data || []) as CopilotDraftRow[];

  const profileMap = new Map<string, ExtendedProfileInput>(allProfiles.map(p => [p.id, p]));
  const ordersById = new Map<string, ExtendedOrderInput>(allOrders.map(o => [o.id, o]));

  const lastDraftReceivedAt: string | null = latestDraftRes.data?.created_at || null;
  const lastDraftReceivedAtBogota = lastDraftReceivedAt ? formatBogotaTimestamp(lastDraftReceivedAt) : null;

  // 1. Multi-day Frequency Radar in memory ($0 extra DB)
  const radar = computeFrequencyRadar({
    targetDate,
    profiles: b2bActiveProfiles,
    recentOrders: allOrders,
    recentDrafts,
    now,
  });
  const radarToday =
    todayBogota !== targetDate
      ? computeFrequencyRadar({ targetDate: todayBogota, profiles: b2bActiveProfiles, recentOrders: allOrders, recentDrafts, now })
      : null;
  const radarNextOp =
    nextOperationalDate !== targetDate && nextOperationalDate !== todayBogota
      ? computeFrequencyRadar({ targetDate: nextOperationalDate, profiles: b2bActiveProfiles, recentOrders: allOrders, recentDrafts, now })
      : null;

  // Historical avg ticket (8 weeks) per profile
  const ticketStatsByProfile = new Map<string, { sum: number; count: number }>();
  for (const o of allOrders) {
    if (!o.profile_id || Number(o.total || 0) <= 0 || o.logistics_data?.is_off_agreement_split) continue;
    const cur = ticketStatsByProfile.get(o.profile_id) || { sum: 0, count: 0 };
    cur.sum += Number(o.total || 0);
    cur.count += 1;
    ticketStatsByProfile.set(o.profile_id, cur);
  }
  const getAvgTicket = (pid: string): number => {
    const s = ticketStatsByProfile.get(pid);
    return s && s.count > 0 ? Math.round(s.sum / s.count) : 0;
  };

  // 2. Scoped orders: targetDate, todayBogota, futures (next 30d)
  const futureLimitDate = addBogotaDays(targetDate, 30);
  const targetOrders = allOrders.filter(o => String(o.delivery_date || '').slice(0, 10) === targetDate);
  const todayOrders =
    todayBogota === targetDate
      ? targetOrders
      : allOrders.filter(o => String(o.delivery_date || '').slice(0, 10) === todayBogota);
  const futureOrders = allOrders
    .filter(o => {
      const dd = String(o.delivery_date || '').slice(0, 10);
      return dd > targetDate && dd <= futureLimitDate;
    })
    .sort(compareOrdersDesc);

  const scopedOrderIds = [...new Set([...todayOrders, ...targetOrders, ...futureOrders].map(o => o.id))];

  // 1 bounded query for $0 items inside scoped orders
  const zeroItemOrderIds = new Set<string>();
  const zeroItemCountByOrder = new Map<string, number>();
  if (scopedOrderIds.length > 0) {
    const { data: zeroItems } = await supabaseAdmin
      .from('order_items')
      .select('order_id')
      .in('order_id', scopedOrderIds.slice(0, 300))
      .eq('unit_price', 0);
    for (const zi of (zeroItems || []) as Array<{ order_id: string }>) {
      zeroItemOrderIds.add(zi.order_id);
      zeroItemCountByOrder.set(zi.order_id, (zeroItemCountByOrder.get(zi.order_id) || 0) + 1);
    }
  }

  // 3. Exact Email Inbox breakdown (HOY vs AYER in America/Bogota)
  const draftsToday = recentDrafts.filter(d => getBogotaDateString(d.created_at || '') === todayBogota);
  const draftsYesterday = recentDrafts.filter(d => getBogotaDateString(d.created_at || '') === yesterdayBogota);

  const countDraftsByStatus = (list: CopilotDraftRow[]) => {
    let approved = 0, pending = 0, rejected = 0, other = 0;
    for (const d of list) {
      const st = String(d.status || '').toLowerCase();
      if (st === 'approved') approved++;
      else if (st === 'pending') pending++;
      else if (st === 'rejected') rejected++;
      else other++;
    }
    return { total: list.length, approved, pending, rejected, other };
  };

  const todayDraftStats = countDraftsByStatus(draftsToday);
  const yesterdayDraftStats = countDraftsByStatus(draftsYesterday);
  const todayPendingDrafts = draftsToday.filter(d => String(d.status || '').toLowerCase() === 'pending');
  const pendingDrafts = recentDrafts.filter(d => String(d.status || '').toLowerCase() === 'pending');

  // Preload linked orderIds missing from allOrders (for date discrepancy check)
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
    for (const eo of (extraOrders || []) as ExtendedOrderInput[]) {
      ordersById.set(eo.id, eo);
    }
  }

  const dateDiscrepancies = detectDraftDateDiscrepancies({ recentDrafts, ordersById, now });

  // 4. Duplicate Detector (excluding legitimate Pedido B splits & gift/replacement)
  const scopedOrdersMap = new Map<string, ExtendedOrderInput>();
  for (const o of [...todayOrders, ...targetOrders, ...futureOrders]) {
    scopedOrdersMap.set(o.id, o);
  }
  const scopedOrders = [...scopedOrdersMap.values()];
  const byProfileDate = new Map<string, ExtendedOrderInput[]>();
  const byPoNumber = new Map<string, ExtendedOrderInput[]>();

  for (const o of scopedOrders) {
    if (o.logistics_data?.is_off_agreement_split || o.logistics_data?.is_gift_remission || o.logistics_data?.is_replacement) {
      continue;
    }
    const dd = String(o.delivery_date || '').slice(0, 10);
    if (o.profile_id && dd) {
      const key = `${o.profile_id}|${dd}`;
      const arr = byProfileDate.get(key) || [];
      arr.push(o);
      byProfileDate.set(key, arr);
    }
    const po = String(o.purchase_order_number || '').trim().toUpperCase();
    if (po.length >= 3 && !['N/A', 'NA', 'SIN OC', '0', 'NINGUNA'].includes(po)) {
      const arr = byPoNumber.get(po) || [];
      arr.push(o);
      byPoNumber.set(po, arr);
    }
  }

  const duplicateAlerts: string[] = [];
  for (const [, grp] of byProfileDate.entries()) {
    if (grp.length > 1) {
      const cName = getOrderClientLabel(grp[0], profileMap);
      const dd = String(grp[0].delivery_date || '').slice(0, 10);
      duplicateAlerts.push(
        `[DUPLICADO_POSIBLE] Misma sede+fecha (${cName}, ${dd}): ${grp.map(x => `#${x.sequence_id} (${formatCop(x.total)}, ${x.status})`).join(' y ')}`
      );
    }
  }
  for (const [po, grp] of byPoNumber.entries()) {
    if (grp.length > 1) {
      duplicateAlerts.push(
        `[DUPLICADO_POSIBLE] Misma OC "${po}": ${grp.map(x => `#${x.sequence_id} (${getOrderClientLabel(x, profileMap)}, ${x.delivery_date})`).join(' y ')}`
      );
    }
  }

  // 5. Abnormal drop detector (< 40% of 8-week avg ticket, for avg >= 200k)
  const abnormalDrops: string[] = [];
  for (const o of targetOrders) {
    if (!o.profile_id || o.logistics_data?.is_off_agreement_split) continue;
    const avg = getAvgTicket(o.profile_id);
    const curTotal = Number(o.total || 0);
    if (avg >= 200_000 && curTotal > 0 && curTotal < avg * 0.4) {
      const pct = Math.round((curTotal / avg) * 100);
      abnormalDrops.push(
        `[CAIDA_ANORMAL] #${o.sequence_id} ${getOrderClientLabel(o, profileMap)}: pedido=${formatCop(curTotal)} (${pct}% de su promedio ${formatCop(avg)})`
      );
    }
  }

  // 6. Agreements & Lifecycle Cross-Check
  const resolver = buildAgreementResolver(headerSnap, todayBogota);
  const agreementLifecycleAlerts: string[] = [];
  const orderAgreementAlerts = new Map<string, string[]>();

  // Cross scoped orders against agreements
  for (const o of scopedOrders) {
    const ag = resolver.resolveForProfile(o.profile_id, profileMap);
    const alerts: string[] = [];
    const dd = String(o.delivery_date || '').slice(0, 10);
    if (ag) {
      if (ag.lifecycleState === 'VENCIDO_CRITICO') {
        alerts.push(`ACUERDO_VENCIDO_CRITICO(${ag.effectiveUntil})`);
      } else if (ag.effectiveUntil && dd > ag.effectiveUntil) {
        alerts.push(`ENTREGA_POST_VENCIMIENTO(vence ${ag.effectiveUntil})`);
      }
    }
    const zCount = zeroItemCountByOrder.get(o.id) || 0;
    if (zCount > 0 || Number(o.total || 0) === 0) {
      alerts.push(zCount > 0 ? `${zCount}_ITEMS_$0` : 'TOTAL_$0');
    }
    if (alerts.length > 0) orderAgreementAlerts.set(o.id, alerts);
  }

  // Summarize expiring/expired agreements across quotes
  for (const q of headerSnap.quotes) {
    const info = resolver.classify(q, q.client_id ? 'SEDE' : 'MAESTRO');
    if (info.lifecycleState === 'VENCIDO_CRITICO' || info.lifecycleState === 'VENCIDO_GRACIA' || info.lifecycleState === 'POR_VENCER') {
      const label = q.client_name || q.model_snapshot_name || q.id.slice(0, 8);
      agreementLifecycleAlerts.push(
        `[${info.lifecycleState}] ${label} | vence=${info.effectiveUntil || 'N/D'} (dias=${info.daysRemaining ?? 'N/D'})`
      );
    }
  }

  // 7. KPI Helper
  const summarizeCohort = (list: ExtendedOrderInput[], rad: FrequencyRadarResult | null) => {
    const byStatus: Record<string, number> = {};
    let totalCop = 0, totalKg = 0, zeroSplit = 0, missingSpaces = 0, zeroTotal = 0;
    for (const o of list) {
      const st = String(o.status || 'unknown');
      byStatus[st] = (byStatus[st] || 0) + 1;
      totalCop += Number(o.total || 0);
      totalKg += Number(o.total_weight_kg || 0);
      if (o.logistics_data?.is_off_agreement_split) zeroSplit++;
      if (Number(o.total || 0) === 0) zeroTotal++;
      if (!Array.isArray(o.warehouse_spaces) || o.warehouse_spaces.length === 0) missingSpaces++;
    }
    const pendingAppr = (byStatus['pending_approval'] || 0) + (byStatus['pending'] || 0);
    const approvalRate = list.length > 0 ? Math.round(((list.length - pendingAppr) / list.length) * 100) : 100;
    const habRate =
      rad && rad.summary.habitualCount > 0
        ? Math.round((rad.summary.coveredCount / rad.summary.habitualCount) * 100)
        : 100;
    return { byStatus, totalCop, totalKg, zeroSplit, zeroTotal, missingSpaces, approvalRate, habRate };
  };

  const targetKpi = summarizeCohort(targetOrders, radar);
  const todayKpi = todayBogota !== targetDate ? summarizeCohort(todayOrders, radarToday) : null;

  const recentOtherDateOrders = allOrders
    .filter(o => (o.created_at || '') >= cutoff36hIso && String(o.delivery_date || '').slice(0, 10) !== targetDate)
    .sort(compareOrdersDesc);

  // 8. Dynamic Focus (anchored order numbers + OC + clients + products/prices)
  const cleanFocus = focusQuery.trim().toLowerCase();
  const seqSet = new Set<number>();
  for (const m of cleanFocus.matchAll(/#(\d{3,8})\b/g)) seqSet.add(Number(m[1]));
  for (const m of cleanFocus.matchAll(/\b(?:pedido|orden|ped|nro|num|remisi[oó]n)\s*#?\s*(\d{3,8})\b/gi)) seqSet.add(Number(m[1]));
  for (const m of cleanFocus.matchAll(/\b\d{4}_(\d{3,8})\b/g)) seqSet.add(Number(m[1]));
  const seqMatches = [...seqSet].slice(0, 2);

  const ocSet = new Set<string>();
  for (const m of cleanFocus.matchAll(/\b(?:oc|orden\s+de\s+compra)\s*[:#-]?\s*([a-z0-9-]{3,20})\b/gi)) {
    ocSet.add(m[1].toUpperCase());
  }

  const focusLines: string[] = [];
  const focalOrders: ExtendedOrderInput[] = [];

  for (const seqNum of seqMatches) {
    let oHit = allOrders.find(o => o.sequence_id === seqNum);
    if (!oHit) {
      const { data: directOrder } = await supabaseAdmin
        .from('orders')
        .select('id, sequence_id, profile_id, status, delivery_date, created_at, total, total_weight_kg, origin_source, purchase_order_number, logistics_data')
        .eq('sequence_id', seqNum)
        .maybeSingle();
      if (directOrder) oHit = directOrder as ExtendedOrderInput;
    }
    if (oHit) focalOrders.push(oHit);
  }

  if (ocSet.size > 0 && focalOrders.length < 2) {
    for (const o of allOrders) {
      const po = String(o.purchase_order_number || '').trim().toUpperCase();
      if (po && ocSet.has(po) && !focalOrders.some(f => f.id === o.id)) {
        focalOrders.push(o);
        if (focalOrders.length >= 2) break;
      }
    }
  }

  for (const oHit of focalOrders) {
    const [{ data: extraNoteRow }, { data: items, count }] = await Promise.all([
      supabaseAdmin.from('orders').select('admin_notes').eq('id', oHit.id).maybeSingle(),
      supabaseAdmin
        .from('order_items')
        .select('product_id, quantity, unit, unit_price, variant_label, nickname, products(accounting_id, name, unit_of_measure)', { count: 'exact' })
        .eq('order_id', oHit.id)
        .limit(40),
    ]);

    const cName = getOrderClientLabel(oHit, profileMap);
    const ag = resolver.resolveForProfile(oHit.profile_id, profileMap);
    const adminNotesSnippet = String((extraNoteRow as { admin_notes?: string } | null)?.admin_notes || '')
      .replace(/\s+/g, ' ')
      .slice(0, 320);

    focusLines.push(
      `PEDIDO FOCAL #${oHit.sequence_id}: cliente="${cName}", estado=${oHit.status}, entrega=${oHit.delivery_date}, creado=${formatBogotaTimestamp(oHit.created_at)}, origen=${oHit.origin_source}, total=${formatCop(oHit.total)}, kg=${oHit.total_weight_kg || 0}, OC="${oHit.purchase_order_number || ''}", acuerdo=${ag ? `${ag.quote.client_name || ag.quote.model_snapshot_name} [${ag.lifecycleState}, vence=${ag.effectiveUntil || 'N/D'}]` : 'Sin acuerdo (General/Hogar)'}`
    );
    if (adminNotesSnippet) {
      focusLines.push(`  NOTAS ADMIN #${oHit.sequence_id}: "${adminNotesSnippet}"`);
    }

    const typedItems = (items || []) as OrderItemJoinRow[];
    const focalProdIds = typedItems.map(i => i.product_id).filter((v): v is string => Boolean(v));
    const agPricesMap = new Map<string, number>();
    if (ag && focalProdIds.length > 0) {
      const { data: qItems } = await supabaseAdmin
        .from('quote_items')
        .select('product_id, unit_price')
        .eq('quote_id', ag.quote.id)
        .in('product_id', focalProdIds);
      for (const qi of (qItems || []) as Array<{ product_id: string; unit_price: number }>) {
        agPricesMap.set(qi.product_id, Number(qi.unit_price || 0));
      }
    }

    if (typedItems.length > 0) {
      const itemStrs = typedItems.map(it => {
        const p = Array.isArray(it.products) ? it.products[0] : it.products;
        const aid = p?.accounting_id ? `#${p.accounting_id}` : '#S/N';
        const name = p?.name || it.nickname || 'Producto';
        const unit = it.unit || p?.unit_of_measure || '';
        const agP = it.product_id ? agPricesMap.get(it.product_id) : undefined;
        const priceDiffNote =
          agP !== undefined && Math.abs(agP - Number(it.unit_price || 0)) > 1
            ? ` [ACUERDO=${formatCop(agP)}]`
            : Number(it.unit_price || 0) === 0
            ? ' [EN_$0]'
            : '';
        return `${aid} ${name} (${it.quantity} ${unit}${it.variant_label ? ` ${it.variant_label}` : ''}) ${formatCop(it.unit_price)}${priceDiffNote}`;
      });
      focusLines.push(
        `  LÍNEAS #${oHit.sequence_id} (${typedItems.length}/${count ?? typedItems.length}): ${itemStrs.join(' | ')}`
      );
    }
  }

  // Client focus (max 3)
  let focalAgreementForPriceLookup: ResolvedAgreementInfo | null = null;
  if (cleanFocus.length >= 3) {
    const tokens = cleanFocus
      .replace(/[#¿?¡!.,]/g, ' ')
      .split(/\s+/)
      .filter(
        t =>
          t.length >= 3 &&
          !['para', 'ayer', 'hoy', 'pedido', 'pedidos', 'correo', 'correos', 'quien', 'quienes', 'estado', 'paso', 'que', 'trae', 'tiene', 'precio', 'precios', 'lista', 'hogar', 'acuerdo', 'cuanto', 'vale', 'cuesta'].includes(t)
      );

    const matchedProfiles = allProfiles.filter(p => {
      const hay = `${p.company_name || ''} ${p.contact_name || ''} ${p.email || ''}`.toLowerCase();
      return tokens.some(t => hay.includes(t));
    });

    for (const mp of matchedProfiles.slice(0, 3)) {
      const ag = resolver.resolveForProfile(mp.id, profileMap);
      if (!focalAgreementForPriceLookup && ag) focalAgreementForPriceLookup = ag;
      const mpOrders = allOrders
        .filter(o => o.profile_id === mp.id)
        .sort(compareOrdersDesc)
        .slice(0, 5)
        .map(o => `#${o.sequence_id} [${o.status}] entrega=${o.delivery_date} creado=${formatBogotaTimestamp(o.created_at)} ${formatCop(o.total)}`);
      const mpDrafts = recentDrafts
        .filter(d => d.profile_id === mp.id)
        .slice(0, 4)
        .map(d => {
          const m = getDraftMeta(d);
          return `borrador=${d.id.slice(0, 8)} [${d.status}] asunto="${d.email_subject}" fecha_ext=${m.deliveryDate || 'null'} recibido=${formatBogotaTimestamp(d.created_at)}`;
        });
      focusLines.push(
        `CLIENTE FOCAL "${mp.company_name || mp.contact_name}" (acuerdo=${ag ? `${ag.quote.client_name || ag.quote.model_snapshot_name} [${ag.lifecycleState}, ${ag.effectiveStart || '?'}..${ag.effectiveUntil || '?'}]` : 'Sin acuerdo'}, dias=${JSON.stringify(mp.logistics_data?.allowed_days || mp.logistics_data?.days || [])}):\n  Pedidos recientes: ${mpOrders.join(' | ') || 'Ninguno'}\n  Borradores hoy/ayer: ${mpDrafts.join(' | ') || 'Ninguno'}`
      );
    }

    // Product / Price lookup when user asks about prices, Hogar, General or #accounting_id
    const wantsPriceLookup = /(precio|vale|cuesta|lista|hogar|institucional|tarifa|acuerdo|#\d{1,5})/i.test(cleanFocus);
    if (wantsPriceLookup && tokens.length > 0) {
      const accMatches = [...cleanFocus.matchAll(/#(\d{1,5})\b/g)].map(m => Number(m[1])).slice(0, 3);
      let prodQuery = supabaseAdmin
        .from('products')
        .select('id, accounting_id, name, unit_of_measure')
        .eq('is_active', true);

      if (accMatches.length > 0) {
        prodQuery = prodQuery.in('accounting_id', accMatches);
      } else {
        const searchTok = tokens.sort((a, b) => b.length - a.length)[0];
        if (searchTok) prodQuery = prodQuery.ilike('name', `%${searchTok}%`);
      }

      const { data: matchedProds } = await prodQuery.limit(5);
      const prodRows = (matchedProds || []) as Array<{ id: string; accounting_id: number | null; name: string; unit_of_measure: string | null }>;

      if (prodRows.length > 0) {
        const pIds = prodRows.map(p => p.id);
        const [pmPricesRes, agPricesRes] = await Promise.all([
          supabaseAdmin
            .from('pricing_model_prices')
            .select('model_id, product_id, price')
            .in('model_id', [GENERAL_INSTITUCIONAL_ID, CLIENTES_HOGAR_ID])
            .in('product_id', pIds),
          focalAgreementForPriceLookup
            ? supabaseAdmin
                .from('quote_items')
                .select('product_id, unit_price')
                .eq('quote_id', focalAgreementForPriceLookup.quote.id)
                .in('product_id', pIds)
            : Promise.resolve({ data: [] }),
        ]);

        const genMap = new Map<string, number>();
        const hogarMap = new Map<string, number>();
        for (const r of (pmPricesRes.data || []) as Array<{ model_id: string; product_id: string; price: number }>) {
          if (r.model_id === GENERAL_INSTITUCIONAL_ID) genMap.set(r.product_id, Number(r.price));
          if (r.model_id === CLIENTES_HOGAR_ID) hogarMap.set(r.product_id, Number(r.price));
        }
        const agMap = new Map<string, number>();
        for (const r of (agPricesRes.data || []) as Array<{ product_id: string; unit_price: number }>) {
          agMap.set(r.product_id, Number(r.unit_price));
        }

        focusLines.push('CONSULTA DE TARIFAS (sin base_price):');
        for (const pr of prodRows) {
          const agPart = focalAgreementForPriceLookup
            ? ` | Acuerdo(${focalAgreementForPriceLookup.quote.client_name})=${agMap.has(pr.id) ? formatCop(agMap.get(pr.id)) : 'Fuera de acuerdo'}`
            : '';
          focusLines.push(
            `  - #${pr.accounting_id || '?'} ${pr.name} (${pr.unit_of_measure || 'Kg'}): GeneralInst=${genMap.has(pr.id) ? formatCop(genMap.get(pr.id)) : 'N/D'} | ClientesHogar=${hogarMap.has(pr.id) ? formatCop(hogarMap.get(pr.id)) : 'N/D'}${agPart}`
          );
        }
      }
    }
  }

  // 9. Assemble Deterministic Prompt Snapshot v3
  const formatRadarBlock = (title: string, rad: FrequencyRadarResult, draftsPool: CopilotDraftRow[]) => {
    const out: string[] = [
      `${title}: habituales=${rad.summary.habitualCount} | cubiertos=${rad.summary.coveredCount} | urgentes=${rad.summary.urgentAnomaliesCount} (otra_fecha=${rad.summary.otherDateAnomalyCount}, borrador_atascado=${rad.summary.stuckDraftCount}, vencidos_30m=${rad.summary.overdueSilentMissingCount}) | en_ventana=${rad.summary.inWindowCount}`,
    ];
    const enriched = [...rad.anomalies].sort((a: FrequencyRadarEntry, b: FrequencyRadarEntry) => {
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
      return getAvgTicket(b.profileId) - getAvgTicket(a.profileId);
    });
    for (const a of enriched.slice(0, 20)) {
      const avg = getAvgTicket(a.profileId);
      const ticketTag = avg > 0 ? ` | ticket_prom=${formatCop(avg)}` : '';
      const rejectedMatch = draftsPool.find(
        d => d.profile_id === a.profileId && String(d.status || '').toLowerCase() === 'rejected'
      );
      const rejTag = rejectedMatch ? ` | ⚠️ TIENE_CORREO_REJECTED("${rejectedMatch.email_subject}")` : '';
      if (a.status === 'other_date_anomaly' && a.otherDateOrder) {
        out.push(`   - [OTRA_FECHA] ${a.clientName}: ${a.expectedReason}, pero #${a.otherDateOrder.sequenceId} quedó para ${a.otherDateOrder.deliveryDate} [${a.otherDateOrder.status}]${ticketTag}`);
      } else if (a.status === 'stuck_draft' && a.pendingDraft) {
        out.push(`   - [BORRADOR_PENDIENTE] ${a.clientName}: asunto="${a.pendingDraft.subject}" fecha=${a.pendingDraft.extractedDeliveryDate || 'sin_fecha'} recibido=${formatBogotaTimestamp(a.pendingDraft.createdAt)}${ticketTag}`);
      } else if (a.isOverdue) {
        out.push(`   - [FALTA_POR_PEDIR_VENCIDO] ${a.clientName}: ${a.expectedReason} | hora_hab=${a.avgOrderTimeBogota || 'N/D'}${ticketTag}${rejTag}`);
      } else {
        out.push(`   - [EN_VENTANA] ${a.clientName}: ${a.expectedReason} | hora_hab=${a.avgOrderTimeBogota || 'N/D'}${ticketTag}`);
      }
    }
    return out;
  };

  const formatCompactOrderLine = (o: ExtendedOrderInput) => {
    const al = orderAgreementAlerts.get(o.id);
    const alTag = al?.length ? ` ⚠️[${al.join(',')}]` : '';
    const ocTag = o.purchase_order_number ? ` OC=${o.purchase_order_number}` : '';
    return `   - #${o.sequence_id} | ${getOrderClientLabel(o, profileMap)} | ${o.status} | ent=${String(o.delivery_date || '').slice(0, 10)} | ${formatCop(o.total)} | ${Number(o.total_weight_kg || 0).toFixed(1)}kg${ocTag} | ${o.origin_source || 'web'}${alTag}`;
  };

  const prioritizeOrders = (list: ExtendedOrderInput[], limit: number) => {
    return [...list]
      .sort((a, b) => {
        const aScore = (orderAgreementAlerts.has(a.id) ? 2 : 0) + (a.status === 'pending_approval' ? 1 : 0);
        const bScore = (orderAgreementAlerts.has(b.id) ? 2 : 0) + (b.status === 'pending_approval' ? 1 : 0);
        if (aScore !== bScore) return bScore - aScore;
        return Number(b.sequence_id || 0) - Number(a.sequence_id || 0);
      })
      .slice(0, limit);
  };

  const lines: string[] = [
    `=== SNAPSHOT OPERATIVO v3 (BOGOTÁ HOY: ${todayBogota} | FECHA OBJETIVO: ${targetDate} - ${radar.weekdayName.toUpperCase()}) ===`,
    `Generado (Bogotá): ${formatBogotaTimestamp(now.toISOString())} | Último borrador Supabase: ${lastDraftReceivedAtBogota || 'Sin registros'}`,
    `1) CARGA ${targetDate}: pedidos=${targetOrders.length} | valor=${formatCop(targetKpi.totalCop)} | peso=${(targetKpi.totalKg / 1000).toFixed(2)} TON (${targetKpi.totalKg.toFixed(1)} kg) | aprobacion=${targetKpi.approvalRate}% | cobertura_hab=${targetKpi.habRate}% | por_estado=${JSON.stringify(targetKpi.byStatus)} | splits_$0=${targetKpi.zeroSplit} | total_$0=${targetKpi.zeroTotal} | sin_bodega=${targetKpi.missingSpaces}`,
  ];

  if (todayKpi) {
    lines.push(
      `   CARGA HOY (${todayBogota}): pedidos=${todayOrders.length} | valor=${formatCop(todayKpi.totalCop)} | peso=${(todayKpi.totalKg / 1000).toFixed(2)} TON | aprobacion=${todayKpi.approvalRate}% | por_estado=${JSON.stringify(todayKpi.byStatus)}`
    );
  }

  lines.push(
    `2) BANDEJA ENTRADA EMAIL (exacto Bogotá):`,
    `   - HOY (${todayBogota}): total=${todayDraftStats.total} | legalizados(approved)=${todayDraftStats.approved} | pendientes(pending)=${todayDraftStats.pending} | rechazados(rejected)=${todayDraftStats.rejected}${todayDraftStats.other ? ` | otros=${todayDraftStats.other}` : ''}`,
    `   - AYER (${yesterdayBogota}): total=${yesterdayDraftStats.total} | legalizados(approved)=${yesterdayDraftStats.approved} | pendientes(pending)=${yesterdayDraftStats.pending} | rechazados(rejected)=${yesterdayDraftStats.rejected}`,
    `   - ACUMULADO VENTANA [AYER+HOY]: total=${recentDrafts.length}, pendientes=${pendingDrafts.length}`
  );

  if (todayPendingDrafts.length > 0) {
    lines.push(`   PENDIENTES DE LEGALIZAR HOY (${todayPendingDrafts.length}):`);
    for (const d of todayPendingDrafts.slice(0, 35)) {
      const m = getDraftMeta(d);
      const waitMin = d.created_at ? Math.max(0, Math.round((now.getTime() - new Date(d.created_at).getTime()) / 60000)) : 0;
      lines.push(
        `     * [${waitMin}m espera] ${d.client_detected_name || d.source_email} | asunto="${d.email_subject}" | fecha_ext=${m.deliveryDate || 'null'} | rec=${formatBogotaTimestamp(d.created_at)}`
      );
    }
  }

  if (dateDiscrepancies.length > 0 || duplicateAlerts.length > 0 || abnormalDrops.length > 0) {
    lines.push(`3) ALERTAS CRÍTICAS AUTOMÁTICAS:`);
    for (const disc of dateDiscrepancies.slice(0, 12)) {
      lines.push(
        `   - [DISCREPANCIA_FECHA] ${disc.clientLabel} | ${disc.orderTag} | "${disc.matchedPhrase}" (esperado ${disc.expectedDate}) vs guardado ${disc.savedDate}`
      );
    }
    for (const dup of duplicateAlerts.slice(0, 12)) lines.push(`   - ${dup}`);
    for (const dr of abnormalDrops.slice(0, 10)) lines.push(`   - ${dr}`);
  }

  lines.push(`4) RADAR PREDICTIVO MULTI-DÍA (8 semanas, ordenado por vencido y ticket COP):`);
  lines.push(...formatRadarBlock(`   - FECHA OBJETIVO (${targetDate} ${radar.weekdayName})`, radar, recentDrafts));
  if (radarToday) {
    lines.push(...formatRadarBlock(`   - HOY (${todayBogota} ${radarToday.weekdayName})`, radarToday, recentDrafts));
  }
  if (radarNextOp) {
    lines.push(...formatRadarBlock(`   - PRÓXIMO OPERATIVO (${nextOperationalDate} ${radarNextOp.weekdayName})`, radarNextOp, recentDrafts));
  }

  if (futureOrders.length > 0) {
    const byFutureDate = new Map<string, { count: number; total: number }>();
    for (const o of futureOrders) {
      const dd = String(o.delivery_date || '').slice(0, 10);
      const cur = byFutureDate.get(dd) || { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(o.total || 0);
      byFutureDate.set(dd, cur);
    }
    const dateSummary = [...byFutureDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, v]) => `${d}(${v.count} ped, ${formatCop(v.total)})`)
      .join(' | ');
    lines.push(`5) CALENDARIO FUTURO > ${targetDate} (próx 30d, total=${futureOrders.length}): ${dateSummary}`);
    for (const o of futureOrders.slice(0, 20)) lines.push(formatCompactOrderLine(o));
  }

  if (recentOtherDateOrders.length > 0) {
    lines.push(`6) CREADOS ÚLTIMAS 36H PARA OTRA FECHA (!= ${targetDate}) [Top 12]:`);
    for (const o of recentOtherDateOrders.slice(0, 12)) {
      lines.push(`   - #${o.sequence_id} | ${getOrderClientLabel(o, profileMap)} | ent=${o.delivery_date} | ${o.status} | creado=${formatBogotaTimestamp(o.created_at)}`);
    }
  }

  lines.push(`7) ACUERDOS, LISTAS MAESTRAS Y PRECIOS HOGAR:`);
  const masterSummaries = headerSnap.specialModels.map(
    sm => `${sm.name}(${sm.start_date || '?'}..${sm.valid_until || '?'})`
  );
  const pmSummaries = headerSnap.pricingModels
    .filter(pm => pm.id === GENERAL_INSTITUCIONAL_ID || pm.id === CLIENTES_HOGAR_ID)
    .map(pm => `${pm.name}(${pm.start_date || 'sin_inicio'}..${pm.end_date || 'permanente'})`);
  lines.push(`   - Listas Maestras: ${masterSummaries.join(' | ') || 'Ninguna'}`);
  lines.push(`   - Modelos Base: ${pmSummaries.join(' | ') || 'General Institucional & Clientes Hogar'}`);
  if (agreementLifecycleAlerts.length > 0) {
    lines.push(`   - Vigencias críticas/por vencer (<=5d o vencidos, Top 15):`);
    for (const al of agreementLifecycleAlerts.slice(0, 15)) lines.push(`     * ${al}`);
  }

  lines.push(`8) ÍNDICE COMPACTO ${targetDate} (${targetOrders.length} pedidos):`);
  for (const o of prioritizeOrders(targetOrders, 45)) {
    lines.push(formatCompactOrderLine(o));
  }
  if (todayOrders.length > 0 && todayBogota !== targetDate) {
    lines.push(`   ÍNDICE COMPACTO HOY ${todayBogota} (${todayOrders.length} pedidos):`);
    for (const o of prioritizeOrders(todayOrders, 25)) {
      lines.push(formatCompactOrderLine(o));
    }
  }

  if (focusLines.length > 0) {
    lines.push('9) FOCO DINÁMICO SOLICITADO:');
    lines.push(...focusLines);
  }

  let promptText = lines.join('\n');
  if (promptText.length > MAX_PROMPT_CHARS) {
    promptText = `${promptText.slice(0, MAX_PROMPT_CHARS - 60)}\n...[SNAPSHOT RECORTADO AL TOPE DE 22K CHARS]`;
  }

  return {
    targetDate,
    generatedAtBogota: formatBogotaTimestamp(now.toISOString()),
    lastDraftReceivedAt,
    lastDraftReceivedAtBogota,
    radar,
    stats: {
      ordersForTargetDate: targetOrders.length,
      pendingApprovalCount: targetKpi.byStatus['pending_approval'] || 0,
      paraCompraCount: targetKpi.byStatus['para_compra'] || 0,
      zeroSplitCount: targetKpi.zeroSplit,
      recentOtherDateOrdersCount: recentOtherDateOrders.length,
      recentDraftsCount: recentDrafts.length,
      pendingDraftsCount: pendingDrafts.length,
      dateDiscrepancyCount: dateDiscrepancies.length,
      urgentAnomalies: radar.summary.urgentAnomaliesCount,
      totalAnomalies: radar.summary.totalAnomalies,
      todayOrdersCount: todayOrders.length,
      todayDraftsTotal: todayDraftStats.total,
      todayDraftsApproved: todayDraftStats.approved,
      todayDraftsPending: todayDraftStats.pending,
      todayDraftsRejected: todayDraftStats.rejected,
      duplicateAlertsCount: duplicateAlerts.length,
      futureOrdersCount: futureOrders.length,
    },
    promptText,
  };
}
