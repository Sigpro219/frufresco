
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables manually
let SUPABASE_URL, SUPABASE_KEY;

try {
    const envPath = path.resolve(__dirname, '.env.local');
    const envContent = fs.readFileSync(envPath, 'utf8');

    const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
    const keyMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

    if (urlMatch) SUPABASE_URL = urlMatch[1].trim();
    if (keyMatch) SUPABASE_KEY = keyMatch[1].trim();
} catch (e) {
    console.error('Error reading .env.local', e);
    process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function seed() {
    console.log('Starting seed...');

    // 1. Create Delivery Zones
    const zones = ['Norte', 'Sur', 'Oriente', 'Occidente', 'Centro'];
    const { data: existingZones } = await supabase.from('delivery_zones').select('name');
    const existingZoneNames = new Set(existingZones?.map(z => z.name) || []);

    for (const zone of zones) {
        if (!existingZoneNames.has(zone)) {
            const { error } = await supabase.from('delivery_zones').insert({ name: zone });
            if (error) console.error(`Error creating zone ${zone}:`, error.message);
            else console.log(`Zone created: ${zone}`);
        }
    }

    // 2. Create Products
    const newProducts = [
        // Hortalizas
        { name: 'Brócoli Fresco', category: 'Hortalizas', base_price: 3500, unit_of_measure: 'Kg', image_url: 'https://images.unsplash.com/photo-1459411621453-7fb8db8f8587?auto=format&fit=crop&w=400' },
        { name: 'Coliflor', category: 'Hortalizas', base_price: 4200, unit_of_measure: 'Unidad', image_url: 'https://images.unsplash.com/photo-1568584711075-3d021a7c3ca3?auto=format&fit=crop&w=400' },
        { name: 'Espinaca Bogotana', category: 'Hortalizas', base_price: 2800, unit_of_measure: 'Manojo', image_url: 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?auto=format&fit=crop&w=400' },
        { name: 'Acelga', category: 'Hortalizas', base_price: 2500, unit_of_measure: 'Manojo', image_url: 'https://images.unsplash.com/photo-1515471209610-dae1c92d8777?auto=format&fit=crop&w=400' },

        // Despensa
        { name: 'Arroz Premium 5kg', category: 'Despensa', base_price: 18000, unit_of_measure: 'Bulto', image_url: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=400' },
        { name: 'Aceite Vegetal 3L', category: 'Despensa', base_price: 25000, unit_of_measure: 'Galón', image_url: 'https://images.unsplash.com/photo-1474979266404-7eaacbcdcc41?auto=format&fit=crop&w=400' },
        { name: 'Panela Pulverizada', category: 'Despensa', base_price: 4500, unit_of_measure: 'Kg', image_url: 'https://images.unsplash.com/photo-1587595431973-160d0d94add1?auto=format&fit=crop&w=400' },
        { name: 'Frijol Bola Roja', category: 'Despensa', base_price: 8900, unit_of_measure: 'Kg', image_url: 'https://images.unsplash.com/photo-1551462147-37885acc36f1?auto=format&fit=crop&w=400' },

        // Tubérculos (Nueva Categoría)
        { name: 'Papa Pastusa', category: 'Tubérculos', base_price: 3200, unit_of_measure: 'Kg', image_url: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=400' },
        { name: 'Papa Criolla', category: 'Tubérculos', base_price: 4500, unit_of_measure: 'Kg', image_url: 'https://images.unsplash.com/photo-1623654641675-9e6e8c750e30?auto=format&fit=crop&w=400' },
        { name: 'Yuca', category: 'Tubérculos', base_price: 2800, unit_of_measure: 'Kg', image_url: 'https://images.unsplash.com/photo-1596706037533-333181827471?auto=format&fit=crop&w=400' },
        { name: 'Arracacha', category: 'Tubérculos', base_price: 3800, unit_of_measure: 'Kg', image_url: 'https://media.istockphoto.com/id/1156641772/es/foto/la-arracacha.jpg?s=612x612&w=0&k=20&c=L_q7K_R0sJ4Y8r0sJ4Y8r0sJ4Y8r0sJ4Y8r0sJ4Y8r0=' } // Placeholder valid
    ];

    for (const prod of newProducts) {
        // Simple duplicate check
        const { data: existing } = await supabase.from('products').select('id').eq('name', prod.name).single();
        if (!existing) {
            const { error } = await supabase.from('products').insert({
                sku: `SKU-${Math.floor(Math.random() * 10000)}`,
                ...prod,
                is_active: true
            });
            if (error) console.error(`Error creating product ${prod.name}:`, error.message);
            else console.log(`Product created: ${prod.name}`);
        }
    }

    // 3. Create Clients (Profiles)
    // We need to fetch zones first to assign them
    const { data: allZones } = await supabase.from('delivery_zones').select('*');
    if (!allZones || allZones.length === 0) {
        console.error('No zones found to assign clients.');
        return;
    }

    const businessTypes = ['Restaurante', 'Hotel', 'Casino', 'Colegio', 'Club'];
    const names = ['El Sazón', 'La Cuchara', 'Delicias', 'Gourmet', 'Express', 'Sabores', 'Rincón', 'Patio', 'Terraza', 'Fogón'];

    for (let i = 0; i < 40; i++) {
        const randomZone = allZones[Math.floor(Math.random() * allZones.length)];
        const businessName = `${names[Math.floor(Math.random() * names.length)]} ${names[Math.floor(Math.random() * names.length)]} ${i + 1}`;
        const email = `cliente${i + 1}@example.com`; // Dummy email

        // Check if profile exists (by checking a unique field like email if we stored it, but profiles usually linked to auth users).
        // For simulation, we might insert into 'profiles' directly if RLS allows, 
        // OR we just create "Mock Clients" in a separate table if user interaction is not required on their end yet.
        // Assuming 'profiles' table has 'company_name', 'role' = 'client', and 'zone_id'.

        // NOTE: Since we cannot create Auth Users via client API easily without admin rights, we will assume
        // we are inserting into a 'profiles' or 'clients' table that supports loose linkage or we insert rows directly.
        // If 'profiles' requires a UUID linked to auth.users, this step might fail without an auth user.
        // STRATEGY: We will try to insert into 'profiles' with a random UUID for 'id' since it's a seed script 
        // and we might not strictly enforce FK to auth.users in development or we want to test the UI.

        const fakeId = `00000000-0000-0000-0000-${(i + 1000).toString().padStart(12, '0')}`;

        const { error } = await supabase.from('profiles').upsert({
            id: fakeId,
            company_name: businessName,
            contact_name: `Gerente ${i + 1}`,
            contact_email: email,
            role: 'client',
            delivery_zone_id: randomZone.id // Assuming we added this column or will add it
        }, { onConflict: 'id' });

        if (error) {
            // If delivery_zone_id doesn't exist on schema yet, this will fail.
            // We will try inserting without it first if it fails, or just log error.
            if (error.message.includes('delivery_zone_id')) {
                console.log('Skipping zone assignment (column missing?)');
                await supabase.from('profiles').upsert({
                    id: fakeId,
                    company_name: businessName,
                    role: 'client'
                });
            } else {
                console.error(`Error creating client ${businessName}:`, error.message);
            }
        } else {
            console.log(`Client created: ${businessName} in ${randomZone.name}`);
        }
    }

    console.log('Seed completed.');
}

seed();
