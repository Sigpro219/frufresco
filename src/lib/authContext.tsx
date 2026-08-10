'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from './supabase';
import { logError } from './errorUtils';
import { User, AuthError, AuthChangeEvent, Session } from '@supabase/supabase-js';

interface Profile {
    id: string;
    role: string; // Made flexible to support new organizational roles
    contact_name?: string;
    company_name?: string;
    price_list_id?: string;
    pricing_model_id?: string;
    address_main?: string;
    specialty?: string;
    needs_crates?: boolean;
    document_type?: string;
    remission_with_prices?: boolean;
    needs_password_change?: boolean;
    parent_id?: string;
    custom_permissions?: string[];
}

interface AuthContextType {
    user: User | null;
    profile: Profile | null;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export async function logAuthEvent(action: 'LOGIN' | 'LOGOUT', userEmail?: string, userId?: string, profileName?: string) {
    try {
        const details: Record<string, any> = {};
        if (userEmail) details.email = userEmail;
        
        const { error: rpcError } = await supabase.rpc('log_user_auth_event', {
            p_action: action,
            p_details: details
        });

        if (rpcError) {
            console.warn('⚠️ Error al registrar evento de auditoría vía RPC:', rpcError.message);
        }
    } catch (err) {
        console.warn('⚠️ No se pudo registrar la auditoría de autenticación:', err);
    }
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);

    // Fetch profile when user changes
    const fetchProfile = async (userId: string, signal?: AbortSignal) => {
        if (!userId) return;
        
        // Prevent redundant fetches if we already have the profile for this user
        if (profile && profile.id === userId) {
            return;
        }
        
        // Network pre-check
        if (typeof window !== 'undefined' && !navigator.onLine) {
            console.warn('⚠️ Se intentó cargar perfil pero el navegador está OFFLINE. Esperando reconexión...');
            return;
        }

        console.log('🔄 Cargando perfil para:', userId);
        let query = supabase
            .from('profiles')
            .select('*, parent:parent_id(pricing_model_id)')
            .eq('id', userId);
            
        if (signal) query = query.abortSignal(signal);

        try {
            const { data, error } = await query.maybeSingle();

            if (error) {
                // Network failure vs. Database error check
                const isNetworkError = error.message?.toLowerCase().includes('fetch');
                
                if (isNetworkError) {
                    console.error('🚨 Falla de Red Crítica detectada (Failed to fetch). Iniciando diagnóstico profundo...');
                    
                    // Import inside function to avoid circular deps if they exist
                    import('./supabase').then(({ verifyConnectivity }) => {
                        verifyConnectivity().then(res => {
                            if (!res.ok) {
                                console.error('🚫 Diagnóstico de Conectividad:', res.error);
                                if (res.isNetworkError) console.info('💡 Sugerencia: Revisa tu VPN, Firewall o AdBlockers. El dominio de Supabase parece inalcanzable.');
                            } else {
                                console.log('📡 Diagnostico OK. Latencia:', res.latency);
                            }
                        });
                    });
                } else {
                    console.error('❌ Error de Base de Datos al cargar perfil:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
                }
                
                logError('authContext fetchProfile', error);
            } else if (data) {
                if (signal?.aborted) return;
                if (data.is_active === false) {
                    console.warn('🔒 El perfil de usuario está INACTIVO. Cerrando sesión...');
                    setProfile(null);
                    setUser(null);
                    await supabase.auth.signOut();
                    if (typeof window !== 'undefined') {
                        localStorage.clear();
                        window.location.href = '/login?error=deactivated';
                    }
                    return;
                }
                console.log('✅ Perfil cargado:', data.role);
                const profileData = {
                    ...data,
                    pricing_model_id: data.parent_id ? data.parent?.pricing_model_id : data.pricing_model_id
                };
                try {
                    localStorage.setItem(`frufresco_cached_profile_${userId}`, JSON.stringify(profileData));
                } catch (e) {}
                setProfile(profileData as Profile);
            } else {
                console.warn('⚠️ Perfil no encontrado en la tabla profiles.');
            }
        } catch (err) {
            console.error('❌ Excepción crítica en fetchProfile:', err);
            logError('authContext fetchProfile exception', err);
        }
    };

    useEffect(() => {
        let isMounted = true;

        const initAuth = async () => {
            try {
                const { data: { session }, error: sessionError } = await supabase.auth.getSession();
                
                if (sessionError) {
                    console.error('❌ Sesión corrupta detectada:', sessionError.message);
                    await supabase.auth.signOut();
                    localStorage.clear();
                    window.location.href = '/login?error=reset';
                    return;
                }

                if (isMounted) {
                    const currentUser = session?.user ?? null;
                    setUser(currentUser);
                    if (currentUser) {
                        // Instant hydration from local storage to prevent 0ms flicker evictions
                        try {
                            const cached = localStorage.getItem(`frufresco_cached_profile_${currentUser.id}`);
                            if (cached) {
                                setProfile(JSON.parse(cached));
                            }
                        } catch (e) {}
                        await fetchProfile(currentUser.id);
                    } else {
                        setProfile(null);
                    }
                    setLoading(false);
                }

                const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
                    if (!isMounted) return;
                    
                    const newUser = session?.user ?? null;
                    if (newUser) {
                        setUser(newUser);
                        fetchProfile(newUser.id);
                        setLoading(false);
                    } else if (event === 'SIGNED_OUT') {
                        // Confirmed sign out action
                        setUser(null);
                        setProfile(null);
                        setLoading(false);
                    } else {
                        // Transient session refresh event: verify with getSession before evicting
                        const { data: checkData } = await supabase.auth.getSession();
                        if (isMounted) {
                            if (checkData.session?.user) {
                                setUser(checkData.session.user);
                                fetchProfile(checkData.session.user.id);
                            } else {
                                setUser(null);
                                setProfile(null);
                            }
                            setLoading(false);
                        }
                    }
                });
                return subscription;
            } catch (err) {
                console.error('❌ Error crítico auth:', err);
                setLoading(false);
            }
        };

        const authSubPromise = initAuth();

        return () => {
            isMounted = false;
            authSubPromise.then(sub => sub?.unsubscribe()).catch(() => {});
        };
    }, []);

    const signIn = async (email: string, password: string) => {
        console.log('🗝️ Iniciando sign-in para:', email);
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            console.warn('⚠️ Error en supabase.auth.signIn:', error.message);
        } else {
            console.log('✅ Sign-in de Supabase completado con éxito');
            const loggedUser = data?.user;
            logAuthEvent('LOGIN', email, loggedUser?.id);
        }
        return { error };
    };

    const signOut = async () => {
        const currentEmail = user?.email;
        const currentId = user?.id;
        const currentName = profile?.contact_name || profile?.company_name;
        await logAuthEvent('LOGOUT', currentEmail, currentId, currentName);
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
    };

    return (
        <AuthContext.Provider value={{ user, profile, loading, signIn, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export function checkUserPermission(
    profile: Profile | null, 
    requiredPerm: string, 
    rolesConfig?: { value: string; permissions?: string[] }[]
): boolean {
    if (!profile) return false;
    
    // Super admins always have full access
    if (profile.role === 'admin' || profile.role === 'sys_admin') return true;

    const userPerms = profile.custom_permissions || [];

    const matches = (rule: string, target: string): boolean => {
        const cleanRule = rule.replace(/^[-+]/, '');
        if (cleanRule === '*' || cleanRule === target) return true;
        if (cleanRule.endsWith('*') && target.startsWith(cleanRule.slice(0, -1))) return true;
        if (target.startsWith(cleanRule + '.') || target.startsWith(cleanRule + ':')) return true;
        if (cleanRule.startsWith(target + '.') || cleanRule.startsWith(target + ':')) return true;
        if ((cleanRule === 'admin.commercial.clients' || cleanRule.startsWith('admin.commercial.clients.')) && target.startsWith('admin.clients')) return true;
        if ((cleanRule === 'admin.clients' || cleanRule.startsWith('admin.clients.')) && target.startsWith('admin.commercial.clients')) return true;
        return false;
    };

    // 1. Check explicit denies first (prefix '-')
    const hasDeny = userPerms.some(p => p.startsWith('-') && matches(p, requiredPerm));
    if (hasDeny) return false;

    // 2. Check custom profile-level explicit allows (prefix '+' or no prefix)
    const hasAllow = userPerms.some(p => {
        const cleanP = p.replace(/^\+/, '');
        if (matches(cleanP, requiredPerm)) return true;
        // Child-to-parent check: e.g. if user has 'com.billing', they can see parent 'com'
        if (cleanP.startsWith(requiredPerm + '.') || cleanP.startsWith(requiredPerm + ':')) return true;
        return false;
    });
    if (hasAllow) return true;

    // 3. Fallback to role-level base permissions
    if (rolesConfig && rolesConfig.length > 0) {
        const userRole = rolesConfig.find(r => r.value === profile.role);
        if (userRole) {
            const rolePerms = userRole.permissions || [];
            const hasRoleAllow = rolePerms.some(p => {
                if (matches(p, requiredPerm)) return true;
                if (p.startsWith(requiredPerm + '.') || p.startsWith(requiredPerm + ':')) return true;
                return false;
            });
            if (hasRoleAllow) return true;
        }
    }

    return false;
}
