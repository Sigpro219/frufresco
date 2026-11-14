import type { SupabaseClient } from '@supabase/supabase-js';
import { getBogotaDateString, getBogotaDayRangeUtcIso } from '@/lib/dateUtils';
import { parseBlindCountQuantity } from '@/lib/pricingUtils';

export const OPERATIONAL_ORDER_STATUSES = [
    'para_compra',
    'approved',
    'picking',
    'shipped',
    'delivered',
    'completed',
] as const;

export const OPERATIONAL_INVENTORY_REF_TYPES = [
    'purchase_reception',
    'waste_damage',
    'waste_cleaning',
    'food_bank',
    'blind_count',
    'blind_count_shift_close',
] as const;

export const BLIND_COUNT_REF_TYPES = [
    'blind_count',
    'blind_count_shift_close',
] as const;

export type InventorySourceKind =
    | 'official_closing'
    | 'unclosed_counts'
    | 'reopened_closing'
    | 'excel_baseline'
    | 'none';

export type InventoryAndonLevel = 'green' | 'amber' | 'red';

export type NovedadColumnKey = 'G' | 'QR' | 'X';

export interface DailyNovedadEntry {
    marked: boolean;
    by: string;
    at: string;
}

export type DailyNovedadMap = Partial<Record<NovedadColumnKey, DailyNovedadEntry>>;

export interface ClosingSnapshotItemLike {
    productId?: string | null;
    bodegaPost10am?: number | string | null;
    physicalCount?: number | string | null;
}

export interface BlindCountMovementRow {
    id: string;
    product_id: string | null;
    reference_type: string | null;
    notes: string | null;
    created_at: string | null;
}

export interface InitialInventoryResolution {
    stockMap: Record<string, number>;
    sourceDate: string | null;
    sourceKind: InventorySourceKind;
    isOfficialLocked: boolean;
    hasConflicts: boolean;
    conflictProductIds: string[];
    lastOperatedDate: string | null;
}

export interface DailyChecklistStatus {
    balanceDate: string;
    counts: {
        G: number;
        QR: number;
        X: number;
        T: number;
    };
    novedades: DailyNovedadMap;
    hasClosingRow: boolean;
    isClosingLocked: boolean;
    pendingSteps: string[];
    completedCount: number;
    totalSteps: number;
}

export interface InventoryGateStatus {
    level: InventoryAndonLevel;
    targetDate: string;
    lastOperatedDate: string | null;
    sourceDate: string | null;
    sourceKind: InventorySourceKind;
    isOfficialLocked: boolean;
    hasConflicts: boolean;
    conflictProductIds: string[];
    pendingColumns: string[];
    headline: string;
    detail: string;
}

/**
 * Pure deterministic reducer for Col T movements on a single Bogotá date.
 * Precedence: blind_count_shift_close > blind_count, then created_at DESC, then id DESC.
 */
export function reduceBlindCountMovements(movements: BlindCountMovementRow[]): {
    valuesByProduct: Record<string, number>;
    conflictProductIds: string[];
} {
    const byProduct = new Map<string, Array<{ row: BlindCountMovementRow; qty: number }>>();

    for (const row of movements) {
        if (!row.product_id) continue;
        const parsed = parseBlindCountQuantity(row.notes ?? null);
        if (parsed === null || Number.isNaN(parsed)) continue;
        const list = byProduct.get(row.product_id) || [];
        list.push({ row, qty: Math.max(0, parsed) });
        byProduct.set(row.product_id, list);
    }

    const valuesByProduct: Record<string, number> = {};
    const conflictProductIds: string[] = [];

    for (const [productId, entries] of byProduct.entries()) {
        if (entries.length > 1) {
            const firstQty = entries[0].qty;
            const hasDiff = entries.some((e) => Math.abs(e.qty - firstQty) > 0.001);
            if (hasDiff) conflictProductIds.push(productId);
        }

        entries.sort((a, b) => {
            const aShift = a.row.reference_type === 'blind_count_shift_close' ? 1 : 0;
            const bShift = b.row.reference_type === 'blind_count_shift_close' ? 1 : 0;
            if (aShift !== bShift) return bShift - aShift;

            const aTs = a.row.created_at ? new Date(a.row.created_at).getTime() : 0;
            const bTs = b.row.created_at ? new Date(b.row.created_at).getTime() : 0;
            if (aTs !== bTs) return bTs - aTs;

            return String(b.row.id).localeCompare(String(a.row.id));
        });

        valuesByProduct[productId] = entries[0].qty;
    }

    return { valuesByProduct, conflictProductIds };
}

/**
 * Pure resolution combining the latest closing (< targetDate) and latest Col T movements (< targetDate).
 * Enforces canonical field `bodegaPost10am ?? physicalCount ?? 0` with zero fallback to calculatedStock/inventory_stocks.
 */
export function resolveInitialInventoryFromData(params: {
    closing: {
        closing_date: string;
        is_locked?: boolean | null;
        closed_by_name?: string | null;
        snapshot_items?: ClosingSnapshotItemLike[] | null;
    } | null;
    movementDate: string | null;
    movements: BlindCountMovementRow[];
    lastOperatedDate?: string | null;
}): InitialInventoryResolution {
    const { closing, movementDate, movements, lastOperatedDate = null } = params;
    const stockMap: Record<string, number> = {};

    const closingDate = closing?.closing_date || null;
    const isExcelBaseline = Boolean(
        closing?.closed_by_name && closing.closed_by_name.toLowerCase().includes('carga masiva excel')
    );
    const isClosingLocked = Boolean(closing?.is_locked);

    const hasValidMovDate = Boolean(movementDate && movements.length > 0);
    const reduced = hasValidMovDate
        ? reduceBlindCountMovements(movements)
        : { valuesByProduct: {}, conflictProductIds: [] };
    const hasMovValues = Object.keys(reduced.valuesByProduct).length > 0;

    // Case 1: Movements are strictly more recent than closing (or no closing exists)
    if (hasValidMovDate && hasMovValues && (!closingDate || movementDate! > closingDate)) {
        for (const [productId, qty] of Object.entries(reduced.valuesByProduct)) {
            stockMap[productId] = qty;
        }
        return {
            stockMap,
            sourceDate: movementDate,
            sourceKind: 'unclosed_counts',
            isOfficialLocked: false,
            hasConflicts: reduced.conflictProductIds.length > 0,
            conflictProductIds: reduced.conflictProductIds,
            lastOperatedDate,
        };
    }

    // Case 2: Closing exists (and is >= movementDate)
    if (closingDate && closing) {
        if (Array.isArray(closing.snapshot_items)) {
            for (const item of closing.snapshot_items) {
                if (!item.productId || stockMap[item.productId] !== undefined) continue;
                const rawVal =
                    item.bodegaPost10am !== null && item.bodegaPost10am !== undefined
                        ? Number(item.bodegaPost10am)
                        : item.physicalCount !== null && item.physicalCount !== undefined
                            ? Number(item.physicalCount)
                            : 0;
                stockMap[item.productId] = Number.isFinite(rawVal) ? Math.max(0, rawVal) : 0;
            }
        }

        // Same-day Col T movements overlay onto closing baseline (§8.6.2)
        if (hasValidMovDate && hasMovValues && movementDate === closingDate) {
            for (const [productId, qty] of Object.entries(reduced.valuesByProduct)) {
                stockMap[productId] = qty;
            }
        }

        const sourceKind: InventorySourceKind = isExcelBaseline
            ? 'excel_baseline'
            : isClosingLocked
                ? 'official_closing'
                : 'reopened_closing';

        return {
            stockMap,
            sourceDate: closingDate,
            sourceKind,
            isOfficialLocked: sourceKind === 'official_closing',
            hasConflicts: movementDate === closingDate ? reduced.conflictProductIds.length > 0 : false,
            conflictProductIds: movementDate === closingDate ? reduced.conflictProductIds : [],
            lastOperatedDate,
        };
    }

    // Case 3: Neither closing nor Col T movements exist
    return {
        stockMap,
        sourceDate: null,
        sourceKind: 'none',
        isOfficialLocked: false,
        hasConflicts: false,
        conflictProductIds: [],
        lastOperatedDate,
    };
}

/**
 * Finds the most recent Bogotá date strictly prior to `beforeDate` that had operational orders
 * or operational inventory movements (G, Q, R, X, T).
 */
export async function findLastOperatedDate(
    supabase: SupabaseClient,
    beforeDate: string
): Promise<string | null> {
    const { startUtcIso: beforeStartUtcIso } = getBogotaDayRangeUtcIso(beforeDate);

    const [ordersRes, movsRes] = await Promise.all([
        supabase
            .from('orders')
            .select('delivery_date')
            .lt('delivery_date', beforeDate)
            .in('status', [...OPERATIONAL_ORDER_STATUSES])
            .order('delivery_date', { ascending: false })
            .limit(1)
            .maybeSingle(),
        supabase
            .from('inventory_movements')
            .select('created_at')
            .lt('created_at', beforeStartUtcIso)
            .in('reference_type', [...OPERATIONAL_INVENTORY_REF_TYPES])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
    ]);

    const lastOrderDate = (ordersRes.data?.delivery_date as string | undefined) || null;
    const lastMovDate = movsRes.data?.created_at
        ? getBogotaDateString(movsRes.data.created_at as string)
        : null;

    if (lastOrderDate && lastMovDate) {
        return lastOrderDate >= lastMovDate ? lastOrderDate : lastMovDate;
    }
    return lastOrderDate || lastMovDate || null;
}

/**
 * Canonical two-step initial inventory resolver for all FruFresco modules (SPEC.md Escenario 457).
 */
export async function resolveInitialInventory(params: {
    supabase: SupabaseClient;
    targetDate: string;
    isSandbox?: boolean;
}): Promise<InitialInventoryResolution> {
    const { supabase, targetDate, isSandbox = false } = params;
    const { startUtcIso: targetStartUtcIso } = getBogotaDayRangeUtcIso(targetDate);

    let closingRecord: {
        closing_date: string;
        is_locked?: boolean | null;
        closed_by_name?: string | null;
        snapshot_items?: ClosingSnapshotItemLike[] | null;
    } | null = null;

    if (isSandbox) {
        try {
            const { data: sbClosings } = await supabase
                .from('app_settings')
                .select('key, value')
                .like('key', 'sandbox_daily_closing_%');

            const validPast = (sbClosings || [])
                .map((c: { key: string; value: unknown }) => {
                    const d = c.key.replace('sandbox_daily_closing_', '');
                    const parsed = typeof c.value === 'string' ? JSON.parse(c.value) : c.value;
                    return { date: d, val: parsed };
                })
                .filter((c: { date: string }) => c.date < targetDate)
                .sort((a: { date: string }, b: { date: string }) => b.date.localeCompare(a.date));

            if (validPast.length > 0 && validPast[0].val) {
                closingRecord = {
                    closing_date: validPast[0].date,
                    is_locked: validPast[0].val.is_locked ?? true,
                    closed_by_name: validPast[0].val.closed_by_name ?? null,
                    snapshot_items: validPast[0].val.snapshot_items ?? null,
                };
            }
        } catch (err) {
            console.warn('[resolveInitialInventory] Error leyendo cierre sandbox:', err);
        }
    } else {
        const { data: closeData } = await supabase
            .from('daily_inventory_closings')
            .select('closing_date, is_locked, closed_by_name, snapshot_items')
            .lt('closing_date', targetDate)
            .order('closing_date', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (closeData) {
            closingRecord = closeData as typeof closingRecord;
        }
    }

    // Two-step Col T query: 1) max Bogotá date < targetDate, 2) paginated fetch ONLY for that date
    let maxMovDate: string | null = null;
    let dayMovements: BlindCountMovementRow[] = [];

    if (!isSandbox) {
        const { data: latestMov } = await supabase
            .from('inventory_movements')
            .select('created_at')
            .in('reference_type', [...BLIND_COUNT_REF_TYPES])
            .lt('created_at', targetStartUtcIso)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (latestMov?.created_at) {
            maxMovDate = getBogotaDateString(latestMov.created_at as string);
            if (maxMovDate && maxMovDate < targetDate) {
                const { startUtcIso, endUtcIso } = getBogotaDayRangeUtcIso(maxMovDate);
                let from = 0;
                const step = 1000;
                let hasMore = true;

                while (hasMore) {
                    const { data: batch, error } = await supabase
                        .from('inventory_movements')
                        .select('id, product_id, reference_type, notes, created_at')
                        .in('reference_type', [...BLIND_COUNT_REF_TYPES])
                        .gte('created_at', startUtcIso)
                        .lte('created_at', endUtcIso)
                        .order('created_at', { ascending: false })
                        .range(from, from + step - 1);

                    if (error || !batch || batch.length === 0) {
                        hasMore = false;
                    } else {
                        dayMovements = dayMovements.concat(batch as BlindCountMovementRow[]);
                        if (batch.length < step) hasMore = false;
                        else from += step;
                    }
                }
            }
        }
    }

    return resolveInitialInventoryFromData({
        closing: closingRecord,
        movementDate: maxMovDate,
        movements: dayMovements,
    });
}

/**
 * Computes checklist status for the 5 manual closing milestones on `balanceDate`.
 */
export async function getDailyManualChecklistStatus(
    supabase: SupabaseClient,
    balanceDate: string
): Promise<DailyChecklistStatus> {
    const { startUtcIso, endUtcIso } = getBogotaDayRangeUtcIso(balanceDate);

    const [movsRes, novRes, closingRes] = await Promise.all([
        supabase
            .from('inventory_movements')
            .select('reference_type')
            .in('reference_type', [...OPERATIONAL_INVENTORY_REF_TYPES])
            .gte('created_at', startUtcIso)
            .lte('created_at', endUtcIso)
            .range(0, 4999),
        supabase
            .from('app_settings')
            .select('value')
            .eq('key', `daily_inventory_novedad_${balanceDate}`)
            .maybeSingle(),
        supabase
            .from('daily_inventory_closings')
            .select('is_locked')
            .eq('closing_date', balanceDate)
            .maybeSingle(),
    ]);

    const counts = { G: 0, QR: 0, X: 0, T: 0 };
    for (const m of (movsRes.data || []) as Array<{ reference_type: string | null }>) {
        if (m.reference_type === 'purchase_reception') counts.G++;
        else if (m.reference_type === 'waste_damage' || m.reference_type === 'waste_cleaning') counts.QR++;
        else if (m.reference_type === 'food_bank') counts.X++;
        else if (m.reference_type === 'blind_count' || m.reference_type === 'blind_count_shift_close') counts.T++;
    }

    let novedades: DailyNovedadMap = {};
    if (novRes.data?.value) {
        try {
            novedades = typeof novRes.data.value === 'string' ? JSON.parse(novRes.data.value) : novRes.data.value;
        } catch {
            novedades = {};
        }
    }

    const hasClosingRow = Boolean(closingRes.data);
    const isClosingLocked = Boolean(closingRes.data?.is_locked);

    const doneG = counts.G > 0 || Boolean(novedades.G?.marked);
    const doneQR = counts.QR > 0 || Boolean(novedades.QR?.marked);
    const doneX = counts.X > 0 || Boolean(novedades.X?.marked);
    const doneT = counts.T > 0;
    const doneLock = isClosingLocked;

    const pendingSteps: string[] = [];
    if (!doneG) pendingSteps.push('Entradas (Col G)');
    if (!doneQR) pendingSteps.push('Desperdicio/Basura (Col Q-R)');
    if (!doneX) pendingSteps.push('Donaciones (Col X)');
    if (!doneT) pendingSteps.push('Conteo Físico (Col T)');
    if (!doneLock) pendingSteps.push('Cierre Diario Oficial');

    const completedCount = [doneG, doneQR, doneX, doneT, doneLock].filter(Boolean).length;

    return {
        balanceDate,
        counts,
        novedades,
        hasClosingRow,
        isClosingLocked,
        pendingSteps,
        completedCount,
        totalSteps: 5,
    };
}

/**
 * Evaluates the Andon traffic light (green/amber/red) for `/admin/orders/loading` and Dispatch Wizard.
 */
export async function evaluateInventoryGateStatus(params: {
    supabase: SupabaseClient;
    targetDate?: string;
}): Promise<InventoryGateStatus> {
    const targetDate = params.targetDate || getBogotaDateString();
    const { supabase } = params;

    const [lastOperatedDate, resolved] = await Promise.all([
        findLastOperatedDate(supabase, targetDate),
        resolveInitialInventory({ supabase, targetDate }),
    ]);

    if (!lastOperatedDate) {
        return {
            level: 'green',
            targetDate,
            lastOperatedDate: null,
            sourceDate: resolved.sourceDate,
            sourceKind: resolved.sourceKind,
            isOfficialLocked: true,
            hasConflicts: false,
            conflictProductIds: [],
            pendingColumns: [],
            headline: 'Sin jornada previa pendiente',
            detail: 'No existen jornadas operadas anteriores por cerrar.',
        };
    }

    const checklist = await getDailyManualChecklistStatus(supabase, lastOperatedDate);
    const coversLastOperated = Boolean(resolved.sourceDate && resolved.sourceDate >= lastOperatedDate);

    if (
        coversLastOperated &&
        resolved.sourceKind === 'official_closing' &&
        resolved.isOfficialLocked &&
        !resolved.hasConflicts &&
        checklist.pendingSteps.length === 0
    ) {
        return {
            level: 'green',
            targetDate,
            lastOperatedDate,
            sourceDate: resolved.sourceDate,
            sourceKind: resolved.sourceKind,
            isOfficialLocked: true,
            hasConflicts: false,
            conflictProductIds: [],
            pendingColumns: [],
            headline: `Inventario Cerrado (${lastOperatedDate})`,
            detail: `Cierre oficial sellado del ${lastOperatedDate} listo para heredar.`,
        };
    }

    if (coversLastOperated && resolved.sourceKind !== 'none') {
        const reasonTag = resolved.sourceKind === 'official_closing'
            ? 'Cierre oficial con columnas pendientes del checklist'
            : resolved.sourceKind === 'reopened_closing'
                ? 'Cierre reabierto sin volver a sellar'
                : resolved.sourceKind === 'excel_baseline'
                    ? 'Base Excel sin Cierre Oficial'
                    : 'Conteo cargado sin Cierre Oficial';
        return {
            level: 'amber',
            targetDate,
            lastOperatedDate,
            sourceDate: resolved.sourceDate,
            sourceKind: resolved.sourceKind,
            isOfficialLocked: false,
            hasConflicts: resolved.hasConflicts,
            conflictProductIds: resolved.conflictProductIds,
            pendingColumns: checklist.pendingSteps,
            headline: `OJO: Pendiente Cierre Oficial (${lastOperatedDate})`,
            detail: `${reasonTag}${resolved.hasConflicts ? ` • ${resolved.conflictProductIds.length} conflicto(s) Col T` : ''}. Pendiente: ${checklist.pendingSteps.join(', ') || 'Sellar Cierre'}.`,
        };
    }

    return {
        level: 'red',
        targetDate,
        lastOperatedDate,
        sourceDate: resolved.sourceDate,
        sourceKind: resolved.sourceKind,
        isOfficialLocked: false,
        hasConflicts: resolved.hasConflicts,
        conflictProductIds: resolved.conflictProductIds,
        pendingColumns: checklist.pendingSteps,
        headline: `OJO: Inventario SIN cerrar (${lastOperatedDate})`,
        detail: `La última jornada operada (${lastOperatedDate}) no tiene cierre ni conteo físico.${resolved.sourceDate ? ` Último respaldo: ${resolved.sourceDate}.` : ''}`,
    };
}

/**
 * Marks or clears "Sin novedad hoy (0)" for an optional manual column in `app_settings`.
 */
export async function saveDailyNovedadZero(params: {
    supabase: SupabaseClient;
    balanceDate: string;
    colKey: NovedadColumnKey;
    marked: boolean;
    operatorName: string;
}): Promise<DailyNovedadMap> {
    const { supabase, balanceDate, colKey, marked, operatorName } = params;
    const settingsKey = `daily_inventory_novedad_${balanceDate}`;

    const { data: existingRow } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', settingsKey)
        .maybeSingle();

    let current: DailyNovedadMap = {};
    if (existingRow?.value) {
        try {
            current = typeof existingRow.value === 'string' ? JSON.parse(existingRow.value) : existingRow.value;
        } catch {
            current = {};
        }
    }

    const next: DailyNovedadMap = {
        ...current,
        [colKey]: marked
            ? { marked: true, by: operatorName, at: new Date().toISOString() }
            : { marked: false, by: operatorName, at: new Date().toISOString() },
    };

    const { error } = await supabase.from('app_settings').upsert(
        {
            key: settingsKey,
            value: JSON.stringify(next),
            description: `Checklist Sin Novedad Hoy para balance diario ${balanceDate}`,
            updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
    );

    if (error) throw error;
    return next;
}

/**
 * Shared Col T deduplicator across all writers: removes prior `blind_count` AND `blind_count_shift_close`
 * rows for the given productIds within the Bogotá day before inserting new Col T records.
 */
export async function replaceBlindCountMovementsForDate(params: {
    supabase: SupabaseClient;
    productIds: string[];
    targetDate: string;
}): Promise<void> {
    const { supabase, productIds, targetDate } = params;
    const uniqueIds = Array.from(new Set(productIds.filter(Boolean)));
    if (uniqueIds.length === 0) return;

    const { startUtcIso, endUtcIso } = getBogotaDayRangeUtcIso(targetDate);
    const CHUNK = 100;

    for (let i = 0; i < uniqueIds.length; i += CHUNK) {
        const chunk = uniqueIds.slice(i, i + CHUNK);
        const { error } = await supabase
            .from('inventory_movements')
            .delete()
            .in('product_id', chunk)
            .in('reference_type', [...BLIND_COUNT_REF_TYPES])
            .gte('created_at', startUtcIso)
            .lte('created_at', endUtcIso);

        if (error) throw error;
    }
}

/**
 * Persists an audited emergency override to `public.inventory_gate_overrides`
 * (with fallback to `app_settings` if migration has not yet been applied in remote DB).
 */
export async function recordInventoryGateOverride(params: {
    supabase: SupabaseClient;
    targetOperationDate: string;
    pendingClosingDate: string | null;
    sourceKind: InventorySourceKind;
    reason: string;
    authorizedBy: string | null;
    authorizedByName: string;
}): Promise<void> {
    const {
        supabase,
        targetOperationDate,
        pendingClosingDate,
        sourceKind,
        reason,
        authorizedBy,
        authorizedByName,
    } = params;

    const payload = {
        target_operation_date: targetOperationDate,
        pending_closing_date: pendingClosingDate,
        source_kind: sourceKind,
        reason: reason.trim(),
        authorized_by: authorizedBy,
        authorized_by_name: authorizedByName,
    };

    const { error } = await supabase.from('inventory_gate_overrides').insert(payload);
    if (!error) return;

    // Safe fallback if table migration hasn't been executed on Supabase yet
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('does not exist') || msg.includes('schema cache') || error.code === '42P01' || error.code === 'PGRST205') {
        const fallbackKey = `inventory_gate_override_${targetOperationDate}_${Date.now()}`;
        const { error: fbErr } = await supabase.from('app_settings').insert({
            key: fallbackKey,
            value: JSON.stringify({ ...payload, created_at: new Date().toISOString() }),
            description: `Emergency override audit log for ${targetOperationDate}`,
            updated_at: new Date().toISOString(),
        });
        if (fbErr) throw fbErr;
        return;
    }

    throw error;
}
