import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const ALL_CATEGORIES = [
  'Despensa',
  'Hortalizas',
  'Verduras',
  'Lácteos',
  'Frutas',
  'Tubérculos',
  'Congelados',
  'Procesados'
];

const CATEGORY_TO_CODES: Record<string, string[]> = {
  'Despensa': ['DE', 'Despensa', 'despensa'],
  'Hortalizas': ['HO', 'Hortalizas', 'hortalizas'],
  'Verduras': ['VE', 'Verduras', 'verduras'],
  'Lácteos': ['LA', 'Lácteos', 'lacteos'],
  'Frutas': ['FR', 'Frutas', 'frutas'],
  'Tubérculos': ['TU', 'Tubérculos', 'tuberculos'],
  'Congelados': ['CO', 'Congelados', 'congelados'],
  'Procesados': ['PR', 'Procesados', 'procesados']
};

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { 
            company_name, 
            contact_name, 
            phone, 
            email, 
            business_type, 
            business_size, 
            selected_categories, 
            latitude, 
            longitude, 
            address, 
            municipality,
            is_out_of_coverage,
            is_near_coverage,
            distance_to_coverage,
            wants_coverage_call
        } = body;

        if (!company_name || !phone) {
            return NextResponse.json({ error: 'Faltan datos obligatorios (nombre o teléfono)' }, { status: 400 });
        }

        const isNearCall = is_near_coverage && wants_coverage_call;
        const notesTag = is_out_of_coverage 
            ? (isNearCall 
                ? ` | [ZONA PRÓXIMA - SOLICITA LLAMADA COBERTURA (a ${Math.round(distance_to_coverage || 0)}m)]` 
                : ` | [ZONA SIN COBERTURA (a ${Math.round(distance_to_coverage || 0)}m)]`)
            : '';
        const catTag = selected_categories && selected_categories.length > 0
            ? ` | CATS: [${selected_categories.join(', ')}]`
            : '';
        const statusValue = is_out_of_coverage 
            ? (isNearCall ? 'new' : 'rejected')
            : 'new';

        // 1. Log out of bounds request if out of coverage
        if (is_out_of_coverage && latitude && longitude) {
            try {
                const safeLat = parseFloat(Number(latitude).toFixed(8));
                const safeLng = parseFloat(Number(longitude).toFixed(8));
                const threeMinsAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
                
                let query = supabase.from('out_of_bounds_requests').select('id').gte('created_at', threeMinsAgo);
                if (phone) {
                    query = query.eq('customer_phone', phone);
                } else {
                    query = query.eq('address', address);
                }
                const { data: recent } = await query.limit(1);

                if (!recent || recent.length === 0) {
                    await supabase.from('out_of_bounds_requests').insert({
                        id: `oob_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                        created_at: new Date().toISOString(),
                        address: address || 'Fuera de zona',
                        latitude: safeLat,
                        longitude: safeLng,
                        customer_name: `${company_name} (${business_type || 'Restaurante'})`,
                        customer_phone: phone,
                        customer_email: email,
                        channel: 'b2b',
                        municipality: `${municipality || 'Fuera de Zona'} · ${business_size}`
                    });
                }
            } catch (e) {
                console.warn('Silent B2B out of bounds log warning:', e);
            }
        }

        // 2. Insert B2B Lead using Service Role Key
        const { data: leadRow, error: leadError } = await supabase
            .from('leads')
            .insert([{
                company_name: company_name.trim(),
                nit: null,
                contact_name: contact_name ? contact_name.trim() : company_name.trim(),
                phone: phone.trim(),
                email: email ? email.trim() : null,
                business_type: business_type || 'Restaurante',
                business_size: business_size || 'Entre $10M y $30M COP',
                latitude: latitude || null,
                longitude: longitude || null,
                address: address || 'Bogotá',
                municipality: municipality || 'Bogotá',
                status: statusValue,
                notes: `📍 GPS: ${latitude},${longitude} | MUN: ${municipality || 'Bogotá'}${catTag} | ORIG: ${address}${notesTag} | PASOS_3_V2.5 🚀`
            }])
            .select('id')
            .single();

        if (leadError) {
            console.error('API Error inserting lead:', leadError);
            return NextResponse.json({ error: leadError.message }, { status: 500 });
        }

        const newLeadId = leadRow?.id;
        let createdQuoteId: string | null = null;

        // 3. Auto-generate pre-quotation (always generate quote for new leads)
        if (newLeadId) {
            let colorTag = 'rojo';
            const size = business_size || '';
            if (size.includes('Grande') || size.includes('30M')) {
                colorTag = 'verde';
            } else if (size.includes('Mediano') || size.includes('10M')) {
                colorTag = 'amarillo';
            }

            // Query model by color_tag
            const { data: matchedModel } = await supabase
                .from('pricing_models')
                .select('id, name')
                .eq('color_tag', colorTag)
                .limit(1)
                .maybeSingle();

            const modelId = matchedModel?.id || 'd90a91e5-827c-473d-9d4f-3e28c7c91e15';
            const modelName = matchedModel?.name || 'General Institucional';

            let productsToQuote: any[] = [];
            const chosenCats = (selected_categories && selected_categories.length > 0)
                ? selected_categories
                : ALL_CATEGORIES;

            const categoryCodes = chosenCats.flatMap(c => CATEGORY_TO_CODES[c] || [c]);

            // Determinar límite por categoría según la cantidad de categorías seleccionadas
            const numCats = chosenCats.length;
            const maxPerCat = numCats === 1 ? 25 : numCats <= 3 ? 12 : 6;

            // Query products matching selected categories
            const { data: categoryProds } = await supabase
                .from('products')
                .select('id, name, base_price, iva_rate, sku, category')
                .eq('is_active', true)
                .gt('base_price', 0)
                .in('category', categoryCodes)
                .order('name', { ascending: true })
                .limit(150);

            if (categoryProds && categoryProds.length > 0) {
                const groupedByCat: Record<string, any[]> = {};
                categoryProds.forEach((p: any) => {
                    const cat = p.category || 'General';
                    if (!groupedByCat[cat]) groupedByCat[cat] = [];
                    if (groupedByCat[cat].length < maxPerCat) {
                        groupedByCat[cat].push(p);
                    }
                });
                productsToQuote = Object.values(groupedByCat).flat();
            }

            // Fallback to active products if empty
            if (productsToQuote.length === 0) {
                const { data: activeProds } = await supabase
                    .from('products')
                    .select('id, name, base_price, iva_rate, sku, category')
                    .eq('is_active', true)
                    .gt('base_price', 0)
                    .order('name', { ascending: true })
                    .limit(20);
                if (activeProds) productsToQuote = activeProds;
            }

            if (productsToQuote.length > 0) {
                const prodIds = productsToQuote.map(p => p.id);
                
                // Fetch pricing model prices cache
                const { data: modelPrices } = await supabase
                    .from('pricing_model_prices')
                    .select('product_id, price')
                    .eq('model_id', modelId)
                    .in('product_id', prodIds);

                let subtotal = 0;
                let tax = 0;
                let total = 0;
                const itemsToInsert = [];

                for (const p of productsToQuote) {
                    const cached = modelPrices?.find(mp => mp.product_id === p.id);
                    const validCachedPrice = cached && Number(cached.price) > 0 ? Number(cached.price) : null;
                    const marginMultiplier = colorTag === 'verde' ? 1.05 : colorTag === 'amarillo' ? 1.10 : 1.15;
                    const marginPercent = colorTag === 'verde' ? 5 : colorTag === 'amarillo' ? 10 : 15;

                    const unitPrice = validCachedPrice 
                        ? validCachedPrice 
                        : Math.round(Number(p.base_price) * marginMultiplier);

                    const qty = 1; // 1 unit per SKU (e.g. 1 Kg / 1 Bulto)
                    const itemSubtotal = unitPrice * qty;
                    const itemTaxRate = Number(p.iva_rate || 0);
                    const itemTax = itemSubtotal * (itemTaxRate / 100);
                    const itemTotal = itemSubtotal + itemTax;

                    subtotal += itemSubtotal;
                    tax += itemTax;
                    total += itemTotal;

                    itemsToInsert.push({
                        product_id: p.id,
                        product_name: p.name,
                        quantity: qty,
                        cost_basis: p.base_price,
                        margin_percent: marginPercent,
                        unit_price: unitPrice,
                        iva_rate: itemTaxRate,
                        iva_amount: itemTax,
                        total_price: itemTotal
                    });
                }

                // Create Quote using Service Role Key
                const { data: newQuote, error: newQuoteErr } = await supabase
                    .from('quotes')
                    .insert([{
                        lead_id: newLeadId,
                        client_name: company_name.trim(),
                        model_id: modelId,
                        model_snapshot_name: modelName,
                        subtotal_amount: subtotal,
                        total_tax_amount: tax,
                        total_amount: total,
                        status: 'sent'
                    }])
                    .select('id')
                    .single();

                if (newQuoteErr) {
                    console.error('Error creating auto-quote:', newQuoteErr);
                } else if (newQuote) {
                    createdQuoteId = newQuote.id;
                    const itemsWithQuoteId = itemsToInsert.map(it => ({ ...it, quote_id: newQuote.id }));
                    await supabase
                        .from('quote_items')
                        .insert(itemsWithQuoteId);
                }
            }
        }

        return NextResponse.json({
            success: true,
            leadId: newLeadId,
            quoteId: createdQuoteId,
            status: statusValue
        });
    } catch (err: any) {
        console.error('API B2B quote error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
