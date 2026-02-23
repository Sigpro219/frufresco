'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Link from 'next/link';

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
            <main style={{ minHeight: '100vh', backgroundColor: '#F9FAFB' }}>
                <Navbar />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem 1rem' }}>
                    <div style={{ backgroundColor: 'white', padding: '3rem', borderRadius: '24px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', textAlign: 'center', maxWidth: '500px' }}>
                        <span style={{ fontSize: '4rem' }}>🎉</span>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: '800', margin: '1.5rem 0' }}>¡Registro Exitoso!</h2>
                        <p style={{ color: '#6B7280', marginBottom: '2rem' }}>Hemos enviado un correo de confirmación. Por favor revísalo para activar tu cuenta.</p>
                        <Link href="/login" className="btn btn-primary" style={{ display: 'inline-block' }}>Ir al Ingreso</Link>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F9FAFB' }}>
            <Navbar />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem 1rem' }}>
                <div style={{ backgroundColor: 'white', padding: '3rem', borderRadius: '24px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', width: '100%', maxWidth: '450px' }}>
                    <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                        <h1 style={{ fontSize: '2rem', fontWeight: '900', color: '#111827' }}>Crea tu cuenta</h1>
                        <p style={{ color: '#6B7280', marginTop: '0.5rem' }}>Para tus pedidos en casa y beneficios exclusivos</p>
                    </div>

                    <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                        {error && (
                            <div style={{ padding: '0.8rem', backgroundColor: '#FEE2E2', color: '#DC2626', borderRadius: '12px', fontSize: '0.9rem', fontWeight: '600' }}>
                                ⚠️ {error}
                            </div>
                        )}

                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '700', color: '#374151' }}>Nombre Completo</label>
                            <input 
                                required
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                placeholder="Ej: Maria Lopez"
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #D1D5DB' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '700', color: '#374151' }}>Teléfono / WhatsApp</label>
                            <input 
                                required
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="3001234567"
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #D1D5DB' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '700', color: '#374151' }}>Correo Electrónico</label>
                            <input 
                                required
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="tu@correo.com"
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #D1D5DB' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '700', color: '#374151' }}>Contraseña</label>
                            <input 
                                required
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #D1D5DB' }}
                            />
                        </div>

                        <button 
                            disabled={loading}
                            className="btn btn-primary"
                            style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', fontWeight: '800', marginTop: '1rem' }}
                        >
                            {loading ? 'Registrando...' : 'Crear Cuenta'}
                        </button>
                    </form>

                    <div style={{ marginTop: '2rem', textAlign: 'center', fontSize: '0.9rem', color: '#6B7280' }}>
                        ¿Ya tienes cuenta? <Link href="/login" style={{ color: 'var(--primary)', fontWeight: '700' }}>Ingresa aquí</Link>
                    </div>

                    <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #F3F4F6', textAlign: 'center' }}>
                        <p style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>
                            ¿Buscas catálogo para negocio/restaurante? 
                            <Link href="/b2b/register" style={{ display: 'block', marginTop: '0.5rem', color: 'var(--secondary)', fontWeight: '700' }}>Inscríbete como B2B →</Link>
                        </p>
                    </div>
                </div>
            </div>
        </main>
    );
}
