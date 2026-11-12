import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
const serviceKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const supabase = (supabaseUrl && serviceKey) ? createClient(supabaseUrl, serviceKey) : null;

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const orderId = searchParams.get('id') || searchParams.get('order_id');

        if (!orderId) {
            return NextResponse.json({ error: 'Parámetro id u order_id es requerido' }, { status: 400 });
        }

        if (!supabase) {
            return NextResponse.json({ error: 'Configuración de base de datos no disponible' }, { status: 500 });
        }

        // Consultar orden con Service Role para acceso agnóstico y seguro
        const { data: order, error: orderErr } = await supabase
            .from('orders')
            .select(`
                id, sequence_id, status, delivery_date, shipping_address, profile_id,
                profiles:profile_id(id, company_name, contact_name, phone, contact_phone, nit)
            `)
            .eq('id', orderId)
            .maybeSingle();

        if (orderErr) {
            console.error('Error fetching order for PQRS:', orderErr);
            return NextResponse.json({ error: 'Error al consultar la orden' }, { status: 500 });
        }

        if (!order) {
            return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
        }

        // Consultar ítems de la orden
        const { data: items, error: itemsErr } = await supabase
            .from('order_items')
            .select(`
                id, product_id, quantity, unit, nickname, variant_label,
                products(id, name, accounting_id, unit_of_measure, category)
            `)
            .eq('order_id', orderId);

        if (itemsErr) {
            console.error('Error fetching order items for PQRS:', itemsErr);
            return NextResponse.json({ error: 'Error al consultar los productos del pedido' }, { status: 500 });
        }

        // Normalización y DTO Higienizado (Zero-Trust: jamás exponer precios de compra, márgenes ni notas internas)
        const profileData = Array.isArray(order.profiles) ? order.profiles[0] : order.profiles;
        const clientName = profileData?.company_name || profileData?.contact_name || 'Cliente Institucional';

        const sanitizedItems = (items || []).map(itm => {
            const prod = Array.isArray(itm.products) ? itm.products[0] : itm.products;
            const pName = prod?.name || itm.nickname || 'Producto';
            const accId = prod?.accounting_id || null;
            const unit = itm.unit || prod?.unit_of_measure || 'Kg';
            const qty = Number(itm.quantity || 0);

            return {
                id: itm.id,
                product_id: itm.product_id || prod?.id,
                name: pName,
                accounting_id: accId,
                quantity: qty,
                unit: unit,
                category: prod?.category || null
            };
        });

        return NextResponse.json({
            order: {
                id: order.id,
                sequence_id: order.sequence_id,
                delivery_date: order.delivery_date,
                status: order.status,
                client_name: clientName,
                shipping_address: order.shipping_address
            },
            items: sanitizedItems
        });

    } catch (err: any) {
        console.error('Unexpected error in /api/pqrs/order:', err);
        return NextResponse.json({ error: err.message || 'Error interno del servidor' }, { status: 500 });
    }
}
