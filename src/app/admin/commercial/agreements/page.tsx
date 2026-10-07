'use client';

import Link from 'next/link';
import { ArrowLeft, Handshake, ShieldCheck } from 'lucide-react';
import { THEME } from '@/lib/adminTheme';
import CommercialAgreementsModule from '@/components/CommercialAgreementsModule';

export default function CommercialAgreementsPage() {
    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, padding: '1.5rem 2rem' }}>
            <div style={{ maxWidth: '1600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* BREADCRUMB & HEADER */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Link 
                            href="/admin/commercial?tab=clients&clientTab=agreements"
                            style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                width: '36px', 
                                height: '36px', 
                                borderRadius: '10px', 
                                backgroundColor: 'white', 
                                border: `1px solid ${THEME.colors.border}`,
                                color: THEME.colors.textSecondary,
                                transition: 'all 0.2s',
                                textDecoration: 'none'
                            }}
                            title="Volver a la consola comercial"
                        >
                            <ArrowLeft size={18} />
                        </Link>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Dirección Comercial • Dominio 7
                                </span>
                                <span style={{ fontSize: '0.7rem', backgroundColor: '#ECFDF5', color: '#047857', padding: '2px 8px', borderRadius: '4px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <ShieldCheck size={12} /> B2B Institucional
                                </span>
                            </div>
                            <h1 style={{ margin: '4px 0 0 0', fontSize: '1.4rem', fontWeight: 800, color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Handshake size={24} color={THEME.colors.primary} /> Acuerdos Comerciales & Convenios B2B
                            </h1>
                        </div>
                    </div>
                </div>

                {/* CORE COMPONENT */}
                <CommercialAgreementsModule />
            </div>
        </main>
    );
}
