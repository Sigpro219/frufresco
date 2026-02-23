import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // API route should use service role for data safety

// This API serves as a proxy and data-transformer for the Google Maps Route Optimization API
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { orders, vehicles, parameters } = body;

        if (!orders || !vehicles) {
            return NextResponse.json({ error: 'Missing orders or vehicles' }, { status: 400 });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 1. Fetch Logistic Parameters from DB if not provided
        let b2b_kg_min = parameters?.b2b_kg_min || 10;
        let b2c_kg_min = parameters?.b2c_kg_min || 5;
        let base_setup = parameters?.base_setup_time || 5;

        const { data: dbParams } = await supabase.from('logistic_parameters').select('*');
        if (dbParams) {
            b2b_kg_min = parseFloat(dbParams.find(p => p.id === 'b2b_kg_min')?.value || b2b_kg_min);
            b2c_kg_min = parseFloat(dbParams.find(p => p.id === 'b2c_kg_min')?.value || b2c_kg_min);
            base_setup = parseFloat(dbParams.find(p => p.id === 'base_setup_time')?.value || base_setup);
        }

        // 2. Map to Google OptimizeTours Request Schema
        // Ref: https://developers.google.com/maps/documentation/route-optimization/reference/rest/v1/projects.locations/optimizeTours
        
        const gcpRequest = {
            model: {
                shipments: orders.map((o: any) => {
                    const kg_min = o.is_b2b ? b2b_kg_min : b2c_kg_min;
                    const unloadingTime = Math.ceil((o.total_weight_kg / kg_min) + base_setup);
                    
                    return {
                        pickupArrivalConfigurations: [
                            // Depot location (Bodega Principal)
                            { arrivalLocation: { latitude: 4.6482, longitude: -74.1101 } }
                        ],
                        deliveryArrivalConfigurations: [
                            { 
                                arrivalLocation: { 
                                    latitude: o.latitude || 4.6, 
                                    longitude: o.longitude || -74.1 
                                } 
                            }
                        ],
                        loadDemands: {
                            "weight": { "amount": Math.ceil(o.total_weight_kg) }
                        },
                        // Service duration in seconds
                        deliveryServiceDuration: { seconds: unloadingTime * 60 },
                        priority: o.is_b2b ? 1 : 2,
                        displayName: o.customer_name || `Order ${o.id}`
                    };
                }),
                vehicles: vehicles.map((v: any) => ({
                    startLocation: { latitude: 4.6482, longitude: -74.1101 },
                    endLocation: { latitude: 4.6482, longitude: -74.1101 },
                    loadLimits: {
                        "weight": { "maxAmount": v.capacity_kg }
                    },
                    displayName: v.plate,
                    label: v.id
                })),
                globalConstraints: {
                    // Traffic mode configuration
                    trafficToken: "TRAFFIC_AWARE" 
                }
            },
            // Minimize active vehicles to see surplus as requested
            searchMode: "CONSUME_ALL_AVAILABLE_TIME",
            considerRoadTraffic: true
        };

        // Note: For actual production, we would call:
        // const response = await fetch(`https://routeoptimization.googleapis.com/v1/projects/${PROJECT_ID}:optimizeTours?key=${GCP_KEY}`, { ... })
        
        // --- SIMULATION MODE ---
        // Since we are in development/draft, we return the structured request 
        // and a simulated local assignment until the API Key is ready.
        
        return NextResponse.json({
            message: "OptimizeTours Request Structured Successfully",
            debug_request: gcpRequest,
            status: "ready_for_key",
            simulation: true
        });

    } catch (error: any) {
        console.error('Optimizer API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
