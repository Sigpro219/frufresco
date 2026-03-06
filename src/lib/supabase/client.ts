import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createClient() {
    const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
    const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const supabaseAnonKey = sanitize(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

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
