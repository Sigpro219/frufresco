import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { assignments, vehicles, isOptimized, theoreticalMetrics, params } = body;

        if (!assignments || !vehicles) {
            return NextResponse.json({ error: 'Missing required data' }, { status: 400 });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const routeConfirmations = [];

        for (const vehicleId of Object.keys(assignments)) {
            const orderIds = assignments[vehicleId];
            if (orderIds.length === 0) continue;

            const vehicle = vehicles.find((v: any) => v.id === vehicleId);

            // Fetch orders to calculate load
            const { data: routeOrders } = await supabase.from('orders').select('id, total_weight_kg').in('id', orderIds);
            const totalKilos = routeOrders?.reduce((sum, o) => sum + (o.total_weight_kg || 0), 0) || 0;
            
            // Check if the driver_id from fleet_vehicles actually exists in profiles
            // (There is a schema conflict where fleet_vehicles points to collaborators, but routes points to profiles)
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
                    logic_parameters_snapshot: params
                })
                .select()
                .single();

            if (rErr) throw rErr;

            // 2. Create Route Stops & Update Orders
            for (let i = 0; i < orderIds.length; i++) {
                const orderId = orderIds[i];
                
                await supabase.from('route_stops').insert({
                    route_id: route.id,
                    order_id: orderId,
                    sequence_number: i + 1,
                    status: 'pending'
                });

                await supabase.from('orders').update({
                    status: 'picking'
                }).eq('id', orderId);
            }
            
            routeConfirmations.push(route.id);
        }

        return NextResponse.json({ success: true, routeConfirmations });

    } catch (error: any) {
        console.error('Error in confirm routes API:', error);
        return NextResponse.json({ error: error.message || 'Error al confirmar las rutas' }, { status: 500 });
    }
}
