import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';


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
        let base_setup = parameters?.base_setup_time || 4;
        let time_unload = parameters?.time_per_10_crates_unload || 4;
        let time_delivery = parameters?.time_per_10_crates_delivery || 10;
        let fleet_start = parameters?.fleet_start_time || '04:30';
        let fleet_end = parameters?.fleet_end_time || '19:00';
        let optimization_strategy = parameters?.optimization_strategy || 'balanced';
        let avg_kg_per_crate = parameters?.avg_kg_per_crate || 12.5;
        let driver_break_mins = parameters?.driver_break_mins || 45;

        const { data: dbParams } = await supabase.from('logistic_parameters').select('*');
        if (dbParams) {
            b2b_kg_min = parseFloat(dbParams.find(p => p.id === 'b2b_kg_min')?.value || String(b2b_kg_min));
            b2c_kg_min = parseFloat(dbParams.find(p => p.id === 'b2c_kg_min')?.value || String(b2c_kg_min));
            base_setup = parseFloat(dbParams.find(p => p.id === 'base_setup_time')?.value || String(base_setup));
            time_unload = parseFloat(dbParams.find(p => p.id === 'time_per_10_crates_unload')?.value || String(time_unload));
            time_delivery = parseFloat(dbParams.find(p => p.id === 'time_per_10_crates_delivery')?.value || String(time_delivery));
            fleet_start = dbParams.find(p => p.id === 'fleet_start_time')?.value || fleet_start;
            fleet_end = dbParams.find(p => p.id === 'fleet_end_time')?.value || fleet_end;
            optimization_strategy = dbParams.find(p => p.id === 'optimization_strategy')?.value || optimization_strategy;
            avg_kg_per_crate = parseFloat(dbParams.find(p => p.id === 'avg_kg_per_crate')?.value || String(avg_kg_per_crate));
            driver_break_mins = parseFloat(dbParams.find(p => p.id === 'driver_break_mins')?.value || String(driver_break_mins));
        }

        let vehicleFixedCost = 500; // default balanced
        if (optimization_strategy === 'minimize_vehicles') {
            vehicleFixedCost = 100000;
        } else if (optimization_strategy === 'minimize_time') {
            vehicleFixedCost = 0;
        }

        // Helper to compare HH:MM times
        const parseTimeStr = (t: string) => {
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };

        // 2. Map to Google OptimizeTours Request Schema
        // Ref: https://developers.google.com/maps/documentation/route-optimization/reference/rest/v1/projects.locations/optimizeTours
        
        const targetDate = orders[0]?.delivery_date ? orders[0].delivery_date.split('T')[0] : new Date().toISOString().split('T')[0];

        // Pad global planning horizon (starts 30 mins before fleet_start, ends 60 mins after fleet_end)
        const [fsH, fsM] = fleet_start.split(':').map(Number);
        const [feH, feM] = fleet_end.split(':').map(Number);
        
        let gStartH = fsH;
        let gStartM = fsM - 30;
        if (gStartM < 0) {
            gStartH -= 1;
            gStartM += 60;
        }
        if (gStartH < 0) {
            gStartH = 0;
            gStartM = 0;
        }
        
        let gEndH = feH + 1;
        let gEndM = feM;
        if (gEndH >= 24) {
            gEndH = 23;
            gEndM = 59;
        }

        const gStartStr = `${gStartH.toString().padStart(2, '0')}:${gStartM.toString().padStart(2, '0')}`;
        const gEndStr = `${gEndH.toString().padStart(2, '0')}:${gEndM.toString().padStart(2, '0')}`;

        const getOrderTimeWindow = (o: any, datePart: string) => {
            const isB2B = !!o.is_b2b || (o.type?.toLowerCase().includes('b2b') ?? false) || o.profiles?.role === 'b2b_client' || o.profiles?.role === 'b2b';

            if (!isB2B) {
                // B2C has absolutely no delivery slot constraint (flexible)
                try {
                    const startTime = new Date(`${datePart}T${fleet_start}:00-05:00`).toISOString();
                    const endTime = new Date(`${datePart}T${fleet_end}:00-05:00`).toISOString();
                    return { startTime, endTime };
                } catch (err) {
                    return {
                        startTime: new Date(`${datePart}T06:00:00-05:00`).toISOString(),
                        endTime: new Date(`${datePart}T18:00:00-05:00`).toISOString()
                    };
                }
            }

            let startLocal = fleet_start;
            let endLocal = fleet_end;

            // Scenario 1: Manual Override (takes precedence for B2B)
            if (o.is_manual_delivery && o.logistics_data?.windows?.[0]) {
                startLocal = o.logistics_data.windows[0].startTime || startLocal;
                endLocal = o.logistics_data.windows[0].endTime || endLocal;
            } 
            // Scenario 2: Client Profile Default
            else if (o.profiles?.logistics_data?.windows?.[0]) {
                startLocal = o.profiles.logistics_data.windows[0].startTime || startLocal;
                endLocal = o.profiles.logistics_data.windows[0].endTime || endLocal;
            }

            // Ensure window is mathematically valid (start < end)
            if (parseTimeStr(startLocal) >= parseTimeStr(endLocal)) {
                startLocal = fleet_start;
                endLocal = fleet_end;
            }

            try {
                const startTime = new Date(`${datePart}T${startLocal}:00-05:00`).toISOString();
                const endTime = new Date(`${datePart}T${endLocal}:00-05:00`).toISOString();
                return { startTime, endTime };
            } catch (err) {
                console.error("Error parsing time window for order:", o.id, err);
                return {
                    startTime: new Date(`${datePart}T${fleet_start}:00-05:00`).toISOString(),
                    endTime: new Date(`${datePart}T${fleet_end}:00-05:00`).toISOString()
                };
            }
        };

        // Check refrigerated orders (for the cold chain ADN)
        const orderIds = orders.map((o: any) => o.id);
        const { data: orderItems } = await supabase
            .from('order_items')
            .select(`
                order_id,
                products (
                    buying_team
                )
            `)
            .in('order_id', orderIds);

        const refrigeratedOrderIds = new Set(
            (orderItems || [])
                .filter((item: any) => {
                    const product = Array.isArray(item.products) ? item.products[0] : item.products;
                    return product?.buying_team?.toUpperCase().includes('REFRIGERADOS');
                })
                .map((item: any) => item.order_id)
        );

        // Helper to compute vehicle break schedule (mid-shift window)
        const getVehicleBreakRule = (datePart: string, fleetStart: string, breakMins: number) => {
            if (breakMins <= 0) return undefined;
            const [h, m] = fleetStart.split(':').map(Number);
            
            // Earliest break window is 4 hours after start
            let eh = h + 4;
            let em = m;
            if (eh >= 24) { eh = 23; em = 59; }
            const earliestTimeStr = `${eh.toString().padStart(2, '0')}:${em.toString().padStart(2, '0')}`;
            
            // Latest break window is 6 hours after start
            let lh = h + 6;
            let lm = m;
            if (lh >= 24) { lh = 23; lm = 59; }
            const latestTimeStr = `${lh.toString().padStart(2, '0')}:${lm.toString().padStart(2, '0')}`;
            
            try {
                return {
                    breakRequests: [
                        {
                            earliestStartTime: new Date(`${datePart}T${earliestTimeStr}:00-05:00`).toISOString(),
                            latestStartTime: new Date(`${datePart}T${latestTimeStr}:00-05:00`).toISOString(),
                            minDuration: `${breakMins * 60}s`
                        }
                    ]
                };
            } catch (err) {
                console.error("Error creating break rule:", err);
                return undefined;
            }
        };

        const gcpRequest = {
            model: {
                globalStartTime: new Date(`${targetDate}T${gStartStr}:00-05:00`).toISOString(),
                globalEndTime: new Date(`${targetDate}T${gEndStr}:00-05:00`).toISOString(),
                shipments: orders.map((o: any) => {
                    const cratesCount = o.crates || (o.total_weight_kg ? Math.ceil(o.total_weight_kg / avg_kg_per_crate) : 0);
                    const unloadingTime = Math.ceil(base_setup + ((time_unload + time_delivery) / 10) * cratesCount);
                    
                    const timeWindow = getOrderTimeWindow(o, targetDate);
                    const isRefrigerated = refrigeratedOrderIds.has(o.id);
 
                    return {
                        pickups: [
                            // Depot location (Bodega Principal)
                            { arrivalLocation: { latitude: 4.633653, longitude: -74.160647 } }
                        ],
                        deliveries: [
                            { 
                                arrivalLocation: { 
                                    latitude: o.latitude || o.profiles?.latitude || 4.633653, 
                                    longitude: o.longitude || o.profiles?.longitude || -74.160647 
                                },
                                timeWindows: [timeWindow],
                                duration: `${unloadingTime * 60}s`
                            }
                        ],
                        loadDemands: {
                            "weight": { "amount": String(Math.ceil(o.total_weight_kg)) },
                            "crates": { "amount": String(cratesCount) },
                            "refrigerated": { "amount": isRefrigerated ? "1" : "0" }
                        },
                        shipmentType: isRefrigerated ? "refrigerated" : "dry",
                        label: String(o.id)
                    };
                }),
                vehicles: vehicles.map((v: any) => {
                    const breakRule = getVehicleBreakRule(targetDate, fleet_start, driver_break_mins);
                    const vehicleObj: any = {
                        startLocation: { latitude: 4.633653, longitude: -74.160647 },
                        endLocation: { latitude: 4.633653, longitude: -74.160647 },
                        loadLimits: {
                            "weight": { "maxLoad": String(v.capacity_kg) },
                            "crates": { "maxLoad": String(v.max_crates_capacity || 483) },
                            "refrigerated": { "maxLoad": "0" } // All active vehicles default to dry, i.e. 0 refrigerated capacity
                        },
                        fixedCost: vehicleFixedCost,
                        startTimeWindows: [
                            {
                                startTime: new Date(`${targetDate}T${fleet_start}:00-05:00`).toISOString(),
                                endTime: new Date(`${targetDate}T${fleet_end}:00-05:00`).toISOString()
                            }
                        ],
                        endTimeWindows: [
                            {
                                startTime: new Date(`${targetDate}T${fleet_start}:00-05:00`).toISOString(),
                                endTime: new Date(`${targetDate}T${fleet_end}:00-05:00`).toISOString()
                            }
                        ],
                        displayName: v.plate,
                        label: v.id
                    };

                    if (breakRule) {
                        vehicleObj.breakRule = breakRule;
                    }

                    return vehicleObj;
                })
            },
            // Minimize active vehicles to see surplus as requested
            searchMode: "CONSUME_ALL_AVAILABLE_TIME",
            considerRoadTraffic: true
        };

        // 3. Real Integration Check
        const gcpProjectId = process.env.GCP_PROJECT_ID;
        const gcpApiKey = process.env.GCP_OPTIMIZATION_KEY;

        const serviceAccountPath = path.join(process.cwd(), 'gcp-service-account.json');
        let hasServiceAccount = false;
        try {
            hasServiceAccount = fs.existsSync(serviceAccountPath);
        } catch (_) {}

        if (hasServiceAccount || (gcpProjectId && gcpApiKey)) {
            let accessToken: string | null = null;
            let projectId = gcpProjectId || 'frufresco'; // fallback to frufresco project

            if (hasServiceAccount) {
                try {
                    console.log("🔑 [Optimizer] Authenticating via GCP Service Account JSON...");
                    const keyFileContent = fs.readFileSync(serviceAccountPath, 'utf8');
                    const keyData = JSON.parse(keyFileContent);
                    projectId = keyData.project_id || projectId;
                    
                    // Generate OAuth2 token using service account
                    const header = { alg: 'RS256', typ: 'JWT' };
                    const iat = Math.floor(Date.now() / 1000);
                    const exp = iat + 3600;
                    const claimSet = {
                        iss: keyData.client_email,
                        scope: 'https://www.googleapis.com/auth/cloud-platform',
                        aud: 'https://oauth2.googleapis.com/token',
                        exp: exp,
                        iat: iat
                    };

                    const encodeBase64Url = (obj: any) => {
                        return Buffer.from(JSON.stringify(obj))
                            .toString('base64')
                            .replace(/=/g, '')
                            .replace(/\+/g, '-')
                            .replace(/\//g, '_');
                    };

                    const signatureInput = `${encodeBase64Url(header)}.${encodeBase64Url(claimSet)}`;
                    const sign = crypto.createSign('RSA-SHA256');
                    sign.update(signatureInput);
                    const signature = sign.sign(keyData.private_key, 'base64')
                        .replace(/=/g, '')
                        .replace(/\+/g, '-')
                        .replace(/\//g, '_');

                    const jwtToken = `${signatureInput}.${signature}`;

                    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({
                            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                            assertion: jwtToken
                        })
                    });

                    if (!tokenResponse.ok) {
                        const err = await tokenResponse.text();
                        console.error("GCP OAuth exchange error:", err);
                        throw new Error(`Google OAuth error: ${err}`);
                    }

                    const tokenData = await tokenResponse.json();
                    accessToken = tokenData.access_token;
                    console.log("🔑 [Optimizer] OAuth2 token generated successfully!");
                } catch (oauthErr: any) {
                    console.error("OAuth token generation failed, falling back to API Key if configured:", oauthErr);
                }
            }

            console.log(`🚀 [Optimizer] Calling real Google Cloud Optimization API for Project: ${projectId}`);
            
            // Build target URL
            const url = `https://routeoptimization.googleapis.com/v1/projects/${projectId}:optimizeTours` + (accessToken ? '' : `?key=${gcpApiKey}`);
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (accessToken) {
                headers['Authorization'] = `Bearer ${accessToken}`;
            }

            const gcpResponse = await fetch(url, {
                method: 'POST',
                headers,
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
                            // Extract order IDs from shipments in the route (only delivery visits, excluding pickups)
                            const visitOrderIds = (route.visits || [])
                                .filter((vst: any) => !vst.isPickup)
                                .map((vst: any) => {
                                    // Google omits shipmentIndex if it is 0. Using shipmentLabel (order id) is safer and direct.
                                    if (vst.shipmentLabel) {
                                        return vst.shipmentLabel;
                                    }
                                    const shipmentIndex = vst.shipmentIndex ?? 0;
                                    return orders[shipmentIndex]?.id;
                                })
                                .filter(Boolean);
                            
                            assignments[vehicleId] = visitOrderIds;
                        }
                    });
                }

                // Generate AI explanation of the routing plan
                const explanation = await generateAiExplanation(orders, vehicles, assignments);

                return NextResponse.json({
                    message: "Optimization generated by REAL Google Engine",
                    routes: assignments,
                    theoretical_metrics: {
                        distance_km: Math.round((gcpData.metrics?.totalDistanceMeters || 0) / 1000),
                        duration_min: Math.round((gcpData.metrics?.totalDuration?.seconds || 0) / 60)
                    },
                    gcp_raw: gcpData,
                    simulation: false,
                    explanation: explanation
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
        const simulatedAssignments = calculateSimulationAssignments(orders, vehicles);
        const explanation = await generateAiExplanation(orders, vehicles, simulatedAssignments);
        
        return NextResponse.json({
            message: "OptimizeTours Request Structured Successfully (Simulation Mode)",
            debug_request: gcpRequest,
            status: "ready_for_key",
            simulation: true,
            routes: simulatedAssignments,
            theoretical_metrics: {
                distance_km: vehicles.length * 4,
                duration_min: vehicles.length * 20
            },
            explanation: explanation
        });

    } catch (error: any) {
        console.error('Optimizer API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

function calculateSimulationAssignments(orders: any[], vehicles: any[]) {
    const newAssignments: Record<string, string[]> = {};
    vehicles.forEach(v => newAssignments[v.id] = []);
    
    // Group orders by location (latitude/longitude and customer name) to keep same-location orders together
    const grouped: Record<string, typeof orders> = {};
    orders.forEach(o => {
        const key = `${o.latitude || ''}_${o.longitude || ''}_${o.customer_name}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(o);
    });

    // Sort groups by total weight descending
    const groups = Object.values(grouped).sort((a, b) => {
        const weightA = a.reduce((sum, o) => sum + o.total_weight_kg, 0);
        const weightB = b.reduce((sum, o) => sum + o.total_weight_kg, 0);
        return weightB - weightA;
    });

    // Assign groups to vehicles using a greedy capacity-aware approach
    groups.forEach(group => {
        const groupWeight = group.reduce((sum, o) => sum + o.total_weight_kg, 0);
        
        let bestVehicle = vehicles[0];
        let minWeight = Infinity;
        
        vehicles.forEach(v => {
            const currentWeight = newAssignments[v.id].reduce((sum, id) => {
                const o = orders.find(ord => ord.id === id);
                return sum + (o?.total_weight_kg || 0);
            }, 0);
            
            if (currentWeight + groupWeight <= v.capacity_kg && currentWeight < minWeight) {
                minWeight = currentWeight;
                bestVehicle = v;
            }
        });

        // Fallback to vehicle with lowest current weight if capacity limit is reached for all
        if (minWeight === Infinity) {
            let lowestWeight = Infinity;
            vehicles.forEach(v => {
                const currentWeight = newAssignments[v.id].reduce((sum, id) => {
                    const o = orders.find(ord => ord.id === id);
                    return sum + (o?.total_weight_kg || 0);
                }, 0);
                if (currentWeight < lowestWeight) {
                    lowestWeight = currentWeight;
                    bestVehicle = v;
                }
            });
        }

        group.forEach(order => {
            newAssignments[bestVehicle.id].push(order.id);
        });
    });
    
    return newAssignments;
}

async function generateAiExplanation(orders: any[], vehicles: any[], assignments: Record<string, string[]>) {
    try {
        const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        if (!apiKey) {
            return "No se pudo generar el informe de la IA porque no está configurada la API Key de Gemini en el servidor.";
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        // Build a concise description of the assignments for the prompt
        let summaryText = `Analiza la siguiente asignación de despacho de la flota de FruFresco y redacta un informe de máximo 3 a 4 párrafos/viñetas explicando brevemente y con emojis la lógica/estrategia de esta planeación.
        
VEHÍCULOS DISPONIBLES:
${vehicles.map(v => `- Camión ${v.plate} (Conductor: ${v.driver_name || 'No asignado'}, Capacidad de Peso: ${v.capacity_kg}kg, Capacidad de Canastillas: ${v.capacity_crates || 483})`).join('\n')}

PEDIDOS A DISTRIBUIR:
${orders.map(o => `- Pedido #${o.id} para ${o.customer_name} (Peso: ${o.total_weight_kg}kg, Canastillas: ${o.crates_count || 1}, Tipo Cliente: ${o.profiles?.role === 'b2b_client' ? 'B2B' : 'B2C'}, Ubicación: ${o.address || 'Bogotá'})`).join('\n')}

ASIGNACIÓN REALIZADA POR EL ALGORITMO:
${Object.entries(assignments).map(([vehicleId, orderIds]) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return `- Vehículo desconocido (${vehicleId}): ${orderIds.length} pedidos`;
    if (orderIds.length === 0) return `- Camión ${vehicle.plate} quedó LIBRE (sin pedidos asignados)`;
    const assignedOrders = orderIds.map(id => {
        const o = orders.find(ord => ord.id === id);
        return o ? `${o.customer_name} (#${o.id}, ${o.total_weight_kg}kg)` : `Pedido #${id}`;
    });
    return `- Camión ${vehicle.plate} llevará ${orderIds.length} pedidos: ${assignedOrders.join(', ')}`;
}).join('\n')}

INSTRUCCIONES DE REDACCIÓN:
1. Sé extremadamente directo, concreto y ejecutivo. Evita introducciones largas o conclusiones obvias ("no eches carreta"). Actúa como el Analista de Operaciones Logísticas de FruFresco.
2. Redacta el informe usando estrictamente de 3 a 4 viñetas (bullet points) muy cortas, precisas y al grano.
3. Resalta en **negrita** los datos logísticos clave (como placas de vehículos, nombres de conductores, pesos en **kg**, cantidad de **canastillas**, clientes corporativos o zonas/centros comerciales).
4. Explica concretamente la estrategia:
   - Consolidación de flota: por qué se seleccionaron esos camiones específicos y el ahorro de costos fijos al dejar otros libres.
   - Agrupamiento geográfico: si hay entregas concentradas en un mismo sector o centro comercial.
   - Seguridad: cumplimiento de límites de peso y capacidad de canastillas.
5. Inicia cada viñeta con un emoji correspondiente (ej: 🚚, ⚖️, 📍, 💰).
6. El texto debe ser de lectura rápida y ejecutiva para el despachador.`;

        const result = await model.generateContent(summaryText);
        const responseText = result.response.text();
        return responseText;
    } catch (e: any) {
        console.error('Error generating AI explanation:', e);
        return `Hubo un inconveniente al generar la justificación con IA: ${e.message || 'Error desconocido'}`;
    }
}
