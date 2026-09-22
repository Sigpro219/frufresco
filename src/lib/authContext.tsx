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
    email?: string;
    profile_type?: string;
}

interface AuthContextType {
    user: User | null;
    profile: Profile | null;
    availableProfiles: Profile[];
    loading: boolean;
    signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
    signOut: () => Promise<void>;
    switchProfile: (newProfileId: string) => Promise<void>;
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
    const [availableProfiles, setAvailableProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);

    // Fetch profile and multi-profiles when user changes
    const fetchProfile = async (userId: string, signal?: AbortSignal, specificProfileId?: string) => {
        if (!userId) return;
        
        const activeProfileId = specificProfileId || 
            (typeof window !== 'undefined' ? localStorage.getItem('frufresco_active_profile_id') : null) || 
            userId;
        
        // Prevent redundant fetches if we already have the profile for this user and profileId
        if (profile && profile.id === activeProfileId) {
            return;
        }
        
        // Network pre-check
        if (typeof window !== 'undefined' && !navigator.onLine) {
            console.warn('⚠️ Se intentó cargar perfil pero el navegador está OFFLINE. Esperando reconexión...');
            return;
        }

        console.log('🔄 Cargando perfil para ID:', activeProfileId);
        // Timeout de seguridad de 6 segundos si no se provee signal
        const internalController = !signal ? new AbortController() : null;
        const effectiveSignal = signal || internalController?.signal;
        const timeoutId = internalController ? setTimeout(() => internalController.abort(), 6000) : null;

        try {
            // 1. Cargar el perfil activo solicitado
            let query = supabase
                .from('profiles')
                .select('*, parent:parent_id(pricing_model_id)')
                .eq('id', activeProfileId);
                
            if (effectiveSignal) query = query.abortSignal(effectiveSignal);

            const { data, error } = await query.maybeSingle();

            if (error) {
                const isNetworkError = error.message?.toLowerCase().includes('fetch') || error.message?.toLowerCase().includes('abort');
                if (isNetworkError) {
                    console.warn('⚠️ Falla de Red o Timeout en Supabase al cargar perfil. Continuando con sesión local...');
                } else {
                    console.error('❌ Error de Base de Datos al cargar perfil:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
                }
                logError('authContext fetchProfile', error);
            } else if (data) {
                if (effectiveSignal?.aborted) return;
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
                console.log('✅ Perfil activo cargado:', data.role, data.company_name || 'Personal');
                const profileData = {
                    ...data,
                    pricing_model_id: data.parent_id ? data.parent?.pricing_model_id : data.pricing_model_id
                };
                try {
                    localStorage.setItem(`frufresco_cached_profile_${activeProfileId}`, JSON.stringify(profileData));
                    localStorage.setItem('frufresco_active_profile_id', activeProfileId);
                } catch (e) {}
                setProfile(profileData as Profile);

                // 2. Si el perfil tiene email, buscar perfiles hermanos asociados a ese mismo correo
                if (data.email) {
                    const { data: siblings } = await supabase
                        .from('profiles')
                        .select('id, company_name, role, profile_type, custom_permissions, email')
                        .ilike('email', data.email.trim().toLowerCase());
                    if (siblings && siblings.length > 0) {
                        setAvailableProfiles(siblings as Profile[]);
                    }
                }
            } else {
                console.warn('⚠️ Perfil no encontrado en la tabla profiles para ID:', activeProfileId);
                // Si el activeProfileId falló pero no era el userId, intentar con userId
                if (activeProfileId !== userId) {
                    localStorage.removeItem('frufresco_active_profile_id');
                    await fetchProfile(userId, signal, userId);
                }
            }
        } catch (err: any) {
            if (err?.name === 'AbortError' || err?.message?.toLowerCase().includes('abort')) {
                console.warn('⏱️ fetchProfile excedió el tiempo límite (6s). Manteniendo perfil en caché.');
            } else {
                console.error('❌ Excepción crítica en fetchProfile:', err);
                logError('authContext fetchProfile exception', err);
            }
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }
    };

    useEffect(() => {
        let isMounted = true;

        const initAuth = async () => {
            try {
                const { data: { session }, error: sessionError } = await supabase.auth.getSession();
                
                if (sessionError) {
                    const isNetworkErr = sessionError.message?.toLowerCase().includes('fetch') || 
                                         sessionError.message?.toLowerCase().includes('network') ||
                                         (typeof window !== 'undefined' && !navigator.onLine);

                    if (!isNetworkErr) {
                        console.error('❌ Sesión inválida detectada:', sessionError.message);
                        // Solo resetear si es un error fatal de token (no un fallo de red)
                        if (sessionError.message?.includes('invalid_grant') || sessionError.message?.includes('refresh_token_not_found')) {
                            await supabase.auth.signOut();
                            localStorage.clear();
                            window.location.href = '/login?error=reset';
                            return;
                        }
                    } else {
                        console.warn('⚠️ Error de red al iniciar sesión. Manteniendo sesión local offline...');
                    }
                }

                if (isMounted) {
                    const currentUser = session?.user ?? null;
                    setUser(currentUser);
                    if (currentUser) {
                        // Instant hydration from local storage (Stale-While-Revalidate 0ms)
                        let hasCached = false;
                        try {
                            const cached = localStorage.getItem(`frufresco_cached_profile_${currentUser.id}`);
                            if (cached) {
                                const parsed = JSON.parse(cached);
                                if (parsed && parsed.role) {
                                    setProfile(parsed);
                                    hasCached = true;
                                    setLoading(false); // Desbloqueo instantáneo en 0ms
                                }
                            }
                        } catch (e) {}

                        // Revalidar en segundo plano (o esperar si no había caché) con timeout de 6s
                        const profileController = new AbortController();
                        const profileTimeout = setTimeout(() => profileController.abort(), 6000);
                        try {
                            await fetchProfile(currentUser.id, profileController.signal);
                        } finally {
                            clearTimeout(profileTimeout);
                            if (isMounted) {
                                setLoading(false);
                            }
                        }
                    } else {
                        // Intentar recuperar de caché si el navegador está temporalmente offline
                        if (typeof window !== 'undefined' && !navigator.onLine) {
                            console.log('📡 Modo Offline: Preservando estado de autenticación previo');
                        } else {
                            setProfile(null);
                        }
                        setLoading(false);
                    }
                }

                const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
                    if (!isMounted) return;
                    console.log(`🔐 Evento Auth detectado [${event}]:`, session?.user?.email || 'Sin sesión');

                    const newUser = session?.user ?? null;
                    if (newUser) {
                        setUser(newUser);
                        fetchProfile(newUser.id);
                        setLoading(false);
                    } else if (event === 'SIGNED_OUT') {
                        // Confirmed sign out action por el usuario
                        console.log('🚪 Cierre de sesión confirmado (SIGNED_OUT)');
                        setUser(null);
                        setProfile(null);
                        setLoading(false);
                    } else {
                        // Evento transitorio de refresco de token o cambio de pestaña:
                        // NUNCA expulsar inmediatamente. Esperar y verificar con reintentos.
                        if (typeof window !== 'undefined' && !navigator.onLine) {
                            console.warn('⚠️ Navegador Offline durante refresco de auth. Preservando sesión.');
                            setLoading(false);
                            return;
                        }

                        // Espera de 1.5s antes de comprobar para dar tiempo a Supabase a refrescar el JWT
                        setTimeout(async () => {
                            if (!isMounted) return;
                            try {
                                const { data: checkData } = await supabase.auth.getSession();
                                if (isMounted) {
                                    if (checkData.session?.user) {
                                        console.log('🔄 Sesión recuperada tras refresco:', checkData.session.user.email);
                                        setUser(checkData.session.user);
                                        fetchProfile(checkData.session.user.id);
                                    } else {
                                        console.warn('⚠️ Sesión expirada confirmada tras verificación');
                                        setUser(null);
                                        setProfile(null);
                                    }
                                    setLoading(false);
                                }
                            } catch (e) {
                                console.warn('Error en verificación de sesión diferida:', e);
                                setLoading(false);
                            }
                        }, 1500);
                    }
                });

                // Reconexión automática al volver a tener internet
                const handleOnline = async () => {
                    if (!isMounted) return;
                    console.log('🌐 Conexión a internet restaurada. Sincronizando sesión...');
                    const { data: onlineData } = await supabase.auth.getSession();
                    if (onlineData.session?.user) {
                        setUser(onlineData.session.user);
                        fetchProfile(onlineData.session.user.id);
                    }
                };

                window.addEventListener('online', handleOnline);

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

    const switchProfile = async (newProfileId: string) => {
        if (!newProfileId || !user) return;
        setLoading(true);
        try {
            if (typeof window !== 'undefined') {
                localStorage.setItem('frufresco_active_profile_id', newProfileId);
            }
            await fetchProfile(user.id, undefined, newProfileId);
        } catch (e) {
            console.error('Error al cambiar de perfil activo:', e);
        } finally {
            setLoading(false);
        }
    };

    const signOut = async () => {
        const currentEmail = user?.email;
        const currentId = user?.id;
        const currentName = profile?.contact_name || profile?.company_name;
        await logAuthEvent('LOGOUT', currentEmail, currentId, currentName);
        if (typeof window !== 'undefined') {
            localStorage.removeItem('frufresco_active_profile_id');
        }
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
        setAvailableProfiles([]);
    };

    return (
        <AuthContext.Provider value={{ user, profile, availableProfiles, loading, signIn, signOut, switchProfile }}>
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

    // 0. Expiration parser helper
    const isRuleExpired = (rule: string): boolean => {
        const match = rule.match(/(?:#until:|#exp:|@until:|#expires:)([\w\-:.]+)/i);
        if (match && match[1]) {
            const expDate = new Date(match[1]).getTime();
            if (!isNaN(expDate) && Date.now() > expDate) {
                return true;
            }
        }
        return false;
    };

    const cleanRuleString = (rule: string): string => {
        return rule.replace(/(?:#until:|#exp:|@until:|#expires:)[\w\-:.]+/gi, '').replace(/^[-+]/, '');
    };

    const matches = (rule: string, target: string): boolean => {
        if (isRuleExpired(rule)) return false;
        const cleanRule = cleanRuleString(rule);
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
        if (isRuleExpired(p)) return false;
        const cleanP = cleanRuleString(p);
        if (matches(p, requiredPerm)) return true;
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
                if (isRuleExpired(p)) return false;
                if (matches(p, requiredPerm)) return true;
                const cleanP = cleanRuleString(p);
                if (cleanP.startsWith(requiredPerm + '.') || cleanP.startsWith(requiredPerm + ':')) return true;
                return false;
            });
            if (hasRoleAllow) return true;
        }
    }

    return false;
}
