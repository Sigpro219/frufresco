import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

const GENERAL_INSTITUCIONAL_MODEL_ID = 'd90a91e5-827c-473d-9d4f-3e28c7c91e15';

// POST: Aplica los precios del Modelo Institucional General activo a una cotización/acuerdo existente
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { quote_id, author } = body;

        if (!quote_id) {
            return NextResponse.json({ error: 'ID de acuerdo comercial requerido' }, { status: 400 });
        }

        // 1. Obtener la cotización destino
        const { data: targetQuote, error: tqErr } = await supabaseAdmin
            .from('quotes')
            .select('*')
            .eq('id', quote_id)
            .single();

        if (tqErr || !targetQuote) {
            return NextResponse.json({ error: 'Acuerdo comercial no encontrado' }, { status: 404 });
        }

        // 2. Obtener el modelo maestro activo
        const { data: masterTemplate, error: mtErr } = await supabaseAdmin
            .from('quotes')
            .select('id, model_snapshot_name')
            .eq('status', 'template')
            .eq('model_id', GENERAL_INSTITUCIONAL_MODEL_ID)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (mtErr || !masterTemplate) {
            return NextResponse.json({ error: 'No hay un Modelo Institucional General activo en el sistema. Por favor sube uno primero.' }, { status: 404 });
        }

        // 3. Obtener los ítems del modelo maestro
        const { data: masterItems, error: miErr } = await supabaseAdmin
            .from('quote_items')
            .select('product_id, product_name, quantity, cost_basis, margin_percent, unit_price, iva_rate, iva_amount, total_price')
            .eq('quote_id', masterTemplate.id);

        if (miErr || !masterItems || masterItems.length === 0) {
            return NextResponse.json({ error: 'El Modelo Institucional General no contiene productos cargados' }, { status: 400 });
        }

        // 4. Eliminar ítems anteriores de la cotización destino
        const { error: delErr } = await supabaseAdmin
            .from('quote_items')
            .delete()
            .eq('quote_id', quote_id);

        if (delErr) throw delErr;

        // 5. Preparar e insertar los nuevos ítems replicados del maestro
        let subtotal = 0;
        let totalTax = 0;

        const newItemsToInsert = masterItems.map(it => {
            subtotal += Number(it.unit_price) || 0;
            totalTax += Number(it.iva_amount) || 0;
            return {
                quote_id: quote_id,
                product_id: it.product_id,
                product_name: it.product_name,
                quantity: it.quantity || 1,
                cost_basis: it.cost_basis,
                margin_percent: it.margin_percent,
                unit_price: it.unit_price,
                iva_rate: it.iva_rate,
                iva_amount: it.iva_amount,
                total_price: it.total_price
            };
        });

        const total = subtotal + totalTax;

        const batchSize = 100;
        for (let i = 0; i < newItemsToInsert.length; i += batchSize) {
            const batch = newItemsToInsert.slice(i, i + batchSize);
            const { error: insErr } = await supabaseAdmin
                .from('quote_items')
                .insert(batch);
            if (insErr) throw insErr;
        }

        // 6. Actualizar totales en quotes SIN TOCAR valid_until ni start_date
        const { error: upqErr } = await supabaseAdmin
            .from('quotes')
            .update({
                subtotal_amount: subtotal,
                total_tax_amount: totalTax,
                total_amount: total
            })
            .eq('id', quote_id);

        if (upqErr) throw upqErr;

        // 7. Registrar en audit_logs
        try {
            await supabaseAdmin.from('audit_logs').insert({
                action: 'APPLY_MASTER_INSTITUTIONAL_TEMPLATE',
                module: 'COMMERCIAL',
                collaborator_name: author || 'Comercial FruFresco',
                details: {
                    quote_id,
                    client_name: targetQuote.client_name,
                    template_id: masterTemplate.id,
                    template_name: masterTemplate.model_snapshot_name,
                    items_count: newItemsToInsert.length,
                    applied_at: new Date().toISOString()
                }
            });
        } catch (auditErr) {
            console.warn('Audit warning:', auditErr);
        }

        return NextResponse.json({
            success: true,
            applied_items_count: newItemsToInsert.length,
            template_name: masterTemplate.model_snapshot_name,
            subtotal,
            total
        });
    } catch (err: any) {
        console.error('Error applying master template:', err);
        return NextResponse.json({ error: err.message || 'Error al aplicar modelo maestro' }, { status: 500 });
    }
}
