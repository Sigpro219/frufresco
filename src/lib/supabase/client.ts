import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createClient() {
    const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
    const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const supabaseAnonKey = sanitize(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

    if (!supabaseUrl.startsWith('http')) {
        console.warn('⚠️ Supabase URL is missing or invalid in createClient factory');
        return null as any;
    }

    return createSupabaseClient(
        supabaseUrl,
        supabaseAnonKey,
        {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
            }
        }
    )
}
