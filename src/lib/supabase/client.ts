import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createClient() {
    const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
    const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const supabaseAnonKey = sanitize(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

    if (supabaseUrl.startsWith('http')) {
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

    // Proxy-based "Bunker" to prevent crashes in components that use the factory
    const stub: any = new Proxy(() => stub, {
        get: (target, prop) => {
            if (prop === 'then') return (cb: any) => Promise.resolve(cb({ data: null, error: null }));
            if (prop === 'auth') return { 
                getSession: () => Promise.resolve({ data: { session: null }, error: null }),
                getUser: () => Promise.resolve({ data: { user: null }, error: null }),
                onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
                signOut: () => Promise.resolve(),
                signInWithPassword: () => Promise.resolve({ data: { user: null }, error: { message: 'Supabase not configured' } })
            };
            if (prop === 'from') return () => stub;
            if (prop === 'storage') return { from: () => stub };
            return stub;
        },
        apply: () => stub
    });

    return stub;
}
