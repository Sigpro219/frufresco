import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

const GENERAL_INSTITUCIONAL_MODEL_ID = 'd90a91e5-827c-473d-9d4f-3e28c7c91e15';

// GET: Retorna el Modelo Institucional General activo con todos sus quote_items enriquecidos
export async function GET() {
    try {
        const { data: template, error: tErr } = await supabaseAdmin
            .from('quotes')
            .select('id, quote_number, client_name, model_id, model_snapshot_name, subtotal_amount, total_tax_amount, total_amount, status, created_at, updated_at')
            .eq('status', 'template')
            .eq('model_id', GENERAL_INSTITUCIONAL_MODEL_ID)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (tErr) throw tErr;

        if (!template) {
            return NextResponse.json({ template: null, items: [] });
        }

        const { data: items, error: iErr } = await supabaseAdmin
            .from('quote_items')
            .select('id, product_id, product_name, quantity, cost_basis, margin_percent, unit_price, iva_rate, iva_amount, total_price, products:product_id (accounting_id, unit_of_measure, name, base_price, iva_rate, sku)')
            .eq('quote_id', template.id)
            .order('product_name', { ascending: true });

        if (iErr) throw iErr;

        return NextResponse.json({ template, items: items || [] });
    } catch (err: any) {
        console.error('Error fetching master template:', err);
        return NextResponse.json({ error: err.message || 'Error al obtener modelo maestro' }, { status: 500 });
    }
}

// POST: Guarda o actualiza el Modelo Institucional General
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { name, items, author } = body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: 'La lista de ítems no puede estar vacía' }, { status: 400 });
        }

        // 1. Archivar plantillas previas
        await supabaseAdmin
            .from('quotes')
            .update({ status: 'template_archived' })
            .eq('status', 'template')
            .eq('model_id', GENERAL_INSTITUCIONAL_MODEL_ID);

        // 2. Calcular totales
        let subtotal = 0;
        let totalTax = 0;
        items.forEach(it => {
            const price = Number(it.unit_price) || 0;
            const ivaRate = Number(it.iva_rate) || 0;
            const iva = price * (ivaRate / 100);
            subtotal += price;
            totalTax += iva;
        });
        const total = subtotal + totalTax;

        const defaultName = `Institucional General - ${new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-')}`;
        const templateName = (name && name.trim()) ? name.trim() : defaultName;

        // 3. Crear nueva cotización plantilla
        const { data: newTemplate, error: qErr } = await supabaseAdmin
            .from('quotes')
            .insert({
                client_id: null,
                client_name: 'Modelo Institucional General',
                model_id: GENERAL_INSTITUCIONAL_MODEL_ID,
                model_snapshot_name: templateName,
                status: 'template',
                start_date: new Date().toISOString(),
                valid_until: null,
                subtotal_amount: subtotal,
                total_tax_amount: totalTax,
                total_amount: total,
                version: 1
            })
            .select()
            .single();

        if (qErr) throw qErr;

        // 4. Insertar quote_items en lotes de 100
        const itemsToInsert = items.map(it => {
            const unitPrice = Number(it.unit_price) || 0;
            const costBasis = Number(it.cost_basis) || 0;
            const ivaRate = Number(it.iva_rate) || 0;
            const ivaAmount = unitPrice * (ivaRate / 100);
            const margin = unitPrice > 0 ? Math.round(((unitPrice - costBasis) / unitPrice) * 10000) / 100 : 0;

            return {
                quote_id: newTemplate.id,
                product_id: it.product_id,
                product_name: it.product_name,
                quantity: 1,
                cost_basis: costBasis,
                margin_percent: margin,
                unit_price: unitPrice,
                iva_rate: ivaRate,
                iva_amount: ivaAmount,
                total_price: unitPrice + ivaAmount
            };
        });

        const batchSize = 100;
        for (let i = 0; i < itemsToInsert.length; i += batchSize) {
            const batch = itemsToInsert.slice(i, i + batchSize);
            const { error: bErr } = await supabaseAdmin
                .from('quote_items')
                .insert(batch);
            if (bErr) throw bErr;
        }

        // 5. Registrar en audit_logs
        try {
            await supabaseAdmin.from('audit_logs').insert({
                action: 'UPLOAD_MASTER_INSTITUTIONAL_TEMPLATE',
                module: 'COMMERCIAL',
                collaborator_name: author || 'Comercial FruFresco',
                details: {
                    template_id: newTemplate.id,
                    name: templateName,
                    items_count: itemsToInsert.length,
                    subtotal,
                    total,
                    created_at: new Date().toISOString()
                }
            });
        } catch (auditErr) {
            console.warn('Audit warning:', auditErr);
        }

        return NextResponse.json({
            success: true,
            template: newTemplate,
            items_count: itemsToInsert.length
        });
    } catch (err: any) {
        console.error('Error saving master template:', err);
        return NextResponse.json({ error: err.message || 'Error al guardar modelo maestro' }, { status: 500 });
    }
}
