require('dotenv').config({ path: '.env.local' });
const xlsx = require('xlsx');
const fs = require('fs');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyCL_C1jEroFYTcYHOSvYyOQiVW1XNCk3Y0';
const filePath = 'C:\\Users\\German Higuera\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Datas maestras\\rutas de prueba.xlsx';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const WAREHOUSE_LAT = 4.6300;
const WAREHOUSE_LNG = -74.1530;

const TARGET_DATE = "2026-04-22T00:00:00Z"; // Día de la prueba basado en el excel

// Helper para parsear horarios a TimeWindows de Google
const parseTimeWindow = (horarioStr) => {
    // Ejemplo "8:00 a.m. - 12:00 p.m." -> convert to seconds or ISO strings
    // Retorna algo seguro por defecto si no es parseable
    if (!horarioStr) return null;
    
    // Simplificación para la prueba: Asignaremos un horario holgado de 6 AM a 6 PM
    // en formato compatible con Google API (Soft o Hard Time Windows)
    return {
        startTime: "2026-04-22T06:00:00Z",
        endTime: "2026-04-22T18:00:00Z"
    };
};

// Helper Geocoding
const geocodeAddress = async (address) => {
    return new Promise((resolve) => {
        if (!address) return resolve({ lat: WAREHOUSE_LAT, lng: WAREHOUSE_LNG });
        const query = encodeURIComponent(`${address}, Bogotá, Colombia`);
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${API_KEY}`;
        
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const response = JSON.parse(data);
                if (response.results && response.results.length > 0) {
                    resolve(response.results[0].geometry.location);
                } else {
                    resolve({ lat: WAREHOUSE_LAT + (Math.random() - 0.5) * 0.1, lng: WAREHOUSE_LNG + (Math.random() - 0.5) * 0.1 });
                }
            });
        }).on('error', () => {
            resolve({ lat: WAREHOUSE_LAT, lng: WAREHOUSE_LNG });
        });
    });
};

const runSimulation = async () => {
    console.log("1. Obteniendo Flota de Supabase...");
    const { data: fleetData, error: fleetErr } = await supabase.from('fleet_vehicles').select('*');
    if (fleetErr) {
        console.error("Error obteniendo flota:", fleetErr.message);
        return;
    }
    console.log(`  ...${fleetData.length} vehículos encontrados en base de datos.`);

    console.log("2. Leyendo Excel...");
    const workbook = xlsx.readFile(filePath);
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { range: 1 });
    
    console.log("3. Geocodificando y parametrizando restricciones...");
    const orders = [];
    
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const address = row["__EMPTY_3"]; 
        const kg = parseFloat(row["__EMPTY_5"]) || 10; 
        const crates = parseInt(row["__EMPTY_6"]) || 1; 
        const horario = row["__EMPTY_4"]; 
        const name = row["__EMPTY_1"] || "Cliente";
        
        if (!address) continue;

        await new Promise(resolve => setTimeout(resolve, 50)); 
        const location = await geocodeAddress(address);
        
        // Time window simulation based on 'horario'
        // For Google API, TimeWindows require precise ISO datetime strings
        // We will mock soft time windows for the sake of the test
        const timeWindow = parseTimeWindow(horario);

        orders.push({
            id: `ORD-${i+1}`,
            customer_name: name,
            total_weight_kg: kg,
            crates: crates,
            address: address,
            lat: location.lat,
            lng: location.lng,
            timeWindow: timeWindow,
            raw_horario: horario
        });
        
        if (orders.length % 15 === 0) console.log(`  ...procesados ${orders.length} pedidos.`);
    }

    console.log(`\n4. Construyendo Payload con restricciones avanzadas...`);

    const gcpRequest = {
        model: {
            shipments: orders.map(o => ({
                pickupArrivalConfigurations: [
                    { arrivalLocation: { latitude: WAREHOUSE_LAT, longitude: WAREHOUSE_LNG } }
                ],
                deliveryArrivalConfigurations: [
                    { arrivalLocation: { latitude: o.lat, longitude: o.lng } }
                ],
                loadDemands: {
                    "weight": { amount: Math.ceil(o.total_weight_kg).toString() },
                    "crates": { amount: o.crates.toString() }
                },
                deliveryServiceDuration: { seconds: Math.ceil(5 * 60 + (o.total_weight_kg / 10) * 60) },
                displayName: o.customer_name,
                deliveryTimeWindows: o.timeWindow ? [o.timeWindow] : undefined
            })),
            vehicles: fleetData.map(v => ({
                startLocation: { latitude: WAREHOUSE_LAT, longitude: WAREHOUSE_LNG },
                endLocation: { latitude: WAREHOUSE_LAT, longitude: WAREHOUSE_LNG },
                loadLimits: {
                    "weight": { maxLoad: (v.capacity_kg || 1500).toString() },
                    "crates": { maxLoad: (v.max_crates_capacity || 100).toString() }
                },
                displayName: v.plate,
                label: v.plate
            })),
            globalConstraints: {
                trafficToken: "TRAFFIC_AWARE" 
            }
        },
        searchMode: "CONSUME_ALL_AVAILABLE_TIME",
        considerRoadTraffic: true
    };

    const outputFilePath = './scripts/google_optimize_payload.json';
    fs.writeFileSync(outputFilePath, JSON.stringify(gcpRequest, null, 2));
    console.log(`✅ Payload (con Flota DB y Restricciones) guardado en: ${outputFilePath}`);
};

runSimulation();
