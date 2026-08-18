import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { address, latitude, longitude, customer_name, customer_phone, customer_email, channel, municipality } = body;

        if (!address || !latitude || !longitude) {
            return NextResponse.json({ error: 'Faltan coordenadas o dirección' }, { status: 400 });
        }

        const safeLat = parseFloat(Number(latitude).toFixed(8));
        const safeLng = parseFloat(Number(longitude).toFixed(8));

        // Check for recent duplicate (within last 3 minutes) to prevent multi-click duplicates
        if (customer_phone || address) {
            const threeMinsAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
            let query = supabase.from('out_of_bounds_requests').select('id').gte('created_at', threeMinsAgo);
            if (customer_phone) {
                query = query.eq('customer_phone', customer_phone);
            } else {
                query = query.eq('address', address);
            }
            const { data: recent } = await query.limit(1);
            if (recent && recent.length > 0) {
                console.log('📍 Ignored duplicate out-of-bounds request within 3m');
                return NextResponse.json({ success: true, duplicate: true });
            }
        }

        const newRecord = {
            id: `oob_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            created_at: new Date().toISOString(),
            address,
            latitude: safeLat,
            longitude: safeLng,
            customer_name: customer_name || 'Cliente Anónimo',
            customer_phone: customer_phone || null,
            customer_email: customer_email || null,
            channel: channel || 'b2c',
            municipality: municipality || 'Fuera de Zona'
        };

        // 1. Intentar inserción en tabla dedicada
        const { data: dbData, error: dbError } = await supabase
            .from('out_of_bounds_requests')
            .insert(newRecord)
            .select()
            .single();

        if (!dbError && dbData) {
            return NextResponse.json({ success: true, record: dbData });
        }

        // 2. Fallback súper confiable en app_settings
        const { data: settingData } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'out_of_bounds_requests')
            .maybeSingle();

        let currentList: any[] = [];
        if (settingData?.value) {
            try { currentList = JSON.parse(settingData.value); } catch {}
        }

        currentList.unshift(newRecord);
        if (currentList.length > 500) currentList = currentList.slice(0, 500); // Mantener últimas 500 solicitudes

        await supabase
            .from('app_settings')
            .upsert({
                key: 'out_of_bounds_requests',
                value: JSON.stringify(currentList),
                updated_at: new Date().toISOString()
            }, { onConflict: 'key' });

        console.log('📍 Demanda Rechazada registrada exitosamente:', newRecord.id);
        return NextResponse.json({ success: true, record: newRecord });
    } catch (err: any) {
        console.error('API Out of bounds error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function GET() {
    try {
        // 1. Intentar consulta de tabla dedicada
        const { data: dbData, error: dbError } = await supabase
            .from('out_of_bounds_requests')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(300);

        if (!dbError && dbData && dbData.length > 0) {
            return NextResponse.json({ requests: dbData });
        }

        // 2. Fallback a app_settings
        const { data: settingData } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'out_of_bounds_requests')
            .maybeSingle();

        let list: any[] = [];
        if (settingData?.value) {
            try { list = JSON.parse(settingData.value); } catch {}
        }

        return NextResponse.json({ requests: list });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
