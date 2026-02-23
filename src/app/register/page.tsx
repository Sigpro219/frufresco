'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { User, Mail, Phone, Lock, Rocket, LayoutDashboard, CheckCircle2, ArrowRight } from 'lucide-react';

export default function RegisterB2C() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const router = useRouter();

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const { data, error: authError } = await supabase.auth.signUp({
                email,
                password,
            });

            if (authError) throw authError;

            if (data?.user) {
                // Create profile with b2c_client role
                const { error: profileError } = await supabase
                    .from('profiles')
                    .insert([{
                        id: data.user.id,
                        contact_name: fullName,
                        phone,
                        email,
                        role: 'b2c_client'
                    }]);

                if (profileError) throw profileError;
                setSuccess(true);
            }
        } catch (err: any) {
            setError(err.message || 'Error al registrarse');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <main style={{ minHeight: '100vh', position: 'relative', backgroundColor: '#0a1a0f' }}>
                {/* Background Image Context */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundImage: 'url("https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=2000&auto=format&fit=crop")',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: 'brightness(0.3)',
                    zIndex: 0
                }} />
                
                <div style={{ position: 'relative', zIndex: 10 }}>
                    <Navbar />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6rem 1rem' }}>
                        <div style={{ 
                            backgroundColor: 'rgba(255, 255, 255, 0.08)',
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                            padding: '4rem 2.5rem', 
                            borderRadius: '32px', 
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                            textAlign: 'center', 
                            maxWidth: '500px',
                            color: 'white'
                        }}>
                            <div style={{ 
                                width: '80px', 
                                height: '80px', 
                                backgroundColor: 'rgba(16, 185, 129, 0.2)', 
                                borderRadius: '24px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 auto 2rem',
                                border: '1px solid rgba(16, 185, 129, 0.3)'
                            }}>
                                <CheckCircle2 size={40} color="var(--secondary)" strokeWidth={2.5} />
                            </div>
                            <h2 style={{ 
                                fontFamily: 'var(--font-outfit), sans-serif',
                                fontSize: '2.2rem', 
                                fontWeight: '900', 
                                margin: '0 0 1rem',
                                letterSpacing: '-0.04em'
                            }}>¡Registro Exitoso!</h2>
                            <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '2.5rem', fontSize: '1.1rem', fontWeight: '500', lineHeight: '1.6' }}>
                                Hemos enviado un correo de confirmación. Por favor revísalo para activar tu cuenta y comenzar tu experiencia gourmet.
                            </p>
                            <Link href="/login" className="btn-premium" style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '10px',
                                padding: '1rem 2.5rem',
                                backgroundColor: 'var(--primary)',
                                color: 'white',
                                borderRadius: 'var(--radius-full)',
                                textDecoration: 'none',
                                fontWeight: '900',
                                fontSize: '1.1rem',
                                fontFamily: 'var(--font-outfit), sans-serif',
                                boxShadow: '0 10px 20px rgba(0,0,0,0.2)'
                            }}>
                                Ir al Ingreso <ArrowRight size={20} />
                            </Link>
                        </div>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main style={{ minHeight: '100vh', position: 'relative', backgroundColor: '#0a1a0f' }}>
            {/* Background Image context like Login */}
            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundImage: 'url("https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=2000&auto=format&fit=crop")',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: 'brightness(0.3)',
                zIndex: 0
            }} />
            
            <div style={{ 
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'radial-gradient(circle at center, rgba(10, 26, 15, 0.7) 0%, rgba(10, 26, 15, 0.95) 100%)',
                zIndex: 0
            }} />

            <div style={{ position: 'relative', zIndex: 10 }}>
                <Navbar />
                <div className="mobile-padding-sm" style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    padding: '4rem 1.5rem',
                    minHeight: 'calc(100vh - 85px)'
                }}>
                    <div style={{ 
                        backgroundColor: 'rgba(255, 255, 255, 0.08)', 
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        padding: '3.5rem 2.5rem', 
                        borderRadius: '32px', 
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                        width: '100%', 
                        maxWidth: '480px',
                        color: 'white'
                    }}>
                        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                            <h1 style={{ 
                                fontFamily: 'var(--font-outfit), sans-serif',
                                fontSize: '2.5rem', 
                                fontWeight: '900', 
                                color: 'white',
                                margin: 0,
                                letterSpacing: '-0.06em'
                            }}>Crea tu cuenta</h1>
                            <p style={{ color: 'rgba(255,255,255,0.6)', marginTop: '0.75rem', fontSize: '1rem', fontWeight: '500' }}>
                                Únete a la red gourmet de FruFresco
                            </p>
                        </div>

                        <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {error && (
                                <div style={{ 
                                    padding: '1rem', 
                                    backgroundColor: 'rgba(220, 38, 38, 0.15)', 
                                    color: '#f87171', 
                                    borderRadius: '16px', 
                                    fontSize: '0.9rem', 
                                    fontWeight: '600',
                                    border: '1px solid rgba(220, 38, 38, 0.3)'
                                }}>
                                    ⚠️ {error}
                                </div>
                            )}

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.6rem', fontSize: '0.85rem', fontWeight: '700', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Nombre Completo
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)' }}>
                                        <User size={18} />
                                    </div>
                                    <input 
                                        required
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        placeholder="Ej: Maria Lopez"
                                        style={{ 
                                            width: '100%', 
                                            padding: '0.9rem 1rem 0.9rem 3rem', 
                                            borderRadius: '16px', 
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            backgroundColor: 'rgba(255,255,255,0.05)',
                                            color: 'white',
                                            fontSize: '1rem',
                                            outline: 'none',
                                            transition: 'all 0.2s',
                                            fontFamily: 'var(--font-inter), sans-serif'
                                        }}
                                        className="login-input"
                                    />
                                </div>
                            </div>

                            <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.6rem', fontSize: '0.85rem', fontWeight: '700', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        WhatsApp
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                        <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)' }}>
                                            <Phone size={18} />
                                        </div>
                                        <input 
                                            required
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            placeholder="3001234567"
                                            style={{ 
                                                width: '100%', 
                                                padding: '0.9rem 1rem 0.9rem 3rem', 
                                                borderRadius: '16px', 
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
                                        Email
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                        <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)' }}>
                                            <Mail size={18} />
                                        </div>
                                        <input 
                                            required
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="tu@correo.com"
                                            style={{ 
                                                width: '100%', 
                                                padding: '0.9rem 1rem 0.9rem 3rem', 
                                                borderRadius: '16px', 
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
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.6rem', fontSize: '0.85rem', fontWeight: '700', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Contraseña
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <div style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)' }}>
                                        <Lock size={18} />
                                    </div>
                                    <input 
                                        required
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        style={{ 
                                            width: '100%', 
                                            padding: '0.9rem 1rem 0.9rem 3rem', 
                                            borderRadius: '16px', 
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
                                disabled={loading}
                                className="btn-premium"
                                style={{ 
                                    width: '100%', 
                                    padding: '1.2rem', 
                                    fontSize: '1.2rem', 
                                    fontWeight: '900', 
                                    marginTop: '1rem',
                                    backgroundColor: loading ? 'rgba(255,255,255,0.1)' : 'var(--primary)',
                                    color: 'white',
                                    borderRadius: 'var(--radius-full)',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '12px',
                                    fontFamily: 'var(--font-outfit), sans-serif',
                                    boxShadow: '0 12px 24px rgba(0,0,0,0.3)'
                                }}
                            >
                                {loading ? 'Procesando...' : (
                                    <>
                                        Crear Cuenta <Rocket size={22} />
                                    </>
                                )}
                            </button>
                        </form>

                        <div style={{ marginTop: '2.5rem', textAlign: 'center', fontSize: '1rem', color: 'rgba(255,255,255,0.6)' }}>
                            ¿Ya tienes cuenta? <Link href="/login" style={{ color: 'var(--secondary)', fontWeight: '800', textDecoration: 'none' }}>Ingresa aquí</Link>
                        </div>

                        <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
                            <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', fontWeight: '500', lineHeight: '1.5' }}>
                                ¿Buscas catálogo para negocio o restaurante? 
                                <Link href="/b2b/register" style={{ display: 'block', marginTop: '0.75rem', color: 'var(--secondary)', fontWeight: '800', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                    Inscríbete como B2B <LayoutDashboard size={14} />
                                </Link>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            
            <style jsx global>{`
                .login-input:focus {
                    background-color: rgba(255, 255, 255, 0.1) !important;
                    border-color: var(--secondary) !important;
                    box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.1) !important;
                }
            `}</style>
        </main>
    );
}
