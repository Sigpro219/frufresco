import { NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { verifySessionAndPermission } from '@/lib/auth';
import { BODEGA_CENTRAL, classifyOrderGps } from '@/lib/transport/gpsHygiene';

export const dynamic = 'force-dynamic';

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY);

let cachedGcpToken: { token: string; projectId: string; expiresAt: number } | null = null;

async function getGcpAuth(): Promise<{ accessToken: string | null; apiKey: string | null; projectId: string } | null> {
    const gcpProjectId = process.env.GCP_PROJECT_ID;
    const gcpApiKey = process.env.GCP_OPTIMIZATION_KEY || null;

    let serviceAccountData: any = null;
    if (process.env.GCP_SERVICE_ACCOUNT_KEY) {
        try {
            const rawKey = process.env.GCP_SERVICE_ACCOUNT_KEY.trim();
            serviceAccountData = rawKey.startsWith('{')
                ? JSON.parse(rawKey)
                : JSON.parse(Buffer.from(rawKey, 'base64').toString('utf8'));
        } catch (err) {
            console.error('Error parsing GCP_SERVICE_ACCOUNT_KEY:', err);
        }
    }

    if (!serviceAccountData) {
        const saPath = path.join(process.cwd(), 'gcp-service-account.json');
        try {
            if (fs.existsSync(saPath)) {
                serviceAccountData = JSON.parse(fs.readFileSync(saPath, 'utf8'));
            }
        } catch (err) {
            console.warn('Could not read gcp-service-account.json:', err);
        }
    }

    if (!serviceAccountData && !(gcpProjectId && gcpApiKey)) {
        return null;
    }

    let projectId = gcpProjectId || serviceAccountData?.project_id || 'frufresco';
    if (cachedGcpToken && cachedGcpToken.expiresAt > Date.now() + 60000) {
        return { accessToken: cachedGcpToken.token, apiKey: null, projectId: cachedGcpToken.projectId };
    }

    if (serviceAccountData) {
        projectId = serviceAccountData.project_id || projectId;
        const header = { alg: 'RS256', typ: 'JWT' };
        const iat = Math.floor(Date.now() / 1000);
        const claimSet = {
            iss: serviceAccountData.client_email,
            scope: 'https://www.googleapis.com/auth/cloud-platform',
            aud: 'https://oauth2.googleapis.com/token',
            exp: iat + 3600,
            iat,
        };
        const encodeB64Url = (obj: any) =>
            Buffer.from(JSON.stringify(obj)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

        const signatureInput = `${encodeB64Url(header)}.${encodeB64Url(claimSet)}`;
        const sign = crypto.createSign('RSA-SHA256');
        sign.update(signatureInput);
        const signature = sign.sign(serviceAccountData.private_key, 'base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
        const jwtToken = `${signatureInput}.${signature}`;

        const tokenController = new AbortController();
        const tokenTimeout = setTimeout(() => tokenController.abort(), 5000);
        try {
            const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                    assertion: jwtToken,
                }),
                signal: tokenController.signal,
            });
            if (!tokenRes.ok) {
                throw new Error(`Google OAuth error (${tokenRes.status})`);
            }
            const tokenData = await tokenRes.json();
            cachedGcpToken = {
                token: tokenData.access_token,
                expiresAt: Date.now() + 3300 * 1000,
                projectId,
            };
            return { accessToken: tokenData.access_token, apiKey: null, projectId };
        } finally {
            clearTimeout(tokenTimeout);
        }
    }

    return { accessToken: null, apiKey: gcpApiKey, projectId };
}

export async function GET(request: Request) {
    try {
        const auth = await verifySessionAndPermission(request, 'admin.transport.view');
        if (!auth.authorized) {
            return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date');

        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return NextResponse.json(
                { error: 'Se requiere el parámetro date en formato YYYY-MM-DD' },
                { status: 400 }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 1. Consultar únicamente pedidos asignados de la fecha objetivo (evita full-scan)
        const { data: assignedOrders, error: ordersErr } = await supabase
            .from('orders')
            .select(
                'id, assigned_route_id, delivery_date, shipping_address, latitude, longitude, total_weight_kg, crates_count, warehouse_spaces, logistics_data, status, admin_notes, profiles:profiles(role, company_name, contact_name, latitude, longitude, address_complement)'
            )
            .eq('delivery_date', date)
            .not('assigned_route_id', 'is', null);

        if (ordersErr) throw ordersErr;
        if (!assignedOrders || assignedOrders.length === 0) {
            return NextResponse.json([]);
        }

        const routeIds = Array.from(
            new Set(assignedOrders.map((o: any) => o.assigned_route_id).filter(Boolean))
        ) as string[];

        if (routeIds.length === 0) {
            return NextResponse.json([]);
        }

        // 2. Consultar rutas activas/confirmadas y sus paradas ordenadas en paralelo
        const [{ data: routesData, error: routesErr }, { data: stopsData, error: stopsErr }] = await Promise.all([
            supabase
                .from('routes')
                .select('*')
                .in('id', routeIds)
                .neq('status', 'cancelled')
                .order('created_at', { ascending: true }),
            supabase
                .from('route_stops')
                .select('id, route_id, order_id, sequence_number, status, estimated_arrival, completion_time')
                .in('route_id', routeIds)
                .order('sequence_number', { ascending: true }),
        ]);

        if (routesErr) throw routesErr;
        if (stopsErr) throw stopsErr;

        const driverIds = Array.from(
            new Set((routesData || []).map((r: any) => r.driver_id).filter(Boolean))
        ) as string[];

        let collaboratorsMap = new Map<string, { id: string; contact_name: string | null; phone: string | null }>();
        if (driverIds.length > 0) {
            const { data: collabData } = await supabase
                .from('collaborators')
                .select('id, contact_name, phone')
                .in('id', driverIds);
            (collabData || []).forEach((c: any) => {
                collaboratorsMap.set(String(c.id), c);
            });
        }

        const ordersById = new Map<string, any>();
        assignedOrders.forEach((o: any) => {
            ordersById.set(String(o.id), o);
        });

        const stopsByRouteId = new Map<string, any[]>();
        (stopsData || []).forEach((s: any) => {
            const rid = String(s.route_id);
            const list = stopsByRouteId.get(rid) || [];
            list.push(s);
            stopsByRouteId.set(rid, list);
        });

        const resolveCustomerName = (o: any): string => {
            if (o?.profiles) {
                if (o.profiles.role === 'b2b_client') {
                    return o.profiles.company_name || o.customer_name || 'Sin Razón Social';
                }
                return o.profiles.contact_name || o.profiles.company_name || o.customer_name || 'Cliente Registrado';
            }
            if (o?.admin_notes && String(o.admin_notes).includes('CLIENTE HOGAR')) {
                const nameMatch = String(o.admin_notes).match(/Nombre: (.*?) \|/);
                if (nameMatch?.[1]) return nameMatch[1];
            }
            return o?.customer_name || 'Cliente';
        };

        const enrichedRoutes = (routesData || []).map((r: any) => {
            const snapshot = (r.logic_parameters_snapshot && typeof r.logic_parameters_snapshot === 'object')
                ? r.logic_parameters_snapshot
                : {};
            const collab = r.driver_id ? collaboratorsMap.get(String(r.driver_id)) : undefined;
            const avgKgPerCrate = Number(snapshot.avg_kg_per_crate) > 0 ? Number(snapshot.avg_kg_per_crate) : 12.5;
            const rawStops = stopsByRouteId.get(String(r.id)) || [];

            const stops = rawStops.map((s: any) => {
                const order = ordersById.get(String(s.order_id));
                const weightKg = Number(order?.total_weight_kg) || 0;
                const crates = Number(order?.crates_count) > 0
                    ? Number(order.crates_count)
                    : (weightKg > 0 ? Math.ceil(weightKg / avgKgPerCrate) : 1);
                const spaces = Array.isArray(order?.warehouse_spaces) ? order.warehouse_spaces : [];
                return {
                    id: String(s.order_id),
                    stop_id: s.id,
                    sequence_number: s.sequence_number,
                    stop_status: s.status,
                    estimated_arrival: s.estimated_arrival || null,
                    completion_time: s.completion_time || null,
                    customer_name: resolveCustomerName(order),
                    address: order?.shipping_address || 'Sin Dirección',
                    address_complement: order?.profiles?.address_complement || '',
                    latitude: order?.latitude ?? order?.profiles?.latitude ?? null,
                    longitude: order?.longitude ?? order?.profiles?.longitude ?? null,
                    total_weight_kg: weightKg,
                    crates,
                    warehouse_spaces: spaces,
                    logistics_data: order?.logistics_data || null,
                };
            });

            const uniqueSpaces = Array.from(
                new Set(
                    stops.flatMap((st: any) =>
                        Array.isArray(st.warehouse_spaces) ? st.warehouse_spaces.filter((n: any) => Number.isFinite(Number(n))).map(Number) : []
                    )
                )
            ).sort((a, b) => a - b);

            const totalCrates = Number(r.total_crates) > 0
                ? Number(r.total_crates)
                : stops.reduce((acc: number, st: any) => acc + (Number(st.crates) || 0), 0);

            return {
                id: r.id,
                route_id: r.id,
                vehicle_plate: r.vehicle_plate,
                driver_id: r.driver_id || null,
                driver_name: (r.driver_name || collab?.contact_name || '').trim() || 'Sin Asignar',
                status: r.status,
                start_time: r.start_time || null,
                created_at: r.created_at,
                delivery_date: date,
                departure_time: snapshot.fleet_start_time || '04:30',
                total_kilos: Number(r.total_kilos) || stops.reduce((acc: number, st: any) => acc + (Number(st.total_weight_kg) || 0), 0),
                total_crates: totalCrates,
                stops_count: stops.length || Number(r.stops_count) || 0,
                warehouse_spaces: uniqueSpaces,
                is_optimized: Boolean(r.is_optimized),
                route_polyline: typeof snapshot.route_polyline === 'string' ? snapshot.route_polyline : null,
                route_metrics: snapshot.route_metrics || null,
                stop_leg_metrics: snapshot.stop_leg_metrics || null,
                traffic_mode: snapshot.traffic_mode || null,
                stops,
            };
        });

        enrichedRoutes.sort((a: any, b: any) => String(a.departure_time || '').localeCompare(String(b.departure_time || '')));

        return NextResponse.json(enrichedRoutes);
    } catch (error: any) {
        console.error('Error fetching sealed transport routes:', error);
        return NextResponse.json({ error: error.message || 'Error interno consultando rutas' }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const auth = await verifySessionAndPermission(request, 'admin.transport.edit');
        if (!auth.authorized) {
            return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json().catch(() => null);
        const routeId = typeof body?.routeId === 'string' ? body.routeId.trim() : '';
        const routePolyline = typeof body?.routePolyline === 'string' ? body.routePolyline.trim() : '';
        const routeMetrics = body?.routeMetrics && typeof body.routeMetrics === 'object' ? body.routeMetrics : null;

        if (!routeId || !routePolyline) {
            return NextResponse.json(
                { error: 'routeId y routePolyline son obligatorios' },
                { status: 400 }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data: existing, error: fetchErr } = await supabase
            .from('routes')
            .select('id, logic_parameters_snapshot')
            .eq('id', routeId)
            .maybeSingle();

        if (fetchErr) throw fetchErr;
        if (!existing) {
            return NextResponse.json({ error: 'Ruta no encontrada' }, { status: 404 });
        }

        const existingSnapshot =
            existing.logic_parameters_snapshot && typeof existing.logic_parameters_snapshot === 'object'
                ? existing.logic_parameters_snapshot
                : {};

        const nextSnapshot = {
            ...existingSnapshot,
            route_polyline: routePolyline,
            ...(routeMetrics && !existingSnapshot.route_metrics ? { route_metrics: routeMetrics } : {}),
        };

        const { error: updateErr } = await supabase
            .from('routes')
            .update({ logic_parameters_snapshot: nextSnapshot })
            .eq('id', routeId);

        if (updateErr) throw updateErr;

        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error('Error caching route polyline:', error);
        return NextResponse.json({ error: error.message || 'Error interno guardando polilínea' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const auth = await verifySessionAndPermission(request, 'admin.transport.view');
        if (!auth.authorized) {
            return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json().catch(() => null);
        const routeId = typeof body?.routeId === 'string' ? body.routeId.trim() : '';
        if (!routeId) {
            return NextResponse.json({ error: 'routeId es obligatorio' }, { status: 400 });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data: routeRow, error: rErr } = await supabase
            .from('routes')
            .select('id, vehicle_plate, logic_parameters_snapshot')
            .eq('id', routeId)
            .maybeSingle();

        if (rErr) throw rErr;
        if (!routeRow) {
            return NextResponse.json({ error: 'Ruta no encontrada' }, { status: 404 });
        }

        const existingSnapshot =
            routeRow.logic_parameters_snapshot && typeof routeRow.logic_parameters_snapshot === 'object'
                ? routeRow.logic_parameters_snapshot
                : {};

        if (typeof existingSnapshot.route_polyline === 'string' && existingSnapshot.route_polyline.trim()) {
            return NextResponse.json({
                route_polyline: existingSnapshot.route_polyline,
                route_metrics: existingSnapshot.route_metrics || null,
                cached: true,
            });
        }

        const { data: stopsData, error: sErr } = await supabase
            .from('route_stops')
            .select('id, sequence_number, order:orders(id, latitude, longitude, profiles(latitude, longitude))')
            .eq('route_id', routeId)
            .order('sequence_number', { ascending: true });

        if (sErr) throw sErr;

        const dedupCoords: Array<{ lat: number; lng: number }> = [];
        for (const s of stopsData || []) {
            const ord: any = Array.isArray((s as any).order) ? (s as any).order[0] : (s as any).order;
            const prof: any = Array.isArray(ord?.profiles) ? ord.profiles[0] : ord?.profiles;
            const rawLat = ord?.latitude ?? prof?.latitude ?? null;
            const rawLng = ord?.longitude ?? prof?.longitude ?? null;
            const lat = rawLat !== null && rawLat !== undefined && rawLat !== '' ? Number(rawLat) : null;
            const lng = rawLng !== null && rawLng !== undefined && rawLng !== '' ? Number(rawLng) : null;
            const gps = classifyOrderGps(lat, lng);
            if (gps.status !== 'valid' || gps.lat === null || gps.lng === null) continue;

            const prev = dedupCoords[dedupCoords.length - 1];
            if (!prev || Math.abs(prev.lat - gps.lat) >= 0.0001 || Math.abs(prev.lng - gps.lng) >= 0.0001) {
                dedupCoords.push({ lat: gps.lat, lng: gps.lng });
            }
        }

        if (dedupCoords.length === 0) {
            return NextResponse.json({ route_polyline: null, reason: 'NO_VALID_GPS' });
        }

        const gcpAuth = await getGcpAuth();
        if (!gcpAuth) {
            return NextResponse.json({ route_polyline: null, error: 'Credenciales GCP no configuradas' }, { status: 503 });
        }

        const startIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        const endIso = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString();

        const shipments = dedupCoords.map((pt, idx) => ({
            label: `stop_${idx}`,
            deliveries: [
                {
                    arrivalLocation: { latitude: pt.lat, longitude: pt.lng },
                    duration: '60s',
                },
            ],
        }));

        const precedenceRules = dedupCoords.slice(0, -1).map((_, idx) => ({
            firstIndex: idx,
            secondIndex: idx + 1,
        }));

        const gcpUrl =
            `https://routeoptimization.googleapis.com/v1/projects/${gcpAuth.projectId}:optimizeTours` +
            (gcpAuth.accessToken ? '' : `?key=${gcpAuth.apiKey}`);

        const gcpHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        if (gcpAuth.accessToken) {
            gcpHeaders['Authorization'] = `Bearer ${gcpAuth.accessToken}`;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        let gcpResponse: Response;
        try {
            gcpResponse = await fetch(gcpUrl, {
                method: 'POST',
                headers: gcpHeaders,
                body: JSON.stringify({
                    populatePolylines: true,
                    searchMode: 'RETURN_FAST',
                    model: {
                        globalStartTime: startIso,
                        globalEndTime: endIso,
                        shipments,
                        ...(precedenceRules.length > 0 ? { precedenceRules } : {}),
                        vehicles: [
                            {
                                label: routeRow.vehicle_plate || routeId,
                                startLocation: { latitude: BODEGA_CENTRAL.lat, longitude: BODEGA_CENTRAL.lng },
                                endLocation: { latitude: BODEGA_CENTRAL.lat, longitude: BODEGA_CENTRAL.lng },
                                travelMode: 'DRIVING',
                                costPerKilometer: 1,
                            },
                        ],
                    },
                }),
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timeout);
        }

        if (!gcpResponse.ok) {
            const errText = await gcpResponse.text().catch(() => '');
            console.error('Google Route Optimization polyline hydration failed:', gcpResponse.status, errText);
            return NextResponse.json(
                { route_polyline: null, error: `Google API ${gcpResponse.status}` },
                { status: 502 }
            );
        }

        const gcpData = await gcpResponse.json();
        const gcpRoute = gcpData?.routes?.[0];
        const encoded = typeof gcpRoute?.routePolyline?.points === 'string' ? gcpRoute.routePolyline.points.trim() : '';

        if (!encoded) {
            return NextResponse.json({ route_polyline: null, reason: 'EMPTY_POLYLINE' });
        }

        const parseSec = (dur?: string): number => {
            if (!dur) return 0;
            const n = parseFloat(String(dur).replace('s', ''));
            return Number.isFinite(n) ? n : 0;
        };

        const m = gcpRoute?.metrics || {};
        const distance_km = Math.round(((Number(m.travelDistanceMeters) || 0) / 1000) * 10) / 10;
        const travel_min = Math.round(parseSec(m.travelDuration) / 60);
        const total_min = Math.round(parseSec(m.totalDuration) / 60) || travel_min;
        const computedMetrics = {
            distance_km,
            travel_min,
            total_min,
            wait_min: 0,
            break_min: 0,
        };

        const nextSnapshot = {
            ...existingSnapshot,
            route_polyline: encoded,
            ...(!existingSnapshot.route_metrics ? { route_metrics: computedMetrics } : {}),
        };

        await supabase
            .from('routes')
            .update({ logic_parameters_snapshot: nextSnapshot })
            .eq('id', routeId);

        return NextResponse.json({
            route_polyline: encoded,
            route_metrics: existingSnapshot.route_metrics || computedMetrics,
            cached: false,
        });
    } catch (error: any) {
        console.error('Error hydrating sealed route polyline:', error);
        return NextResponse.json({ route_polyline: null, error: error.message || 'Error interno hidratando polilínea' }, { status: 500 });
    }
}
