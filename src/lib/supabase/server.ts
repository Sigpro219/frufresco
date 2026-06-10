import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createServerSideClient() {
    const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
    const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL || '').split(' ')[0];
    const supabaseAnonKey = sanitize(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').split(' ')[0];

    if (!supabaseUrl.startsWith('http')) {
        // Return a proxy stub if not configured
        const stub: any = new Proxy(() => stub, {
            get: (target, prop) => {
                if (prop === 'then') return (cb: any) => Promise.resolve(cb({ data: null, error: null }));
                if (prop === 'auth') return { 
                    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
                    getUser: () => Promise.resolve({ data: { user: null }, error: null })
                };
                if (prop === 'from') return () => stub;
                return stub;
            },
            apply: () => stub
        });
        return stub;
    }

    const cookieStore = await cookies();

    return createServerClient(
        supabaseUrl,
        supabaseAnonKey,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // Ignore header modification errors in server components
                    }
                },
            },
        }
    )
}
