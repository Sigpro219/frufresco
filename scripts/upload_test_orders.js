require('dotenv').config({ path: '.env.local' });
const xlsx = require('xlsx');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const filePath = 'C:\\Users\\German Higuera\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\Datas maestras\\rutas de prueba.xlsx';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const WAREHOUSE_LAT = 4.6300;
const WAREHOUSE_LNG = -74.1530;

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

const uploadData = async () => {
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
    const targetDate = today.toISOString().split('T')[0];

    console.log(`0. Limpiando pedidos de prueba...`);
    const { data: existing, error: delErr1 } = await supabase.from('orders')
        .select('id, admin_notes')
        .eq('delivery_date', targetDate)
        .eq('status', 'approved');
        
    if (!delErr1 && existing) {
        const testIds = existing.filter(e => e.admin_notes && e.admin_notes.includes('[TEST-KG:')).map(e => e.id);
        if (testIds.length > 0) {
            await supabase.from('orders').delete().in('id', testIds);
            console.log(`   Se limpiaron ${testIds.length} pedidos defectuosos.`);
        }
    }

    console.log("1. Leyendo Excel...");
    const workbook = xlsx.readFile(filePath);
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { range: 1 });
    
    console.log("2. Subiendo a Supabase con mapeo CORRECTO...");
    let successCount = 0;

    // Start from i=1 to skip the header row inside the data array
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        
        // CORRECCIÓN DE MAPEO:
        const zona = row["__EMPTY_1"];
        const name = row["__EMPTY_2"];
        const address = row["__EMPTY_4"];
        const horario = row["__EMPTY_5"];
        const kgRaw = row["__EMPTY_6"];
        const cratesRaw = row["__EMPTY_7"];
        const novedad = row["__EMPTY_11"] || "";
        
        if (!name || !address) continue;

        // Parse numbers safely
        const kg = parseFloat(kgRaw) || 10;
        const crates = parseInt(cratesRaw) || Math.ceil(kg / 17); // 17kg por canastilla aprox

        await new Promise(resolve => setTimeout(resolve, 50)); 
        const location = await geocodeAddress(address);
        
        const isB2B = name.includes('SAS') || name.includes('LTDA') || name.includes('REST') || kg > 50 || Math.random() > 0.5;
        const cleanNovedad = novedad.replace(/[\r\n]+/g, ' ').replace(/[\[\]]/g, '');

        const orderData = {
            status: 'approved',
            type: isB2B ? 'b2b' : 'b2c',
            shipping_address: `${name} - ${address}`,
            delivery_date: targetDate,
            delivery_slot: horario || 'Abierta',
            latitude: location.lat,
            longitude: location.lng,
            admin_notes: `[TEST-KG: ${kg}] [ZONA: ${zona || 'Central'}] [CRATES: ${crates}] [NOVEDAD: ${cleanNovedad}]`,
            total: kg * 5000 
        };

        const { error } = await supabase.from('orders').insert(orderData);
        if (error) {
            console.error(`Error insertando pedido ${name}:`, error.message);
        } else {
            successCount++;
        }
        
        if (successCount % 10 === 0) console.log(`  ...insertados ${successCount} pedidos.`);
    }

    console.log(`✅ ¡Proceso finalizado! ${successCount} pedidos mapeados e insertados correctamente.`);
};

uploadData();
