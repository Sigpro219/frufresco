import type { SupabaseClient } from '@supabase/supabase-js';
import { computeFrequencyRadar, type FrequencyRadarResult } from './frequencyEngine';
import { getBogotaDateStr } from './bogotaDateParser';

export interface OrdersCopilotContext {
  targetDate: string;
  generatedAtBogota: string;
  radar: FrequencyRadarResult;
  stats: {
    ordersForTargetDate: number;
    pendingApprovalCount: number;
    paraCompraCount: number;
    zeroSplitCount: number;
    recentOtherDateOrdersCount: number;
    recentDraftsCount: number;
    pendingDraftsCount: number;
    totalAnomalies: number;
  };
  promptText: string;
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

function getDraftMeta(draft: any): Record<string, any> {
  const items = Array.isArray(draft?.extracted_items) ? draft.extracted_items : [];
  return items.find((i: any) => i && i.isMetadata) || {};
}

/**
 * 100% server-side deterministic context assembler for the Orders & Emails AI Copilot (SECOP §62 pattern).
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
      : getBogotaDateStr(now);

  const histStart = new Date(new Date(`${targetDate}T12:00:00Z`).getTime() - 56 * 86400 * 1000)
    .toISOString()
    .split('T')[0];
  const cutoff48hIso = new Date(now.getTime() - 48 * 3600 * 1000).toISOString();
  const cutoff36hIso = new Date(now.getTime() - 36 * 3600 * 1000).toISOString();

  const [profilesRes, ordersRes, draftsRes] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, company_name, contact_name, email, role, is_active, logistics_data')
      .eq('role', 'b2b_client')
      .eq('is_active', true),
    supabaseAdmin
      .from('orders')
      .select('id, sequence_id, profile_id, customer_name, status, delivery_date, created_at, total, total_weight_kg, origin_source, purchase_order_number, warehouse_spaces, logistics_data')
      .gte('delivery_date', histStart)
      .order('created_at', { ascending: false })
      .limit(2000),
    supabaseAdmin
      .from('order_drafts')
      .select('id, profile_id, client_detected_name, source_email, email_subject, email_body, status, created_at, extracted_items')
      .gte('created_at', cutoff48hIso)
      .order('created_at', { ascending: false })
      .limit(120),
  ]);

  const profiles = profilesRes.data || [];
  const allOrders = ordersRes.data || [];
  const recentDrafts = draftsRes.data || [];
  const profileMap = new Map(profiles.map((p: any) => [p.id, p]));

  const radar = computeFrequencyRadar({
    targetDate,
    profiles,
    recentOrders: allOrders,
    recentDrafts,
    now,
  });

  const targetOrders = allOrders.filter(
    (o: any) =>
      String(o.delivery_date || '').slice(0, 10) === targetDate &&
      !['cancelled', 'billing_only'].includes(String(o.status || '').toLowerCase())
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

  const recentOtherDateOrders = allOrders.filter(
    (o: any) =>
      o.created_at >= cutoff36hIso &&
      String(o.delivery_date || '').slice(0, 10) !== targetDate &&
      !['cancelled', 'billing_only'].includes(String(o.status || '').toLowerCase())
  );

  const pendingDrafts = recentDrafts.filter((d: any) => String(d.status || '').toLowerCase() === 'pending');

  // Dynamic focus matching (#sequence_id or client/subject substring)
  const cleanFocus = focusQuery.trim().toLowerCase();
  const seqMatch = cleanFocus.match(/#?(\d{3,6})/);
  const focusLines: string[] = [];

  if (cleanFocus.length >= 3) {
    const tokens = cleanFocus
      .replace(/[#¿?¡!.,]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 3 && !['para', 'ayer', 'hoy', 'pedido', 'pedidos', 'correo', 'correos', 'quien', 'quienes', 'estado', 'paso', 'que'].includes(t));

    const matchedProfiles = profiles.filter((p: any) => {
      const hay = `${p.company_name || ''} ${p.contact_name || ''} ${p.email || ''}`.toLowerCase();
      return tokens.some(t => hay.includes(t));
    });

    if (seqMatch) {
      const seqNum = Number(seqMatch[1]);
      const oHit = allOrders.find((o: any) => o.sequence_id === seqNum);
      if (oHit) {
        const prof = profileMap.get(oHit.profile_id);
        focusLines.push(
          `PEDIDO FOCAL #${oHit.sequence_id}: cliente="${prof?.company_name || oHit.customer_name || oHit.profile_id}", estado=${oHit.status}, delivery_date=${oHit.delivery_date}, creado=${formatBogotaTimestamp(oHit.created_at)}, origen=${oHit.origin_source}, total=$${oHit.total}, kg=${oHit.total_weight_kg}, OC="${oHit.purchase_order_number || ''}"`
        );
      }
    }

    for (const mp of matchedProfiles.slice(0, 3)) {
      const mpOrders = allOrders
        .filter((o: any) => o.profile_id === mp.id)
        .slice(0, 5)
        .map((o: any) => `#${o.sequence_id} [${o.status}] entrega=${o.delivery_date} creado=${formatBogotaTimestamp(o.created_at)} $${o.total}`);
      const mpDrafts = recentDrafts
        .filter((d: any) => d.profile_id === mp.id)
        .slice(0, 5)
        .map((d: any) => {
          const m = getDraftMeta(d);
          const snippet = String(d.email_body || '').replace(/\s+/g, ' ').slice(0, 160);
          return `borrador=${d.id.slice(0, 8)} [${d.status}] asunto="${d.email_subject}" fecha_extraida=${m.deliveryDate || 'null'} recibido=${formatBogotaTimestamp(d.created_at)} texto="${snippet}"`;
        });
      focusLines.push(
        `SEDE FOCAL "${mp.company_name}" (email=${mp.email || 'N/A'}, dias_config=${JSON.stringify(mp.logistics_data?.allowed_days || mp.logistics_data?.days || [])}):\n  Pedidos recientes: ${mpOrders.join(' | ') || 'Ninguno'}\n  Borradores 48h: ${mpDrafts.join(' | ') || 'Ninguno'}`
      );
    }
  }

  const lines: string[] = [
    `=== SNAPSHOT OPERATIVO PEDIDOS Y CORREOS (FECHA OBJETIVO: ${targetDate} - ${radar.weekdayName.toUpperCase()}) ===`,
    `Generado (Bogotá): ${formatBogotaTimestamp(now.toISOString())}`,
    `1) PEDIDOS PARA ${targetDate}: total=${targetOrders.length} | por_estado=${JSON.stringify(byStatus)} | splits_$0=${zeroSplitCount} | sin_espacio_bodega=${missingSpacesCount}`,
    `2) RADAR DE FRECUENCIAS ($0): habituales=${radar.summary.habitualCount} | cubiertos=${radar.summary.coveredCount} | anomalias=${radar.summary.totalAnomalies} (otra_fecha=${radar.summary.otherDateAnomalyCount}, borrador_atascado=${radar.summary.stuckDraftCount}, silencio=${radar.summary.silentMissingCount})`,
  ];

  if (radar.anomalies.length > 0) {
    lines.push('   DETALLE ANOMALÍAS (Top 25):');
    for (const a of radar.anomalies.slice(0, 25)) {
      if (a.status === 'other_date_anomaly' && a.otherDateOrder) {
        lines.push(`   - [OTRA_FECHA] ${a.clientName}: habitual=${a.expectedReason}, pero #${a.otherDateOrder.sequenceId} quedó para ${a.otherDateOrder.deliveryDate} [${a.otherDateOrder.status}]`);
      } else if (a.status === 'stuck_draft' && a.pendingDraft) {
        lines.push(`   - [BORRADOR_PENDIENTE] ${a.clientName}: asunto="${a.pendingDraft.subject}" fecha=${a.pendingDraft.extractedDeliveryDate || 'sin_fecha'} recibido=${formatBogotaTimestamp(a.pendingDraft.createdAt)}`);
      } else {
        lines.push(`   - [FALTA_POR_PEDIR] ${a.clientName}: ${a.expectedReason} | hora_habitual=${a.avgOrderTimeBogota || 'N/D'}`);
      }
    }
  }

  if (recentOtherDateOrders.length > 0) {
    lines.push(`3) PEDIDOS CREADOS ÚLTIMAS 36H PARA OTRA FECHA (!= ${targetDate}) [Top 20]:`);
    for (const o of recentOtherDateOrders.slice(0, 20)) {
      const prof = profileMap.get(o.profile_id);
      lines.push(`   - #${o.sequence_id} | ${prof?.company_name || o.customer_name || 'Cliente'} | entrega=${o.delivery_date} | estado=${o.status} | creado=${formatBogotaTimestamp(o.created_at)} | origen=${o.origin_source}`);
    }
  }

  lines.push(`4) BANDEJA CORREOS ÚLTIMAS 48H (total=${recentDrafts.length}, pendientes=${pendingDrafts.length}) [Top 20]:`);
  for (const d of recentDrafts.slice(0, 20)) {
    const m = getDraftMeta(d);
    const snippet = String(d.email_body || '').replace(/\s+/g, ' ').slice(0, 140);
    lines.push(`   - [${d.status}] ${d.client_detected_name || d.source_email} | asunto="${d.email_subject}" | fecha_ext=${m.deliveryDate || 'null'} | recibido=${formatBogotaTimestamp(d.created_at)} | "${snippet}"`);
  }

  if (focusLines.length > 0) {
    lines.push('5) FOCO DINÁMICO SOLICITADO:');
    lines.push(...focusLines);
  }

  return {
    targetDate,
    generatedAtBogota: formatBogotaTimestamp(now.toISOString()),
    radar,
    stats: {
      ordersForTargetDate: targetOrders.length,
      pendingApprovalCount: byStatus['pending_approval'] || 0,
      paraCompraCount: byStatus['para_compra'] || 0,
      zeroSplitCount,
      recentOtherDateOrdersCount: recentOtherDateOrders.length,
      recentDraftsCount: recentDrafts.length,
      pendingDraftsCount: pendingDrafts.length,
      totalAnomalies: radar.summary.totalAnomalies,
    },
    promptText: lines.join('\n'),
  };
}
