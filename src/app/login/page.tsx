'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../lib/authContext';
import Navbar from '../../components/Navbar';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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
        <main style={{ minHeight: '100vh', backgroundColor: '#F9FAFB' }}>
            <Navbar />

            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4rem 1rem'
            }}>
                <div style={{
                    backgroundColor: 'white',
                    padding: '3rem',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-lg)',
                    width: '100%',
                    maxWidth: '400px'
                }}>
                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                        <span style={{ fontSize: '3rem' }}>🍋</span>
                        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--primary-dark)', marginTop: '1rem' }}>
                            Portal Empresarial
                        </h1>
                        <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                            Accede a tu cuenta para ver tus precios y pedidos
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {error && (
                            <div style={{ padding: '1rem', backgroundColor: '#FEE2E2', color: '#DC2626', borderRadius: 'var(--radius-md)', fontSize: '0.9rem' }}>
                                <strong>Error:</strong> {error}
                            </div>
                        )}

                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '500' }}>Correo Electrónico</label>
                            <input
                                required
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="usuario@empresa.com"
                                style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '500' }}>Contraseña</label>
                            <input
                                required
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="btn btn-primary"
                            style={{ marginTop: '1rem', width: '100%', fontSize: '1.1rem' }}
                        >
                            {loading ? 'Procesando...' : user ? 'Validado ✅' : 'Ingresar'}
                        </button>
                    </form>

                    {user && !profile && (
                        <div style={{ marginTop: '1.5rem', padding: '1.25rem', backgroundColor: '#FEF3C7', color: '#92400E', borderRadius: 'var(--radius-lg)', textAlign: 'center', border: '1px solid #FDE68A' }}>
                            <p style={{ margin: '0 0 0.75rem', fontWeight: '700', fontSize: '1rem' }}>⏱️ Validando tu perfil...</p>
                            <p style={{ fontSize: '0.85rem', marginBottom: '1.25rem', opacity: 0.9 }}>
                                Estamos recuperando tus permisos especiales de administrativo.
                            </p>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <button
                                    onClick={() => router.push('/admin/dashboard')}
                                    className="btn"
                                    style={{ width: '100%', padding: '0.6rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: '600', cursor: 'pointer' }}
                                >
                                    Ir al Dashboard ahora 🚀
                                </button>
                                
                                <button
                                    onClick={() => {
                                        console.log('🔄 Reintentando login...');
                                        window.location.reload();
                                    }}
                                    style={{ background: 'transparent', border: 'none', textDecoration: 'underline', color: '#92400E', fontSize: '0.8rem', cursor: 'pointer', marginTop: '0.5rem' }}
                                >
                                    Refrescar página
                                </button>
                                
                                <button
                                    onClick={() => {
                                        console.log('🚪 Forzando cierre de sesión...');
                                        signOut();
                                    }}
                                    style={{ background: 'transparent', border: 'none', color: '#92400E', fontSize: '0.8rem', cursor: 'pointer', opacity: 0.7 }}
                                >
                                    Cerrar sesión e intentar otro correo
                                </button>
                            </div>
                        </div>
                    )}

                    <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            ¿No tienes cuenta? <Link href="/b2b/register" style={{ color: 'var(--primary)', fontWeight: '600' }}>Solicita una aquí</Link>
                        </p>
                    </div>
                </div>
            </div>
        </main>
    );
}
