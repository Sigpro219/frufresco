import { NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { verifySessionAndPermission } from '@/lib/auth';

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY);

const ConfirmRequestSchema = z.object({
    assignments: z.record(z.string(), z.array(z.string())),
    vehicles: z.array(z.any()).min(1, 'Se requiere al menos un vehículo'),
    isOptimized: z.boolean().optional(),
    theoreticalMetrics: z.any().optional(),
    params: z.record(z.string(), z.any()).optional(),
    routeStartTimes: z.record(z.string(), z.string()).optional(),
    stopEtas: z.record(z.string(), z.string()).optional(),
    preserveExistingSpaces: z.boolean().optional().default(true)
});

export async function POST(request: Request) {
    const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
    try {
        const auth = await verifySessionAndPermission(request, 'admin.transport.edit');
        if (!auth.authorized) {
            return NextResponse.json({
                type: 'https://frufresco.com/errors/unauthorized',
                title: 'Unauthorized',
                status: 401,
                detail: auth.error || 'No autorizado para confirmar rutas',
                requestId
            }, { status: 401, headers: { 'x-request-id': requestId } });
        }

        const rawBody = await request.json().catch(() => null);
        const parsed = ConfirmRequestSchema.safeParse(rawBody);

        if (!parsed.success) {
            return NextResponse.json({
                type: 'https://frufresco.com/errors/invalid-payload',
                title: 'Bad Request',
                status: 400,
                detail: 'Payload de confirmación inválido',
                errors: parsed.error.issues.map(i => ({ field: i.path.join('.'), issue: i.message })),
                requestId
            }, { status: 400, headers: { 'x-request-id': requestId } });
        }

        const { assignments, vehicles, isOptimized, theoreticalMetrics, params, routeStartTimes, stopEtas, preserveExistingSpaces } = parsed.data;

        const allOrderIds: string[] = Object.values(assignments).flat() as string[];
        if (allOrderIds.length === 0) {
            return NextResponse.json({
                type: 'https://frufresco.com/errors/missing-assignments',
                title: 'Bad Request',
                status: 400,
                detail: 'No se enviaron pedidos asignados para confirmar rutas',
                requestId
            }, { status: 400, headers: { 'x-request-id': requestId } });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Fetch all orders to get total weight and delivery date
        const { data: allOrders } = await supabase
            .from('orders')
            .select('*')
            .in('id', allOrderIds);

        if (!allOrders || allOrders.length === 0) {
            return NextResponse.json({
                type: 'https://frufresco.com/errors/orders-not-found',
                title: 'Not Found',
                status: 404,
                detail: 'No se encontraron pedidos correspondientes a las asignaciones',
                requestId
            }, { status: 404, headers: { 'x-request-id': requestId } });
        }

        const deliveryDate = allOrders[0].delivery_date;

        // Fetch existing route stops and their routes to map previously assigned spaces to routes
        const { data: existingStops } = await supabase
            .from('route_stops')
            .select(`
                order_id,
                route_id,
                order:orders!order_id (
                    id,
                    warehouse_spaces,
                    crates_count,
                    delivery_date
                )
            `);

        // Filtrar paradas que pertenezcan a la fecha de entrega objetivo
        const activeStops = (existingStops || []).filter((s: any) => s.order?.delivery_date === deliveryDate);

        // Idempotency & Concurrency Guard: Detect if any of the orders are already in an active route
        const alreadyAssignedOrders = activeStops
            .filter((s: any) => allOrderIds.includes(s.order_id))
            .map((s: any) => s.order_id);

        if (alreadyAssignedOrders.length > 0) {
            return NextResponse.json({
                type: 'https://frufresco.com/errors/orders-already-routed',
                title: 'Conflict',
                status: 409,
                detail: `Conflicto de Idempotencia: ${alreadyAssignedOrders.length} pedido(s) ya cuentan con ruta confirmada para la fecha ${deliveryDate}`,
                already_assigned_order_ids: alreadyAssignedOrders,
                requestId
            }, { status: 409, headers: { 'x-request-id': requestId } });
        }

        // Fetch the departure times of active routes on this date
        const { data: activeRoutes } = await supabase
            .from('routes')
            .select('id, logic_parameters_snapshot, vehicle_plate, driver_id');

        // Helper: Convert "HH:MM" to minutes from midnight
        const timeToMinutes = (tStr: string): number => {
            const [h, m] = tStr.split(':').map(Number);
            return h * 60 + m;
        };

        // Regla: Ventana de preparación es [salida - 150 min, salida]
        // Guardamos timeline de cada espacio físico (1-150): lista de intervalos { start: number, end: number }
        const spacesTimeline: Record<number, { start: number, end: number }[]> = {};
        for (let i = 1; i <= 150; i++) {
            spacesTimeline[i] = [];
        }

        // Poblar la timeline con los pedidos ya confirmados
        const includedOrderIds = new Set<string>();
        if (activeStops && activeStops.length > 0) {
            activeStops.forEach(stop => {
                const o = stop.order as any;
                if (!o || !Array.isArray(o.warehouse_spaces)) return;
                includedOrderIds.add(o.id);
                
                // Tratar de buscar la hora de salida de su ruta
                let departureMin = timeToMinutes('04:30'); // Default
                let loadDuration = 150; // Fallback to 150 mins if no snapshot/params found
                const routeSnapshot = activeRoutes?.find(r => r.id === stop.route_id);
                if (routeSnapshot?.logic_parameters_snapshot && typeof routeSnapshot.logic_parameters_snapshot === 'object') {
                    const snap = routeSnapshot.logic_parameters_snapshot as Record<string, any>;
                    if (snap.fleet_start_time) {
                        departureMin = timeToMinutes(snap.fleet_start_time);
                    }
                    if (snap.warehouse_base_load_time !== undefined) {
                        const baseLoad = parseFloat(snap.warehouse_base_load_time) || 15;
                        const timePer10 = parseFloat(snap.warehouse_time_per_10_crates_load) || 5;
                        // Contar el total de canastillas en esa ruta para estimar la duración real
                        const routeStopsList = activeStops.filter((s: any) => s.route_id === stop.route_id);
                        const routeTotalCrates = routeStopsList.reduce((cSum: number, s: any) => cSum + (s.order?.crates_count || 1), 0);
                        loadDuration = Math.round(baseLoad + (routeTotalCrates * (timePer10 / 10))) + 15; // 15 min buffer
                    }
                }
                const startMin = departureMin - loadDuration;
                const endMin = departureMin;

                o.warehouse_spaces.forEach((s: number) => {
                    if (s >= 1 && s <= 150) {
                        spacesTimeline[s].push({ start: startMin, end: endMin });
                    }
                });
            });
        }

        // Proteger bahias 1-150 ya asignadas (ej. a las 8 PM) en pedidos sin route_stops todavia
        const targetDeliveryDates = Array.from(new Set(allOrders.map((o: any) => o.delivery_date).filter(Boolean)));
        if (targetDeliveryDates.length > 0) {
            const { data: preAllocatedOrders, error: preErr } = await supabase
                .from('orders')
                .select('id, warehouse_spaces')
                .in('delivery_date', targetDeliveryDates)
                .neq('status', 'cancelled')
                .not('warehouse_spaces', 'is', null);
            if (preErr) throw preErr;

            (preAllocatedOrders || []).forEach((po: any) => {
                if (includedOrderIds.has(po.id) || !Array.isArray(po.warehouse_spaces)) return;
                po.warehouse_spaces.forEach((s: number) => {
                    if (s >= 1 && s <= 150) {
                        spacesTimeline[s].push({ start: 0, end: 1440 });
                    }
                });
            });
        }

        // Fetch avg_kg_per_crate and space_capacity parameter
        let avg_kg_per_crate = 12.5;
        let space_capacity = 36;
        const { data: dbParams } = await supabase.from('logistic_parameters').select('*');
        if (dbParams) {
            const avgParam = dbParams.find(p => p.id === 'avg_kg_per_crate')?.value;
            if (avgParam) avg_kg_per_crate = parseFloat(avgParam);
            const spaceParam = dbParams.find(p => p.id === 'space_capacity')?.value;
            if (spaceParam) space_capacity = parseFloat(spaceParam) || 36;
        }

        // Ordenar vehículos / rutas que se van a procesar por hora de salida (ascendente)
        const sortedVehicleIds = Object.keys(assignments).sort((a, b) => {
            const timeA = timeToMinutes(routeStartTimes?.[a] || params?.fleet_start_time || '04:30');
            const timeB = timeToMinutes(routeStartTimes?.[b] || params?.fleet_start_time || '04:30');
            return timeA - timeB;
        });

        const routeConfirmations = [];

        for (const vehicleId of sortedVehicleIds) {
            const orderIds = assignments[vehicleId];
            if (orderIds.length === 0) continue;

            const vehicle = vehicles.find((v: any) => v.id === vehicleId);
            const departureTimeStr = routeStartTimes?.[vehicleId] || params?.fleet_start_time || '04:30';
            const departureMin = timeToMinutes(departureTimeStr);

            // Calculate load and total crates for vehicle
            const vehicleOrders = allOrders.filter(o => orderIds.includes(o.id));
            const totalKilos = vehicleOrders.reduce((sum, o) => sum + (o.total_weight_kg || 0), 0) || 0;
            const totalCrates = vehicleOrders.reduce((sum, o) => {
                const cCount = Math.ceil((o.total_weight_kg || 0) / avg_kg_per_crate) || 1;
                return sum + cCount;
            }, 0);

            // Calculate load duration dynamically from params
            const baseLoad = parseFloat(params?.warehouse_base_load_time) || 15;
            const timePer10 = parseFloat(params?.warehouse_time_per_10_crates_load) || 5;
            const loadDuration = Math.round(baseLoad + (totalCrates * (timePer10 / 10)));

            const routeStartMin = departureMin - loadDuration - 15; // 15 min safety buffer
            const routeEndMin = departureMin;
            
            // Resolver conductor contra collaborators (fuente real de planta) y profiles (auth/RLS si existe)
            let validDriverId: string | null = null;
            let resolvedDriverName: string = vehicle?.driver_name || 'Sin Asignar';
            if (vehicle?.driver_id) {
                const [{ data: profileCheck }, { data: collabCheck }] = await Promise.all([
                    supabase.from('profiles').select('id').eq('id', vehicle.driver_id).maybeSingle(),
                    supabase.from('collaborators').select('id, contact_name').eq('id', vehicle.driver_id).maybeSingle()
                ]);
                if (profileCheck) validDriverId = profileCheck.id;
                if (collabCheck?.contact_name) resolvedDriverName = collabCheck.contact_name;
            }
            
            // 1. Create Route
            const { data: route, error: rErr } = await supabase
                .from('routes')
                .insert({
                    vehicle_plate: vehicle?.plate,
                    driver_id: validDriverId,
                    driver_name: resolvedDriverName,
                    status: 'loading',
                    is_optimized: isOptimized,
                    theoretical_distance_km: theoreticalMetrics?.distance_km || 0,
                    theoretical_duration_min: theoreticalMetrics?.duration_min || 0,
                    stops_count: orderIds.length,
                    total_orders: orderIds.length,
                    total_kilos: totalKilos,
                    total_crates: totalCrates,
                    logic_parameters_snapshot: {
                        ...params,
                        fleet_start_time: departureTimeStr
                    }
                })
                .select()
                .single();

            if (rErr) throw rErr;

            // 2. Prepare Route Stops, Allocate Spaces, and Update Orders in Batch
            const routeSpacesList: number[] = [];
            const orderSpacesMap: Record<string, number[]> = {};
            const routeStopsToInsert: any[] = [];
            const ordersToUpdate: Array<{ id: string; cratesCount: number; spacesAssigned: number[] }> = [];

            for (let i = 0; i < orderIds.length; i++) {
                const orderId = orderIds[i];
                const orderDetail = allOrders.find(o => String(o.id).trim().toLowerCase() === String(orderId).trim().toLowerCase());
                
                routeStopsToInsert.push({
                    route_id: route.id,
                    order_id: orderId,
                    sequence_number: i + 1,
                    status: 'pending',
                    ...(stopEtas?.[orderId] ? { estimated_arrival: stopEtas[orderId] } : {})
                });

                // Preservar bahías ya asignadas a las 8 PM (Escenario 468); solo asignar si está vacío
                let cratesCount = 1;
                let spacesAssigned: number[] = [];
                const existingSpaces = Array.isArray(orderDetail?.warehouse_spaces) ? orderDetail.warehouse_spaces : [];

                if (orderDetail) {
                    cratesCount = Math.ceil((orderDetail.total_weight_kg || 0) / avg_kg_per_crate) || 1;
                    if (preserveExistingSpaces && existingSpaces.length > 0) {
                        spacesAssigned = existingSpaces;
                    } else {
                        const spacesNeeded = Math.ceil(cratesCount / space_capacity);
                        let spaceCandidate = 1;
                        while (spacesAssigned.length < spacesNeeded && spaceCandidate <= 150) {
                            const hasOverlap = spacesTimeline[spaceCandidate].some(interval => {
                                return routeStartMin < interval.end && interval.start < routeEndMin;
                            });
                            if (!hasOverlap) {
                                spacesAssigned.push(spaceCandidate);
                                spacesTimeline[spaceCandidate].push({ start: routeStartMin, end: routeEndMin });
                            }
                            spaceCandidate++;
                        }
                    }
                    routeSpacesList.push(...spacesAssigned);
                    orderSpacesMap[orderId] = spacesAssigned;
                }

                ordersToUpdate.push({
                    id: orderId,
                    cratesCount,
                    spacesAssigned
                });
            }

            // Batch insert all route stops in ONE roundtrip (con fallback si estimated_arrival no existe aún)
            if (routeStopsToInsert.length > 0) {
                let { error: stopsErr } = await supabase.from('route_stops').insert(routeStopsToInsert);
                if (stopsErr && /estimated_arrival/i.test(stopsErr.message || '')) {
                    const cleanStops = routeStopsToInsert.map(({ estimated_arrival: _ea, ...rest }) => rest);
                    const retry = await supabase.from('route_stops').insert(cleanStops);
                    stopsErr = retry.error;
                }
                if (stopsErr) {
                    console.error('[CONFIRM] Failed to bulk insert route stops:', stopsErr);
                    throw stopsErr;
                }
            }

            // Concurrently update orders status, assigned_route_id and assigned spaces
            const orderUpdateResults = await Promise.all(ordersToUpdate.map(u => 
                supabase.from('orders').update({
                    status: 'picking',
                    assigned_route_id: route.id,
                    crates_count: u.cratesCount,
                    warehouse_spaces: u.spacesAssigned
                }).eq('id', u.id)
            ));
            const failedOrderUpd = orderUpdateResults.find(r => r.error);
            if (failedOrderUpd?.error) {
                throw failedOrderUpd.error;
            }
            
            routeConfirmations.push({
                id: route.id,
                vehicle_plate: route.vehicle_plate,
                driver_name: resolvedDriverName,
                total_kilos: totalKilos,
                stops_count: orderIds.length,
                departure_time: departureTimeStr,
                warehouse_spaces: Array.from(new Set(routeSpacesList)).sort((a, b) => a - b),
                order_ids: orderIds,
                order_spaces: orderSpacesMap
            });
        }

        return NextResponse.json({ 
            success: true, 
            routeConfirmations,
            requestId
        }, { status: 200, headers: { 'x-request-id': requestId } });

    } catch (error: any) {
        console.error('Error in confirm routes API:', error);
        return NextResponse.json({
            type: 'https://frufresco.com/errors/confirm-routes-failure',
            title: 'Internal Server Error',
            status: 500,
            detail: error.message || 'Error al confirmar las rutas',
            requestId
        }, { status: 500, headers: { 'x-request-id': requestId } });
    }
}

