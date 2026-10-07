import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { fetchApps360Fleet } from '@/lib/telemetry/apps360';

// 1. Esquema Zod de Parámetros de Consulta (Mandamiento 1)
const SyncQuerySchema = z.object({
    key: z.string().min(5).max(256).optional(),
    force: z.enum(['true', 'false']).optional(),
    plate: z.string().min(5).max(10).optional()
});

function getSupabaseAdmin() {
    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/^["']|["']$/g, '');
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim().replace(/^["']|["']$/g, '');
    return createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false }
    });
}

export async function GET(req: NextRequest) {
    const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
    const startTime = Date.now();

    try {
        // 2. Validación de entrada con Zod
        const { searchParams } = new URL(req.url);
        const queryParams = Object.fromEntries(searchParams.entries());
        const parsedQuery = SyncQuerySchema.safeParse(queryParams);

        if (!parsedQuery.success) {
            return NextResponse.json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Parámetros de consulta inválidos en /api/transport/sync-gps',
                    details: parsedQuery.error.issues.map(i => ({ field: i.path.join('.'), issue: i.message }))
                },
                requestId
            }, { status: 422 });
        }

        const customApiKey = parsedQuery.data.key;
        const targetPlate = parsedQuery.data.plate?.toUpperCase();

        // 3. Consulta telemática satelital resiliente con timeout
        let liveObjects = await fetchApps360Fleet(customApiKey);

        if (targetPlate) {
            liveObjects = liveObjects.filter(item => item.plate.toUpperCase() === targetPlate);
        }

        if (liveObjects.length === 0) {
            return NextResponse.json({
                success: true,
                data: {
                    total_fetched: 0,
                    synced_count: 0,
                    synced_plates: [],
                    message: 'No se encontraron vehículos activos o credenciales no configuradas'
                },
                meta: {
                    timestamp: new Date().toISOString(),
                    requestId,
                    durationMs: Date.now() - startTime
                },
                // Retrocompatibilidad para vistas existentes
                total_fetched: 0,
                synced_count: 0,
                synced_plates: []
            }, { 
                status: 200,
                headers: { 'x-request-id': requestId }
            });
        }

        const supabaseAdmin = getSupabaseAdmin();

        // 4. Procesamiento Paralelo Concurrente (Promise.allSettled) para máxima velocidad
        const updatePromises = liveObjects.map(async (item) => {
            const updatePayload: any = {
                last_latitude: item.latitude,
                last_longitude: item.longitude,
                speed: item.speed,
                heading: item.heading,
                ignition_status: item.ignition_status,
                last_gps_sync: item.last_gps_sync,
                tracking_source: 'hardware_gps'
            };

            if (item.imei) {
                updatePayload.gps_imei = item.imei;
            }

            if (item.odometer_km) {
                updatePayload.current_odometer = item.odometer_km;
                updatePayload.last_odometer_update = item.last_gps_sync;
            }

            const { data, error } = await supabaseAdmin
                .from('fleet_vehicles')
                .update(updatePayload)
                .ilike('plate', item.plate)
                .select('id, plate');

            if (error) {
                console.warn(`[Sync GPS API][${requestId}] Error actualizando ${item.plate}:`, error.message);
                throw error;
            }

            if (data && data.length > 0) {
                // Registro histórico en vehicle_gps_logs de forma no-bloqueante
                supabaseAdmin.from('vehicle_gps_logs').insert({
                    vehicle_id: data[0].id,
                    plate: item.plate,
                    latitude: item.latitude,
                    longitude: item.longitude,
                    speed: item.speed,
                    heading: item.heading,
                    ignition_status: item.ignition_status,
                    tracking_source: 'hardware_gps',
                    created_at: item.last_gps_sync
                }).then(null, () => {});

                return item.plate;
            }

            return null;
        });

        const settledResults = await Promise.allSettled(updatePromises);
        const syncedVehicles: string[] = [];
        let errorsCount = 0;

        for (const res of settledResults) {
            if (res.status === 'fulfilled' && res.value) {
                syncedVehicles.push(res.value);
            } else if (res.status === 'rejected') {
                errorsCount++;
            }
        }

        const durationMs = Date.now() - startTime;

        // 5. Estructura Canónica RFC 7807 y Retrocompatible
        return NextResponse.json({
            success: true,
            data: {
                total_fetched: liveObjects.length,
                synced_count: syncedVehicles.length,
                synced_plates: syncedVehicles,
                errors_count: errorsCount,
                vehicles: liveObjects.map(v => ({
                    plate: v.plate,
                    speed: v.speed,
                    heading: v.heading,
                    ignition: v.ignition_status,
                    lastSync: v.last_gps_sync
                }))
            },
            meta: {
                timestamp: new Date().toISOString(),
                requestId,
                durationMs
            },
            // Campos directos de retrocompatibilidad
            total_fetched: liveObjects.length,
            synced_count: syncedVehicles.length,
            synced_plates: syncedVehicles
        }, {
            status: 200,
            headers: { 'x-request-id': requestId }
        });

    } catch (err: any) {
        const durationMs = Date.now() - startTime;
        console.error(`[Sync GPS API Error][${requestId}]:`, err.message || err);

        const isTimeout = (err.message || '').includes('timeout');
        return NextResponse.json({
            success: false,
            error: {
                code: isTimeout ? 'UPSTREAM_GATEWAY_TIMEOUT' : 'INTERNAL_SYNC_ERROR',
                message: isTimeout 
                    ? 'El proveedor satelital (Apps-360) tardó más de lo esperado en responder.'
                    : 'Error inesperado al sincronizar telemetría satelital.',
                details: [{ reason: err.message || 'Unknown internal error' }]
            },
            meta: {
                timestamp: new Date().toISOString(),
                requestId,
                durationMs
            },
            requestId
        }, { 
            status: isTimeout ? 504 : 500,
            headers: { 'x-request-id': requestId }
        });
    }
}

export async function POST(req: NextRequest) {
    return GET(req);
}
