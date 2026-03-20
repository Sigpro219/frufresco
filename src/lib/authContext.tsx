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
    address_main?: string;
    specialty?: string;
    needs_crates?: boolean;
    document_type?: string;
    remission_with_prices?: boolean;
}

interface AuthContextType {
    user: User | null;
    profile: Profile | null;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);

    // Fetch profile when user changes
    const fetchProfile = async (userId: string, signal?: AbortSignal) => {
        if (!userId) return;
        
        // Network pre-check
        if (typeof window !== 'undefined' && !navigator.onLine) {
            console.warn('⚠️ Se intentó cargar perfil pero el navegador está OFFLINE. Esperando reconexión...');
            return;
        }

        console.log('🔄 Cargando perfil para:', userId);
        let query = supabase
            .from('profiles')
            .select('*')
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
                console.log('✅ Perfil cargado:', data.role);
                setProfile(data as Profile);
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
                        fetchProfile(currentUser.id).catch(e => console.error('Error perfil:', e));
                    }
                    setLoading(false);
                }

                const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
                    if (isMounted) {
                        setUser(session?.user ?? null);
                        if (session?.user) fetchProfile(session.user.id);
                        else setProfile(null);
                        setLoading(false);
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
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) console.error('❌ Error en supabase.auth.signIn:', error.message);
        else console.log('✅ Sign-in de Supabase completado con éxito');
        return { error };
    };

    const signOut = async () => {
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
