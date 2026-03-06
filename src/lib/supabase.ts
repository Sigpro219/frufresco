import { createClient } from '@supabase/supabase-js'

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');

const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = sanitize(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const isUrlValid = supabaseUrl.startsWith('http');

if (!isUrlValid) {
    console.warn('⚠️ Supabase URL is missing or invalid. Check your Environment Variables in Vercel.');
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
                signInWithPassword: () => Promise.resolve({ data: { user: null }, error: { message: 'Supabase not configured' } })
            };
            if (prop === 'storage') return { from: () => stub };
            return stub;
        },
        apply: () => stub
    });

    return stub;
};

export const supabase = createSafeClient();

export interface Product {
    id: string;
    sku: string;
    name: string;
    description: string;
    base_price: number;
    unit_of_measure: string;
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
}
