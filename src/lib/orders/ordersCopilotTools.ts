import type { SupabaseClient } from '@supabase/supabase-js';
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai';
import { addBogotaDays, diffBogotaDays, getBogotaDateString, getBogotaDayRangeUtcIso } from '@/lib/dateUtils';
import { getFamilyRootId, normalizeFamilyBaseUnit } from '@/lib/inventory/familyStockResolver';
import {
  evaluateInventoryGateStatus,
  getDailyManualChecklistStatus,
  isPartialClosingNote,
  resolveInitialInventory,
} from '@/lib/inventory/resolveInitialInventory';
import { normalizeDemandToKg } from '@/lib/procurement/procurementNettingEngine';

const GENERAL_INSTITUCIONAL_ID = 'd90a91e5-827c-473d-9d4f-3e28c7c91e15';
const CLIENTES_HOGAR_ID = 'f7043ca1-94d5-4d25-bd10-fbf30ce120ee';
const CATALOG_CACHE_TTL_MS = 120_000;

export interface CatalogProductRow {
  id: string;
  accounting_id: number | null;
  name: string;
  parent_id: string | null;
  unit_of_measure: string | null;
  weight_kg: number | null;
  min_inventory_level: number | null;
  is_active: boolean | null;
}

let cachedCatalog: { rows: CatalogProductRow[]; fetchedAt: number } | null = null;

async function getProductCatalog(supabaseAdmin: SupabaseClient): Promise<CatalogProductRow[]> {
  const nowMs = Date.now();
  if (cachedCatalog && nowMs - cachedCatalog.fetchedAt < CATALOG_CACHE_TTL_MS) {
    return cachedCatalog.rows;
  }
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('id, accounting_id, name, parent_id, unit_of_measure, weight_kg, min_inventory_level, is_active')
    .eq('is_active', true);
  if (error) throw error;
  const rows = (data || []) as CatalogProductRow[];
  cachedCatalog = { rows, fetchedAt: nowMs };
  return rows;
}

function normalizeAccents(text: string): string {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Lightweight Spanish stemmer for product matching (handles plurals without cutting short roots).
 */
export function stemSpanishToken(token: string): string {
  const t = normalizeAccents(token).replace(/[^a-z0-9]/g, '');
  if (t.length <= 3) return t;
  if (t.endsWith('ciones') && t.length >= 7) return `${t.slice(0, -2)}`;
  if (t.endsWith('ones') && t.length >= 6) return t.slice(0, -2);
  if (t.endsWith('ces') && t.length >= 5) return `${t.slice(0, -3)}z`;
  if (t.endsWith('es') && t.length >= 5 && /[bcdfghjklmnpqrstvwxyz]es$/.test(t)) {
    return t.slice(0, -2);
  }
  if (t.endsWith('s') && t.length >= 4 && !t.endsWith('ss')) {
    return t.slice(0, -1);
  }
  return t;
}

/**
 * Word-boundary & Spanish-stem aware product matcher.
 * Prevents substring false positives like "papa" matching "papaya",
 * while matching plurals ("champiñones" -> "Champiñon", "papayas" -> "Papaya maradol").
 */
export function matchesProductQuery(
  query: string,
  candidateText: string,
  accountingId?: number | string | null
): boolean {
  const rawQ = String(query || '').trim();
  if (!rawQ) return false;

  const idOnly = rawQ.match(/^#?(\d{1,6})$/);
  if (idOnly) {
    return accountingId !== null && accountingId !== undefined && String(accountingId) === idOnly[1];
  }

  const qTokens = normalizeAccents(rawQ)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(stemSpanishToken)
    .filter(t => t.length >= 2);
  if (qTokens.length === 0) return false;

  const cTokens = normalizeAccents(candidateText)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(stemSpanishToken)
    .filter(Boolean);

  return qTokens.every(qt =>
    cTokens.some(ct => {
      if (ct === qt) return true;
      // Allow prefix match only when query token is specific (>= 5 chars) to match "champin" -> "champinon"
      if (qt.length >= 5 && ct.startsWith(qt)) return true;
      return false;
    })
  );
}

function round3(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
}

function formatBogotaTs(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function convertStockToBaseUnit(rawStock: number, memberUom: string | null | undefined, targetBaseUnit: 'KG' | 'CJ' | 'DOC' | 'UN'): number {
  const u = (memberUom || '').trim().toLowerCase();
  if (targetBaseUnit === 'KG') {
    if (u === 'lb' || u === 'libra' || u === 'libras') return rawStock * 0.5;
    if (u === 'g' || u === 'gr' || u === 'gramo' || u === 'gramos') return rawStock / 1000;
  }
  return rawStock;
}

export const COPILOT_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'query_product_demand',
    description:
      'Consulta la demanda exacta de un producto (o toda su familia Padre-Hijo) en los pedidos de una fecha, devolviendo totales normalizados y el desglose COMPLETO por cada pedido (#sequence_id, cliente, estado, cantidad). Úsala SIEMPRE para responder cuánto se pidió de un producto o en qué pedido(s)/cliente(s) va un producto.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: {
          type: SchemaType.STRING,
          description: 'Nombre del producto o código contable (#ID), ej: "crimini", "champiñones", "papaya", "#378".',
        },
        date: {
          type: SchemaType.STRING,
          description: 'Fecha de entrega YYYY-MM-DD (opcional; por defecto usa la fecha objetivo del tablero).',
        },
        includeFamily: {
          type: SchemaType.BOOLEAN,
          description: 'Si es true (por defecto), consolida Padre + todos sus Hijos por parent_id.',
        },
        statusFilter: {
          type: SchemaType.STRING,
          description: 'Estado opcional para filtrar pedidos, ej: "pending_approval", "para_compra", "approved".',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'query_inventory_and_netting',
    description:
      'Consulta el stock disponible real en bodega (vía resolveInitialInventory y cierre de inventario, nunca inventory_stocks) consolidado por familia Padre-Hijo, y calcula el balance neto contra la demanda (Faltante por comprar o Sobrante en bodega).',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: {
          type: SchemaType.STRING,
          description: 'Nombre del producto o código contable (#ID) a consultar en inventario.',
        },
        targetDate: {
          type: SchemaType.STRING,
          description: 'Fecha de operación YYYY-MM-DD (opcional; por defecto fecha objetivo del tablero).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'query_inventory_closing_status',
    description:
      'Consulta el estado exacto del cierre de inventario diario (Oficial, Cierre Parcial, Reabierto o Sin cerrar), quién cerró, a qué hora y qué pasos del checklist manual (G, Q/R, X, T, Lock) faltan.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        date: {
          type: SchemaType.STRING,
          description: 'Fecha calendario del balance YYYY-MM-DD (opcional; por defecto hoy Bogotá).',
        },
      },
    },
  },
  {
    name: 'query_order_details',
    description:
      'Obtiene el detalle completo de uno o varios pedidos por #sequence_id, por Orden de Compra (OC) o por filtros (fecha, estado, solo pedidos en $0), incluyendo todas sus líneas (#accounting_id, cantidad, unidad, precio) y notas administrativas.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        sequenceIds: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.NUMBER },
          description: 'Lista de números de pedido (ej: [2435, 2432]).',
        },
        purchaseOrder: {
          type: SchemaType.STRING,
          description: 'Número de Orden de Compra (OC).',
        },
        date: {
          type: SchemaType.STRING,
          description: 'Fecha de entrega YYYY-MM-DD si se filtra por fecha.',
        },
        status: {
          type: SchemaType.STRING,
          description: 'Estado del pedido si se filtra (ej: "pending_approval").',
        },
        onlyZeroPrice: {
          type: SchemaType.BOOLEAN,
          description: 'Si es true, filtra pedidos con total <= 0.',
        },
      },
    },
  },
  {
    name: 'query_client_and_inbox',
    description:
      'Consulta la ficha operativa de un cliente o sede: acuerdo vigente/vencido (3 niveles Sede->Matriz->Maestro), pedidos recientes y correos en Bandeja de Entrada (order_drafts últimos 7 días, incluyendo correos sin profile_id enlazado).',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        clientQuery: {
          type: SchemaType.STRING,
          description: 'Nombre parcial del cliente, sede o correo.',
        },
      },
      required: ['clientQuery'],
    },
  },
  {
    name: 'query_product_prices',
    description:
      'Consulta las tarifas vigentes de uno o varios productos simultáneamente en General Institucional, Clientes Hogar y en el Acuerdo vigente del cliente si se especifica.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        productQueries: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          description: 'Lista de nombres o #IDs de productos (máx. 6).',
        },
        clientQuery: {
          type: SchemaType.STRING,
          description: 'Nombre opcional del cliente para revisar también su tarifa de Acuerdo.',
        },
      },
      required: ['productQueries'],
    },
  },
];

export interface CopilotToolDeps {
  supabaseAdmin: SupabaseClient;
  defaultTargetDate: string;
  todayBogota: string;
}

async function resolveFamilyAndMatches(supabaseAdmin: SupabaseClient, query: string, includeFamily: boolean) {
  const catalog = await getProductCatalog(supabaseAdmin);
  const byId = new Map<string, CatalogProductRow>(catalog.map(p => [p.id, p]));
  const directMatches = catalog.filter(p => matchesProductQuery(query, p.name, p.accounting_id));

  if (directMatches.length === 0) {
    return { catalog, byId, directMatches: [], familyMembers: [] as CatalogProductRow[], rootIds: [] as string[] };
  }

  if (!includeFamily) {
    return {
      catalog,
      byId,
      directMatches,
      familyMembers: directMatches,
      rootIds: [...new Set(directMatches.map(getFamilyRootId))],
    };
  }

  const rootIds = [...new Set(directMatches.map(getFamilyRootId))];
  const rootSet = new Set(rootIds);
  const familyMembers = catalog.filter(p => rootSet.has(getFamilyRootId(p)));
  return { catalog, byId, directMatches, familyMembers, rootIds };
}

async function computeProductDemandForDate(params: {
  supabaseAdmin: SupabaseClient;
  query: string;
  date: string;
  includeFamily: boolean;
  statusFilter?: string;
}) {
  const { supabaseAdmin, query, date, includeFamily, statusFilter } = params;
  const { byId, directMatches, familyMembers, rootIds } = await resolveFamilyAndMatches(
    supabaseAdmin,
    query,
    includeFamily
  );

  if (familyMembers.length === 0) {
    return {
      date,
      query,
      found: false,
      message: `No se encontraron productos activos que coincidan con "${query}".`,
    };
  }

  let ordQuery = supabaseAdmin
    .from('orders')
    .select('id, sequence_id, profile_id, status, delivery_date, total')
    .eq('delivery_date', date)
    .not('status', 'in', '(cancelled,billing_only)')
    .order('sequence_id', { ascending: true });
  if (statusFilter) ordQuery = ordQuery.eq('status', statusFilter);

  const { data: ordersData, error: oErr } = await ordQuery;
  if (oErr) throw oErr;
  const orders = (ordersData || []) as Array<{
    id: string;
    sequence_id: number;
    profile_id: string | null;
    status: string;
    delivery_date: string;
    total: number;
  }>;

  if (orders.length === 0) {
    return {
      date,
      query,
      found: true,
      activeOrdersOnDate: 0,
      matchedProducts: familyMembers.map(m => ({
        accountingId: m.accounting_id,
        name: m.name,
        uom: m.unit_of_measure,
        isDirectMatch: directMatches.some(d => d.id === m.id),
      })),
      totalByUnit: {},
      products: [],
    };
  }

  const orderMap = new Map(orders.map(o => [o.id, o]));
  const pIds = [...new Set(orders.map(o => o.profile_id).filter((v): v is string => Boolean(v)))];
  const { data: profs } = pIds.length
    ? await supabaseAdmin.from('profiles').select('id, company_name, contact_name').in('id', pIds)
    : { data: [] };
  const profMap = new Map(
    ((profs || []) as Array<{ id: string; company_name: string | null; contact_name: string | null }>).map(p => [
      p.id,
      p.company_name || p.contact_name || p.id.slice(0, 8),
    ])
  );

  const targetProductIds = familyMembers.map(m => m.id);
  const orderIds = orders.map(o => o.id);
  const chunks: string[][] = [];
  for (let i = 0; i < orderIds.length; i += 40) chunks.push(orderIds.slice(i, i + 40));

  const itemResults = await Promise.all(
    chunks.map(cIds =>
      supabaseAdmin
        .from('order_items')
        .select('order_id, product_id, quantity, unit, variant_label, nickname, selected_options')
        .in('order_id', cIds)
        .in('product_id', targetProductIds)
    )
  );

  const items = itemResults.flatMap(
    r =>
      (r.data || []) as Array<{
        order_id: string;
        product_id: string;
        quantity: number;
        unit: string | null;
        variant_label: string | null;
        nickname: string | null;
        selected_options: Record<string, unknown> | null;
      }>
  );

  const consolidatedByUnit: Record<string, number> = {};
  const unconvertedUnits: Record<string, number> = {};
  const byProduct = new Map<
    string,
    {
      accountingId: number | null;
      name: string;
      familyRootName: string;
      uom: string;
      isDirectMatch: boolean;
      normalizedQty: number;
      normalizedUnit: string;
      orders: Array<{
        sequenceId: number;
        client: string;
        status: string;
        rawQty: number;
        rawUnit: string;
        normalizedQty: number;
        normalizedUnit: string;
      }>;
    }
  >();

  for (const it of items) {
    const prod = byId.get(it.product_id);
    const ord = orderMap.get(it.order_id);
    if (!prod || !ord) continue;

    const rootProd = byId.get(getFamilyRootId(prod)) || prod;
    const rawQty = Number(it.quantity || 0);
    const rawUnit = it.unit || prod.unit_of_measure || 'Unidad';

    // Check if an unconverted 'Unidad' without weight_kg/gr is mixed under a KG parent
    const rootBase = normalizeFamilyBaseUnit(rootProd.unit_of_measure);
    const rawNorm = rawUnit.trim().toLowerCase();
    const opts = (it.selected_options || {}) as Record<string, unknown>;
    const hasExplicitGrams = Number(opts._unit_weight_gr || 0) > 0 || /(\d+)\s*(gr|g|kg)\b/i.test(String(it.variant_label || ''));
    const hasConfiguredWeight = Number(prod.weight_kg || 0) > 0 && Number(prod.weight_kg) !== 1;

    let effQty = rawQty;
    let normUnit: string = rootBase;
    let isUnconverted = false;

    if (rootBase === 'KG' && (rawNorm === 'unidad' || rawNorm === 'un' || rawNorm === 'und') && !hasExplicitGrams && !hasConfiguredWeight) {
      normUnit = 'UN (sin peso base)';
      isUnconverted = true;
    } else {
      const res = normalizeDemandToKg({
        quantity: rawQty,
        rawUnit: it.unit,
        productUom: prod.unit_of_measure,
        selectedOptions: opts,
        variantLabel: it.variant_label,
        productWeightKg: prod.weight_kg,
      });
      effQty = res.effectiveQty;
      normUnit = res.unitStr;
    }

    if (isUnconverted) {
      unconvertedUnits[normUnit] = round3((unconvertedUnits[normUnit] || 0) + effQty);
    } else {
      consolidatedByUnit[normUnit] = round3((consolidatedByUnit[normUnit] || 0) + effQty);
    }

    const cur = byProduct.get(prod.id) || {
      accountingId: prod.accounting_id,
      name: prod.name,
      familyRootName: rootProd.name,
      uom: prod.unit_of_measure || 'Unidad',
      isDirectMatch: directMatches.some(d => d.id === prod.id),
      normalizedQty: 0,
      normalizedUnit: normUnit,
      orders: [],
    };
    cur.normalizedQty = round3(cur.normalizedQty + effQty);
    cur.orders.push({
      sequenceId: ord.sequence_id,
      client: ord.profile_id ? profMap.get(ord.profile_id) || 'Cliente' : 'Cliente Hogar',
      status: ord.status,
      rawQty,
      rawUnit,
      normalizedQty: round3(effQty),
      normalizedUnit: normUnit,
    });
    byProduct.set(prod.id, cur);
  }

  return {
    date,
    query,
    found: true,
    includeFamily,
    familyRootNames: rootIds.map(id => byId.get(id)?.name || id),
    activeOrdersOnDate: orders.length,
    totalByUnit: consolidatedByUnit,
    unconvertedUnits: Object.keys(unconvertedUnits).length > 0 ? unconvertedUnits : undefined,
    products: [...byProduct.values()],
    familyMembersWithoutDemand: familyMembers
      .filter(m => !byProduct.has(m.id))
      .map(m => ({ accountingId: m.accounting_id, name: m.name, uom: m.unit_of_measure })),
  };
}

export async function executeCopilotTool(
  name: string,
  args: Record<string, unknown>,
  deps: CopilotToolDeps
): Promise<unknown> {
  const { supabaseAdmin, defaultTargetDate, todayBogota } = deps;

  if (name === 'query_product_demand') {
    const query = String(args.query || '').trim();
    const date = typeof args.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.date) ? args.date : defaultTargetDate;
    const includeFamily = args.includeFamily !== false;
    const statusFilter = typeof args.statusFilter === 'string' && args.statusFilter.trim() ? args.statusFilter.trim() : undefined;
    return computeProductDemandForDate({ supabaseAdmin, query, date, includeFamily, statusFilter });
  }

  if (name === 'query_inventory_closing_status') {
    const balanceDate = typeof args.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.date) ? args.date : todayBogota;
    const nextOpDate = addBogotaDays(balanceDate, 1);
    const [closingRes, checklist, gate] = await Promise.all([
      supabaseAdmin
        .from('daily_inventory_closings')
        .select('closing_date, is_locked, closed_by_name, closed_at, notes, total_calculated, total_physical, total_missing, total_surplus')
        .eq('closing_date', balanceDate)
        .maybeSingle(),
      getDailyManualChecklistStatus(supabaseAdmin, balanceDate),
      evaluateInventoryGateStatus({ supabase: supabaseAdmin, targetDate: nextOpDate }),
    ]);

    const c = closingRes.data as {
      closing_date: string;
      is_locked: boolean;
      closed_by_name: string | null;
      closed_at: string | null;
      notes: string | null;
      total_calculated: number | null;
      total_physical: number | null;
      total_missing: number | null;
      total_surplus: number | null;
    } | null;

    const statusLabel = !c
      ? 'SIN_CERRAR'
      : c.is_locked
      ? 'CERRADO_OFICIAL'
      : isPartialClosingNote(c.notes)
      ? 'CIERRE_PARCIAL'
      : 'REABIERTO';

    return {
      balanceDate,
      status: statusLabel,
      closedBy: c?.closed_by_name || null,
      closedAtBogota: c?.closed_at ? formatBogotaTs(c.closed_at) : null,
      checklistCounts: checklist.counts,
      pendingChecklistSteps: checklist.pendingSteps,
      andonGateForNextDay: {
        targetDate: gate.targetDate,
        level: gate.level,
        headline: gate.headline,
        detail: gate.detail,
      },
    };
  }

  if (name === 'query_inventory_and_netting') {
    const query = String(args.query || '').trim();
    const targetDate =
      typeof args.targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.targetDate)
        ? args.targetDate
        : defaultTargetDate;

    const { byId, familyMembers, rootIds } = await resolveFamilyAndMatches(supabaseAdmin, query, true);
    if (familyMembers.length === 0) {
      return { found: false, query, message: `No se encontró el producto "${query}" en el catálogo activo.` };
    }

    const [invRes, demandRes, gateRes] = await Promise.all([
      resolveInitialInventory({ supabase: supabaseAdmin, targetDate }),
      computeProductDemandForDate({ supabaseAdmin, query, date: targetDate, includeFamily: true }),
      evaluateInventoryGateStatus({ supabase: supabaseAdmin, targetDate }),
    ]);

    const rootProd = byId.get(rootIds[0]) || familyMembers[0];
    const targetBaseUnit = normalizeFamilyBaseUnit(rootProd.unit_of_measure);

    let totalFamilyStock = 0;
    const stockBreakdown: Array<{ accountingId: number | null; name: string; rawStock: number; uom: string; normalizedStock: number }> = [];
    for (const member of familyMembers) {
      if (normalizeFamilyBaseUnit(member.unit_of_measure) !== targetBaseUnit) continue;
      const rawStock = Number(invRes.stockMap[member.id] || 0);
      const normStock = round3(convertStockToBaseUnit(rawStock, member.unit_of_measure, targetBaseUnit));
      if (normStock !== 0 || member.id === rootProd.id) {
        totalFamilyStock = round3(totalFamilyStock + normStock);
        stockBreakdown.push({
          accountingId: member.accounting_id,
          name: member.name,
          rawStock: round3(rawStock),
          uom: member.unit_of_measure || targetBaseUnit,
          normalizedStock: normStock,
        });
      }
    }

    const demandTotalMap = ('totalByUnit' in demandRes ? demandRes.totalByUnit : {}) as Record<string, number>;
    const familyDemand = Number(demandTotalMap[targetBaseUnit] || 0);
    const safetyStock = Math.max(0, Number(rootProd.min_inventory_level || 0));
    const grossNeed = round3(familyDemand + safetyStock);
    const appliedStock = round3(Math.min(Math.max(0, totalFamilyStock), grossNeed));
    const netToBuy = round3(Math.max(0, grossNeed - appliedStock));
    const surplusAfterDemand = round3(Math.max(0, totalFamilyStock - grossNeed));

    return {
      found: true,
      targetDate,
      familyRoot: { accountingId: rootProd.accounting_id, name: rootProd.name, baseUnit: targetBaseUnit },
      inventorySource: {
        sourceKind: invRes.sourceKind,
        sourceDate: invRes.sourceDate,
        isOfficialLocked: invRes.isOfficialLocked,
        andonLevel: gateRes.level,
        andonHeadline: gateRes.headline,
      },
      stock: {
        totalFamilyStock,
        unit: targetBaseUnit,
        membersWithStock: stockBreakdown,
      },
      netting: {
        demandForTargetDate: familyDemand,
        safetyStock,
        grossNeed,
        appliedStock,
        netToBuy,
        surplusAfterDemand,
        unconvertedUnits: 'unconvertedUnits' in demandRes ? demandRes.unconvertedUnits : undefined,
      },
      demandBreakdownByProduct: 'products' in demandRes ? demandRes.products : [],
    };
  }

  if (name === 'query_order_details') {
    const seqIds = Array.isArray(args.sequenceIds)
      ? args.sequenceIds.map(Number).filter(n => Number.isFinite(n) && n > 0).slice(0, 5)
      : [];
    const po = typeof args.purchaseOrder === 'string' ? args.purchaseOrder.trim() : '';
    const date = typeof args.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.date) ? args.date : undefined;
    const status = typeof args.status === 'string' && args.status.trim() ? args.status.trim() : undefined;
    const onlyZeroPrice = args.onlyZeroPrice === true;

    let q = supabaseAdmin
      .from('orders')
      .select('id, sequence_id, profile_id, status, delivery_date, created_at, total, total_weight_kg, origin_source, purchase_order_number, admin_notes, logistics_data')
      .not('status', 'in', '(cancelled,billing_only)');

    if (seqIds.length > 0) q = q.in('sequence_id', seqIds);
    else if (po) q = q.ilike('purchase_order_number', `%${po}%`);
    else {
      if (date) q = q.eq('delivery_date', date);
      else q = q.eq('delivery_date', defaultTargetDate);
      if (status) q = q.eq('status', status);
      if (onlyZeroPrice) q = q.lte('total', 0);
    }

    const { data: ordersData, error } = await q.order('sequence_id', { ascending: false }).limit(seqIds.length > 0 ? 5 : 12);
    if (error) throw error;
    const orders = (ordersData || []) as Array<{
      id: string;
      sequence_id: number;
      profile_id: string | null;
      status: string;
      delivery_date: string;
      created_at: string;
      total: number;
      total_weight_kg: number | null;
      origin_source: string | null;
      purchase_order_number: string | null;
      admin_notes: string | null;
    }>;

    if (orders.length === 0) return { found: false, orders: [] };

    const pIds = [...new Set(orders.map(o => o.profile_id).filter((v): v is string => Boolean(v)))];
    const { data: profs } = pIds.length
      ? await supabaseAdmin.from('profiles').select('id, company_name, contact_name').in('id', pIds)
      : { data: [] };
    const profMap = new Map(
      ((profs || []) as Array<{ id: string; company_name: string | null; contact_name: string | null }>).map(p => [
        p.id,
        p.company_name || p.contact_name || p.id.slice(0, 8),
      ])
    );

    const includeLines = orders.length <= 5;
    const detailed = await Promise.all(
      orders.map(async o => {
        let lines: unknown[] = [];
        if (includeLines) {
          const { data: items } = await supabaseAdmin
            .from('order_items')
            .select('quantity, unit, unit_price, variant_label, nickname, products(accounting_id, name, unit_of_measure)')
            .eq('order_id', o.id)
            .limit(100);
          lines = (items || []).map((it: Record<string, unknown>) => {
            const p = (Array.isArray(it.products) ? it.products[0] : it.products) as {
              accounting_id?: number;
              name?: string;
              unit_of_measure?: string;
            } | null;
            return {
              accountingId: p?.accounting_id ? `#${p.accounting_id}` : '#S/N',
              name: p?.name || it.nickname || 'Producto',
              qty: it.quantity,
              unit: it.unit || p?.unit_of_measure || 'Unidad',
              unitPrice: it.unit_price,
            };
          });
        }
        return {
          sequenceId: o.sequence_id,
          client: o.profile_id ? profMap.get(o.profile_id) || 'Cliente' : 'Cliente Hogar',
          status: o.status,
          deliveryDate: o.delivery_date,
          createdBogota: formatBogotaTs(o.created_at),
          total: o.total,
          weightKg: o.total_weight_kg,
          oc: o.purchase_order_number || null,
          adminNotes: o.admin_notes ? o.admin_notes.replace(/\s+/g, ' ').slice(0, 400) : null,
          lines,
        };
      })
    );

    return { found: true, count: detailed.length, orders: detailed };
  }

  if (name === 'query_client_and_inbox') {
    const clientQuery = String(args.clientQuery || '').trim();
    const { data: matchedProfs } = await supabaseAdmin
      .from('profiles')
      .select('id, company_name, contact_name, email, role, parent_id, is_active, logistics_data')
      .or(`company_name.ilike.%${clientQuery}%,contact_name.ilike.%${clientQuery}%,email.ilike.%${clientQuery}%`)
      .limit(8);

    const profs = (matchedProfs || []) as Array<{
      id: string;
      company_name: string | null;
      contact_name: string | null;
      email: string | null;
      parent_id: string | null;
      logistics_data: Record<string, unknown> | null;
    }>;
    const pIds = profs.map(p => p.id);
    const parentIds = profs.map(p => p.parent_id).filter((v): v is string => Boolean(v));
    const allRelIds = [...new Set([...pIds, ...parentIds])];

    const since7dIso = getBogotaDayRangeUtcIso(addBogotaDays(todayBogota, -7)).startUtcIso;

    const [ordersRes, quotesRes, draftsByProfRes, draftsByNameRes] = await Promise.all([
      pIds.length
        ? supabaseAdmin
            .from('orders')
            .select('sequence_id, profile_id, status, delivery_date, total, created_at')
            .in('profile_id', pIds)
            .neq('status', 'cancelled')
            .order('created_at', { ascending: false })
            .limit(12)
        : Promise.resolve({ data: [] }),
      allRelIds.length
        ? supabaseAdmin
            .from('quotes')
            .select('id, client_id, client_name, start_date, valid_until, status, model_snapshot_name')
            .in('client_id', allRelIds)
            .in('status', ['agreement', 'expired'])
        : Promise.resolve({ data: [] }),
      pIds.length
        ? supabaseAdmin
            .from('order_drafts')
            .select('id, profile_id, client_detected_name, source_email, email_subject, status, created_at')
            .in('profile_id', pIds)
            .gte('created_at', since7dIso)
            .order('created_at', { ascending: false })
            .limit(15)
        : Promise.resolve({ data: [] }),
      supabaseAdmin
        .from('order_drafts')
        .select('id, profile_id, client_detected_name, source_email, email_subject, status, created_at')
        .gte('created_at', since7dIso)
        .or(`client_detected_name.ilike.%${clientQuery}%,source_email.ilike.%${clientQuery}%`)
        .order('created_at', { ascending: false })
        .limit(15),
    ]);

    const seenDrafts = new Map<string, Record<string, unknown>>();
    for (const d of [...(draftsByProfRes.data || []), ...(draftsByNameRes.data || [])] as Array<Record<string, unknown>>) {
      seenDrafts.set(String(d.id), d);
    }

    const agreements = ((quotesRes.data || []) as Array<{
      id: string;
      client_id: string | null;
      client_name: string | null;
      start_date: string | null;
      valid_until: string | null;
      status: string;
    }>).map(q => {
      const daysLeft = q.valid_until ? diffBogotaDays(todayBogota, q.valid_until) : null;
      const lifecycle =
        daysLeft === null
          ? q.status
          : daysLeft < -30
          ? 'VENCIDO_CRITICO (>30d)'
          : daysLeft < 0
          ? 'VENCIDO_GRACIA (<=30d)'
          : daysLeft <= 5
          ? 'POR_VENCER (<=5d)'
          : 'VIGENTE';
      return { ...q, lifecycle, daysLeft };
    });

    return {
      profiles: profs.map(p => ({ id: p.id, name: p.company_name || p.contact_name, email: p.email, parentId: p.parent_id })),
      agreements,
      recentOrders: ordersRes.data || [],
      recentInboxDrafts: [...seenDrafts.values()].map(d => ({
        id: String(d.id).slice(0, 8),
        profileId: d.profile_id,
        detectedName: d.client_detected_name,
        sourceEmail: d.source_email,
        subject: d.email_subject,
        status: d.status,
        receivedBogota: formatBogotaTs(String(d.created_at || '')),
      })),
    };
  }

  if (name === 'query_product_prices') {
    const rawQueries = Array.isArray(args.productQueries)
      ? args.productQueries.map(q => String(q || '').trim()).filter(Boolean).slice(0, 6)
      : [];
    const clientQuery = typeof args.clientQuery === 'string' ? args.clientQuery.trim() : '';

    const catalog = await getProductCatalog(supabaseAdmin);
    const matchedProds: CatalogProductRow[] = [];
    const seen = new Set<string>();
    for (const q of rawQueries) {
      for (const p of catalog) {
        if (!seen.has(p.id) && matchesProductQuery(q, p.name, p.accounting_id)) {
          seen.add(p.id);
          matchedProds.push(p);
          if (matchedProds.length >= 12) break;
        }
      }
    }

    if (matchedProds.length === 0) {
      return { found: false, message: 'No se encontraron productos activos para consultar tarifas.' };
    }

    let clientAgreement: { quoteId: string; clientName: string; validUntil: string | null } | null = null;
    if (clientQuery) {
      const { data: matchedProfs } = await supabaseAdmin
        .from('profiles')
        .select('id, parent_id, company_name')
        .or(`company_name.ilike.%${clientQuery}%,contact_name.ilike.%${clientQuery}%`)
        .limit(5);

      const hierarchyIds: string[] = [];
      for (const prof of (matchedProfs || []) as Array<{ id: string; parent_id?: string | null }>) {
        if (prof.id && !hierarchyIds.includes(prof.id)) hierarchyIds.push(prof.id);
        if (prof.parent_id && !hierarchyIds.includes(prof.parent_id)) hierarchyIds.push(prof.parent_id);
      }

      if (hierarchyIds.length > 0) {
        const { data: qsByProfile } = await supabaseAdmin
          .from('quotes')
          .select('id, client_id, client_name, valid_until')
          .eq('status', 'agreement')
          .in('client_id', hierarchyIds)
          .order('created_at', { ascending: false });
        if (qsByProfile && qsByProfile.length > 0) {
          // Priorizar acuerdo directo de sede antes que matriz
          const directProfIds = new Set((matchedProfs || []).map((p: any) => p.id));
          const picked = qsByProfile.find((q: any) => directProfIds.has(q.client_id)) || qsByProfile[0];
          clientAgreement = { quoteId: picked.id, clientName: picked.client_name, validUntil: picked.valid_until };
        }
      }

      if (!clientAgreement) {
        const { data: qs } = await supabaseAdmin
          .from('quotes')
          .select('id, client_name, valid_until')
          .eq('status', 'agreement')
          .ilike('client_name', `%${clientQuery}%`)
          .order('valid_until', { ascending: false })
          .limit(1);
        if (qs && qs[0]) {
          clientAgreement = { quoteId: qs[0].id, clientName: qs[0].client_name, validUntil: qs[0].valid_until };
        }
      }
    }

    const pIds = matchedProds.map(p => p.id);
    const [pmRes, agRes] = await Promise.all([
      supabaseAdmin
        .from('pricing_model_prices')
        .select('model_id, product_id, price')
        .in('model_id', [GENERAL_INSTITUCIONAL_ID, CLIENTES_HOGAR_ID])
        .in('product_id', pIds),
      clientAgreement
        ? supabaseAdmin
            .from('quote_items')
            .select('product_id, unit_price')
            .eq('quote_id', clientAgreement.quoteId)
            .in('product_id', pIds)
        : Promise.resolve({ data: [] }),
    ]);

    const genMap = new Map<string, number>();
    const hogarMap = new Map<string, number>();
    for (const r of (pmRes.data || []) as Array<{ model_id: string; product_id: string; price: number }>) {
      if (r.model_id === GENERAL_INSTITUCIONAL_ID) genMap.set(r.product_id, Number(r.price));
      if (r.model_id === CLIENTES_HOGAR_ID) hogarMap.set(r.product_id, Number(r.price));
    }
    const agMap = new Map<string, number>();
    for (const r of (agRes.data || []) as Array<{ product_id: string; unit_price: number }>) {
      agMap.set(r.product_id, Number(r.unit_price));
    }

    return {
      found: true,
      clientAgreement,
      prices: matchedProds.map(p => ({
        accountingId: `#${p.accounting_id || '?'}`,
        name: p.name,
        uom: p.unit_of_measure || 'Kg',
        generalInstitucional: genMap.get(p.id) ?? null,
        clientesHogar: hogarMap.get(p.id) ?? null,
        agreementPrice: clientAgreement ? (agMap.has(p.id) ? agMap.get(p.id) : 'Fuera de acuerdo') : undefined,
      })),
    };
  }

  return { error: `Herramienta desconocida: ${name}` };
}
