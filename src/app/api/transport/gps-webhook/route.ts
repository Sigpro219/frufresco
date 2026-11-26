import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { isSandboxMode } from '@/lib/sandboxGuard';
import { parseTelemetryDate, sanitizeGpsImei } from '@/lib/telemetry/apps360';

const WebhookPingSchema = z.object({
    imei: z.union([z.string(), z.number()]),
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180),
    speed: z.coerce.number().min(0).max(250).optional().default(0),
    heading: z.coerce.number().min(0).max(360).optional().default(0),
    battery_level: z.coerce.number().min(0).max(100).optional(),
    ignition_status: z.boolean().optional(),
    timestamp: z.union([z.string(), z.number()]).optional()
}).refine((p) => !(p.latitude === 0 && p.longitude === 0), {
    message: 'Coordenada (0,0) inválida'
});

const WebhookBodySchema = z.union([
    WebhookPingSchema,
    z.array(WebhookPingSchema).min(1).max(50)
]);

function getSupabaseAdmin() {
    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/^["']|["']$/g, '');
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/^["']|["']$/g, '');
    return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

function verifyWebhookSecret(req: NextRequest): { ok: boolean; status: number; message: string } {
    const expected = (process.env.GPS_WEBHOOK_SECRET || '').trim();
    if (!expected) {
        return { ok: false, status: 503, message: 'GPS_WEBHOOK_SECRET no configurado en el servidor' };
    }

    const headerSecret = req.headers.get('x-gps-webhook-secret')?.trim();
    const authHeader = req.headers.get('authorization')?.trim();
    const bearerSecret = authHeader?.toLowerCase().startsWith('bearer ')
        ? authHeader.slice(7).trim()
        : undefined;
    const provided = headerSecret || bearerSecret || '';

    const expectedBuf = Buffer.from(expected, 'utf8');
    const providedBuf = Buffer.from(provided, 'utf8');
    if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
        return { ok: false, status: 401, message: 'Secreto de webhook inválido' };
    }

    return { ok: true, status: 200, message: 'OK' };
}

export async function POST(req: NextRequest) {
    const requestId = req.headers.get('x-request-id') || crypto.randomUUID();

    if (isSandboxMode()) {
        return NextResponse.json(
            { success: true, skipped: true, sandbox: true, requestId },
            { status: 200, headers: { 'x-request-id': requestId } }
        );
    }

    const secretCheck = verifyWebhookSecret(req);
    if (!secretCheck.ok) {
        return NextResponse.json(
            { success: false, error: secretCheck.message, requestId },
            { status: secretCheck.status, headers: { 'x-request-id': requestId } }
        );
    }

    try {
        const rawBody = await req.json().catch(() => null);
        const parsed = WebhookBodySchema.safeParse(rawBody);
        if (!parsed.success) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Payload inválido en gps-webhook',
                    details: parsed.error.issues.map(i => ({ field: i.path.join('.'), issue: i.message })),
                    requestId
                },
                { status: 422, headers: { 'x-request-id': requestId } }
            );
        }

        const pings = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
        const supabaseAdmin = getSupabaseAdmin();

        const results: Array<{ imei: string; plate?: string; status: 'updated' | 'ignored_unassigned' | 'invalid_imei' }> = [];

        for (const ping of pings) {
            const cleanImei = sanitizeGpsImei(ping.imei);
            if (!cleanImei) {
                results.push({ imei: String(ping.imei), status: 'invalid_imei' });
                continue;
            }

            const { data: vehicle, error: vErr } = await supabaseAdmin
                .from('fleet_vehicles')
                .select('id, plate, status')
                .eq('gps_imei', cleanImei)
                .neq('status', 'inactive')
                .maybeSingle();

            if (vErr) throw vErr;
            if (!vehicle) {
                results.push({ imei: cleanImei, status: 'ignored_unassigned' });
                continue;
            }

            const syncIso = typeof ping.timestamp === 'number'
                ? parseTelemetryDate(undefined, ping.timestamp)
                : parseTelemetryDate(ping.timestamp);

            const { error: uErr } = await supabaseAdmin
                .from('fleet_vehicles')
                .update({
                    last_latitude: ping.latitude,
                    last_longitude: ping.longitude,
                    speed: ping.speed,
                    heading: ping.heading,
                    ignition_status: ping.ignition_status ?? (ping.speed > 0),
                    last_gps_sync: syncIso,
                    tracking_source: 'hardware_gps'
                })
                .eq('id', vehicle.id);

            if (uErr) throw uErr;

            await supabaseAdmin
                .from('vehicle_gps_logs')
                .insert({
                    vehicle_id: vehicle.id,
                    plate: vehicle.plate,
                    latitude: ping.latitude,
                    longitude: ping.longitude,
                    speed: ping.speed,
                    heading: ping.heading,
                    battery_level: ping.battery_level ?? null,
                    ignition_status: ping.ignition_status ?? (ping.speed > 0),
                    tracking_source: 'hardware_gps',
                    created_at: syncIso
                })
                .then(null, () => {});

            results.push({ imei: cleanImei, plate: vehicle.plate, status: 'updated' });
        }

        return NextResponse.json(
            { success: true, results, processed_count: results.filter(r => r.status === 'updated').length, requestId },
            { status: 200, headers: { 'x-request-id': requestId } }
        );
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error interno en gps-webhook';
        console.error(`[GPS Webhook][${requestId}]:`, msg);
        return NextResponse.json(
            { success: false, error: msg, requestId },
            { status: 500, headers: { 'x-request-id': requestId } }
        );
    }
}
