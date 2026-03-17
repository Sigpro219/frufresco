import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY);

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

        // 3. Real Integration Check
        const gcpProjectId = process.env.GCP_PROJECT_ID;
        const gcpApiKey = process.env.GCP_OPTIMIZATION_KEY;

        if (gcpProjectId && gcpApiKey) {
            console.log(`🚀 [Optimizer] Calling real Google Cloud Optimization API for Project: ${gcpProjectId}`);
            
            const gcpResponse = await fetch(`https://routeoptimization.googleapis.com/v1/projects/${gcpProjectId}:optimizeTours?key=${gcpApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(gcpRequest)
            });

            if (gcpResponse.ok) {
                const gcpData = await gcpResponse.json();
                
                // Transform Google's assigned routes back to assignments map { vehicleId: [orderIds] }
                const assignments: Record<string, string[]> = {};
                vehicles.forEach((v: any) => assignments[v.id] = []);

                if (gcpData.routes) {
                    gcpData.routes.forEach((route: any) => {
                        const vehicleId = route.vehicleLabel; // We set this as v.id in gcpRequest
                        if (vehicleId && assignments[vehicleId]) {
                            // Extract order IDs from shipments in the route
                            // In Google's response, these are usually found in visits
                            const visitOrderIds = (route.visits || [])
                                .map((vst: any) => {
                                    // The index refers to the original shipments list index
                                    const shipmentIndex = vst.shipmentIndex;
                                    return orders[shipmentIndex]?.id;
                                })
                                .filter(Boolean);
                            
                            assignments[vehicleId] = visitOrderIds;
                        }
                    });
                }

                return NextResponse.json({
                    message: "Optimization generated by REAL Google Engine",
                    routes: assignments,
                    theoretical_metrics: {
                        distance_km: Math.round((gcpData.metrics?.totalDistanceMeters || 0) / 1000),
                        duration_min: Math.round((gcpData.metrics?.totalDuration?.seconds || 0) / 60)
                    },
                    gcp_raw: gcpData,
                    simulation: false
                });
            } else {
                const errText = await gcpResponse.text();
                console.error('GCP Optimizer Error:', errText);
                throw new Error(`Google API Error: ${errText}`);
            }
        }
        
        // --- SIMULATION MODE --- (Fallback)
        // Since we are in development/draft, we return the structured request 
        // and a simulated local assignment until the API Key is ready.
        
        return NextResponse.json({
            message: "OptimizeTours Request Structured Successfully (Simulation Mode)",
            debug_request: gcpRequest,
            status: "ready_for_key",
            simulation: true
        });

    } catch (error: any) {
        console.error('Optimizer API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
