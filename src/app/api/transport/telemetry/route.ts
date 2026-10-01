import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

interface TelemetryPing {
    plate: string;
    latitude: number;
    longitude: number;
    speed?: number;
    heading?: number;
    accuracy?: number;
    battery_level?: number;
    ignition_status?: boolean;
    tracking_source?: 'hardware_gps' | 'mobile_app';
    timestamp?: string;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const pings: TelemetryPing[] = Array.isArray(body) ? body : [body];

        if (pings.length === 0) {
            return NextResponse.json({ error: 'No telemetry data provided' }, { status: 400 });
        }

        const results = [];
        for (const ping of pings) {
            const plate = (ping.plate || '').trim().toUpperCase();
            if (!plate || isNaN(ping.latitude) || isNaN(ping.longitude)) {
                continue;
            }

            const now = ping.timestamp ? new Date(ping.timestamp).toISOString() : new Date().toISOString();
            const source = ping.tracking_source || 'mobile_app';

            // 1. UPDATE atómico en la entidad única del vehículo (Zero Storage Growth)
            const { error: updateErr } = await supabase
                .from('fleet_vehicles')
                .update({
                    last_latitude: ping.latitude,
                    last_longitude: ping.longitude,
                    speed: ping.speed ?? 0,
                    heading: ping.heading ?? 0,
                    ignition_status: ping.ignition_status ?? true,
                    last_gps_sync: now,
                    tracking_source: source
                })
                .eq('plate', plate);

            if (updateErr) {
                console.warn(`[Telemetry API] Warning updating plate ${plate}:`, updateErr.message);
            }

            // 2. INSERT en historial de miga de pan (vehicle_gps_logs) con retención de 48h
            try {
                await supabase.from('vehicle_gps_logs').insert({
                    plate,
                    latitude: ping.latitude,
                    longitude: ping.longitude,
                    speed: ping.speed ?? 0,
                    heading: ping.heading ?? 0,
                    accuracy: ping.accuracy,
                    battery_level: ping.battery_level,
                    ignition_status: ping.ignition_status ?? true,
                    tracking_source: source,
                    created_at: now
                });
            } catch (e: any) {
                // Non-blocking if table is being created
                console.warn('[Telemetry API] Could not write to vehicle_gps_logs:', e.message);
            }

            results.push({ plate, synced: true });
        }

        return NextResponse.json({
            success: true,
            processed_count: results.length,
            timestamp: new Date().toISOString()
        });
    } catch (err: any) {
        console.error('[Telemetry API] Error processing telemetry heartbeat:', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
