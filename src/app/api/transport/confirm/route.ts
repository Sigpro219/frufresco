import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { assignments, vehicles, isOptimized, theoreticalMetrics, params, routeStartTimes } = body;

        if (!assignments || !vehicles) {
            return NextResponse.json({ error: 'Missing required data' }, { status: 400 });
        }

        const allOrderIds: string[] = Object.values(assignments).flat() as string[];
        if (allOrderIds.length === 0) {
            return NextResponse.json({ error: 'No order assignments provided' }, { status: 400 });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Fetch all orders to get total weight and delivery date
        const { data: allOrders } = await supabase
            .from('orders')
            .select('*')
            .in('id', allOrderIds);

        if (!allOrders || allOrders.length === 0) {
            return NextResponse.json({ error: 'No orders found matching the assignments' }, { status: 400 });
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
        if (activeStops && activeStops.length > 0) {
            activeStops.forEach(stop => {
                const o = stop.order as any;
                if (!o || !Array.isArray(o.warehouse_spaces)) return;
                
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

        // Fetch avg_kg_per_crate parameter
        let avg_kg_per_crate = 12.5;
        const { data: dbParams } = await supabase.from('logistic_parameters').select('*');
        if (dbParams) {
            const avgParam = dbParams.find(p => p.id === 'avg_kg_per_crate')?.value;
            if (avgParam) avg_kg_per_crate = parseFloat(avgParam);
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
            
            // Check if the driver_id from fleet_vehicles actually exists in profiles
            let validDriverId = null;
            if (vehicle?.driver_id) {
                const { data: profileCheck } = await supabase.from('profiles').select('id').eq('id', vehicle.driver_id).single();
                if (profileCheck) validDriverId = profileCheck.id;
            }
            
            // 1. Create Route
            const { data: route, error: rErr } = await supabase
                .from('routes')
                .insert({
                    vehicle_plate: vehicle?.plate,
                    driver_id: validDriverId,
                    status: 'loading',
                    is_optimized: isOptimized,
                    theoretical_distance_km: theoreticalMetrics?.distance_km || 0,
                    theoretical_duration_min: theoreticalMetrics?.duration_min || 0,
                    stops_count: orderIds.length,
                    total_orders: orderIds.length,
                    total_kilos: totalKilos,
                    logic_parameters_snapshot: {
                        ...params,
                        fleet_start_time: departureTimeStr
                    }
                })
                .select()
                .single();

            if (rErr) throw rErr;

            // 2. Create Route Stops, Allocate Spaces, and Update Orders
            const routeSpacesList: number[] = [];
            const orderSpacesMap: Record<string, number[]> = {};
            for (let i = 0; i < orderIds.length; i++) {
                const orderId = orderIds[i];
                const orderDetail = allOrders.find(o => String(o.id).trim().toLowerCase() === String(orderId).trim().toLowerCase());
                
                await supabase.from('route_stops').insert({
                    route_id: route.id,
                    order_id: orderId,
                    sequence_number: i + 1,
                    status: 'pending'
                });

                // Allocate spaces (max 36 crates per space, dedicated spaces per order)
                let cratesCount = 1;
                let spacesAssigned: number[] = [];

                if (orderDetail) {
                    cratesCount = Math.ceil((orderDetail.total_weight_kg || 0) / avg_kg_per_crate) || 1;
                    const spacesNeeded = Math.ceil(cratesCount / 36);
                    console.log(`[SPACE ALLOC] Order ${orderId}: weight=${orderDetail.total_weight_kg}, crates=${cratesCount}, spacesNeeded=${spacesNeeded}, routeStartMin=${routeStartMin}, routeEndMin=${routeEndMin}`);
                    
                    let spaceCandidate = 1;
                    while (spacesAssigned.length < spacesNeeded && spaceCandidate <= 150) {
                        // Un espacio es libre para esta ruta si no hay traslape con sus intervalos ocupados.
                        // Dos intervalos [A, B] y [C, D] se traslapan si: A < D y C < B.
                        const hasOverlap = spacesTimeline[spaceCandidate].some(interval => {
                            return routeStartMin < interval.end && interval.start < routeEndMin;
                        });

                        if (!hasOverlap) {
                            spacesAssigned.push(spaceCandidate);
                            // Marcar el intervalo como ocupado en la línea de tiempo de este espacio
                            spacesTimeline[spaceCandidate].push({ start: routeStartMin, end: routeEndMin });
                        }
                        spaceCandidate++;
                    }
                    console.log(`[SPACE ALLOC] Assigned spaces for Order ${orderId}: [${spacesAssigned.join(', ')}]`);
                    routeSpacesList.push(...spacesAssigned);
                    orderSpacesMap[orderId] = spacesAssigned;
                }

                const { error: updateErr } = await supabase.from('orders').update({
                    status: 'picking',
                    crates_count: cratesCount,
                    warehouse_spaces: spacesAssigned
                }).eq('id', orderId);

                if (updateErr) {
                    console.error(`[SPACE ALLOC ERROR] Failed to update order ${orderId}:`, updateErr);
                    throw updateErr;
                }
            }
            
            routeConfirmations.push({
                id: route.id,
                vehicle_plate: route.vehicle_plate,
                driver_name: vehicle?.driver_name || 'Sin Asignar',
                total_kilos: totalKilos,
                stops_count: orderIds.length,
                departure_time: departureTimeStr,
                warehouse_spaces: Array.from(new Set(routeSpacesList)).sort((a, b) => a - b),
                order_ids: orderIds,
                order_spaces: orderSpacesMap
            });
        }

        return NextResponse.json({ success: true, routeConfirmations });

    } catch (error: any) {
        console.error('Error in confirm routes API:', error);
        return NextResponse.json({ error: error.message || 'Error al confirmar las rutas' }, { status: 500 });
    }
}

