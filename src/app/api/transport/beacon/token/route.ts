import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { verifySessionAndPermission } from '@/lib/auth';
import { isActiveBeaconRouteStatus, signBeaconToken } from '@/lib/telemetry/beaconToken';

const RequestSchema = z.object({
    route_id: z.string().uuid('route_id inválido'),
});

function getSupabaseAdmin() {
    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/^["']|["']$/g, '');
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/^["']|["']$/g, '');
    return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
    try {
        const auth = await verifySessionAndPermission(req, 'admin.transport.edit');
        if (!auth.authorized) {
            return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 401 });
        }

        const raw = await req.json().catch(() => null);
        const parsed = RequestSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: 'route_id inválido' }, { status: 400 });
        }

        const supabaseAdmin = getSupabaseAdmin();
        const { data: route, error: rErr } = await supabaseAdmin
            .from('routes')
            .select('id, vehicle_plate, status')
            .eq('id', parsed.data.route_id)
            .maybeSingle();

        if (rErr) throw rErr;
        if (!route) {
            return NextResponse.json({ error: 'Ruta no encontrada' }, { status: 404 });
        }
        if (!isActiveBeaconRouteStatus(route.status)) {
            return NextResponse.json({ error: `La ruta está en estado ${route.status} y no admite baliza` }, { status: 400 });
        }
        const plate = (route.vehicle_plate || '').trim().toUpperCase();
        if (!plate) {
            return NextResponse.json({ error: 'La ruta no tiene placa asignada' }, { status: 400 });
        }

        const { data: vehicle, error: vErr } = await supabaseAdmin
            .from('fleet_vehicles')
            .select('id, plate, gps_imei, gps_kit_id, status')
            .ilike('plate', plate)
            .maybeSingle();

        if (vErr) throw vErr;
        if (!vehicle || vehicle.status === 'inactive') {
            return NextResponse.json({ error: `La placa ${plate} no está registrada o está inactiva en Flota` }, { status: 400 });
        }
        if (vehicle.gps_imei && !vehicle.gps_kit_id) {
            return NextResponse.json({ error: `El vehículo ${plate} ya cuenta con GPS satelital fijo activo` }, { status: 400 });
        }

        const { token, payload } = signBeaconToken({ route_id: route.id, plate: vehicle.plate });
        return NextResponse.json({
            success: true,
            token,
            track_path: `/track/${token}`,
            plate: payload.plate,
            route_id: payload.route_id,
            expires_at: new Date(payload.exp).toISOString(),
        });
    } catch (err: any) {
        console.error('[Beacon Token API] Error:', err);
        return NextResponse.json({ error: err?.message || 'Error generando baliza QR' }, { status: 500 });
    }
}
