import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});

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
}
