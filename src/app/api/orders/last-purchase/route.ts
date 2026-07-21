import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const isUrlValid = supabaseUrl.startsWith('http');
const supabase = isUrlValid ? createClient(supabaseUrl, supabaseKey) : null as any;

export async function GET(request: Request) {
    try {
        if (!supabase) {
            return NextResponse.json({ error: 'Database connection unavailable' }, { status: 500 });
        }

        const { searchParams } = new URL(request.url);
        const profileId = (searchParams.get('profile_id') || '').trim();
        const email = (searchParams.get('email') || '').trim();
        const phone = (searchParams.get('phone') || '').replace(/\D/g, '');
        const identification = (searchParams.get('identification') || '').trim();

        if (!profileId && !email && !phone && !identification) {
            return NextResponse.json({ error: 'Debes ingresar tu correo, teléfono o cédula/NIT para buscar tu compra anterior.' }, { status: 400 });
        }

        const isValidUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
        const candidateOrders: any[] = [];

        // 1. Intentar por profile_id si es un UUID válido
        if (profileId && isValidUuid(profileId)) {
            const { data } = await supabase
                .from('orders')
                .select('id, created_at, total')
                .eq('profile_id', profileId)
                .order('created_at', { ascending: false })
                .limit(5);
            if (data) candidateOrders.push(...data);
        }

        // 2. Buscar perfiles coincidentes por email, nit o teléfono, y traer sus pedidos
        const orConditions = [];
        if (email) orConditions.push(`email.eq.${email}`);
        if (identification) orConditions.push(`nit.eq.${identification}`);
        if (phone) {
            orConditions.push(`contact_phone.eq.${phone}`);
            orConditions.push(`phone.eq.${phone}`);
        }

        if (orConditions.length > 0) {
            const { data: matchedProfiles } = await supabase
                .from('profiles')
                .select('id')
                .or(orConditions.join(','));
            if (matchedProfiles && matchedProfiles.length > 0) {
                const pids = matchedProfiles.map(p => p.id);
                const { data } = await supabase
                    .from('orders')
                    .select('id, created_at, total')
                    .in('profile_id', pids)
                    .order('created_at', { ascending: false })
                    .limit(5);
                if (data) candidateOrders.push(...data);
            }
        }

        // 3. Buscar pedidos guest/invitado por special_notes ilike
        if (email || phone || identification) {
            let notesQuery = supabase.from('orders').select('id, created_at, total');
            const filterParts = [];
            if (email) filterParts.push(`special_notes.ilike.%Email: ${email}%`);
            if (phone) filterParts.push(`special_notes.ilike.%Tel: ${phone}%`);
            if (identification) filterParts.push(`special_notes.ilike.%ID: ${identification}%`);
            
            if (filterParts.length > 0) {
                notesQuery = notesQuery.or(filterParts.join(','));
                const { data } = await notesQuery.order('created_at', { ascending: false }).limit(5);
                if (data) candidateOrders.push(...data);
            }
        }

        // Ordenar candidatos por fecha descendente
        candidateOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        lastOrder = candidateOrders[0] || null;

        if (!lastOrder) {
            return NextResponse.json({ error: 'No encontramos compras anteriores asociadas a tus datos.' }, { status: 404 });
        }

        // Consultar los ítems del último pedido (nota: product_name no existe en la base de datos)
        const { data: orderItems, error: itemsErr } = await supabase
            .from('order_items')
            .select('product_id, quantity')
            .eq('order_id', lastOrder.id);

        if (itemsErr || !orderItems || orderItems.length === 0) {
            return NextResponse.json({ error: 'El último pedido no contiene productos registrados.' }, { status: 404 });
        }

        // Consultar SIEMPRE LOS PRECIOS ACTUALES DE HOY en el catálogo activo
        const productIds = orderItems.map((i: any) => i.product_id).filter(Boolean);
        if (productIds.length === 0) {
            return NextResponse.json({ error: 'Los productos de tu última compra no están disponibles actualmente.' }, { status: 404 });
        }

        const { data: dbProducts, error: dbErr } = await supabase
            .from('products')
            .select('id, name, display_name, base_price, unit_of_measure, image_url, is_active, iva_rate, weight_kg, web_conversion_factor')
            .in('id', productIds);

        if (dbErr || !dbProducts) {
            return NextResponse.json({ error: 'Error al consultar precios del catálogo.' }, { status: 500 });
        }

        const itemsToImport = [];

        for (const item of orderItems) {
            const dbProd = dbProducts.find((p: any) => p.id === item.product_id);
            if (dbProd && dbProd.is_active !== false) {
                // PRECIO VIGENTE DE HOY EN EL CATÁLOGO
                const currentPrice = Math.ceil(((dbProd.base_price || 0) * (dbProd.web_conversion_factor || 1)) / 50) * 50;

                itemsToImport.push({
                    id: dbProd.id,
                    name: dbProd.display_name || dbProd.name,
                    price: currentPrice, // ¡PRECIO ACTUALIZADO HOY!
                    iva_rate: dbProd.iva_rate || 0,
                    unit: dbProd.unit_of_measure || 'Kg',
                    quantity: Number(item.quantity) || 1,
                    image_url: dbProd.image_url,
                    weight_kg: dbProd.weight_kg,
                    is_from_last_order: true
                });
            }
        }

        return NextResponse.json({
            success: true,
            order_id: lastOrder.id,
            created_at: lastOrder.created_at,
            items: itemsToImport
        });

    } catch (err: any) {
        console.error('Error in last-purchase API:', err);
        return NextResponse.json({ error: err?.message || 'Error interno al buscar compra' }, { status: 500 });
    }
}
