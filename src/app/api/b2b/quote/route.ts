import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const ALL_CATEGORIES = [
  'Frutas',
  'Verduras',
  'Hortalizas',
  'Tubérculos',
  'Despensa',
  'Lácteos',
  'Congelados',
  'Procesados'
];

const CATEGORY_TO_CODES: Record<string, string[]> = {
  'Frutas': ['FR', 'Frutas', 'frutas'],
  'Verduras': ['VE', 'Verduras', 'verduras'],
  'Hortalizas': ['HO', 'Hortalizas', 'hortalizas'],
  'Tubérculos': ['TU', 'Tubérculos', 'tuberculos'],
  'Despensa': ['DE', 'Despensa', 'despensa'],
  'Lácteos': ['LA', 'Lácteos', 'lacteos'],
  'Congelados': ['CO', 'Congelados', 'congelados'],
  'Procesados': ['PR', 'Procesados', 'procesados']
};

const ANCHOR_PRIORITY: Record<string, string[]> = {
  'Frutas': [
    'aguacate hass', 'aguacate', 'banano', 'naranja valencia', 'naranja', 'papaya maradol', 'papaya',
    'piña gold', 'piña', 'limon tahiti', 'limon', 'fresa', 'mango tommy', 'mango',
    'maracuya', 'maracuyá', 'lulo', 'mora', 'melon', 'melón', 'patilla', 'sandia',
    'manzana', 'guanabana', 'guanábana', 'mandarina', 'guayaba', 'uva', 'durazno', 'pera'
  ],
  'Verduras': [
    'tomate chonto', 'tomate milano', 'tomate', 'cebolla cabezona blanca', 'cebolla cabezona roja',
    'cebolla junca', 'cebolla puerro', 'cebolla', 'zanahoria', 'pimenton rojo', 'pimenton',
    'lechuga batavia', 'lechuga crespa', 'lechuga', 'cilantro', 'pepino cohombro', 'pepino',
    'arveja', 'habichuela', 'brocoli', 'brócoli', 'coliflor', 'champiñon', 'champiñón',
    'espinaca', 'apio', 'calabacin', 'calabacín', 'perejil', 'ajo', 'remolacha', 'ahuyama'
  ],
  'Hortalizas': [
    'tomate chonto', 'tomate', 'cebolla cabezona', 'cebolla junca', 'cebolla', 'zanahoria',
    'pimenton', 'lechuga batavia', 'lechuga', 'cilantro', 'pepino', 'espinaca', 'apio',
    'calabacin', 'brocoli', 'coliflor', 'perejil', 'ajo', 'remolacha', 'ahuyama', 'acelga'
  ],
  'Tubérculos': [
    'papa pastusa', 'papa criolla', 'papa r-12', 'papa sabanera', 'papa capira', 'papa',
    'platano verde', 'platano maduro', 'platano', 'plátano', 'yuca', 'arracacha', 'ñame'
  ],
  'Despensa': [
    'aceite', 'arroz', 'azucar', 'azúcar', 'sal', 'huevo', 'harina', 'promasa', 'pasta', 'grasa', 'vinagre'
  ],
  'Lácteos': [
    'queso campesino', 'queso doble crema', 'queso mozzarella', 'queso', 'leche', 'crema de leche', 'mantequilla', 'yogurt'
  ],
  'Congelados': [
    'pulpa de mora', 'pulpa de lulo', 'pulpa de maracuya', 'pulpa de mango', 'pulpa de fresa', 'pulpa', 'francesa', 'congelad'
  ],
  'Procesados': [
    'pelad', 'picad', 'procesad', 'desgranad'
  ]
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
            const rawChosenCats = (selected_categories && selected_categories.length > 0)
                ? selected_categories
                : ALL_CATEGORIES;

            // Sort chosen categories strictly: 1. Frutas, 2. Verduras, 3. Hortalizas, etc.
            const chosenCats = [...rawChosenCats].sort((a, b) => {
                const idxA = ALL_CATEGORIES.indexOf(a);
                const idxB = ALL_CATEGORIES.indexOf(b);
                const prioA = idxA !== -1 ? idxA : 999;
                const prioB = idxB !== -1 ? idxB : 999;
                return prioA - prioB;
            });

            const categoryCodes = chosenCats.flatMap(c => CATEGORY_TO_CODES[c] || [c]);

            // Determinar límite por categoría según la cantidad de categorías seleccionadas
            const numCats = chosenCats.length;
            const maxPerCat = numCats === 1 ? 25 : numCats <= 3 ? 15 : 8;

            // 1. Fetch template "Catalogo Completo"
            const { data: template } = await supabase
                .from('quote_templates')
                .select('id, name')
                .ilike('name', '%Catalogo Completo%')
                .maybeSingle();

            let templateProducts: any[] = [];
            if (template?.id) {
                const { data: tItems } = await supabase
                    .from('quote_template_items')
                    .select('product_id, products(id, name, base_price, iva_rate, sku, category, unit_of_measure, web_conversion_factor, web_unit, is_active)')
                    .eq('template_id', template.id);

                if (tItems && tItems.length > 0) {
                    templateProducts = tItems
                        .map(ti => ti.products)
                        .filter((p: any) => p && p.is_active !== false);
                }
            }

            // 2. Fetch pricing model prices cache & exact rules
            const { data: modelPrices } = await supabase
                .from('pricing_model_prices')
                .select('product_id, price')
                .eq('model_id', modelId);

            const modelPriceMap = new Map<string, number>();
            if (modelPrices) {
                modelPrices.forEach(mp => {
                    if (Number(mp.price) > 0) modelPriceMap.set(mp.product_id, Number(mp.price));
                });
            }

            const { data: modelRules } = await supabase
                .from('pricing_rules')
                .select('product_id, margin_adjustment')
                .eq('model_id', modelId);

            const modelRulesMap = new Map<string, number>();
            if (modelRules) {
                modelRules.forEach(mr => {
                    modelRulesMap.set(mr.product_id, Number(mr.margin_adjustment));
                });
            }

            // Fetch commercial overrides (latest manual cost)
            const { data: overrides } = await supabase
                .from('commercial_overrides')
                .select('product_id, manual_cost, expires_at');
            const overridesMap = new Map<string, number>();
            const now = new Date();
            overrides?.forEach(o => {
                if (!o.expires_at || new Date(o.expires_at) > now) overridesMap.set(o.product_id, Number(o.manual_cost));
            });

            // Fetch latest purchases cost
            const { data: purchases } = await supabase
                .from('purchases')
                .select('product_id, unit_price, created_at')
                .order('created_at', { ascending: false });
            const purchasesMap = new Map<string, number>();
            purchases?.forEach(p => {
                if (!purchasesMap.has(p.product_id)) purchasesMap.set(p.product_id, Number(p.unit_price));
            });

            // 3. Populate products to quote from Catalogo Completo filtered by chosen categories
            for (const catName of chosenCats) {
                const codes = CATEGORY_TO_CODES[catName] || [catName];
                let catProds = templateProducts.filter(p => codes.includes(p.category));

                // Fallback to active products table if template had no items for this category
                if (catProds.length === 0) {
                    const { data: fallbackProds } = await supabase
                        .from('products')
                        .select('id, name, base_price, iva_rate, sku, category, unit_of_measure, web_conversion_factor, web_unit')
                        .eq('is_active', true)
                        .in('category', codes);
                    if (fallbackProds) catProds = fallbackProds;
                }

                // Sort alphabetically by name
                catProds.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { numeric: true, sensitivity: 'base' }));
                productsToQuote.push(...catProds);
            }

            // Deduplicate products
            const seenIds = new Set<string>();
            productsToQuote = productsToQuote.filter(p => {
                if (seenIds.has(p.id)) return false;
                seenIds.add(p.id);
                return true;
            });

            // Ultimate fallback if empty
            if (productsToQuote.length === 0) {
                const { data: activeProds } = await supabase
                    .from('products')
                    .select('id, name, base_price, iva_rate, sku, category, unit_of_measure, web_conversion_factor, web_unit')
                    .eq('is_active', true)
                    .gt('base_price', 0)
                    .limit(30);
                if (activeProds) productsToQuote = activeProds;
            }

            if (productsToQuote.length > 0) {
                let subtotal = 0;
                let tax = 0;
                let total = 0;
                const itemsToInsert = [];

                for (const p of productsToQuote) {
                    const baseCost = overridesMap.get(p.id) || purchasesMap.get(p.id) || Number(p.base_price) || 0;
                    const defaultModelMargin = colorTag === 'verde' ? 47 : colorTag === 'amarillo' ? 48 : 49;
                    const modelMargin = modelRulesMap.has(p.id) ? modelRulesMap.get(p.id)! : defaultModelMargin;

                    // Regla de Capacidad de Negociación: +3% adicional sobre el margen particular del SKU
                    const quotedMargin = modelMargin + 3;

                    let unitPrice = 0;
                    if (baseCost > 0) {
                        const ivaRate = (Number(p.iva_rate) || 0) / 100;
                        const priceBeforeTax = baseCost * (1 + quotedMargin / 100);
                        const priceWithTax = priceBeforeTax * (1 + ivaRate);
                        unitPrice = Math.ceil(priceWithTax / 50) * 50;
                    } else if (modelPriceMap.has(p.id)) {
                        // Si viene del precio cacheado del modelo, agregamos el 3% de colchón
                        unitPrice = Math.ceil((modelPriceMap.get(p.id)! * 1.03) / 50) * 50;
                    }

                    // Ensure minimum unit price
                    if (unitPrice <= 0) unitPrice = 1000;

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
                        cost_basis: baseCost || p.base_price,
                        margin_percent: quotedMargin,
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
