import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { verifySessionAndRole } from '@/lib/auth';
import { isOperationalStaffProfile } from '@/lib/ops/operationalShift';

// 1. Validación Zod Estricta (Mandamiento 1)
const PingItemSchema = z.object({
    plate: z.string().min(3, 'Placa requerida').max(10),
    latitude: z.number().min(-90).max(90, 'Latitud fuera de rango (-90 a 90)'),
    longitude: z.number().min(-180).max(180, 'Longitud fuera de rango (-180 a 180)'),
    speed: z.number().min(0).max(250).optional().default(0),
    heading: z.number().min(0).max(360).optional().default(0),
    accuracy: z.number().optional(),
    battery_level: z.number().min(0).max(100).optional(),
    ignition_status: z.boolean().optional(),
    tracking_source: z.enum(['hardware_gps', 'mobile_app']).optional().default('mobile_app'),
    timestamp: z.string().optional()
}).refine((p) => !(p.latitude === 0 && p.longitude === 0), {
    message: 'Coordenada (0,0) inválida'
});

const TelemetryPayloadSchema = z.union([
    PingItemSchema,
    z.array(PingItemSchema).min(1, 'Debe incluir al menos un reporte telemático')
]);

function getSupabaseAdmin() {
    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/^["']|["']$/g, '');
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim().replace(/^["']|["']$/g, '');
    return createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false }
    });
}

export async function POST(req: NextRequest) {
    const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
    const startTime = Date.now();

    try {
        const auth = await verifySessionAndRole(req);
        if (!auth.authorized || !auth.user) {
            return NextResponse.json(
                { success: false, error: { code: 'UNAUTHORIZED', message: auth.error || 'Sesión requerida' }, requestId },
                { status: 401, headers: { 'x-request-id': requestId } }
            );
        }

        const supabaseAdmin = getSupabaseAdmin();
        const { data: callerProfile } = await supabaseAdmin
            .from('profiles')
            .select('role')
            .eq('id', auth.user.id)
            .maybeSingle();

        if (!isOperationalStaffProfile(callerProfile)) {
            return NextResponse.json(
                { success: false, error: { code: 'FORBIDDEN', message: 'Telemetría restringida a personal operativo' }, requestId },
                { status: 403, headers: { 'x-request-id': requestId } }
            );
        }

        const rawBody = await req.json().catch(() => null);
        const parsed = TelemetryPayloadSchema.safeParse(rawBody);

        if (!parsed.success) {
            return NextResponse.json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Payload telemático no cumple con el esquema canónico',
                    details: parsed.error.issues.map(i => ({ field: i.path.join('.'), issue: i.message }))
                },
                requestId
            }, { 
                status: 422,
                headers: { 'x-request-id': requestId }
            });
        }

        const pings = Array.isArray(parsed.data) ? parsed.data : [parsed.data];

        // 2. Procesamiento paralelo concurrente con prioridad estricta hardware_gps y cero placas inventadas
        const updatePromises = pings.map(async (ping) => {
            const plate = ping.plate.trim().toUpperCase();
            const now = ping.timestamp ? new Date(ping.timestamp).toISOString() : new Date().toISOString();

            const { data: existingVehicle, error: fetchVehErr } = await supabaseAdmin
                .from('fleet_vehicles')
                .select('id, plate, tracking_source, last_gps_sync, gps_imei')
                .ilike('plate', plate)
                .maybeSingle();

            if (fetchVehErr) {
                console.warn(`[Telemetry API][${requestId}] Error consultando placa ${plate}:`, fetchVehErr.message);
                throw fetchVehErr;
            }

            if (!existingVehicle) {
                return { plate, status: 'ignored_unregistered' as const };
            }

            const hardwareRecent = Boolean(
                existingVehicle.gps_imei &&
                existingVehicle.tracking_source === 'hardware_gps' &&
                existingVehicle.last_gps_sync &&
                Date.now() - new Date(existingVehicle.last_gps_sync).getTime() < 5 * 60 * 1000
            );

            if (ping.tracking_source === 'mobile_app' && hardwareRecent) {
                return { plate: existingVehicle.plate, status: 'skipped_hardware_gps_priority' as const };
            }

            const { error: updateErr } = await supabaseAdmin
                .from('fleet_vehicles')
                .update({
                    last_latitude: ping.latitude,
                    last_longitude: ping.longitude,
                    speed: ping.speed,
                    heading: ping.heading,
                    ignition_status: ping.ignition_status ?? ((ping.speed ?? 0) > 0),
                    last_gps_sync: now,
                    tracking_source: ping.tracking_source
                })
                .eq('id', existingVehicle.id);

            if (updateErr) {
                console.warn(`[Telemetry API][${requestId}] Error actualizando placa ${plate}:`, updateErr.message);
                throw updateErr;
            }

            // Historial miga de pan no-bloqueante
            supabaseAdmin.from('vehicle_gps_logs').insert({
                vehicle_id: existingVehicle.id,
                plate: existingVehicle.plate,
                latitude: ping.latitude,
                longitude: ping.longitude,
                speed: ping.speed,
                heading: ping.heading,
                accuracy: ping.accuracy,
                battery_level: ping.battery_level,
                ignition_status: ping.ignition_status,
                tracking_source: ping.tracking_source,
                created_at: now
            }).then(null, () => {});

            return { plate: existingVehicle.plate, status: 'updated' as const };
        });

        const settled = await Promise.allSettled(updatePromises);
        const pingResults: Array<{ plate: string; status: 'ignored_unregistered' | 'skipped_hardware_gps_priority' | 'updated' }> = [];
        for (const s of settled) {
            if (s.status === 'fulfilled') {
                pingResults.push({ plate: String(s.value.plate), status: s.value.status });
            }
        }
        const processedPlates = pingResults
            .filter(r => r.status === 'updated')
            .map(r => r.plate);

        const durationMs = Date.now() - startTime;

        return NextResponse.json({
            success: true,
            data: {
                processed_count: processedPlates.length,
                processed_plates: processedPlates,
                results: pingResults,
                total_received: pings.length
            },
            meta: {
                timestamp: new Date().toISOString(),
                requestId,
                durationMs
            },
            // Retrocompatibilidad
            processed_count: processedPlates.length
        }, {
            status: 200,
            headers: { 'x-request-id': requestId }
        });

    } catch (err: any) {
        const durationMs = Date.now() - startTime;
        console.error(`[Telemetry API Error][${requestId}]:`, err.message || err);

        return NextResponse.json({
            success: false,
            error: {
                code: 'INTERNAL_TELEMETRY_ERROR',
                message: 'Error al procesar telemetría de furgón',
                details: [{ reason: err.message || 'Error no especificado' }]
            },
            meta: {
                timestamp: new Date().toISOString(),
                requestId,
                durationMs
            },
            requestId
        }, { 
            status: 500,
            headers: { 'x-request-id': requestId }
        });
    }
}
