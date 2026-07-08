import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export interface AuthResult {
  authorized: boolean;
  user?: any;
  error?: string;
}

/**
 * Checks if the request contains a valid Supabase authentication session and (optional) role
 */
export async function verifySessionAndRole(request: Request, allowedRoles?: string[]): Promise<AuthResult> {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (token) {
    // If Bearer token is provided (e.g., from an external API caller)
    return await checkTokenDirectly(token, allowedRoles);
  }

  // Fallback to Next.js cookies (standard browser sessions)
  try {
    const cookieStore = await cookies();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return { authorized: false, error: 'Supabase configuration missing in environment' };
    }

    const supabaseServer = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    });

    const { data: { user }, error } = await supabaseServer.auth.getUser();

    if (error || !user) {
      return { authorized: false, error: error?.message || 'Invalid or expired session cookie' };
    }

    return await checkUserRole(user, allowedRoles);
  } catch (err: any) {
    return { authorized: false, error: `Authentication check exception: ${err.message}` };
  }
}

async function checkTokenDirectly(token: string, allowedRoles?: string[]): Promise<AuthResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return { authorized: false, error: 'Supabase configuration missing in environment' };
  }

  const supabase = createClient(url, anonKey);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { authorized: false, error: error?.message || 'Invalid authentication token' };
  }

  return await checkUserRole(user, allowedRoles);
}

async function checkUserRole(user: any, allowedRoles?: string[]): Promise<AuthResult> {
  if (!allowedRoles || allowedRoles.length === 0) {
    return { authorized: true, user };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !adminKey) {
    return { authorized: false, error: 'Admin configuration missing in environment' };
  }

  const adminClient = createClient(url, adminKey);
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return { authorized: false, error: 'User profile not found or read error' };
  }

  if (!allowedRoles.includes(profile.role)) {
    return { authorized: false, error: `Role '${profile.role}' is not authorized for this operation` };
  }

  return { authorized: true, user };
}
