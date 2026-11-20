import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { verifySessionAndPermission, verifySessionAndRole } from '@/lib/auth';
import { getOperationalTargetDate } from '@/lib/ops/operationalCells';
import { isOperationalStaffProfile, type OperationalShiftMode, type OperationalShiftState } from '@/lib/ops/operationalShift';

export const dynamic = 'force-dynamic';

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY);

const APP_SETTINGS_KEY = 'operational_shift_state';

const ShiftActionSchema = z.object({
    action: z.enum(['set_mode', 'close_day', 'reopen_day']),
    shift_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    mode: z.enum(['manual_mirror', 'digital_native']).optional(),
    close_unbilled_pending: z.boolean().optional().default(false),
    notes: z.string().max(500).optional()
});

async function readShiftState(supabase: any, targetDate: string): Promise<OperationalShiftState> {
    // 1. Intentar tabla canónica public.operational_shifts
    const { data: tableRow, error: tableErr } = await supabase
        .from('operational_shifts')
        .select('*')
        .eq('shift_date', targetDate)
        .maybeSingle();

    if (!tableErr) {
        if (tableRow) {
            return { ...tableRow, source: 'operational_shifts' };
        }
        return {
            shift_date: targetDate,
            mode: 'manual_mirror',
            status: 'open',
            source: 'operational_shifts'
        };
    }

    // 2. Fallback resiliente en app_settings mientras corre DDL
    const { data: settingRow } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', APP_SETTINGS_KEY)
        .maybeSingle();

    if (settingRow?.value) {
        try {
            const parsed = JSON.parse(settingRow.value);
            if (parsed?.shift_date === targetDate) {
                return { ...parsed, source: 'app_settings' };
            }
        } catch { /* ignore */ }
    }

    return {
        shift_date: targetDate,
        mode: 'manual_mirror',
        status: 'open',
        source: 'app_settings'
    };
}

async function persistShiftState(supabase: any, state: OperationalShiftState): Promise<OperationalShiftState> {
    const payload = {
        shift_date: state.shift_date,
        mode: state.mode,
        status: state.status,
        opened_by: state.opened_by || null,
        closed_by: state.closed_by || null,
        closed_at: state.closed_at || null,
        notes: state.notes || null,
        updated_at: new Date().toISOString()
    };

    const { data: upserted, error: upsertErr } = await supabase
        .from('operational_shifts')
        .upsert(payload, { onConflict: 'shift_date' })
        .select('*')
        .maybeSingle();

    if (!upsertErr && upserted) {
        return { ...upserted, source: 'operational_shifts' };
    }

    // Fallback en app_settings
    await supabase
        .from('app_settings')
        .upsert({ key: APP_SETTINGS_KEY, value: JSON.stringify(payload) }, { onConflict: 'key' });

    return { ...payload, source: 'app_settings' };
}

export async function GET(req: NextRequest) {
    try {
        const auth = await verifySessionAndRole(req);
        if (!auth.authorized || !auth.user) {
            return NextResponse.json({ success: false, error: auth.error || 'Sesión requerida' }, { status: 401 });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data: callerProfile } = await supabase
            .from('profiles')
            .select('role, profile_type')
            .eq('id', auth.user.id)
            .maybeSingle();

        if (!isOperationalStaffProfile(callerProfile)) {
            return NextResponse.json({ success: false, error: 'Acceso restringido a personal operativo' }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const dateParam = searchParams.get('date');
        const targetDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
            ? dateParam
            : getOperationalTargetDate(20);

        const shift = await readShiftState(supabase, targetDate);

        // Conteo rápido de backlog rezagado de fechas anteriores
        const { count: staleOrdersCount } = await supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .lt('delivery_date', targetDate)
            .in('status', ['para_compra', 'approved', 'picking', 'in_preparation', 'ready_for_dispatch', 'in_transit']);

        return NextResponse.json({
            success: true,
            shift,
            stale_orders_count: staleOrdersCount || 0
        });
    } catch (err: any) {
        console.error('[API /api/ops/shifts GET]', err);
        return NextResponse.json({ success: false, error: err?.message || 'Error leyendo turno' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        let auth = await verifySessionAndPermission(req, 'admin.orders');
        if (!auth.authorized) {
            auth = await verifySessionAndPermission(req, 'admin.transport.edit');
        }
        if (!auth.authorized) {
            return NextResponse.json({ success: false, error: auth.error || 'No autorizado' }, { status: 403 });
        }

        const rawBody = await req.json().catch(() => null);
        const parsed = ShiftActionSchema.safeParse(rawBody);
        if (!parsed.success) {
            return NextResponse.json({
                success: false,
                error: 'Payload inválido en /api/ops/shifts',
                details: parsed.error.issues
            }, { status: 400 });
        }

        const { action, mode, close_unbilled_pending, notes } = parsed.data;
        const targetDate = parsed.data.shift_date || getOperationalTargetDate(20);
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const current = await readShiftState(supabase, targetDate);

        if (action === 'set_mode') {
            const nextMode: OperationalShiftMode = mode || 'manual_mirror';
            const saved = await persistShiftState(supabase, {
                ...current,
                mode: nextMode,
                opened_by: current.opened_by || auth.user?.id || null,
                notes: notes ?? current.notes
            });
            return NextResponse.json({ success: true, shift: saved });
        }

        if (action === 'reopen_day') {
            const saved = await persistShiftState(supabase, {
                ...current,
                status: 'open',
                closed_at: null,
                closed_by: null,
                notes: notes ?? current.notes
            });
            return NextResponse.json({ success: true, shift: saved });
        }

        // action === 'close_day': Cierre de la Operación del Día
        const activeStatuses = ['para_compra', 'approved', 'picking', 'in_preparation', 'ready_for_dispatch', 'in_transit'];
        const { data: openOrders, error: ordErr } = await supabase
            .from('orders')
            .select('id, sequence_id, status, billing_cut_id, invoice_id, delivery_date')
            .lte('delivery_date', targetDate)
            .in('status', activeStatuses);

        if (ordErr) throw ordErr;

        const openOrderIds = (openOrders || []).map((o: any) => o.id).filter(Boolean);
        const deliveredStopOrderIds = new Set<string>();
        if (openOrderIds.length > 0) {
            for (let i = 0; i < openOrderIds.length; i += 200) {
                const slice = openOrderIds.slice(i, i + 200);
                const { data: delStops, error: delStopsErr } = await supabase
                    .from('route_stops')
                    .select('order_id')
                    .in('order_id', slice)
                    .eq('status', 'delivered');
                if (delStopsErr) throw delStopsErr;
                for (const s of delStops || []) {
                    if (s.order_id) deliveredStopOrderIds.add(s.order_id);
                }
            }
        }

        const verifiedOrderIds: string[] = [];
        const unbilledSameDayOrders: Array<{ id: string; sequence_id: number | null; status: string }> = [];

        (openOrders || []).forEach((o: any) => {
            const isBilled = Boolean(o.billing_cut_id || o.invoice_id);
            const isDeliveredStop = deliveredStopOrderIds.has(o.id);
            if (isBilled || isDeliveredStop || close_unbilled_pending) {
                verifiedOrderIds.push(o.id);
            } else {
                unbilledSameDayOrders.push({ id: o.id, sequence_id: o.sequence_id, status: o.status });
            }
        });

        let closedOrdersCount = 0;
        if (verifiedOrderIds.length > 0) {
            for (let i = 0; i < verifiedOrderIds.length; i += 100) {
                const batch = verifiedOrderIds.slice(i, i + 100);
                const { error: updErr } = await supabase
                    .from('orders')
                    .update({ status: 'delivered' })
                    .in('id', batch);
                if (updErr) throw updErr;
                closedOrdersCount += batch.length;
            }
        }

        // Cerrar únicamente rutas abiertas cuyas paradas pertenezcan a pedidos con delivery_date <= targetDate
        const { data: openRoutes, error: openRoutesErr } = await supabase
            .from('routes')
            .select('id, route_stops(orders:order_id(delivery_date))')
            .neq('status', 'completed');
        if (openRoutesErr) throw openRoutesErr;

        const rIdsToClose = (openRoutes || [])
            .filter((r: any) => {
                const stops = Array.isArray(r.route_stops) ? r.route_stops : [];
                if (stops.length === 0) return false;
                return stops.every((s: any) => {
                    const dDate = s?.orders?.delivery_date;
                    return typeof dDate === 'string' && dDate <= targetDate;
                });
            })
            .map((r: any) => r.id);

        let closedRoutesCount = 0;
        if (rIdsToClose.length > 0) {
            const { error: closeRouteErr } = await supabase
                .from('routes')
                .update({ status: 'completed' })
                .in('id', rIdsToClose);
            if (closeRouteErr) throw closeRouteErr;
            closedRoutesCount = rIdsToClose.length;
        }

        const saved = await persistShiftState(supabase, {
            ...current,
            status: 'closed',
            closed_by: auth.user?.id || null,
            closed_at: new Date().toISOString(),
            notes: notes ?? `Cierre operativo: ${closedOrdersCount} pedidos y ${closedRoutesCount} rutas cerradas.`
        });

        return NextResponse.json({
            success: true,
            shift: saved,
            closed_orders_count: closedOrdersCount,
            closed_routes_count: closedRoutesCount,
            pending_reconciliation_count: unbilledSameDayOrders.length,
            remaining_unbilled_orders: unbilledSameDayOrders
        });
    } catch (err: any) {
        console.error('[API /api/ops/shifts POST]', err);
        return NextResponse.json({ success: false, error: err?.message || 'Error en cierre de operación' }, { status: 500 });
    }
}
