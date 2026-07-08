import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export interface AuthResult {
  authorized: boolean;
  user?: any;
  error?: string;
}

/**
 * Checks if the request contains a valid Supabase authentication session and required permission.
 * Respects explicit allows (+), denies (-), and fallback to role-based system permissions.
 */
export async function verifySessionAndPermission(request: Request, requiredPermission: string): Promise<AuthResult> {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (token) {
    // If Bearer token is provided (external API caller)
    return await checkPermissionDirectly(token, requiredPermission);
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

    return await checkUserPermissionBackend(user, requiredPermission);
  } catch (err: any) {
    return { authorized: false, error: `Permission check exception: ${err.message}` };
  }
}

/**
 * Legacy role check compatibility helper.
 */
export async function verifySessionAndRole(request: Request, allowedRoles?: string[]): Promise<AuthResult> {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (token) {
    return await checkTokenDirectly(token, allowedRoles);
  }

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

async function checkPermissionDirectly(token: string, requiredPermission: string): Promise<AuthResult> {
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

  return await checkUserPermissionBackend(user, requiredPermission);
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

async function checkUserPermissionBackend(user: any, requiredPermission: string): Promise<AuthResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !adminKey) {
    return { authorized: false, error: 'Admin configuration missing in environment' };
  }

  const adminClient = createClient(url, adminKey);

  // 1. Fetch user profile
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('role, custom_permissions')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return { authorized: false, error: 'User profile not found or read error' };
  }

  // 2. Super admins have full bypass
  if (profile.role === 'admin' || profile.role === 'sys_admin') {
    return { authorized: true, user };
  }

  const userPerms: string[] = profile.custom_permissions || [];

  // Helper matching function
  const matches = (rule: string, target: string): boolean => {
    const cleanRule = rule.replace(/^[-+]/, '');
    if (cleanRule === '*' || cleanRule === target) return true;
    if (cleanRule.endsWith('*') && target.startsWith(cleanRule.slice(0, -1))) return true;
    if (target.startsWith(cleanRule + '.') || target.startsWith(cleanRule + ':')) return true;
    return false;
  };

  // 3. Check explicit denies first (prefixed with '-')
  const hasDeny = userPerms.some(p => p.startsWith('-') && matches(p, requiredPermission));
  if (hasDeny) {
    return { authorized: false, error: `Access to '${requiredPermission}' is explicitly denied` };
  }

  // 4. Check explicit allows (prefixed with '+' or no prefix)
  const hasAllow = userPerms.some(p => !p.startsWith('-') && matches(p, requiredPermission));
  if (hasAllow) {
    return { authorized: true, user };
  }

  // 5. Fallback to Role base configuration from app_settings
  const { data: settingData } = await adminClient
    .from('app_settings')
    .select('value')
    .eq('key', 'system_roles')
    .maybeSingle();

  if (settingData?.value) {
    try {
      const roles = JSON.parse(settingData.value);
      const userRole = roles.find((r: any) => r.value === profile.role);
      if (userRole) {
        const rolePerms: string[] = userRole.permissions || [];
        const hasRoleAllow = rolePerms.some(p => matches(p, requiredPermission));
        if (hasRoleAllow) {
          return { authorized: true, user };
        }
      }
    } catch (e) {
      console.error('Error parsing system_roles settings:', e);
    }
  }

  return { authorized: false, error: `Access denied: missing permission '${requiredPermission}'` };
}
