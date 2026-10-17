'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import LeadGenBotV2 from '../../../components/LeadGenBot';
import { Rocket, Banknote, Leaf, CreditCard } from 'lucide-react';
import { translations, Locale } from '@/lib/translations';

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

function B2BRegisterContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const lang = searchParams.get('lang') || 'es';
    const locale = (lang === 'en' ? 'en' : 'es') as Locale;
    const t = translations[locale];

    const [loading, setLoading] = useState(true);
    const [content, setContent] = useState<B2BContent | null>(null);

    useEffect(() => {
        let isMounted = true;
        const fetchData = async () => {
            const { data: settings } = await supabase.from('app_settings').select('key, value');
            if (!isMounted) return;
            
            const getSetting = (key: string, defaultValue: string) => {
                const s = settings?.find(x => x.key === key);
                return s ? s.value : defaultValue;
            };

            const b2bStatus = getSetting('enable_b2b_lead_capture', 'true') === 'true';
            if (!b2bStatus) {
                router.push('/');
                return;
            }

            const contentKey = locale === 'en' ? 'b2b_page_content_en' : 'b2b_page_content';
            const rawContent = settings?.find(s => s.key === contentKey)?.value;
            
            try {
                if (rawContent) {
                    const parsed = JSON.parse(rawContent);
                    // Si el idioma es inglés pero el registro en BD aún contiene texto en español, usar traducción canónica en inglés
                    const looksSpanishInEn = locale === 'en' && (
                        /operaci[oó]n|exclusivo|pre-cotiza|únete|entrega am/i.test(String(parsed?.title || '')) ||
                        /operaci[oó]n|exclusivo|pre-cotiza|únete|entrega am/i.test(String(parsed?.badge || ''))
                    );
                    setContent(looksSpanishInEn ? null : parsed);
                } else {
                    setContent(null);
                }
            } catch (e) {
                setContent(null);
            }
            setLoading(false);
        };
        fetchData();
        return () => { isMounted = false; };
    }, [locale]); // Solo re-ejecutar si cambia el idioma

    if (loading) return <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' }}>{locale === 'en' ? 'Loading...' : 'Cargando...'}</div>;

    const b2b = content || {};

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F3F4F6' }}>
            <div style={{
                minHeight: 'calc(100vh - 80px)', 
                display: 'flex',
                alignItems: 'center',
                position: 'relative',
                backgroundImage: 'url(/b2b-bg.png)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                padding: '4rem 0'
            }}>
                <div style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    background: 'radial-gradient(circle at 70% 50%, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.8) 100%)',
                    zIndex: 0
                }}></div>

                <div className="container b2b-register-grid" style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ color: 'white', minWidth: 0 }}>
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
                        }}>{b2b.badge || t.b2b.badge}</span>
                        <h1 style={{
                            fontFamily: 'var(--font-outfit), sans-serif',
                            fontSize: 'clamp(2.15rem, 5vw, 3.8rem)',
                            fontWeight: '900',
                            marginBottom: '1.25rem',
                            lineHeight: '1.1',
                            textShadow: '0 4px 15px rgba(0,0,0,0.6)',
                            whiteSpace: 'pre-line',
                            letterSpacing: '-0.04em'
                        }}>{b2b.title || t.b2b.title}</h1>
                        <p style={{
                            fontSize: 'clamp(1rem, 2.2vw, 1.25rem)',
                            marginBottom: '2.25rem',
                            opacity: 0.9,
                            maxWidth: '600px',
                            lineHeight: '1.6'
                        }}>{b2b.description || t.b2b.description}</p>

                        <div className="b2b-benefits-grid">
                            {(b2b.benefits || t.b2b.benefits).map((item: any, i: number) => (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'center', gap: '1rem',
                                    backgroundColor: 'rgba(255,255,255,0.08)',
                                    padding: '1.15rem', borderRadius: 'var(--radius-lg)',
                                    backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.15)',
                                    boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
                                    minWidth: 0
                                }}>
                                    <div style={{ color: 'var(--primary)', backgroundColor: 'white', padding: '10px', borderRadius: '12px', display: 'flex', flexShrink: 0 }}>
                                        {i === 0 ? <Rocket size={24} /> : i === 1 ? <Banknote size={24} /> : i === 2 ? <Leaf size={24} /> : <CreditCard size={24} />}
                                    </div>
                                    <div style={{ minWidth: 0 }}>
                                        <h3 style={{ 
                                            fontFamily: 'var(--font-outfit), sans-serif', fontSize: '1.05rem', 
                                            fontWeight: '800', marginBottom: '0.2rem', letterSpacing: '-0.02em'
                                        }}>{item.title}</h3>
                                        <p style={{ fontSize: '0.85rem', opacity: 0.9, lineHeight: '1.4' }}>{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="b2b-bot-wrapper" style={{ animation: 'fadeInRight 0.8s ease-out', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', width: '100%', maxWidth: '100%', minWidth: 0 }}>
                        <LeadGenBotV2 key={locale} lang={locale} />
                    </div>
                </div>
            </div>

            <style jsx global>{`
                .b2b-register-grid {
                    display: grid;
                    grid-template-columns: 1fr 480px;
                    gap: 4.5rem;
                    align-items: center;
                }
                .b2b-benefits-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 1.25rem;
                }
                @media (max-width: 1024px) {
                    .b2b-register-grid {
                        grid-template-columns: 1fr;
                        gap: 2.5rem;
                    }
                    .b2b-bot-wrapper {
                        max-width: 540px !important;
                        margin: 0 auto;
                    }
                }
                @media (max-width: 640px) {
                    .b2b-benefits-grid {
                        grid-template-columns: 1fr;
                        gap: 0.85rem;
                    }
                }
                @keyframes fadeInRight {
                    from { opacity: 0; transform: translateX(20px); }
                    to { opacity: 1; transform: translateX(0); }
                }
            `}</style>
        </main>
    );
}

export default function B2BRegister() {
    return (
        <Suspense fallback={<div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' }}>...</div>}>
            <B2BRegisterContent />
        </Suspense>
    );
}
