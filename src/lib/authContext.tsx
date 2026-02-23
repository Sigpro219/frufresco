'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from './supabase';
import { logError } from './errorUtils';
import { User, AuthError } from '@supabase/supabase-js';

interface Profile {
    id: string;
    role: string; // Made flexible to support new organizational roles
    contact_name?: string;
    company_name?: string;
    price_list_id?: string;
    address_main?: string;
    specialty?: string;
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
        
        console.log('🔄 Cargando perfil para:', userId);
        let query = supabase
            .from('profiles')
            .select('*')
            .eq('id', userId);
            
        if (signal) query = query.abortSignal(signal);

        try {
            const { data, error } = await query.maybeSingle();

            if (error) {
                // Log full error object including non-enumerable properties
                console.error('❌ Error detallado al cargar perfil:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
                
                // Fallback: If we have a user but profile fetch fails (e.g. network), 
                // try to construct a temporary profile to avoid UI blocking if it's just a fetch error
                // but ONLY if it's not a severe auth error.
                // For now, let's just log it.
                logError('authContext fetchProfile', error);
            } else if (data) {
                if (signal?.aborted) return;
                console.log('✅ Perfil cargado:', data.role);
                setProfile(data as Profile);
            } else {
                console.warn('⚠️ Perfil no encontrado en la tabla profiles.');
                // Critical Fix: If profile is missing but user exists, we might want to 
                // create a default profile or allow access with limited features.
            }
        } catch (err) {
            console.error('❌ Excepción crítica en fetchProfile:', err);
            logError('authContext fetchProfile exception', err);
        }
    };

    useEffect(() => {
        let isMounted = true;

        const initAuth = async () => {
            let subscription;
            try {
                console.log('🏁 Iniciando AuthProvider...');
                // 1. Get initial session
                const { data: { session }, error: sessionError } = await supabase.auth.getSession();
                
                if (sessionError) {
                    console.error('❌ Error al obtener sesión inicial:', sessionError);
                }

                if (isMounted) {
                    const currentUser = session?.user ?? null;
                    setUser(currentUser);
                    console.log('👤 Usuario detectado:', currentUser?.email || 'Ninguno');
                    
                    if (currentUser) {
                        // No esperamos a que fetchProfile termine para liberar el Navbar,
                        // pero sí lo llamamos para cargar los datos en segundo plano.
                        fetchProfile(currentUser.id).catch(err => {
                             console.error('❌ Error asíncrono en fetchProfile:', err);
                        });
                    }
                    // IMPORTANTE: Liberamos el estado de carga lo antes posible
                    setLoading(false);
                }

                // 2. Set up auth state change listener
                const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
                    console.log('🔔 Cambio de estado Auth:', event);
                    if (!isMounted) return;
                    
                    const newUser = session?.user ?? null;
                    setUser(newUser);
                    
                    if (newUser) {
                        await fetchProfile(newUser.id);
                    } else {
                        setProfile(null);
                    }
                    setLoading(false);
                });
                subscription = data.subscription;
            } catch (err) {
                console.error('❌ Error crítico en initAuth:', err);
                logError('authContext initAuth', err);
            } finally {
                if (isMounted) {
                    console.log('✅ Fin de inicialización auth (loading=false)');
                    setLoading(false);
                }
            }

            return subscription;
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
