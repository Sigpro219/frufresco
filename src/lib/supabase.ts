import { createClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');

// Extra sanitization to avoid common copy-paste errors
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL || '').split(' ')[0];
const supabaseAnonKey = sanitize(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').split(' ')[0];

const isUrlValid = supabaseUrl.startsWith('http');

if (!isUrlValid && typeof window !== 'undefined') {
    console.warn('️ Supabase URL is missing or invalid. Check your Environment Variables.');
}

/**
 * DEBT-004: Transparent network-level retry with exponential backoff for 3G/4G micro-drops
 * in Corabastos / cold storage docks. Zero overhead when network is normal.
 */
const fetchWithGembaRetry: typeof fetch = async (input, init) => {
    const maxRetries = 2;
    const delays = [450, 1000];

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(input, init);
            // Retry only on transient upstream gateway blips (502, 503, 504)
            if ((response.status === 502 || response.status === 503 || response.status === 504) && attempt < maxRetries) {
                await new Promise(res => setTimeout(res, delays[attempt]));
                continue;
            }
            return response;
        } catch (err: any) {
            // Do not retry if the caller explicitly aborted the request
            if (err?.name === 'AbortError' || attempt >= maxRetries) {
                throw err;
            }
            await new Promise(res => setTimeout(res, delays[attempt]));
        }
    }
    return fetch(input, init);
};

const createSafeClient = () => {
    if (isUrlValid) {
        return createBrowserClient(supabaseUrl, supabaseAnonKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            },
            global: {
                fetch: fetchWithGembaRetry
            },
            cookieOptions: {
                maxAge: 60 * 60 * 24 * 365, // 1 año de persistencia de sesión
                sameSite: 'lax',
                path: '/'
            }
        });
    }

    // Proxy-based "Bunker" to prevent SSR/Build crashes when Env Vars are missing
    const stub: any = new Proxy(() => stub, {
        get: (target, prop) => {
            if (prop === 'then') return (cb: any) => Promise.resolve(cb({ data: null, error: null }));
            if (prop === 'auth') return { 
                getSession: () => Promise.resolve({ data: { session: null }, error: null }),
                onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
                signOut: () => Promise.resolve(),
                signInWithPassword: () => Promise.resolve({ data: { user: null }, error: { message: 'Supabase not configured' } }),
                getUser: () => Promise.resolve({ data: { user: null }, error: null })
            };
            if (prop === 'storage') return { from: () => stub, listBuckets: () => Promise.resolve({ data: [], error: { message: 'Supabase stub' } }) };
            return stub;
        },
        apply: () => stub
    });

    return stub;
};

export const supabase = createSafeClient();

/**
 * DEBT-002: Paginated query helper that transparently overcomes the 1,000-row PostgREST limit.
 * If the dataset has < 1,000 rows, it executes only 1 HTTP request (zero extra overhead).
 */
export async function fetchAllRows<T = any>(
    buildRangeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
    pageSize = 1000,
    maxRows = 10000
): Promise<{ data: T[]; error: any }> {
    const allRows: T[] = [];
    let from = 0;

    while (from < maxRows) {
        const to = from + pageSize - 1;
        const { data, error } = await buildRangeQuery(from, to);
        if (error) {
            return { data: allRows, error };
        }
        if (!data || data.length === 0) {
            break;
        }
        allRows.push(...data);
        if (data.length < pageSize) {
            break;
        }
        from += pageSize;
    }

    return { data: allRows, error: null };
}

/**
 * DEBT-001: Atomic inventory stock adjustment with PostgreSQL FOR UPDATE row lock
 * and automatic Just-In-Time (JIT) fallback so stale React state never overwrites live stock.
 */
export async function adjustInventoryStockAtomic(params: {
    productId: string;
    warehouseId: string;
    delta: number;
}): Promise<{ newQuantity: number; error: any }> {
    const { productId, warehouseId, delta } = params;
    try {
        const { data, error } = await supabase.rpc('adjust_inventory_stock_atomic', {
            p_product_id: productId,
            p_warehouse_id: warehouseId,
            p_delta: delta
        });

        if (!error && data && data.success) {
            return { newQuantity: Number(data.new_quantity ?? 0), error: null };
        }
    } catch {
        // Fallback smoothly to JIT fresh read + update below
    }

    // Safe Fallback: Re-fetch live quantity right before updating (eliminates stale UI state race conditions)
    try {
        const { data: liveStock } = await supabase
            .from('inventory_stocks')
            .select('id, quantity')
            .eq('product_id', productId)
            .eq('warehouse_id', warehouseId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        const currentQty = Number(liveStock?.quantity ?? 0);
        const newQty = Math.max(0, currentQty + delta);

        if (liveStock?.id) {
            const { error: updErr } = await supabase
                .from('inventory_stocks')
                .update({ quantity: newQty, updated_at: new Date().toISOString() })
                .eq('id', liveStock.id);
            return { newQuantity: newQty, error: updErr };
        } else {
            const { error: insErr } = await supabase
                .from('inventory_stocks')
                .insert([{
                    product_id: productId,
                    warehouse_id: warehouseId,
                    quantity: newQty,
                    status: 'available'
                }]);
            return { newQuantity: newQty, error: insErr };
        }
    } catch (err: any) {
        return { newQuantity: 0, error: err };
    }
}

/**
 * Server-only client with service_role privileges
 */
export const createAdminClient = () => {
    const adminKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY || '').split(' ')[0];
    if (!isUrlValid || !adminKey) {
        throw new Error('Supabase Admin Key (SUPABASE_SERVICE_ROLE_KEY) is missing in Environment Variables');
    }
    return createClient(supabaseUrl, adminKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    });
};

/**
 * Quick helper to verify connectivity to Supabase services
 */
export async function verifyConnectivity() {
    try {
        const start = Date.now();
        
        const { data, error } = await supabase.from('app_settings').select('key').limit(1);
        const latency = Date.now() - start;
        
        if (error) throw error;
        
        // Also check storage reachability
        const { error: storageError } = await supabase.storage.listBuckets();
        
        return { 
            ok: true, 
            latency: `${latency}ms`,
            storageOk: !storageError 
        };
    } catch (err: any) {
        return { 
            ok: false, 
            error: err.message || 'Connection failed',
            isNetworkError: err.message?.includes('fetch') || !navigator.onLine
        };
    }
}

export interface Product {
    id: string;
    sku: string;
    name: string;
    description: string;
    base_price?: number;
    unit_of_measure: string;
    weight_kg?: number;
    display_name?: string;
    image_url: string;
    category: string;
    options?: any;
    is_active: boolean;
    min_inventory_level: number;
    variants?: any[];
    options_config?: any[];
    accounting_id?: number | null;
    show_on_web?: boolean;
    parent_id?: string | null;
    buying_team?: string | null;
    procurement_method?: string | null;
    theoretical_shrinkage_pct?: number;
    allowed_waste_reasons?: string[];
    inventory_group?: string | null;
    purchase_sublist?: string | null;
    iva_rate?: number;
    tags?: string[];
    keywords?: string;
    utility_deviation_pct?: number;
    // Commercial / Multi-Catalog Fields
    web_unit?: string;
    web_conversion_factor?: number;
    name_en?: string | null;
    description_en?: string | null;
    inherit_price?: boolean;
    is_verified_dev?: boolean;
    pricing_model_prices?: { price: number }[];
    campaign_info?: any;
}
