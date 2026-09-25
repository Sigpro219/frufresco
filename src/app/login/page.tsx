'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../lib/authContext';
import { supabase } from '../../lib/supabase';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, LayoutDashboard, Clock, Rocket, LogOut, Mail, Key, Eye, EyeOff, ArrowLeft, Building2, Briefcase, CheckCircle2 } from 'lucide-react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const { signIn, profile, user, signOut, switchProfile } = useAuth();
    const router = useRouter();

    // Forced password change / Recovery states
    const [isRecoveryMode, setIsRecoveryMode] = useState(false);
    const [showForceChangePassword, setShowForceChangePassword] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [changeSuccess, setChangeSuccess] = useState(false);

    // Forgot password flow states
    const [showForgotPassword, setShowForgotPassword] = useState(false);
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotLoading, setForgotLoading] = useState(false);
    const [forgotSuccess, setForgotSuccess] = useState(false);
    const [forgotError, setForgotError] = useState('');

    // Multi-profile workspace selector
    const [showWorkspaceSelector, setShowWorkspaceSelector] = useState(false);
    const [discoveredProfiles, setDiscoveredProfiles] = useState<any[]>([]);

    // Capturar parámetros de URL (PKCE code, tokens en hash, error de desactivación, modo recuperación)
    useEffect(() => {
        const handleAuthRecoveryLifecycle = async () => {
            if (typeof window === 'undefined') return;

            const params = new URLSearchParams(window.location.search);
            const errParam = params.get('error');
            if (errParam === 'deactivated') {
                setError('⚠️ Tu cuenta de acceso ha sido desactivada. Por favor, contacta al administrador de talento humano.');
            } else if (errParam) {
                const desc = params.get('error_description') || errParam;
                const cleanDesc = decodeURIComponent(desc).replace(/\+/g, ' ');
                if (cleanDesc.toLowerCase().includes('expired') || params.get('error_code') === 'otp_expired') {
                    setError('⚠️ El enlace de recuperación ha expirado o ya fue utilizado. Por favor solicita uno nuevo.');
                } else {
                    setError(`⚠️ ${cleanDesc}`);
                }
            }

            // 1. Manejar PKCE code exchange (?code=xxxx)
            const code = params.get('code');
            if (code) {
                try {
                    console.log('🔄 Canjeando código PKCE por sesión activa de recuperación...');
                    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
                    if (exchangeError) {
                        console.warn('⚠️ Error al canjear código de sesión:', exchangeError.message);
                        if (exchangeError.message.toLowerCase().includes('expired') || exchangeError.message.toLowerCase().includes('invalid')) {
                            setError('⚠️ El enlace de recuperación ha expirado o ya fue utilizado. Por favor solicita uno nuevo.');
                        } else {
                            setError(`⚠️ ${exchangeError.message}`);
                        }
                    } else if (data.session) {
                        console.log('✅ Sesión establecida exitosamente vía PKCE code para:', data.session.user.email);
                        setIsRecoveryMode(true);
                        setShowForceChangePassword(true);
                        return;
                    }
                } catch (e: any) {
                    console.error('Error exchanging code for session:', e);
                }
            }

            // 2. Manejar Implicit flow tokens en hash (#access_token=...&refresh_token=...)
            if (window.location.hash) {
                const hash = window.location.hash.substring(1);
                const hashParams = new URLSearchParams(hash);
                const accessToken = hashParams.get('access_token');
                const refreshToken = hashParams.get('refresh_token');
                const type = hashParams.get('type');

                if (accessToken && refreshToken) {
                    try {
                        console.log('🔄 Restaurando sesión de recuperación desde hash tokens...');
                        const { data, error: sessionError } = await supabase.auth.setSession({
                            access_token: accessToken,
                            refresh_token: refreshToken
                        });
                        if (sessionError) {
                            console.warn('⚠️ Error estableciendo sesión desde hash:', sessionError.message);
                        } else if (data.session) {
                            console.log('✅ Sesión establecida exitosamente vía Hash tokens para:', data.session.user.email);
                            if (type === 'recovery' || params.get('mode') === 'recovery') {
                                setIsRecoveryMode(true);
                                setShowForceChangePassword(true);
                                return;
                            }
                        }
                    } catch (e: any) {
                        console.error('Error setting session from hash:', e);
                    }
                }
            }

            // 3. Fallback modo recovery explícito en query o hash
            if (params.get('mode') === 'recovery' || window.location.hash.includes('type=recovery')) {
                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                    console.log('✅ Sesión existente confirmada en modo recovery:', session.user.email);
                }
                setIsRecoveryMode(true);
                setShowForceChangePassword(true);
            }
        };

        handleAuthRecoveryLifecycle();
    }, []);

    // Escuchar evento PASSWORD_RECOVERY de Supabase
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && isRecoveryMode)) {
                console.log('🔔 Evento de autenticación detectado:', event);
                setIsRecoveryMode(true);
                setShowForceChangePassword(true);
            }
        });
        return () => subscription.unsubscribe();
    }, [isRecoveryMode]);

    // Helper para determinar redirección según el perfil
    const routeUserByProfile = (targetProfile: any) => {
        const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
        const redirectUrl = searchParams.get('redirect');

        const isClientRole = targetProfile.role === 'b2b_client' || 
                             targetProfile.role === 'b2c_client' || 
                             targetProfile.role === 'client';

        if (isClientRole) {
            console.log('🛒 Redirigiendo cliente institucional a /b2b/dashboard');
            router.push('/b2b/dashboard');
        } else {
            console.log('🏢 Redirigiendo colaborador a /admin/dashboard');
            if (redirectUrl && redirectUrl.startsWith('/admin')) {
                router.push(redirectUrl);
            } else {
                router.push('/admin/dashboard');
            }
        }
    };

    // Redirección inteligente al cargar perfil
    useEffect(() => {
        if (profile && !showWorkspaceSelector && !showForceChangePassword) {
            if (profile.needs_password_change) {
                console.log('🔒 El usuario requiere cambio de contraseña obligatorio antes de ingresar');
                setShowForceChangePassword(true);
                return;
            }

            // Si ya hay un perfil activo guardado en localStorage o si no hay multiplicidad, redirigir
            const savedActiveId = typeof window !== 'undefined' ? localStorage.getItem('frufresco_active_profile_id') : null;
            if (savedActiveId && savedActiveId === profile.id) {
                routeUserByProfile(profile);
            } else if (discoveredProfiles.length <= 1) {
                routeUserByProfile(profile);
            }
        }
    }, [profile, showWorkspaceSelector, showForceChangePassword, discoveredProfiles]);

    const handlePasswordUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        if (newPassword.length < 6) {
            setError('⚠️ La contraseña debe tener al menos 6 caracteres.');
            setLoading(false);
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('⚠️ Las contraseñas ingresadas no coinciden.');
            setLoading(false);
            return;
        }

        try {
            // 1. Intentar actualización vía Server API Route con sesión de cookies y admin client
            const res = await fetch('/api/auth/update-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: newPassword })
            });

            const data = await res.json().catch(() => ({}));

            if (res.ok && data.success) {
                console.log('✅ Contraseña restablecida exitosamente vía API de Servidor');
                setChangeSuccess(true);
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
                return;
            }

            // 2. Fallback: Intentar actualización directa vía Supabase Client si hay sesión
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                const { error: authError } = await supabase.auth.updateUser({ password: newPassword });
                if (!authError) {
                    if (session.user?.id) {
                        await supabase
                            .from('profiles')
                            .update({ needs_password_change: false })
                            .eq('id', session.user.id);
                    }
                    console.log('✅ Contraseña restablecida con éxito vía Supabase Client');
                    setChangeSuccess(true);
                    setTimeout(() => {
                        window.location.href = '/login';
                    }, 2000);
                    return;
                }
            }

            // Si ambos fallaron, mostrar el error más informativo
            const errorMsg = data.error || 'La sesión de recuperación no está activa o el enlace ya expiró. Por favor solicita un nuevo enlace.';
            setError(`⚠️ ${errorMsg}`);
            setLoading(false);

        } catch (err: any) {
            console.error('❌ Error al actualizar contraseña:', err);
            let msg = err.message || 'Error inesperado al cambiar la contraseña';
            if (msg.includes('Auth session missing') || msg.includes('PKCE code verifier not found')) {
                msg = '⚠️ La sesión de autenticación no está activa o el enlace expiró. Por favor solicita un nuevo enlace de recuperación.';
            }
            setError(msg);
            setLoading(false);
        }
    };

    const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setForgotLoading(true);
        setForgotError('');
        setForgotSuccess(false);

        const cleanEmail = forgotEmail.trim().toLowerCase();
        if (!cleanEmail) {
            setForgotError('Por favor ingresa tu correo electrónico');
            setForgotLoading(false);
            return;
        }

        try {
            // Asegurar que el enlace de recuperación apunte a producción (https://frufresco-liard.vercel.app)
            // utilizando el handler server-side /auth/callback para canjear el código PKCE automáticamente.
            const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL;
            const isLocal = typeof window !== 'undefined' && 
                (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

            const baseOrigin = configuredUrl 
                ? configuredUrl.replace(/\/$/, '') 
                : (isLocal ? 'https://frufresco-liard.vercel.app' : window.location.origin);

            const redirectUrl = `${baseOrigin}/auth/callback?next=${encodeURIComponent('/login?mode=recovery')}`;
            console.log('📨 Solicitando recuperación con redirectUrl:', redirectUrl);

            const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
                redirectTo: redirectUrl,
            });

            if (resetError) throw resetError;

            setForgotSuccess(true);
        } catch (err: any) {
            console.error('❌ Error en recuperación de contraseña:', err);
            let msg = err.message || 'Error al enviar el enlace de recuperación';
            if (msg.includes('rate limit')) {
                msg = 'Has solicitado varios enlaces recientemente. Por favor espera unos minutos antes de reintentar.';
            }
            setForgotError(msg);
        } finally {
            setForgotLoading(false);
        }
    };

    const handleSelectWorkspace = async (selectedProfile: any) => {
        if (!selectedProfile) return;
        setLoading(true);
        if (typeof window !== 'undefined') {
            localStorage.setItem('frufresco_active_profile_id', selectedProfile.id);
        }
        await switchProfile(selectedProfile.id);
        setShowWorkspaceSelector(false);
        routeUserByProfile(selectedProfile);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const safetyTimeout = setTimeout(() => {
            if (isMounted.current) {
                setLoading(false);
                setError('La validación está tardando más de lo esperado. Por favor reintenta.');
            }
        }, 10000);

        try {
            const cleanEmail = email.trim().toLowerCase();
            const cleanPassword = password.trim();
            console.log('🔑 Intentando ingresar con:', cleanEmail);

            // 1. Autenticar con Supabase Auth
            const { error: signInError } = await signIn(cleanEmail, cleanPassword);

            if (signInError) {
                clearTimeout(safetyTimeout);
                console.warn('⚠️ Error de autenticación:', signInError.message);
                
                let errorMsg = signInError.message;
                if (errorMsg.includes('Invalid login credentials')) {
                    errorMsg = '⚠️ Correo o contraseña incorrectos. Por favor verifica tus datos o restablece tu clave.';
                } else if (errorMsg.includes('Email not confirmed')) {
                    errorMsg = '⚠️ Tu correo no ha sido confirmado. Revisa tu bandeja de entrada.';
                }
                
                setError(errorMsg);
                setLoading(false);
                return;
            }

            clearTimeout(safetyTimeout);

            // 2. Comprobar si el usuario tiene múltiples identidades (Colaborador + Cliente B2B)
            const { data: siblingProfiles } = await supabase
                .from('profiles')
                .select('id, company_name, role, profile_type, custom_permissions, email')
                .ilike('email', cleanEmail);

            if (siblingProfiles && siblingProfiles.length > 1) {
                console.log('👥 Múltiples identidades detectadas para este correo:', siblingProfiles.length);
                setDiscoveredProfiles(siblingProfiles);
                setShowWorkspaceSelector(true);
                setLoading(false);
                return;
            }

            // Flujo normal de 1 solo perfil
            setLoading(false);
        } catch (err: unknown) {
            clearTimeout(safetyTimeout);
            console.error('❌ Error inesperado en submit:', err);
            setError(err instanceof Error ? err.message : 'Error inesperado');
            setLoading(false);
        }
    };

    const isMounted = useRef(true);
    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    return (
        <main style={{ 
            minHeight: '100vh', 
            backgroundColor: '#0a1a0f',
            backgroundImage: 'url("https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=2000&auto=format&fit=crop")',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundAttachment: 'fixed',
            position: 'relative'
        }}>
            {/* Dark Overlay with Radial Gradient for depth */}
            <div style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                background: 'radial-gradient(circle at center, rgba(10, 26, 15, 0.75) 0%, rgba(10, 26, 15, 0.96) 100%)',
                zIndex: 0
            }} />

            <div className="login-card-container">
                <div className="login-card" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '5rem 1rem',
                    minHeight: 'calc(100vh - 80px)'
                }}>
                    <div style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)',
                        padding: '2.2rem 2.5rem',
                        borderRadius: '32px',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                        width: '100%',
                        maxWidth: '460px',
                        color: 'white',
                        position: 'relative',
                        zIndex: 1
                    }}>
                        {/* VISTA 1: SELECTOR DE ESPACIO DE TRABAJO (Doble Identidad Colaborador vs Cliente) */}
                        {showWorkspaceSelector ? (
                            <div>
                                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                                    <div style={{
                                        width: '52px',
                                        height: '52px',
                                        backgroundColor: 'rgba(13, 122, 87, 0.2)',
                                        borderRadius: '16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        margin: '0 auto 1rem',
                                        border: '1px solid rgba(13, 122, 87, 0.4)'
                                    }}>
                                        <Briefcase size={26} color="#34d399" strokeWidth={2.5} />
                                    </div>
                                    <h1 style={{ 
                                        fontFamily: 'var(--font-outfit), sans-serif',
                                        fontSize: '1.75rem', 
                                        fontWeight: '900', 
                                        color: 'white', 
                                        marginTop: '0',
                                        letterSpacing: '-0.04em'
                                    }}>
                                        Espacio de Trabajo<span style={{ color: '#34d399' }}>.</span>
                                    </h1>
                                    <p style={{ 
                                        color: 'rgba(255, 255, 255, 0.7)', 
                                        marginTop: '0.3rem',
                                        fontSize: '0.9rem',
                                        fontWeight: '500'
                                    }}>
                                        Tu cuenta tiene múltiples roles registrados. ¿A dónde deseas ingresar hoy?
                                    </p>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                                    {discoveredProfiles.map((p) => {
                                        const isClient = p.role === 'b2b_client' || p.role === 'b2c_client' || p.role === 'client';
                                        return (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => handleSelectWorkspace(p)}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '1rem',
                                                    padding: '1.1rem 1.25rem',
                                                    borderRadius: '18px',
                                                    border: '1.5px solid rgba(255, 255, 255, 0.15)',
                                                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                                                    color: 'white',
                                                    cursor: 'pointer',
                                                    textAlign: 'left',
                                                    transition: 'all 0.2s',
                                                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.14)';
                                                    e.currentTarget.style.borderColor = isClient ? '#fbbf24' : '#34d399';
                                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
                                                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                }}
                                            >
                                                <div style={{
                                                    width: '42px',
                                                    height: '42px',
                                                    borderRadius: '12px',
                                                    backgroundColor: isClient ? 'rgba(251, 191, 36, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: isClient ? '#fbbf24' : '#34d399',
                                                    flexShrink: 0
                                                }}>
                                                    {isClient ? <Building2 size={22} /> : <Briefcase size={22} />}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', color: isClient ? '#fbbf24' : '#34d399' }}>
                                                        {isClient ? 'Portal Institucional B2B' : 'FruFresco Operaciones'}
                                                    </div>
                                                    <div style={{ fontSize: '1.05rem', fontWeight: '800', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {isClient ? (p.company_name || 'Mi Cuenta Comercial') : p.role}
                                                    </div>
                                                    <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>
                                                        {isClient ? 'Consulta de pedidos, catálogo y facturación' : 'Gestión interna del ERP según tus permisos'}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowWorkspaceSelector(false);
                                        signOut();
                                    }}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'rgba(255, 255, 255, 0.5)',
                                        fontSize: '0.85rem',
                                        cursor: 'pointer',
                                        width: '100%',
                                        textAlign: 'center',
                                        padding: '0.5rem',
                                        fontWeight: '600'
                                    }}
                                >
                                    ← Volver e ingresar con otra cuenta
                                </button>
                            </div>
                        ) : showForgotPassword ? (
                            /* VISTA 2: RECUPERACIÓN AUTÓNOMA DE CONTRASEÑA */
                            <div>
                                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                                    <div style={{
                                        width: '50px',
                                        height: '50px',
                                        backgroundColor: 'rgba(52, 211, 153, 0.15)',
                                        borderRadius: '16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        margin: '0 auto 1rem',
                                        border: '1px solid rgba(52, 211, 153, 0.3)'
                                    }}>
                                        <Mail size={24} color="#34d399" strokeWidth={2.5} />
                                    </div>
                                    <h1 style={{ 
                                        fontFamily: 'var(--font-outfit), sans-serif',
                                        fontSize: '1.75rem', 
                                        fontWeight: '900', 
                                        color: 'white', 
                                        marginTop: '0',
                                        letterSpacing: '-0.04em'
                                    }}>
                                        Recuperar Clave<span style={{ color: '#34d399' }}>.</span>
                                    </h1>
                                    <p style={{ 
                                        color: 'rgba(255, 255, 255, 0.7)', 
                                        marginTop: '0.3rem',
                                        fontSize: '0.88rem',
                                        lineHeight: '1.4',
                                        fontWeight: '500'
                                    }}>
                                        Ingresa tu correo registrado. Te enviaremos un enlace seguro para que restablezcas tu contraseña sin intermediarios.
                                    </p>
                                </div>

                                {forgotSuccess ? (
                                    <div style={{
                                        padding: '1.5rem',
                                        backgroundColor: 'rgba(16, 185, 129, 0.12)',
                                        border: '1px solid rgba(16, 185, 129, 0.3)',
                                        borderRadius: '20px',
                                        textAlign: 'center'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
                                            <CheckCircle2 size={38} color="#34d399" />
                                        </div>
                                        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: '800', color: 'white' }}>
                                            ¡Enlace despachado!
                                        </h3>
                                        <p style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.8)', margin: '0 0 1.25rem', lineHeight: '1.5' }}>
                                            Revisa la bandeja de entrada de <strong>{forgotEmail}</strong> (incluyendo correo no deseado o spam) y abre el enlace para establecer tu nueva clave.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowForgotPassword(false);
                                                setForgotSuccess(false);
                                            }}
                                            className="btn-premium"
                                            style={{
                                                width: '100%',
                                                padding: '0.75rem',
                                                borderRadius: 'var(--radius-full)',
                                                fontWeight: '800',
                                                backgroundColor: '#34d399',
                                                color: '#0a1a0f',
                                                border: 'none',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Entendido, volver al ingreso
                                        </button>
                                    </div>
                                ) : (
                                    <form onSubmit={handleForgotPasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                        {forgotError && (
                                            <div style={{ 
                                                padding: '0.9rem', 
                                                backgroundColor: 'rgba(220, 38, 38, 0.15)', 
                                                color: '#fca5a5', 
                                                borderRadius: '14px', 
                                                fontSize: '0.88rem',
                                                border: '1px solid rgba(220, 38, 38, 0.3)',
                                                fontWeight: '500'
                                            }}>
                                                {forgotError}
                                            </div>
                                        )}

                                        <div>
                                            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.75rem', fontWeight: '700', color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                Correo Electrónico
                                            </label>
                                            <div style={{ position: 'relative' }}>
                                                <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#475569', zIndex: 2, pointerEvents: 'none' }}>
                                                    <Mail size={18} />
                                                </div>
                                                <input
                                                    required
                                                    type="email"
                                                    value={forgotEmail}
                                                    onChange={(e) => setForgotEmail(e.target.value)}
                                                    placeholder="ejemplo@gmail.com"
                                                    style={{ 
                                                        width: '100%', 
                                                        padding: '0.75rem 1rem 0.75rem 2.8rem', 
                                                        borderRadius: '14px', 
                                                        border: '1.5px solid #CBD5E1',
                                                        backgroundColor: '#FFFFFF',
                                                        color: '#0F172A',
                                                        fontSize: '1rem',
                                                        fontWeight: '600',
                                                        outline: 'none'
                                                    }}
                                                    className="login-input"
                                                />
                                            </div>
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={forgotLoading}
                                            className="btn-premium"
                                            style={{ 
                                                width: '100%', 
                                                fontSize: '1rem',
                                                padding: '0.8rem',
                                                borderRadius: 'var(--radius-full)',
                                                fontWeight: '900',
                                                fontFamily: 'var(--font-outfit), sans-serif',
                                                backgroundColor: forgotLoading ? 'rgba(255,255,255,0.15)' : '#34d399',
                                                color: '#0a1a0f',
                                                border: 'none',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '8px'
                                            }}
                                        >
                                            {forgotLoading ? 'Enviando enlace...' : 'Enviar enlace de recuperación'}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setShowForgotPassword(false)}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: 'rgba(255, 255, 255, 0.7)',
                                                fontSize: '0.85rem',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px',
                                                fontWeight: '600'
                                            }}
                                        >
                                            <ArrowLeft size={16} /> Volver a iniciar sesión
                                        </button>
                                    </form>
                                )}
                            </div>
                        ) : showForceChangePassword ? (
                            /* VISTA 3: RESTABLECER / NUEVA CONTRASEÑA */
                            <>
                                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                                    <div style={{
                                        width: '50px',
                                        height: '50px',
                                        backgroundColor: 'rgba(251, 191, 36, 0.15)',
                                        borderRadius: '16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        margin: '0 auto 1rem',
                                        border: '1px solid rgba(251, 191, 36, 0.3)'
                                    }}>
                                        <Lock size={24} color="#fbbf24" strokeWidth={2.5} />
                                    </div>
                                    <h1 style={{ 
                                        fontFamily: 'var(--font-outfit), sans-serif',
                                        fontSize: '1.75rem', 
                                        fontWeight: '900', 
                                        color: 'white', 
                                        marginTop: '0',
                                        letterSpacing: '-0.04em'
                                    }}>
                                        {isRecoveryMode ? 'Restablecer Clave' : 'Nueva Contraseña'}<span style={{ color: '#fbbf24' }}>.</span>
                                    </h1>
                                    <p style={{ 
                                        color: 'rgba(255, 255, 255, 0.7)', 
                                        marginTop: '0.2rem',
                                        fontSize: '0.85rem',
                                        fontWeight: '500',
                                        lineHeight: '1.4'
                                    }}>
                                        {isRecoveryMode 
                                            ? 'Establece tu nueva contraseña segura para recuperar tu acceso.' 
                                            : 'Por seguridad, debes establecer una contraseña personal antes de ingresar por primera vez.'}
                                    </p>
                                </div>

                                <form onSubmit={handlePasswordUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {error && (
                                        <div style={{ 
                                            padding: '1rem', 
                                            backgroundColor: 'rgba(220, 38, 38, 0.15)', 
                                            color: '#f87171', 
                                            borderRadius: '16px', 
                                            fontSize: '0.9rem',
                                            border: '1px solid rgba(220, 38, 38, 0.3)',
                                            fontWeight: '500'
                                        }}>
                                            {error}
                                        </div>
                                    )}

                                    {changeSuccess ? (
                                        <div style={{ 
                                            padding: '1.2rem', 
                                            backgroundColor: 'rgba(16, 185, 129, 0.15)', 
                                            color: '#34d399', 
                                            borderRadius: '16px', 
                                            fontSize: '0.95rem',
                                            border: '1px solid rgba(16, 185, 129, 0.3)',
                                            fontWeight: '600',
                                            textAlign: 'center'
                                        }}>
                                            ¡Contraseña actualizada con éxito!<br/>
                                            <span style={{ fontSize: '0.8rem', fontWeight: '400', opacity: 0.8 }}>Redirigiendo a tu cuenta...</span>
                                        </div>
                                    ) : (
                                        <>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.75rem', fontWeight: '700', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    Nueva Contraseña
                                                </label>
                                                <div style={{ position: 'relative' }}>
                                                    <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#475569', zIndex: 2, pointerEvents: 'none' }}>
                                                        <Key size={18} />
                                                    </div>
                                                    <input
                                                        required
                                                        type={showNewPassword ? "text" : "password"}
                                                        value={newPassword}
                                                        onChange={(e) => setNewPassword(e.target.value)}
                                                        placeholder="Mínimo 6 caracteres"
                                                        style={{ 
                                                            width: '100%', 
                                                            padding: '0.75rem 3rem 0.75rem 2.8rem', 
                                                            borderRadius: '14px', 
                                                            border: '1.5px solid #CBD5E1',
                                                            backgroundColor: '#FFFFFF',
                                                            color: '#0F172A',
                                                            fontSize: '1rem',
                                                            fontWeight: '600',
                                                            outline: 'none'
                                                        }}
                                                        className="login-input"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowNewPassword(!showNewPassword)}
                                                        style={{
                                                            position: 'absolute',
                                                            right: '12px',
                                                            top: '50%',
                                                            transform: 'translateY(-50%)',
                                                            background: 'none',
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            color: showNewPassword ? '#10B981' : '#475569',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            padding: '0.3rem',
                                                            zIndex: 5
                                                        }}
                                                    >
                                                        {showNewPassword ? <Eye size={18} /> : <EyeOff size={18} />}
                                                    </button>
                                                </div>
                                            </div>

                                            <div>
                                                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.75rem', fontWeight: '700', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    Confirmar Contraseña
                                                </label>
                                                <div style={{ position: 'relative' }}>
                                                    <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#475569', zIndex: 2, pointerEvents: 'none' }}>
                                                        <Key size={18} />
                                                    </div>
                                                    <input
                                                        required
                                                        type={showConfirmPassword ? "text" : "password"}
                                                        value={confirmPassword}
                                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                                        placeholder="Repite tu contraseña"
                                                        style={{ 
                                                            width: '100%', 
                                                            padding: '0.75rem 3rem 0.75rem 2.8rem', 
                                                            borderRadius: '14px', 
                                                            border: '1.5px solid #CBD5E1',
                                                            backgroundColor: '#FFFFFF',
                                                            color: '#0F172A',
                                                            fontSize: '1rem',
                                                            fontWeight: '600',
                                                            outline: 'none'
                                                        }}
                                                        className="login-input"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                                        style={{
                                                            position: 'absolute',
                                                            right: '12px',
                                                            top: '50%',
                                                            transform: 'translateY(-50%)',
                                                            background: 'none',
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            color: showConfirmPassword ? '#10B981' : '#475569',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            padding: '0.3rem',
                                                            zIndex: 5
                                                        }}
                                                    >
                                                        {showConfirmPassword ? <Eye size={18} /> : <EyeOff size={18} />}
                                                    </button>
                                                </div>
                                            </div>

                                            <button
                                                type="submit"
                                                disabled={loading}
                                                className="btn-premium"
                                                style={{ 
                                                    marginTop: '0.5rem', 
                                                    width: '100%', 
                                                    fontSize: '1rem',
                                                    padding: '0.8rem',
                                                    borderRadius: 'var(--radius-full)',
                                                    fontWeight: '900',
                                                    fontFamily: 'var(--font-outfit), sans-serif',
                                                    backgroundColor: loading ? 'rgba(255,255,255,0.1)' : '#fbbf24',
                                                    color: '#0a1a0f',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '10px'
                                                }}
                                            >
                                                {loading ? 'Guardando...' : 'Confirmar y Guardar Clave'}
                                            </button>
                                        </>
                                    )}
                                </form>
                            </>
                        ) : (
                            /* VISTA 4: LOGIN PRINCIPAL */
                            <>
                                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                                    <div style={{
                                        width: '50px',
                                        height: '50px',
                                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                        borderRadius: '15px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        margin: '0 auto 1rem',
                                        border: '1px solid rgba(255, 255, 255, 0.2)'
                                    }}>
                                        <Lock size={24} color="var(--secondary)" strokeWidth={2.5} />
                                    </div>
                                    <h1 style={{ 
                                        fontFamily: 'var(--font-outfit), sans-serif',
                                        fontSize: '2rem', 
                                        fontWeight: '900', 
                                        color: 'white', 
                                        marginTop: '0',
                                        letterSpacing: '-0.06em'
                                    }}>
                                        Logistics Pro<span style={{ color: 'var(--secondary)' }}>.</span>
                                    </h1>
                                    <p style={{ 
                                        color: 'rgba(255, 255, 255, 0.65)', 
                                        marginTop: '0.2rem',
                                        fontSize: '0.9rem',
                                        fontWeight: '500'
                                    }}>
                                        Portal de acceso a operaciones y cuentas institucionales
                                    </p>
                                </div>

                                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {error && (
                                        <div style={{ 
                                            padding: '1rem', 
                                            backgroundColor: 'rgba(220, 38, 38, 0.15)', 
                                            color: '#f87171', 
                                            borderRadius: '16px', 
                                            fontSize: '0.9rem',
                                            border: '1px solid rgba(220, 38, 38, 0.3)',
                                            fontWeight: '500'
                                        }}>
                                            {error}
                                        </div>
                                    )}

                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.75rem', fontWeight: '700', color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            Correo Electrónico
                                        </label>
                                        <div style={{ position: 'relative' }}>
                                            <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#475569', zIndex: 2, pointerEvents: 'none' }}>
                                                <Mail size={18} />
                                            </div>
                                            <input
                                                required
                                                type="email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                placeholder="usuario@gmail.com"
                                                style={{ 
                                                    width: '100%', 
                                                    padding: '0.75rem 1rem 0.75rem 2.8rem', 
                                                    borderRadius: '14px', 
                                                    border: '1.5px solid #CBD5E1',
                                                    backgroundColor: '#FFFFFF',
                                                    color: '#0F172A',
                                                    fontSize: '1rem',
                                                    fontWeight: '600',
                                                    outline: 'none',
                                                    transition: 'all 0.2s'
                                                }}
                                                className="login-input"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                Contraseña
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setForgotEmail(email);
                                                    setShowForgotPassword(true);
                                                    setError('');
                                                }}
                                                style={{
                                                    background: 'transparent',
                                                    border: 'none',
                                                    color: 'var(--secondary)',
                                                    fontSize: '0.75rem',
                                                    fontWeight: '700',
                                                    cursor: 'pointer',
                                                    textDecoration: 'underline'
                                                }}
                                            >
                                                ¿Olvidaste tu contraseña?
                                            </button>
                                        </div>
                                        <div style={{ position: 'relative' }}>
                                            <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#475569', zIndex: 2, pointerEvents: 'none' }}>
                                                <Key size={18} />
                                            </div>
                                            <input
                                                required
                                                autoComplete="current-password"
                                                type={showPassword ? "text" : "password"}
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                placeholder="••••••••"
                                                style={{ 
                                                    width: '100%', 
                                                    padding: '0.75rem 3rem 0.75rem 2.8rem', 
                                                    borderRadius: '14px', 
                                                    border: '1.5px solid #CBD5E1',
                                                    backgroundColor: '#FFFFFF',
                                                    color: '#0F172A',
                                                    fontSize: '1rem',
                                                    fontWeight: '600',
                                                    outline: 'none',
                                                    transition: 'all 0.2s'
                                                }}
                                                className="login-input"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                style={{
                                                    position: 'absolute',
                                                    right: '12px',
                                                    top: '50%',
                                                    transform: 'translateY(-50%)',
                                                    background: 'none',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    color: showPassword ? '#10B981' : '#475569',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    padding: '0.4rem',
                                                    zIndex: 5
                                                }}
                                                title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                                            >
                                                {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
                                            </button>
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="btn-premium"
                                        style={{ 
                                            marginTop: '0.5rem', 
                                            width: '100%', 
                                            fontSize: '1rem',
                                            padding: '0.8rem',
                                            borderRadius: 'var(--radius-full)',
                                            fontWeight: '900',
                                            fontFamily: 'var(--font-outfit), sans-serif',
                                            backgroundColor: loading ? 'rgba(255,255,255,0.1)' : 'var(--primary)',
                                            color: 'white',
                                            border: 'none',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '10px',
                                            boxShadow: '0 10px 20px rgba(0,0,0,0.2)'
                                        }}
                                    >
                                        {loading ? 'Autenticando...' : (
                                            <>
                                                {user ? 'Validado' : 'Ingresar'} <Rocket size={20} />
                                            </>
                                        )}
                                    </button>
                                </form>

                                {user && !profile && (
                                    <div style={{ 
                                        marginTop: '1.5rem', 
                                        padding: '1.5rem', 
                                        backgroundColor: 'rgba(251, 191, 36, 0.1)', 
                                        color: '#fbbf24', 
                                        borderRadius: '24px', 
                                        textAlign: 'center', 
                                        border: '1px solid rgba(251, 191, 36, 0.2)',
                                        backdropFilter: 'blur(10px)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
                                            <Clock className="animate-pulse" size={32} />
                                        </div>
                                        <p style={{ 
                                            fontFamily: 'var(--font-outfit), sans-serif',
                                            margin: '0 0 0.5rem', 
                                            fontWeight: '800', 
                                            fontSize: '1.1rem' 
                                        }}>
                                            Cargando credenciales...
                                        </p>
                                        <p style={{ fontSize: '0.85rem', marginBottom: '1.5rem', opacity: 0.8, fontWeight: '500' }}>
                                            Estamos configurando tu espacio de trabajo.
                                        </p>
                                        
                                        <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginTop: '0.5rem' }}>
                                            <button
                                                onClick={() => window.location.reload()}
                                                style={{ background: 'transparent', border: 'none', textDecoration: 'underline', color: '#fbbf24', fontSize: '0.8rem', cursor: 'pointer', fontWeight: '600' }}
                                            >
                                                Refrescar
                                            </button>
                                            
                                            <button
                                                onClick={() => signOut()}
                                                style={{ 
                                                    background: 'transparent', 
                                                    border: 'none', 
                                                    color: '#fbbf24', 
                                                    fontSize: '0.8rem', 
                                                    cursor: 'pointer', 
                                                    opacity: 0.8,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    fontWeight: '600'
                                                }}
                                            >
                                                <LogOut size={14} /> Cerrar Sesión
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div style={{ marginTop: '2rem', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1.25rem' }}>
                                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', fontWeight: '500', margin: 0 }}>
                                        ¿Eres un restaurante, hotel o negocio institucional?
                                        <br />
                                        <Link href="/b2b/register" style={{ color: 'var(--secondary)', fontWeight: '800', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px', marginTop: '0.35rem' }}>
                                            Solicita tu cuenta comercial B2B aquí <LayoutDashboard size={15} />
                                        </Link>
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <style jsx global>{`
                .login-input:focus {
                    background-color: rgba(255,255,255,0.1) !important;
                    border-color: var(--secondary) !important;
                    box-shadow: 0 0 0 4px rgba(247, 181, 0, 0.1) !important;
                }
                .animate-pulse {
                    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: .5; }
                }
            `}</style>
        </main>
    );
}
