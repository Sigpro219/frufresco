import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY);

// Helper to check authentication / token
function isAuthorized(request: Request) {
    const { searchParams } = new URL(request.url);
    const queryToken = searchParams.get('token');
    
    // Check Authorization header
    const authHeader = request.headers.get('Authorization');
    const headerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    
    const token = queryToken || headerToken;
    if (!token) return false;
    
    // We allow if it matches the service role key or a custom CRON_SECRET if defined
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && token === cronSecret) return true;
    if (token === supabaseServiceKey) return true;
    
    // Fallback comparison to anon key for development/convenience if no secret is defined
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!cronSecret && token === anonKey) return true;

    return false;
}

async function handleSync(request: Request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        let modelId: string | null = null;
        
        // Parse parameter from request (body or query)
        const { searchParams } = new URL(request.url);
        const queryModelId = searchParams.get('model_id');
        
        if (queryModelId) {
            modelId = queryModelId;
        } else if (request.method === 'POST') {
            try {
                const body = await request.json();
                if (body && body.model_id) modelId = body.model_id;
            } catch (e) {
                // Ignore empty or invalid JSON bodies
            }
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 1. Get Pricing Models to synchronize
        let modelsToSync: any[] = [];
        if (modelId) {
            const { data } = await supabase
                .from('pricing_models')
                .select('*')
                .eq('id', modelId)
                .single();
            if (data) modelsToSync = [data];
        } else {
            const { data } = await supabase
                .from('pricing_models')
                .select('*')
                .eq('b2c_autosync_enabled', true);
            modelsToSync = data || [];
            
            // Fallback to Clientes B2C if nothing is enabled for autosync
            if (modelsToSync.length === 0) {
                const { data: b2cModel } = await supabase
                    .from('pricing_models')
                    .select('*')
                    .eq('name', 'Clientes B2C')
                    .single();
                if (b2cModel) modelsToSync = [b2cModel];
            }
        }

        if (modelsToSync.length === 0) {
            return NextResponse.json({ error: 'Pricing model not found' }, { status: 404 });
        }

        const syncResults: any[] = [];

        for (const model of modelsToSync) {
            console.log(`🚀 Starting pricing sync for model: ${model.name} (${model.id})`);
            const isB2C = model.name === 'Clientes B2C';

            // If called automatically (no model_id query parameter), check the autosync_days schedule
            const queryModelId = searchParams.get('model_id');
            if (!queryModelId) {
                // Determine current day of the week in Bogota timezone (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
                const bogotaDateStr = new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' });
                const bogotaDay = new Date(bogotaDateStr).getDay();
                
                const daysToSync = model.autosync_days || [0, 1, 2, 3, 4, 5, 6];
                if (!daysToSync.includes(bogotaDay)) {
                    console.log(`Skipping sync for model ${model.name} because today (${bogotaDay}) is not in scheduled days (${daysToSync})`);
                    syncResults.push({
                        model_id: model.id,
                        model_name: model.name,
                        products_processed: 0,
                        message: `Scheduled sync skipped. Today is not in scheduled days (${daysToSync.join(',')}).`
                    });
                    continue;
                }
            }

            // 2. Fetch Active Products (conditionally filter by show_on_web only for B2C) (loop to bypass PostgREST 1000 limit)
            let allProducts: any[] = [];
            let routePageNum = 0;
            const ROUTE_PAGE_SIZE = 1000;
            let routeFinished = false;

            while (!routeFinished) {
                let productsQuery = supabase
                    .from('products')
                    .select('id, name, sku, iva_rate, category, parent_id, utility_deviation_pct, unit_of_measure, base_price')
                    .eq('is_active', true)
                    .range(routePageNum * ROUTE_PAGE_SIZE, (routePageNum + 1) * ROUTE_PAGE_SIZE - 1);
                
                if (isB2C) {
                    productsQuery = productsQuery.eq('show_on_web', true);
                }
                
                const { data: batchProducts, error: pError } = await productsQuery;
                if (pError) throw pError;

                if (batchProducts && batchProducts.length > 0) {
                    allProducts = [...allProducts, ...batchProducts];
                    if (batchProducts.length < ROUTE_PAGE_SIZE) {
                        routeFinished = true;
                    } else {
                        routePageNum++;
                    }
                } else {
                    routeFinished = true;
                }
            }
            
            if (!allProducts || allProducts.length === 0) {
                syncResults.push({
                    model_id: model.id,
                    model_name: model.name,
                    products_processed: 0,
                    message: 'No active products found to synchronize.'
                });
                continue;
            }

            // 3. Fetch Overrides
            const { data: overrides } = await supabase
                .from('commercial_overrides')
                .select('product_id, manual_cost, expires_at');
            
            const overridesMap: Record<string, number> = {};
            const now = new Date();
            overrides?.forEach(o => {
                if (!o.expires_at || new Date(o.expires_at) > now) {
                    overridesMap[o.product_id] = o.manual_cost;
                }
            });

            // 4. Fetch Pricing Rules for the current model
            const { data: rules } = await supabase
                .from('pricing_rules')
                .select('product_id, margin_adjustment')
                .eq('model_id', model.id);
            
            const rulesMap: Record<string, number> = {};
            rules?.forEach(r => {
                rulesMap[r.product_id] = r.margin_adjustment;
            });

            // 5. Fetch Conversions
            const { data: convData } = await supabase
                .from('product_conversions')
                .select('*');
            const conversions = convData || [];

            // 6. Fetch Latest Purchases
            const { data: purchases } = await supabase
                .from('purchases')
                .select('product_id, unit_price, purchase_unit, created_at')
                .order('created_at', { ascending: false });

            const purchasesMap: Record<string, { price: number, unit: string }> = {};
            purchases?.forEach(p => {
                if (!purchasesMap[p.product_id]) {
                    purchasesMap[p.product_id] = { price: p.unit_price, unit: p.purchase_unit };
                }
            });

            // 7. Calculate new prices
            const updates: { id: string, base_price: number }[] = [];
            allProducts.forEach(prod => {
                // Priority 1: Commercial Override cost
                const overrideCost = overridesMap[prod.id];
                
                // Priority 2: Latest purchase (fallback to parent product if exist)
                const purchaseInfo = purchasesMap[prod.id] || (prod.parent_id ? purchasesMap[prod.parent_id] : null);
                
                let baseCost = 0;
                if (overrideCost !== undefined) {
                    baseCost = overrideCost;
                } else if (purchaseInfo) {
                    let realCost = purchaseInfo.price;
                    
                    // Unit Conversion Logic
                    if (purchaseInfo.unit && purchaseInfo.unit !== prod.unit_of_measure) {
                        const convAB = conversions.find(c => 
                            c.product_id === prod.id && 
                            c.from_unit === purchaseInfo.unit && 
                            c.to_unit === prod.unit_of_measure
                        );
                        
                        if (convAB && convAB.conversion_factor) {
                            realCost = purchaseInfo.price / convAB.conversion_factor;
                        } else {
                            const convBA = conversions.find(c => 
                                c.product_id === prod.id && 
                                c.from_unit === prod.unit_of_measure && 
                                c.to_unit === purchaseInfo.unit
                            );
                            if (convBA && convBA.conversion_factor) {
                                realCost = purchaseInfo.price * convBA.conversion_factor;
                            }
                        }
                    }
                    baseCost = realCost;
                }
                
                // Priority 3: Fallback to existing base price if no override/purchase is found
                if (baseCost === 0) {
                    baseCost = prod.base_price || 0;
                }

                if (baseCost === 0) return; // Skip if no cost found

                const baseMargin = model.base_margin_percent;
                const adjustment = rulesMap[prod.id] || 0;
                const utilityDeviation = prod.utility_deviation_pct || 0;
                
                const finalMargin = (baseMargin + adjustment + utilityDeviation) / 100;
                
                // Formula: Costo * (1 + Margen) * (1 + IVA)
                const priceBeforeTax = baseCost * (1 + finalMargin);
                const ivaRate = (prod.iva_rate || 0) / 100;
                const priceWithTax = priceBeforeTax * (1 + ivaRate);
                
                // Round to next multiple of 50
                const roundedPrice = Math.ceil(priceWithTax / 50) * 50;
                
                updates.push({
                    id: prod.id,
                    base_price: roundedPrice
                });
            });

            console.log(`📊 Calculated prices for ${updates.length} products in model ${model.name}`);

            // 8. Update base_price in products table if this is the B2C model (main web store)
            if (isB2C && updates.length > 0) {
                console.log(`💾 Writing ${updates.length} prices to products.base_price...`);
                const BATCH_SIZE = 50;
                for (let i = 0; i < updates.length; i += BATCH_SIZE) {
                    const batch = updates.slice(i, i + BATCH_SIZE);
                    // Perform upsert/update in chunks
                    const { error } = await supabase.from('products').upsert(batch);
                    if (error) {
                        console.error("Batch update error:", error);
                        throw error;
                    }
                }
            }

            // 9. Recalculate and update cache in pricing_model_prices
            console.log(`🔄 Triggering db recalculation RPC for model ${model.name}`);
            const { error: rpcError } = await supabase.rpc('recalculate_model_prices', {
                p_model_id: model.id
            });
            
            if (rpcError) {
                console.error("RPC Recalculation Error:", rpcError);
                throw rpcError;
            }

            // 10. Update last_b2c_sync_at for this model
            await supabase
                .from('pricing_models')
                .update({ last_b2c_sync_at: new Date().toISOString() })
                .eq('id', model.id);

            syncResults.push({
                model_id: model.id,
                model_name: model.name,
                products_processed: updates.length,
                prices_published_to_web: isB2C
            });
        }

        return NextResponse.json({
            success: true,
            message: `Sincronización completada con éxito.`,
            sync_results: syncResults
        });

    } catch (err: any) {
        console.error('❌ Sync API Error:', err);
        return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    return handleSync(request);
}

export async function GET(request: Request) {
    return handleSync(request);
}
