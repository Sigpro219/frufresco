import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

// 1. Validación Zod Estricta (Mandamiento 1)
const PingItemSchema = z.object({
    plate: z.string().min(3, 'Placa requerida').max(10),
    latitude: z.number().min(-90).max(90, 'Latitud fuera de rango (-90 a 90)'),
    longitude: z.number().min(-180).max(180, 'Longitud fuera de rango (-180 a 180)'),
    speed: z.number().min(0).max(250).optional().default(0),
    heading: z.number().min(0).max(360).optional().default(0),
    accuracy: z.number().optional(),
    battery_level: z.number().min(0).max(100).optional(),
    ignition_status: z.boolean().optional().default(true),
    tracking_source: z.enum(['hardware_gps', 'mobile_app']).optional().default('mobile_app'),
    timestamp: z.string().optional()
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
        const supabaseAdmin = getSupabaseAdmin();

        // 2. Procesamiento paralelo concurrente (Promise.allSettled)
        const updatePromises = pings.map(async (ping) => {
            const plate = ping.plate.trim().toUpperCase();
            const now = ping.timestamp ? new Date(ping.timestamp).toISOString() : new Date().toISOString();

            const { data: updatedVehicles, error: updateErr } = await supabaseAdmin
                .from('fleet_vehicles')
                .update({
                    last_latitude: ping.latitude,
                    last_longitude: ping.longitude,
                    speed: ping.speed,
                    heading: ping.heading,
                    ignition_status: ping.ignition_status,
                    last_gps_sync: now,
                    tracking_source: ping.tracking_source
                })
                .ilike('plate', plate)
                .select('id, plate');

            if (updateErr) {
                console.warn(`[Telemetry API][${requestId}] Error actualizando placa ${plate}:`, updateErr.message);
                throw updateErr;
            }

            // Historial miga de pan no-bloqueante
            if (updatedVehicles && updatedVehicles.length > 0) {
                supabaseAdmin.from('vehicle_gps_logs').insert({
                    vehicle_id: updatedVehicles[0].id,
                    plate,
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
            }

            return plate;
        });

        const settled = await Promise.allSettled(updatePromises);
        const processedPlates = settled
            .filter((s): s is PromiseFulfilledResult<string> => s.status === 'fulfilled')
            .map(s => s.value);

        const durationMs = Date.now() - startTime;

        return NextResponse.json({
            success: true,
            data: {
                processed_count: processedPlates.length,
                processed_plates: processedPlates,
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
