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
    accounting_id?: number | null;
    show_on_web?: boolean;
    parent_id?: string | null;
    buying_team?: string | null;
    procurement_method?: string | null;
    theoretical_shrinkage_pct?: number;
    allowed_waste_reasons?: string[];
    iva_rate?: number;
}
