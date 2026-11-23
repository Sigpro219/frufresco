import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isActiveBeaconRouteStatus, verifyBeaconToken } from '@/lib/telemetry/beaconToken';

export const dynamic = 'force-dynamic';

function getSupabaseAdmin() {
    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/^["']|["']$/g, '');
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/^["']|["']$/g, '');
    return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const token = req.headers.get('x-gps-beacon-token') || searchParams.get('token');
        const check = verifyBeaconToken(token);

        if (!check.valid || !check.payload) {
            return NextResponse.json(
                { valid: false, error: check.reason === 'expired' ? 'Enlace expirado' : 'Enlace inválido' },
                { status: 401 }
            );
        }

        const supabaseAdmin = getSupabaseAdmin();
        const { data: route, error } = await supabaseAdmin
            .from('routes')
            .select('id, vehicle_plate, status, stops_count')
            .eq('id', check.payload.route_id)
            .maybeSingle();

        if (error) throw error;
        if (!route || !isActiveBeaconRouteStatus(route.status) || (route.vehicle_plate || '').trim().toUpperCase() !== check.payload.plate) {
            return NextResponse.json(
                { valid: false, error: 'La ruta ya finalizó o fue reasignada' },
                { status: 410 }
            );
        }

        return NextResponse.json({
            valid: true,
            plate: check.payload.plate,
            route_status: route.status,
            total_stops: Number(route.stops_count) || 0,
            expires_at: new Date(check.payload.exp).toISOString(),
        });
    } catch (err: any) {
        console.error('[Beacon Verify API] Error:', err);
        return NextResponse.json({ valid: false, error: 'Error validando baliza' }, { status: 500 });
    }
}
