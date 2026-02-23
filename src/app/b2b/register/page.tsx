'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
// import { config } from '../../../lib/config'; // DEPRECATED
import { supabase } from '@/lib/supabase';
import Navbar from '../../../components/Navbar';
import LeadGenBotV2 from '../../../components/LeadGenBot';
import { Rocket, Banknote, Leaf, CreditCard } from 'lucide-react';

interface B2BBenefit {
    icon: string;
    title: string;
    desc: string;
}

interface B2BContent {
    badge?: string;
    title?: string;
    description?: string;
    benefits?: B2BBenefit[];
}

export default function B2BRegister() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [content, setContent] = useState<B2BContent | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            const { data: settings } = await supabase.from('app_settings').select('key, value');
            
            const getSetting = (key: string, defaultValue: string) => {
                const s = settings?.find(x => x.key === key);
                return s ? s.value : defaultValue;
            };

            const b2bStatus = getSetting('enable_b2b_lead_capture', 'true') === 'true';
            if (!b2bStatus) {
                console.log('🚫 B2B Registration disabled by settings.');
                router.push('/');
                return;
            }

            const rawContent = settings?.find(s => s.key === 'b2b_page_content')?.value;
            try {
                setContent(JSON.parse(rawContent || '{}'));
            } catch (e) {
                console.error("Error parsing B2B content", e);
            }
            setLoading(false);
        };
        fetchData();
    }, [router]);

    if (loading) return <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' }}>Cargando...</div>;

    const b2b = content || {};

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F3F4F6' }}>
            <Navbar />

            {/* Main Split Screen Container */}
            <div style={{
                minHeight: 'calc(100vh - 80px)', // Adjust for Navbar
                display: 'flex',
                alignItems: 'center',
                position: 'relative',
                backgroundImage: 'url(/b2b-bg.png)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                padding: '4rem 0'
            }}>
                {/* Sophisticated Overlay */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    background: 'radial-gradient(circle at 70% 50%, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.8) 100%)',
                    zIndex: 0
                }}></div>

                <div className="container" style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '1fr 480px', gap: '6rem', alignItems: 'center' }}>

                    {/* LEFT: Copy & Proposition */}
                    <div style={{ color: 'white' }}>
                        <span style={{
                            backgroundColor: 'var(--primary)',
                            color: 'white',
                            padding: '0.4rem 1rem',
                            borderRadius: '20px',
                            fontWeight: '700',
                            fontSize: '0.9rem',
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            marginBottom: '1.5rem',
                            display: 'inline-block'
                        }}>
                            {b2b.badge || 'Exclusivo HORECA Bogotá, Girardot, Melgar y Anapoima'}
                        </span>
                        <h1 style={{
                            fontFamily: 'var(--font-outfit), sans-serif',
                            fontSize: '3.8rem',
                            fontWeight: '900',
                            marginBottom: '1.5rem',
                            lineHeight: '1.1',
                            textShadow: '0 4px 15px rgba(0,0,0,0.6)',
                            whiteSpace: 'pre-line',
                            letterSpacing: '-0.04em'
                        }}>
                            {b2b.title || 'Tu Operación Merece \n Lo Mejor del Campo'}
                        </h1>
                        <p style={{
                            fontSize: '1.25rem',
                            marginBottom: '3rem',
                            opacity: 0.9,
                            maxWidth: '600px',
                            lineHeight: '1.6'
                        }}>
                            {b2b.description || 'Únete a los +500 restaurantes y hoteles en Bogotá, Girardot, Melgar y Anapoima que ya compran sin intermediarios. Calidad estandarizada, trazabilidad y precios fijos para tu volumen.'}
                        </p>

                        {/* Benefit Cards (2x2 Grid) */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                            {(b2b.benefits || [
                                { icon: '🚀', title: 'Entrega AM', desc: 'Todo listo antes de abrir cocina.' },
                                { icon: '💰', title: 'Precios Justos', desc: 'Ahorro directo sin intermediarios.' },
                                { icon: '🥕', title: 'Frescura Total', desc: 'Cosechado ayer, entregado hoy.' },
                                { icon: '💳', title: 'Crédito B2B', desc: 'Paga a 15 o 30 días fácil.' }
                            ]).map((item: B2BBenefit, i: number) => (
                                <div key={i} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '1.2rem',
                                    backgroundColor: 'rgba(255,255,255,0.08)',
                                    padding: '1.25rem',
                                    borderRadius: 'var(--radius-lg)',
                                    backdropFilter: 'blur(12px)',
                                    border: '1px solid rgba(255,255,255,0.15)',
                                    boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
                                }}>
                                    <div style={{ color: 'var(--primary)', backgroundColor: 'white', padding: '10px', borderRadius: '12px', display: 'flex' }}>
                                        {i === 0 ? <Rocket size={24} /> : i === 1 ? <Banknote size={24} /> : i === 2 ? <Leaf size={24} /> : <CreditCard size={24} />}
                                    </div>
                                    <div>
                                        <h3 style={{ 
                                            fontFamily: 'var(--font-outfit), sans-serif',
                                            fontSize: '1.1rem', 
                                            fontWeight: '800', 
                                            marginBottom: '0.2rem',
                                            letterSpacing: '-0.02em'
                                        }}>{item.title}</h3>
                                        <p style={{ fontSize: '0.85rem', opacity: 0.9, lineHeight: '1.4' }}>{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* RIGHT: Bot */}
                    <div style={{
                        animation: 'fadeInRight 0.8s ease-out',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                    }}>
                        <LeadGenBotV2 />
                    </div>

                </div>
            </div>

            <style jsx global>{`
                @keyframes fadeInRight {
                    from { opacity: 0; transform: translateX(20px); }
                    to { opacity: 1; transform: translateX(0); }
                }
            `}</style>
        </main>
    );
}
