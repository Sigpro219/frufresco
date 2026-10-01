import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchApps360Fleet } from '@/lib/telemetry/apps360';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const customApiKey = searchParams.get('key') || undefined;

        // 1. Obtener telemetría viva de apps-360.online
        const liveObjects = await fetchApps360Fleet(customApiKey);

        if (liveObjects.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No live telemetry records found or APPS360_API_KEY not configured.',
                synced_count: 0,
                timestamp: new Date().toISOString()
            });
        }

        const syncedVehicles = [];

        // 2. Sincronizar cada vehículo en fleet_vehicles
        for (const item of liveObjects) {
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

            const { data, error } = await supabase
                .from('fleet_vehicles')
                .update(updatePayload)
                .ilike('plate', item.plate)
                .select('id, plate');

            if (error) {
                console.warn(`[Sync GPS API] Error updating vehicle ${item.plate}:`, error.message);
            } else if (data && data.length > 0) {
                syncedVehicles.push(item.plate);

                // Registrar en log histórico (vehicle_gps_logs)
                try {
                    await supabase.from('vehicle_gps_logs').insert({
                        vehicle_id: data[0].id,
                        plate: item.plate,
                        latitude: item.latitude,
                        longitude: item.longitude,
                        speed: item.speed,
                        heading: item.heading,
                        ignition_status: item.ignition_status,
                        tracking_source: 'hardware_gps',
                        created_at: item.last_gps_sync
                    });
                } catch {
                    // Safe non-blocking
                }
            }
        }

        return NextResponse.json({
            success: true,
            total_fetched: liveObjects.length,
            synced_count: syncedVehicles.length,
            synced_plates: syncedVehicles,
            timestamp: new Date().toISOString()
        });
    } catch (err: any) {
        console.error('[Sync GPS API] Synchronization error:', err);
        return NextResponse.json({ error: err.message || 'Error syncing GPS data' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    return GET(req);
}
