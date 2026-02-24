'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../lib/authContext';
import Navbar from '../../components/Navbar';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, LayoutDashboard, Clock, Rocket, LogOut, Mail, Key } from 'lucide-react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const { signIn, profile, user, signOut } = useAuth();
    const router = useRouter();

    // Redirección inteligente
    useEffect(() => {
        if (profile) {
            console.log('🚪 Redirigiendo usuario con rol:', profile.role);
            const staffRoles = ['admin', 'web_admin', 'sys_admin', 'administrativo', 'employee', 'operations'];
            
            if (staffRoles.includes(profile.role)) {
                router.push('/admin/dashboard');
            } else if (profile.role === 'b2b_client') {
                router.push('/b2b/dashboard');
            } else {
                router.push('/');
            }
        }
    }, [profile, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        // Timeout de seguridad: si en 10s no pasa nada, liberamos el botón
        const safetyTimeout = setTimeout(() => {
            if (isMounted.current) {
                console.warn('⚠️ Login timeout reached. Unblocking UI.');
                setLoading(false);
                setError('La validación está tardando más de lo esperado. Por favor reintenta.');
            }
        }, 10000);

        try {
            console.log('🔑 Intentando ingresar con:', email);
            const { error: signInError } = await signIn(email, password);

            if (signInError) {
                clearTimeout(safetyTimeout);
                console.error('❌ Error de autenticación:', signInError);
                
                let errorMsg = signInError.message;
                if (errorMsg.includes('Invalid login credentials')) {
                    errorMsg = '⚠️ Correo o contraseña incorrectos. Por favor verifica.';
                } else if (errorMsg.includes('Email not confirmed')) {
                    errorMsg = '⚠️ Tu correo no ha sido confirmado. Revisa tu bandeja de entrada.';
                }
                
                setError(errorMsg);
                setLoading(false);
            } else {
                clearTimeout(safetyTimeout);
                console.log('✅ Auth exitoso, esperando validación de perfil...');
                // Al poner loading en false, el botón pasará a mostrar "Validando perfil..."
                // si el perfil aún no ha llegado del AuthContext.
                setLoading(false); 
            }
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
                background: 'radial-gradient(circle at center, rgba(10, 26, 15, 0.7) 0%, rgba(10, 26, 15, 0.95) 100%)',
                zIndex: 0
            }} />

            <div style={{ position: 'relative', zIndex: 10 }}>
                <Navbar />

                <div className="mobile-padding-sm" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '6rem 1rem',
                    minHeight: 'calc(100vh - 80px)'
                }}>
                    <div style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)',
                        padding: '3.5rem 2.5rem',
                        borderRadius: '32px',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                        width: '100%',
                        maxWidth: '440px',
                        color: 'white'
                    }}>
                        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                            <div style={{
                                width: '70px',
                                height: '70px',
                                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                                borderRadius: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 auto 1.5rem',
                                border: '1px solid rgba(255, 255, 255, 0.2)'
                            }}>
                                <Lock size={32} color="var(--secondary)" strokeWidth={2.5} />
                            </div>
                            <h1 style={{ 
                                fontFamily: 'var(--font-outfit), sans-serif',
                                fontSize: '2.5rem', 
                                fontWeight: '900', 
                                color: 'white', 
                                marginTop: '0',
                                letterSpacing: '-0.06em'
                            }}>
                                Logistics Pro<span style={{ color: 'var(--secondary)' }}>.</span>
                            </h1>
                            <p style={{ 
                                color: 'rgba(255, 255, 255, 0.6)', 
                                marginTop: '0.5rem',
                                fontSize: '1rem',
                                fontWeight: '500'
                            }}>
                                Portal de ingreso al sistema Logistics Pro
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {error && (
                                <div style={{ 
                                    padding: '1rem', 
                                    backgroundColor: 'rgba(220, 38, 38, 0.1)', 
                                    color: '#f87171', 
                                    borderRadius: '16px', 
                                    fontSize: '0.9rem',
                                    border: '1px solid rgba(220, 38, 38, 0.2)',
                                    fontWeight: '500'
                                }}>
                                    <strong>Error:</strong> {error}
                                </div>
                            )}

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.6rem', fontSize: '0.85rem', fontWeight: '700', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Correo Electrónico
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)' }}>
                                        <Mail size={18} />
                                    </div>
                                    <input
                                        required
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="socio@frubana.com"
                                        style={{ 
                                            width: '100%', 
                                            padding: '0.85rem 1rem 0.85rem 2.8rem', 
                                            borderRadius: '14px', 
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            backgroundColor: 'rgba(255,255,255,0.05)',
                                            color: 'white',
                                            fontSize: '1rem',
                                            outline: 'none',
                                            transition: 'all 0.2s'
                                        }}
                                        className="login-input"
                                    />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.6rem', fontSize: '0.85rem', fontWeight: '700', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Contraseña
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)' }}>
                                        <Key size={18} />
                                    </div>
                                    <input
                                        required
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        style={{ 
                                            width: '100%', 
                                            padding: '0.85rem 1rem 0.85rem 2.8rem', 
                                            borderRadius: '14px', 
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            backgroundColor: 'rgba(255,255,255,0.05)',
                                            color: 'white',
                                            fontSize: '1rem',
                                            outline: 'none',
                                            transition: 'all 0.2s'
                                        }}
                                        className="login-input"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="btn-premium"
                                style={{ 
                                    marginTop: '0.5rem', 
                                    width: '100%', 
                                    fontSize: '1.2rem',
                                    padding: '1rem',
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
                                    Validando tu perfil...
                                </p>
                                <p style={{ fontSize: '0.85rem', marginBottom: '1.5rem', opacity: 0.8, fontWeight: '500' }}>
                                    Estamos recuperando tus credenciales de acceso institucional.
                                </p>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <button
                                        onClick={() => router.push('/admin/dashboard')}
                                        className="btn-premium"
                                        style={{ 
                                            width: '100%', 
                                            padding: '0.8rem', 
                                            backgroundColor: 'var(--primary)', 
                                            color: 'white', 
                                            border: 'none', 
                                            borderRadius: 'var(--radius-full)', 
                                            fontWeight: '800', 
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '8px',
                                            fontSize: '0.9rem'
                                        }}
                                    >
                                        Ir al Dashboard <Rocket size={18} />
                                    </button>
                                    
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
                            </div>
                        )}

                        <div style={{ marginTop: '2.5rem', textAlign: 'center' }}>
                            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', fontWeight: '500' }}>
                                ¿No tienes cuenta para tu negocio? 
                                <br />
                                <Link href="/b2b/register" style={{ color: 'var(--secondary)', fontWeight: '800', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px', marginTop: '0.5rem' }}>
                                    Solicita acceso aquí <LayoutDashboard size={16} />
                                </Link>
                            </p>
                        </div>
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
