import { createClient } from '@supabase/supabase-js'

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');

// Extra sanitization to avoid common copy-paste errors
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL || '').split(' ')[0];
const supabaseAnonKey = sanitize(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').split(' ')[0];

const isUrlValid = supabaseUrl.startsWith('http');

if (!isUrlValid && typeof window !== 'undefined') {
    console.warn('⚠️ Supabase URL is missing or invalid. Check your Environment Variables.');
}

const createSafeClient = () => {
    if (isUrlValid) {
        return createClient(supabaseUrl, supabaseAnonKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
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
 * Server-only client with service_role privileges
 */
export const createAdminClient = () => {
    const adminKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY || '').split(' ')[0];
    if (!isUrlValid || !adminKey) {
        throw new Error('Supabase Admin Key is missing');
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
    base_price: number;
    unit_of_measure: string;
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
    iva_rate?: number;
    tags?: string[];
    keywords?: string;
    utility_deviation_pct?: number;
    // Commercial / Multi-Catalog Fields
    web_unit?: string;
    web_conversion_factor?: number;
    name_en?: string | null;
    description_en?: string | null;
}
 
